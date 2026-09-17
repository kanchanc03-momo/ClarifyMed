from __future__ import annotations

import hashlib
import re

from .schema import Entity, Evidence, FollowUp, NLPExtraction, Quality, Section

SECTION_PATTERN = re.compile(
    r"(?im)^(?P<header>findings?|impression|conclusion|recommendations?|history|indication)\s*:\s*"
)
MEASUREMENT_PATTERN = re.compile(
    r"\b\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?){0,2}\s*(?:mm|cm|m)\b",
    re.IGNORECASE,
)

ANATOMY_TERMS = (
    "left lung", "right lung", "lower lobe", "upper lobe", "middle lobe",
    "lung", "heart", "liver", "kidney", "brain", "spine", "chest",
)
FINDING_TERMS = (
    "opacity", "lesion", "mass", "nodule", "fracture", "effusion",
    "consolidation", "infiltrate", "edema", "cardiomegaly",
)
ABSENT_PATTERN = re.compile(r"\b(no|without|negative for|no evidence of)\b", re.IGNORECASE)
POSSIBLE_PATTERN = re.compile(r"\b(possible|possibly|may|might|suspicious for|cannot exclude)\b", re.IGNORECASE)
HISTORICAL_PATTERN = re.compile(r"\b(history of|previous|prior|old|chronic)\b", re.IGNORECASE)
PROMPT_PATTERN = re.compile(r"\b(urgent|urgently|immediate|prompt|critical)\b", re.IGNORECASE)
MONITOR_PATTERN = re.compile(r"\b(follow[ -]?up|recommend(?:ed|ation)?|compare with prior|surveillance|monitor)\b", re.IGNORECASE)


class BaselineClinicalExtractor:
    """Deterministic extraction baseline; not a diagnostic or trained model."""

    pipeline_version = "nlp-baseline-0.1.0"

    def extract(self, text: str) -> NLPExtraction:
        if not isinstance(text, str):
            raise TypeError("Report text must be a string.")
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        sections = self._sections(text)
        entities = self._entities(text)
        warnings: list[str] = []
        if len(text.strip()) < 30:
            warnings.append("Report text is too short for reliable extraction.")
        if not any(entity.label == "finding" for entity in entities):
            warnings.append("No supported finding term was extracted.")
        return NLPExtraction(
            schema_version="1.0.0",
            pipeline_version=self.pipeline_version,
            text_sha256=digest,
            language="en",
            sections=tuple(sections),
            entities=tuple(entities),
            follow_up=self._follow_up(text),
            quality=Quality(processable=bool(text.strip()) and len(text.strip()) >= 30, warnings=tuple(warnings)),
            metadata={"implementation": "deterministic_baseline"},
        )

    def _sections(self, text: str) -> list[Section]:
        matches = list(SECTION_PATTERN.finditer(text))
        if not matches:
            return [Section(name="report", start=0, end=len(text), text=text)] if text else []
        sections: list[Section] = []
        for index, match in enumerate(matches):
            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            sections.append(Section(name=match.group("header").lower(), start=start, end=end, text=text[start:end].strip()))
        return sections

    def _entities(self, text: str) -> list[Entity]:
        matches: list[tuple[int, int, str, str]] = []
        matches.extend((match.start(), match.end(), "measurement", match.group()) for match in MEASUREMENT_PATTERN.finditer(text))
        for label, terms in (("anatomy", ANATOMY_TERMS), ("finding", FINDING_TERMS)):
            pattern = re.compile(r"\b(?:" + "|".join(re.escape(term) for term in sorted(terms, key=len, reverse=True)) + r")\b", re.IGNORECASE)
            matches.extend((match.start(), match.end(), label, match.group()) for match in pattern.finditer(text))
        matches.sort(key=lambda item: (item[0], item[1]))
        entities: list[Entity] = []
        for index, (start, end, label, value) in enumerate(matches, start=1):
            context_start = max(text.rfind(delimiter, 0, start) for delimiter in (".", ";", "\n")) + 1
            context = text[context_start:start]
            assertion = "present"
            if ABSENT_PATTERN.search(context): assertion = "absent"
            elif POSSIBLE_PATTERN.search(context): assertion = "possible"
            elif HISTORICAL_PATTERN.search(context): assertion = "historical"
            entities.append(Entity(
                id=f"e{index}", label=label, text=value, start=start, end=end,
                assertion=assertion, confidence=1.0 if label == "measurement" else 0.65,
                extractor="deterministic_baseline",
            ))
        return entities

    def _follow_up(self, text: str) -> FollowUp:
        prompt = PROMPT_PATTERN.search(text)
        monitor = MONITOR_PATTERN.search(text)
        match, level, confidence = (prompt, "prompt", 0.8) if prompt else ((monitor, "monitor", 0.7) if monitor else (None, "routine", 0.4))
        evidence = () if not match else (Evidence(text=match.group(), start=match.start(), end=match.end()),)
        return FollowUp(level=level, confidence=confidence, evidence=evidence)
