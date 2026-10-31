from unittest.mock import patch
import unittest

from ml_service.file_validation import detect_type, validate_upload
from ml_service.severity import classify
from ml_service.simplification import simplify
from ml_service.ner import _assertion


class CorePipelineTests(unittest.TestCase):
    def test_detects_supported_magic_bytes(self):
        self.assertEqual(detect_type(b"%PDF-1.7\n"), "application/pdf")
        self.assertEqual(detect_type(b"\x89PNG\r\n\x1a\nrest"), "image/png")
        self.assertEqual(detect_type(b"\xff\xd8\xffrest"), "image/jpeg")

    def test_rejects_mismatched_declared_type(self):
        with self.assertRaises(ValueError):
            validate_upload(b"%PDF-1.7\n", "image/png")

    def test_simplifies_curated_term(self):
        plain, context = simplify("opacity")
        self.assertIn("area", plain)
        self.assertIn("not a diagnosis", context)

    def test_basic_severity_model_classification(self):
        # Routine
        level, conf, ev, src = classify("No acute cardiopulmonary disease. Routine annual check.")
        self.assertEqual(level, "routine")
        self.assertEqual(src, "scikit_learn_tfidf_lr")
        self.assertGreater(conf, 0.5)

        # Monitor
        level, conf, ev, src = classify("Small 4mm pulmonary nodule. Follow-up CT in 6 months is recommended.")
        self.assertEqual(level, "monitor")
        self.assertEqual(src, "scikit_learn_tfidf_lr")
        self.assertGreater(conf, 0.5)

        # Prompt
        level, conf, ev, src = classify("Acute displaced fracture of right wrist. Prompt orthopedic evaluation required.")
        self.assertEqual(level, "prompt")
        self.assertEqual(src, "scikit_learn_tfidf_lr")
        self.assertGreater(conf, 0.5)
        self.assertTrue(len(ev) > 0)

    def test_follow_up_fallback_when_models_absent(self):
        with patch("ml_service.severity._basic_classifier", return_value=None), \
             patch("ml_service.severity._distilbert_classifier", return_value=None):
            level, confidence, evidence, source = classify("Follow-up imaging is recommended.")
            self.assertEqual(level, "monitor")
            self.assertEqual(source, "explicit_wording_fallback")
            self.assertTrue(evidence)

    def test_entity_assertions_preserve_negation_uncertainty_and_history(self):
        self.assertEqual(_assertion('No evidence of fracture.', 14), 'absent')
        self.assertEqual(_assertion('Possible fracture.', 9), 'possible')
        self.assertEqual(_assertion('History of fracture.', 17), 'historical')


if __name__ == "__main__":
    unittest.main()
