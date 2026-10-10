---
name: travel-comparison
description: "Use when comparing reviewed destination dossiers, selecting a travel shortlist, repricing itineraries, or producing final travel recommendations with tradeoffs and pushback."
---

# Travel Comparison

Read ../../workflows/research-protocol.md and ../../workflows/staged-comparison.md. Run scripts/research.mjs ready before research. If any configured destination lacks a current approved dossier, save a pending status with exact reasons and next actions, not a final recommendation.

Freeze comparisonInputs using every configured destination ID and approved draft/evidence hashes and current tripSha256. Include sourced not_recommended dossiers and explain exclusions. Historical dossier quotes are context, not live offers. Reprice the shortlist with rendered exact-date two-traveler airline-direct totals and inclusive hotel costs captured within 24 hours. Preserve browser, identity and eligibility safeguards.

Compare consistent trip lengths, party totals, budget exposure, cancellation risk, rain/temperature/daylight, experience fit, holiday closures, flight fatigue and ground logistics. Explain different winners under value, weather, culture, beach and low-fatigue priorities; do not reduce everything to an unexplained score. Present the strongest counterargument to each finalist, downside cases, document gates and what would change the ranking. Unknown entry, transit, US re-entry or remote-work permission blocks buy recommendations. Only the user can expand budget/scope; purchasing is never authorized.

Validate comparisonInputs with scripts/research.mjs validate-comparison; complete genuine four-pass travel-review and publish only matching approved hashes. Rebuild the portal. Record feedback and an evidence-backed future refresh plan rather than a price guarantee.

## Mandatory Publication Handoff

Every completed comparison execution runs `npm run portal` and then `npm run pages:sync`. This deterministically rebuilds Pages and commits/pushes only `docs/`; private comparison reports and quotes remain under ignored `local/`. Do not call the execution complete if sync fails; report the blocker and preserve the local draft.
