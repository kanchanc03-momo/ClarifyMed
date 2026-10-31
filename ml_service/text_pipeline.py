from __future__ import annotations

import re

from .document import extract_pdf, extract_report_image
from .ner import extract_entities
from .schemas import Evidence, TextAnalysis
from .severity import classify
from .settings import NER_MODEL
from .simplification import simplify

MEASUREMENT = re.compile(r"\b\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?){0,2}\s*(?:mm|cm|m)\b", re.IGNORECASE)
ANATOMY_LABELS = {"Anatomical_system", "Organ", "Tissue"}


def analyze_text_report(data: bytes, media_type: str) -> TextAnalysis:
    text, method, warnings = extract_pdf(data) if media_type == "application/pdf" else extract_report_image(data)
    if len(text.strip()) < 30:
        raise ValueError("The report text could not be read reliably. Try a clearer scan or text-based PDF.")
    entities = extract_entities(text)
    level, _confidence, evidence, severity_source = classify(text)
    finding_entity = next((entity for entity in entities if entity.label not in ANATOMY_LABELS), None)
    anatomy_entity = next((entity for entity in entities if entity.label in ANATOMY_LABELS), None)
    measurement = MEASUREMENT.search(text)
    finding = finding_entity.text if finding_entity else "Not reliably extracted"
    plain, context = simplify(finding)
    title = plain or finding
    location = anatomy_entity.text if anatomy_entity else "Not reliably extracted"
    measurement_text = measurement.group() if measurement else "Not specified"
    label = {"routine": "Routine discussion", "monitor": "Review suggested", "prompt": "Prompt review wording found"}[level]
    assertion = finding_entity.assertion if finding_entity else "present"
    finding_label = plain or finding
    if assertion == "absent":
        summary = f"The report states that no {finding_label.lower()} was identified. The reported location is {location}."
    elif assertion == "possible":
        summary = f"The report describes a possible {finding_label.lower()} at {location}."
    elif assertion == "historical":
        summary = f"The report refers to a history of {finding_label.lower()} at {location}."
    else:
        summary = f"The report mentions {finding_label} at {location}."
    summary += " This wording should be reviewed with the clinician who ordered the test."
    limitations = "Automated OCR and entity extraction can miss or misread details. Verify this explanation against the original report."
    if severity_source == "explicit_wording_fallback":
        warnings.append("The trained follow-up classifier artifact is unavailable; only explicit wording rules were used.")
        limitations += " The trained follow-up classifier is not installed, so guidance uses explicit report wording only."
    return TextAnalysis(
        document_type="text_report" if method == "pdf_text" else "scanned_report",
        title=title.capitalize(), summary=summary,
        context=context or "No curated plain-language mapping is available for the extracted term.",
        finding=finding, location=location, measurement=measurement_text,
        follow_up_level=level, follow_up_label=label,
        follow_up_explanation="This indicator reflects wording in the uploaded report and is not medical triage.",
        questions=[
            "What does this finding mean in the context of my health history?",
            "Does the original report recommend follow-up, and when?",
            "Are there symptoms or changes that should make me contact you sooner?",
        ], limitations=limitations, extracted_text=text, extraction_method=method,
        entities=entities, evidence=evidence + [
            *([Evidence(finding_entity.text, finding_entity.start, finding_entity.end, "report_text")]
              if finding_entity else []),
            *([Evidence(anatomy_entity.text, anatomy_entity.start, anatomy_entity.end, "report_text")]
              if anatomy_entity else []),
            *([Evidence(measurement.group(), measurement.start(), measurement.end(), "report_text")]
              if measurement else []),
        ],
        model_versions={"ner": NER_MODEL, "severity": severity_source}, warnings=warnings,
    )
