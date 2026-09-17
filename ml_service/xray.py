from __future__ import annotations

import base64
from io import BytesIO

from .settings import XRAY_MODEL_PATH


def validate_checkpoint(checkpoint):
    if not isinstance(checkpoint, dict) or checkpoint.get('architecture') != 'mobilenet_v2':
        raise ValueError('The X-ray model artifact metadata is invalid.')
    dataset = checkpoint.get('dataset')
    if dataset == 'FracAtlas':
        expected = {'scope': 'FracAtlas musculoskeletal fracture classification only',
                    'labels': ['non_fractured', 'fractured'], 'image_size': 224,
                    'normalization_mean': [.485, .456, .406],
                    'normalization_std': [.229, .224, .225], 'threshold': .5}
    elif dataset == 'MURA-v1.1':
        expected = {'scope': 'MURA musculoskeletal radiographs only',
                    'labels': ['normal', 'abnormal'], 'image_size': 224}
    else:
        raise ValueError('Unsupported X-ray dataset metadata. Install a FracAtlas or MURA checkpoint.')
    if any(checkpoint.get(key) != value for key, value in expected.items()):
        raise ValueError('The X-ray labels or preprocessing metadata do not match the supported model.')
    if not isinstance(checkpoint.get('state_dict'), dict):
        raise ValueError('The X-ray checkpoint has no model weights.')
    return dataset


def _load_model():
    import torch
    from torch import nn
    from torchvision import models

    if not XRAY_MODEL_PATH.is_file():
        raise ValueError("The trained X-ray model is not installed. Set XRAY_MODEL_PATH to the evaluated FracAtlas or MURA model.pt artifact.")
    checkpoint = torch.load(XRAY_MODEL_PATH, map_location="cpu", weights_only=True)
    dataset = validate_checkpoint(checkpoint)
    model = models.mobilenet_v2(weights=None)
    model.classifier[1] = nn.Linear(model.last_channel, 2)
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()
    return model, dataset


def _grad_cam(model, tensor, target_class: int):
    import torch
    import torch.nn.functional as functional

    activations = gradients = None
    def forward_hook(_module, _input, output):
        nonlocal activations
        activations = output
    def backward_hook(_module, _grad_input, grad_output):
        nonlocal gradients
        gradients = grad_output[0]
    layer = model.features[-1]
    first = layer.register_forward_hook(forward_hook)
    second = layer.register_full_backward_hook(backward_hook)
    try:
        logits = model(tensor)
        model.zero_grad(set_to_none=True)
        logits[0, target_class].backward()
    finally:
        first.remove()
        second.remove()
    weights = gradients.mean(dim=(2, 3), keepdim=True)
    heatmap = torch.relu((weights * activations).sum(dim=1, keepdim=True))
    heatmap = functional.interpolate(heatmap, size=(224, 224), mode="bilinear", align_corners=False)[0, 0]
    heatmap -= heatmap.min()
    heatmap /= heatmap.max().clamp_min(1e-8)
    return logits.detach(), heatmap.detach().numpy()


def analyze_xray(data: bytes) -> dict:
    import numpy as np
    import torch
    from PIL import Image
    from torchvision import transforms

    image = Image.open(BytesIO(data)).convert("RGB")
    original = image.resize((224, 224))
    transform = transforms.Compose([transforms.ToTensor(), transforms.Normalize([.485,.456,.406],[.229,.224,.225])])
    model, dataset = _load_model()
    logits, heatmap = _grad_cam(model, transform(original).unsqueeze(0), 1)
    probability = float(torch.softmax(logits, dim=1)[0, 1])
    rgb = np.asarray(original).astype(np.float32)
    color = np.zeros_like(rgb); color[..., 0] = heatmap * 255; color[..., 1] = heatmap * 150
    overlay = Image.fromarray(np.clip(rgb * 0.65 + color * 0.35, 0, 255).astype(np.uint8))
    buffer = BytesIO(); overlay.save(buffer, format="PNG")
    abnormal = probability >= 0.5
    finding = "abnormal pattern detected" if abnormal else "no abnormal pattern detected by the prototype model"
    result = {
        "documentType": "xray", "title": finding.capitalize(),
        "summary": f"The prototype musculoskeletal X-ray model assigned {probability:.1%} probability to its abnormal class. This is not a diagnosis and must be reviewed by a qualified clinician.",
        "context": "This model is limited to MURA-style musculoskeletal radiographs. It does not identify a specific condition and is unsupported for chest, dental, skull, CT, MRI, or other images.",
        "finding": finding, "location": "Model localization is not clinically validated", "measurement": "Not available",
        "followUpLevel": "monitor", "followUpLabel": "Clinical review required",
        "followUpExplanation": "AI image classifications and heatmaps require clinician review regardless of score.",
        "questions": ["Is this the correct imaging type for this model?", "What does the official radiology report say?", "Does this image require follow-up based on my symptoms and history?"],
        "limitations": "Research prototype for MURA musculoskeletal radiographs only. Grad-CAM shows model influence, not a confirmed abnormality location.",
        "heatmapDataUrl": "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"),
        "abnormalProbability": probability,
        "modelVersions": {"xray": "mura-mobilenetv2", "explainability": "grad-cam"},
    }
    if dataset == 'FracAtlas':
        finding = 'fractured class selected' if abnormal else 'non-fractured class selected'
        result.update({
            'title': finding.capitalize(), 'finding': finding,
            'summary': f'The prototype assigned an uncalibrated score of {probability:.1%} to the fractured class. This is a research model output, not a diagnosis. A clinician must review the original image and report.',
            'context': 'This model classifies FracAtlas-style musculoskeletal radiographs for fracture patterns. The non-fractured class does not mean the image is normal or rule out injury.',
            'limitations': 'FracAtlas research prototype without external clinical validation. Patient and near-duplicate isolation are not established in its training splits. Grad-CAM shows model influence, not a confirmed fracture location.',
            'fractureScore': probability,
            'modelVersions': {'xray': 'fracatlas-mobilenetv2', 'explainability': 'grad-cam'},
        })
        del result['abnormalProbability']
    return result
