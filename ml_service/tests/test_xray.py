import base64
from io import BytesIO
import unittest
from unittest.mock import patch

from ml_service.xray import validate_checkpoint, analyze_xray


class XrayTests(unittest.TestCase):
    def checkpoint(self):
        return dict(architecture='mobilenet_v2', dataset='FracAtlas',
                    scope='FracAtlas musculoskeletal fracture classification only',
                    labels=['non_fractured', 'fractured'], image_size=224,
                    normalization_mean=[.485, .456, .406], normalization_std=[.229, .224, .225],
                    threshold=.5, state_dict={})

    def test_rejects_wrong_label_order_and_preprocessing(self):
        self.assertEqual(validate_checkpoint(self.checkpoint()), 'FracAtlas')
        for key, value in [('labels', ['fractured', 'non_fractured']), ('image_size', 256),
                           ('dataset', 'unknown'), ('threshold', .7), ('normalization_std', [1, 1, 1])]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_checkpoint({**self.checkpoint(), key: value})

    def test_real_gradcam_with_synthetic_weights_and_fracture_output(self):
        # Random weights verify execution only; they do not evaluate a trained model.
        import torch
        from torch import nn
        from torchvision.models import mobilenet_v2
        from PIL import Image
        torch.set_num_threads(2)
        model = mobilenet_v2(weights=None)
        model.classifier[1] = nn.Linear(model.last_channel, 2)
        model.eval()
        image = BytesIO()
        Image.new('RGB', (300, 200), 'gray').save(image, format='PNG')
        with patch('ml_service.xray._load_model', return_value=(model, 'FracAtlas')):
            result = analyze_xray(image.getvalue())
        self.assertNotIn('abnormalProbability', result)
        self.assertTrue(0 <= result['fractureScore'] <= 1)
        self.assertIn('does not mean', result['context'])
        overlay = Image.open(BytesIO(base64.b64decode(result['heatmapDataUrl'].split(',')[1])))
        self.assertEqual(overlay.size, (224, 224))
        self.assertFalse(model.features[-1]._forward_hooks)
        self.assertFalse(model.features[-1]._backward_hooks)
