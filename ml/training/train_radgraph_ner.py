from __future__ import annotations

import argparse
import json
import os
import random
from pathlib import Path

import numpy as np
import torch
from seqeval.metrics import accuracy_score, classification_report, f1_score, precision_score, recall_score
from transformers import (
    AutoModelForTokenClassification,
    AutoTokenizer,
    DataCollatorForTokenClassification,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

from radgraph_dataset import RADGRAPH_LABELS, load_radgraph_split, tokenize_and_align


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune ClarifyMed's RadGraph entity/assertion model.")
    parser.add_argument("--data-dir", type=Path, required=True, help="Private directory containing train.json, dev.json, and test.json.")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--base-model", default="microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract-fulltext")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--maximum-length", type=int, default=512)
    return parser.parse_args()


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def main() -> None:
    args = arguments()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU is required for the approved training run.")
    for name in ("train.json", "dev.json", "test.json"):
        if not (args.data_dir / name).is_file():
            raise FileNotFoundError(f"Missing required private split: {args.data_dir / name}")

    set_seed(args.seed)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True)
    raw_train = load_radgraph_split(args.data_dir / "train.json")
    raw_dev = load_radgraph_split(args.data_dir / "dev.json")
    raw_test = load_radgraph_split(args.data_dir / "test.json")
    train = tokenize_and_align(raw_train, tokenizer, args.maximum_length)
    dev = tokenize_and_align(raw_dev, tokenizer, args.maximum_length)
    test = tokenize_and_align(raw_test, tokenizer, args.maximum_length)

    id_to_label = dict(enumerate(RADGRAPH_LABELS))
    model = AutoModelForTokenClassification.from_pretrained(
        args.base_model, num_labels=len(RADGRAPH_LABELS), id2label=id_to_label,
        label2id={value: key for key, value in id_to_label.items()},
    )

    def metrics(result):
        predictions = np.argmax(result.predictions, axis=-1)
        true_predictions, true_labels = [], []
        for predicted_row, label_row in zip(predictions, result.label_ids):
            pairs = [(id_to_label[int(predicted)], id_to_label[int(label)]) for predicted, label in zip(predicted_row, label_row) if label != -100]
            true_predictions.append([pair[0] for pair in pairs])
            true_labels.append([pair[1] for pair in pairs])
        return {
            "precision": precision_score(true_labels, true_predictions),
            "recall": recall_score(true_labels, true_predictions),
            "f1": f1_score(true_labels, true_predictions),
            "token_accuracy": accuracy_score(true_labels, true_predictions),
        }

    training = TrainingArguments(
        output_dir=str(args.output_dir / "checkpoints"),
        eval_strategy="epoch", save_strategy="epoch", logging_strategy="steps", logging_steps=20,
        learning_rate=args.learning_rate, per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size, num_train_epochs=args.epochs,
        weight_decay=0.01, warmup_ratio=0.1, load_best_model_at_end=True,
        metric_for_best_model="f1", greater_is_better=True, save_total_limit=2,
        fp16=True, seed=args.seed, data_seed=args.seed, report_to="none",
    )
    trainer = Trainer(
        model=model, args=training, train_dataset=train, eval_dataset=dev,
        processing_class=tokenizer, data_collator=DataCollatorForTokenClassification(tokenizer),
        compute_metrics=metrics, callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )
    trainer.train()
    test_output = trainer.predict(test)
    test_metrics = {key: float(value) for key, value in test_output.metrics.items()}
    trainer.save_model(str(args.output_dir / "model"))
    tokenizer.save_pretrained(str(args.output_dir / "model"))
    metadata = {
        "task": "radgraph_entity_and_assertion_extraction",
        "base_model": args.base_model,
        "labels": list(RADGRAPH_LABELS),
        "seed": args.seed,
        "train_examples": len(raw_train), "dev_examples": len(raw_dev), "test_examples": len(raw_test),
        "test_metrics": test_metrics,
        "torch_version": torch.__version__,
        "cuda_device": torch.cuda.get_device_name(0),
    }
    (args.output_dir / "training-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
