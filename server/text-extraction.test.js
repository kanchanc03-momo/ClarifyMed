import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExtractedText } from './text-extraction.js';

test('rejects unreadable, missing, and oversized transcriptions', () => {
  assert.equal(validateExtractedText('[unreadable] [unreadable]'), false);
  assert.equal(validateExtractedText(undefined), false);
  assert.equal(validateExtractedText('x'.repeat(100001)), false);
  assert.equal(validateExtractedText('Hemoglobin: 13.5 g/dL. Reference range: 12-16 g/dL.'), true);
});
