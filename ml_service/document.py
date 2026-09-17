from __future__ import annotations

from io import BytesIO

from .settings import MAX_PDF_PAGES, OCR_DPI


def _ocr_images(images) -> str:
    import easyocr
    import numpy as np

    reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    pages = []
    for image in images:
        lines = reader.readtext(np.asarray(image), detail=0, paragraph=True)
        pages.append("\n".join(lines))
    return "\n\n".join(pages).strip()


def extract_pdf(data: bytes) -> tuple[str, str, list[str]]:
    import fitz
    from PIL import Image

    warnings: list[str] = []
    document = fitz.open(stream=data, filetype="pdf")
    if document.page_count > MAX_PDF_PAGES:
        document.close()
        raise ValueError(f"PDFs are limited to {MAX_PDF_PAGES} pages for this prototype.")
    text_pages = [page.get_text("text").strip() for page in document]
    text = "\n\n".join(page for page in text_pages if page).strip()
    character_count = sum(len(page) for page in text_pages)
    if character_count >= 80 and all(len(page) >= 40 for page in text_pages):
        document.close()
        return text, "pdf_text", warnings

    warnings.append("Little machine-readable text was found; OCR was used and may contain errors.")
    scale = OCR_DPI / 72
    images = []
    for page in document:
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        images.append(Image.open(BytesIO(pixmap.tobytes("png"))).convert("RGB"))
    document.close()
    return _ocr_images(images), "pdf_ocr", warnings


def extract_report_image(data: bytes) -> tuple[str, str, list[str]]:
    from PIL import Image

    image = Image.open(BytesIO(data)).convert("RGB")
    text = _ocr_images([image])
    warnings = ["Text was extracted with OCR and may contain errors; compare with the original report."]
    return text, "image_ocr", warnings
