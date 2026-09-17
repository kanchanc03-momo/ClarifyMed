import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisErrorResponse } from './analysis-errors.js';

test('distinguishes actionable analysis failures without leaking upstream content', () => {
  for (const [error, status, code] of [
    [{ status: 401, message: 'private upstream payload' }, 503, 'PROVIDER_AUTH_FAILED'],
    [{ status: 429 }, 429, 'PROVIDER_RATE_LIMIT'],
    [{ name: 'APIUserAbortError' }, 504, 'ANALYSIS_TIMEOUT'],
    [{ message: 'MODEL_OUTPUT_TRUNCATED' }, 502, 'MODEL_OUTPUT_TRUNCATED'],
    [{ message: 'MODEL_OUTPUT_INVALID' }, 502, 'MODEL_OUTPUT_INVALID'],
  ]) {
    const result = analysisErrorResponse(error);
    assert.equal(result.status, status);
    assert.equal(result.code, code);
    assert.doesNotMatch(result.error, /private upstream payload/);
  }
});
