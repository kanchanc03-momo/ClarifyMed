import unittest
from unittest.mock import patch

from ml_service.ner import _assertion, extract_entities
from ml_service.schemas import ExtractedEntity
from ml_service.text_pipeline import analyze_text_report


class TextPipelineTests(unittest.TestCase):
    def test_assertion_scope_and_word_boundaries(self):
        cases = [
            ('No effusion but possible fracture.', 'possible'),
            ('No effusion; fracture is described.', 'present'),
            ('No effusion. Fracture is described.', 'present'),
            ('No effusion however fracture is described.', 'present'),
            ('Chronic fracture is described.', 'present'),
            ('Threshold fracture wording.', 'present'),
            ('History of fracture.', 'historical'),
            ('No evidence of fracture.', 'absent'),
        ]
        for text, expected in cases:
            with self.subTest(text=text):
                self.assertEqual(_assertion(text, text.lower().index('fracture')), expected)

    def test_pipeline_preserves_assertion_and_source_evidence(self):
        for prefix, expected in [('No evidence of', 'no'), ('Possible', 'possible'), ('History of', 'history of')]:
            text = f'{prefix} fracture in wrist. Measurement: 4 mm. Review the source report.'
            def entity(label, term):
                start = text.index(term)
                return ExtractedEntity(label, term, start, start + len(term), 0.99,
                                       assertion=_assertion(text, start))
            with self.subTest(prefix=prefix), \
                 patch('ml_service.text_pipeline.extract_pdf', return_value=(text, 'pdf_text', [])), \
                 patch('ml_service.text_pipeline.extract_entities', return_value=[entity('Disease_disorder', 'fracture'), entity('Organ', 'wrist')]), \
                 patch('ml_service.text_pipeline.classify', return_value=('routine', 0.8, [], 'test_classifier')):
                result = analyze_text_report(b'%PDF-test', 'application/pdf')
                self.assertIn(expected, result.summary)
                self.assertEqual([item.text for item in result.evidence], ['fracture', 'wrist', '4 mm'])
                for item in result.evidence:
                    self.assertEqual(text[item.start:item.end], item.text)
                self.assertEqual(result.to_api_dict()['extractedText'], text)

    def test_ner_attaches_assertion_without_model_download(self):
        text = 'No fracture is reported.'
        with patch('ml_service.ner._pipeline') as model:
            model.return_value.return_value = [dict(entity_group='Disease_disorder', word='fracture', start=3, end=11, score=0.9)]
            entities = extract_entities(text)
        self.assertEqual(entities[0].assertion, 'absent')


if __name__ == '__main__':
    unittest.main()
