---
name: advisor-memo
description: "Use when writing the reader-facing narrative for a destination dossier or the head-to-head decision memo: a first-person advisor memo that explains why this itinerary, why each stop matters, what it really costs, and what to do next."
---

# Advisor Memo

The structured dossier fields are the evidence ledger. The memo is what the user actually reads. Write it like a trusted friend who has done the homework and has an opinion, not like a compliance record. Facts and numbers come from the dossier and its sources; the memo adds judgment, sequence and story.

## Voice

- First person, conversational, specific: "I would put the two of you in Kyoto for five nights, not three, because..." Avoid "it is recommended", "the traveler", "this option".
- Lead with the answer. The first section states the recommendation, the all-in cost range for two, and the one condition that would change it.
- Explain, do not list. For every place or day, say why it is worth the time, what makes it important or famous, what it feels like in late December, and what you would skip.
- Opinions with reasons. Say what you would cut, what is overrated, and where you would spend extra. Uncertainty is stated once, plainly, with what resolves it.
- Short paragraphs, concrete nouns, real names of neighborhoods, dishes, stations and trails. No filler openers, no brochure adjectives ("vibrant", "nestled", "hidden gem", "bucket list").
- Never write the words "robust", "leverage", "unlock", "comprehensive", or system language such as "evidence file", "checkpoint", "reviewer", "this allocation".

## Required structure (markdown, `##` headings)

1. `## My recommendation`: verdict, party cost range, entry-visa verdict in one line, the one thing that would flip it.
2. `## Why this trip fits the two of you`: tie to the stated preferences (food and culture, beach, winter scenery, nature, value) and to the Dec 23 to Jan 5 window. Say which preferences it serves best and which it trades away.
3. `## How the trip unfolds`: the itinerary as narrative chapters (arrival, each base, departure), not a date table. For each chapter explain why this base, why this order, the three or four things that matter most and why, rainy-day and New Year closure fallbacks, and the pace.
4. `## What it will really cost`: the real arithmetic in plain words, which numbers are observed versus derived, where the money goes, where to save, and a value verdict in terms of experience per dollar against the best alternative. Show low and high cases.
5. `## Where this can go wrong`: weather, closures, fatigue, crowding, cancellation exposure, and who should not choose this trip.
6. `## The best alternative`: the strongest competing itinerary, stated fairly, and the specific result that would make you switch.
7. `## What to check next`: ordered actions: what to check, where, and which result changes the plan. Do not set booking or fare deadlines; the user handles those.

Target 1,500 to 2,500 words for a destination memo. The head-to-head memo is shorter per finalist and adds `## How the shortlist compares`, `## Why the others were left out`, and `## What I would regret`.

## Voices and lodging

Weave the dossier's `travelerVoices` into the chapters where they matter: attribute each by name and context, paraphrase more than you quote, and use direct quotes of 30 words or fewer. A voice should confirm, complicate or contradict your view; say which. In `How the trip unfolds`, name the stay you would book from `dossier.lodging` and why, in plain terms (location, quiet, breakfast, walkability), and mention if it carries Chase Travel benefits.

## Rules

- Every number in the memo must match a dossier field. If a figure is an estimate, say so in the sentence.
- Do not mention private artifacts, run directories, receipts, review mechanics or trip-purpose wording (no honeymoon or couple framing). Public export strips these, but do not rely on that.
- Do not invent history, prices, hours or reviews. Significance claims (why a place is famous or important) need a public source in the dossier sections.
- Lightweight markdown only: `##`/`###` headings, paragraphs, `-` lists, `**bold**`, `*italic*`, `> quote`, and https links.
- Re-read it as the reader. If a paragraph could describe any destination, rewrite it with specifics or delete it.

## Where it goes

In a destination dossier draft, set `dossier.memo = { "headline": "...", "markdown": "..." }`. The head-to-head memo is `local/decision/decision-memo.md` with a first line `# Headline`.
