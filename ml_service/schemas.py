from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class Evidence:
    text: str
    start: int
    end: int
    source: str


@dataclass(frozen=True)
class ExtractedEntity:
    label: str
    text: str
    start: int
    end: int
    score: float
    assertion: str = "present"
    simplified: str | None = None


@dataclass
class TextAnalysis:
    document_type: str
    title: str
    summary: str
    context: str
    finding: str
    location: str
    measurement: str
    follow_up_level: str
    follow_up_label: str
    follow_up_explanation: str
    questions: list[str]
    limitations: str
    extracted_text: str
    extraction_method: str
    entities: list[ExtractedEntity] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)
    model_versions: dict[str, str] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def to_api_dict(self) -> dict:
        value = asdict(self)
        return {
            "documentType": value.pop("document_type"),
            "followUpLevel": value.pop("follow_up_level"),
            "followUpLabel": value.pop("follow_up_label"),
            "followUpExplanation": value.pop("follow_up_explanation"),
            "extractedText": value.pop("extracted_text"),
            "extractionMethod": value.pop("extraction_method"),
            "modelVersions": value.pop("model_versions"),
            **value,
        }
