from __future__ import annotations

import argparse
import csv
import json
import hashlib
import platform
from datetime import datetime, timezone
from pathlib import Path
import joblib
import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.pipeline import Pipeline

try:
    from .validate_severity_dataset import validate_dataset
except ImportError:
    from validate_severity_dataset import validate_dataset

LABELS = ["routine", "monitor", "prompt"]


def load_dataset(csv_path: Path) -> dict[str, tuple[list[str], list[str]]]:
    validation = validate_dataset(csv_path)
    if not validation['valid']:
        raise ValueError('Dataset validation failed: ' + '; '.join(validation['errors']))
    splits: dict[str, tuple[list[str], list[str]]] = {
        "train": ([], []),
        "dev": ([], []),
        "test": ([], []),
    }
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            split = (row.get("split") or "").strip().lower()
            text = (row.get("text") or "").strip()
            label = (row.get("label") or "").strip().lower()
            if split in splits and label in LABELS and text:
                splits[split][0].append(text)
                splits[split][1].append(label)
    return splits


def train_and_evaluate(
    data_path: Path, output_dir: Path
) -> dict:
    splits = load_dataset(data_path)
    if any((output_dir / name).exists() for name in ('model.joblib', 'evaluation.json')):
        raise FileExistsError('Choose a new output directory to preserve existing training artifacts.')

    train_texts, train_labels = splits["train"]
    dev_texts, dev_labels = splits["dev"]
    test_texts, test_labels = splits["test"]

    # Keep development and test examples out of fitting.
    fit_texts = train_texts
    fit_labels = train_labels

    pipeline = Pipeline([
        (
            "tfidf",
            TfidfVectorizer(
                ngram_range=(1, 2),
                sublinear_tf=True,
                min_df=1,
                token_pattern=r"(?u)\b\w+\b",
            ),
        ),
        (
            "clf",
            LogisticRegression(
                C=2.0,
                class_weight="balanced",
                max_iter=1000,
                random_state=42,
            ),
        ),
    ])

    pipeline.fit(fit_texts, fit_labels)

    # Evaluate on held-out test set
    test_preds = pipeline.predict(test_texts)
    test_probs = pipeline.predict_proba(test_texts)
    confidence = test_probs.max(axis=1)
    correct = test_preds == np.asarray(test_labels)
    calibration_error = 0.0
    for index in range(10):
        selected = (confidence >= index / 10) & (confidence < (index + 1) / 10 if index < 9 else confidence <= 1)
        if selected.any():
            calibration_error += float(selected.mean() * abs(correct[selected].mean() - confidence[selected].mean()))

    report = classification_report(
        test_labels, test_preds, labels=LABELS, output_dict=True, zero_division=0
    )
    conf_matrix = confusion_matrix(test_labels, test_preds, labels=LABELS).tolist()

    # Extract top keywords per class
    vectorizer: TfidfVectorizer = pipeline.named_steps["tfidf"]
    classifier: LogisticRegression = pipeline.named_steps["clf"]
    feature_names = np.array(vectorizer.get_feature_names_out())

    top_features = {}
    for i, label in enumerate(classifier.classes_):
        top_indices = np.argsort(classifier.coef_[i])[-10:][::-1]
        top_features[label] = feature_names[top_indices].tolist()

    # Save model artifact
    output_dir.mkdir(parents=True, exist_ok=True)
    model_file = output_dir / "model.joblib"
    joblib.dump(pipeline, model_file)

    eval_result = {
        "model_architecture": "tfidf_logistic_regression",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_sha256": hashlib.sha256(data_path.read_bytes()).hexdigest(),
        "model_sha256": hashlib.sha256(model_file.read_bytes()).hexdigest(),
        "versions": {"python": platform.python_version(), "scikit_learn": sklearn.__version__, "numpy": np.__version__},
        "seed": 42,
        "fit_split": "train",
        "development_metrics": classification_report(dev_labels, pipeline.predict(dev_texts), labels=LABELS, output_dict=True, zero_division=0),
        "expected_calibration_error": calibration_error,
        "limitations": "Prototype experiment only. CSV review flags do not independently establish clinician review or clinical validity. Test data must not guide model tuning.",
        "labels": list(classifier.classes_),
        "test_metrics": report,
        "confusion_matrix": {
            "labels": LABELS,
            "matrix": conf_matrix,
        },
        "top_predictive_ngrams": top_features,
        "sample_count": {
            "train": len(train_texts),
            "dev": len(dev_texts),
            "test": len(test_texts),
        },
    }

    eval_file = output_dir / "evaluation.json"
    eval_file.write_text(json.dumps(eval_result, indent=2), encoding="utf-8")

    return eval_result


def main():
    parser = argparse.ArgumentParser(description="Train basic Scikit-Learn TF-IDF + Logistic Regression follow-up classifier.")
    parser.add_argument("--data", default=Path("ml/training/clinical_severity_dataset.csv"), type=Path)
    parser.add_argument("--output-dir", default=Path("ml/artifacts/severity-classifier"), type=Path)
    args = parser.parse_args()

    result = train_and_evaluate(args.data, args.output_dir)
    print("Training Complete!")
    print(f"Accuracy on held-out test set: {result['test_metrics']['accuracy']:.2%}")
    print(f"Macro F1 score: {result['test_metrics']['macro avg']['f1-score']:.2%}")
    print(f"Saved artifact to: {args.output_dir / 'model.joblib'}")


if __name__ == "__main__":
    main()
