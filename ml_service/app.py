from __future__ import annotations

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from .file_validation import validate_upload
from .settings import BASIC_SEVERITY_MODEL_PATH, SEVERITY_MODEL_DIR, XRAY_MODEL_PATH
from .text_pipeline import analyze_text_report
from .xray import analyze_xray, xray_model_ready
from .retinopathy import analyze_retinopathy
from .document import extract_pdf, extract_report_image

app = FastAPI(title="ClarifyMed Offline ML Service", version="0.1.0", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "severityModelReady": (SEVERITY_MODEL_DIR / "config.json").is_file() or BASIC_SEVERITY_MODEL_PATH.is_file(),
        "basicSeverityModelReady": BASIC_SEVERITY_MODEL_PATH.is_file(),
        "xrayModelReady": xray_model_ready(),
        "retinopathyModelReady": True,
    }


@app.post("/analyze")
async def analyze(
    report: UploadFile = File(...),
    input_type: str = Form("report"),
    wrist_confirmed: str = Form("false"),
    retina_confirmed: str = Form("false"),
) -> dict:
    data = await report.read()
    try:
        if input_type not in {"report", "xray", "retinopathy"}:
            raise ValueError("Choose report, X-ray, or diabetic retinopathy analysis.")
        if input_type == "xray" and wrist_confirmed != "true":
            raise ValueError("Confirm that this is a pediatric wrist X-ray. Other X-ray types and adult images are unsupported.")
        if input_type == "retinopathy" and retina_confirmed != "true":
            raise ValueError("Confirm that this is a retinal fundus photograph.")
        media_type = validate_upload(data, report.content_type or "", xray=input_type in {"xray", "retinopathy"})
        if input_type == "xray":
            if media_type == "application/pdf":
                raise ValueError("X-ray analysis accepts one JPG or PNG image, not a PDF.")
            return analyze_xray(data)
        if input_type == "retinopathy":
            if media_type == "application/pdf":
                raise ValueError("Retinopathy analysis accepts one JPG or PNG image, not a PDF.")
            return analyze_retinopathy(data)
        return analyze_text_report(data, media_type).to_api_dict()
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/extract")
def extract(report: UploadFile = File(...)) -> dict:
    data = report.file.read()
    try:
        media_type = validate_upload(data, report.content_type or "")
        text, method, warnings = extract_pdf(data) if media_type == 'application/pdf' else extract_report_image(data)
        if len(text.strip()) < 20:
            raise ValueError('No readable text was extracted. Upload a clearer report.')
        return {'extractedText': text, 'extractionMethod': method, 'warnings': warnings}
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
