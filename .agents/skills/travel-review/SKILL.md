---
name: travel-review
description: "Use when reviewing a destination dossier or travel comparison, dispatching source consistency coverage opportunities passes, processing feedback, or validating review receipts."
---

# Travel Review

Read ../../workflows/research-protocol.md and ../../workflows/review.md. Read .agents/config/reviewer.json as the only reviewer policy owner. Each pass must run in a genuinely separate context on the exact configured deployment. Do not impersonate a reviewer. Record actual modelEvidence, contextId, contextEvidence and runtimeEvidence only from host-exposed evidence. Missing evidence cannot become approval; record evidenced unavailability and follow best-effort policy.

Source: audit rendered booking captures, official eligibility sources, dates, travelers, quote totals and conditions. Trace every dossier claim to saved evidence. Consistency: reconcile itinerary dates, local travel times, nights, baggage, fees, party totals, remote work and recommendations; detect impossible itineraries and unsafe shortcuts. Coverage: destination dossiers audit the selected location and every required section, route/window consideration and itinerary day; comparison audits every configured destination, including well-supported rejection verdicts. Broad discovery still requires all configured locations. Opportunities: propose valuable next checks and competing options, challenge assumptions, weather compromises and weak rankings. Distinguish constructive suggestions from factual or safety blockers.

Use structured findings {severity,message,resolved}; approve only with no unresolved findings. Record all four role receipts against the current draft and evidence hashes and persistent round. Save actual reviews and feedback, record the round with scripts/research.mjs record-review, and revise only inside the same report's four-round budget. Changed drafts or captures invalidate every pass. Approved dossiers must pass scripts/research.mjs promote; best effort must never be promoted. For comparisons use scripts/publish.mjs publish only after validating dossier inputs and fresh shortlist quotes.

## Mandatory Publication Handoff

The review coordinator runs `npm run portal` then `npm run pages:sync` after collecting the independent passes and completing the review execution; an independent reviewer worker only returns its receipt and never publishes/pushes. Only generated sanitized docs are committed/pushed. Missing genuine review approvals never become a public assessment. Report sync failure as an incomplete publication.
