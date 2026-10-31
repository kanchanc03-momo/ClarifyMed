import test from 'node:test';
import assert from 'node:assert/strict';
import { xrayExplanation, reportDisagreesWithXray, DETECTION_EXPLANATION, NO_DETECTION_EXPLANATION, DISAGREEMENT_EXPLANATION } from './xray-result.js';

test('detection explanation uses structured regions, never arbitrary summary text', () => {
  assert.equal(xrayExplanation({ detections: [{ confidence: .84, boundingBox: { xMin: 1, yMin: 2, xMax: 3, yMax: 4 } }], summary: 'unsupported diagnosis' }), DETECTION_EXPLANATION);
});

test('no detection includes the injury warning', () => {
  assert.equal(xrayExplanation({ detections: [], summary: 'normal X-ray' }), NO_DETECTION_EXPLANATION);
});

test('report only has no X-ray comparison', () => {
  assert.equal(reportDisagreesWithXray({ finding: 'Distal radius fracture' }, { detections: [{ confidence: .8 }] }), false);
});

test('combined report and X-ray identifies explicit disagreement without claiming agreement', () => {
  assert.equal(reportDisagreesWithXray({ finding: 'Distal radius fracture' }, { detections: [] }), true);
  assert.equal(reportDisagreesWithXray({ finding: 'No acute fracture' }, { detections: [{ confidence: .8 }] }), true);
  assert.equal(reportDisagreesWithXray({ finding: 'Soft tissue swelling' }, { detections: [] }), false);
  assert.equal(DISAGREEMENT_EXPLANATION, 'The written report and research model produced different information. Rely on a qualified clinician and the official radiology report.');
});
