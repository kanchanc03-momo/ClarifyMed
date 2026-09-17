import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';

const text = ['SYNTHETIC LAB REPORT', 'Hemoglobin: 13.5 g/dL', 'Reference range: 12.0 - 16.0 g/dL', 'Follow-up: Routine review with your clinician.'];
const canvas = createCanvas(1200, 500);
const context = canvas.getContext('2d');
context.fillStyle = 'white'; context.fillRect(0, 0, 1200, 500);
context.fillStyle = 'black'; context.font = '32px Arial';
text.forEach((line, i) => context.fillText(line, 40, 70 + i * 90));
const png = canvas.toBuffer('image/png');
await fs.writeFile(new URL('./synthetic-report.png', import.meta.url), png);
const drawing = `BT /F1 14 Tf 40 750 Td (${text[0]}) Tj ${text.slice(1).map(line => `0 -30 Td (${line}) Tj`).join(' ')} ET`;
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
let pdf = '%PDF-1.7\n'; const offsets = [0];
objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
await fs.writeFile(new URL('./synthetic-report.pdf', import.meta.url), pdf);
for (const [name, type, bytes] of [['synthetic-report.pdf', 'application/pdf', pdf], ['synthetic-report.png', 'image/png', png]]) {
  const form = new FormData();
  form.append('report', new Blob([bytes], { type }), name);
  const response = await fetch(`${process.env.EXTRACTION_TEST_URL || 'http://127.0.0.1:8787'}/api/extract`, { method: 'POST', body: form, signal: AbortSignal.timeout(90000) });
  const result = await response.json();
  console.log(JSON.stringify({ name, status: response.status, method: result.extractionMethod, characters: result.extractedText?.length, error: result.error }));
  assert.equal(response.status, 200);
  assert.match(result.extractedText, /13\.5/);
  assert.match(result.extractedText, /Hemoglobin/i);
}
