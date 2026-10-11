import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reconcile, claimDestination, checkpointDestination, transaction, destinationId, recordReviewRound, requestRevision } from '../scripts/research-store.mjs';
import { promoteDestination, validatePricingEffort } from '../scripts/research-artifacts.mjs';
import { validateDossierQuality, dossierEvidence } from '../scripts/dossier.mjs';

const trip = { destinations: [{ name: 'Japan' }, { name: 'Portugal' }] };
const now = '2026-10-09T12:00:00Z';

test('runs claim different destinations, resume idempotently, and recover expired work', () => {
  const state = reconcile(null, trip);
  const first = claimDestination(state, { runId: 'first', now });
  assert.equal(claimDestination(state, { runId: 'first', now }).lease.token, first.lease.token);
  const second = claimDestination(state, { runId: 'second', now });
  assert.notEqual(second.id, first.id);
  assert.equal(claimDestination(state, { runId: 'third', now }), null);
  assert.ok(claimDestination(state, { runId: 'third', now: '2026-10-09T15:00:00Z' }));
});

test('checkpoint rejects stale owners and incomplete artifacts', () => {
  const state = reconcile(null, trip);
  const record = claimDestination(state, { runId: 'first', now });
  const request = { id: record.id, token: record.lease.token, runId: 'first', outcome: 'awaiting_review', now };
  assert.throws(() => checkpointDestination(state, { ...request, token: 'wrong' }), /lease/);
  assert.throws(() => checkpointDestination(state, request), /artifact/);
  checkpointDestination(state, { ...request, artifact: { runDir: 'run', draftSha256: 'draft', evidenceSha256: 'evidence' } });
  assert.equal(record.status, 'awaiting_review');
  assert.notEqual(claimDestination(state, { runId: 'second', now }).id, record.id);
});

test('blockers require evidence and retry dates, without monopolizing subsequent runs', () => {
  const state = reconcile(null, trip);
  const record = claimDestination(state, { runId: 'first', now });
  const request = { id: record.id, token: record.lease.token, runId: 'first', outcome: 'blocked', now };
  assert.throws(() => checkpointDestination(state, request), /Blocker/);
  checkpointDestination(state, { ...request, blocker: { reason: 'TEST', evidence: 'TEST browser capture', nextAction: 'TEST retry' }, retryAfter: '2026-10-10T12:00:00Z' });
  assert.notEqual(claimDestination(state, { runId: 'second', now }).id, record.id);
});

test('removed destinations become inactive without losing history', () => {
  const state = reconcile(null, trip);
  const id = destinationId(trip.destinations[0]);
  state.destinations[id].history.push({ event: 'past' });
  const next = reconcile(state, { destinations: [trip.destinations[1]] });
  assert.equal(next.destinations[id].active, false);
  assert.equal(next.destinations[id].history.length, 1);
});

test('promotion binds the current checkpoint and separates price freshness from analysis', () => {
  const state = reconcile(null, trip);
  const record = claimDestination(state, { runId: 'first', now });
  const artifact = { reportPath: 'runs/test/draft.json', runDir: 'runs/test', draftSha256: 'draft', evidenceSha256: 'evidence', report: { job: 'destination', destinationId: record.id, tripSha256: state.tripSha256, candidates: [{ observedAt: now }], dossier: { verdict: 'conditional', sections: [{ observedAt: now }] } } };
  checkpointDestination(state, { id: record.id, token: record.lease.token, runId: 'first', outcome: 'awaiting_review', artifact, now });
  assert.throws(() => promoteDestination(state, { ...artifact, draftSha256: 'changed' }, { reviewPolicy: {} }, new Date(now)), /matching/);
  promoteDestination(state, artifact, { reviewPolicy: {} }, new Date(now));
  assert.equal(record.status, 'approved');
  assert.equal(record.assessment.priceFreshUntil, '2026-10-10T12:00:00.000Z');
  assert.equal(record.assessment.freshUntil, '2026-11-08T12:00:00.000Z');
});

test('atomic store refuses concurrent writers and preserves committed state on failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'travel-store-'));
  try {
    await transaction(root, () => ({ state: reconcile(null, trip), value: 'ok' }));
    await assert.rejects(transaction(root, async state => {
      await assert.rejects(transaction(root, () => ({ state })), /locked/);
      throw new Error('interrupted');
    }), /interrupted/);
    assert.equal(Object.keys(JSON.parse(await readFile(path.join(root, 'state.json'), 'utf8')).destinations).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('persistent review rounds cannot be reset by revisions or mismatched drafts', () => {
  const state = reconcile(null, trip);
  const record = claimDestination(state, { runId: 'first', now });
  const artifact = { runDir: 'runs/test', reportPath: 'runs/test/draft.json', draftSha256: 'draft', evidenceSha256: 'evidence' };
  checkpointDestination(state, { id: record.id, token: record.lease.token, runId: 'first', outcome: 'awaiting_review', artifact, now });
  const attempts = ['source', 'consistency', 'coverage', 'opportunities'].map(role => ({ role, status: 'revise', evidence: 'SYNTHETIC REVIEW' }));
  const review = { id: record.id, draftSha256: 'draft', evidenceSha256: 'evidence', round: 1, attempts, now };
  assert.throws(() => recordReviewRound(state, { ...review, draftSha256: 'changed' }, 4), /checkpoint/);
  recordReviewRound(state, review, 4);
  assert.throws(() => recordReviewRound(state, review, 4), /persistent cap/);
  requestRevision(state, { id: record.id, draftSha256: 'draft', reason: 'TEST feedback', reviewEvidence: 'TEST review', now }, 4);
  assert.equal(record.reviewRounds.length, 1);
  assert.equal(record.status, 'pending');
  const claimed = claimDestination(state, { runId: 'revision', now });
  assert.notEqual(claimed.id, record.id);
  record.status = 'awaiting_review'; record.artifact = artifact;
  for (let round = 2; round <= 4; round += 1) recordReviewRound(state, { ...review, round }, 4);
  assert.throws(() => requestRevision(state, { id: record.id, draftSha256: 'draft', reason: 'TEST', reviewEvidence: 'TEST', now }, 4), /exhausted/);
});

test('staged promotion cannot bypass recorded review rounds', () => {
  const state = reconcile(null, trip);
  const record = claimDestination(state, { runId: 'first', now });
  const artifact = { reportPath: 'runs/test/draft.json', runDir: 'runs/test', draftSha256: 'draft', evidenceSha256: 'evidence', report: { job: 'destination', destinationId: record.id, tripSha256: state.tripSha256, candidates: [{ observedAt: now }], dossier: { verdict: 'conditional', sections: [{ observedAt: now }] } }, receipts: [] };
  checkpointDestination(state, { id: record.id, token: record.lease.token, runId: 'first', outcome: 'awaiting_review', artifact, now });
  const config = { reviewPolicy: {}, pipeline: { requireReviewedDossiers: true } };
  assert.throws(() => promoteDestination(state, artifact, config, new Date(now)), /recorded current/);
  const attempts = ['source', 'consistency', 'coverage', 'opportunities'].map(role => ({ role, status: 'approve', evidence: 'SYNTHETIC' }));
  recordReviewRound(state, { id: record.id, draftSha256: 'draft', evidenceSha256: 'evidence', round: 1, attempts, now }, 4);
  artifact.receipts = attempts.map(attempt => ({ role: attempt.role, round: 1 }));
  promoteDestination(state, artifact, config, new Date(now));
  assert.equal(record.status, 'approved');
});

test('estimate intake requires direct and aggregator checks with hashed evidence and a traceable basis', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'travel-pricing-effort-'));
  try {
    assert.throws(() => validatePricingEffort({ candidates: [{ priceType: 'estimate' }] }, directory), /documented pricingEffort/);
    const attempts = [];
    for (const kind of ['flights', 'hotels']) {
      for (const channel of ['aggregator', 'direct']) {
        const evidence = `${kind}-${channel}.txt`;
        await writeFile(path.join(directory, evidence), 'SYNTHETIC public form capture; exact dates and two travelers; no stable total.');
        attempts.push({ kind, channel, evidence, source: `https://example.com/${kind}/${channel}`, observedAt: now, searchContext: 'SYNTHETIC exact dates, two travelers, USD', result: 'SYNTHETIC total unavailable' });
      }
    }
    const basis = Object.fromEntries(['flights', 'hotels'].map(kind => [kind, { calculation: 'SYNTHETIC reference amount times units', assumptions: 'SYNTHETIC scenario, not a quote', evidence: [`${kind}-aggregator.txt`] }]));
    const report = { browser: { evidenceFiles: attempts.map(attempt => attempt.evidence) }, candidates: [{ priceType: 'estimate', pricingEffort: { attempts, basis } }] };
    assert.doesNotThrow(() => validatePricingEffort(report, directory));
    const missingDirect = structuredClone(report);
    missingDirect.candidates[0].pricingEffort.attempts = attempts.filter(attempt => attempt.kind !== 'hotels' || attempt.channel !== 'direct');
    assert.throws(() => validatePricingEffort(missingDirect, directory), /hotels direct attempt/);
    const missingEvidence = structuredClone(report);
    missingEvidence.browser.evidenceFiles = [];
    assert.throws(() => validatePricingEffort(missingEvidence, directory), /hashed browser evidence/);
    const unsupportedBasis = structuredClone(report);
    unsupportedBasis.candidates[0].pricingEffort.basis.flights.evidence = ['unrelated.txt'];
    assert.throws(() => validatePricingEffort(unsupportedBasis, directory), /traceable flights calculation/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('new dossier quality requires explained ratings, reconciled costs, meaningful visits and decision actions', () => {
  const citation = { sources: ['https://example.com/place'], evidence: ['capture.txt'] };
  const report = {
    job: 'destination', browser: { evidenceFiles: ['capture.txt'] },
    candidates: [{ priceType: 'estimate', costs: { hotels: 1700 }, ratings: {
      value: { label: 'Conditional', rationale: 'Transfer costs may erase savings.', comparison: 'Beachfront costs more but reduces transfers.', changeCondition: 'Choose beachfront if inclusive totals converge.' },
      priceConfidence: { label: 'Partly observed', rationale: 'Room baseline observed; fees incomplete.' }
    }, costBasis: { hotels: { basis: 'derived', calculation: '10 nights * 140 + 300 tax', assumptions: 'No gala charge verified.', quantity: 10, unitUsd: 140, adjustmentsUsd: 300, totalUsd: 1700, rangeUsd: { low: 1700, high: 2000 }, sensitivity: 'Unverified gala fee may add up to 300 in this synthetic scenario.', ...citation } } }],
    dossier: { sections: [{ key: 'decision', paragraphs: [{ text: 'Sourced analysis.', ...citation }] }], itinerary: [{ visits: [{ name: 'Gallery district', significance: 'Local arts concentration.', whyVisit: 'Adds culture beyond the resort.', duration: 'Two hours', logistics: 'Confirm holiday opening.', cost: 'No admission quote.', ...citation }] }], actions: [{ priority: 'High', check: 'Verify gala fee', why: 'It could erase savings.', how: 'Check the direct room rate terms.', decisionImpact: 'Reject this property if inclusive total exceeds the alternative.' }] }
  };
  const memoSections = ['My recommendation', 'Why this trip fits', 'How the trip unfolds', 'What it will really cost', 'Where this can go wrong', 'The best alternative'];
  report.dossier.memo = { headline: 'Go to Vienna for the markets, then slow down', markdown: memoSections.map(title => `## ${title}\n\n${'I would choose this because the days are walkable and the food is the point. '.repeat(20)}`).join('\n\n') };
  report.dossier.entry = { steps: ['Check eligibility', 'Apply', 'Attend'], mechanism: 'visa-free', requirement: 'Visa-free for Indian passport holders with a valid US visa.', leadTimeDays: 0, lastSafeApplyDate: null, feasibleByDepart: true, usVisaDependency: 'Valid US visa required', transit: 'No transit visa', fees: 'None', source: 'https://example.com/entry' };
  const property = name => ({ name, area: 'Old town', tier: 'mid-range', whyHere: 'Walkable to dinner.', chaseTravel: 'unverified', chaseNote: 'Check the portal.', guestRating: { score: 8.9, scale: 10, source: 'Booking.com' }, nightlyUsd: 180, priceBasis: 'Dec 23 public rate', sources: ['https://example.com/hotel'] });
  report.dossier.lodging = [property('Hotel A'), property('Hotel B')];
  report.dossier.travelerVoices = [['https://example.com/a', 'A'], ['https://other.example.org/b', 'B'], ['https://third.example.net/c', 'C']].map(([url, author]) => ({ author, context: 'blog, 2025', takeaway: 'Go early.', url }));
  assert.doesNotThrow(() => validateDossierQuality(report));
  for (const key of ['entry', 'lodging', 'travelerVoices']) {
    const missing = structuredClone(report);
    delete missing.dossier[key];
    assert.throws(() => validateDossierQuality(missing), key === 'entry' ? /entry/ : key === 'lodging' ? /lodging/ : /voices/);
  }
  const withoutMemo = structuredClone(report);
  delete withoutMemo.dossier.memo;
  assert.throws(() => validateDossierQuality(withoutMemo), /advisor memo/);
  const withoutRating = structuredClone(report);
  delete withoutRating.candidates[0].ratings;
  assert.throws(() => validateDossierQuality(withoutRating), /native explained/);
  const wrongTotal = structuredClone(report);
  wrongTotal.candidates[0].costBasis.hotels.unitUsd = 150;
  assert.throws(() => validateDossierQuality(wrongTotal), /arithmetic/);
  const missingSignificance = structuredClone(report);
  delete missingSignificance.dossier.itinerary[0].visits[0].significance;
  assert.throws(() => validateDossierQuality(missingSignificance), /significance/);
  const missingCitation = structuredClone(report);
  missingCitation.dossier.sections[0].paragraphs[0].sources = [];
  assert.throws(() => validateDossierQuality(missingCitation), /claim-level/);
  const missingImpact = structuredClone(report);
  delete missingImpact.dossier.actions[0].decisionImpact;
  assert.throws(() => validateDossierQuality(missingImpact), /decisionImpact/);
  const unsupported = structuredClone(report);
  unsupported.candidates[0].costBasis.hotels.basis = 'unsupported budget scenario';
  assert.throws(() => validateDossierQuality(unsupported), /Unsupported budget scenario/);
  unsupported.candidates[0].ratings.value.label = 'Not assessable';
  assert.doesNotThrow(() => validateDossierQuality(unsupported));
  const travelDay = structuredClone(report);
  travelDay.dossier.itinerary[0].visits = [];
  assert.throws(() => validateDossierQuality(travelDay), /travelDayReason/);
  travelDay.dossier.itinerary[0].travelDayReason = 'Flight arrival and hotel transfer.';
  assert.doesNotThrow(() => validateDossierQuality(travelDay));
  assert.deepEqual(dossierEvidence(report), ['capture.txt']);
  report.dossier.itinerary[0].visits[0].evidence = ['visit.txt'];
  assert.ok(dossierEvidence(report).includes('visit.txt'));
});

test('retry-now clears a blocked timer with a logged reason and leaves approval alone', async () => {
  const { retryNow } = await import('../scripts/research-store.mjs');
  const state = { destinations: { x: { id: 'x', status: 'blocked', retryAfter: '2099-01-01T00:00:00Z', blocker: { reason: 'r' }, history: [] }, y: { id: 'y', status: 'approved', history: [] } } };
  assert.throws(() => retryNow(state, { id: 'y', reason: 'long enough reason' }), /blocked destination/);
  assert.throws(() => retryNow(state, { id: 'x', reason: 'short' }), /blocked destination/);
  const record = retryNow(state, { id: 'x', reason: 'User delegated judgment; timer was self-imposed' });
  assert.equal(record.status, 'pending');
  assert.equal(record.retryAfter, null);
  assert.equal(record.history.at(-1).event, 'retry_now');
  assert.equal(record.history.at(-1).previousRetryAfter, '2099-01-01T00:00:00Z');
});

test('preliminary coverage counts approved and awaiting-review dossiers but not pending, researching or blocked ones', async () => {
  const { preliminaryCoverage } = await import('../scripts/dossier.mjs');
  const { destinationId, digest } = await import('../scripts/research-store.mjs');
  const trip = { destinations: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] };
  const fingerprint = digest(trip);
  const [a, b, c] = trip.destinations.map(destinationId);
  const state = { destinations: {
    [a]: { status: 'awaiting_review', artifact: { reportPath: 'a.json' } },
    [b]: { status: 'approved', assessment: { reportPath: 'b.json' } },
    [c]: { status: 'blocked' }
  } };
  const reports = { [a]: fingerprint, [b]: 'old' };
  const result = preliminaryCoverage(state, trip, record => record.artifact ? reports[a] : reports[b]);
  assert.equal(result.researched, 1);
  assert.equal(result.total, 4);
  assert.deepEqual(result.remaining.map(item => item.reason), ['trip_changed_or_unreadable', 'blocked', 'pending']);
});
