# Dedicated Review Task

## Staged Routing

Read research-protocol.md and `.agents/skills/travel-review/SKILL.md`. Destination reports audit one selected destination deeply; discovery and comparison reports audit all configured destinations. Staged receipts need distinct host-exposed contextId, contextEvidence and modelEvidence. Review tasks must not promote until the coordinator has recorded the complete persistent round and matching approvals. Use scripts/research.mjs promote for destination dossiers, not generic report publication. Use scripts/portal.mjs to rebuild both home and destination pages with the shared theme. Existing statements about all-18 coverage apply to broad discovery/comparison, not single-destination dossiers.

If inline explicit reviewer dispatch is unavailable, create one independent app task per pass in `.agents/config/reviewer.json`: source, consistency, coverage, opportunities. Choose the exact configured Qwen model in each task's model picker. No auto or unconfigured fallback. Four separate fresh sessions provide independent passes; their model identity must still be supported by actual evidence. Files alone do not register tasks.

Task prompt: Read AGENTS.md, .agents/config/reviewer.json, local/automation.json, .agents/workflows/review.md and this file. Execute ONLY the <source|consistency|coverage|opportunities> pass assigned to this task. Find the newest structurally valid draft awaiting this pass. Do not review superseded versions, fabricate findings, write another pass's receipt, or edit the researcher draft/evidence. Apply the role's rubric and save review/<role>.review.json with actual model evidence, draft/evidence hashes, round, verdict and specific severity-rated findings.

Before starting, read review/state.json and the archived round history. Stop after max_rounds; never invent a round or reset the cap. If actual identity or dispatch is unavailable, record that status/evidence for this role without approval. Malformed receipt gets one retry then recorded failure. Recheck public booking evidence under approved browser safeguards; no login, purchase, account/profile access or authentication continuation.

If all four current hash-bound approvals exist, invoke approved publication. If review is incomplete, retain status and let the research/coordinator task aggregate real attempts, unresolved findings, and cap state. Best effort uses a separate unapproved output under the policy; it must not be described as four-pass reviewed. Do not ignore another pass's serious unresolved findings.

## Clarified Responsibilities

Use only the configured roles: source, consistency, coverage, opportunities. Coverage audits every one of the 18 destinations and writes the per-destination assessment required by review.md, even when comparison quotes only a shortlist. Do not approve discovery with skipped destinations; explain real blockers and continuation work honestly. Opportunities produces actionable next-research suggestions; it is constructive, not an adversarial-only or prose-style check. Optional suggestions are not unresolved defects. Keep factual uncertainty and unsupported-claim checks under source/consistency. The round cap applies to a whole report/run, not each location.

Suggested setup: schedule after research or trigger manually when a valid draft exists. A delayed research run may be reviewed on the next attempt. Configure each role and model explicitly in the app; this editing session cannot establish reviewer availability or activate schedules.

## Mandatory Final Sync

After the review coordinator completes the execution, including unavailable reviewers or a no-change outcome, run `npm run portal` and `npm run pages:sync`. Independent reviewer workers return receipts only. Verify the docs-only commit/push or disclose the sync failure. Never commit private drafts, receipts or evidence.
