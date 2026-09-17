"""FracAtlas image-level research baseline; not a clinically validated model."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.model_selection import train_test_split

LABELS = ['non_fractured', 'fractured']
SCOPE = 'FracAtlas musculoskeletal fracture classification only'
LIMITATIONS = ('Research prototype. Splits isolate identical decoded images, not patients: '
               'patient identifiers are unavailable in dataset.csv. Near-duplicate and patient '
               'leakage remain possible. Non-fractured does not mean normal. '
               'No external clinical validation; Grad-CAM is not confirmed fracture localization.')


def prepare_dataset(root: Path, seed: int = 42, skip_unreadable: bool = False, exclusions: list | None = None):
    exclusions = exclusions if exclusions is not None else []
    root = root.resolve()
    with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        if not {'image_id', 'fractured'} <= set(reader.fieldnames or []):
            raise ValueError('dataset.csv needs image_id and fractured columns.')
        rows = list(reader)
    if not rows:
        raise ValueError('Dataset is empty.')
    images = defaultdict(list)
    for path in (root / 'images').rglob('*'):
        if path.is_file():
            images[path.name].append(path)
    seen, groups = set(), defaultdict(list)
    for index, row in enumerate(rows):
        name = row['image_id']
        if name in seen or not images[name]:
            raise ValueError(f'Duplicate metadata, missing or ambiguous image: {name}')
        seen.add(name)
        if row['fractured'] not in ('0', '1'):
            raise ValueError(f'Invalid fractured label: {name}')
        candidates = sorted(images[name])
        if len(candidates) > 1:
            hashes = {hashlib.sha256(candidate.read_bytes()).hexdigest() for candidate in candidates}
            if len(hashes) != 1:
                raise ValueError(f'Ambiguous different images share a filename: {name}')
            print(f'Using CSV label for {name}; {len(candidates)} identical file copies counted once.', flush=True)
        path = candidates[0].resolve()
        if not path.is_relative_to(root):
            raise ValueError('Image path escapes dataset root.')
        try:
            with Image.open(path) as image:
                rgb = image.convert('RGB')
                rgb.load()
                digest = hashlib.sha256(str(rgb.size).encode() + rgb.tobytes()).hexdigest()
        except OSError as error:
            exclusions.append({'image_id': name, 'label': int(row['fractured']), 'reason': str(error)})
            if skip_unreadable:
                print(f'Excluded unreadable image: {name}: {error}', flush=True)
                continue
            raise ValueError(f'Unreadable or truncated image {name}: {error}. Re-extract the original download or obtain a clean copy; do not enable truncated-image loading.') from error
        record = {'image_id': name, 'path': path.relative_to(root).as_posix(),
                  'label': int(row['fractured']), 'pixel_sha256': digest, 'identical_file_copies': len(candidates),
                  'body_parts': [part for part in ('hand', 'leg', 'hip', 'shoulder') if row.get(part) == '1']}
        groups[digest].append(record)
        if (index + 1) % 500 == 0:
            print(f'Validated {index + 1}/{len(rows)} images', flush=True)
    if len(exclusions) / len(rows) > .01:
        raise ValueError(f'{len(exclusions)}/{len(rows)} images are unreadable (over 1%). Obtain a clean dataset ZIP before training. See data_validation.json.')
    if any(len({r['label'] for r in group}) != 1 for group in groups.values()):
        raise ValueError('Identical images have conflicting labels.')
    keys = sorted(groups)
    labels = [groups[key][0]['label'] for key in keys]
    train, heldout = train_test_split(keys, test_size=.30, stratify=labels, random_state=seed)
    dev, test = train_test_split(heldout, test_size=.50,
                               stratify=[groups[key][0]['label'] for key in heldout], random_state=seed)
    splits = {name: [row for key in selected for row in groups[key]]
              for name, selected in [('train', train), ('dev', dev), ('test', test)]}
    for name, records in splits.items():
        if {row['label'] for row in records} != {0, 1}:
            raise ValueError(f'{name} needs both classes.')
    return splits


def metrics(truth, probabilities):
    from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, average_precision_score
    truth, probabilities = np.asarray(truth), np.asarray(probabilities)
    predicted = (probabilities >= .5).astype(int)
    confidence = np.maximum(probabilities, 1 - probabilities)
    error = 0.
    for index in range(10):
        mask = (confidence >= index / 10) & (confidence < (index + 1) / 10 if index < 9 else confidence <= 1)
        if mask.any():
            error += float(mask.mean() * abs((predicted[mask] == truth[mask]).mean() - confidence[mask].mean()))
    return {'count': len(truth), 'roc_auc': float(roc_auc_score(truth, probabilities)) if len(set(truth)) == 2 else None,
            'average_precision': float(average_precision_score(truth, probabilities)) if len(set(truth)) == 2 else None,
            'classification_report': classification_report(truth, predicted, labels=[0, 1], target_names=LABELS, output_dict=True, zero_division=0),
            'confusion_matrix': confusion_matrix(truth, predicted, labels=[0, 1]).tolist(),
            'expected_calibration_error': error, 'brier_score': float(np.mean((probabilities - truth) ** 2))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-root', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--epochs', type=int, default=8)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--validate-only', action='store_true')
    parser.add_argument('--skip-unreadable', action='store_true', help='Record and exclude unreadable files, stopping if more than 1 percent are unreadable.')
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1:
        raise ValueError('epochs and batch-size must be positive.')
    if args.output_dir.exists():
        raise FileExistsError('Use a new output directory to preserve previous runs.')
    args.output_dir.mkdir(parents=True)
    exclusions = []
    try:
        splits = prepare_dataset(args.data_root, args.seed, args.skip_unreadable, exclusions)
    except (ValueError, OSError) as error:
        (args.output_dir / 'data_validation.json').write_text(json.dumps({'valid': False, 'error': str(error), 'excluded_images': exclusions}, indent=2), encoding='utf-8')
        raise
    (args.output_dir / 'data_validation.json').write_text(json.dumps({'valid': True, 'excluded_images': exclusions}, indent=2), encoding='utf-8')
    manifest = {'seed': args.seed, 'split_method': '70/15/15 stratified decoded-image-hash groups; custom classification split',
                'limitations': LIMITATIONS, 'dataset_csv_sha256': hashlib.sha256((args.data_root / 'dataset.csv').read_bytes()).hexdigest(),
                'excluded_images': exclusions, 'counts': {name: dict(Counter(LABELS[r['label']] for r in rows)) for name, rows in splits.items()}, 'splits': splits}
    manifest_path = args.output_dir / 'split_manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest['counts'], indent=2), flush=True)
    if args.validate_only:
        print('Dataset validation complete. No model trained.', flush=True)
        return

    import torch
    import torchvision
    import sklearn
    from torch import nn
    from torch.utils.data import Dataset, DataLoader
    from torchvision import models, transforms
    if not torch.cuda.is_available():
        raise RuntimeError('Select a GPU in Colab: Runtime > Change runtime type, then rerun with a new output directory.')
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed); torch.cuda.manual_seed_all(args.seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    normalize = transforms.Normalize([.485, .456, .406], [.229, .224, .225])
    evaluation_transform = transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor(), normalize])
    training_transform = transforms.Compose([transforms.Resize((224, 224)), transforms.RandomRotation(7), transforms.ToTensor(), normalize])

    class Images(Dataset):
        def __init__(self, rows, transform):
            self.rows, self.transform = rows, transform
        def __len__(self):
            return len(self.rows)
        def __getitem__(self, index):
            row = self.rows[index]
            with Image.open(args.data_root / row['path']) as image:
                tensor = self.transform(image.convert('RGB'))
            return tensor, row['label']

    loaders = {name: DataLoader(Images(rows, training_transform if name == 'train' else evaluation_transform),
                batch_size=args.batch_size, shuffle=name == 'train', num_workers=0, pin_memory=True)
               for name, rows in splits.items()}
    model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)
    model.classifier[1] = nn.Linear(model.last_channel, 2)
    model.cuda()
    counts = Counter(row['label'] for row in splits['train'])
    class_weights = torch.tensor([len(splits['train']) / (2 * counts[i]) for i in range(2)], device='cuda')
    loss_fn = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-4)
    best_loss, history = float('inf'), []
    checkpoint_path = args.output_dir / 'model.pt'
    for epoch in range(args.epochs):
        losses = {}
        for phase in ['train', 'dev']:
            model.train(phase == 'train')
            total, denominator = 0., 0.
            for batch_index, (images, labels) in enumerate(loaders[phase]):
                images, labels = images.cuda(), labels.cuda()
                with torch.set_grad_enabled(phase == 'train'):
                    if phase == 'train':
                        optimizer.zero_grad(set_to_none=True)
                    loss = loss_fn(model(images), labels)
                    if phase == 'train':
                        loss.backward(); optimizer.step()
                weight_sum = class_weights[labels].sum().item()
                total += loss.item() * weight_sum
                denominator += weight_sum
                if phase == 'train' and (batch_index + 1) % 20 == 0:
                    print(f'Epoch {epoch + 1}/{args.epochs}: batch {batch_index + 1}/{len(loaders[phase])}', flush=True)
            losses[phase] = total / denominator
        history.append({'epoch': epoch + 1, **losses})
        if losses['dev'] < best_loss:
            best_loss = losses['dev']
            checkpoint = {'state_dict': {k: v.detach().cpu().clone() for k, v in model.state_dict().items()},
                          'architecture': 'mobilenet_v2', 'dataset': 'FracAtlas', 'labels': LABELS, 'scope': SCOPE,
                          'image_size': 224, 'normalization_mean': [.485, .456, .406], 'normalization_std': [.229, .224, .225],
                          'threshold': .5, 'best_epoch': epoch + 1, 'seed': args.seed, 'clinically_validated': False}
            temporary = args.output_dir / 'model.tmp'
            torch.save(checkpoint, temporary)
            temporary.replace(checkpoint_path)
        (args.output_dir / 'training_history.json').write_text(json.dumps(history, indent=2), encoding='utf-8')
        print(f'Epoch {epoch + 1}: train={losses["train"]:.4f}, dev={losses["dev"]:.4f}; best checkpoint saved', flush=True)

    checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=True)
    model.load_state_dict(checkpoint['state_dict']); model.eval()
    truth, probabilities = [], []
    with torch.inference_mode():
        for images, labels in loaders['test']:
            probabilities.extend(torch.softmax(model(images.cuda()), dim=1)[:, 1].cpu().tolist())
            truth.extend(labels.tolist())
    result = {'dataset': 'FracAtlas', 'labels': LABELS, 'threshold': .5, 'best_epoch': checkpoint['best_epoch'],
              'epochs_requested': args.epochs, 'seed': args.seed, 'test_metrics': metrics(truth, probabilities),
              'split_counts': manifest['counts'], 'limitations': LIMITATIONS,
              'versions': {'torch': str(torch.__version__), 'torchvision': str(torchvision.__version__), 'scikit_learn': sklearn.__version__, 'numpy': np.__version__},
              'model_sha256': hashlib.sha256(checkpoint_path.read_bytes()).hexdigest(),
              'manifest_sha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest()}
    result['test_by_body_part'] = {}
    for part in ('hand', 'leg', 'hip', 'shoulder'):
        selected = [i for i, row in enumerate(splits['test']) if part in row['body_parts']]
        if selected:
            result['test_by_body_part'][part] = metrics([truth[i] for i in selected], [probabilities[i] for i in selected])
    (args.output_dir / 'evaluation.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    predictions = [{'image_id': row['image_id'], 'label': label, 'fracture_score': score}
                   for row, label, score in zip(splits['test'], truth, probabilities)]
    (args.output_dir / 'test_predictions.json').write_text(json.dumps(predictions, indent=2), encoding='utf-8')
    (args.output_dir / 'MODEL_CARD.md').write_text('# ClarifyMed FracAtlas MobileNetV2\n\n' + LIMITATIONS +
        '\n\nImageNet transfer learning; weighted cross-entropy from training counts; checkpoint selected by development loss. Fixed threshold 0.5. '
        'Custom classification splits differ from the supplied fracture-only localization splits. See evaluation.json for actual results. '
        'Scores are uncalibrated model outputs.\n\nDataset attribution: Abedeen et al., Scientific Data 10, 521 (2023). '
        'https://www.nature.com/articles/s41597-023-02432-4 ; dataset https://doi.org/10.6084/m9.figshare.22363012 ; '
        'CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ . Images resized and augmented for training.\n', encoding='utf-8')
    print(json.dumps(result['test_metrics'], indent=2), flush=True)
    print(f'Training complete. Artifacts: {args.output_dir}', flush=True)


if __name__ == '__main__':
    main()
