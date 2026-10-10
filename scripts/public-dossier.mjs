import fs from 'node:fs';
import path from 'node:path';
import { readArtifact, runFile } from './research-artifacts.mjs';
import { applyReviewPolicy } from './review-policy.mjs';
import { pageShell } from './portal-view.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));

export function redactPublicText(value, trip) {
  let text = String(value ?? '');
  const sensitive = new Set(trip.originAirports ?? []);
  const collect = value => {
    if (typeof value === 'string' && value.length >= 3) sensitive.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(trip.documents);
  collect(trip.unresolved);
  for (const term of [...sensitive].sort((first, second) => second.length - first.length)) text = text.replaceAll(term, '[private detail omitted]');
  return text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[travel date omitted]')
    .replace(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:\s*[-\u2013]\s*\d{1,2})?(?:,?\s+\d{4})?/gi, '[calendar date omitted]')
    .replace(/(?:USD\s*|US\$\s*|\$\s*|EUR\s*|\u20ac\s*)[\d,]+(?:\.\d+)?/gi, '[private cost omitted]')
    .replace(/\b(?:H-?1B|I-?797|Indian passport|passport nationality)\b/gi, '[personal document detail omitted]')
    .replace(/local\/[\w./-]+/g, '[private artifact omitted]');
}

function publicSource(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (/\d{4}-\d{2}-\d{2}|search|flights|booking/i.test(url.pathname)) return url.origin;
    return `${url.origin}${url.pathname}`;
  } catch { return null; }
}

export function projectPublicDossier(report, trip, reviewStatus, findings = []) {
  const clean = value => redactPublicText(value, trip);
  const sections = report.dossier.sections.map(section => ({
    key: section.key,
    text: ['entry_and_transit', 'budget_and_value'].includes(section.key)
      ? section.key === 'entry_and_transit'
        ? 'Destination and transit eligibility remain traveler-specific. Confirm official requirements and home-country re-entry eligibility before a nonrefundable commitment. Personal document assessments remain private.'
        : 'Value is conditional on a fresh inclusive flight and lodging recheck. Personal budgets and party totals remain private; estimates are not observed all-in offers.'
      : clean(section.text),
    sources: [...new Set(section.sources.map(publicSource).filter(Boolean))]
  }));
  const options = report.candidates.map((candidate, index) => ({
    label: `Option ${index + 1}: ${candidate.destination}`,
    priceType: candidate.priceType,
    priceConfidence: candidate.priceType === 'observed' ? 'Medium: observed snapshot; availability and current totals require recheck.' : 'Low: estimated total; inclusive fare and room conditions are not verified.',
    value: `Conditional: ${clean(candidate.reason)}`,
    tradeoffs: clean(candidate.compromises),
    flights: clean(candidate.flightDetails),
    lodging: clean(candidate.hotelDetails)
  }));
  return {
    thesis: clean(report.dossier.thesis).split(/(?<=\.)\s/)[0], verdict: report.dossier.verdict,
    researchDate: String(report.candidates[0]?.observedAt ?? '').slice(0, 10),
    reviewStatus, sections, options,
    itinerary: report.dossier.itinerary.map((day, index) => ({ day: index + 1, location: clean(day.location), plan: clean(day.plan), lodging: clean(day.lodging), transfer: clean(day.transfer), weatherAlternative: clean(day.weatherAlternative) })),
    flags: [...report.dossier.unresolved.map(item => /passport|H-?1B|I-?797|partner status|nationality|USD|ceiling|budget/i.test(item) ? 'Resolve traveler-specific documents, permissions and affordability privately before committing.' : clean(item)), ...findings.map(clean)],
    actions: report.dossier.nextChecks.map((item, index) => ({ priority: index < 4 ? 'High' : 'Medium', text: /H-?1B|I-?797|partner re-entry/i.test(item) ? 'Confirm each traveler\'s re-entry documents with qualified immigration counsel before any nonrefundable commitment.' : clean(item) })),
    limitations: report.limitations.map(clean)
  };
}

export function loadPublicDossier(workspace, trip, id) {
  const local = path.join(workspace, 'local');
  const stateFile = path.join(local, 'research/state.json');
  if (!fs.existsSync(stateFile)) return null;
  const record = read(stateFile).destinations?.[id];
  const reference = record?.status === 'approved' ? record.assessment : record?.artifact;
  if (!reference?.reportPath) return null;
  const filename = runFile(local, path.resolve(local, reference.reportPath));
  const report = read(filename);
  const policy = read(path.join(workspace, '.agents/config/reviewer.json'));
  const configFile = path.join(local, 'automation.json');
  const settings = fs.existsSync(configFile) ? read(configFile) : { jobs: { discovery: { researcherModel: report.configuredModel ?? report.model }, comparison: { researcherModel: report.configuredModel ?? report.model } }, researchPolicy: { allowRegularBrowser: true }, privateBrowserRequired: false };
  const config = applyReviewPolicy(settings, policy);
  const artifact = readArtifact(local, filename, config, trip, { historicalPrices: true });
  if (report.job !== 'destination' || report.destinationId !== id || artifact.draftSha256 !== reference.draftSha256 || artifact.evidenceSha256 !== reference.evidenceSha256) throw new Error('Public dossier requires a matching validated checkpoint');
  let reviewStatus = 'Provisional: independent review is incomplete or did not approve this draft.';
  try {
    readArtifact(local, filename, config, trip, { reviewed: true, historicalPrices: true });
    reviewStatus = 'Four independent passes approved the source draft. Approval is not booking readiness.';
  } catch (error) {
    reviewStatus = error.message === 'Unresolved findings cannot receive approved publication'
      ? 'Provisional research: reviewers retain unresolved findings. See open flags; approval is not clean clearance.'
      : 'Provisional research: independent review evidence is incomplete or not cleared for this draft.';
  }
  const reviewFile = path.join(path.dirname(filename), 'review/state.json');
  const review = fs.existsSync(reviewFile) ? read(reviewFile) : null;
  const findings = review?.draftSha256 === artifact.draftSha256 && review?.evidenceSha256 === artifact.evidenceSha256 ? (review.unresolvedFindings ?? []).map(finding => finding.message) : [];
  for (const role of policy.passes) {
    const receiptFile = path.join(path.dirname(filename), 'review', `${role}.review.json`);
    if (!fs.existsSync(receiptFile)) continue;
    const receipt = read(receiptFile);
    if (receipt.draftSha256 !== artifact.draftSha256 || receipt.evidenceSha256 !== artifact.evidenceSha256) continue;
    findings.push(...(receipt.findings ?? []).filter(finding => !finding.resolved).map(finding => `${role}: ${finding.message}`));
  }
  return projectPublicDossier(report, trip, reviewStatus, findings);
}

export function renderPublicDossier(entry) {
  const dossier = entry.publicDossier;
  const list = items => `<ul>${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`;
  const chapters = dossier.sections.map(section => `<section class="chapter" id="${escape(section.key)}"><h2>${escape(section.key.replaceAll('_', ' '))}</h2><div class="prose">${escape(section.text)}</div><div class="references">${section.sources.map((source, index) => `<a href="${escape(source)}" rel="noreferrer">Source ${index + 1}</a>`).join('')}</div></section>`).join('');
  const options = dossier.options.map(option => `<section class="chapter"><h3>${escape(option.label)}</h3><p><strong>Price evidence: ${escape(option.priceType)}</strong></p><p>Price confidence: ${escape(option.priceConfidence)}</p><p>Value: ${escape(option.value)}</p><p>${escape(option.flights)}</p><p>${escape(option.lodging)}</p><p>Tradeoffs: ${escape(option.tradeoffs)}</p></section>`).join('');
  const itinerary = dossier.itinerary.map(day => `<li class="day"><span>Day ${day.day}</span><div><h3>${escape(day.location)}</h3><p>${escape(day.plan)}</p><dl><dt>Stay</dt><dd>${escape(day.lodging)}</dd><dt>Transfers</dt><dd>${escape(day.transfer)}</dd><dt>Weather alternative</dt><dd>${escape(day.weatherAlternative)}</dd></dl></div></li>`).join('');
  const content = `<main><section class="intro"><div class="wrap"><p class="eyebrow">Destination dossier</p><h1>${escape(entry.destination.name)}</h1><p class="deck">${escape(dossier.thesis)}</p><p>Research snapshot: ${escape(dossier.researchDate)}. ${escape(dossier.reviewStatus)}</p></div></section><div class="wrap book"><aside class="contents"><strong>In This Dossier</strong><nav><a href="#options">Options And Value</a><a href="#itinerary">Itinerary</a><a href="#flags">Open Flags</a><a href="#actions">Your Action Plan</a><a href="../index.html">All destinations</a></nav></aside><article><p class="notice">For your decision, not permission to book. Estimates, unverified eligibility and unresolved conditions remain visible. Ratings below are derived decision-support labels, not additional reviewer approvals. Personal dates, documents and party costs are omitted from this public view.</p><section class="chapter" id="options"><h2>Options And Value</h2><p>Planning confidence: provisional; route timing, closures and reservations need confirmation. Booking readiness: not verified. Value ratings are conditional qualitative assessments, not numerical scores.</p>${options}</section>${chapters}<section class="chapter" id="itinerary"><h2>Provisional Itinerary</h2><ol class="itinerary">${itinerary}</ol></section><section class="chapter" id="flags"><h2>Open Flags</h2>${list([...new Set(dossier.flags)])}</section><section class="chapter" id="actions"><h2>Your Action Plan</h2><p>Resolve high-priority checks before nonrefundable commitments. Verified routing, inclusive prices and eligibility can change the value assessment; changed hours or weather can change the itinerary.</p><ol>${dossier.actions.map(action => `<li><strong>${escape(action.priority)} priority:</strong> ${escape(action.text)}</li>`).join('')}</ol></section><section class="chapter"><h2>Limitations And Freshness</h2><p>Research expires after 30 days; price snapshots become historical after 24 hours. Always recheck current availability. Failed or incomplete checks are not confirmed facts.</p>${list(dossier.limitations)}</section></article></div></main>`;
  return pageShell(entry.destination.name, content, { home: '../index.html' }).replace('Private research &middot;', 'Published research &middot;');
}
