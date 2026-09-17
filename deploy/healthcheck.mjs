import { pathToFileURL } from 'node:url';

// Both processes are required: X-rays use ML even with a hosted report provider.
export async function checkHealth({
  apiUrl = `http://127.0.0.1:${process.env.PORT || 7860}`,
  mlUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000',
  timeoutMs = 3000,
} = {}) {
  const results = await Promise.allSettled([
    [apiUrl, '/api/health'], [mlUrl, '/health'],
  ].map(async ([base, route]) => {
    const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error('Service returned an unsuccessful status.');
    const status = await response.json();
    if (status.ok !== true) throw new Error('Service is not healthy.');
    if (route === '/api/health' && status.configured !== true) throw new Error('Report provider is not configured.');
    return status;
  }));
  if (results.some(result => result.status === 'rejected')) {
    throw new Error('Application or private ML service is unavailable or unconfigured.');
  }
  return { api: results[0].value, ml: results[1].value };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkHealth().then(status => console.log(JSON.stringify(status))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
