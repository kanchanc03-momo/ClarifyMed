import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

for (const provider of ['local', 'groq']) test(`forwards ${provider === 'local' ? 'reports' : 'X-rays with a hosted report provider'} to local ML`, async () => {
  const explanation = {
    documentType: provider === 'local' ? 'scanned_report' : 'xray', title: 'Example report', summary: 'A source-grounded summary.',
    context: 'General context.', finding: 'No acute fracture.', location: 'right wrist',
    measurement: 'Not available', followUpLevel: 'routine', followUpLabel: 'Routine review',
    followUpExplanation: 'The report contains no prompt follow-up wording.',
    questions: ['What does this mean?', 'Is follow-up needed?', 'What should I watch for?'],
    limitations: 'Synthetic integration-test response.',
  };
  let forwardedBody = '';
  const mlServer = http.createServer(async (request, response) => {
    for await (const chunk of request) forwardedBody += chunk.toString();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(explanation));
  });
  const mlPort = await listen(mlServer);
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'clarifymed-test-'));

  process.env.ANALYSIS_PROVIDER = provider;
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${mlPort}`;
  process.env.DATA_DIR = dataDirectory;

  const { app, database } = await import(`./index.js?integration=${Date.now()}`);
  const apiServer = http.createServer(app);
  const apiPort = await listen(apiServer);

  try {
    const form = new FormData();
    form.append('report', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'report.jpg');
    form.append('input_type', provider === 'local' ? 'report' : 'xray');
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/analyze`, { method: 'POST', body: form });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.documentType, explanation.documentType);
    assert.equal(payload.summary, explanation.summary);
    assert.match(payload.id, /^[0-9a-f-]{36}$/i);
    assert.match(forwardedBody, provider === 'local' ? /\r\nreport\r\n/ : /\r\nxray\r\n/);

    if (provider === 'groq') {
      const pdf = new FormData();
      pdf.append('report', new Blob(['%PDF-1.7\n'], { type: 'application/pdf' }), 'xray.pdf');
      pdf.append('input_type', 'xray');
      assert.equal((await fetch(`http://127.0.0.1:${apiPort}/api/analyze`, { method: 'POST', body: pdf })).status, 422);
    }
  } finally {
    await close(apiServer);
    await close(mlServer);
    database.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
