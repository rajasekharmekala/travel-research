import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';
import { projectPublicDossier, renderPublicDossier } from '../scripts/public-dossier.mjs';
import { loadPresentation } from '../scripts/presentation.mjs';
import { pageSlug, pageSlugs } from '../scripts/page-names.mjs';

test('Pages build includes all configured destinations, matches the private theme and excludes personal trip data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-public-pages-'));
  try {
    fs.mkdirSync(path.join(root, 'local/portal/media'), { recursive: true });
    fs.writeFileSync(path.join(root, 'local/trip.json'), JSON.stringify({ coreHoliday: { start: 'PRIVATE-DATE-2026-12-23', end: 'PRIVATE-DATE-2027-01-02' }, travelers: 2, originAirports: ['PRIVATE-AIRPORT-SFO'], budget: { targetUsd: 6000 }, documents: { passportNationality: 'PRIVATE-NATIONALITY', usStatus: 'PRIVATE-VISA-H1B' }, unresolved: ['PRIVATE-EMPLOYER-APPROVAL'], destinations: [{ name: 'Japan', style: 'PRIVATE-PREFERENCE-FOOD' }, { name: 'Italy', airports: ['PRIVATE-AIRPORT-FCO'] }] }));
    const result = buildPages(root);
    assert.equal(result.pages, 3);
    assert.equal(result.publicAssessments, 0);
    const home = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8');
    assert.match(home, /destinations\/japan\.html/);
    assert.match(home, /destinations\/italy\.html/);
    const pageFiles = fs.readdirSync(path.join(root, 'docs/destinations'));
    const readable = pageFiles.filter(file => !/^[a-f0-9]{16}\.html$/.test(file)).sort();
    const legacy = pageFiles.filter(file => /^[a-f0-9]{16}\.html$/.test(file));
    assert.deepEqual(readable, ['italy.html', 'japan.html']);
    assert.equal(legacy.length, 2);
    for (const file of legacy) assert.match(fs.readFileSync(path.join(root, 'docs/destinations', file), 'utf8'), /url=(japan|italy)\.html/);
    const pages = readable.map(file => fs.readFileSync(path.join(root, 'docs/destinations', file), 'utf8'));
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

test('public research shows dates, costs, sources and action plans without trip-purpose wording or query parameters', () => {
  const trip = { originAirports: ['SFO'], documents: { passportNationality: 'Indian', usStatus: 'H-1B' } };
  const report = {
    candidates: [{ destination: 'Austria and Germany', priceType: 'estimate', observedAt: '2026-10-09T12:00:00Z', reason: 'Museums and food for our honeymoon', compromises: 'USD 7,000; long flights from SFO', flightDetails: 'SFO 2026-12-23 baggage unknown', hotelDetails: 'Dec 24 to Jan 2 cancellation unknown', travelers: 2, totalUsd: 6880, costs: { flights: 3334, hotels: 1656 } }],
    dossier: { thesis: 'Winter museums', verdict: 'conditional', sections: [{ key: 'decision', text: 'SFO 2026-12-23 USD 7,000 <script>alert(1)</script>', sources: ['https://www.kayak.com/flights/SFO-VIE/2026-12-23?sort=bestflight_a', 'https://example.com/place?passport=Indian&date=2026-12-23'] }], itinerary: [{ date: '2026-12-23', location: 'Vienna', plan: 'Visit museum', lodging: 'Central hotel', transfer: 'Rail', weatherAlternative: 'Indoor food market' }], unresolved: ['H-1B passport validity', 'Hotel fees unknown'], nextChecks: ['Recheck flights from SFO 2026-12-23'] },
    limitations: ['No airline-direct recheck']
  };
  const dossier = projectPublicDossier(report, trip, 'Provisional review', ['Live verification unavailable']);
  const html = renderPublicDossier({ destination: { name: 'Austria and Germany' }, publicDossier: dossier });
  for (const hidden of ['honeymoon', 'local/', '?passport=', '?sort=']) assert.equal(html.includes(hidden), false, hidden);
  for (const shown of ['SFO', '2026-12-23', 'USD 7,000', 'H-1B', 'for our trip', 'Party cost: USD 6,880', 'KAYAK flight search (SFO to VIE)', 'example.com']) assert.ok(html.includes(shown), shown);
  for (const required of ['Value rating: Not yet rated', 'Your Action Plan', 'Day 1', 'Hotel fees unknown', 'Live verification unavailable', 'Provisional review', 'Decision summary', 'not classified']) assert.ok(html.includes(required), required);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('>decision<'), false);
});

test('rated public research uses sidecar labels, cost basis and credited section images', () => {
  const trip = { originAirports: ['SFO'], documents: {} };
  const report = {
    candidates: [{ destination: 'Austria and Germany', priceType: 'estimate', observedAt: '2026-10-10T05:00:53Z', reason: 'Vienna', compromises: 'Long flight', flightDetails: 'SFO to VIE', hotelDetails: 'Hotel', travelers: 2, totalUsd: 6880, costs: { flights: 3334, meals: 560 } }],
    dossier: { thesis: 'Vienna first.', verdict: 'conditional', sections: [{ key: 'decision', text: 'Summary', sources: [] }], itinerary: [], unresolved: [], nextChecks: [] },
    limitations: []
  };
  const presentation = {
    options: new Map([[0, { ratings: { value: { label: 'Conditional', rationale: 'Fit depends on routing.' }, priceConfidence: { label: 'Partly observed', rationale: 'Flights observed, meals estimated.' } }, costBasis: { flights: { basis: 'partly observed', note: 'Observed fare plus estimated bag.' } } }]]),
    images: { decision: { file: 'example.jpg', alt: 'Test alt', title: 'File:Example.jpg', artist: 'Test Artist', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg' } }
  };
  const html = renderPublicDossier({ destination: { name: 'Austria and Germany' }, publicDossier: projectPublicDossier(report, trip, 'Provisional review', [], presentation) });
  for (const shown of ['Value rating: Conditional', 'Price confidence: Partly observed', 'partly observed', 'Observed fare plus estimated bag.', 'Meals', 'No basis recorded for this line.', 'src="../media/example.jpg"', 'Image: Test Artist, CC BY 4.0', 'Example.jpg on Wikimedia Commons', 'Decision summary']) assert.ok(html.includes(shown), shown);
});

test('presentation sidecar must match the draft, use enumerated labels and reference local media only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-presentation-'));
  try {
    const run = path.join(root, 'run');
    const media = path.join(root, 'media');
    fs.mkdirSync(run, { recursive: true });
    fs.mkdirSync(media, { recursive: true });
    fs.writeFileSync(path.join(media, 'example.jpg'), 'x');
    const base = {
      schema: 'presentation-v1',
      status: 'Researcher-prepared. Not an independent review.',
      draftSha256: 'd1',
      evidenceSha256: 'e1',
      options: [{ candidateIndex: 0, ratings: { value: { label: 'Conditional', rationale: 'Because' }, priceConfidence: { label: 'Partly observed', rationale: 'Mixed' } }, costBasis: { flights: { basis: 'partly observed', note: 'Observed fare plus estimate' } } }],
      images: { decision: { file: 'example.jpg', alt: 'Alt', title: 'File:Example.jpg', artist: 'Artist', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg' } }
    };
    const options = { candidates: [{ costs: { flights: 1 } }], sectionKeys: ['decision'], mediaDirectory: media };
    const artifact = { draftSha256: 'd1', evidenceSha256: 'e1' };
    const write = value => fs.writeFileSync(path.join(run, 'presentation.json'), JSON.stringify(value));
    write(base);
    const loaded = loadPresentation(run, artifact, options);
    assert.equal(loaded.options.get(0).ratings.value.label, 'Conditional');
    assert.equal(loaded.images.decision.file, 'example.jpg');
    write({ ...base, draftSha256: 'other' });
    assert.throws(() => loadPresentation(run, artifact, options), /does not match/);
    write({ ...base, status: 'Approved' });
    assert.throws(() => loadPresentation(run, artifact, options), /not an independent review/);
    write({ ...base, options: [{ ...base.options[0], ratings: { ...base.options[0].ratings, value: { label: 'Great', rationale: 'x' } } }] });
    assert.throws(() => loadPresentation(run, artifact, options), /label must be one of/);
    write({ ...base, options: [{ ...base.options[0], costBasis: { unknownLine: { basis: 'estimate', note: 'x' } } }] });
    assert.throws(() => loadPresentation(run, artifact, options), /not in the draft/);
    write({ ...base, images: { decision: { ...base.images.decision, file: '../secret.jpg' } } });
    assert.throws(() => loadPresentation(run, artifact, options), /file name is not allowed/);
    write({ ...base, images: { decision: { ...base.images.decision, sourceUrl: 'http://example.com/a' } } });
    assert.throws(() => loadPresentation(run, artifact, options), /https URL/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('page names are readable, unique and reject collisions', () => {
  assert.equal(pageSlug('Austria and Germany'), 'austria-and-germany');
  assert.equal(pageSlug('Puerto Vallarta, Mexico'), 'puerto-vallarta-mexico');
  assert.equal(pageSlug('Türkiye'), 'turkiye');
  assert.equal(pageSlug('Morocco'), 'morocco');
  assert.throws(() => pageSlugs([{ id: 'a', name: 'Japan' }, { id: 'b', name: 'japan!' }]), /is used by/);
});
