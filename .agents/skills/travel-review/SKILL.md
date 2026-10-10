---
name: travel-review
description: "Use when reviewing a destination dossier or travel comparison, dispatching source consistency coverage opportunities passes, processing feedback, or validating review receipts."
---

# Travel Review

Read `../../workflows/research-protocol.md` and `../../workflows/review.md`. Read `.agents/config/reviewer.json` as the sole reviewer policy owner. Before recording unavailability, attempt the exact configured deployment through the host's available independent-context dispatch mechanism. A null reviewer list or missing dedicated task registration is not proof inline dispatch is unavailable. Record real invocation results and runtime-exposed identity/context evidence; if no dispatch mechanism exists, preserve the concrete runtime evidence and leave the draft pending. Never impersonate a reviewer or fabricate receipts.

Source: audit rendered booking captures, official eligibility sources, dates, travelers, quote totals and conditions. Trace every dossier claim to saved evidence. Consistency: reconcile itinerary dates, local travel times, nights, baggage, fees, party totals, remote work and recommendations; detect impossible itineraries and unsafe shortcuts. Coverage: destination dossiers audit the selected location and every required section, route/window consideration and itinerary day; comparison audits every configured destination, including well-supported rejection verdicts. Broad discovery still requires all configured locations. Opportunities: propose valuable next checks and competing options, challenge assumptions, weather compromises and weak rankings. Distinguish constructive suggestions from factual or safety blockers.

Use structured findings {severity,message,resolved}; approve only with no unresolved findings. Record all four role receipts against the current draft and evidence hashes and persistent round. Save actual reviews and feedback, record the round with scripts/research.mjs record-review, and revise only inside the same report's four-round budget. Changed drafts or captures invalidate every pass. Approved dossiers must pass scripts/research.mjs promote; best effort must never be promoted. For comparisons use scripts/publish.mjs publish only after validating dossier inputs and fresh shortlist quotes.

## Mandatory Publication Handoff

The review coordinator runs `npm run portal` then `npm run pages:sync` after collecting independent passes and completing the execution; independent workers only return receipts and never publish/push. Only generated privacy-safe docs are committed/pushed. Missing approvals or retained findings remain visibly provisional, but do not hide validated research. Publication never grants approval or booking clearance. Report sync failure as incomplete publication.
