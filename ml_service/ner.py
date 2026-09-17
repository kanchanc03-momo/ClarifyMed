from __future__ import annotations

from functools import lru_cache

from .schemas import ExtractedEntity
from .settings import MODEL_CACHE_DIR, NER_MODEL
from .simplification import simplify


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
            simplified=plain,
        ))
    return values
