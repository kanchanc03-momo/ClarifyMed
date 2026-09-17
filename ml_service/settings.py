from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = Path(os.getenv("CLARIFYMED_ARTIFACT_DIR", ROOT / "ml" / "artifacts"))
NER_MODEL = os.getenv("NER_MODEL", "d4data/biomedical-ner-all")
SEVERITY_MODEL_DIR = Path(os.getenv("SEVERITY_MODEL_DIR", ARTIFACT_DIR / "severity-distilbert"))
BASIC_SEVERITY_MODEL_PATH = Path(os.getenv("BASIC_SEVERITY_MODEL_PATH", ARTIFACT_DIR / "severity-classifier" / "model.joblib"))
XRAY_MODEL_PATH = Path(os.getenv("XRAY_MODEL_PATH", ARTIFACT_DIR / "fracatlas-mobilenetv2" / "model.pt"))
MODEL_CACHE_DIR = Path(os.getenv("MODEL_CACHE_DIR", ARTIFACT_DIR / "cache"))
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "10"))
OCR_DPI = int(os.getenv("OCR_DPI", "180"))
