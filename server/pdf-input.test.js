import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { buildReportContent, PdfInputError, renderPdfPages } from './pdf-input.js';

// Tiny synthetic PDF, with distinct pages to check ordering and actual rendering.
function fixture(pageCount = 2, scanned = false, withText = false) {
  const canvas = createCanvas(100, 100);
  const context = canvas.getContext('2d');
  context.fillStyle = 'blue';
  context.fillRect(0, 0, 100, 100);
  const jpeg = canvas.toBuffer('image/jpeg');
  const imageId = 3 + 2 * pageCount;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({ length: pageCount }, (_, i) => `${3 + 2 * i} 0 R`).join(' ')}] >>`,
  ];
  for (let i = 0; i < pageCount; i++) {
    const drawing = scanned ? 'q 100 0 0 100 0 0 cm /Scan Do Q' : withText
      ? `BT /F1 2 Tf 2 90 Td (Page ${i + 1}.) Tj ${'0 -4 Td (Synthetic report: No fracture. Follow-up recommended.) Tj '.repeat(5)} ET`
      : `${i % 2 ? '0 1 0' : '1 0 0'} rg 0 0 100 100 re f`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << ${scanned ? `/XObject << /Scan ${imageId} 0 R >>` : withText ? `/Font << /F1 ${imageId} 0 R >>` : ''} >> /Contents ${4 + 2 * i} 0 R >>`);
    objects.push(`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`);
  }
  if (scanned) objects.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from('\nendstream')]));
  else if (withText) objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const chunks = [Buffer.from('%PDF-1.7\n')];
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${i + 1} 0 obj\n`), Buffer.from(object), Buffer.from('\nendobj\n'));
  }
  const xref = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return Buffer.concat(chunks);
}

test('renders all PDF pages in order into readable JPEGs', async () => {
  const pages = await renderPdfPages(fixture());
  assert.equal(pages.length, 2);
  for (const [index, page] of pages.entries()) {
    const image = await loadImage(Buffer.from(page.split(',')[1], 'base64'));
    assert.equal(image.width, 200);
    const canvas = createCanvas(200, 200);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixel = context.getImageData(50, 50, 1, 1).data;
    assert.ok(pixel[index] > 240, 'page color and order should be preserved');
    assert.ok(pixel[1 - index] < 15);
  }
});

test('supports scanned PDFs with embedded page images', async () => {
  const pages = await renderPdfPages(fixture(1, true));
  const image = await loadImage(Buffer.from(pages[0].split(',')[1], 'base64'));
  const context = createCanvas(200, 200).getContext('2d');
  context.drawImage(image, 0, 0);
  assert.ok(context.getImageData(50, 50, 1, 1).data[2] > 240);
});

test('rejects corrupt and over-limit PDFs without silently dropping pages', async () => {
  await assert.rejects(renderPdfPages(Buffer.from('%PDF-broken')), PdfInputError);
  await assert.rejects(renderPdfPages(fixture(6)), /up to 5 pages/);
  await assert.rejects(renderPdfPages(fixture(4), { maxPages: 3 }), /up to 3 pages/);
});

test('stops PDF processing when its timeout expires', async () => {
  await assert.rejects(renderPdfPages(fixture(), { timeoutMs: 1 }), /too long/);
});

test('builds one Groq report request containing every PDF page', async () => {
  const content = await buildReportContent({ buffer: fixture(), mimetype: 'application/pdf', originalname: 'report.pdf' }, 'groq', 'qwen/qwen3.6-27b');
  assert.equal(content.filter(item => item.type === 'input_image').length, 2);
  assert.equal(content.filter(item => item.type === 'input_file').length, 0);
  assert.match(content[0].text, /one combined explanation/);
  assert.match(content[3].text, /page 2 of 2/);
});

test('keeps direct PDF and JPG inputs for existing routes', async () => {
  const pdf = { buffer: fixture(), mimetype: 'application/pdf', originalname: 'report.pdf' };
  assert.equal((await buildReportContent(pdf, 'openai'))[1].type, 'input_file');
  const jpg = { buffer: Buffer.from([255, 216, 255]), mimetype: 'image/jpeg' };
  assert.equal((await buildReportContent(jpg, 'groq'))[1].image_url, 'data:image/jpeg;base64,/9j/');
});

test('extracts text from every readable PDF page instead of spending image tokens', async () => {
  const content = await buildReportContent({ buffer: fixture(2, false, true), mimetype: 'application/pdf' }, 'groq');
  assert.equal(content.length, 1);
  assert.equal(content[0].type, 'input_text');
  assert.match(content[0].text, /Page 1 of 2/);
  assert.match(content[0].text, /Page 2 of 2/);
  assert.match(content[0].text, /No fracture/);
});

test('PDF upload API sends page images to Groq and returns the combined report', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'clarifymed-pdf-test-'));
  process.env.ANALYSIS_PROVIDER = 'groq';
  process.env.GROQ_API_KEY = 'synthetic-test-key';
  process.env.GROQ_MODEL = 'qwen/qwen3.6-27b';
  process.env.DATA_DIR = directory;
  const explanation = {
    documentType: 'scanned_report', title: 'Synthetic report', summary: 'Both pages reviewed.',
    context: 'Test context.', finding: 'Test finding.', location: 'Test location.',
    measurement: 'Not specified', followUpLevel: 'routine', followUpLabel: 'Routine discussion',
    followUpExplanation: 'Test wording.', questions: ['Question one?', 'Question two?', 'Question three?'],
    limitations: 'Synthetic test only.',
  };
  const originalFetch = globalThis.fetch;
  let sent;
  let extractionFinishReason = 'stop';
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.groq.com/')) {
      sent = JSON.parse(options.body);
      return new Response(JSON.stringify({
        id: 'synthetic', object: 'chat.completion',
        choices: [{ finish_reason: sent.messages[0].content.startsWith('Transcribe') ? extractionFinishReason : 'stop', message: { role: 'assistant', content: sent.messages[0].content.startsWith('Transcribe') ? 'Synthetic report: Hemoglobin 13.5 g/dL. No fracture.' : JSON.stringify(explanation) } }],
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(url, options);
  };
  const { app, database } = await import('./index.js');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const upload = async (buffer, endpoint = 'analyze', mimetype = 'application/pdf') => {
    const form = new FormData();
    form.append('report', new Blob([buffer], { type: mimetype }), 'medical-report.pdf');
    return originalFetch(`http://127.0.0.1:${server.address().port}/api/${endpoint}`, { method: 'POST', body: form });
  };
  try {
    const response = await upload(fixture());
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.name, 'medical-report.pdf');
    assert.equal(result.summary, explanation.summary);
    assert.match(sent.messages[0].content, /"required":\["documentType","title","summary"/);
    assert.match(sent.messages[0].content, /"minItems":3,"maxItems":5/);
    assert.equal(sent.max_completion_tokens, 900);
    assert.equal(sent.reasoning_effort, 'none');
    assert.equal(sent.messages[1].content.filter(item => item.type === 'image_url').length, 2);
    sent = undefined;
    const invalid = await upload(Buffer.from('%PDF-broken'));
    assert.equal(invalid.status, 422);
    assert.match((await invalid.json()).error, /damaged or unreadable/);
    assert.equal(sent, undefined, 'invalid PDFs must not reach the provider');
    const direct = await upload(fixture(2, false, true), 'extract');
    const extracted = await direct.json();
    assert.equal(direct.status, 200);
    assert.equal(direct.headers.get('cache-control'), 'no-store');
    assert.equal(extracted.extractionMethod, 'pdf_text');
    assert.equal(extracted.pageCount, 2);
    assert.match(extracted.extractedText, /Page 2 of 2/);
    assert.match(extracted.extractedText, /No fracture/);
    assert.equal(sent, undefined, 'direct extraction must not call the AI provider');
    const scanned = await upload(fixture(2, true), 'extract');
    const ocr = await scanned.json();
    assert.equal(scanned.status, 200);
    assert.equal(ocr.extractionMethod, 'vision_ocr');
    assert.match(ocr.extractedText, /Hemoglobin 13.5 g\/dL/);
    assert.equal(sent.messages[1].content.filter(item => item.type === 'image_url').length, 2);
    extractionFinishReason = 'length';
    const incomplete = await upload(fixture(1, true), 'extract');
    assert.equal(incomplete.status, 422);
    assert.match((await incomplete.json()).error, /did not finish/);
    const mismatched = await upload(fixture(), 'extract', 'image/png');
    assert.equal(mismatched.status, 415);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
