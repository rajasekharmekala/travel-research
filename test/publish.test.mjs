import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validate, validateReviews, hash, render, evidenceHash } from '../scripts/publish.mjs';
import { sectionKeys, comparisonReadiness } from '../scripts/dossier.mjs';
import { reconcile, destinationId, digest } from '../scripts/research-store.mjs';
import { applyReviewPolicy } from '../scripts/review-policy.mjs';
import { readArtifact, promoteDestination, validateComparisonInputs } from '../scripts/research-artifacts.mjs';
import { claimDestination, checkpointDestination, recordReviewRound } from '../scripts/research-store.mjs';
import { buildPages } from '../scripts/build-pages.mjs';

const now = new Date('2026-10-09T12:00:00Z');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-publish-test-'));
fs.writeFileSync(path.join(directory, 'flight.txt'), 'SYNTHETIC TEST EVIDENCE');
fs.writeFileSync(path.join(directory, 'hotel.txt'), 'SYNTHETIC TEST EVIDENCE');
process.on('exit', () => fs.rmSync(directory, { recursive: true, force: true }));
const trip = { travelers: 2, currency: 'USD', destinations: [{ name: 'Test destination' }], originAirports: ['SFO'], dateWindows: [{ depart: '2026-12-23', return: '2027-01-02' }] };
const config = { jobs: { discovery: { researcherModel: 'research-test' } }, reviewers: { source: { model: 'source-test' }, value: { model: 'value-test' } } };
function report() {
  return { job: 'discovery', status: 'ok', summary: 'TEST ONLY', model: 'research-test', modelEvidence: 'TEST runtime evidence', browser: { privateContextVerified: true, verificationMethod: 'browser-control', isolationEvidence: 'TEST private window control and fresh session' }, coverage: ['Test destination'], destinationChecks: [{ destination: 'Test destination', status: 'priced', reason: 'Synthetic test only' }], stopReason: 'Synthetic run completed', nextActions: [], limitations: [], candidates: [{ destination: 'Test destination', origin: 'SFO', travelers: 2, currency: 'USD', depart: '2026-12-23', return: '2027-01-02', priceType: 'observed', observedAt: now.toISOString(), costs: { flights: 3000, hotels: 2000, meals: 500, groundTransport: 200, activities: 300, insuranceAndContingency: 500 }, totalUsd: 6500, quoteChecks: { flight: { travelers: 2, depart: '2026-12-23', return: '2027-01-02', currency: 'USD', partyTotalUsd: 3000, baggageIncluded: true, taxesIncluded: true, airlineDirectRechecked: true, conditions: 'TEST' }, hotel: { guests: 2, checkIn: '2026-12-23', checkOut: '2027-01-02', nights: 10, currency: 'USD', stayTotalUsd: 2000, taxesAndFeesIncluded: true, property: 'TEST', room: 'TEST', cancellation: 'TEST' } }, flightDetails: 'TEST', hotelDetails: 'TEST', reason: 'TEST', compromises: 'TEST', eligibility: 'Unknown', recommendation: 'Compare only', sources: ['https://example.com/flight', 'https://example.com/hotel'], evidence: ['flight.txt', 'hotel.txt'] }] };
}
function receipts(draftHash) { return ['source', 'value'].map(role => ({ role, model: config.reviewers[role].model, runtimeEvidence: 'TEST fresh context', draftSha256: draftHash, evidenceSha256: 'test-evidence-hash', verdict: 'approve', findings: ['TEST only'] })); }

test('valid fixture passes structural validation and explicit independent reviews', () => {
  const draft = report();
  validate(draft, config, trip, directory, now);
  validateReviews(receipts(hash(JSON.stringify(draft))), config, draft, hash(JSON.stringify(draft)), 'test-evidence-hash');
});
test('auto model and unverified private context are rejected', () => {
  const automatic = report(); automatic.model = 'auto';
  assert.throws(() => validate(automatic, config, trip, directory, now), /model/);
  const shared = report(); shared.browser.privateContextVerified = false;
  assert.throws(() => validate(shared, config, trip, directory, now), /private/);
});
test('stale evidence, changed totals, and escaped evidence paths fail', () => {
  const stale = report(); stale.candidates[0].observedAt = '2026-10-01T12:00:00Z';
  assert.throws(() => validate(stale, config, trip, directory, now), /Stale/);
  const total = report(); total.candidates[0].totalUsd = 1;
  assert.throws(() => validate(total, config, trip, directory, now), /cost/);
  const outside = report(); outside.candidates[0].evidence[0] = '../outside.txt';
  assert.throws(() => validate(outside, config, trip, directory, now), /Evidence/);
});
test('missing, rejected, or outdated review receipts block publication', () => {
  assert.throws(() => validateReviews([], config, report(), 'hash'), /approval/);
  const rejected = receipts('hash'); rejected[0].verdict = 'reject';
  assert.throws(() => validateReviews(rejected, config, report(), 'hash'), /approval/);
  assert.throws(() => validateReviews(receipts('old-hash'), config, report(), 'new-hash'), /approval/);
});
test('rendering escapes untrusted text and has no executable scripts', () => {
  const draft = report(); draft.summary = '<script>alert(1)</script>';
  const html = render(draft, receipts('hash'));
  assert(!html.includes('<script>'));
  assert(html.includes('&lt;script&gt;'));
  assert(html.includes('Review and limitations'));
  assert(html.includes('Review and limitations'));
});
test('configured fallback reviewers require disclosure', () => {
  const fallbackConfig = structuredClone(config);
  fallbackConfig.reviewers.source.fallbackModel = 'fallback-test';
  const approvals = receipts('hash');
  approvals[0].model = 'fallback-test';
  assert.throws(() => validateReviews(approvals, fallbackConfig, report(), 'hash', 'test-evidence-hash'), /approval/);
  approvals[0].fallbackReason = 'Primary runtime unavailable';
  validateReviews(approvals, fallbackConfig, report(), 'hash', 'test-evidence-hash');
  approvals[0].model = 'unconfigured-model';
  assert.throws(() => validateReviews(approvals, fallbackConfig, report(), 'hash', 'test-evidence-hash'), /approval/);
});

test('draft-only model uncertainty permits a disclosed draft, not unreviewed publication', () => {
  const draft = report();
  draft.configuredModel = 'research-test';
  draft.model = null;
  draft.modelEvidence = null;
  assert.throws(() => validate(draft, config, trip, directory, now), /limitation/);
  draft.limitations.push('Actual researcher model identity is unverified; configured model is not runtime proof.');
  validate(draft, config, trip, directory, now);
  assert.throws(() => validateReviews([], config, draft, 'hash'), /approval/);
});

test('known researcher mismatches and unsupported isolation proof are rejected', () => {
  const mismatch = report(); mismatch.configuredModel = 'research-test'; mismatch.model = 'wrong-test';
  assert.throws(() => validate(mismatch, config, trip, directory, now), /mismatch/);
  const browser = report(); delete browser.browser.verificationMethod;
  assert.throws(() => validate(browser, config, trip, directory, now), /private/);
});

test('regular canvas requires policy consent, unknown isolation disclosure, and safeguards', () => {
  const approved = structuredClone(config);
  approved.privateBrowserRequired = false;
  approved.researchPolicy = { allowRegularBrowser: true };
  const draft = report();
  draft.browser = { privateContextVerified: false, verificationMethod: 'regular-canvas', isolation: 'unknown', isolationEvidence: null, safeguards: { noLogin: true, noAccountAccess: true, noProfileInspection: true, stopOnAuthentication: true } };
  draft.limitations.push('Regular browser canvas used; cookie and login isolation are unknown.');
  validate(draft, approved, trip, directory, now);
  assert.throws(() => validate(draft, config, trip, directory, now), /browser/);
  const undisclosed = structuredClone(draft); undisclosed.limitations = [];
  assert.throws(() => validate(undisclosed, approved, trip, directory, now), /browser/);
  const unsafe = structuredClone(draft); unsafe.browser.safeguards.stopOnAuthentication = false;
  assert.throws(() => validate(unsafe, approved, trip, directory, now), /browser/);
  const falsePrivacy = structuredClone(draft); falsePrivacy.browser.isolation = 'private';
  assert.throws(() => validate(falsePrivacy, approved, trip, directory, now), /browser/);
  assert.throws(() => validateReviews([], approved, draft, 'hash'), /approval/);
});

test('observed quotes reject one adult, wrong hotel dates and excluded fees', () => {
  for (const change of [draft => { draft.candidates[0].quoteChecks.flight.travelers = 1; }, draft => { draft.candidates[0].quoteChecks.hotel.checkIn = '2026-12-24'; }, draft => { draft.candidates[0].quoteChecks.hotel.taxesAndFeesIncluded = false; }]) {
    const draft = report(); change(draft);
    assert.throws(() => validate(draft, config, trip, directory, now), /Observed/);
  }
});
test('full coverage accountability and honest estimate-only publication are enforced', () => {
  const incomplete = report(); incomplete.destinationChecks = [];
  assert.throws(() => validate(incomplete, config, trip, directory, now), /ledger/);
  const lead = report(); lead.candidates[0].priceType = 'estimate'; lead.destinationChecks[0].status = 'lead';
  validate(lead, config, trip, directory, now);
  assert.doesNotThrow(() => validateReviews(receipts('hash'), config, lead, 'hash', 'test-evidence-hash'));
  assert.throws(() => validateReviews([], config, lead, 'hash', 'test-evidence-hash'), /approval/);
});

test('review evidence must match the reviewed capture', () => {
  assert.throws(() => validateReviews(receipts('hash'), config, report(), 'hash', 'changed-evidence'), /evidence hash/);
});

test('changing captured evidence changes the approval bundle hash', () => {
  const draft = report();
  const before = evidenceHash(draft, directory);
  fs.writeFileSync(path.join(directory, 'flight.txt'), 'CHANGED SYNTHETIC TEST EVIDENCE');
  const after = evidenceHash(draft, directory);
  assert.notEqual(before, after);
  fs.writeFileSync(path.join(directory, 'flight.txt'), 'SYNTHETIC TEST EVIDENCE');
});

test('unverified leads have no comparable headline trip total', () => {
  const draft = report();
  draft.candidates[0].priceType = 'estimate';
  const html = render(draft);
  assert(html.includes('Not comparable yet'));
  assert(html.includes('No comparable two-traveler'));
  assert(!html.includes('$6,500'));
  assert(html.includes('UNREVIEWED DRAFT'));
});

test('all four configured passes must approve the same evidence', () => {
  const four = structuredClone(config);
  four.reviewPolicy = { passes: ['source', 'consistency', 'coverage', 'opportunities'], max_rounds: 4 };
  four.reviewers = Object.fromEntries(four.reviewPolicy.passes.map(role => [role, { model: 'qwen-test' }]));
  const approvals = four.reviewPolicy.passes.map(role => ({ role, model: 'qwen-test', runtimeEvidence: 'TEST fresh actual identity', draftSha256: 'hash', evidenceSha256: 'evidence', round: 1, verdict: 'approve', findings: [] }));
  const draft = report();
  const destinations = draft.destinationChecks.map(item => item.destination);
  const reviewTrip = { destinations };
  const coverage = approvals.find(receipt => receipt.role === 'coverage');
  coverage.destinationAssessments = draft.destinationChecks.map(item => ({ ...item, nextAction: 'Recheck before booking' }));
  assert.throws(() => validateReviews(approvals.filter(receipt => receipt.role !== 'opportunities'), four, draft, 'hash', 'evidence', reviewTrip), /opportunities/);
  validateReviews(approvals, four, draft, 'hash', 'evidence', reviewTrip);
  coverage.destinationAssessments = [];
  assert.throws(() => validateReviews(approvals, four, draft, 'hash', 'evidence', reviewTrip), /every/);
  coverage.destinationAssessments = draft.destinationChecks.map(item => ({ ...item, nextAction: 'Recheck before booking' }));
  coverage.destinationAssessments[0].status = 'not_checked';
  draft.destinationChecks[0].status = 'not_checked';
  assert.throws(() => validateReviews(approvals, four, draft, 'hash', 'evidence', reviewTrip), /Unchecked/);
  draft.destinationChecks[0].status = 'priced';
  coverage.destinationAssessments[0].status = 'priced';
  approvals[0].findings = [{ severity: 'high', message: 'Wrong party size', resolved: false }];
  assert.throws(() => validateReviews(approvals, four, draft, 'hash', 'evidence', reviewTrip), /Unresolved/);
  approvals[0].findings = [];
  approvals[0].round = 5;
  assert.throws(() => validateReviews(approvals, four, draft, 'hash', 'evidence', reviewTrip), /cap/);
});
test('best effort cannot be displayed as reviewed approval', () => {
  const draft = report();
  draft.bestEffort = { reason: 'Reviewer unavailable', roundsCompleted: 0, missingPasses: ['source'], unresolvedFindings: [{ severity: 'medium', message: 'Weather evidence incomplete' }] };
  const html = render(draft, receipts('hash'));
  assert(html.includes('BEST EFFORT'));
  assert(html.includes('Weather evidence incomplete'));
  assert(!html.includes('Reviewed comparison'));
});

function destinationReport() {
  const draft = report();
  draft.job = 'destination';
  draft.destinationId = destinationId(trip.destinations[0]);
  draft.tripSha256 = digest(trip);
  draft.dossier = {
    verdict: 'conditional', thesis: 'SYNTHETIC TEST ONLY', unresolved: ['Documents unknown'], nextChecks: ['Recheck eligibility'], itineraryCandidateIndex: 0,
    sections: sectionKeys.map(key => ({ key, text: 'SYNTHETIC ANALYSIS', sources: ['https://example.com/source'], evidence: ['hotel.txt'], observedAt: now.toISOString(), ...(key === 'climate_and_weather' ? { weatherBasis: 'climatology', regionalVariation: 'TEST variation', forecastLimitations: 'Not a trip forecast' } : {}) })),
    itinerary: Array.from({ length: 11 }, (_, index) => ({ date: new Date(Date.parse('2026-12-23') + index * 86400000).toISOString().slice(0, 10), location: 'TEST', plan: 'TEST', lodging: 'TEST', transfer: 'TEST', weatherAlternative: 'TEST', evidence: ['hotel.txt'] }))
  };
  return draft;
}

test('destination dossiers validate full analysis without claiming all-destination discovery', () => {
  const draft = destinationReport();
  validate(draft, config, trip, directory, now);
  draft.dossier.sections.pop();
  assert.throws(() => validate(draft, config, trip, directory, now), /every analysis section/);
});

test('dossier itinerary, weather distinction and trip fingerprint are enforced', () => {
  const draft = destinationReport();
  draft.dossier.itinerary.pop();
  assert.throws(() => validate(draft, config, trip, directory, now), /every travel day/);
  const weather = destinationReport();
  delete weather.dossier.sections.find(section => section.key === 'climate_and_weather').forecastLimitations;
  assert.throws(() => validate(weather, config, trip, directory, now), /Weather/);
  const changed = destinationReport(); changed.tripSha256 = 'old';
  assert.throws(() => validate(changed, config, trip, directory, now), /fingerprint/);
});

test('all dossier section evidence is included in review hashes and cannot escape the run', () => {
  const draft = destinationReport();
  fs.writeFileSync(path.join(directory, 'weather.txt'), 'SYNTHETIC WEATHER');
  draft.dossier.sections[0].evidence = ['weather.txt'];
  const before = evidenceHash(draft, directory);
  fs.writeFileSync(path.join(directory, 'weather.txt'), 'SYNTHETIC WEATHER CHANGED');
  assert.notEqual(evidenceHash(draft, directory), before);
  draft.dossier.sections[0].evidence = ['../outside'];
  assert.throws(() => validate(draft, config, trip, directory, now), /Dossier evidence/);
});

test('four staged passes require genuinely distinct context evidence and scoped coverage', () => {
  const policy = { model: 'qwen-test', passes: ['source', 'consistency', 'coverage', 'opportunities'], max_rounds: 4, require_validator_pass: true };
  const settings = applyReviewPolicy(config, policy);
  const draft = destinationReport();
  const reviews = policy.passes.map(role => ({ role, model: policy.model, modelEvidence: 'SYNTHETIC runtime identity', runtimeEvidence: 'SYNTHETIC', contextId: role, contextEvidence: 'SYNTHETIC fresh session', verdict: 'approve', draftSha256: 'draft', evidenceSha256: 'evidence', round: 1, findings: [], ...(role === 'coverage' ? { destinationAssessments: [{ destination: trip.destinations[0].name, status: 'priced', reason: 'TEST', nextAction: 'TEST' }] } : {}) }));
  validateReviews(reviews, settings, draft, 'draft', 'evidence', trip);
  reviews[1].contextId = reviews[0].contextId;
  assert.throws(() => validateReviews(reviews, settings, draft, 'draft', 'evidence', trip), /distinct context/);
});

test('historical dossiers remain usable but comparison prices remain short-lived', () => {
  const draft = destinationReport();
  const later = new Date(now.getTime() + 3 * 86400000);
  assert.throws(() => validate(draft, config, trip, directory, later), /Stale/);
  validate(draft, config, trip, directory, later, { historicalPrices: true });
  const comparison = report(); comparison.job = 'comparison';
  comparison.configuredModel = 'research-test';
  const settings = { ...config, jobs: { ...config.jobs, comparison: { researcherModel: 'research-test' } } };
  assert.throws(() => validate(comparison, settings, trip, directory, later, { historicalPrices: true }), /Stale/);
});

test('comparison revalidates approved dossier receipts and detects changed evidence end to end', () => {
  const local = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'travel-artifact-flow-')));
  try {
    const run = path.join(local, 'runs/synthetic');
    fs.mkdirSync(path.join(run, 'review'), { recursive: true });
    for (const file of ['flight.txt', 'hotel.txt']) fs.writeFileSync(path.join(run, file), 'SYNTHETIC EVIDENCE ONLY');
    const policy = { model: 'qwen-test', passes: ['source', 'consistency', 'coverage', 'opportunities'], max_rounds: 4, require_validator_pass: true };
    const settings = applyReviewPolicy({ ...config, pipeline: { requireReviewedDossiers: true } }, policy);
    const draft = destinationReport();
    const filename = path.join(run, 'draft.json');
    fs.writeFileSync(filename, JSON.stringify(draft));
    let artifact = readArtifact(local, filename, settings, trip, { now });
    const reviews = policy.passes.map(role => ({ role, model: policy.model, modelEvidence: 'SYNTHETIC identity', runtimeEvidence: 'SYNTHETIC runtime', contextId: role, contextEvidence: 'SYNTHETIC fresh context', round: 1, verdict: 'approve', draftSha256: artifact.draftSha256, evidenceSha256: artifact.evidenceSha256, findings: [], ...(role === 'coverage' ? { destinationAssessments: [{ destination: trip.destinations[0].name, status: 'priced', reason: 'TEST', nextAction: 'TEST' }] } : {}) }));
    for (const receipt of reviews) fs.writeFileSync(path.join(run, 'review', `${receipt.role}.review.json`), JSON.stringify(receipt));
    const state = reconcile(null, trip);
    const record = claimDestination(state, { runId: 'synthetic', now: now.toISOString() });
    checkpointDestination(state, { id: record.id, token: record.lease.token, runId: 'synthetic', outcome: 'awaiting_review', artifact, now: now.toISOString() });
    const publicWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-public-artifact-'));
    try {
      fs.cpSync(local, path.join(publicWorkspace, 'local'), { recursive: true });
      fs.rmSync(path.join(publicWorkspace, 'local/runs/synthetic/review/source.review.json'));
      fs.mkdirSync(path.join(publicWorkspace, 'local/research'), { recursive: true });
      fs.mkdirSync(path.join(publicWorkspace, '.agents/config'), { recursive: true });
      fs.writeFileSync(path.join(publicWorkspace, 'local/trip.json'), JSON.stringify(trip));
      fs.writeFileSync(path.join(publicWorkspace, 'local/automation.json'), JSON.stringify(config));
      fs.writeFileSync(path.join(publicWorkspace, 'local/research/state.json'), JSON.stringify(state));
      fs.writeFileSync(path.join(publicWorkspace, '.agents/config/reviewer.json'), JSON.stringify(policy));
      assert.equal(buildPages(publicWorkspace).publicAssessments, 1);
      const pageFile = fs.readdirSync(path.join(publicWorkspace, 'docs/destinations')).find(file => !/^[a-f0-9]{16}\.html$/.test(file));
      const publicPage = fs.readFileSync(path.join(publicWorkspace, 'docs/destinations', pageFile), 'utf8');
      assert.match(publicPage, /Your Action Plan/);
      assert.match(publicPage, /Provisional research/);
      assert.equal(publicPage.includes('local/runs'), false);
      fs.writeFileSync(path.join(publicWorkspace, 'local/runs/synthetic/hotel.txt'), 'CHANGED EVIDENCE');
      assert.throws(() => buildPages(publicWorkspace), /checkpoint/);
    } finally { fs.rmSync(publicWorkspace, { recursive: true, force: true }); }
    recordReviewRound(state, { id: record.id, draftSha256: artifact.draftSha256, evidenceSha256: artifact.evidenceSha256, round: 1, attempts: policy.passes.map(role => ({ role, status: 'approve', evidence: 'SYNTHETIC receipt' })) }, 4);
    artifact = readArtifact(local, filename, settings, trip, { reviewed: true, now });
    promoteDestination(state, artifact, settings, now);
    const comparison = { tripSha256: digest(trip), comparisonInputs: [{ id: record.id, draftSha256: artifact.draftSha256, evidenceSha256: artifact.evidenceSha256 }] };
    assert.equal(validateComparisonInputs(comparison, state, trip, settings, local, now).ready, true);
    assert.equal(validateComparisonInputs(comparison, state, trip, settings, local, new Date(now.getTime() + 3 * 86400000)).ready, true);
    fs.writeFileSync(path.join(run, 'hotel.txt'), 'SYNTHETIC CHANGED EVIDENCE');
    assert.throws(() => validateComparisonInputs(comparison, state, trip, settings, local, now), /evidence hash/);
  } finally { fs.rmSync(local, { recursive: true, force: true }); }
});

test('historical dossiers survive appended destinations but not changed trip constraints or removals', () => {
  const draft = destinationReport();
  const expanded = { ...trip, destinations: [...trip.destinations, { name: 'Switzerland', airports: ['ZRH'], style: 'winter scenery' }] };
  assert.throws(() => validate(draft, config, expanded, directory, now), /fingerprint/);
  const beforeRemoval = { ...draft, tripSha256: digest(expanded) };
  assert.throws(() => validate(beforeRemoval, config, trip, directory, now, { historicalPrices: true }), /fingerprint/);
  assert.doesNotThrow(() => validate(draft, config, expanded, directory, now, { historicalPrices: true }));
  assert.throws(() => validate(draft, config, { ...expanded, budget: { ...trip.budget, targetUsd: 9999 } }, directory, now, { historicalPrices: true }), /fingerprint/);
});
