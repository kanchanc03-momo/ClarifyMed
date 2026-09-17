import csv
import tempfile
import unittest
from pathlib import Path

from ml.training.validate_severity_dataset import validate_dataset


class SeverityDatasetValidationTests(unittest.TestCase):
    def test_requires_review_status_column_for_approved_training(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'severity.csv'
            path.write_text('text,label,split\nA sufficiently long source report.,routine,train\n')
            result = validate_dataset(path, minimum_rows=1)
            self.assertTrue(any('Missing review_status' in error for error in result['errors']))

    def write_rows(self, rows):
        directory = tempfile.TemporaryDirectory()
        path = Path(directory.name) / 'severity.csv'
        with path.open('w', encoding='utf-8', newline='') as target:
            writer = csv.DictWriter(target, fieldnames=('text', 'label', 'split', 'review_status'))
            writer.writeheader(); writer.writerows(rows)
        return directory, path

    def test_accepts_reviewed_balanced_dataset(self):
        rows = [{'text': f'Unique approved report wording number {index} for review.', 'label': label, 'split': split, 'review_status': 'approved'} for index, (split, label) in enumerate((s, l) for s in ('train', 'dev', 'test') for l in ('routine', 'monitor', 'prompt'))]
        directory, path = self.write_rows(rows)
        try: self.assertTrue(validate_dataset(path, minimum_rows=9)['valid'])
        finally: directory.cleanup()

    def test_rejects_duplicate_leakage_and_unapproved_rows(self):
        rows = [{'text': 'The same report wording appears in two splits.', 'label': 'routine', 'split': 'train', 'review_status': 'approved'}, {'text': 'The same report wording appears in two splits!', 'label': 'monitor', 'split': 'test', 'review_status': 'pending'}]
        directory, path = self.write_rows(rows)
        try:
            result = validate_dataset(path, minimum_rows=2)
            self.assertFalse(result['valid']); self.assertTrue(any('Duplicate' in error for error in result['errors'])); self.assertTrue(any('review_status' in error for error in result['errors']))
        finally: directory.cleanup()


if __name__ == '__main__': unittest.main()
