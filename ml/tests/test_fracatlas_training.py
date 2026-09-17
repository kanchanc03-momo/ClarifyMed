import csv
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from ml.training.train_fracatlas import prepare_dataset, metrics


class FracAtlasTrainingTests(unittest.TestCase):
    def make_dataset(self, root):
        (root / 'images').mkdir()
        rows = []
        for index in range(40):
            name = f'image{index}.png'
            Image.new('RGB', (8, 8), color=(index, 0, 0)).save(root / 'images' / name)
            rows.append({'image_id': name, 'fractured': str(index % 2)})
        Image.new('RGB', (8, 8), color=(0, 0, 0)).save(root / 'images' / 'duplicate.png')
        rows.append({'image_id': 'duplicate.png', 'fractured': '0'})
        with (root / 'dataset.csv').open('w', newline='') as target:
            writer = csv.DictWriter(target, fieldnames=['image_id', 'fractured'])
            writer.writeheader(); writer.writerows(rows)

    def test_duplicate_images_stay_together_and_splits_are_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_dataset(root)
            splits = prepare_dataset(root)
            self.assertEqual(splits, prepare_dataset(root))
            seen = set()
            for rows in splits.values():
                hashes = {r['pixel_sha256'] for r in rows}
                self.assertFalse(seen & hashes)
                seen |= hashes
                self.assertEqual({r['label'] for r in rows}, {0, 1})
            self.assertEqual(sum(map(len, splits.values())), 41)

    def test_missing_image_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_dataset(root)
            (root / 'images' / 'image0.png').unlink()
            with self.assertRaisesRegex(ValueError, 'missing'):
                prepare_dataset(root)

    def test_unreadable_images_are_audited_and_excess_damage_stops_training(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_dataset(root)
            (root / 'images' / 'image1.png').write_bytes(b'invalid')
            exclusions = []
            with self.assertRaisesRegex(ValueError, 'over 1%'):
                prepare_dataset(root, skip_unreadable=True, exclusions=exclusions)
            self.assertEqual(exclusions[0]['image_id'], 'image1.png')

    def test_identical_filename_copies_use_csv_label_once(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_dataset(root)
            extra = root / 'images' / 'extra'
            extra.mkdir()
            (extra / 'image0.png').write_bytes((root / 'images' / 'image0.png').read_bytes())
            splits = prepare_dataset(root)
            rows = [r for records in splits.values() for r in records if r['image_id'] == 'image0.png']
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['identical_file_copies'], 2)
            self.assertEqual(rows[0]['label'], 0)

    def test_different_images_with_same_filename_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_dataset(root)
            extra = root / 'images' / 'extra'
            extra.mkdir()
            Image.new('RGB', (8, 8), color=(255, 0, 0)).save(extra / 'image0.png')
            with self.assertRaisesRegex(ValueError, 'Ambiguous'):
                prepare_dataset(root)

    def test_conflicting_duplicate_labels_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_dataset(root)
            path = root / 'dataset.csv'
            path.write_text(path.read_text().replace('duplicate.png,0', 'duplicate.png,1'))
            with self.assertRaisesRegex(ValueError, 'conflicting'):
                prepare_dataset(root)

    def test_metrics_keep_both_classes_when_predictions_are_constant(self):
        result = metrics([0, 1], [.1, .1])
        self.assertEqual(result['confusion_matrix'], [[1, 0], [1, 0]])
        self.assertEqual(result['classification_report']['fractured']['recall'], 0)
