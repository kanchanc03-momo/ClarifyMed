import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from clarifymed_nlp import BaselineClinicalExtractor


class BaselineClinicalExtractorTests(unittest.TestCase):
    def setUp(self):
        self.extractor = BaselineClinicalExtractor()

    def test_extracts_sections_entities_assertions_and_follow_up(self):
        text = (
            "FINDINGS: There is a 1.2 cm opacity in the right lung. No pleural effusion.\n"
            "IMPRESSION: Small right lung opacity. Follow-up imaging is recommended."
        )
        result = self.extractor.extract(text)

        self.assertTrue(result.quality.processable)
        self.assertEqual([section.name for section in result.sections], ["findings", "impression"])
        self.assertTrue(any(entity.label == "measurement" and entity.text == "1.2 cm" for entity in result.entities))
        self.assertTrue(any(entity.text.lower() == "effusion" and entity.assertion == "absent" for entity in result.entities))
        self.assertEqual(result.follow_up.level, "monitor")
        self.assertEqual(result.follow_up.evidence[0].text.lower(), "follow-up")

    def test_short_or_empty_input_is_flagged(self):
        result = self.extractor.extract("")
        self.assertFalse(result.quality.processable)
        self.assertGreaterEqual(len(result.quality.warnings), 2)

    def test_source_spans_round_trip_to_original_text(self):
        text = "Conclusion: Possible 8 mm nodule in the left lung; prompt review advised."
        result = self.extractor.extract(text)
        for entity in result.entities:
            self.assertEqual(text[entity.start:entity.end], entity.text)
        for evidence in result.follow_up.evidence:
            self.assertEqual(text[evidence.start:evidence.end], evidence.text)


if __name__ == "__main__":
    unittest.main()
