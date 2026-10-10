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

1. Keep trip-specific settings in ignored `local/trip.json`.
2. Configure schedules, researcher model selections, and any dedicated reviewer tasks in the host app. Repository files describe the intended jobs but cannot register host tasks.
3. Read `AGENTS.md` and the assigned workflow before a run. Model selection and schedule come from the actual host invocation; configuration is not proof of runtime routing. No `local/automation.json` is required.

## Daily Work

Discovery claims one eligible destination and saves a validated dossier draft. The coordinator must attempt genuine inline dispatch of the exact reviewer deployment for all four configured passes. Missing reviewer metadata or unregistered dedicated tasks alone do not establish that inline dispatch is unavailable. If the runtime exposes no dispatch mechanism or calls fail, record concrete evidence and leave the draft pending. Dedicated tasks may be used only when the host confirms they are registered. Approved publication requires all current hash-bound approvals; best-effort output remains explicitly unapproved and follows policy.

## Private Output

- `local/trip.json`: user constraints and configured destinations.
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

Select explicit models in the host app. Record configured model selection separately from actual model identity; only runtime evidence can establish actual routing. Reviewer identity and context must be evidenced for approval. Do not use automatic or unconfigured fallbacks.

## Browser Consent Update

The user has explicitly approved regular browser-canvas research when private isolation is unavailable, subject to the safeguards in `AGENTS.md`. A regular canvas is never described as private, and cookie/login isolation remains unknown. This consent does not authorize login, account/profile access, purchases, CAPTCHA solving, or bot-defense bypass. If consent is revoked, require verified private isolation or stop.

## Accuracy And Coverage Contract

Every discovery draft now needs destinationChecks: one entry per configured destination with destination, status (priced, lead, blocked, not_checked), and a specific reason. coverage contains only priced/lead entries. Include stopReason and nextActions; persist checkpoint.json after each destination and prioritize unfinished entries on the next run. A partial run may have one lead, but it must explain the other 17 entries and why it stopped.

Observed candidates require quoteChecks.flight with travelers:2, exact depart/return, currency:USD, partyTotalUsd matching costs.flights, baggageIncluded:true, taxesIncluded:true, airlineDirectRechecked:true, and conditions. quoteChecks.hotel requires guests:2, exact checkIn/checkOut, actual nights, currency:USD, stayTotalUsd matching costs.hotels, taxesAndFeesIncluded:true, property, room, and cancellation. Check rendered controls, not URL text or generic listings. If arrival changes the required hotel stay, reconcile dates/nights before promoting it from lead. Missing checks mean priceType:estimate; estimates are not ranked trip bargains. Other costs remain projections even with observed flight/hotel quotes. The validator cannot authenticate site contents; independent source review remains essential.

Estimate-only options are published with low price confidence and conditional value assessments, not as verified bargains. Independent review clearance and booking readiness remain separate from visibility. Invalid historical artifacts cannot be silently upgraded; supported current-checkpoint research is automatically visible with its limitations and action plan.

## Dedicated Reviewer Tasks

Dedicated per-pass app tasks are an optional host setup, not a repository registration mechanism. The coordinator attempts inline dispatch first. Use separate app tasks only after the host confirms they are registered; otherwise record the actual inline dispatch failure or unavailable runtime capability and leave review pending. Each genuine pass must use the exact configured deployment and bind its receipt to current draft and evidence hashes.

## Current Review Policy

`.agents/config/reviewer.json` is the sole review-policy owner: exact configured deployment, source/consistency/coverage/opportunities passes, and a maximum of four rounds. Every pass must be an independent genuine invocation with host-backed model/context evidence. Configuration alone does not invoke a model or prove its identity. Approved publication requires all four current approvals; evidenced reviewer unavailability or exhausted rounds can permit only separately labeled NOT APPROVED best effort under policy. Never fabricate attempts, findings, prices, receipts, approvals, or runtime identity.

## GitHub Pages And Privacy

The public site is generated in `docs/` and served from `main:/docs`. Every `npm run portal` rebuilds all configured destination pages in the shared theme. Scheduled workflows run `npm run pages:sync` afterward to commit and push only changed `docs/` pages. The sync is limited to `main`, the configured remote and `docs/`; it never stages `local/`, force-pushes or commits unrelated work. It requires SSH authorization in the task runtime.

The public site automatically includes validated destination research through the privacy-safe projection, including provisional reviews and estimate-only options. Personal dates, home airports, document/employment assessments, budgets, party costs, booking evidence, reviewer internals and raw private artifacts stay excluded. Standing user authorization replaces per-run public-release approval. Publishing does not grant clean reviewer approval or booking readiness.

The Pages source is `main:/docs`. The corporate Pages API reports `built` at https://git.corp.adobe.com/pages/mereddy/travel-search/; unauthenticated requests redirect to Adobe Okta.

## Research Publication Contract

Completed destination research is automatically exported to GitHub Pages for the user's decision-making, including estimates and provisional reviews. Publishing is not booking authorization and does not grant reviewed approval. Pages now displays validated current-checkpoint dossiers instead of permanent placeholders. Unknown eligibility, source failures, reviewer findings, incomplete price conditions and stale quotes remain visible alongside conditional value/confidence labels and a prioritized action plan. Ratings are explained qualitative labels, not calibrated probabilities or new reviewer approvals.

The public projection omits personal travel dates, home airports, document/employment assessments, party costs/budgets, evidence and reviewer internals; full details remain in the local portal. Standing authorization replaces per-run public-release approval. Invalid artifacts and privacy failures block export. `npm run portal` and `npm run pages:sync` generate and push only validated public-safe docs; a failed push is an incomplete publication.
