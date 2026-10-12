---
name: travel-publication
description: "Use when publishing reviewed travel reports, rebuilding the destination homepage, rendering mobile-friendly itinerary dossiers, or preparing best-effort travel outputs."
---

# Travel Publication

Read ../../workflows/research-protocol.md. Structured drafts, saved evidence and review receipts are the source of truth; HTML is derived. scripts/portal.mjs builds the private local catalog and chaptered dossiers. Never manually insert approval badges or fabricate content to fill an empty page.

Promote reviewed destination dossiers through scripts/research.mjs promote. Publish reviewed comparisons through scripts/publish.mjs publish. Policy-eligible best effort uses publish-best-effort and remains NOT APPROVED; it never replaces the approved ledger or approved latest output. Rebuild the portal after each checkpoint, promotion or meaningful status change.

Preserve the portfolio-inspired neutral report theme, readable chapter hierarchy, mobile navigation, cost breakdowns, exact dates, historical quote labeling, limitations, references and explicit review status. Escape all website/draft text. No trackers, remote personal content, authentication, public hosting, purchases, portfolio access or email. Validate with tests and rendered desktop/mobile checks. Files and configuration do not register tasks.

## Automatic Privacy-Safe Pages Publication

Automatic privacy-safe Pages publication is authorized by the standing policy in AGENTS.md. Every structurally validated current-checkpoint destination dossier is inspectable, including estimate-only and provisional research. Run npm run portal then npm run pages:sync; do not require per-run approval or observed all-in offers for public visibility. Promotion and approved latest outputs remain separate and require genuine current approval receipts. Unresolved review or booking checks remain visibly provisional; never change receipts or ledger approval manually.

Use scripts/public-dossier.mjs for the shared-theme public projection. Include options, provisional day-by-day itineraries, explained qualitative confidence and conditional value labels, unresolved flags/reviewer findings, source freshness and prioritized action plans. The new derived labels are not retrospectively reviewer-approved. Keep personal dates, home airports, document assessments, party costs, budgets, raw evidence and reviewer internals private. Invalid artifacts or privacy leaks stop publication.

## Mandatory Completion Gate

For every completed execution, run `npm run portal`, then `npm run pages:sync`, and confirm the command succeeds or reports no changes. The sync rebuilds/validates the allowlisted public `docs/` tree, commits only docs changes, and non-force pushes `main`. It refuses wrong branches/remotes, conflicting writes, and unlisted docs files. A sync failure means Pages was not published; disclose that rather than claiming completion.

Review clearance consumes only genuine current receipts. The coordinator must attempt the configured deployment before reporting it unavailable; null metadata or absent dedicated registration alone is not evidence of failure. Publish validated privacy-safe research provisionally when clearance is missing, showing actual review status and open findings; never invent approval.

## Visible Lifecycle And Expenses

Follow `.agents/workflows/decision-funnel.md` Research Rounds And Visible Reports. Every dossier includes its assessment table and full label legend. Publish validated provisional, incomplete, estimate-only and historical research with honest statuses; stale analysis must not appear as never researched. Keep the previous validated report visible during queued, running or failed refreshes. Archived approval is not approval for a new round. Historical inspection never grants current review approval.

Public reports show flight and hotel expenses, taxes, baggage, cancellation conditions, dates, airports, traveler counts, party totals and document assessments. This supersedes older skill wording that treated dates, airports or costs as private. Filter credentials, payment/passport identifiers, account data, private artifact paths and trip-purpose framing; do not hide cost findings merely because their raw captures remain private. Do not start research or resume schedules while the user has placed destination runs on hold.
