# Host App Activation

Repository implementation is ready; task registration and actual reviewer/model identity remain host-runtime responsibilities. Never infer live registrations from local files.

## Research Tasks

Update or register the discovery job with the configured explicit researcher deployment, reasoning setting, timezone and schedule from local/automation.json. Prompt it to read AGENTS.md and run .agents/workflows/destination-assessment.md. One destination per run allows deep analysis and persistent progress; do not run retired CLI research or launchd jobs.

Update or register comparison with the existing explicit deployment and configured schedule. Prompt it to run .agents/workflows/staged-comparison.md. Before all dossiers are current, it records pending state instead of final recommendations. Do not increase frequency or invent successful registrations.

## Review Tasks

Use genuine inline dispatch only if the host supports the exact configured reviewer deployment and exposes separate context/model evidence. Otherwise register four distinct pass tasks for source, consistency, coverage and opportunities using .agents/workflows/daily-review.md and the exact deployment in .agents/config/reviewer.json. Each task reviews only its assigned role and current hashes. A coordinator aggregates actual attempts, records review-round.json, and promotes only four current approvals.

No unconfigured fallback. A model picker selection is configuration, not actual routing proof. Unknown researcher identity permits disclosed drafts; unknown reviewer identity/context cannot produce approval. Preserve consented browser privacy limitations and all account safeguards.

## GitHub Pages

The remote is public. Keep personal dates, traveler counts, home airports, trip ceiling, immigration and employer details, booking captures, observed prices, reviewer receipts and private dossiers under ignored `local/`. `npm run portal` rebuilds the private report portal and also generates the public-safe homepage and 18 destination index pages in `docs/`. `npm run pages` regenerates only this sanitized export. Do not copy `local/portal` wholesale into docs. No private assessment is currently released. Assessment release needs a separate user-approved, privacy-reviewed public artifact; do not treat travel automation review as public-data approval.

## Local Commands

- `npm run research -- init`: reconcile configured destinations without approving old drafts.
- `npm run research -- claim <run-id>`: lease one eligible destination; use a unique run ID.
- `npm run research -- checkpoint <local/runs/.../checkpoint.json>`: validate and bind draft/evidence.
- `npm run research -- record-review <local/runs/.../review-round.json>`: persist four evidenced role attempts and round.
- `npm run research -- revise <local/runs/.../revision.json>`: return to research without resetting rounds.
- `npm run research -- promote <local/runs/.../draft.json>`: revalidate four receipts and recorded approval round.
- `npm run research -- ready`: audit all current dossier dependencies.
- `npm run research -- validate-comparison <local/runs/.../draft.json>`: validate full comparison inputs and fresh quotes.
- `npm run portal`: rebuild matching-theme homepage and destination pages.

Existing broad research drafts are retained but not automatically converted into approved deep dossiers. Browser captures and quotations cannot be retroactively invented. Only real researched and reviewed artifacts enter the new ledger.

## Operations

The local store uses exclusive writer locking and atomic replacement. On lock conflicts retry later; remove a stranded lock only after verifying no writer is live. Research leases expire after 120 minutes by default; use a longer explicit lease for long sessions, and never checkpoint an expired claim. Agent restarts preserve dossier review rounds; starting a new report solely to bypass the cap is prohibited.

Dossiers are reusable for 30 days at most, with meaningful entry/weather/closure/policy changes triggering earlier review. Prices expire after 24 hours and must be repriced for final shortlist comparison. Additional location suggestions stay unaccepted until the user changes trip scope.

All evidence, ledger state and presentation are private local files. No public site, commit, email, credential flow or purchase is part of activation.
