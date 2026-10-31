// Return safe, actionable errors without exposing provider payloads or report contents.
function headerValue(error, name) {
  return error?.headers?.get?.(name) ?? error?.headers?.[name];
}

function retrySeconds(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (Number.isFinite(date) && date > Date.now()) return Math.ceil((date - Date.now()) / 1000);
  const parts = String(value).match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (!parts || !parts.slice(1).some(Boolean)) return null;
  const duration = (Number(parts[1]) || 0) * 3600 + (Number(parts[2]) || 0) * 60 + (Number(parts[3]) || 0);
  return duration > 0 ? Math.ceil(duration) : null;
}

export function analysisErrorResponse(error) {
  if (error?.message === 'MODEL_OUTPUT_TRUNCATED') return { status: 502, code: 'MODEL_OUTPUT_TRUNCATED', error: 'The explanation was cut off before it finished. Try fewer report pages.' };
  if (error?.message === 'MODEL_OUTPUT_INVALID') return { status: 502, code: 'MODEL_OUTPUT_INVALID', error: 'The AI returned an incomplete or invalid explanation. Please try again. You can still use Extract text to read your report.' };
  if ([401, 403].includes(error?.status)) return { status: 503, code: 'PROVIDER_AUTH_FAILED', error: 'The analysis service could not authenticate. The server API key or model access needs to be checked.' };
  if (error?.status === 429) {
    const retryAfter = [
      headerValue(error, 'retry-after'),
      headerValue(error, 'x-ratelimit-reset-requests'),
      headerValue(error, 'x-ratelimit-reset-tokens'),
    ].map(retrySeconds).find(Boolean) || null;
    return {
      status: 429,
      code: 'PROVIDER_RATE_LIMIT',
      error: retryAfter ? `The analysis provider is temporarily rate-limited. Try again in about ${retryAfter} second${retryAfter === 1 ? '' : 's'}.` : 'The analysis provider temporarily rate-limited this request. Your plan usage may still be available; wait a moment and try again.',
      retryAfter,
    };
  }
  if (error?.status === 413) return { status: 422, code: 'PROVIDER_INPUT_LIMIT', error: 'This report is too large for the analysis service. Upload fewer pages or a smaller image.' };
  if (['AbortError', 'TimeoutError', 'APIUserAbortError', 'APIConnectionTimeoutError'].includes(error?.name)) return { status: 504, code: 'ANALYSIS_TIMEOUT', error: 'Analysis took too long. Try a smaller report or retry shortly.' };
  if (error?.name === 'APIConnectionError' || error?.cause?.code === 'ECONNREFUSED') return { status: 503, code: 'ANALYSIS_UNAVAILABLE', error: 'The analysis service is unreachable. Check the server connection and try again.' };
  return { status: 502, code: 'ANALYSIS_FAILED', error: 'The report could not be analyzed. Try Extract text first, or retry the explanation.' };
}
