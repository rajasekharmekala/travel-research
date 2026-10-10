---
name: destination-research
description: "Use when deeply researching a configured travel destination, creating a destination dossier, planning an itinerary, or continuing a destination research automation."
---

# Destination Research

Read `../../workflows/research-protocol.md` and `../../../AGENTS.md`. Read `local/trip.json`, then claim exactly one eligible destination through `scripts/research.mjs`. Take researcher model and execution mode from the actual host invocation; do not require `local/automation.json`. Never access portfolio or personal wiki during travel research.

Write an evidence-backed dossier, not a generic travel guide. Assess all origin airports and date windows; deeply price at least one exact-date option for both travelers and explain rejected routes/windows. Save rendered browser text with exact search context. Separate observed party totals from estimates, include all hotel nights and fees, baggage, meals, transfers, activities and contingency. Recheck airline-direct totals without buying. Record alternative flight/hotel combinations and why the preferred combination wins.

Every dossier provides explained qualitative confidence and conditional value assessments for its options, unresolved flags, reviewer findings and prioritized user actions with why/how to verify them and what would change the itinerary or recommendation. Publish validated privacy-safe research automatically after the review attempt, including estimates and provisional status. Do not hide the dossier because clean approval or booking readiness is missing. Keep unsupported claims qualified and private trip details in the local portal. Follow AGENTS.md Decision-Support Publication.

Use assets/dossier-template.json for the dossier extension to the existing report envelope. Every section needs text, public sources, run-local evidence and observedAt. Write a complete date-by-date itinerary referencing a priced candidate, including outbound and return travel, lodging, transfer time and rainy-day alternatives. Research official entry/transit and US re-entry constraints for each traveler. Unknown documents or remote-work permission prevent buy recommendations, not honest conditional analysis.

Distinguish regional seasonal climatology from forecasts; discuss daylight, rain, sea conditions, altitude, winter closures, Christmas/New Year schedules and capacity. Assess neighborhoods, experience quality, crowding, flight fatigue, cancellation exposure, budget sensitivity, who would dislike the destination and the strongest competing itinerary.

Checkpoint only after scripts/publish.mjs validation succeeds. Hand off to travel-review; do not self-approve. Retain partial evidence after a blocker, with next action and retry date. Cite weak or missing evidence honestly. No invented price, image, review attempt or runtime identity.

## Mandatory Publication Handoff

Before the task is complete, run `npm run portal` followed by `npm run pages:sync`. The sync rebuilds the public allowlist and commits/pushes only validated `docs/`. Do not push private drafts, captures or reports. If the host runtime lacks SSH or push fails, treat publication as incomplete and report the exact error.

After validation, attempt genuine reviewer dispatch using the exact configured deployment and separate host-supported contexts for each pass. Do not skip the attempt based only on null reviewer metadata or unregistered dedicated tasks. Record concrete dispatch evidence; if the host cannot dispatch, retain the draft awaiting review and report the exact limitation. Never fabricate receipts or approvals.

## Price Research Before Estimates

An estimate is a fallback, not a substitute for searching. A failed deep link or generic search form is not a completed fare search. Use the rendered controls to select airports, round trip, exact dates, two travelers and currency; read them back before submitting. Wrong-date or one-traveler results are reference evidence only, never the requested offer.

For flights, attempt the exact-date search on an aggregator, then at least two plausible airlines' public booking forms. Compare the configured origin airports and sensible destination airports, adjacent authorized dates, baggage-inclusive economy and total travel time. If one source fails, try an independent provider; stop that source on authentication, CAPTCHA or bot defense. Do not use self-transfers or unauthorized dates/budget increases as savings. Record each attempted route/window and why alternatives lost or could not be checked.

For lodging, set exact check-in/out dates, two adults and room count on a booking provider; check at least two realistic properties in suitable neighborhoods and their direct public booking pages. Compare the full stay, taxes/fees, room type, location, cancellation deadline and payment terms. A generic nightly listing is not a holiday-stay quote. Try another public provider if the first fails.

Save an effort ledger as you work: source URL, observation time, rendered search context, result/blocker and run-local capture. Describe what was actually attempted, never what should have been attempted. Document credible source-specific blockers before falling back. Do not claim best effort after only one unsuccessful URL.

For estimate candidates, include `pricingEffort: { attempts: [{ kind: "flights" | "hotels", channel: "aggregator" | "direct", source, observedAt, searchContext, result, evidence }], basis: { flights: { calculation, assumptions, evidence: [] }, hotels: { calculation, assumptions, evidence: [] } } }`. All evidence paths must also occur in `browser.evidenceFiles`, so the existing evidence hash binds them. New checkpoints require both aggregator and direct attempts for each category and evidence-linked arithmetic. This is a structural gate, not proof of external truth; reviewers assess genuine effort, date/traveler correctness and arithmetic.

Explain the actual reference dates, per-person versus party conversion, nights/rooms, fees, and any assumed seasonal adjustment. Give a justified range and sensitivity rather than an unexplained precise total. Never invent a holiday multiplier. If no defensible baseline exists, explicitly call the numeric contract value an unsupported budget scenario, not a market estimate, and do not rank value from it. Publish the uncertainty rather than fabricate an offer.
