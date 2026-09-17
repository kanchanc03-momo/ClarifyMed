from __future__ import annotations

from .settings import MAX_FILE_BYTES


def detect_type(data: bytes) -> str | None:
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


def validate_upload(data: bytes, declared_type: str) -> str:
    if not data:
        raise ValueError("The uploaded file is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise ValueError("The uploaded file exceeds 20 MB.")
    detected = detect_type(data)
    if detected is None or detected != declared_type:
        raise ValueError("File contents do not match a supported PDF, JPG, or PNG file.")
    return detected
