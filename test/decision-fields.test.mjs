import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEntry, validateLodging, validateVoices } from '../scripts/decision-fields.mjs';
import { projectPublicDossier, renderPublicDossier } from '../scripts/public-dossier.mjs';

const entry = () => ({ steps: ['Check eligibility', 'Apply online', 'Attend the appointment'], documents: ['Passport valid 6+ months', 'US visa copy', 'Bank statements'], whereToApply: 'Online portal; SF consulate for exceptions', mechanism: 'e-visa', requirement: 'e-visa online', leadTimeDays: 10, lastSafeApplyDate: '2026-12-01', feasibleByDepart: true, usVisaDependency: 'Valid US visa required', transit: 'None', fees: 'USD 50 each', source: 'https://example.com/evisa' });
const property = () => ({ name: 'Hotel A', area: 'Centro', tier: 'local-boutique', whyHere: 'Quiet street.', chaseTravel: 'the-edit', chaseNote: 'Listed on the public Edit page.', guestRating: { score: 9.1, scale: 10, source: 'Google' }, nightlyUsd: 210, priceBasis: 'Dec 23 public rate', sources: ['https://example.com/h'] });
const voice = (url, extra = {}) => ({ author: 'Sam', context: 'blog, 2025', takeaway: 'Book the ferry early.', url, ...extra });

test('entry requires an honest lead time, last safe date and feasibility', () => {
  assert.doesNotThrow(() => validateEntry(entry()));
  assert.throws(() => validateEntry({ ...entry(), source: 'http://example.com' }), /https source/);
  assert.throws(() => validateEntry({ ...entry(), leadTimeDays: null }), /nextAction/);
  assert.doesNotThrow(() => validateEntry({ ...entry(), leadTimeDays: null, lastSafeApplyDate: null, feasibleByDepart: null, nextAction: 'Ask the embassy for the appointment wait.' }));
  assert.throws(() => validateEntry({ ...entry(), lastSafeApplyDate: null }), /lastSafeApplyDate/);
  assert.doesNotThrow(() => validateEntry({ ...entry(), mechanism: 'visa-free', leadTimeDays: 0, lastSafeApplyDate: null }));
  assert.throws(() => validateEntry({ ...entry(), feasibleByDepart: 'yes' }), /feasibleByDepart/);
  assert.throws(() => validateEntry({ ...entry(), steps: ['one', 'two'] }), /three application steps/);
  assert.throws(() => validateEntry({ ...entry(), documents: 'passport' }), /documents/);
  assert.throws(() => validateEntry({ ...entry(), documents: ['passport', 'photo'] }), /three documents/);
  assert.throws(() => validateEntry({ ...entry(), whereToApply: '' }), /whereToApply/);
  assert.doesNotThrow(() => validateEntry({ ...entry(), mechanism: 'visa-free', whereToApply: '' }));
});

test('lodging needs two rated, sourced mid-range or local picks and an honest Chase Travel status', () => {
  assert.doesNotThrow(() => validateLodging([property(), property()]));
  assert.throws(() => validateLodging([property()]), /two properties/);
  assert.throws(() => validateLodging([property(), { ...property(), chaseTravel: 'yes' }]), /chaseTravel/);
  assert.throws(() => validateLodging([property(), { ...property(), tier: 'luxury' }]), /tier/);
  assert.throws(() => validateLodging([property(), { ...property(), guestRating: { score: 11, scale: 10, source: 'x' } }]), /guestRating/);
  assert.throws(() => validateLodging([property(), { ...property(), sources: [] }]), /sources/);
});

test('traveler voices need three attributed sources from two sites and short quotes only', () => {
  const good = [voice('https://a.example.com/1'), voice('https://b.example.org/2'), voice('https://b.example.org/3')];
  assert.doesNotThrow(() => validateVoices(good));
  assert.throws(() => validateVoices(good.slice(0, 2)), /three/);
  assert.throws(() => validateVoices([voice('https://a.example.com/1'), voice('https://a.example.com/2'), voice('https://a.example.com/3')]), /two different sites/);
  assert.throws(() => validateVoices([...good.slice(0, 2), voice('https://c.example.net/3', { quote: 'word '.repeat(31) })]), /30 words/);
});

test('public dossier renders entry, lodging and voices with escaping', () => {
  const report = {
    candidates: [{ destination: 'Japan', priceType: 'estimate', observedAt: '2026-10-10T00:00:00Z', costs: {}, totalUsd: 0, sources: [], evidence: [] }],
    dossier: {
      thesis: 'Japan works.', verdict: 'conditional', entry: { ...entry(), requirement: 'e-visa <b>online</b>' }, lodging: [property()],
      travelerVoices: [voice('https://a.example.com/1', { quote: 'Worth it.' })],
      sections: [{ key: 'decision', text: 'Summary', sources: [] }], itinerary: [], unresolved: [], nextChecks: [], actions: []
    },
    limitations: []
  };
  const html = renderPublicDossier({ destination: { name: 'Japan' }, publicDossier: projectPublicDossier(report, {}, 'Provisional') });
  assert.match(html, /id="entry"/);
  assert.match(html, /Last safe application date/);
  assert.ok(!html.includes('<b>online'));
  assert.match(html, /In The Edit by Chase Travel/);
  assert.match(html, /id="voices"/);
  assert.match(html, /&ldquo;Worth it\.&rdquo;/);
});
