from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

LABELS = ('routine', 'monitor', 'prompt')
SPLITS = ('train', 'dev', 'test')
REQUIRED_COLUMNS = {'text', 'label', 'split'}
IDENTIFIER_PATTERNS = {
    'email': re.compile(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', re.I),
    'phone': re.compile(r'(?<!\d)(?:\+?\d[\d .()-]{7,}\d)(?!\d)'),
    'medical_record_number': re.compile(r'\b(?:MRN|medical record|patient id)\s*[:#-]?\s*[A-Z0-9-]{4,}\b', re.I),
    'date_of_birth': re.compile(r'\b(?:DOB|date of birth)\s*[:#-]?\s*\S+', re.I),
}


def normalized_text(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', ' ', value.casefold()).strip()


def validate_dataset(path: Path, minimum_rows: int = 200, require_approval: bool = True) -> dict:
    errors, warnings = [], []
    counts = Counter()
    split_counts = Counter()
    seen = defaultdict(list)
    rows = []
    with path.open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        columns = set(reader.fieldnames or [])
        missing = sorted(REQUIRED_COLUMNS - columns)
        if missing:
            return {'valid': False, 'errors': [f'Missing required columns: {", ".join(missing)}'], 'warnings': [], 'rows': 0}
        if require_approval and 'review_status' not in columns:
            errors.append('Missing review_status column; approved training requires an explicit review status for every row.')
        for line, row in enumerate(reader, start=2):
            text = (row.get('text') or '').strip()
            label = (row.get('label') or '').strip().lower()
            split = (row.get('split') or '').strip().lower()
            if len(text) < 20: errors.append(f'Line {line}: text must contain at least 20 characters.')
            if label not in LABELS: errors.append(f'Line {line}: label must be routine, monitor, or prompt.')
            if split not in SPLITS: errors.append(f'Line {line}: split must be train, dev, or test.')
            if require_approval and 'review_status' in columns and (row.get('review_status') or '').strip().lower() != 'approved':
                errors.append(f'Line {line}: review_status must be approved.')
            key = hashlib.sha256(normalized_text(text).encode()).hexdigest()
            seen[key].append((line, split))
            for name, pattern in IDENTIFIER_PATTERNS.items():
                if pattern.search(text): warnings.append(f'Line {line}: possible {name}; perform manual de-identification review.')
            if label in LABELS and split in SPLITS:
                counts[(split, label)] += 1
                split_counts[split] += 1
            rows.append(row)
    for occurrences in seen.values():
        if len(occurrences) > 1:
            locations = ', '.join(f'line {line} ({split or "missing split"})' for line, split in occurrences)
            errors.append(f'Duplicate or punctuation-only variant detected at {locations}.')
    if len(rows) < minimum_rows:
        errors.append(f'Dataset has {len(rows)} rows; at least {minimum_rows} clinician-reviewed rows are required for the prototype experiment.')
    for split in SPLITS:
        for label in LABELS:
            if counts[(split, label)] == 0: errors.append(f'Split {split} has no {label} examples.')
    if rows:
        test_fraction = split_counts['test'] / len(rows)
        dev_fraction = split_counts['dev'] / len(rows)
        if not 0.10 <= test_fraction <= 0.25: warnings.append(f'Test split is {test_fraction:.1%}; target 10–25%.')
        if not 0.10 <= dev_fraction <= 0.25: warnings.append(f'Dev split is {dev_fraction:.1%}; target 10–25%.')
    return {
        'valid': not errors, 'rows': len(rows), 'errors': errors, 'warnings': warnings,
        'counts': {split: {label: counts[(split, label)] for label in LABELS} for split in SPLITS},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description='Validate a governed ClarifyMed follow-up dataset before training.')
    parser.add_argument('--data', required=True, type=Path)
    parser.add_argument('--minimum-rows', type=int, default=200)
    parser.add_argument('--allow-unapproved', action='store_true', help='For workflow testing only; never use for an approved training run.')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = validate_dataset(args.data, args.minimum_rows, not args.allow_unapproved)
    rendered = json.dumps(result, indent=2)
    print(rendered)
    if args.output: args.output.write_text(rendered + '\n', encoding='utf-8')
    return 0 if result['valid'] else 1


if __name__ == '__main__': raise SystemExit(main())
