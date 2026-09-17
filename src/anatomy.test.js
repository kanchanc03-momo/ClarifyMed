import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAnatomy } from './anatomy.js';

test('maps an explicitly sided location', () => assert.deepEqual(mapAnatomy('lower right lung'), { terms: ['right lung', 'right chest'], x: 126, y: 112, label: 'Right chest' }));
test('does not invent a location for missing extraction', () => assert.equal(mapAnatomy('Not reliably extracted'), null));
