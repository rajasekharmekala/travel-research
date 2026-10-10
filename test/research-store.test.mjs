import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reconcile, claimDestination, checkpointDestination, transaction, destinationId, recordReviewRound, requestRevision } from '../scripts/research-store.mjs';
import { promoteDestination, validatePricingEffort } from '../scripts/research-artifacts.mjs';

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
