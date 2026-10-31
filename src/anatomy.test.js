import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAnatomy } from './anatomy.js';

test('maps an explicitly sided location', () => assert.deepEqual(mapAnatomy('lower right lung'), { terms: ['right lung', 'right chest'], x: 94, y: 112, label: 'Right chest' }));
test('maps ophthalmology retinal location', () => assert.equal(mapAnatomy('bilateral diabetic retina with microaneurysms').label, 'Eyes / retina'));
test('maps right eye location', () => assert.equal(mapAnatomy('right eye fundus examination').label, 'Right eye / retina'));
test('does not mistake a humeral head for the brain', () => assert.equal(mapAnatomy('right humeral head').label, 'Right upper arm / shoulder'));
test('does not invent a location for missing extraction', () => assert.equal(mapAnatomy('Not reliably extracted'), null));
