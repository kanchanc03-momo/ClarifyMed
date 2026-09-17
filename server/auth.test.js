import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, normalizeEmail, parseCookies, sessionCookie, validateCredentials, verifyPassword } from './auth.js';

test('normalizes and validates account credentials', () => {
  assert.equal(normalizeEmail('  Person@Example.COM '), 'person@example.com');
  assert.equal(validateCredentials('person@example.com', 'a-long-password'), null);
  assert.match(validateCredentials('invalid', 'a-long-password'), /valid email/);
  assert.match(validateCredentials('person@example.com', 'short'), /12 characters/);
});

test('hashes and verifies passwords without storing plaintext', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.equal(stored.includes('correct horse'), false);
  assert.equal(verifyPassword('correct horse battery staple', stored), true);
  assert.equal(verifyPassword('incorrect password', stored), false);
});

test('creates strict HTTP-only session cookies', () => {
  assert.equal(parseCookies('theme=light; clarifymed_session=abc').clarifymed_session, 'abc');
  assert.match(sessionCookie('abc', true), /HttpOnly/);
  assert.match(sessionCookie('abc', true), /SameSite=Strict/);
  assert.match(sessionCookie('abc', true), /Secure/);
});
