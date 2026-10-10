import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';
import { projectPublicDossier, renderPublicDossier } from '../scripts/public-dossier.mjs';

 test('Pages build includes all configured destinations, matches the private theme and excludes personal trip data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-public-pages-'));
  try {
    fs.mkdirSync(path.join(root, 'local/portal/media'), { recursive: true });
    fs.writeFileSync(path.join(root, 'local/trip.json'), JSON.stringify({ coreHoliday: { start: 'PRIVATE-DATE-2026-12-23', end: 'PRIVATE-DATE-2027-01-02' }, travelers: 2, originAirports: ['PRIVATE-AIRPORT-SFO'], budget: { targetUsd: 6000 }, documents: { passportNationality: 'PRIVATE-NATIONALITY', usStatus: 'PRIVATE-VISA-H1B' }, unresolved: ['PRIVATE-EMPLOYER-APPROVAL'], destinations: [{ name: 'Japan', style: 'PRIVATE-PREFERENCE-FOOD' }, { name: 'Italy', airports: ['PRIVATE-AIRPORT-FCO'] }] }));
    const result = buildPages(root);
    assert.equal(result.pages, 3);
    assert.equal(result.publicAssessments, 0);
    const home = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8');
    const pageFiles = fs.readdirSync(path.join(root, 'docs/destinations'));
    assert.equal(pageFiles.length, 2);
    const pages = pageFiles.map(file => fs.readFileSync(path.join(root, 'docs/destinations', file), 'utf8'));
    const homeTheme = home.match(/<style>([\s\S]*?)<\/style>/)[1];
    for (const page of pages) {
      assert.equal(page.match(/<style>([\s\S]*?)<\/style>/)[1], homeTheme);
      assert.match(page, /No validated destination research is available yet/);
    }
    for (const content of [home, ...pages]) {
      for (const sensitive of ['PRIVATE-DATE', 'PRIVATE-AIRPORT', 'PRIVATE-NATIONALITY', 'PRIVATE-VISA', 'PRIVATE-EMPLOYER', 'PRIVATE-PREFERENCE', '6000']) assert.equal(content.includes(sensitive), false);
      assert.match(content, /Japan|Italy/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('public research exposes estimates, action plans and review caveats without personal data', () => {
  const trip = { originAirports: ['SFO'], documents: { passportNationality: 'Indian', usStatus: 'H-1B' } };
  const report = {
    candidates: [{ destination: 'Austria and Germany', priceType: 'estimate', observedAt: '2026-10-09T12:00:00Z', reason: 'Museums and food', compromises: 'USD 7,000; long flights from SFO', flightDetails: 'SFO 2026-12-23 baggage unknown', hotelDetails: 'Dec 24 to Jan 2 cancellation unknown' }],
    dossier: { thesis: 'Winter museums', verdict: 'conditional', sections: [{ key: 'decision', text: 'SFO 2026-12-23 USD 7,000 <script>alert(1)</script>', sources: ['https://example.com/place?passport=Indian&date=2026-12-23'] }], itinerary: [{ date: '2026-12-23', location: 'Vienna', plan: 'Visit museum', lodging: 'Central hotel', transfer: 'Rail', weatherAlternative: 'Indoor food market' }], unresolved: ['H-1B passport validity', 'Hotel fees unknown'], nextChecks: ['Recheck flights from SFO 2026-12-23'] },
    limitations: ['No airline-direct recheck']
  };
  const dossier = projectPublicDossier(report, trip, 'Provisional review', ['Live verification unavailable']);
  const html = renderPublicDossier({ destination: { name: 'Austria and Germany' }, publicDossier: dossier });
  for (const sensitive of ['SFO', '2026-12-23', 'USD 7,000', 'H-1B', 'Indian', '?passport=']) assert.equal(html.includes(sensitive), false);
  for (const required of ['Price confidence: Low', 'Value: Conditional', 'Your Action Plan', 'Day 1', 'Hotel fees unknown', 'Live verification unavailable', 'Provisional review']) assert.ok(html.includes(required), required);
  assert.equal(html.includes('<script>'), false);
});
