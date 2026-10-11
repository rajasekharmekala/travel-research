import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTriage, rankTriage, experienceScore } from '../scripts/triage.mjs';

const profile = {
  attested: { budgetCeilingUsd: 7000 },
  scoring: {
    weights: { foodCulture: 0.3, beach: 0.2, winterScenery: 0.15, nature: 0.15, easeOfTravel: 0.2 },
    minExperience: 55,
    finalists: { count: 2, wildcards: 1, maxPerRegion: 1 }
  }
};
const entry = (name, region, score, low, high, overrides = {}) => ({
  name, region,
  journey: { route: 'SFO-XXX', oneWayHours: 10, withinCap: true, source: 'https://example.com/journey' },
  entry: { requirement: 'visa-free with valid US visa', leadTimeDays: 0, feasibleByDec23: true, source: 'https://example.com/entry' },
  decemberFit: { summary: 'Dry season.', source: 'https://example.com/climate' },
  scores: Object.fromEntries(['foodCulture', 'beach', 'winterScenery', 'nature', 'easeOfTravel'].map(key => [key, { score, reason: 'SYNTHETIC' }])),
  costBand: { lowUsd: low, highUsd: high, basis: 'SYNTHETIC arithmetic', sources: ['https://example.com/cost'] },
  verdict: 'finalist', cutReason: null,
  ...overrides
});
const trip = { destinations: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }] };
const triage = () => ({
  schema: 'triage-v1', asOf: '2026-10-10',
  destinations: [
    entry('A', 'mexico', 4, 3000, 4000),
    entry('B', 'mexico', 4, 3200, 4200),
    entry('C', 'asia', 5, 6000, 7500),
    entry('D', 'asia', 5, 4000, 5000, { journey: { route: 'SFO-DDD', oneWayHours: 27, withinCap: false, source: 'https://example.com/journey' } }),
    entry('E', 'europe', 1, 2000, 2500)
  ]
});

test('triage must cover every configured destination with complete evidence fields', () => {
  assert.doesNotThrow(() => validateTriage(triage(), trip));
  const missing = triage(); missing.destinations.pop();
  assert.throws(() => validateTriage(missing, trip), /every configured destination/);
  const badScore = triage(); badScore.destinations[0].scores.beach.score = 6;
  assert.throws(() => validateTriage(badScore, trip), /beach/);
  const noSource = triage(); noSource.destinations[0].entry.source = 'http://insecure.example.com';
  assert.throws(() => validateTriage(noSource, trip), /entry/);
  const silentCut = triage(); silentCut.destinations[4].verdict = 'cut';
  assert.throws(() => validateTriage(silentCut, trip), /cutReason/);
});

test('ranking applies hard cuts, a quality floor, region variety and a quality-led wildcard', () => {
  const result = rankTriage(triage(), profile);
  assert.deepEqual(result.hardCut, [
    { name: 'D', reasons: ['travel time exceeds the cap'] }
  ]);
  assert.ok(!result.finalists.includes('E'), 'low experience score is below the floor');
  assert.deepEqual(result.finalists, ['A', 'C']);
  assert.deepEqual(result.wildcards, ['B']);
  assert.equal(experienceScore(triage().destinations[0], profile.scoring.weights), 80);
});

test('entry that cannot be obtained in time is a hard cut and unknown entry is flagged', () => {
  const data = triage();
  data.destinations[0].entry.feasibleByDec23 = false;
  data.destinations[1].entry.feasibleByDec23 = null;
  const result = rankTriage(data, profile);
  assert.ok(result.hardCut.some(item => item.name === 'A'));
  assert.equal(result.ranked.find(row => row.name === 'B').entryUnknown, true);
});
