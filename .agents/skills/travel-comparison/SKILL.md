---
name: travel-comparison
description: "Use when comparing reviewed destination dossiers, selecting a travel shortlist, repricing itineraries, or producing final travel recommendations with tradeoffs and pushback."
---

# Travel Comparison

Read ../../workflows/research-protocol.md and ../../workflows/staged-comparison.md. Run `scripts/research.mjs coverage` to see which destinations are researched. A researcher-prepared comparison (shortlist and decision memo) may run on researched dossiers, approved or awaiting review, once every destination is researched or has a documented blocker; label it not independently reviewed. A final reviewed comparison still requires `scripts/research.mjs ready` and current approved dossiers; otherwise save a pending status with exact reasons and next actions.

Freeze comparisonInputs using every configured destination ID and approved draft/evidence hashes and current tripSha256. Include sourced not_recommended dossiers and explain exclusions. Historical dossier quotes are context, not live offers. Reprice the shortlist with rendered exact-date two-traveler airline-direct totals and inclusive hotel costs captured within 24 hours. Preserve browser, identity and eligibility safeguards.

Compare consistent trip lengths, party totals, budget exposure, cancellation risk, rain/temperature/daylight, experience fit, holiday closures, flight fatigue and ground logistics. Explain different winners under value, weather, culture, beach and low-fatigue priorities; do not reduce everything to an unexplained score. Present the strongest counterargument to each finalist, downside cases, document gates and what would change the ranking. Unknown entry, transit, US re-entry or remote-work permission blocks buy recommendations. Only the user can expand budget/scope; purchasing is never authorized.

Validate comparisonInputs with scripts/research.mjs validate-comparison; complete genuine four-pass travel-review and publish only matching approved hashes. Rebuild the portal. Record feedback and an evidence-backed future refresh plan rather than a price guarantee.

## Head-To-Head Memo (Decision Flow)

Run `node scripts/research.mjs coverage`. When every destination is researched or has a documented blocker, compare all researched dossiers, including ones still awaiting independent review, and label the result "Researcher-prepared, not independently reviewed". Write `local/decision/decision-memo.md` using the advisor-memo skill (`# Headline`, then recommendation, how the shortlist compares, why each other destination was left out, what I would regret, what to check next). Include each shortlisted trip's entry-visa verdict and last safe application date. Booking deadlines and re-quoting are handled by the user's daily automation, so do not plan them. The memo is published as `docs/decision.html` and never claims reviewer approval.

## Mandatory Publication Handoff

Every completed comparison execution runs `npm run portal` and then `npm run pages:sync`. This deterministically rebuilds Pages and commits/pushes only `docs/`; private comparison reports and quotes remain under ignored `local/`. Do not call the execution complete if sync fails; report the blocker and preserve the local draft.

After validation, the comparison coordinator must attempt genuine dispatch of the exact configured reviewer deployment in separate contexts for every configured pass. Do not skip inline dispatch solely because dedicated reviewer tasks are unregistered or a reviewer metadata field is null. Record actual invocation and context evidence. If the runtime has no dispatch mechanism or invocation fails, record concrete evidence and leave the comparison pending; never fabricate approval.
