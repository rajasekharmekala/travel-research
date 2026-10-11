import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreDossier, dimensions } from '../scripts/usefulness.mjs';

const section = title => `## ${title}\n\n${'I would stay near the old town because dinner is walkable. '.repeat(25)}`;
const memo = () => ({ headline: 'Go for the food', markdown: ['My recommendation', 'Why this fits', 'How the trip unfolds', 'What it will really cost', 'Where this can go wrong', 'The best alternative'].map(section).join('\n\n') });
const line = (basis, total) => ({ basis, totalUsd: total, rangeUsd: { low: total - 100, high: total + 100 } });
const strong = () => ({
  candidates: [{ ratings: { value: { comparison: 'Beats Spain on food per dollar.', changeCondition: 'Fares above 1,600.' } }, costBasis: { flights: line('observed', 2000), hotels: line('derived', 2000) } }],
  dossier: {
    verdict: 'conditional', itineraryCandidateIndex: 0, memo: memo(),
    actions: [{ decisionImpact: 'Switch to Spain.' }, { decisionImpact: 'Keep Japan.' }],
    entry: { feasibleByDepart: true, leadTimeDays: 5 },
    lodging: [{ guestRating: { score: 9 }, nightlyUsd: 200, chaseTravel: 'the-edit' }, { guestRating: { score: 8.8 }, nightlyUsd: 180, chaseTravel: 'unverified' }],
    travelerVoices: [{}, {}, {}, {}],
    itinerary: [{ transfer: 'Rail', weatherAlternative: 'Museum', visits: [{ significance: 'x', whyVisit: 'Because the market is where the city eats lunch and the stalls change by the hour.' }] }]
  }
});

test('weights add up to 100', () => {
  assert.equal(dimensions.reduce((sum, item) => sum + item.max, 0), 100);
});

test('a complete, evidence-backed dossier scores decision-ready', () => {
  const result = scoreDossier(strong());
  assert.ok(result.total >= 80, `expected 80+, got ${result.total}`);
  assert.equal(result.grade, 'Decision-ready');
});

test('allocations without workings and a missing memo, entry, lodging and voices score as not useful', () => {
  const weak = { candidates: [{ costBasis: { flights: line('estimate', 2400), hotels: line('unsupported budget scenario', 1600) } }], dossier: { verdict: 'conditional', itineraryCandidateIndex: 0, itinerary: [] } };
  const result = scoreDossier(weak);
  assert.ok(result.total < 20, `expected under 20, got ${result.total}`);
  assert.equal(result.grade, 'Not decision-useful');
  assert.equal(result.weakest.length, 2);
});

test('unsupported price lines earn no price credit even when they dominate the total', () => {
  const report = strong();
  report.candidates[0].costBasis = { flights: line('unsupported budget scenario', 4000) };
  assert.ok(scoreDossier(report).breakdown.find(item => item.key === 'priceGrounding').points < 5);
});
