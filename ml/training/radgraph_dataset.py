from __future__ import annotations

import json
from pathlib import Path

from datasets import Dataset

RADGRAPH_LABELS = (
    "O",
    "B-ANAT-DP", "I-ANAT-DP",
    "B-OBS-DP", "I-OBS-DP",
    "B-OBS-U", "I-OBS-U",
    "B-OBS-DA", "I-OBS-DA",
)
LABEL_TO_ID = {label: index for index, label in enumerate(RADGRAPH_LABELS)}


def _tokens(record: dict) -> list[str]:
    value = record.get("text") or record.get("tokens")
    if isinstance(value, list) and all(isinstance(token, str) for token in value):
        return value
    if isinstance(value, str):
        return value.split()
    raise ValueError("RadGraph record has no supported text/token field.")


def _entity_label(entity: dict) -> str:
    value = entity.get("label", entity.get("labels"))
    if isinstance(value, list):
        value = value[0] if value else None
    if value not in {"ANAT-DP", "OBS-DP", "OBS-U", "OBS-DA"}:
        raise ValueError(f"Unsupported RadGraph label: {value!r}")
    return value


def load_radgraph_split(path: str | Path) -> Dataset:
    with Path(path).open(encoding="utf-8") as source:
        payload = json.load(source)
    rows = []
    for report_id, record in payload.items():
        tokens = _tokens(record)
        labels = [LABEL_TO_ID["O"]] * len(tokens)
        for entity in record.get("entities", {}).values():
            start = int(entity["start_ix"])
            end = int(entity["end_ix"])
            if start < 0 or end < start or end >= len(tokens):
                raise ValueError(f"Invalid entity span in report {report_id}.")
            entity_label = _entity_label(entity)
            labels[start] = LABEL_TO_ID[f"B-{entity_label}"]
            for index in range(start + 1, end + 1):
                labels[index] = LABEL_TO_ID[f"I-{entity_label}"]
        rows.append({"report_id": str(report_id), "tokens": tokens, "ner_tags": labels})
    return Dataset.from_list(rows)


def tokenize_and_align(dataset: Dataset, tokenizer, maximum_length: int = 512) -> Dataset:
    def tokenize(batch):
        encoded = tokenizer(
            batch["tokens"], truncation=True, max_length=maximum_length,
            is_split_into_words=True,
        )
        word_ids = encoded.word_ids()
        aligned = []
        previous = None
        for word_id in word_ids:
            if word_id is None:
                aligned.append(-100)
            elif word_id != previous:
                aligned.append(batch["ner_tags"][word_id])
            else:
                label = RADGRAPH_LABELS[batch["ner_tags"][word_id]]
                aligned.append(LABEL_TO_ID.get(f"I-{label[2:]}", batch["ner_tags"][word_id]) if label != "O" else LABEL_TO_ID["O"])
            previous = word_id
        encoded["labels"] = aligned
        return encoded

    return dataset.map(tokenize, remove_columns=dataset.column_names)
