import csv
import json
import tempfile
import unittest
from pathlib import Path

import joblib

from ml.training.train_basic_severity import train_and_evaluate


class BasicSeverityTrainingTests(unittest.TestCase):
    def make_dataset(self, path):
        with path.open('w', encoding='utf-8', newline='') as target:
            writer = csv.DictWriter(target, fieldnames=['text', 'label', 'split', 'review_status'])
            writer.writeheader()
            for split, count in [('train', 50), ('dev', 10), ('test', 10)]:
                for label in ['routine', 'monitor', 'prompt']:
                    for index in range(count):
                        writer.writerow(dict(text=f'{label} source wording example {index} {split}only', label=label, split=split, review_status='approved'))

    def test_training_preserves_holdouts_and_exports_reloadable_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_dataset(root / 'data.csv')
            output = root / 'model'
            result = train_and_evaluate(root / 'data.csv', output)
            model = joblib.load(output / 'model.joblib')
            vocabulary = model.named_steps['tfidf'].vocabulary_
            self.assertNotIn('devonly', vocabulary)
            self.assertNotIn('testonly', vocabulary)
            self.assertEqual(result['fit_split'], 'train')
            self.assertEqual(len(result['dataset_sha256']), 64)
            self.assertEqual(json.loads((output / 'evaluation.json').read_text())['model_sha256'], result['model_sha256'])
            self.assertTrue(0 <= result['expected_calibration_error'] <= 1)
            with self.assertRaises(FileExistsError):
                train_and_evaluate(root / 'data.csv', output)

    def test_invalid_data_does_not_write_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data.csv').write_text('text,label,split\nInvalid,bad,train\n')
            with self.assertRaisesRegex(ValueError, 'Dataset validation failed'):
                train_and_evaluate(root / 'data.csv', root / 'model')
            self.assertFalse((root / 'model').exists())
