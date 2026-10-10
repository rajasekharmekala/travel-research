export function applyReviewPolicy(config, policy) {
  if (!policy || typeof policy.model !== 'string' || !policy.model.trim() || policy.model.toLowerCase() === 'auto') throw new Error('Explicit reviewer model required');
  if (!Array.isArray(policy.passes) || policy.passes.length !== 4 || new Set(policy.passes).size !== 4 || !['source', 'consistency', 'coverage', 'opportunities'].every(role => policy.passes.includes(role))) throw new Error('Four review passes required');
  if (!Number.isInteger(policy.max_rounds) || policy.max_rounds < 1 || policy.max_rounds > 4 || policy.require_validator_pass !== true) throw new Error('Review cap must be 1-4 with mandatory validation');
  return { ...config, reviewPolicy: policy, reviewers: Object.fromEntries(policy.passes.map(role => [role, { model: policy.model }])) };
}

export function validateBestEffort(state, policy, draftSha256, evidenceSha256) {
  if (!state || state.draftSha256 !== draftSha256 || state.evidenceSha256 !== evidenceSha256 || state.validatorPassed !== true || !state.reason?.trim() || !Array.isArray(state.unresolvedFindings) || !Array.isArray(state.missingPasses) || !Array.isArray(state.attempts) || state.attempts.length === 0) throw new Error('Best effort requires current validated hashes and review-attempt disclosure');
  if (!Number.isInteger(state.roundsCompleted) || state.roundsCompleted < 0 || state.roundsCompleted > policy.max_rounds) throw new Error('Invalid review round count');
  const unavailable = state.reasonCode === 'reviewer_unavailable' && policy.on_unavailable_reviewer === 'best_effort_with_disclosure' && state.attempts.some(attempt => attempt.status === 'unavailable' && typeof attempt.evidence === 'string' && attempt.evidence.trim());
  const exhausted = state.reasonCode === 'round_limit' && policy.allow_best_effort_after_limit === true && state.roundsCompleted === policy.max_rounds;
  if (!unavailable && !exhausted) throw new Error('Best effort permitted only for evidenced reviewer unavailability or exhausted rounds');
  if (state.missingPasses.some(role => !policy.passes.includes(role))) throw new Error('Unknown missing review pass');
  for (const finding of state.unresolvedFindings) {
    if (!['critical', 'high', 'medium', 'low'].includes(finding.severity) || !finding.message?.trim()) throw new Error('Findings require severity and description');
    if (policy.block_best_effort_severities.includes(finding.severity)) throw new Error('Critical/high unresolved findings block best effort');
  }
  return state;
}

export function validateCoverage(receipt, report, destinations) {
  destinations = Array.isArray(destinations) ? destinations.map(destination => typeof destination === 'string' ? destination : destination?.name) : destinations;
  const assessments = receipt.destinationAssessments;
  if (!Array.isArray(destinations) || destinations.length === 0 || !Array.isArray(assessments) || assessments.length !== destinations.length || new Set(assessments.map(item => item.destination)).size !== destinations.length) throw new Error('Coverage review must assess every configured destination exactly once');
  for (const destination of destinations) {
    const assessment = assessments.find(item => item.destination === destination);
    if (!assessment || !['priced', 'lead', 'blocked', 'not_checked', 'not_shortlisted'].includes(assessment.status) || typeof assessment.reason !== 'string' || !assessment.reason.trim() || typeof assessment.nextAction !== 'string' || !assessment.nextAction.trim()) throw new Error('Coverage assessment requires status, reason and next action for every destination');
    const check = report.destinationChecks?.find(item => item.destination === destination);
    if (check && assessment.status !== check.status) throw new Error('Coverage assessment must match the research ledger');
    if (report.job === 'discovery' && (!check || ['not_checked', 'not_shortlisted'].includes(assessment.status))) throw new Error('Unchecked discovery destinations block approved coverage');
    if (assessment.status === 'priced' && !report.candidates.some(candidate => candidate.destination === destination && candidate.priceType === 'observed')) throw new Error('Priced coverage requires an observed candidate');
    if (assessment.status === 'lead' && !report.candidates.some(candidate => candidate.destination === destination)) throw new Error('Lead coverage requires a candidate');
  }
}
