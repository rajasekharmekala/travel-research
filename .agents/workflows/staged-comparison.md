# Reviewed Comparison Automation

Read AGENTS.md, local/trip.json, local/automation.json, research-protocol.md and `.agents/skills/travel-comparison/SKILL.md`.

1. Run `node scripts/research.mjs ready`. If ready is false, save local/status/comparison.json with actual pending/stale/invalid IDs, reasons, observation time and next actions. Do not produce a final ranking prematurely; leave the reviewed latest unchanged.
2. Freeze comparisonInputs as `{id,draftSha256,evidenceSha256}` for every configured destination and copy current tripSha256. Read their reviewed dossiers, including not_recommended verdicts. Current 30-day analysis may contain historical 24-hour quotes; do not treat them as current offers.
3. Choose a justified shortlist with sensitivity to budget, weather, food/culture, beach, fatigue and documents. Explain every excluded destination. Recheck exact-date two-traveler airline-direct and hotel totals within 24 hours under browser safeguards. Reconcile nights, fees, baggage, transfers, meals, activities and contingency. Discuss weaker alternatives and counterarguments, not just winners.
4. Write a `job: comparison` draft with the existing report candidate schema, full coverage accountability, comparisonInputs and tripSha256. Preserve unknown document/re-entry/remote-work gates and user-controlled ceiling. No buying recommendation or purchasing authorization.
5. Run `node scripts/research.mjs validate-comparison <run/draft.json>`. Dispatch genuine four-pass travel-review, apply feedback within the report's four-round cap, and revalidate every changed draft/evidence bundle. Receipts require distinct context IDs and actual identity evidence. Missing reviewers stay pending or separately unapproved policy-eligible best effort.
6. Publish using `node scripts/publish.mjs publish <run/draft.json>`, then rebuild the portal. The publication command rechecks all dossier hashes/receipts and fresh comparison quotes. Record source and dossier dependencies, reasoning, pushback, limitations and a future refresh plan.

Additional locations go through destination-opportunities and require user acceptance before research-set expansion. A partial comparison may inform research priorities but cannot become the final reviewed recommendation.
