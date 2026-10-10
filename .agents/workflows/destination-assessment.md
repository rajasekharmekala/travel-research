# Destination Assessment Automation

Read AGENTS.md, local/trip.json, local/automation.json, research-protocol.md and `.agents/skills/destination-research/SKILL.md`. This is the discovery job's staged replacement. Do not execute broad daily-discovery in parallel unless explicitly assigned; it remains a legacy report contract reference.

1. Record actual execution mode, configured model and runtime identity evidence without inventing routing. Check browser consent and safeguards.
2. Run `node scripts/research.mjs claim <unique-run-id>`. Process one destination per run, thoroughly; repeated runs progress through all configured locations. Do not choose only favorites or mark skipped locations researched.
3. Save exact-date two-traveler quotes, official documents and regional seasonal evidence, alternatives, full itinerary, costs and reasoned verdict in local/runs/<run-id>/draft.json. Use destination dossier schema and template; explain all origin/date-window exclusions. Save section evidence continuously.
4. Run `node scripts/publish.mjs validate <run/draft.json>` and checkpoint through scripts/research.mjs. Source failure becomes an evidenced blocker with next action and retry date; retain partial research. Never invent a quote to unblock validation.
5. Dispatch travel-review only if actual separate configured reviewer contexts are supported. Otherwise retain awaiting_review and record evidenced availability limitations; use independently registered review tasks if the host supports them. Record review rounds, feedback and changed hashes. No self-review or fabricated approvals.
6. Promote only after genuine four-pass approval. Rebuild `node scripts/portal.mjs` after checkpoint, status changes and promotion. Report location, verdict, pending reviews, next action and actual limitations.

If no destination is eligible, inspect `node scripts/research.mjs status` for pending reviews and blockers. Continue only genuine supported work. Analysis refreshes after 30 days or meaningful changes; quotes are historical after 24 hours. Do not reprice every approved dossier every day solely to keep it in the analysis ledger.
