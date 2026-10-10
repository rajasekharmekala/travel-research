# Staged Travel Research Protocol

Read AGENTS.md, local/trip.json, local/automation.json, and .agents/config/reviewer.json. Scheduled travel tasks must never access portfolio or the personal wiki. This workflow borrows architecture, not runtime dependencies, from portfolio.

## Durable Lifecycle

Configured destination -> pending -> researching -> awaiting_review -> approved.
A supported source blocker becomes blocked with evidence, next action and retryAfter. A review revision returns awaiting_review to pending. Approved does not mean safe to buy. Verdicts are viable, conditional, or not_recommended; a well-supported negative assessment is valuable completed research.

Run `node scripts/research.mjs init` once, then `node scripts/research.mjs claim <unique-run-id> [lease-minutes]`. The JSON result includes destination ID, selected location and lease token. Reuse the same run ID to resume a live claim. Null means no research work is eligible; handle pending reviews rather than fabricating activity. Run directories are local/runs/<run-id>/, with atomic writer locking in local/research/.writer-lock. Never remove a lock merely because it is old: verify no live writer first. Destination leases expire independently and are recoverable. An expired owner must claim again before checkpointing.

Save per-section evidence as you work, not only at run end. A completed dossier uses `job: destination`, one configured destination in coverage, destinationId from the claim, and the current tripSha256. All existing report envelope, browser, model, candidate, quote and cost requirements still apply. Use the dossier template in `.agents/skills/destination-research/assets/dossier-template.json`; fill actual report candidates using the report contract in daily-discovery.md. The template is not evidence and cannot pass publication by itself.

Write local/runs/<run-id>/checkpoint.json:

```json
{
  "id": "destination ID from claim",
  "token": "lease token from claim",
  "runId": "unique-run-id",
  "outcome": "awaiting_review",
  "reportPath": "runs/<run-id>/draft.json"
}
```

Run `node scripts/research.mjs checkpoint local/runs/<run-id>/checkpoint.json`. The command validates the entire draft, computes actual file hashes and saves awaiting_review. For a blocker use outcome blocked, blocker {reason,evidence,nextAction}, and future ISO retryAfter. Do not set approved manually.

## Research Boundaries

Record intended app model as configuredModel. Actual model and modelEvidence stay null unless runtime-exposed. Include exactly `Actual researcher model identity is unverified; configured model is not runtime proof.` if unknown. Known mismatch stops research. executionMode is interactive, scheduled or unknown.

Public rendered booking pages only; save exact search context, page text, capture time, dates, two travelers, currency and conditions. Follow the approved regular-canvas policy if private isolation cannot be verified: privateContextVerified false, verificationMethod regular-canvas, isolation unknown, isolationEvidence null, all safeguards true and exact limitation `Regular browser canvas used; cookie and login isolation are unknown.` Stop on authentication, account access or bot defenses. No purchase, login, personal profiles, CAPTCHA workarounds or saved bookings.

## Review And Revision

Load travel-review and review.md. Four genuine independently dispatched contexts must approve identical draftSha256/evidenceSha256. Do not invent receipts, attempts or model identity. Receipts for staged artifacts also require runtime-exposed contextId, contextEvidence and modelEvidence; IDs must be distinct across passes. If the host cannot expose or dispatch these contexts, record genuine unavailability and retain drafts; the policy alone controls separately labeled unapproved best effort. Never promote best effort into the approved ledger.

A revised draft needs a new checkpoint and new receipts for every pass. To request revision, save revision.json with id, current draftSha256, reason and reviewEvidence, then `node scripts/research.mjs revise <run/revision.json>`. Keep the same dossier run directory and persistent review round history; re-claim the destination with a new session run ID. The four-round cap belongs to the dossier/report, not the process or destination lease. Never reset rounds by starting a new run. Exhausted dossiers stay awaiting review/best effort until a genuinely new assessment is justified and disclosed.

After approvals, run `node scripts/research.mjs promote <run/draft.json>` and `node scripts/portal.mjs`. Promotion revalidates saved evidence, receipts, current checkpoint, trip and policy. Publishing a destination cannot replace another destination's latest report. A ledger approval is not a booking recommendation.

## Freshness And Comparison

Analysis is reusable for at most 30 days from the oldest section capture; quotes become historical after 24 hours. Historical amounts must be labeled, never used as live purchase prices. Refresh immediately when entry rules, closures, relevant forecasts, trip settings or review policy change, even within those windows. Seasonality is climatology, not a distant-date forecast. Re-entry, transit documents and remote-work permission must remain explicit decision gates.

Run `node scripts/research.mjs ready`. Comparison waits until every configured destination has a current approved dossier; sourced not_recommended verdicts count, unresolved source blockers do not. The command rechecks artifact hashes and review receipts. Build comparisonInputs from the ID and draft/evidence hashes in that output, and retain tripSha256. Reprice the shortlist on rendered airline-direct and hotel pages within 24 hours; use all configured date windows or explain exclusions. Compare alternative rankings under budget, weather, fatigue and experience priorities. Never represent an analytical ranking as permission to buy.

New destinations are proposals, not silent trip edits. Record name, rationale, tradeoffs, public sources and saved evidence in a run proposal.json. Run `node scripts/research.mjs propose <run/proposal.json>`. Only the user may accept a proposal by updating local/trip.json, expand scope or increase the ceiling. Existing history remains, and changed trip settings require fresh review-bound assessments.

## Public Pages Sync

After a checkpoint, promotion or comparison publication, run `npm run portal` and then `npm run pages:sync`. The public builder exports destination names and credited local imagery only, not the private dossier or trip settings. The sync script is constrained to branch `main`, the configured origin and paths under `docs/`; it makes a docs-only commit and a non-force push. A push conflict is an error; do not force push, reset or include `local/`. Scheduled runtimes must have the user's normal Git SSH authorization. The corporate Pages URL may require Adobe Okta authentication. If sync cannot authenticate or push, preserve the local sanitized docs output and disclose it was not synced.

## Mandatory Automation Sync

After every completed top-level researcher/coordinator automation execution, run `npm run portal` and `npm run pages:sync`, including proposal, blocked and no-change executions. Independent reviewer workers return their receipts to the coordinator and do not publish or push. The sync rebuilds the allowlisted pages, confirms only manifest-owned files are present, then commits only `docs/` and non-force pushes `main` to the configured origin. This docs-only automation commit is explicitly authorized. No other files, local state, evidence, drafts or private reports may be committed/pushed by an automated task. Treat any authentication, policy, validation or push error as a failed publication; report it and keep the private work intact. Never claim a push occurred without successful command output.

## Delivery

`node scripts/portal.mjs` builds the private portal and sanitized public docs. All personal data, evidence and private HTML stay under ignored local/. The sole Git operation authorized for automation is the validated docs-only commit/push performed by `npm run pages:sync`; no other paths may be committed or pushed. Configuring workflows does not register tasks. Record what the host actually scheduled and dispatched, not what documentation intended.
