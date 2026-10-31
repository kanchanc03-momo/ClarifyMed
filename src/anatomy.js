const LOCATIONS = [
  // Keep humeral terms ahead of "head": "humeral head" is part of the
  // shoulder, not the brain.
  // Note: Coordinates follow medical anatomical position (anterior view).
  // The patient's Right is on the viewer's left (x < 110).
  // The patient's Left is on the viewer's right (x > 110).
  { terms: ['right humeral head', 'right humeral'], x: 66, y: 112, label: 'Right upper arm / shoulder' },
  { terms: ['left humeral head', 'left humeral'], x: 154, y: 112, label: 'Left upper arm / shoulder' },
  { terms: ['humeral head', 'humeral'], x: 66, y: 112, label: 'Upper arm / shoulder' },
  { terms: ['right proximal humerus', 'right humerus'], x: 66, y: 112, label: 'Right upper arm / shoulder' },
  { terms: ['left proximal humerus', 'left humerus'], x: 154, y: 112, label: 'Left upper arm / shoulder' },
  { terms: ['proximal humerus', 'humerus'], x: 66, y: 112, label: 'Upper arm / shoulder' },
  { terms: ['brain', 'head', 'skull'], x: 110, y: 32, label: 'Head' },
  { terms: ['right shoulder'], x: 72, y: 88, label: 'Right shoulder' },
  { terms: ['left shoulder'], x: 148, y: 88, label: 'Left shoulder' },
  { terms: ['right lung', 'right chest'], x: 94, y: 112, label: 'Right chest' },
  { terms: ['left lung', 'left chest'], x: 126, y: 112, label: 'Left chest' },
  { terms: ['lung', 'heart', 'chest'], x: 110, y: 116, label: 'Chest' },
  { terms: ['liver', 'abdomen', 'abdominal'], x: 102, y: 153, label: 'Abdomen' },
  { terms: ['right elbow'], x: 61, y: 142, label: 'Right elbow' },
  { terms: ['left elbow'], x: 159, y: 142, label: 'Left elbow' },
  { terms: ['right wrist', 'right hand', 'right finger'], x: 48, y: 188, label: 'Right hand/wrist' },
  { terms: ['left wrist', 'left hand', 'left finger'], x: 172, y: 188, label: 'Left hand/wrist' },
  { terms: ['right knee'], x: 91, y: 219, label: 'Right knee' },
  { terms: ['left knee'], x: 129, y: 219, label: 'Left knee' },
  { terms: ['right eye', 'right retina', 'right fundus', 'right macula', 'od'], x: 102, y: 36, label: 'Right eye / retina' },
  { terms: ['left eye', 'left retina', 'left fundus', 'left macula', 'os'], x: 118, y: 36, label: 'Left eye / retina' },
  { terms: ['eye', 'retina', 'retinal', 'fundus', 'macula', 'fovea', 'optic disc', 'ou'], x: 110, y: 36, label: 'Eyes / retina' },
];

export function mapAnatomy(location) {
  const normalized = String(location || '').trim().toLowerCase();
  if (!normalized || normalized.includes('not reliably') || normalized.includes('not specified')) return null;
  return LOCATIONS.find(item => item.terms.some(term => normalized.includes(term))) || null;
}
