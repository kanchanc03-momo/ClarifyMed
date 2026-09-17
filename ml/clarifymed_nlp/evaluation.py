from __future__ import annotations

import json
from pathlib import Path

from .extractor import BaselineClinicalExtractor


def _safe_ratio(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator else 0.0


def evaluate_jsonl(path: str | Path) -> dict[str, float | int]:
    extractor = BaselineClinicalExtractor()
    true_entities = predicted_entities = matched_entities = matched_assertions = 0
    follow_up_matches = examples = 0

    with Path(path).open(encoding="utf-8") as source:
        for line in source:
            if not line.strip():
                continue
            example = json.loads(line)
            result = extractor.extract(example["text"])
            expected = {(item["start"], item["end"], item["label"]): item["assertion"] for item in example["entities"]}
            predicted = {(item.start, item.end, item.label): item.assertion for item in result.entities}
            keys = expected.keys() & predicted.keys()
            true_entities += len(expected)
            predicted_entities += len(predicted)
            matched_entities += len(keys)
            matched_assertions += sum(expected[key] == predicted[key] for key in keys)
            follow_up_matches += result.follow_up.level == example["follow_up_level"]
            examples += 1

    precision = _safe_ratio(matched_entities, predicted_entities)
    recall = _safe_ratio(matched_entities, true_entities)
    return {
        "examples": examples,
        "entity_precision": round(precision, 4),
        "entity_recall": round(recall, 4),
        "entity_f1": round(_safe_ratio(2 * precision * recall, precision + recall), 4),
        "assertion_accuracy_on_matched_entities": round(_safe_ratio(matched_assertions, matched_entities), 4),
        "follow_up_accuracy": round(_safe_ratio(follow_up_matches, examples), 4),
    }
