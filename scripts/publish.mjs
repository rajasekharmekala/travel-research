import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderDestination } from './portal-view.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, 'local');
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const explicit = model => typeof model === 'string' && model.trim().length > 0 && model.toLowerCase() !== 'auto';
function url(value) {
  try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname) && parsed.hostname.includes('.'); } catch { return false; }
}
function evidenceFile(relative, directory) {
  if (typeof relative !== 'string') throw new Error('Evidence path required');
  const filename = path.resolve(directory, relative);
  if (!filename.startsWith(directory + path.sep) || !fs.existsSync(filename) || !fs.realpathSync(filename).startsWith(fs.realpathSync(directory) + path.sep) || !fs.statSync(filename).isFile() || fs.statSync(filename).size === 0) throw new Error('Evidence must be a nonempty file inside the run directory');
}
import { validateDossier, dossierEvidence } from './dossier.mjs';
export function validate(report, config, trip, directory, now = new Date(), { historicalPrices = false } = {}) {
  if (!['discovery', 'comparison', 'destination'].includes(report.job) || !['ok', 'partial'].includes(report.status) || typeof report.summary !== 'string' || !Array.isArray(report.limitations) || !Array.isArray(report.coverage) || !Array.isArray(report.candidates)) throw new Error('Invalid report envelope');
  const desired = config.jobs[report.job === 'destination' ? 'discovery' : report.job].researcherModel;
  const configured = report.configuredModel ?? report.model;
  if (!explicit(desired) || !explicit(configured) || configured !== desired) throw new Error('Explicit configured researcher model required');
  if (report.model != null && (!explicit(report.model) || report.model !== desired || !report.modelEvidence)) throw new Error('Actual researcher model mismatch or missing identity evidence');
  if (report.model == null && !report.limitations.includes('Actual researcher model identity is unverified; configured model is not runtime proof.')) throw new Error('Unknown actual model requires explicit limitation');
  const browser = report.browser;
  const privateVerified = browser?.privateContextVerified === true && ['browser-control', 'runtime-context'].includes(browser.verificationMethod) && typeof browser.isolationEvidence === 'string' && browser.isolationEvidence.trim().length > 0;
  const regularAuthorized = config.researchPolicy?.allowRegularBrowser === true && config.privateBrowserRequired === false && browser?.privateContextVerified === false && browser.verificationMethod === 'regular-canvas' && browser.isolation === 'unknown' && browser.isolationEvidence == null && browser.safeguards?.noLogin === true && browser.safeguards?.noAccountAccess === true && browser.safeguards?.noProfileInspection === true && browser.safeguards?.stopOnAuthentication === true && report.limitations.includes('Regular browser canvas used; cookie and login isolation are unknown.');
  if (!privateVerified && !regularAuthorized) throw new Error('Verified private browser or explicitly authorized regular canvas with safeguards required');
  const names = trip.destinations.map(destination => destination.name);
  if (report.coverage.some(name => !names.includes(name))) throw new Error('Unknown coverage destination');
  if (report.job === 'discovery') {
    if (!Array.isArray(report.destinationChecks) || report.destinationChecks.length !== names.length || new Set(report.destinationChecks.map(check => check.destination)).size !== names.length) throw new Error('Discovery requires one ledger record for every configured destination');
    for (const check of report.destinationChecks) {
      if (!names.includes(check.destination) || !['priced', 'lead', 'blocked', 'not_checked'].includes(check.status) || typeof check.reason !== 'string' || !check.reason.trim()) throw new Error('Invalid destination coverage ledger');
      if (['priced', 'lead'].includes(check.status) !== report.coverage.includes(check.destination)) throw new Error('Coverage and ledger disagree');
    }
    if (!report.stopReason || !Array.isArray(report.nextActions)) throw new Error('Discovery requires stop reason and next actions');
  }
  if (report.job === 'discovery' && report.status === 'ok' && !names.every(name => report.coverage.includes(name))) throw new Error('Full discovery coverage required for ok');
  if (report.status === 'partial' && !report.limitations.length) throw new Error('Partial report requires limitations');
  if (!report.candidates.length) throw new Error('No candidates: save blocked status, do not publish a price report');
  for (const candidate of report.candidates) {
    if (!names.includes(candidate.destination) || !report.coverage.includes(candidate.destination) || !trip.originAirports.includes(candidate.origin) || candidate.travelers !== trip.travelers || candidate.currency !== trip.currency) throw new Error('Candidate outside trip scope');
    if (!trip.dateWindows.some(window => window.depart === candidate.depart && window.return === candidate.return)) throw new Error('Dates outside configured windows');
    if (!['observed', 'estimate'].includes(candidate.priceType)) throw new Error('Invalid price type');
    if (candidate.priceType === 'observed') {
      const flight = candidate.quoteChecks?.flight;
      const hotel = candidate.quoteChecks?.hotel;
      const nights = Math.round((Date.parse(candidate.return) - Date.parse(candidate.depart)) / 86400000);
      if (!flight || flight.travelers !== trip.travelers || flight.depart !== candidate.depart || flight.return !== candidate.return || flight.currency !== trip.currency || flight.partyTotalUsd !== candidate.costs?.flights || flight.baggageIncluded !== true || flight.taxesIncluded !== true || flight.airlineDirectRechecked !== true || !flight.conditions) throw new Error('Observed flights require exact two-traveler airline-direct totals, baggage and taxes');
      if (!hotel || hotel.guests !== trip.travelers || hotel.checkIn !== candidate.depart || hotel.checkOut !== candidate.return || hotel.nights !== nights || hotel.currency !== trip.currency || hotel.stayTotalUsd !== candidate.costs?.hotels || hotel.taxesAndFeesIncluded !== true || !hotel.property || !hotel.room || !hotel.cancellation) throw new Error('Observed hotels require exact-date room, nights, guests and inclusive stay total');
    }
    const time = Date.parse(candidate.observedAt);
    if (!Number.isFinite(time) || now.getTime() - time > (historicalPrices && report.job === 'destination' ? 30 * 86400000 : 86400000) || time > now.getTime() + 300000) throw new Error('Stale price evidence');
    const costs = ['flights', 'hotels', 'meals', 'groundTransport', 'activities', 'insuranceAndContingency'].map(key => candidate.costs?.[key]);
    if (costs.some(cost => !Number.isFinite(cost) || cost < 0) || costs[0] <= 0 || costs[1] <= 0 || costs[5] <= 0 || !Number.isFinite(candidate.totalUsd) || Math.abs(costs.reduce((sum, cost) => sum + cost, 0) - candidate.totalUsd) > 1) throw new Error('Invalid party cost breakdown');
    for (const key of ['flightDetails', 'hotelDetails', 'reason', 'compromises', 'eligibility', 'recommendation']) if (typeof candidate[key] !== 'string' || !candidate[key].trim()) throw new Error(`Missing ${key}`);
    if (!Array.isArray(candidate.sources) || candidate.sources.length < 2 || !candidate.sources.every(url)) throw new Error('Public booking sources required');
    if (!Array.isArray(candidate.evidence) || candidate.evidence.length < 2) throw new Error('Flight and hotel browser evidence required');
    candidate.evidence.forEach(relative => evidenceFile(relative, directory));
    if (candidate.recommendation.toLowerCase() === 'book') throw new Error('Reports may compare, not authorize booking');
  }
  if (report.job === 'destination') validateDossier(report, trip, directory, now);
  return report;
}
import { renderReport } from './report-view.mjs';
export function evidenceHash(report, directory) {
  const files = [...new Set([...report.candidates.flatMap(candidate => candidate.evidence), ...dossierEvidence(report)])].sort();
  return hash(JSON.stringify(files.map(relative => {
    evidenceFile(relative, directory);
    return { file: relative, sha256: hash(fs.readFileSync(path.resolve(directory, relative))) };
  })));
}
import { applyReviewPolicy, validateBestEffort, validateCoverage } from './review-policy.mjs';
export function validateReviews(receipts, config, report, draftHash, capturedEvidenceHash, trip) {
  if (!report.candidates.some(candidate => candidate.priceType === 'observed')) throw new Error('Estimate-only research stays a lead draft; no ranked report publication');
  for (const role of config.reviewPolicy?.passes ?? ['source', 'value']) {
    const receipt = receipts.find(item => item.role === role);
    const settings = config.reviewers[role];
    const primary = receipt?.model === settings.model && explicit(settings.model);
    const fallback = receipt?.model === settings.fallbackModel && explicit(settings.fallbackModel) && typeof receipt?.fallbackReason === 'string' && receipt.fallbackReason.trim().length > 0;
    if (!receipt || (!primary && !fallback) || receipt.verdict !== 'approve' || receipt.draftSha256 !== draftHash || !receipt.runtimeEvidence || !Array.isArray(receipt.findings)) throw new Error(`Missing valid independent ${role} approval`);
    if (!capturedEvidenceHash || receipt?.evidenceSha256 !== capturedEvidenceHash) throw new Error(`Missing matching ${role} evidence hash`);
    if (config.reviewPolicy) {
      if (role === 'coverage') validateCoverage(receipt, report, report.job === 'destination' ? trip?.destinations.filter(destination => destination.name === report.coverage[0]) : trip?.destinations);
      if (!Number.isInteger(receipt.round) || receipt.round < 1 || receipt.round > config.reviewPolicy.max_rounds) throw new Error('Review round outside configured cap');
      for (const finding of receipt.findings) {
        if (!finding || !['critical', 'high', 'medium', 'low'].includes(finding.severity) || typeof finding.message !== 'string' || !finding.message.trim() || typeof finding.resolved !== 'boolean') throw new Error('Configured review findings require structured severity, message and resolution');
        if (!finding.resolved) throw new Error('Unresolved findings cannot receive approved publication');
      }
    }
  }
  if (report.job === 'destination' || report.comparisonInputs) {
    const current = (config.reviewPolicy?.passes ?? []).map(role => receipts.find(receipt => receipt.role === role));
    if (current.length !== 4 || current.some(receipt => !receipt?.contextId?.trim() || !receipt?.contextEvidence?.trim() || !receipt?.modelEvidence?.trim()) || new Set(current.map(receipt => receipt.contextId)).size !== 4) throw new Error('Staged reviews require four distinct context IDs, context evidence and actual model evidence');
  }
  const researcherModel = report.model ?? report.configuredModel;
  if (receipts.every(receipt => receipt.model === researcherModel)) throw new Error('At least one different reviewer model required');
}
export function render(report, receipts = []) {
  if (report.job === 'destination') {
    const passes = report.reviewPasses ?? ['source', 'consistency', 'coverage', 'opportunities'];
    const approved = !report.bestEffort && passes.length === 4 && passes.every(role => receipts.some(receipt => receipt.role === role && receipt.verdict === 'approve'));
    return renderDestination({ destination: { name: report.coverage[0] }, report, status: approved ? 'approved' : 'awaiting_review', receipts: approved ? receipts : [] });
  }
  return renderReport(report, receipts);
}
async function main() {
  const [action, input] = process.argv.slice(2);
  if (!['validate', 'publish', 'publish-best-effort'].includes(action) || !input) throw new Error('Use validate|publish|publish-best-effort <local/runs/.../draft.json>');
  const filename = fs.realpathSync(path.resolve(input));
  if (!filename.startsWith(fs.realpathSync(local) + path.sep + 'runs' + path.sep)) throw new Error('Draft must be in local/runs');
  const bytes = fs.readFileSync(filename);
  const report = JSON.parse(bytes);
  const policy = JSON.parse(fs.readFileSync(path.join(root, '.agents/config/reviewer.json')));
  const config = applyReviewPolicy(JSON.parse(fs.readFileSync(path.join(local, 'automation.json'))), policy);
  const trip = JSON.parse(fs.readFileSync(path.join(local, 'trip.json')));
  const directory = path.dirname(filename);
  validate(report, config, trip, directory);
  if (report.job === 'comparison' && (config.pipeline?.requireReviewedDossiers === true || report.comparisonInputs)) {
    const { validateComparisonInputs } = await import('./research-artifacts.mjs');
    const state = JSON.parse(fs.readFileSync(path.join(local, 'research/state.json')));
    validateComparisonInputs(report, state, trip, config, local);
  }
  if (action === 'validate') { console.log(`PASS: ${hash(bytes)}`); return; }
  const reviewDirectory = path.join(directory, 'review');
  const receipts = policy.passes.flatMap(role => {
    const file = path.join(reviewDirectory, `${role}.review.json`);
    return fs.existsSync(file) ? [JSON.parse(fs.readFileSync(file))] : [];
  });
  let bestEffort = null;
  if (action === 'publish-best-effort') {
    if (!report.candidates.some(candidate => candidate.priceType === 'observed')) throw new Error('Estimate-only research cannot publish best effort');
    bestEffort = validateBestEffort(JSON.parse(fs.readFileSync(path.join(reviewDirectory, 'state.json'))), policy, hash(bytes), evidenceHash(report, directory));
  } else {
    validateReviews(receipts, config, report, hash(bytes), evidenceHash(report, directory), trip);
  }
  const html = render({ ...report, reviewPasses: policy.passes, bestEffort }, receipts);
  const outputName = bestEffort ? 'best-effort.html' : 'report.html';
  fs.writeFileSync(path.join(directory, outputName), html, { mode: 0o600 });
  const reportDirectory = path.join(local, 'reports');
  fs.mkdirSync(reportDirectory, { recursive: true, mode: 0o700 });
  const publicationKey = report.job === 'destination' ? `destination-${report.destinationId}` : report.job;
  fs.writeFileSync(path.join(reportDirectory, `${publicationKey}-${bestEffort ? 'best-effort' : 'latest'}.html`), html, { mode: 0o600 });
  console.log(`${bestEffort ? 'BEST EFFORT — UNAPPROVED' : 'PUBLISHED'}: ${path.join(directory, outputName)}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
