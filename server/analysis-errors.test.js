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

test('reports the provider retry delay when it is supplied', () => {
  const result = analysisErrorResponse({ status: 429, headers: { 'retry-after': '17.2' } });
  assert.equal(result.retryAfter, 18);
  assert.match(result.error, /18 seconds/);
});

test('uses provider reset headers and does not mistake a temporary limit for exhausted usage', () => {
  const result = analysisErrorResponse({ status: 429, headers: { 'x-ratelimit-reset-tokens': '1m0s' } });
  assert.equal(result.retryAfter, 60);
  assert.match(result.error, /temporarily rate-limited/);
  assert.doesNotMatch(result.error, /usage limit/);
});
