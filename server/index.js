import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import { buildReportContent, PdfInputError } from './pdf-input.js';
import { extractText } from './text-extraction.js';
import { analysisErrorResponse } from './analysis-errors.js';
import { detectFileType, parseExplanation, safeFileName, validateExplanation, validateSavedReport } from './report-validation.js';
import { clearSessionCookie, hashPassword, normalizeEmail, parseCookies, sessionCookie, validateCredentials, verifyPassword } from './auth.js';

try {
  loadEnvFile();
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const app = express();
const port = Number(process.env.PORT || 8787);
const isProduction = process.env.NODE_ENV === 'production';
const analysisTimeoutMs = Number(process.env.ANALYSIS_TIMEOUT_MS || 60000);
const dataDirectory = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDirectory, { recursive: true });
const database = new DatabaseSync(path.join(dataDirectory, 'clarifymed.db'));
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    document_type TEXT NOT NULL,
    follow_up_level TEXT NOT NULL,
    follow_up_label TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
`);
try { database.exec('ALTER TABLE reports ADD COLUMN owner_id TEXT REFERENCES users(id)'); } catch (error) {
  if (!String(error?.message).includes('duplicate column name')) throw error;
}
const insertReport = database.prepare(`INSERT INTO reports
  (id, name, document_type, follow_up_level, follow_up_label, payload, created_at, owner_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const listReports = database.prepare(`SELECT id, name, document_type AS documentType,
  follow_up_level AS followUpLevel, follow_up_label AS followUpLabel, created_at AS createdAt
  FROM reports WHERE owner_id = ? ORDER BY created_at DESC`);
const findReport = database.prepare('SELECT payload FROM reports WHERE id = ? AND owner_id = ?');
const deleteReport = database.prepare('DELETE FROM reports WHERE id = ? AND owner_id = ?');
const findUserByEmail = database.prepare('SELECT id, email, password_hash AS passwordHash FROM users WHERE email = ?');
const findUserBySession = database.prepare('SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?');
const insertUser = database.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)');
const insertSession = database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
const deleteSession = database.prepare('DELETE FROM sessions WHERE token_hash = ?');
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => callback(null, allowedTypes.has(file.mimetype)),
});

function rateLimit({ windowMs, maximum, message }) {
  const clients = new Map();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const current = clients.get(key);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    entry.count += 1;
    clients.set(key, entry);
    response.setHeader('RateLimit-Limit', maximum);
    response.setHeader('RateLimit-Remaining', Math.max(0, maximum - entry.count));
    response.setHeader('RateLimit-Reset', Math.ceil(entry.resetAt / 1000));
    if (entry.count > maximum) return response.status(429).json({ error: message });
    next();
  };
}

const reportSchema = {
  type: 'object', additionalProperties: false,
  required: ['documentType', 'title', 'summary', 'context', 'finding', 'location', 'measurement', 'followUpLevel', 'followUpLabel', 'followUpExplanation', 'questions', 'limitations'],
  properties: {
    documentType: { type: 'string', enum: ['text_report', 'scanned_report', 'xray', 'unknown'] },
    title: { type: 'string' }, summary: { type: 'string' }, context: { type: 'string' },
    finding: { type: 'string' }, location: { type: 'string' }, measurement: { type: 'string' },
    followUpLevel: { type: 'string', enum: ['routine', 'monitor', 'prompt'] },
    followUpLabel: { type: 'string' }, followUpExplanation: { type: 'string' },
    questions: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } },
    limitations: { type: 'string' },
  },
};

const instructions = `You explain medical report terminology to patients in calm, plain language. Do not diagnose, prescribe, or contradict the source report. Extract only findings visible or written in the supplied document. Distinguish observations from interpretations. If content is unreadable or is not a medical report, say so in limitations and use "Not available" for missing fields. followUpLevel is communication guidance inferred primarily from explicit report wording: routine, monitor, or prompt. Never call something an emergency; mention emergency services only if the source explicitly describes a critical emergency. Avoid false reassurance. Do not claim to create a heatmap or model localization. Questions must be useful questions for the patient's clinician.`;

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
  response.setHeader('X-Request-Id', request.get('X-Request-Id') || crypto.randomUUID());
  next();
});
app.use('/api', rateLimit({ windowMs: 60_000, maximum: 120, message: 'Too many requests. Please wait and try again.' }));
app.use(express.json({ limit: '100kb', type: 'application/json' }));

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function currentUser(request) {
  const token = parseCookies(request.headers.cookie).clarifymed_session;
  return token ? findUserBySession.get(tokenHash(token), new Date().toISOString()) : null;
}
function requireUser(request, response, next) {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: 'Sign in to access saved reports.' });
  request.user = user;
  next();
}
function startSession(response, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  insertSession.run(tokenHash(token), userId, new Date(Date.now() + 7 * 86400000).toISOString());
  response.setHeader('Set-Cookie', sessionCookie(token, isProduction));
}

const provider = process.env.ANALYSIS_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'openai');
const apiKey = provider === 'groq' ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
const model = provider === 'groq'
  ? (process.env.GROQ_MODEL || 'qwen/qwen3.6-27b')
  : (process.env.OPENAI_MODEL || 'gpt-5-mini');

app.get('/api/health', (_request, response) => response.json({ ok: true, configured: provider === 'local' || Boolean(apiKey), provider }));

app.post('/api/extract', rateLimit({ windowMs: 15 * 60_000, maximum: 10, message: 'Extraction limit reached. Please wait before uploading another report.' }), upload.single('report'), async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (!request.file) return response.status(400).json({ error: 'Upload one PDF, JPG, or PNG report under 20 MB.' });
  if (detectFileType(request.file.buffer) !== request.file.mimetype) return response.status(415).json({ error: 'The file contents do not match a supported PDF, JPG, or PNG report.' });
  try {
    const name = safeFileName(request.file.originalname);
    const result = await extractText({ ...request.file, originalname: name }, { provider, apiKey, model, timeoutMs: analysisTimeoutMs, localUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000' });
    response.json({ name, ...result });
  } catch (error) {
    if (error instanceof PdfInputError) return response.status(422).json({ error: error.message });
    console.error('Text extraction failed:', error?.status || error?.name || 'Error');
    const message = error?.status === 429 ? 'The OCR service is busy or its quota is exhausted. Wait and try again.' : 'Text extraction could not finish. Check the OCR service or try a clearer, smaller report.';
    response.status(error?.status === 429 ? 429 : 502).json({ error: message });
  }
});

app.get('/api/auth/me', (request, response) => {
  const user = currentUser(request);
  response.json({ user: user || null });
});

app.post('/api/auth/register', (request, response) => {
  const email = normalizeEmail(request.body?.email);
  const error = validateCredentials(email, request.body?.password);
  if (error) return response.status(400).json({ error });
  const user = { id: crypto.randomUUID(), email };
  try { insertUser.run(user.id, email, hashPassword(request.body.password), new Date().toISOString()); }
  catch (issue) {
    if (String(issue?.message).includes('UNIQUE')) return response.status(409).json({ error: 'An account with this email already exists.' });
    throw issue;
  }
  startSession(response, user.id);
  response.status(201).json({ user });
});

app.post('/api/auth/login', (request, response) => {
  const user = findUserByEmail.get(normalizeEmail(request.body?.email));
  if (!user || !verifyPassword(request.body?.password, user.passwordHash)) return response.status(401).json({ error: 'Email or password is incorrect.' });
  startSession(response, user.id);
  response.json({ user: { id: user.id, email: user.email } });
});

app.post('/api/auth/logout', (request, response) => {
  const token = parseCookies(request.headers.cookie).clarifymed_session;
  if (token) deleteSession.run(tokenHash(token));
  response.setHeader('Set-Cookie', clearSessionCookie(isProduction));
  response.status(204).end();
});

app.get('/api/reports', requireUser, (request, response) => response.json(listReports.all(request.user.id)));

app.get('/api/reports/:id', requireUser, (request, response) => {
  const row = findReport.get(request.params.id, request.user.id);
  if (!row) return response.status(404).json({ error: 'Report not found.' });
  response.json(JSON.parse(row.payload));
});

app.delete('/api/reports/:id', requireUser, (request, response) => {
  const result = deleteReport.run(request.params.id, request.user.id);
  if (!result.changes) return response.status(404).json({ error: 'Report not found.' });
  response.status(204).end();
});

app.post('/api/reports', requireUser, (request, response) => {
  const report = request.body;
  const validationError = validateSavedReport(report);
  if (validationError) return response.status(400).json({ error: validationError });
  const createdAt = new Date().toISOString();
  const saved = { ...report, createdAt };
  try {
    insertReport.run(report.id, report.name, report.documentType || 'unknown', report.followUpLevel || 'monitor', report.followUpLabel || 'Review suggested', JSON.stringify(saved), createdAt, request.user.id);
    response.status(201).json(saved);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) return response.status(409).json({ error: 'This report is already saved.' });
    throw error;
  }
});

app.post('/api/analyze', rateLimit({ windowMs: 15 * 60_000, maximum: 10, message: 'Analysis limit reached. Please wait before uploading another report.' }), upload.single('report'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Upload one PDF, JPG, or PNG report under 20 MB.' });
  const detectedType = detectFileType(request.file.buffer);
  if (!detectedType || detectedType !== request.file.mimetype) {
    return response.status(415).json({ error: 'The file contents do not match a supported PDF, JPG, or PNG report.' });
  }
  const inputType = request.body.input_type || 'report';
  if (!['report', 'xray'].includes(inputType)) return response.status(400).json({ error: 'Choose either report or X-ray analysis.' });
  if (inputType === 'xray' && detectedType === 'application/pdf') return response.status(422).json({ error: 'X-ray analysis accepts one JPG or PNG image, not a PDF.' });
  const useLocal = provider === 'local' || inputType === 'xray';
  if (!useLocal && !apiKey) return response.status(503).json({ error: 'Analysis is not configured yet. Configure the local ML service, GROQ_API_KEY, or OPENAI_API_KEY.' });

  try {
    if (useLocal) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), analysisTimeoutMs);
      const form = new FormData();
      form.append('report', new Blob([request.file.buffer], { type: request.file.mimetype }), safeFileName(request.file.originalname));
      form.append('input_type', inputType);
      let upstream, payload;
      try {
        upstream = await fetch(`${process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000'}/analyze`, { method: 'POST', body: form, signal: controller.signal });
        payload = await upstream.json().catch(() => ({}));
      } catch (error) {
        if (error instanceof TypeError) return response.status(503).json({ error: 'The local ML service is unavailable. Start the Python service and check ML_SERVICE_URL.' });
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      if (!upstream.ok) return response.status(upstream.status >= 500 ? 502 : upstream.status).json({ error: payload.detail || 'The local ML service could not analyze this file.' });
      if (validateExplanation(payload)) {
        return response.status(502).json({ error: 'The local ML service returned an invalid explanation.' });
      }
      return response.json({ id: crypto.randomUUID(), name: safeFileName(request.file.originalname), date: new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date()), ...payload });
    }
    const client = new OpenAI({
      apiKey,
      ...(provider === 'groq' && { baseURL: 'https://api.groq.com/openai/v1' }),
    });
    const fileName = safeFileName(request.file.originalname);
    const content = await buildReportContent({ ...request.file, originalname: fileName }, provider, model);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), analysisTimeoutMs);
    let outputText;
    try {
      if (provider === 'groq') {
        const result = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: `${instructions}\nReturn ONLY one valid JSON object, without markdown or commentary. Keep each field concise: summary under 80 words, other text fields under 40 words, and exactly 3 short questions. Include every required field and obey this JSON schema exactly: ${JSON.stringify(reportSchema)}` },
            { role: 'user', content: content.map(item => item.type === 'input_text'
              ? { type: 'text', text: item.text }
              : { type: 'image_url', image_url: { url: item.image_url, detail: 'high' } }) },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 900,
          ...(/^qwen\/qwen3\.[68]-27b$/.test(model) && { reasoning_effort: 'none' }),
          store: false,
        }, { signal: controller.signal });
        if (result.choices[0]?.finish_reason === 'length') throw new Error('MODEL_OUTPUT_TRUNCATED');
        outputText = result.choices[0]?.message?.content;
      } else {
        const result = await client.responses.create({
          model, instructions, input: [{ role: 'user', content }],
          text: { format: { type: 'json_schema', name: 'medical_report_explanation', strict: true, schema: reportSchema } },
          store: false,
        }, { signal: controller.signal });
        outputText = result.output_text;
      }
    } finally { clearTimeout(timeout); }
    const explanation = parseExplanation(outputText);
    response.json({ id: crypto.randomUUID(), name: fileName, date: new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date()), ...explanation });
  } catch (error) {
    if (error instanceof PdfInputError) return response.status(422).json({ error: error.message });
    const failure = analysisErrorResponse(error);
    console.error('Analysis failed:', failure.code, error?.status || error?.name || 'Error');
    response.status(failure.status).json({ error: failure.error, code: failure.code });
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return response.status(413).json({ error: 'The file must be smaller than 20 MB.' });
  response.status(400).json({ error: 'The uploaded file could not be accepted.' });
});

if (isProduction) {
  const distributionDirectory = path.resolve('dist');
  app.use(express.static(distributionDirectory, { index: false, maxAge: '1h' }));
  app.get('/{*path}', (_request, response) => response.sendFile(path.join(distributionDirectory, 'index.html')));
}

export { app, database };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  app.listen(port, () => console.log(`ClarifyMed API listening on http://localhost:${port}`));
}
