from __future__ import annotations

import base64
import hashlib
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from ml_service import xray
from ml_service.app import app
from ml_service.settings import XRAY_MODEL_PATH


class _Value:
    def __init__(self, value): self.value = value
    def tolist(self): return self.value


class _Boxes:
    def __init__(self, boxes, scores, labels):
        self.xyxy, self.conf, self.cls = _Value(boxes), _Value(scores), _Value(labels)


class _Detector:
    names = {0: xray.FRACTURE_CLASS_NAME}
    def __init__(self, boxes, scores, labels): self.boxes = _Boxes(boxes, scores, labels); self.conf_threshold = None
    def predict(self, _image, verbose=False, conf=None):
        self.conf_threshold = conf
        return [type("Result", (), {"boxes": self.boxes})()]


class XrayTests(unittest.TestCase):
    def image_bytes(self, fmt="PNG"):
        image = BytesIO(); Image.new("RGB", (300, 200), "gray").save(image, format=fmt); return image.getvalue()

    def test_reviewed_artifacts_and_manifest_hash(self):
        evaluation = xray.verify_artifacts()
        self.assertEqual(evaluation["model"]["sha256"], "f468f0ecb7001b3f687fe9b7ecc397ded5de86c632720ccccc74e48de0c0a40c")

    def test_model_readiness_is_false_without_runtime(self):
        with patch("ml_service.xray._load_model", side_effect=RuntimeError("runtime unavailable")):
            self.assertFalse(xray.xray_model_ready())

    def test_rejects_missing_model(self):
        with self.assertRaises(ValueError): xray.verify_artifacts(Path("missing-model.pt"), Path("missing-evaluation.json"))

    def test_returns_all_boxes_scores_and_annotation(self):
        detector = _Detector([[20, 30, 120, 160], [100, 40, 200, 180]], [.84, .23], [0, 0])
        with patch("ml_service.xray._load_model", return_value=(detector, .06749512255191803)):
            result = xray.analyze_xray(self.image_bytes())
        self.assertEqual(detector.conf_threshold, .06749512255191803)
        self.assertEqual(result["title"], "Possible fracture-like region")
        self.assertEqual(len(result["detections"]), 2)
        self.assertAlmostEqual(result["detections"][1]["confidence"], .23)
        self.assertEqual(result["boundingBox"]["xMin"], 20)
        self.assertIn("annotatedImageDataUrl", result)
        self.assertEqual(result["uploadedImageSha256"], hashlib.sha256(self.image_bytes()).hexdigest())
        annotated = Image.open(BytesIO(base64.b64decode(result["annotatedImageDataUrl"].split(",")[1])))
        self.assertEqual(annotated.size, (300, 200))
        for statement in ["The research model found an area that visually resembles fracture examples from its training data.", "This does not confirm a fracture or identify its exact type.", "This research/demo result is not a diagnosis."]:
            self.assertIn(statement, result["summary"] + result["context"] + result["limitations"])

    def test_no_detection_contains_required_warning(self):
        detector = _Detector([[20, 30, 120, 160]], [.05], [0])
        with patch("ml_service.xray._load_model", return_value=(detector, .06749512255191803)):
            result = xray.analyze_xray(self.image_bytes())
        self.assertEqual(result["summary"], "The model did not find a fracture-like pattern above its reviewed threshold. This does not mean the X-ray is normal or rule out an injury.")
        self.assertEqual(result["detections"], [])

    def test_rejects_corrupt_and_non_image_uploads(self):
        for content in [b"garbage", BytesIO(b"%PDF-1.7\n").getvalue()]:
            with self.subTest(content=content[:10]), self.assertRaises(ValueError): xray.analyze_xray(content)

    def test_no_detection_returns_annotated_preview_and_scope_warning(self):
        detector = _Detector([], [], [])
        with patch("ml_service.xray._load_model", return_value=(detector, .06749512255191803)):
            result = xray.analyze_xray(self.image_bytes())
        self.assertIn("annotatedImageDataUrl", result)
        self.assertIn("cannot verify anatomy or patient age", result["limitations"])

    def test_scales_16bit_grayscale_to_match_detector_image_loader(self):
        import numpy as np
        image = Image.fromarray(np.array([[0, 256, 32768, 65535]], dtype="uint16"))
        converted = xray._display_image(image)
        self.assertEqual(list(converted.getdata()), [(0, 0, 0), (1, 1, 1), (128, 128, 128), (255, 255, 255)])

    def test_model_unavailable_fails_closed(self):
        with patch("ml_service.xray._load_model", side_effect=RuntimeError("unavailable")), self.assertRaises(RuntimeError):
            xray.analyze_xray(self.image_bytes())

    def test_route_maps_unavailable_detector_to_503(self):
        from fastapi import HTTPException
        from ml_service.app import analyze
        from starlette.datastructures import UploadFile
        import asyncio
        with patch("ml_service.app.analyze_xray", side_effect=RuntimeError("model unavailable")):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(analyze(UploadFile(filename="scan.png", file=BytesIO(self.image_bytes()), headers={"content-type": "image/png"}), "xray", "true"))
        self.assertEqual(raised.exception.status_code, 503)

    def test_route_sends_uploaded_bytes_to_yolo_for_arbitrary_filename(self):
        from ml_service.app import analyze
        from starlette.datastructures import UploadFile
        import asyncio
        data = self.image_bytes()
        expected = {"documentType": "xray", "title": "Possible fracture-like region"}
        with patch("ml_service.app.analyze_xray", return_value=expected) as detector:
            result = asyncio.run(analyze(UploadFile(filename="new-heldout-wrist-view-017.png", file=BytesIO(data), headers={"content-type": "image/png"}), "xray", "true"))
        detector.assert_called_once_with(data)
        self.assertEqual(result, expected)

    def test_xray_route_rejects_without_scope_confirmation(self):
        from fastapi import HTTPException
        from ml_service.app import analyze
        from starlette.datastructures import UploadFile
        import asyncio
        with patch("ml_service.app.analyze_xray") as detector:
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(analyze(UploadFile(filename="chest.png", file=BytesIO(self.image_bytes()), headers={"content-type": "image/png"}), "xray", "false"))
        self.assertEqual(raised.exception.status_code, 422)
        detector.assert_not_called()

    def test_report_route_uses_text_pipeline_not_yolo(self):
        from ml_service.app import analyze
        from ml_service.schemas import TextAnalysis
        from starlette.datastructures import UploadFile
        import asyncio
        report = BytesIO(); Image.new("RGB", (300, 200), "white").save(report, format="PNG")
        expected = type("Payload", (), {"to_api_dict": lambda self: {"documentType": "scanned_report", "finding": "reported finding"}})()
        with patch("ml_service.app.analyze_text_report", return_value=expected) as text_pipeline, patch("ml_service.app.analyze_xray") as detector:
            result = asyncio.run(analyze(UploadFile(filename="arbitrary-report.png", file=BytesIO(report.getvalue()), headers={"content-type": "image/png"}), "report"))
        text_pipeline.assert_called_once()
        detector.assert_not_called()
        self.assertEqual(result["finding"], "reported finding")
