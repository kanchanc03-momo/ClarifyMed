import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import crypto from 'node:crypto';

test('accounts isolate saved reports and support login, deletion, and logout', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'clarifymed-accounts-'));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = 'production';
  const { app, database } = await import('./index.js');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, method = 'GET', body, cookie = '') => fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', Cookie: cookie },
    ...(body && { body: JSON.stringify(body) }),
  });
  try {
    const page = await request('/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root"><\/div>/);
    assert.equal((await request('/api/reports')).status, 401);
    const credentials = { email: 'synthetic-owner@example.test', password: 'synthetic-test-password-123' };
    const register = await request('/api/auth/register', 'POST', credentials);
    assert.equal(register.status, 201);
    assert.match(register.headers.get('set-cookie'), /Secure/);
    const owner = register.headers.get('set-cookie').split(';')[0];
    const second = await request('/api/auth/register', 'POST', { ...credentials, email: 'synthetic-other@example.test' });
    assert.equal(second.status, 201);
    const other = second.headers.get('set-cookie').split(';')[0];
    const report = {
      id: crypto.randomUUID(), name: 'synthetic-report.pdf', documentType: 'text_report',
      title: 'Synthetic example', summary: 'Test summary.', context: 'Test context.',
      finding: 'Source wording.', location: 'Not available', measurement: 'Not available',
      followUpLevel: 'routine', followUpLabel: 'Review', followUpExplanation: 'Test wording.',
      questions: ['Question one?', 'Question two?', 'Question three?'], limitations: 'Synthetic fixture.',
    };
    assert.equal((await request('/api/reports', 'POST', report, owner)).status, 201);
    assert.equal((await (await request('/api/reports', 'GET', null, owner)).json()).length, 1);
    assert.deepEqual(await (await request('/api/reports', 'GET', null, other)).json(), []);
    assert.equal((await request(`/api/reports/${report.id}`, 'GET', null, other)).status, 404);
    assert.equal((await request(`/api/reports/${report.id}`, 'DELETE', null, other)).status, 404);
    assert.equal((await request('/api/reports', 'POST', report, owner)).status, 409);
    assert.equal((await request('/api/auth/logout', 'POST', null, owner)).status, 204);
    assert.equal((await request('/api/reports', 'GET', null, owner)).status, 401);
    assert.equal((await request('/api/auth/login', 'POST', { ...credentials, password: 'incorrect' })).status, 401);
    const login = await request('/api/auth/login', 'POST', credentials);
    assert.equal(login.status, 200);
    const renewed = login.headers.get('set-cookie').split(';')[0];
    const reopened = await (await request(`/api/reports/${report.id}`, 'GET', null, renewed)).json();
    assert.equal(reopened.summary, report.summary);
    assert.equal((await request(`/api/reports/${report.id}`, 'DELETE', null, renewed)).status, 204);
    assert.equal((await request(`/api/reports/${report.id}`, 'GET', null, renewed)).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
