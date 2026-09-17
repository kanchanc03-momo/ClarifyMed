// Return safe, actionable errors without exposing provider payloads or report contents.
export function analysisErrorResponse(error) {
  if (error?.message === 'MODEL_OUTPUT_TRUNCATED') return { status: 502, code: 'MODEL_OUTPUT_TRUNCATED', error: 'The explanation was cut off before it finished. Try fewer report pages.' };
  if (error?.message === 'MODEL_OUTPUT_INVALID') return { status: 502, code: 'MODEL_OUTPUT_INVALID', error: 'The AI returned an incomplete or invalid explanation. Please try again. You can still use Extract text to read your report.' };
  if ([401, 403].includes(error?.status)) return { status: 503, code: 'PROVIDER_AUTH_FAILED', error: 'The analysis service could not authenticate. The server API key or model access needs to be checked.' };
  if (error?.status === 429) return { status: 429, code: 'PROVIDER_RATE_LIMIT', error: 'The analysis service has reached its usage limit. Please wait and try again.' };
  if (error?.status === 413) return { status: 422, code: 'PROVIDER_INPUT_LIMIT', error: 'This report is too large for the analysis service. Upload fewer pages or a smaller image.' };
  if (['AbortError', 'TimeoutError', 'APIUserAbortError', 'APIConnectionTimeoutError'].includes(error?.name)) return { status: 504, code: 'ANALYSIS_TIMEOUT', error: 'Analysis took too long. Try a smaller report or retry shortly.' };
  if (error?.name === 'APIConnectionError' || error?.cause?.code === 'ECONNREFUSED') return { status: 503, code: 'ANALYSIS_UNAVAILABLE', error: 'The analysis service is unreachable. Check the server connection and try again.' };
  return { status: 502, code: 'ANALYSIS_FAILED', error: 'The report could not be analyzed. Try Extract text first, or retry the explanation.' };
}
