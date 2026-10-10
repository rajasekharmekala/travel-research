import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHome, renderDestination, themeCss } from '../scripts/portal-view.mjs';
import { render } from '../scripts/publish.mjs';

const trip = { travelers: 2, coreHoliday: { start: '2026-12-23', end: '2027-01-02' }, originAirports: ['SFO'], budget: { targetUsd: 6000, provisionalCeilingUsd: 7000 }, unresolved: ['TEST documents unknown'] };
const entry = { id: 'test', status: 'awaiting_review', destination: { name: 'TEST <destination>', style: 'TEST food' }, report: { job: 'destination', coverage: ['TEST <destination>'], limitations: ['TEST limitation'], candidates: [{ origin: 'SFO', depart: '2026-12-23', return: '2027-01-02', travelers: 2, observedAt: '2026-10-09T12:00:00Z', priceType: 'observed', costs: { flights: 3000, hotels: 2000 }, totalUsd: 5000 }], dossier: { thesis: 'SYNTHETIC UI FIXTURE ONLY', verdict: 'conditional', sections: [{ key: 'decision', text: 'TEST <script>alert(1)</script>', sources: ['https://example.com/test'], observedAt: '2026-10-09T12:00:00Z' }], itinerary: [{ date: '2026-12-23', location: 'TEST location', plan: 'TEST plan', lodging: 'TEST stay', transfer: 'TEST transfer', weatherAlternative: 'TEST indoor alternative' }], unresolved: ['TEST documents'], nextChecks: ['TEST next check'] } } };

test('homepage and every dossier embed exactly the same theme and shell', () => {
  const home = renderHome(trip, [entry]);
  const dossier = renderDestination(entry);
  assert.equal(home.match(/<style>([\s\S]*?)<\/style>/)[1], themeCss);
  assert.equal(dossier.match(/<style>([\s\S]*?)<\/style>/)[1], themeCss);
  for (const page of [home, dossier]) {
    assert.match(page, /class="masthead"/);
    assert.match(page, /class="brand"/);
    assert.match(page, /name="viewport"/);
    assert.match(page, /@media\(max-width:620px\)/);
    assert.doesNotMatch(page, /<script/);
  }
});

test('published destination reports use the catalog theme and best effort stays unapproved', () => {
  const approved = render(entry.report, [{ role: 'source', round: 1 }]);
  assert.ok(approved.includes(`<style>${themeCss}</style>`));
  assert.match(approved, /The Itinerary/);
  const bestEffort = render({ ...entry.report, bestEffort: { reason: 'TEST unavailable' } }, [{ role: 'source', round: 1 }]);
  assert.match(bestEffort, /NOT APPROVED/);
  assert.doesNotMatch(bestEffort, /Four-pass reviewed assessment/);
});

test('dossier text is escaped and shows itinerary, evidence and cost sections', () => {
  const html = renderDestination(entry);
  assert.match(html, /TEST &lt;destination&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Weather plan/);
  assert.match(html, /Party cost breakdown/);
  assert.match(html, /Review And Open Questions/);
  assert.match(html, /NOT APPROVED/);
});

test('pending destinations show real status without invented analysis or approval', () => {
  const html = renderDestination({ id: 'pending', status: 'pending', destination: { name: 'Japan', style: 'Culture' } });
  assert.match(html, /Deep research has not yet produced/);
  assert.doesNotMatch(html, /Four-pass reviewed assessment/);
});

test('homepage separates available research from approval and uses readable dossier links', () => {
  const html = renderHome(trip, [{ ...entry, slug: 'test-destination', publicDossier: { reviewStatus: 'Provisional research: independent review is incomplete.' } }, { id: 'pending', status: 'pending', destination: { name: 'Pending' } }]);
  assert.match(html, /<strong>1 \/ 2<\/strong><span>Research dossiers available/);
  assert.match(html, /<strong>0<\/strong><span>Independently approved/);
  assert.match(html, /Provisional research: independent review is incomplete/);
  assert.match(html, /href="destinations\/test-destination.html"[^>]*>Open dossier/);
});
