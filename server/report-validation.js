const DOCUMENT_TYPES = new Set(['text_report', 'scanned_report', 'xray', 'retinopathy', 'unknown']);
const FOLLOW_UP_LEVELS = new Set(['routine', 'monitor', 'prompt']);
const TEXT_LIMITS = {
  title: 300,
  summary: 4000,
  context: 4000,
  finding: 1000,
  location: 500,
  measurement: 300,
  followUpLabel: 200,
  followUpExplanation: 1500,
  limitations: 2000,
};

function isBoundedText(value, maximum) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

export function validateExplanation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'The model response is not an object.';
  if (!DOCUMENT_TYPES.has(value.documentType)) return 'The document type is invalid.';
  if (!FOLLOW_UP_LEVELS.has(value.followUpLevel)) return 'The follow-up level is invalid.';
  for (const [field, maximum] of Object.entries(TEXT_LIMITS)) {
    if (!isBoundedText(value[field], maximum)) return `The ${field} field is missing or invalid.`;
  }
  if (!Array.isArray(value.questions) || value.questions.length < 3 || value.questions.length > 5) {
    return 'The clinician questions are missing or invalid.';
  }
  if (value.questions.some((question) => !isBoundedText(question, 500))) {
    return 'A clinician question is missing or invalid.';
  }
  return null;
}

export function parseExplanation(outputText) {
  let explanation;
  try {
    explanation = JSON.parse(outputText);
  } catch {
    throw new Error('MODEL_OUTPUT_INVALID');
  }
  if (validateExplanation(explanation)) throw new Error('MODEL_OUTPUT_INVALID');
  return explanation;
}

export function validateSavedReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return 'A complete analyzed report is required.';
  if (typeof report.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(report.id)) return 'The report identifier is invalid.';
  if (!isBoundedText(report.name, 255)) return 'The report name is invalid.';
  return validateExplanation(report) || null;
}

export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  return null;
}

export function safeFileName(name) {
  return String(name || 'report').replace(/[\x00-\x1f\x7f]/g, '').replace(/[\\/]/g, '_').slice(0, 255) || 'report';
}
