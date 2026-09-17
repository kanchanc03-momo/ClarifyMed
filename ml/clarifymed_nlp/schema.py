from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

Assertion = Literal["present", "absent", "possible", "historical"]
EntityLabel = Literal["finding", "anatomy", "measurement"]
FollowUpLevel = Literal["routine", "monitor", "prompt"]


@dataclass(frozen=True)
class Evidence:
    text: str
    start: int
    end: int


@dataclass(frozen=True)
class Section:
    name: str
    start: int
    end: int
    text: str


@dataclass(frozen=True)
class Entity:
    id: str
    label: EntityLabel
    text: str
    start: int
    end: int
    assertion: Assertion
    confidence: float
    extractor: str


@dataclass(frozen=True)
class FollowUp:
    level: FollowUpLevel
    confidence: float
    evidence: tuple[Evidence, ...] = ()


@dataclass(frozen=True)
class Quality:
    processable: bool
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class NLPExtraction:
    schema_version: str
    pipeline_version: str
    text_sha256: str
    language: str
    sections: tuple[Section, ...]
    entities: tuple[Entity, ...]
    follow_up: FollowUp
    quality: Quality
    metadata: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)
