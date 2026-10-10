---
name: destination-opportunities
description: "Use when suggesting additional travel destinations, identifying alternatives outside the current research set, or recording location proposals for user acceptance."
---

# Destination Opportunities

Read ../../workflows/research-protocol.md. Additional locations are proposals, not additions to local/trip.json. Protect the configured research queue and budget ceiling.

Save proposal.json inside the current run with name, rationale, tradeoffs, public sources and evidence. Explain why the location may beat an existing candidate for dates, holiday season, traveler documents, travel fatigue, weather and total cost. Distinguish verified observations from estimates. Do not propose excluded destinations, safe self-transfer savings or assumed visa/re-entry eligibility.

Run scripts/research.mjs propose <run/proposal.json>. Show proposals separately from approved dossiers. Only the user can accept a proposal by updating local/trip.json; accepted locations then enter the same research and review lifecycle. Never publish an unresearched proposal as a ranked recommendation.

## Mandatory Publication Handoff

After proposing or accepting a location, run `npm run portal` and `npm run pages:sync` before completing. Only the sanitized public location index is pushed; proposal rationale and research remain private unless separately released.

When an accepted proposal enters a research workflow, the destination researcher must attempt genuine inline reviewer dispatch after validation. Do not treat null reviewer metadata or unregistered dedicated tasks alone as proof dispatch is unavailable; record concrete runtime evidence if it cannot be invoked.
