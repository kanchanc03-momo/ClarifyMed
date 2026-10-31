from __future__ import annotations

from functools import lru_cache
import re

from .schemas import ExtractedEntity
from .settings import MODEL_CACHE_DIR, NER_MODEL
from .simplification import simplify


def _assertion(text: str, start: int) -> str:
    context_start = max(text.rfind(delimiter, 0, start) for delimiter in (".", ";", "\n")) + 1
    context = re.split(r"\b(?:but|however|although|yet)\b", text[context_start:start], flags=re.IGNORECASE)[-1]
    if re.search(r"\b(?:no evidence of|negative for|without|no)\b", context, re.IGNORECASE):
        return "absent"
    if re.search(r"\b(?:possible|possibly|may|might|cannot exclude|suspicious for)\b", context, re.IGNORECASE):
        return "possible"
    if re.search(r"\b(?:history of|prior|previous|old)\b", context, re.IGNORECASE):
        return "historical"
    return "present"


@lru_cache(maxsize=1)
def _pipeline():
    from transformers import pipeline

    MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return pipeline(
        "token-classification", model=NER_MODEL, tokenizer=NER_MODEL,
        aggregation_strategy="simple", device=-1, model_kwargs={"cache_dir": str(MODEL_CACHE_DIR)},
    )


def extract_entities(text: str, threshold: float = 0.55) -> list[ExtractedEntity]:
    if not text.strip():
        return []
    values = []
    for item in _pipeline()(text[:12000]):
        score = float(item["score"])
        if score < threshold:
            continue
        entity_text = item["word"].strip()
        plain, _ = simplify(entity_text)
        values.append(ExtractedEntity(
            label=str(item["entity_group"]), text=entity_text,
            start=int(item["start"]), end=int(item["end"]), score=score,
            assertion=_assertion(text, int(item["start"])),
            simplified=plain,
        ))
    return values
