const text = value => typeof value === 'string' && value.trim().length > 0;
const https = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.'); } catch { return false; } };
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const words = value => String(value ?? '').split(/\s+/).filter(Boolean).length;

export const entryMechanisms = ['visa-free', 'visa-on-arrival', 'e-visa', 'electronic-authorization', 'consular-visa', 'other'];
export const chaseStatuses = ['the-edit', 'chase-travel-portal', 'not-listed', 'unverified'];
export const lodgingTiers = ['mid-range', 'upper-mid-range', 'local-boutique'];

// Structural gate only: proves the fields are complete and honest, not that the cited rules are current.
export function validateEntry(entry) {
  if (!entry || !entryMechanisms.includes(entry.mechanism) || !text(entry.requirement) || !text(entry.usVisaDependency) || !text(entry.transit) || !text(entry.fees) || !https(entry.source)) throw new Error('Dossier entry requires mechanism, requirement, usVisaDependency, transit, fees and an https source');
  if (!(Number.isFinite(entry.leadTimeDays) && entry.leadTimeDays >= 0) && entry.leadTimeDays !== null) throw new Error('Dossier entry leadTimeDays must be a number of days or null when unknown');
  if (entry.leadTimeDays === null && !text(entry.nextAction)) throw new Error('Dossier entry with unknown lead time requires a nextAction');
  if (!isoDate(entry.lastSafeApplyDate) && !(entry.lastSafeApplyDate === null && (entry.mechanism === 'visa-free' || text(entry.nextAction)))) throw new Error('Dossier entry requires lastSafeApplyDate (YYYY-MM-DD), or null only for visa-free entry or with a nextAction');
  if (![true, false, null].includes(entry.feasibleByDepart)) throw new Error('Dossier entry feasibleByDepart must be true, false or null');
  if (entry.feasibleByDepart === null && !text(entry.nextAction)) throw new Error('Dossier entry with unknown feasibility requires a nextAction');
  for (const key of ['steps', 'documents']) {
    if (entry[key] !== undefined && (!Array.isArray(entry[key]) || entry[key].some(item => !text(item) || item.length > 300))) throw new Error(`Dossier entry ${key} must be a list of short texts`);
  }
  if (entry.steps === undefined || entry.steps.length < 3) throw new Error('Dossier entry requires at least three application steps');
}

export function validateLodging(lodging) {
  if (!Array.isArray(lodging) || lodging.length < 2) throw new Error('Dossier lodging requires at least two properties');
  for (const item of lodging) {
    if (!text(item?.name) || !text(item.area) || !lodgingTiers.includes(item.tier) || !text(item.whyHere) || !chaseStatuses.includes(item.chaseTravel) || !text(item.chaseNote)) throw new Error('Lodging property requires name, area, tier, whyHere, chaseTravel and chaseNote');
    if (!Number.isFinite(item.guestRating?.score) || !Number.isFinite(item.guestRating.scale) || item.guestRating.score > item.guestRating.scale || !text(item.guestRating.source)) throw new Error('Lodging property requires a guestRating with score, scale and source');
    if (!Number.isFinite(item.nightlyUsd) || item.nightlyUsd <= 0 || !text(item.priceBasis)) throw new Error('Lodging property requires nightlyUsd and a priceBasis');
    if (!Array.isArray(item.sources) || !item.sources.length || !item.sources.every(https)) throw new Error('Lodging property requires https sources');
  }
}

export function validateVoices(voices) {
  if (!Array.isArray(voices) || voices.length < 3) throw new Error('Dossier requires at least three traveler or local voices');
  for (const voice of voices) {
    if (!text(voice?.author) || !text(voice.takeaway) || !https(voice.url) || !text(voice.context)) throw new Error('Traveler voice requires author, context, takeaway and an https url');
    if (voice.quote !== undefined && (!text(voice.quote) || words(voice.quote) > 30)) throw new Error('Traveler voice quote must be 30 words or fewer; paraphrase longer passages');
  }
  if (new Set(voices.map(voice => new URL(voice.url).hostname)).size < 2) throw new Error('Traveler voices must come from at least two different sites');
}
