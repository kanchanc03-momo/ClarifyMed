import assert from 'node:assert/strict';
import test from 'node:test';

import { detectFileType, parseExplanation, safeFileName, validateExplanation } from './report-validation.js';

const explanation = {
  documentType: 'text_report', title: 'Example finding', summary: 'A source-grounded summary.',
  context: 'General context.', finding: 'opacity', location: 'right lung', measurement: '1.2 cm',
  followUpLevel: 'monitor', followUpLabel: 'Review suggested',
  followUpExplanation: 'The source recommends follow-up.',
  questions: ['What does this mean?', 'Is follow-up needed?', 'What should I watch for?'],
  limitations: 'Synthetic test only.',
};

test('validates a complete explanation', () => assert.equal(validateExplanation(explanation), null));
test('rejects invalid follow-up values', () => assert.match(validateExplanation({ ...explanation, followUpLevel: 'urgent' }), /follow-up level/));
test('rejects malformed model JSON', () => assert.throws(() => parseExplanation('{bad json'), /MODEL_OUTPUT_INVALID/));
test('rejects incomplete local or hosted explanations', () => {
  assert.match(validateExplanation({ ...explanation, summary: '' }), /summary/);
  assert.match(validateExplanation({ ...explanation, questions: ['Only one'] }), /questions/);
});
test('detects file signatures', () => {
  assert.equal(detectFileType(Buffer.from('%PDF-1.7')), 'application/pdf');
  assert.equal(detectFileType(Buffer.from([0xff, 0xd8, 0xff])), 'image/jpeg');
});
test('sanitizes upload names', () => assert.equal(safeFileName('../report\u0000.pdf'), '.._report.pdf'));
