"""Diabetic Retinopathy dataset validator and split manager.
Supports APTOS 2019 Blindness Detection format (id_code, diagnosis).
Diagnosis levels (ICDR):
  0 - No DR
  1 - Mild
  2 - Moderate
  3 - Severe
  4 - Proliferative DR
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path

REQUIRED_COLUMNS = {"id_code", "diagnosis"}
ICDR_LABELS = {0: "No DR", 1: "Mild", 2: "Moderate", 3: "Severe", 4: "Proliferative"}


def validate_retinopathy_dataset(csv_path: Path, images_dir: Path | None = None) -> dict:
    errors = []
    warnings = []
    label_counts = Counter()
    rows = []

    if not csv_path.is_file():
        return {"valid": False, "errors": [f"CSV file not found: {csv_path}"], "warnings": []}

    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        columns = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - columns
        if missing:
            return {"valid": False, "errors": [f"Missing required columns: {sorted(missing)}"], "warnings": []}

        for idx, row in enumerate(reader, start=2):
            id_code = (row.get("id_code") or "").strip()
            diag_str = (row.get("diagnosis") or "").strip()

            if not id_code:
                errors.append(f"Line {idx}: missing id_code.")
                continue

            try:
                diag = int(diag_str)
                if diag not in ICDR_LABELS:
                    errors.append(f"Line {idx}: diagnosis must be between 0 and 4, got {diag}.")
                else:
                    label_counts[diag] += 1
            except ValueError:
                errors.append(f"Line {idx}: invalid diagnosis value '{diag_str}'.")

            if images_dir and images_dir.is_dir():
                candidates = [
                    images_dir / f"{id_code}.png",
                    images_dir / f"{id_code}.jpg",
                    images_dir / f"{id_code}.jpeg",
                ]
                if not any(c.is_file() for c in candidates):
                    errors.append(f"Line {idx}: image file for '{id_code}' not found in {images_dir}.")

            rows.append(row)

    if len(rows) == 0:
        errors.append("Dataset is empty.")

    distribution = {f"{k} - {ICDR_LABELS[k]}": label_counts[k] for k in sorted(ICDR_LABELS)}

    return {
        "valid": len(errors) == 0,
        "total_images": len(rows),
        "distribution": distribution,
        "errors": errors[:50],  # Cap error reporting to avoid massive outputs
        "warnings": warnings,
    }


def main():
    parser = argparse.ArgumentParser(description="Validate Diabetic Retinopathy dataset.")
    parser.add_argument("--csv", required=True, type=Path, help="Path to train.csv")
    parser.add_argument("--images", type=Path, default=None, help="Path to images directory")
    args = parser.parse_args()

    result = validate_retinopathy_dataset(args.csv, args.images)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
