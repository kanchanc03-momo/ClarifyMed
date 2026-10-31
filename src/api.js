export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export async function getXrayReadiness() {
  const response = await fetch('/api/health');
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload.xrayModelReady === true;
}

export function validateReport(file) {
  if (!file) return 'Choose a report to continue.';
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Please upload a PDF, JPG, or PNG file.';
  if (file.size > MAX_FILE_SIZE) return 'The file must be smaller than 20 MB.';
  if (file.size === 0) return 'This file is empty. Please choose another file.';
  return null;
}

export function validateXray(file) {
  if (!file) return 'Choose a pediatric wrist X-ray to continue.';
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'Pediatric wrist X-ray detection accepts JPG, JPEG, or PNG images only.';
  if (file.size > MAX_FILE_SIZE) return 'The file must be smaller than 20 MB.';
  if (file.size === 0) return 'This file is empty. Please choose another file.';
  return null;
}

export function validateRetinopathy(file) {
  if (!file) return 'Choose a retinal fundus photograph to continue.';
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'Retinal fundus screening accepts JPG, JPEG, or PNG images only.';
  if (file.size > MAX_FILE_SIZE) return 'The file must be smaller than 20 MB.';
  if (file.size === 0) return 'This file is empty. Please choose another file.';
  return null;
}

export async function analyzeReport(file, inputType = 'report', confirmed = false) {
  const form = new FormData();
  form.append('report', file);
  form.append('input_type', inputType);
  if (inputType === 'xray') form.append('wrist_confirmed', String(confirmed));
  if (inputType === 'retinopathy') form.append('retina_confirmed', String(confirmed));
  const response = await fetch('/api/analyze', { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'We could not explain this report. Please try again.');
  return payload;
}

export async function extractReportText(file) {
  const form = new FormData();
  form.append('report', file);
  const response = await fetch('/api/extract', { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Text extraction failed. Please try again.');
  return payload;
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
}

export function getCurrentUser() {
  return jsonRequest('/api/auth/me');
}

export function register(email, password) {
  return jsonRequest('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
}

export function login(email, password) {
  return jsonRequest('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
}

export async function logout() {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok) throw new Error('Could not sign out. Please try again.');
}

export function saveReport(report) {
  return jsonRequest('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
}

export function getReports() {
  return jsonRequest('/api/reports');
}

export function getReport(id) {
  return jsonRequest(`/api/reports/${encodeURIComponent(id)}`);
}

export async function deleteReport(id) {
  const response = await fetch(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Could not delete this report.');
  }
}
