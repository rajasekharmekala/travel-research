# Host App Activation

The host app is the source of truth for schedules, selected models, and task registration. The repository does not require `local/automation.json`; obtain run settings from the host invocation and never treat configured settings as runtime evidence.

## Reviewer Dispatch

At runtime, attempt genuine inline dispatch using the exact model in `.agents/config/reviewer.json`, with one fresh independent context per pass. Missing reviewer-task registration does not prove inline dispatch unavailable. Register separate app tasks only as an explicit host setup action if inline dispatch is unsupported; this workflow cannot register them. Use dedicated tasks during a run only after the host confirms registration. Record actual invocation results and concrete runtime evidence before leaving a draft awaiting review.

## Research Tasks

Configure discovery and comparison schedules and explicit researcher deployments in the host app. Prompts should read `AGENTS.md` and run `.agents/workflows/destination-assessment.md` or `.agents/workflows/staged-comparison.md` as appropriate. Repository instructions do not create or register host tasks. Keep the jobs independent: discovery advances one destination per run; comparison waits for reviewed current dossiers. Do not run retired CLI research or launchd jobs.

## Review Tasks

Use inline dispatch attempts first for all four configured roles: source, consistency, coverage, and opportunities. If the host exposes no dispatch mechanism or an invocation fails, record the concrete evidence and preserve pending review. A coordinator aggregates genuine attempts, records `review-round.json`, and promotes only four current approvals. Never imply that this repository or a prompt registered an app task.

No unconfigured fallback. A model picker selection is configuration, not actual routing proof. Unknown researcher identity permits disclosed drafts; unknown reviewer identity/context cannot produce approval. Preserve consented browser privacy limitations and all account safeguards.

## GitHub Pages

Keep personal dates, home airports, budgets, document/employment assessments, party costs, booking captures and reviewer internals under ignored `local/`. `npm run portal` generates the private portal and public-safe destination dossiers in `docs/`. Standing authorization permits automatic validated provisional research publication, including estimate-only options; no per-run release approval is required. Use the public projection, never copy private HTML wholesale. Review clearance and booking readiness are distinct from publication.

## Pages Sync

After portal builds, run `npm run pages:sync` to publish changed sanitized docs. It commits only `docs/`, only on main, and pushes without force. Confirm SSH authentication is available to the scheduled task runtime. A failed/conflicting push stays a failure; never stage or force-push private `local/` data. This workspace's repository and Pages endpoint are under the Adobe corporate host; the deployed URL redirects to Adobe Okta in the current unauthenticated HTTP check.

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
