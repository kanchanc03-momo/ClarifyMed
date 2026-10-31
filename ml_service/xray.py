"""Fail-closed pediatric wrist fracture-region detector."""
from __future__ import annotations

import base64
import hashlib
import json
import math
from io import BytesIO

from PIL import Image, UnidentifiedImageError

from .settings import XRAY_MODEL_PATH, XRAY_SCORE_THRESHOLD, XRAY_EVALUATION_PATH, XRAY_SHA256

DATASET = "GRAZPEDWRI-DX"
SCOPE = "Pediatric wrist X-rays only; possible fracture-like region detection"
FRACTURE_CLASS_ID = 0  # evaluation.json has the sole detection class: fracture
FRACTURE_CLASS_NAME = "possible fracture-like region"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def verify_artifacts(model_path=XRAY_MODEL_PATH, evaluation_path=XRAY_EVALUATION_PATH):
    if not model_path.is_file() or not evaluation_path.is_file():
        raise ValueError("The reviewed pediatric wrist X-ray model artifacts are unavailable.")
    actual_hash = hashlib.sha256(model_path.read_bytes()).hexdigest()
    if actual_hash.casefold() != XRAY_SHA256.casefold():
        raise ValueError("The pediatric wrist X-ray model checksum does not match the reviewed checkpoint.")
    try:
        evaluation = json.loads(evaluation_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError("The pediatric wrist X-ray evaluation manifest is invalid.") from error
    model = evaluation.get("model", {})
    if model.get("sha256", "").casefold() != actual_hash.casefold():
        raise ValueError("The model checksum does not match evaluation.json.")
    if (model.get("checkpoint") != model_path.name or model.get("architecture") != "YOLOv8n"
            or evaluation.get("dataset", {}).get("source") != DATASET
            or evaluation.get("scope") != SCOPE
            or evaluation.get("threshold", {}).get("value") != XRAY_SCORE_THRESHOLD
            or evaluation.get("research_demo_gate", {}).get("passed") is not True):
        raise ValueError("The pediatric wrist X-ray model manifest is incompatible with this application.")
    return evaluation


def _load_model():
    from ultralytics import YOLO

    evaluation = verify_artifacts()
    try:
        model = YOLO(str(XRAY_MODEL_PATH), task="detect")
        names = model.names
        if isinstance(names, dict):
            class_names = {int(key): value for key, value in names.items()}
        else:
            class_names = dict(enumerate(names))
        if class_names != {FRACTURE_CLASS_ID: FRACTURE_CLASS_NAME}:
            raise ValueError("The YOLO checkpoint class mapping is not the reviewed pediatric wrist fracture-region class.")
    except Exception as error:
        raise RuntimeError("The pediatric wrist X-ray model is unavailable; analysis was refused.") from error
    return model, XRAY_SCORE_THRESHOLD


def xray_model_ready() -> bool:
    try:
        _load_model()
        return True
    except Exception:
        return False


def _display_image(image):
    # GRAZPEDWRI-DX images are often 16-bit grayscale PNGs. YOLO's OpenCV
    # loader converts these to 8-bit by dropping the low byte; PIL's direct
    # convert("RGB") clips instead and washes out the image.
    if image.mode.startswith("I;16"):
        import numpy as np

        pixels = np.asarray(image, dtype=np.uint16)
        image = Image.fromarray((pixels >> 8).astype(np.uint8)).convert("RGB")
    else:
        image = image.convert("RGB")
    image.thumbnail((1024, 1024))
    return image


def _annotate(image, detections):
    from PIL import ImageDraw

    result = image.copy()
    draw = ImageDraw.Draw(result)
    for box, score in detections:
        draw.rectangle(box, outline="#e34b3f", width=max(3, round(min(result.size) / 180)))
        draw.text((box[0], max(0, box[1] - 16)), f"{score:.0%}", fill="#e34b3f")
    buffer = BytesIO()
    result.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _image_data_url(image):
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def analyze_xray(data: bytes) -> dict:
    if not data:
        raise ValueError("The uploaded image is empty.")
    uploaded_sha256 = hashlib.sha256(data).hexdigest()
    try:
        with Image.open(BytesIO(data)) as source:
            if source.format not in {"JPEG", "PNG"}:
                raise ValueError("X-ray analysis accepts JPG, JPEG, or PNG images only.")
            source.verify()
        with Image.open(BytesIO(data)) as source:
            image = _display_image(source)
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("The uploaded JPG or PNG image is invalid or corrupted.") from error
    model, threshold = _load_model()
    try:
        result = model.predict(image, conf=threshold, verbose=False)[0]
        predictions = result.boxes
        boxes, scores, labels = predictions.xyxy.tolist(), predictions.conf.tolist(), predictions.cls.tolist()
        if not (len(boxes) == len(scores) == len(labels)):
            raise ValueError("Mismatched detector outputs")
        eligible = []
        candidate_scores = []
        width, height = image.size
        for box, score, label in zip(boxes, scores, labels):
            if int(label) != FRACTURE_CLASS_ID or not math.isfinite(float(score)):
                continue
            coords = [float(value) for value in box]
            if len(coords) != 4 or not all(math.isfinite(value) for value in coords):
                continue
            x1, y1, x2, y2 = coords
            if x2 <= x1 or y2 <= y1:
                continue
            coords = [round(max(0, min(width if i % 2 == 0 else height, value)), 1) for i, value in enumerate(coords)]
            candidate_scores.append(float(score))
            if float(score) >= threshold:
                eligible.append((coords, float(score)))
    except Exception as error:
        raise RuntimeError("The pediatric wrist X-ray model failed; analysis was refused.") from error

    warning = "The model did not find a fracture-like pattern above its reviewed threshold. This does not mean the X-ray is normal or rule out an injury."
    common = {
        "documentType": "xray", "followUpLevel": "monitor", "followUpLabel": "Clinical review required",
        "followUpExplanation": "A clinician must review the original X-ray and the official report, regardless of this demo output.",
        "questions": ["What does the official radiology report say?", "Could an injury still be present despite this result?", "What follow-up is appropriate for the symptoms?"],
        "maxCandidateConfidence": max(candidate_scores, default=None),
        "uploadedImageSha256": uploaded_sha256,
        "task": "possible fracture-like region detection in pediatric wrist X-rays only",
        "limitations": f"{warning} Only pediatric wrist X-rays are supported. Automated inference cannot verify anatomy or patient age; use this only for a confirmed pediatric wrist study. The highlighted box is the model's prediction, not a confirmed fracture location. This research/demo result is not a diagnosis. External dataset testing and clinician review are still required.",
        "modelVersions": {"xray": "grazpedwri-dx-yolov8n", "task": "pediatric-wrist-fracture-region-detection"},
    }
    if not eligible:
        return {**common, "title": "No detected fracture-like region", "summary": warning,
                "context": "The model checks image patterns. It cannot assess symptoms or decide whether treatment is needed. A qualified clinician should interpret the original X-ray and any radiology report.", "finding": "No detected fracture-like region",
                "location": "Not available", "measurement": "Not available", "annotatedImageDataUrl": _annotate(image, []), "detections": []}
    detections = [{"boundingBox": {"xMin": box[0], "yMin": box[1], "xMax": box[2], "yMax": box[3], "units": "display-image pixels"}, "confidence": score} for box, score in eligible]
    best_score = max(score for _, score in eligible)
    return {**common, "title": "Possible fracture-like region", "summary": "The research model found an area that visually resembles fracture examples from its training data. The highlighted box shows where the model detected that pattern. This does not confirm a fracture or identify its exact type.",
            "context": "The highlighted box is the model’s prediction, not a confirmed fracture location.",
            "finding": "Possible fracture-like region", "location": "Highlighted wrist region", "measurement": "Bounding box shown on image",
            "annotatedImageDataUrl": _annotate(image, eligible), "fractureScore": best_score,
            "boundingBox": detections[0]["boundingBox"], "detections": detections}
