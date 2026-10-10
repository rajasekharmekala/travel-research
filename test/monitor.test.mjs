import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateTrip, selectedDestinations, validateReport, cliArguments, runCli, plist } from '../scripts/monitor.mjs';

const trip = JSON.parse(fs.readFileSync(new URL('../local/trip.json', import.meta.url)));
const now = new Date('2026-10-09T12:00:00Z');
function fixture() {
  const names = selectedDestinations(trip, 'daily', now).map(destination => destination.name);
  return { status: 'ok', summary: 'Test fixture only', searchedDestinations: names, limitations: [], candidates: [{ destination: names[0], depart: '2026-12-23', return: '2027-01-02', origin: 'SFO', passengers: 2, currency: 'USD', quoteType: 'estimate', observedAt: now.toISOString(), flightUrl: 'https://www.example.com/flights', hotelUrl: 'https://www.example.com/hotels', visaSourceUrls: [], entryEligibility: 'unknown', usReentry: 'unknown', remoteWorkApproved: false, selfTransfer: false, costBreakdownUsd: { flights: 2800, hotels: 2200, meals: 700, groundTransport: 200, activities: 300, insuranceAndContingency: 600 }, totalUsd: 6800, flightDetails: 'Test fixture', hotelDetails: 'Test fixture', risks: ['Unknown eligibility'] }] };
}

test('private brief validates and rotating batches cover all 18 destinations', () => {
  validateTrip(trip);
  const names = new Set();
  for (let offset = 0; offset < 3; offset++) {
    const day = new Date(now.getTime() + offset * 86400000);
    for (const destination of selectedDestinations(trip, 'daily', day)) names.add(destination.name);
  }
  assert.equal(names.size, 18);
  assert.equal(selectedDestinations(trip, 'weekly', now).length, 18);
  assert(![...names].some(name => /Hawaii/i.test(name)));
});

test('estimates with unknown documents are never actionable', () => {
  const result = validateReport(fixture(), trip, 'daily', now);
  assert.equal(result.candidates[0].actionable, false);
});

test('incomplete coverage and blocked candidates fail validation', () => {
  const report = fixture();
  report.searchedDestinations = [];
  assert.throws(() => validateReport(report, trip, 'daily', now), /coverage/);
  report.status = 'blocked';
  report.limitations = ['No public prices'];
  assert.throws(() => validateReport(report, trip, 'daily', now), /cannot contain/);
});

test('stale prices, wrong totals, and unsupported re-entry fail', () => {
  const stale = fixture();
  stale.candidates[0].observedAt = '2026-10-01T12:00:00Z';
  assert.throws(() => validateReport(stale, trip, 'daily', now), /timestamp/);
  const incorrect = fixture();
  incorrect.candidates[0].totalUsd = 1000;
  assert.throws(() => validateReport(incorrect, trip, 'daily', now), /Total/);
  const documents = fixture();
  documents.candidates[0].usReentry = 'confirmed';
  assert.throws(() => validateReport(documents, trip, 'daily', now), /re-entry/);
});

test('only verified within-budget trips with resolved gates are actionable', () => {
  const approved = structuredClone(trip);
  approved.documents.usVisaStampValidThroughReturn = true;
  const report = fixture();
  const candidate = report.candidates[0];
  candidate.quoteType = 'verified';
  candidate.entryEligibility = 'confirmed';
  candidate.usReentry = 'confirmed';
  candidate.visaSourceUrls = ['https://www.example.gov/entry'];
  assert.equal(validateReport(report, approved, 'daily', now).candidates[0].actionable, true);
  candidate.selfTransfer = true;
  assert.equal(validateReport(report, approved, 'daily', now).candidates[0].actionable, false);
  candidate.selfTransfer = false;
  candidate.depart = '2026-12-19';
  assert.equal(validateReport(report, approved, 'daily', now).candidates[0].actionable, false);
  candidate.remoteWorkApproved = true;
  assert.throws(() => validateReport(report, approved, 'daily', now), /remote work/);
});

test('CLI permits web-only tools and launchd escapes paths', () => {
  const args = cliArguments('brief');
  assert(args.includes('--available-tools'));
  assert(args.includes('web_search'));
  assert(args.includes('--deny-tool'));
  const xml = plist('weekly', trip, '/test/node', '/test/a&b', '/test/copilot');
  assert(xml.includes('a&amp;b'));
  assert(xml.includes('<key>Weekday</key><integer>0</integer>'));
});

test('subprocess output and nonzero failures are handled', async () => {
  const result = await runCli(process.execPath, ['-e', 'console.log("fixture")'], 2000);
  assert.equal(result.stdout.trim(), 'fixture');
  await assert.rejects(runCli(process.execPath, ['-e', 'process.exit(2)'], 2000), /exited 2/);
});
