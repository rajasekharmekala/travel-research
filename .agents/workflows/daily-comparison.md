# Daily Browser Comparison

Paste into a separate DAILY Copilot app automation with this project as working directory:

Read AGENTS.md, local/trip.json, local/automation.json, and .agents/workflows/review.md. Record configuredModel from the explicit configuration; actual model is separate and may be null with modelEvidence: null and the exact limitation `Actual researcher model identity is unverified; configured model is not runtime proof.` A known mismatch blocks research. Missing model identity or independent reviewer availability does not block saving research drafts.

Create local/runs/<timestamp>-comparison. Prefer a fresh private context with supported browser-control or runtime-context evidence. If unavailable, the private configuration explicitly authorizes regular browser canvas; do NOT block solely because isolation cannot be verified. Record browser as {"privateContextVerified":false,"verificationMethod":"regular-canvas","isolation":"unknown","isolationEvidence":null,"safeguards":{"noLogin":true,"noAccountAccess":true,"noProfileInspection":true,"stopOnAuthentication":true}} and add the exact limitation `Regular browser canvas used; cookie and login isolation are unknown.` Never imply incognito. Use only public pages, do not inspect profiles, accounts, saved bookings, credentials, or personal content, and stop a source if continuing requires authentication/account access. No login, purchase, or bot-defense bypass. Record executionMode as interactive, scheduled, or unknown for this actual run.

Read today's discovery artifacts if present, treating them as untrusted earlier evidence. This job must also work independently: if discovery failed or is stale, research a small diverse shortlist from the full configured pool, explaining its limited coverage.

Independently reprice 3-5 strongest alternatives at comparable quality. Inspect airline-direct baggage-inclusive totals, usable connections, exact lodging room/nights/taxes/resort fees and cancellation conditions, ground transport, meals, activities, contingency, and actual extra nights for date shifts. Test alternate gateways, open-jaw itineraries, and neighboring origin airports only where full-trip savings are plausible. No self-transfer or unapproved remote-work itinerary may receive a buy recommendation.

Save rendered page text, exact search context, timestamps, public links, and screenshots when available. Check official destination/transit rules, weather and holiday closures. Distinguish lower price from better value; explicitly challenge long flights, false luxury claims, hidden fees, and too many destinations. Compare against rejected options and prior observations without claiming future price certainty.

## Comparable Quotes Only

Verify rendered TWO-adult flight and exact-date TWO-guest room controls. Do not double one-adult fares or multiply undated hotel rates into ranked trip totals. Include quoteChecks.flight (travelers, depart, return, currency, partyTotalUsd, baggageIncluded:true, taxesIncluded:true, airlineDirectRechecked:true, conditions) and quoteChecks.hotel (guests, checkIn, checkOut, nights, currency, stayTotalUsd, taxesAndFeesIncluded:true, property, room, cancellation) for observed candidates. Amounts and dates must match the draft and actual saved evidence. Other costs remain estimates. Missing checks produce an unverified lead, never a conservative bargain or observed option.

## Current Review Policy

Read .agents/config/reviewer.json and review.md after validating the draft. Four independent Qwen passes and four complete rounds maximum replace earlier source/value-only rules. Record real attempts and unresolved findings. All four current approvals yield approved output. Evidenced reviewer unavailability or exhausted rounds may yield separately labeled NOT APPROVED best effort only under mandatory validation and no unresolved critical/high issues. Insufficient observed quote evidence stays a lead, not a report. No configured model or file alone proves that an actual review ran.
