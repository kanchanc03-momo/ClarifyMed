from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from datasets import Dataset
from sklearn.metrics import classification_report, confusion_matrix
from transformers import AutoModelForSequenceClassification, AutoTokenizer, DataCollatorWithPadding, Trainer, TrainingArguments

LABELS = ("routine", "monitor", "prompt")
LABEL_TO_ID = {label: index for index, label in enumerate(LABELS)}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True, help="Private CSV with text,label,split columns.")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--base-model", default="distilbert-base-uncased")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def load_rows(path: Path):
    groups = {"train": [], "dev": [], "test": []}
    seen = set()
    with path.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            text, label, split = row.get("text", "").strip(), row.get("label", "").strip().lower(), row.get("split", "").strip().lower()
            if len(text) < 20 or label not in LABEL_TO_ID or split not in groups:
                raise ValueError("Every row requires text (20+ chars), label routine/monitor/prompt, and split train/dev/test.")
            digest = hashlib.sha256(text.casefold().encode()).hexdigest()
            if digest in seen:
                raise ValueError("Duplicate text detected across dataset splits.")
            seen.add(digest)
            groups[split].append({"text": text, "label": LABEL_TO_ID[label]})
    for split, rows in groups.items():
        counts = Counter(row["label"] for row in rows)
        if set(counts) != set(range(len(LABELS))):
            raise ValueError(f"Split {split} does not contain all three labels.")
    return groups


def expected_calibration_error(probabilities, labels, bins=10):
    confidence = probabilities.max(axis=1)
    predictions = probabilities.argmax(axis=1)
    value = 0.0
    for lower in np.linspace(0, 1, bins, endpoint=False):
        upper = lower + 1 / bins
        mask = (confidence > lower) & (confidence <= upper)
        if mask.any():
            value += mask.mean() * abs((predictions[mask] == labels[mask]).mean() - confidence[mask].mean())
    return float(value)


def main():
    args = parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU is required for the approved training run.")
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed); torch.cuda.manual_seed_all(args.seed)
    rows = load_rows(args.data)
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    datasets = {name: Dataset.from_list(values).map(lambda batch: tokenizer(batch["text"], truncation=True, max_length=512), batched=True) for name, values in rows.items()}
    model = AutoModelForSequenceClassification.from_pretrained(
        args.base_model, num_labels=len(LABELS), id2label=dict(enumerate(LABELS)), label2id=LABEL_TO_ID,
    )
    args.output_dir.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(args.output_dir / "checkpoints"), eval_strategy="epoch", save_strategy="epoch",
        load_best_model_at_end=True, metric_for_best_model="eval_loss", learning_rate=2e-5,
        per_device_train_batch_size=16, per_device_eval_batch_size=32, num_train_epochs=args.epochs,
        weight_decay=0.01, warmup_ratio=0.1, fp16=True, seed=args.seed, report_to="none", save_total_limit=2,
    )
    trainer = Trainer(model=model, args=training_args, train_dataset=datasets["train"], eval_dataset=datasets["dev"], tokenizer=tokenizer, data_collator=DataCollatorWithPadding(tokenizer))
    trainer.train()
    prediction = trainer.predict(datasets["test"])
    probabilities = torch.softmax(torch.tensor(prediction.predictions), dim=-1).numpy()
    predicted = probabilities.argmax(axis=1)
    truth = prediction.label_ids
    metrics = {
        "classification_report": classification_report(truth, predicted, target_names=LABELS, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(truth, predicted).tolist(),
        "expected_calibration_error": expected_calibration_error(probabilities, truth),
        "test_examples": len(truth),
    }
    model_dir = args.output_dir / "model"
    trainer.save_model(str(model_dir)); tokenizer.save_pretrained(str(model_dir))
    (args.output_dir / "evaluation.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__": main()
