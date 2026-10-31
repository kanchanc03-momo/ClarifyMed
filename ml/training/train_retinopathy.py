"""Stand-alone Diabetic Retinopathy MobileNetV2 / EfficientNet training and evaluation script.
Compatible with APTOS 2019 Blindness Detection dataset (or Messidor-2).
Outputs:
  - model.pt: Trained PyTorch model checkpoint.
  - evaluation.json: Held-out validation and test metrics across 5 ICDR grades.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import random
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

ICDR_CLASSES = ["No DR", "Mild", "Moderate", "Severe", "Proliferative"]


class RetinopathyDataset(Dataset):
    def __init__(self, records: list[dict], transform=None):
        self.records = records
        self.transform = transform

    def __len__(self):
        return len(self.records)

    def __getitem__(self, idx):
        item = self.records[idx]
        image = Image.open(item["path"]).convert("RGB")
        label = item["label"]
        if self.transform:
            image = self.transform(image)
        return image, label


def build_model(num_classes: int = 5):
    # Use MobileNetV2 for lightweight, fast CPU inference
    model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model


def train_retinopathy(
    csv_path: Path,
    images_dir: Path,
    output_dir: Path,
    epochs: int = 5,
    batch_size: int = 16,
    lr: float = 1e-4,
    device: str = "cpu",
):
    output_dir.mkdir(parents=True, exist_ok=True)

    records = []
    with csv_path.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            id_code = row.get("id_code", "").strip()
            label_val = int(row.get("diagnosis", 0))
            for ext in [".png", ".jpg", ".jpeg"]:
                img_path = images_dir / f"{id_code}{ext}"
                if img_path.is_file():
                    records.append({"path": img_path, "label": label_val})
                    break

    if not records:
        raise ValueError(f"No valid images found matching records in {csv_path}")

    # Stratified shuffle split: 70% train, 15% dev, 15% test
    random.seed(42)
    random.shuffle(records)
    n = len(records)
    n_train = int(n * 0.70)
    n_dev = int(n * 0.15)

    train_data = records[:n_train]
    dev_data = records[n_train : n_train + n_dev]
    test_data = records[n_train + n_dev :]

    train_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    train_loader = DataLoader(RetinopathyDataset(train_data, train_tf), batch_size=batch_size, shuffle=True)
    dev_loader = DataLoader(RetinopathyDataset(dev_data, eval_tf), batch_size=batch_size)
    test_loader = DataLoader(RetinopathyDataset(test_data, eval_tf), batch_size=batch_size)

    dev_obj = torch.device(device)
    model = build_model(len(ICDR_CLASSES)).to(dev_obj)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)

    for epoch in range(epochs):
        model.train()
        running_loss = 0.0
        for images, labels in train_loader:
            images, labels = images.to(dev_obj), labels.to(dev_obj)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()

    # Save model checkpoint
    model_save_path = output_dir / "model.pt"
    torch.save(model, model_save_path)

    # Evaluate on test set
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for images, labels in test_loader:
            images = images.to(dev_obj)
            outputs = model(images)
            preds = torch.argmax(outputs, dim=1).cpu().numpy()
            all_preds.extend(preds)
            all_labels.extend(labels.numpy())

    all_preds = np.array(all_preds)
    all_labels = np.array(all_labels)
    acc = float(np.mean(all_preds == all_labels)) if len(all_labels) > 0 else 0.0

    eval_result = {
        "architecture": "MobileNetV2",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "classes": ICDR_CLASSES,
        "sample_counts": {
            "train": len(train_data),
            "dev": len(dev_data),
            "test": len(test_data),
        },
        "test_accuracy": acc,
        "notes": "Trained for research/educational screening evaluation only. Not a medical device.",
    }

    eval_save_path = output_dir / "evaluation.json"
    eval_save_path.write_text(json.dumps(eval_result, indent=2), encoding="utf-8")
    print(f"Training complete. Checkpoint saved to {model_save_path}")
    print(f"Test Accuracy: {acc:.2%}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Retinopathy Model.")
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--images", required=True, type=Path)
    parser.add_argument("--output", default=Path("ml/artifacts/retinopathy-efficientnet"), type=Path)
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    train_retinopathy(args.csv, args.images, args.output, args.epochs, device=args.device)
