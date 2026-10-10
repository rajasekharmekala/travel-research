# Travel Research

## Staged Destination Architecture

The active workflow is now destination research across multiple runs, not a repeated shallow all-location report. Each configured location receives a source-backed itinerary dossier, four independent review passes, persistent feedback rounds, and an explicit verdict. After all configured dossiers are current and approved, comparison deeply reprices a shortlist and receives its own review. A supported negative dossier is completed research; a missing/blocked dossier is not.

```text
configured destinations -> leased research -> validated dossier -> four-pass review
                                  ^                    |               |
                                  +---- feedback ------+               v
                                                           approved dossier ledger
                                                                       |
                                                         all locations current
                                                                       v
                                                fresh shortlist comparison + review
```

Use `npm run research -- init`, `npm run research -- status`, and `npm run research -- ready` for the durable ledger. Use `npm run portal` for local/portal/index.html and all individual destination pages. The homepage, pending pages, complete dossiers and published destination reports use the same theme and page shell in scripts/portal-view.mjs: identical colors, typography, navigation, status badges and responsive rules. Structured drafts and saved browser evidence remain the source of truth; HTML never creates approval.

Dossiers cover documents/transit, regional climate versus forecasts, experiences and holiday closures, neighborhoods/lodging, transport/fatigue, complete party costs, cancellation risks, alternatives and pushback. Every travel day has lodging, transfers and a weather alternative. Review rounds persist through restarts; analysis has a maximum 30-day lifetime while quotes become historical after 24 hours. Final comparison rechecks all approved dossier hashes and fresh airline/hotel quotes. User-accepted proposals can expand the destination set; agents cannot silently add locations or raise the ceiling.

See .agents/workflows/research-protocol.md for commands and artifact contracts and .agents/workflows/activation.md for host-app task registration. Five repository skills cover research, review, comparison, opportunities and publication. Existing drafts remain untouched and unapproved; they are not retroactively promoted into complete dossiers. Browser consent and exact runtime identity limitations remain unchanged. Host task registration and genuine reviewer dispatch still need app support; files do not activate schedules.

## App Setup

1. Open this project in the Copilot app. Create a daily automation named `Travel discovery`, with this project as its working directory. Paste the contents of `.agents/workflows/daily-discovery.md`. Suggested time: 08:30 America/Los_Angeles.
2. Create a separate DAILY automation named `Travel comparison`, using `.agents/workflows/daily-comparison.md`. Suggested time: 18:30 in the same zone. Both jobs have independent status and can run without the other finishing.
3. Select an explicit researcher model in EACH automation's model picker. Record the exact IDs in `local/automation.json`. Null values deliberately block runs; no auto routing is accepted. This file does not control the app's model picker.
4. Select explicitly supported source and value reviewer models in the same configuration. The host must support independent fresh-context dispatch to those models. At least one reviewer must differ from the researcher. Never assume the portfolio's custom model is available in this runtime.
5. Enable browser tools. Prefer a supported private/incognito context, but regular browser canvas is explicitly authorized for public research when private isolation is unavailable. Do not stop solely over unknown isolation: record regular-canvas with the exact limitation `Regular browser canvas used; cookie and login isolation are unknown.` Never label it incognito. Do not log in, access accounts or profiles, inspect saved bookings, purchase, or continue through authentication requirements.
6. Run each manually once. Manual runs are valid tests of their own capabilities, not proof of future scheduled execution. Save evidence-backed drafts even when actual researcher identity or reviewer dispatch is unavailable. Record executionMode as interactive, scheduled, or unknown. Publication still needs real independent reviewer receipts and approvals. Confirm complete review/publication before relying on published daily reports; record app schedule IDs and registration state separately.

These files do NOT register app automations. This editing session has no app automation API, so registration and picker selection must be completed in the app. Do not assume app schedules run while your machine is offline or the app is closed; verify the host's documented execution behavior. No purchases, logins, email, or push delivery are configured.

## Daily Work

Discovery scans the full 18-destination pool and compares flexible dates and origin airports. Comparison independently verifies a smaller shortlist, including flights, hotel quality, full trip costs, weather, entry/transit questions, and rejected alternatives. Browser automation uses rendered booking pages, not search snippets. Incognito provides cleaner isolation, not guaranteed cheaper fares.

The two independent reviewers check source correctness and value/realism. They work in fresh contexts with explicit models. Approvals are tied to the draft's SHA-256 hash. Revisions invalidate previous receipts. There are at most two rounds; missing approval means no publication, not best-effort advice disguised as reviewed.

## Private Output

- `local/trip.json`: user constraints and 18 destinations.
- `local/automation.json`: intended explicit model IDs and app setup status.
- `local/runs/<timestamp>-<job>/`: browser text/screenshots, draft JSON, reviewer receipts, and approved `report.html`.
- `local/reports/discovery-latest.html` and `comparison-latest.html`: last APPROVED webpages; inspect status before assuming they are fresh.
- `local/status/<job>.json`: latest attempt, coverage, blockers, rejection/publication state.

Reports show candidate totals for two, dates, itemized costs, reasons, compromises, flight/room details, eligibility unknowns, source links, local evidence references, limitations, and reviewer findings/models. Evidence text and screenshots remain in the run folder. Reports are static and can be opened directly; no server or external assets are required. Existing JSON reports from the retired runner are historical, not evidence of browser runs.

## Draft Schema

Write one JSON object at `local/runs/<unique-run>/draft.json`:

```json
{
  "job": "discovery",
  "status": "partial",
  "summary": "Evidence-based summary",
  "configuredModel": "EXPLICIT_MODEL_SELECTED_IN_APP",
  "model": null,
  "modelEvidence": null,
  "executionMode": "interactive",
  "browser": {
    "privateContextVerified": false,
    "verificationMethod": "regular-canvas",
    "isolation": "unknown",
    "isolationEvidence": null,
    "safeguards": {
      "noLogin": true,
      "noAccountAccess": true,
      "noProfileInspection": true,
      "stopOnAuthentication": true
    }
  },
  "coverage": ["EXACT_CONFIGURED_DESTINATION_NAME"],
  "limitations": ["Actual researcher model identity is unverified; configured model is not runtime proof.", "Regular browser canvas used; cookie and login isolation are unknown.", "Explicit coverage and pricing limitations"],
  "candidates": [{
    "destination": "EXACT_CONFIGURED_DESTINATION_NAME",
    "origin": "SFO",
    "travelers": 2,
    "currency": "USD",
    "depart": "2026-12-23",
    "return": "2027-01-02",
    "priceType": "observed",
    "observedAt": "CURRENT_ISO_TIMESTAMP",
    "costs": {
      "flights": 0,
      "hotels": 0,
      "meals": 0,
      "groundTransport": 0,
      "activities": 0,
      "insuranceAndContingency": 0
    },
    "totalUsd": 0,
    "flightDetails": "Airline, party price, baggage, stops, duration, cancellation",
    "hotelDetails": "Property, room, exact nights, taxes, fees, cancellation",
    "reason": "Why consider this rather than alternatives",
    "compromises": "Weather, fatigue, costs, closures, uncertainty",
    "eligibility": "Official sources and unresolved personal requirements",
    "recommendation": "Compare or wait for named requirements; never book authorization",
    "sources": ["https://booking-provider/flight", "https://booking-provider/hotel"],
    "evidence": ["flight-page.txt", "hotel-page.txt"]
  }]
}
```

This is a schema illustration, NOT a quote. Replace placeholders and zero amounts with supported values or save blocked status with no published report. Flight, lodging, and contingency must be positive. Each observed quote needs fresh booking evidence. `estimate` must clearly distinguish projected costs from observed fares. For `ok` discovery, coverage must include every configured destination. Never claim a price was independently verified merely because structural validation passed.

```sh
npm test
npm run validate-report -- local/runs/<run>/draft.json
shasum -a 256 local/runs/<run>/draft.json
npm run publish-report -- local/runs/<run>/draft.json
```

Review receipt format and dispatch rules are in `.agents/workflows/review.md`. Draft validation checks timestamps, arithmetic, explicit configured models, concrete private-context evidence, and local evidence paths. Actual researcher identity can be null with the required disclosure; a known mismatch fails. Publication additionally requires hash-bound independent reviewer approvals and actual reviewer model/fresh-context evidence. When reviews are unavailable, retain the draft and set publicationState: awaiting_review rather than failing research. These checks do not independently authenticate identity, isolation, or website truth. No secrets or third-party private data may be collected. Personal files remain ignored and owner-only.

## Selected Models

The private editable configuration currently records `bc-5-6-luna` with high reasoning for both researchers, `bc-4-1` from BCFoundry Provider for both reviewer passes, and `bc-6-luna` with high reasoning as reviewer fallback. These are user-supplied names, not verified provider/runtime IDs. Match them to the app picker and child-agent runtime before activation. Primary unavailability permits only the configured fallback, with an explicit reason in the review receipt and published report. Change the private configuration and corresponding app model/reasoning selectors together; neither controls the other automatically.

## Browser Consent Update

On 2026-10-09 the user approved regular browser-canvas research under the safeguards above. `local/automation.json` records this revocable policy; set allowRegularBrowser:false and privateBrowserRequired:true to require verified private browsing again. Validation accepts either supported private-context evidence or explicitly authorized regular-canvas mode with unknown isolation, disclosure, and all safeguards. Reviewer approvals remain mandatory for publication. Prior blocked runs are historical and were not rewritten. Restart the app task using the current workflow; update any copied old private-only prompt first.

## Accuracy And Coverage Contract

Every discovery draft now needs destinationChecks: one entry per configured destination with destination, status (priced, lead, blocked, not_checked), and a specific reason. coverage contains only priced/lead entries. Include stopReason and nextActions; persist checkpoint.json after each destination and prioritize unfinished entries on the next run. A partial run may have one lead, but it must explain the other 17 entries and why it stopped.

Observed candidates require quoteChecks.flight with travelers:2, exact depart/return, currency:USD, partyTotalUsd matching costs.flights, baggageIncluded:true, taxesIncluded:true, airlineDirectRechecked:true, and conditions. quoteChecks.hotel requires guests:2, exact checkIn/checkOut, actual nights, currency:USD, stayTotalUsd matching costs.hotels, taxesAndFeesIncluded:true, property, room, and cancellation. Check rendered controls, not URL text or generic listings. If arrival changes the required hotel stay, reconcile dates/nights before promoting it from lead. Missing checks mean priceType:estimate; estimates are not ranked trip bargains. Other costs remain projections even with observed flight/hotel quotes. The validator cannot authenticate site contents; independent source review remains essential.

At least one observed flight-and-hotel option is required for ranked HTML publication. Estimate-only drafts remain leads. Historical drafts without the new ledger/checks fail current validation and must not be silently upgraded. A clearly labeled unreviewed preview can still display their limitations without creating approvals.

## Dedicated Reviewer Tasks

If inline fresh reviewer dispatch is unavailable, create TWO explicit-model app tasks using .agents/workflows/daily-review.md: source and value. Set each role in its prompt and select the configured primary reviewer (or only the configured disclosed fallback). Run after research drafts exist. No tasks are registered by these files. Actual reviewer identity remains required; if the host cannot provide it, keep publication blocked rather than inventing it.

Receipts now include evidenceSha256 as well as draftSha256. Use the evidenceHash command in review.md; approval is invalid after any evidence or draft change. Dedicated tasks read the newest valid draft, verify sources independently, and write only their own role receipt. The second completed pass can invoke publication when both hash-bound approvals are valid. The researcher cannot write reviewer approvals.

## Report Layout

The report now separates comparable observed options from unverified leads, shows full destination coverage and continuation reasons, and provides expandable cost/itinerary/source details. Projected totals are not labeled bookable package prices. Reviewer findings and limitations remain visible. The current historical preview is unreviewed and contains no upgraded prices or fabricated approvals.

## Current Review Policy (Supersedes Earlier Two-Pass Setup)

`.agents/config/reviewer.json` is the single review owner. Model: `54cf1c50-6a65-409c-b27a-535fd089182d/aifoundry/Qwen/Qwen-latest`. Passes: source, consistency, coverage, opportunities. Hard maximum: four complete rounds, with one malformed-output retry per pass before revise/failure. The old bc-4-1/fallback reviewer settings are retired; researcher model choices are unchanged. Provider/model dispatch still needs app verification; configuration does not invoke an external model by itself.

The rubric and receipt/state schemas are in `.agents/workflows/review.md`. Review verifies source support and arithmetic/travel dates, audits all 18 destinations, and proposes constructive next-research opportunities. Coverage receipts assess every destination with status, evidence-backed reason, and next action. Approved discovery cannot skip destinations; comparison can price a shortlist while accounting for exclusions across the full pool. Leads and genuine blockers are not verified quotes. Optional suggestions do not block approval; factual or safety defects do. Receipts go under `<RUN_DIR>/review` and bind current draft/evidence hashes. Four rounds apply per report/run, not per location.

Best effort is allowed for evidenced reviewer unavailability or reaching the four-round limit. It is NOT approval and still requires mandatory quote validation, at least one observed flight/hotel option, current hashes, recorded attempts and missing passes, and disclosed unresolved findings. Critical/high findings block it. `npm run publish-best-effort -- <draft.json>` writes a separate unapproved page without overwriting approved latest reports. No reviewer, pricing evidence, or approval may be invented. This change does not review the old draft or register new app tasks.

## GitHub Pages And Privacy

The public site is generated in `docs/` and served from the `main` branch using `/docs`. Every `npm run portal` build regenerates all configured destination pages and matching homepage in the shared theme. `npm run pages` runs that sanitized export independently. The public list contains configured location names only; it intentionally omits travel dates, travelers, airports, budget, passport/visa and remote-work details, prices, browser evidence, reviewer receipts, private assessments, and local state. No private dossier is automatically copied to the public site. A public assessment requires a separate, reviewed, privacy-safe release; none are currently released.

The private, complete portal and workflow state remain under ignored `local/`. Updating `docs/` creates local Git changes; commit and push those when publication is intended. Repository configuration alone never schedules tasks or publishes unpublished local changes. GitHub Pages must be enabled for branch `main` and directory `/docs` on the corporate host.
