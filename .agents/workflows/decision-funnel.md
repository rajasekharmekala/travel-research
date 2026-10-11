# Decision Flow

Goal: the best possible trip for every configured destination, then one comparison that produces a shortlist and a recommendation for the December trip.

Read `local/decision-profile.json` first. Its attested constraints (US re-entry, remote work, firm USD 7,000 ceiling, 24-hour travel cap) override the matching `unresolved` items in `local/trip.json`. Cite them as user-attested, never as verified. Everything in `AGENTS.md` about evidence, privacy, browser safety and no purchasing still applies.

## Stages

| Stage | Scope | Output |
| --- | --- | --- |
| 1. Per-location research | Every configured destination, one end-to-end run each | Dossier containing the best trip for that location, with an advisor memo |
| 2. Comparison | All researched dossiers | Shortlist, with every non-shortlisted destination explained |
| 3. Head-to-head memo | Shortlist | `local/decision/decision-memo.md`, published as `docs/decision.html` |
| 4. Booking readiness | The chosen trip | Dated checklist in the memo |

No destination is dropped before it has had its own end-to-end run. A destination that fails a hard constraint (travel time over the cap, entry not obtainable in time, low-case cost above the ceiling) still gets a run, and its dossier is a well-supported `not_recommended` finding. Cutting happens in comparison, with reasons, not before research.

## Stage 1: best possible trip per location

One run per destination using `destination-research` and `advisor-memo`. The question each run answers: if the two of you went to this place in this window, what is the best version of the trip, what does it cost, and what is it like? Choose the best base, route, dates within the authorized windows, lodging tier and pace for that location, then argue for it in the memo. Do not shape the trip to flatter or sink a competitor.

Check progress with `node scripts/research.mjs coverage`. It lists which destinations are researched (approved or awaiting review) and which are pending, researching or blocked, so runs can continue until none remain.

Score usefulness with `node scripts/usefulness.mjs`. It rates every researched dossier 0 to 100 on price grounding, decision clarity, narrative depth, entry readiness, lodging fit, traveler voices and itinerary realism, names the two weakest dimensions, and writes `local/decision/usefulness.json`. Re-run weak dossiers on those dimensions first. The score measures decision-readiness, not whether the facts are true.

Optional: `destination-triage` and `scripts/triage.mjs` give a cheap first pass over all destinations. Use it only to order the research queue (cheap, high-fit and long-lead entry-visa destinations first) and to flag entry deadlines early. It never removes a destination from stage 1.

## Stage 2: comparison and shortlist

Comparison starts when every destination is researched or has a documented blocker, not when every dossier is independently approved. Until review approval exists, the comparison is labeled "Researcher-prepared, not independently reviewed". Final approved comparison status still follows the existing review policy.

The comparison scores each researched trip on the profile's experience weights, computes value as experience per dollar using both the low and high cost cases, applies the hard constraints, and keeps the shortlist varied (no more than two from one region). It explains every excluded destination in a sentence a reader can act on, states the strongest case against each shortlisted trip, and says what result would change the ranking.

## Decision-quality critique

Instead of auditing form, the critic answers these questions about each dossier and the comparison, and lists concrete fixes:

1. Could the user choose between destinations from this document alone, without opening a source?
2. Is every price either observed, derived with visible arithmetic, or labeled unsupported?
3. Does the narrative explain why each stop and each day earns its time, in plain first-person prose?
4. Is the strongest argument against the recommendation stated fairly?
5. Is the entry-visa verdict stated with a lead time and last safe application date, and does the memo say what to check next?

## Clocks the agents must track

Booking deadlines, fare holds and re-quoting are handled by the user on manual re-runs; agents do not plan them.

Today's date matters. The core departure is 2026-12-23.

- Entry authorization clock: for an Indian passport holder, an e-visa or consular appointment may take longer than the days left. State the lead time and last safe application date for every destination.
- Window clock: whether the Dec 19 to Jan 5 extension changes cost or quality enough to be worth the days.
