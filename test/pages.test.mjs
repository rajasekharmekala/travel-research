import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';

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
      assert.match(page, /No public-safe assessment has been released/);
    }
    for (const content of [home, ...pages]) {
      for (const sensitive of ['PRIVATE-DATE', 'PRIVATE-AIRPORT', 'PRIVATE-NATIONALITY', 'PRIVATE-VISA', 'PRIVATE-EMPLOYER', 'PRIVATE-PREFERENCE', '6000']) assert.equal(content.includes(sensitive), false);
      assert.match(content, /Japan|Italy/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
