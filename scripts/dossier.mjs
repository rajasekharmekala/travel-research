import fs from 'node:fs';
import path from 'node:path';
import { digest, destinationId } from './research-store.mjs';
import { valueLabels, priceConfidenceLabels, costBases } from './presentation.mjs';
import { validateMemo } from './memo.mjs';
import { validateEntry, validateLodging, validateVoices } from './decision-fields.mjs';

export const sectionKeys = ['decision', 'entry_and_transit', 'climate_and_weather', 'experiences_and_closures', 'neighborhoods_and_lodging', 'transport_and_fatigue', 'budget_and_value', 'risks_and_cancellation', 'alternatives_and_pushback'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const publicUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.') && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname); } catch { return false; }
};

export function dossierEvidence(report) {
  return [...new Set([
    ...(report.dossier?.sections ?? []).flatMap(section => [...(section.evidence ?? []), ...(section.paragraphs ?? []).flatMap(paragraph => paragraph.evidence ?? [])]),
    ...(report.dossier?.itinerary ?? []).flatMap(day => [...(day.evidence ?? []), ...(day.visits ?? []).flatMap(visit => visit.evidence ?? [])]),
    ...(report.candidates ?? []).flatMap(candidate => [
      ...Object.values(candidate.costBasis ?? {}).flatMap(line => line.evidence ?? []),
      ...(candidate.pricingEffort?.attempts ?? []).map(attempt => attempt.evidence).filter(Boolean),
      ...Object.values(candidate.pricingEffort?.basis ?? {}).flatMap(line => line.evidence ?? [])
    ])
  ])];
}

export function validateDossier(report, trip, directory, now = new Date(), { allowAppendedDestinations = false } = {}) {
  const destination = trip.destinations.find(item => destinationId(item) === report.destinationId);
  const dossier = report.dossier;
  if (!destination || report.coverage.length !== 1 || report.coverage[0] !== destination.name || report.candidates.some(candidate => candidate.destination !== destination.name)) throw new Error('Dossier must cover exactly its configured destination');
  const matchingTrip = report.tripSha256 === digest(trip) || (allowAppendedDestinations && trip.destinations.some((destination, index) => index < trip.destinations.length - 1 && report.tripSha256 === digest({ ...trip, destinations: trip.destinations.slice(0, index + 1) })));
  if (!matchingTrip) throw new Error('Dossier trip fingerprint is stale');
  if (!dossier || !['viable', 'conditional', 'not_recommended'].includes(dossier.verdict) || !text(dossier.thesis) || !Array.isArray(dossier.unresolved) || !Array.isArray(dossier.nextChecks)) throw new Error('Dossier requires verdict, thesis, unresolved questions and next checks');
  if (!Array.isArray(dossier.sections) || dossier.sections.length !== sectionKeys.length || new Set(dossier.sections.map(section => section.key)).size !== sectionKeys.length) throw new Error('Dossier requires every analysis section exactly once');
  const referenced = new Set();
  for (const section of dossier.sections) {
    if (!sectionKeys.includes(section.key) || !text(section.text) || !Array.isArray(section.sources) || !section.sources.length || !section.sources.every(publicUrl) || !Array.isArray(section.evidence) || !section.evidence.length) throw new Error('Each dossier section requires analysis, public sources and saved evidence');
    if (!Number.isFinite(Date.parse(section.observedAt)) || Date.parse(section.observedAt) > now.getTime() + 300000 || now.getTime() - Date.parse(section.observedAt) > 30 * 86400000) throw new Error('Dossier section evidence must be current within 30 days');
    for (const file of section.evidence) referenced.add(file);
  }
  const climate = dossier.sections.find(section => section.key === 'climate_and_weather');
  if (!['climatology', 'forecast', 'mixed'].includes(climate.weatherBasis) || !text(climate.regionalVariation) || !text(climate.forecastLimitations)) throw new Error('Weather requires climatology/forecast distinction, regional variation and forecast limitations');
  const option = report.candidates[dossier.itineraryCandidateIndex];
  if (!Number.isInteger(dossier.itineraryCandidateIndex) || !option || !Array.isArray(dossier.itinerary)) throw new Error('Itinerary must identify its priced candidate');
  const expectedDays = Math.round((Date.parse(option.return) - Date.parse(option.depart)) / 86400000) + 1;
  if (dossier.itinerary.length !== expectedDays) throw new Error('Itinerary must cover every travel day, including departure and return');
  for (const [index, day] of dossier.itinerary.entries()) {
    if (day.date !== new Date(Date.parse(option.depart) + index * 86400000).toISOString().slice(0, 10) || !['location', 'plan', 'lodging', 'transfer', 'weatherAlternative'].every(key => text(day[key])) || !Array.isArray(day.evidence) || !day.evidence.length) throw new Error('Itinerary days require ordered dates, plan, lodging, transfers, weather alternative and evidence');
    for (const file of day.evidence) referenced.add(file);
  }
  for (const file of referenced) {
    if (typeof file !== 'string') throw new Error('Dossier evidence path required');
    const resolved = path.resolve(directory, file);
    if (!resolved.startsWith(path.resolve(directory) + path.sep) || !fs.existsSync(resolved) || !fs.realpathSync(resolved).startsWith(fs.realpathSync(directory) + path.sep) || !fs.statSync(resolved).isFile() || fs.statSync(resolved).size === 0) throw new Error('Dossier evidence must stay inside its run directory');
  }
  return dossier;
}

export function validateDossierQuality(report) {
  if (report.job !== 'destination') return;
  const evidenceFiles = new Set(report.browser?.evidenceFiles ?? []);
  const sourced = item => Array.isArray(item?.sources) && item.sources.length > 0 && item.sources.every(publicUrl)
    && Array.isArray(item.evidence) && item.evidence.length > 0 && item.evidence.every(file => evidenceFiles.has(file));
  for (const candidate of report.candidates ?? []) {
    const ratings = candidate.ratings;
    if (![...valueLabels, 'Not assessable'].includes(ratings?.value?.label) || !text(ratings.value.rationale)
      || !priceConfidenceLabels.includes(ratings?.priceConfidence?.label) || !text(ratings.priceConfidence.rationale)
      || !text(ratings.value.comparison) || !text(ratings.value.changeCondition)) throw new Error('New dossier requires native explained value and price-confidence ratings, comparison and change condition');
    if (candidate.priceType === 'estimate' && ratings.priceConfidence.label === 'Observed snapshot') throw new Error('Estimated candidate cannot claim fully observed price confidence');
    for (const [key, amount] of Object.entries(candidate.costs ?? {})) {
      const line = candidate.costBasis?.[key];
      if (![...costBases, 'unsupported budget scenario'].includes(line?.basis) || !text(line.calculation) || !text(line.assumptions) || !sourced(line)) throw new Error(`New dossier requires sourced calculation and assumptions for ${key}`);
      if (![line.quantity, line.unitUsd, line.adjustmentsUsd, line.totalUsd].every(Number.isFinite)
        || line.quantity < 0 || line.unitUsd < 0 || Math.abs(line.quantity * line.unitUsd + line.adjustmentsUsd - line.totalUsd) > 0.01
        || Math.abs(line.totalUsd - amount) > 0.01) throw new Error(`Cost arithmetic must reconcile quantity * unitUsd + adjustmentsUsd with ${key} party total`);
      if (line.basis !== 'observed' && (!Number.isFinite(line.rangeUsd?.low) || !Number.isFinite(line.rangeUsd?.high)
        || line.rangeUsd.low < 0 || line.rangeUsd.low > amount || line.rangeUsd.high < amount || !text(line.sensitivity))) throw new Error(`Uncertain ${key} requires a justified rangeUsd and sensitivity`);
    }
    if (Object.values(candidate.costBasis ?? {}).some(line => line.basis === 'unsupported budget scenario')
      && (ratings.value.label !== 'Not assessable' || ratings.priceConfidence.label === 'Observed snapshot')) throw new Error('Unsupported budget scenario cannot support a comparative value rating or observed confidence');
  }
  if (!report.dossier?.memo) throw new Error('New dossier requires an advisor memo (see the advisor-memo skill)');
  validateMemo(report.dossier.memo);
  validateEntry(report.dossier.entry);
  validateLodging(report.dossier.lodging);
  validateVoices(report.dossier.travelerVoices);
  for (const section of report.dossier?.sections ?? []) {
    if (!Array.isArray(section.paragraphs) || !section.paragraphs.length
      || section.paragraphs.some(paragraph => !text(paragraph.text) || !sourced(paragraph))) throw new Error(`New dossier section ${section.key} requires claim-level sourced paragraphs`);
  }
  for (const day of report.dossier?.itinerary ?? []) {
    if (!Array.isArray(day.visits)) throw new Error('New itinerary day requires visits or an explained travel-only day');
    if (!day.visits.length && !text(day.travelDayReason)) throw new Error('Empty itinerary day requires travelDayReason');
    for (const visit of day.visits) {
      if (!['name', 'significance', 'whyVisit', 'duration', 'logistics', 'cost'].every(key => text(visit[key])) || !sourced(visit)) throw new Error('Itinerary visit requires significance, whyVisit, duration, logistics, cost and sources');
    }
  }
  if (!Array.isArray(report.dossier?.actions) || !report.dossier.actions.length
    || report.dossier.actions.some(action => !['High', 'Medium', 'Low'].includes(action.priority)
      || !['check', 'why', 'how', 'decisionImpact'].every(key => text(action[key])))) throw new Error('New dossier requires prioritized actions with why, how and decisionImpact');
}

// Preliminary comparison may use researched dossiers that are approved or still awaiting review; final comparison still requires approval.
// readReportTripSha(record) returns the trip fingerprint stored in the report file, or null if unreadable.
export function preliminaryCoverage(state, trip, readReportTripSha = () => null) {
  const fingerprint = digest(trip);
  const coverage = trip.destinations.map(destination => {
    const record = state?.destinations?.[destinationId(destination)];
    const status = record?.status ?? 'pending';
    const researched = ['approved', 'awaiting_review'].includes(status) && !!(record.artifact ?? record.assessment);
    if (!researched) return { id: destinationId(destination), destination: destination.name, status, researched: false, reason: status };
    const reportSha = readReportTripSha(record);
    const stale = reportSha !== fingerprint;
    return { id: destinationId(destination), destination: destination.name, status, researched: !stale, reason: stale ? 'trip_changed_or_unreadable' : null };
  });
  return { researched: coverage.filter(item => item.researched).length, total: coverage.length, remaining: coverage.filter(item => !item.researched).map(({ destination, reason }) => ({ destination, reason })), coverage };
}

export function comparisonReadiness(state, trip, now = new Date()) {
  const fingerprint = digest(trip);
  const coverage = trip.destinations.map(destination => {
    const record = state?.destinations?.[destinationId(destination)];
    let reason = null;
    if (record?.status !== 'approved') reason = record?.status ?? 'pending';
    else if (record.assessment?.tripSha256 !== fingerprint) reason = 'trip_changed';
    else if (!Number.isFinite(Date.parse(record.assessment?.freshUntil)) || Date.parse(record.assessment.freshUntil) <= now.getTime()) reason = 'stale';
    return { id: destinationId(destination), destination: destination.name, ready: reason === null, reason, assessment: record?.assessment ?? null };
  });
  return { ready: coverage.length > 0 && coverage.every(item => item.ready), tripSha256: fingerprint, coverage };
}
