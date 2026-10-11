import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMemo, renderMarkdown, splitMemoTitle } from '../scripts/memo.mjs';
import { projectPublicDossier, renderPublicDossier, renderDecisionMemo } from '../scripts/public-dossier.mjs';

const body = title => `## ${title}\n\n${'I would stay near the old town because the food is the point. '.repeat(15)}`;
const memo = () => ({
  headline: 'Go for the food, then slow down by the water',
  markdown: ['My recommendation', 'Why this fits', 'How the trip unfolds', 'What it will really cost', 'Where it can go wrong', 'The best alternative'].map(body).join('\n\n')
});

test('memo validation rejects thin, placeholder and private-path text', () => {
  assert.doesNotThrow(() => validateMemo(memo()));
  assert.throws(() => validateMemo({ ...memo(), markdown: '## One\n\nToo short.' }), /600 to 5000/);
  assert.throws(() => validateMemo({ ...memo(), headline: 'short' }), /headline/);
  assert.throws(() => validateMemo({ ...memo(), markdown: `${memo().markdown}\nREPLACE_WITH_DETAIL` }), /placeholder/);
  assert.throws(() => validateMemo({ ...memo(), markdown: `${memo().markdown}\nSee local/runs/x/draft.json` }), /private/);
});

test('markdown renderer escapes HTML and only links https URLs', () => {
  const html = renderMarkdown('## Title\n\nA <script>alert(1)</script> **bold** and [ok](https://example.com/a?b=1&c=2) and [bad](javascript:alert(1)).\n\n- one\n- two\n\n> quote\n\n| Line | USD |\n| --- | --- |\n| Hotel | 1,700 |');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<a href="https:\/\/example.com\/a\?b=1&amp;c=2" rel="noreferrer">ok<\/a>/);
  assert.ok(!html.includes('href="javascript'));
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<blockquote>quote<\/blockquote>/);
  assert.match(html, /<th>Line<\/th>/);
  assert.match(html, /<td>1,700<\/td>/);
});

test('memo file title is split from the body', () => {
  assert.deepEqual(splitMemoTitle('# Book Japan\n\n## My recommendation'), { title: 'Book Japan', body: '\n## My recommendation' });
  assert.equal(splitMemoTitle('No title').title, 'Decision memo');
});

test('public dossier shows the memo first and strips trip-purpose wording and private paths', () => {
  const report = {
    candidates: [{ destination: 'Japan', priceType: 'estimate', observedAt: '2026-10-10T00:00:00Z', costs: {}, totalUsd: 0, sources: [], evidence: [] }],
    dossier: {
      thesis: 'Japan works.', verdict: 'conditional', memo: { headline: 'Book Japan for the food', markdown: `${body('My recommendation')}\n\nOur honeymoon plan is in local/runs/x/draft.json.` },
      sections: [{ key: 'decision', text: 'Summary', sources: [] }], itinerary: [], unresolved: [], nextChecks: [], actions: []
    },
    limitations: []
  };
  const html = renderPublicDossier({ destination: { name: 'Japan' }, publicDossier: projectPublicDossier(report, {}, 'Provisional') });
  assert.match(html, /<section class="chapter memo" id="memo">/);
  assert.ok(html.indexOf('id="memo"') < html.indexOf('id="options"'));
  assert.ok(!/honeymoon/i.test(html));
  assert.ok(!html.includes('local/runs'));
});

test('decision memo page uses the title, escapes content and strips private details', () => {
  const html = renderDecisionMemo('# Book Japan this week\n\n## My recommendation\n\nHoneymoon <b>plan</b> from local/decision/notes.md.');
  assert.match(html, /<h1>Book Japan this week<\/h1>/);
  assert.match(html, /not independently reviewed/);
  assert.ok(!html.includes('<b>'));
  assert.ok(!html.includes('local/decision'));
  assert.ok(!/honeymoon/i.test(html));
});
