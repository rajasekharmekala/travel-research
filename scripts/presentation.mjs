import fs from 'node:fs';
import path from 'node:path';

export const valueLabels = ['Strong fit', 'Conditional', 'Weak fit', 'Not recommended'];
export const priceConfidenceLabels = ['Observed snapshot', 'Partly observed', 'Estimate only'];
export const costBases = ['observed', 'partly observed', 'derived', 'estimate'];
const imageFilePattern = /^[a-z0-9-]+\.(jpg|png|webp)$/;

function text(value, label, max = 600) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw new Error(`Presentation ${label} must be text up to ${max} characters`);
  return value.trim();
}

function rating(value, labels, label) {
  if (!labels.includes(value?.label)) throw new Error(`Presentation ${label} label must be one of: ${labels.join(', ')}`);
  return { label: value.label, rationale: text(value.rationale, `${label} rationale`) };
}

function httpsUrl(value, label) {
  if (typeof value !== 'string') throw new Error(`Presentation ${label} must be an https URL`);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`Presentation ${label} must be an https URL`);
  return url.href;
}

// Loads researcher-prepared presentation metadata bound to one validated draft and evidence pair.
// It never changes the reviewed draft, receipts or approval state.
export function loadPresentation(runDirectory, artifact, { candidates, sectionKeys, mediaDirectory }) {
  const empty = { options: new Map(), images: {} };
  const file = path.join(runDirectory, 'presentation.json');
  if (!fs.existsSync(file)) return empty;
  const presentation = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (presentation.schema !== 'presentation-v1') throw new Error('Presentation schema must be presentation-v1');
  if (presentation.draftSha256 !== artifact.draftSha256 || presentation.evidenceSha256 !== artifact.evidenceSha256) throw new Error('Presentation does not match the validated draft and evidence');
  if (typeof presentation.status !== 'string' || !/not an independent review/i.test(presentation.status)) throw new Error('Presentation must state that it is not an independent review');
  const costKeys = new Set(candidates.flatMap(candidate => Object.keys(candidate.costs ?? {})));
  const options = new Map();
  for (const option of presentation.options ?? []) {
    if (!Number.isInteger(option.candidateIndex) || option.candidateIndex < 0 || option.candidateIndex >= candidates.length) throw new Error('Presentation candidateIndex is outside the draft candidates');
    if (options.has(option.candidateIndex)) throw new Error('Presentation repeats a candidateIndex');
    const costBasis = {};
    for (const [key, entry] of Object.entries(option.costBasis ?? {})) {
      if (!costKeys.has(key)) throw new Error(`Presentation cost line ${key} is not in the draft`);
      if (!costBases.includes(entry.basis)) throw new Error(`Presentation cost basis must be one of: ${costBases.join(', ')}`);
      costBasis[key] = { basis: entry.basis, note: text(entry.note, `${key} note`, 400) };
    }
    options.set(option.candidateIndex, {
      ratings: {
        value: rating(option.ratings?.value, valueLabels, 'value'),
        priceConfidence: rating(option.ratings?.priceConfidence, priceConfidenceLabels, 'priceConfidence')
      },
      costBasis
    });
  }
  const images = {};
  for (const [key, image] of Object.entries(presentation.images ?? {})) {
    if (!sectionKeys.includes(key)) throw new Error(`Presentation image section ${key} is not in the draft`);
    if (typeof image.file !== 'string' || !imageFilePattern.test(image.file)) throw new Error('Presentation image file name is not allowed');
    if (!fs.existsSync(path.join(mediaDirectory, image.file))) throw new Error(`Presentation image ${image.file} is missing from local media`);
    images[key] = {
      file: image.file,
      alt: text(image.alt, `${key} image alt`, 200),
      title: text(image.title, `${key} image title`, 200),
      artist: text(image.artist, `${key} image artist`, 200),
      license: text(image.license, `${key} image license`, 100),
      licenseUrl: image.licenseUrl ? httpsUrl(image.licenseUrl, `${key} image licenseUrl`) : null,
      sourceUrl: httpsUrl(image.sourceUrl, `${key} image sourceUrl`)
    };
  }
  return { options, images };
}
