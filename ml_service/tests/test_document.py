import unittest
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image
from ml_service.document import extract_pdf


class DocumentExtractionTests(unittest.TestCase):
    def document(self, texts):
        buffer = BytesIO()
        Image.new('RGB', (10, 10), 'white').save(buffer, format='PNG')
        pages = [SimpleNamespace(get_text=lambda _kind, text=text: text,
                                 get_pixmap=lambda **kwargs: SimpleNamespace(tobytes=lambda _kind: buffer.getvalue())) for text in texts]
        class Document(list):
            page_count = len(texts)
            def close(self):
                pass
        return Document(pages)

    def test_mixed_pdf_uses_ocr_for_all_pages(self):
        document = self.document(['Readable report text. ' * 20, ''])
        fake_fitz = SimpleNamespace(open=lambda **kwargs: document, Matrix=lambda *args: args)
        with patch.dict('sys.modules', {'fitz': fake_fitz}), patch('ml_service.document._ocr_images', return_value='Both pages transcribed.') as ocr:
            text, method, warnings = extract_pdf(b'fixture')
            self.assertEqual(method, 'pdf_ocr')
            self.assertEqual(len(ocr.call_args.args[0]), 2)
            self.assertTrue(warnings)

    def test_readable_pdf_does_not_need_ocr(self):
        document = self.document(['Readable report text. ' * 5, 'Second report page. ' * 5])
        with patch.dict('sys.modules', {'fitz': SimpleNamespace(open=lambda **kwargs: document)}), patch('ml_service.document._ocr_images') as ocr:
            text, method, warnings = extract_pdf(b'fixture')
            self.assertEqual(method, 'pdf_text')
            self.assertIn('Second report page.', text)
            ocr.assert_not_called()
