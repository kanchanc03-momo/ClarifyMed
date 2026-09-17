import unittest

import numpy as np

from ml.training.train_mura import aggregate_studies, body_part, label_from_path, patient_key, split_train, study_key


class MuraTrainingTests(unittest.TestCase):
    paths = [
        "train/XR_WRIST/patient00001/study1_positive/image1.png",
        "train/XR_WRIST/patient00001/study1_positive/image2.png",
        "train/XR_WRIST/patient00001/study2_negative/image1.png",
        "train/XR_ELBOW/patient00002/study1_negative/image1.png",
        "train/XR_HAND/patient00003/study1_positive/image1.png",
        "train/XR_HAND/patient00004/study1_negative/image1.png",
    ]

    def test_parses_official_mura_path_metadata(self):
        path = self.paths[0]
        self.assertEqual(patient_key(path), "patient00001")
        self.assertEqual(study_key(path), "train/XR_WRIST/patient00001/study1_positive")
        self.assertEqual(body_part(path), "WRIST")
        self.assertEqual(label_from_path(path), 1)

    def test_development_split_has_no_patient_leakage(self):
        train, development = split_train(self.paths, seed=42, dev_fraction=0.5)
        self.assertTrue(train)
        self.assertTrue(development)
        self.assertFalse({patient_key(path) for path in train} & {patient_key(path) for path in development})

    def test_aggregates_multiple_images_at_study_level(self):
        rows = aggregate_studies(np.asarray([0.8, 0.6, 0.2]), np.asarray([1, 1, 0]), self.paths[:3])
        self.assertEqual(len(rows), 2)
        self.assertAlmostEqual(rows[0][1], 0.7)
        self.assertEqual(rows[0][2], 1)


if __name__ == "__main__":
    unittest.main()
