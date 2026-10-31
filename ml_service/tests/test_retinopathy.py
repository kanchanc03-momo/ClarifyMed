import unittest
from io import BytesIO
from PIL import Image
from ml_service.retinopathy import analyze_retinopathy, ICDR_GRADES, retinopathy_model_ready


class RetinopathyPipelineTests(unittest.TestCase):
    def test_icdr_grades_structure(self):
        self.assertEqual(len(ICDR_GRADES), 5)
        for i in range(5):
            self.assertIn("stage", ICDR_GRADES[i])
            self.assertIn("level", ICDR_GRADES[i])
            self.assertIn("explanation", ICDR_GRADES[i])

    def test_analyzes_valid_fundus_photo_simulation(self):
        img = Image.new("RGB", (256, 256), color=(120, 20, 20))
        buf = BytesIO()
        img.save(buf, format="JPEG")
        data = buf.getvalue()

        result = analyze_retinopathy(data)
        self.assertEqual(result["documentType"], "retinopathy")
        self.assertIn("Retinal Fundus Screening", result["finding"])
        self.assertIn(result["followUpLevel"], ["routine", "monitor", "prompt"])
        self.assertTrue(result["annotatedImageDataUrl"].startswith("data:image/jpeg;base64,"))
        self.assertGreater(len(result["clinicianQuestions"]), 0)
        self.assertGreater(len(result["warnings"]), 0)

    def test_rejects_empty_data(self):
        with self.assertRaises(ValueError):
            analyze_retinopathy(b"")

    def test_rejects_corrupted_data(self):
        with self.assertRaises(ValueError):
            analyze_retinopathy(b"not an image file")


if __name__ == "__main__":
    unittest.main()
