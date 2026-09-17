import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { checkHealth } from './healthcheck.mjs';

test('container health requires both processes and a configured report provider', async () => {
  let api = { ok: true, configured: true };
  let ml = { ok: true, xrayModelReady: false };
  let mlStatus = 200;
  const server = http.createServer((request, response) => {
    response.writeHead(request.url === '/health' ? mlStatus : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(request.url === '/health' ? ml : api));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const options = { apiUrl: base, mlUrl: base };
  try {
    assert.equal((await checkHealth(options)).ml.xrayModelReady, false);
    mlStatus = 503;
    await assert.rejects(checkHealth(options));
    mlStatus = 200;
    ml = { ok: false };
    await assert.rejects(checkHealth(options));
    ml = { ok: true };
    api = { ok: true, configured: false };
    await assert.rejects(checkHealth(options));
    await assert.rejects(checkHealth({ ...options, mlUrl: 'http://127.0.0.1:1' }));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
