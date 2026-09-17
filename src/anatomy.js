const LOCATIONS = [
  { terms: ['brain', 'head', 'skull'], x: 110, y: 32, label: 'Head' },
  { terms: ['left shoulder'], x: 72, y: 88, label: 'Left shoulder' },
  { terms: ['right shoulder'], x: 148, y: 88, label: 'Right shoulder' },
  { terms: ['left lung', 'left chest'], x: 94, y: 112, label: 'Left chest' },
  { terms: ['right lung', 'right chest'], x: 126, y: 112, label: 'Right chest' },
  { terms: ['lung', 'heart', 'chest'], x: 110, y: 116, label: 'Chest' },
  { terms: ['liver', 'abdomen', 'abdominal'], x: 118, y: 153, label: 'Abdomen' },
  { terms: ['left elbow'], x: 61, y: 142, label: 'Left elbow' },
  { terms: ['right elbow'], x: 159, y: 142, label: 'Right elbow' },
  { terms: ['left wrist', 'left hand', 'left finger'], x: 48, y: 188, label: 'Left hand/wrist' },
  { terms: ['right wrist', 'right hand', 'right finger'], x: 172, y: 188, label: 'Right hand/wrist' },
  { terms: ['left knee'], x: 91, y: 219, label: 'Left knee' },
  { terms: ['right knee'], x: 129, y: 219, label: 'Right knee' },
];

export function mapAnatomy(location) {
  const normalized = String(location || '').trim().toLowerCase();
  if (!normalized || normalized.includes('not reliably') || normalized.includes('not specified')) return null;
  return LOCATIONS.find(item => item.terms.some(term => normalized.includes(term))) || null;
}
