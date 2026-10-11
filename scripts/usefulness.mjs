import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { destinationId } from './research-store.mjs';
import { memoWordCount } from './memo.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const ratio = (part, whole) => whole > 0 ? part / whole : 0;
const clamp = value => Math.max(0, Math.min(1, value));
const requiredMemoSections = [/recommend/i, /fits?/i, /unfolds|itinerary/i, /cost/i, /wrong|risk/i, /alternative/i];

// Mechanical usefulness score (0-100) for choosing a trip. It measures decision-readiness, not factual truth.
export const dimensions = [
  { key: 'priceGrounding', label: 'Price grounding', max: 25 },
  { key: 'decisionClarity', label: 'Decision clarity', max: 20 },
  { key: 'narrativeDepth', label: 'Narrative depth', max: 15 },
  { key: 'entryReadiness', label: 'Entry readiness', max: 10 },
  { key: 'lodgingFit', label: 'Lodging fit', max: 10 },
  { key: 'travelerVoices', label: 'Traveler voices', max: 10 },
  { key: 'itineraryRealism', label: 'Itinerary realism', max: 10 }
];

function priceGrounding(report) {
  // Share of the party total that is observed, partly observed or derived with arithmetic; plain estimates and unsupported lines earn nothing.
  const lines = (report.candidates ?? [])[report.dossier?.itineraryCandidateIndex ?? 0]?.costBasis ?? {};
  const weights = { observed: 1, 'partly observed': 0.8, derived: 0.55, estimate: 0.15, 'unsupported budget scenario': 0 };
  const total = Object.values(lines).reduce((sum, line) => sum + (line.totalUsd ?? 0), 0);
  if (!total) return { score: 0, note: 'No cost basis recorded' };
  const grounded = Object.values(lines).reduce((sum, line) => sum + (line.totalUsd ?? 0) * (weights[line.basis] ?? 0), 0);
  const hasRange = Object.values(lines).every(line => line.basis === 'observed' || (Number.isFinite(line.rangeUsd?.low) && Number.isFinite(line.rangeUsd?.high)));
  return { score: clamp(ratio(grounded, total) * 0.85 + (hasRange ? 0.15 : 0)), note: `${Math.round(ratio(grounded, total) * 100)}% of the total is evidence-weighted` };
}

function decisionClarity(report) {
  const dossier = report.dossier ?? {};
  const candidate = (report.candidates ?? [])[dossier.itineraryCandidateIndex ?? 0] ?? {};
  const headings = (dossier.memo?.markdown ?? '').match(/^##\s+.+$/gm) ?? [];
  const parts = [
    [!!dossier.memo?.headline && headings.length > 0, 0.2, 'memo headline and sections'],
    [requiredMemoSections.every(pattern => headings.some(heading => pattern.test(heading))), 0.3, 'all required memo sections'],
    [!!candidate.ratings?.value?.comparison && !!candidate.ratings?.value?.changeCondition, 0.2, 'value compared with a named alternative and a change condition'],
    [Array.isArray(dossier.actions) && dossier.actions.length >= 2 && dossier.actions.every(action => action.decisionImpact), 0.2, 'actions say what each result changes'],
    [['viable', 'conditional', 'not_recommended'].includes(dossier.verdict), 0.1, 'explicit verdict']
  ];
  return { score: parts.reduce((sum, [ok, weight]) => sum + (ok ? weight : 0), 0), note: parts.filter(([ok]) => !ok).map(([, , label]) => `missing ${label}`).join('; ') || 'complete' };
}

function narrativeDepth(report) {
  const words = memoWordCount(report.dossier?.memo?.markdown);
  const length = words <= 0 ? 0 : words < 1500 ? clamp(words / 1500) : words <= 3000 ? 1 : clamp(1 - (words - 3000) / 3000);
  const visits = (report.dossier?.itinerary ?? []).flatMap(day => day.visits ?? []);
  const reasoned = visits.length ? ratio(visits.filter(visit => visit.significance && visit.whyVisit && String(visit.whyVisit).split(/\s+/).length >= 12).length, visits.length) : 0;
  return { score: length * 0.6 + reasoned * 0.4, note: `${words} memo words, ${visits.length} visits` };
}

function entryReadiness(report) {
  const entry = report.dossier?.entry;
  if (!entry) return { score: 0, note: 'No entry block' };
  const resolved = entry.feasibleByDepart !== null && entry.leadTimeDays !== null;
  return { score: (resolved ? 1 : 0.5) * (entry.feasibleByDepart === false ? 0.8 : 1), note: resolved ? 'lead time and feasibility stated' : 'entry feasibility unresolved' };
}

function lodgingFit(report) {
  const lodging = report.dossier?.lodging ?? [];
  if (!lodging.length) return { score: 0, note: 'No lodging shortlist' };
  const rated = lodging.filter(item => item.guestRating && item.nightlyUsd).length;
  const chase = lodging.some(item => ['the-edit', 'chase-travel-portal'].includes(item.chaseTravel));
  return { score: clamp(ratio(rated, Math.max(lodging.length, 2)) * 0.7 + (chase ? 0.3 : 0.1)), note: `${lodging.length} properties, ${chase ? 'a Chase Travel match' : 'no confirmed Chase Travel match'}` };
}

function voices(report) {
  const items = report.dossier?.travelerVoices ?? [];
  return { score: clamp(items.length / 4), note: `${items.length} voices` };
}

function itineraryRealism(report) {
  const days = report.dossier?.itinerary ?? [];
  if (!days.length) return { score: 0, note: 'No itinerary' };
  const complete = days.filter(day => day.transfer && day.weatherAlternative && (day.visits?.length || day.travelDayReason)).length;
  return { score: ratio(complete, days.length), note: `${complete} of ${days.length} days have transfer, fallback and purpose` };
}

export function scoreDossier(report) {
  const raw = { priceGrounding: priceGrounding(report), decisionClarity: decisionClarity(report), narrativeDepth: narrativeDepth(report), entryReadiness: entryReadiness(report), lodgingFit: lodgingFit(report), travelerVoices: voices(report), itineraryRealism: itineraryRealism(report) };
  const breakdown = dimensions.map(({ key, label, max }) => ({ key, label, max, points: Math.round(raw[key].score * max * 10) / 10, note: raw[key].note }));
  const total = Math.round(breakdown.reduce((sum, item) => sum + item.points, 0));
  const grade = total >= 80 ? 'Decision-ready' : total >= 60 ? 'Useful, with gaps' : total >= 35 ? 'Needs rework' : 'Not decision-useful';
  return { total, grade, breakdown, weakest: [...breakdown].sort((a, b) => a.points / a.max - b.points / b.max).slice(0, 2).map(item => item.label) };
}

function main() {
  const local = path.join(project, 'local');
  const trip = read(path.join(local, 'trip.json'));
  const state = read(path.join(local, 'research', 'state.json'));
  const rows = [];
  for (const destination of trip.destinations) {
    const id = destinationId(destination);
    const record = state.destinations?.[id];
    const reportPath = (record?.assessment ?? record?.artifact)?.reportPath;
    if (!reportPath) { rows.push({ destination: destination.name, status: record?.status ?? 'pending', total: null, grade: 'Not researched' }); continue; }
    const result = scoreDossier(read(path.join(local, reportPath)));
    rows.push({ destination: destination.name, status: record.status, ...result });
  }
  fs.mkdirSync(path.join(local, 'decision'), { recursive: true });
  fs.writeFileSync(path.join(local, 'decision', 'usefulness.json'), `${JSON.stringify({ asOf: new Date().toISOString(), rows }, null, 2)}\n`);
  for (const row of [...rows].sort((a, b) => (b.total ?? -1) - (a.total ?? -1))) console.log(`${String(row.total ?? '-').padStart(3)}  ${row.grade.padEnd(20)} ${row.destination}${row.weakest ? `  (weakest: ${row.weakest.join(', ')})` : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
