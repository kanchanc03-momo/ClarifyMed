export const NO_DETECTION_EXPLANATION = 'The computer analyzed this X-ray and did not spot an obvious crack or bone bend above its detection threshold. However, very small hairline cracks can hide on day-one X-rays, so if your wrist still hurts, swells, or feels tender, a doctor must still examine it.';
export const DISAGREEMENT_EXPLANATION = 'The written report and research model produced different information. Rely on a qualified clinician and the official radiology report.';

export function xrayExplanation(result) {
  const detections = Array.isArray(result?.detections) ? result.detections : [];
  if (detections.length === 0) {
    return NO_DETECTION_EXPLANATION;
  }

  const count = detections.length;
  const primary = detections[0] || {};
  const scorePercent = typeof primary.confidence === 'number' ? Math.round(primary.confidence * 100) : null;
  const box = primary.boundingBox || {};

  let countStr = count === 1 ? '1 suspicious bone area' : `${count} distinct suspicious bone areas`;
  let matchStr = scorePercent ? ` (${scorePercent}% pattern match confidence)` : '';

  let locationDetail = 'near the wrist joint';
  if (Number.isFinite(box.yMin) && Number.isFinite(box.yMax)) {
    if (box.yMin > 250) {
      locationDetail = 'along the lower forearm bone near the wrist joint (distal radius/ulna region)';
    } else if (box.yMin < 150) {
      locationDetail = 'higher along the forearm bone shaft';
    }
  }

  return `The computer analyzed this X-ray and spotted ${countStr} ${locationDetail}${matchStr}, marked inside the red box. In growing children, falling on an outstretched hand commonly causes the soft bone to bend, wrinkle (buckle fracture), or crack at this exact spot. This is a visual helper to show your doctor — only a doctor can gently touch your arm and tell for sure if there is a real fracture.`;
}

export const DETECTION_EXPLANATION = xrayExplanation({ detections: [{ confidence: .84, boundingBox: { xMin: 1, yMin: 2, xMax: 3, yMax: 4 } }] });

// Compare only explicit fracture statements. An absent mention is not agreement.
export function reportDisagreesWithXray(report, xray) {
  const finding = String(report.finding || '').toLowerCase();
  const saysNoFracture = /\b(?:no|without|negative for)\s+(?:acute\s+)?fracture\b/.test(finding);
  const saysFracture = !saysNoFracture && /\bfracture\b/.test(finding);
  const detected = Array.isArray(xray.detections) && xray.detections.length > 0;
  return (saysNoFracture && detected) || (saysFracture && !detected);
}
