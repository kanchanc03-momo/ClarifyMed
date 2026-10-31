from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = Path(os.getenv("CLARIFYMED_ARTIFACT_DIR", ROOT / "ml" / "artifacts"))
NER_MODEL = os.getenv("NER_MODEL", "d4data/biomedical-ner-all")
SEVERITY_MODEL_DIR = Path(os.getenv("SEVERITY_MODEL_DIR", ARTIFACT_DIR / "severity-distilbert"))
BASIC_SEVERITY_MODEL_PATH = Path(os.getenv("BASIC_SEVERITY_MODEL_PATH", ARTIFACT_DIR / "severity-classifier" / "model.joblib"))
XRAY_MODEL_PATH = Path(os.getenv("XRAY_MODEL_PATH", ARTIFACT_DIR / "grazpedwri-yolo" / "model.pt"))
XRAY_EVALUATION_PATH = Path(os.getenv("XRAY_EVALUATION_PATH", XRAY_MODEL_PATH.with_name("evaluation.json")))
XRAY_SHA256 = os.getenv("XRAY_SHA256", "f468f0ecb7001b3f687fe9b7ecc397ded5de86c632720ccccc74e48de0c0a40c")
XRAY_SCORE_THRESHOLD = float(os.getenv("XRAY_SCORE_THRESHOLD", "0.06749512255191803"))
RETINOPATHY_MODEL_PATH = Path(os.getenv("RETINOPATHY_MODEL_PATH", ARTIFACT_DIR / "retinopathy-efficientnet" / "model.pt"))
RETINOPATHY_EVALUATION_PATH = Path(os.getenv("RETINOPATHY_EVALUATION_PATH", ARTIFACT_DIR / "retinopathy-efficientnet" / "evaluation.json"))
MODEL_CACHE_DIR = Path(os.getenv("MODEL_CACHE_DIR", ARTIFACT_DIR / "cache"))
MAX_FILE_BYTES = 20 * 1024 * 1024
# Lab and blood reports commonly include a cover sheet plus many result panels.
# Keep a finite limit to protect the OCR worker, but support a complete report.
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "50"))
OCR_DPI = int(os.getenv("OCR_DPI", "180"))
