from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from pathlib import Path, PurePosixPath

import numpy as np
import torch
from PIL import Image
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

LABELS = ["normal", "abnormal"]
SUPPORTED_BODY_PARTS = {"ELBOW", "FINGER", "FOREARM", "HAND", "HUMERUS", "SHOULDER", "WRIST"}


def path_parts(path: str) -> tuple[str, ...]:
    return PurePosixPath(path.replace("\\", "/")).parts


def patient_key(path: str) -> str:
    patient = next((part for part in path_parts(path) if part.casefold().startswith("patient")), None)
    if not patient:
        raise ValueError(f"Cannot determine patient from MURA path: {path}")
    return patient


def study_key(path: str) -> str:
    parts = path_parts(path)
    index = next((i for i, part in enumerate(parts) if part.casefold().startswith("study")), None)
    if index is None:
        raise ValueError(f"Cannot determine study from MURA path: {path}")
    return "/".join(parts[: index + 1])


def body_part(path: str) -> str:
    value = next((part.removeprefix("XR_") for part in path_parts(path) if part.startswith("XR_")), None)
    if value not in SUPPORTED_BODY_PARTS:
        raise ValueError(f"Unsupported or malformed MURA body part in path: {path}")
    return value


def label_from_path(path: str) -> int:
    folded = path.casefold()
    if "positive" in folded:
        return 1
    if "negative" in folded:
        return 0
    raise ValueError(f"Cannot determine label from MURA path: {path}")


class MuraDataset(Dataset):
    def __init__(self, root: Path, paths: list[str], transform):
        self.root, self.paths, self.transform = root, paths, transform

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, index):
        relative = self.paths[index]
        image = Image.open(self.root / relative).convert("RGB")
        return self.transform(image), label_from_path(relative), relative


def read_paths(path: Path) -> list[str]:
    return [line.strip().replace("MURA-v1.1/", "", 1) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def split_train(paths: list[str], seed: int, dev_fraction: float = 0.1) -> tuple[list[str], list[str]]:
    patients = sorted({patient_key(path) for path in paths})
    random.Random(seed).shuffle(patients)
    dev_patients = set(patients[:max(1, round(len(patients) * dev_fraction))])
    return ([path for path in paths if patient_key(path) not in dev_patients],
            [path for path in paths if patient_key(path) in dev_patients])


def validate_paths(root: Path, paths: list[str], split: str) -> None:
    if not paths:
        raise ValueError(f"The {split} split is empty.")
    missing = [path for path in paths if not (root / path).is_file()]
    if missing:
        raise FileNotFoundError(f"{len(missing)} {split} images are missing; first: {missing[0]}")
    for path in paths:
        label_from_path(path); patient_key(path); study_key(path); body_part(path)


def run_epoch(model, loader, device, optimizer=None):
    training = optimizer is not None
    model.train(training)
    loss_fn, total = nn.CrossEntropyLoss(), 0.0
    for images, labels, _paths in loader:
        images, labels = images.to(device), labels.to(device)
        if training:
            optimizer.zero_grad(set_to_none=True)
        loss = loss_fn(model(images), labels)
        if training:
            loss.backward(); optimizer.step()
        total += loss.item() * labels.size(0)
    return total / len(loader.dataset)


@torch.inference_mode()
def predict(model, loader, device):
    model.eval()
    probabilities, labels, paths = [], [], []
    for images, target, batch_paths in loader:
        probabilities.extend(torch.softmax(model(images.to(device)), dim=1)[:, 1].cpu().tolist())
        labels.extend(target.tolist()); paths.extend(batch_paths)
    return np.asarray(probabilities), np.asarray(labels), paths


def expected_calibration_error(probabilities: np.ndarray, labels: np.ndarray, bins: int = 10) -> float:
    edges, error = np.linspace(0.0, 1.0, bins + 1), 0.0
    for lower, upper in zip(edges[:-1], edges[1:]):
        selected = (probabilities >= lower) & (probabilities < upper if upper < 1 else probabilities <= upper)
        if selected.any():
            error += selected.mean() * abs(probabilities[selected].mean() - labels[selected].mean())
    return float(error)


def binary_metrics(labels: np.ndarray, probabilities: np.ndarray) -> dict:
    predicted = (probabilities >= 0.5).astype(int)
    return {
        "roc_auc": float(roc_auc_score(labels, probabilities)) if len(set(labels.tolist())) == 2 else None,
        "classification_report": classification_report(labels, predicted, labels=[0, 1], target_names=LABELS, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(labels, predicted, labels=[0, 1]).tolist(),
        "expected_calibration_error": expected_calibration_error(probabilities, labels),
        "count": len(labels),
    }


def aggregate_studies(probabilities: np.ndarray, labels: np.ndarray, paths: list[str]):
    grouped = defaultdict(lambda: {"probabilities": [], "labels": [], "body_part": None})
    for probability, label, path in zip(probabilities, labels, paths):
        study = study_key(path)
        grouped[study]["probabilities"].append(float(probability))
        grouped[study]["labels"].append(int(label))
        grouped[study]["body_part"] = body_part(path)
    rows = []
    for study, values in sorted(grouped.items()):
        if len(set(values["labels"])) != 1:
            raise ValueError(f"Study contains conflicting image labels: {study}")
        rows.append((study, float(np.mean(values["probabilities"])), values["labels"][0], values["body_part"]))
    return rows


def evaluate(probabilities: np.ndarray, labels: np.ndarray, paths: list[str]) -> dict:
    studies = aggregate_studies(probabilities, labels, paths)
    study_probabilities = np.asarray([row[1] for row in studies])
    study_labels = np.asarray([row[2] for row in studies])
    per_body_part = {}
    for part in sorted(SUPPORTED_BODY_PARTS):
        selected = [row for row in studies if row[3] == part]
        if selected:
            per_body_part[part] = binary_metrics(np.asarray([row[2] for row in selected]), np.asarray([row[1] for row in selected]))
    return {"image_level": binary_metrics(labels, probabilities), "study_level": binary_metrics(study_labels, study_probabilities), "study_level_by_body_part": per_body_part}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mura-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU is required for the approved MURA training run.")
    train_file, valid_file = args.mura_root / "train_image_paths.csv", args.mura_root / "valid_image_paths.csv"
    if not train_file.is_file() or not valid_file.is_file():
        raise FileNotFoundError("Official MURA train_image_paths.csv and valid_image_paths.csv are required.")

    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed); torch.cuda.manual_seed_all(args.seed)
    torch.backends.cudnn.deterministic = True; torch.backends.cudnn.benchmark = False
    train_paths, dev_paths = split_train(read_paths(train_file), args.seed)
    test_paths = read_paths(valid_file)
    validate_paths(args.mura_root, train_paths, "train")
    validate_paths(args.mura_root, dev_paths, "development")
    validate_paths(args.mura_root, test_paths, "official validation")
    if {patient_key(p) for p in train_paths} & {patient_key(p) for p in dev_paths}:
        raise ValueError("Patient leakage detected between training and development splits.")

    normalize = transforms.Normalize([.485, .456, .406], [.229, .224, .225])
    train_transform = transforms.Compose([transforms.Resize((224, 224)), transforms.RandomHorizontalFlip(), transforms.RandomRotation(7), transforms.ToTensor(), normalize])
    eval_transform = transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor(), normalize])
    loaders = {
        "train": DataLoader(MuraDataset(args.mura_root, train_paths, train_transform), batch_size=args.batch_size, shuffle=True, num_workers=args.workers, pin_memory=True),
        "dev": DataLoader(MuraDataset(args.mura_root, dev_paths, eval_transform), batch_size=args.batch_size * 2, num_workers=args.workers),
        "test": DataLoader(MuraDataset(args.mura_root, test_paths, eval_transform), batch_size=args.batch_size * 2, num_workers=args.workers),
    }
    device = torch.device("cuda")
    model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)
    model.classifier[1] = nn.Linear(model.last_channel, 2); model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)
    best_loss, best_state, best_epoch = float("inf"), None, None
    for epoch in range(args.epochs):
        train_loss = run_epoch(model, loaders["train"], device, optimizer)
        dev_loss = run_epoch(model, loaders["dev"], device)
        print(f"epoch={epoch + 1} train_loss={train_loss:.4f} dev_loss={dev_loss:.4f}")
        if dev_loss < best_loss:
            best_loss, best_epoch = dev_loss, epoch + 1
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}

    model.load_state_dict(best_state)
    probabilities, truth, paths = predict(model, loaders["test"], device)
    metrics = {"dataset": "MURA-v1.1 official validation split", "architecture": "mobilenet_v2", "seed": args.seed, "epochs_requested": args.epochs, "best_epoch": best_epoch, "best_development_loss": best_loss, "split_integrity": {"development_split_unit": "patient", "train_patients": len({patient_key(p) for p in train_paths}), "development_patients": len({patient_key(p) for p in dev_paths})}, **evaluate(probabilities, truth, paths)}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": best_state, "labels": LABELS, "architecture": "mobilenet_v2", "image_size": 224, "scope": "MURA musculoskeletal radiographs only", "dataset": "MURA-v1.1", "seed": args.seed, "best_epoch": best_epoch}, args.output_dir / "model.pt")
    (args.output_dir / "evaluation.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
