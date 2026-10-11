import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyReviewPolicy, validateBestEffort, validateCoverage } from '../scripts/review-policy.mjs';
const policy = JSON.parse(fs.readFileSync(new URL('../.agents/config/reviewer.json', import.meta.url)));
const state = () => ({ draftSha256: 'draft', evidenceSha256: 'evidence', validatorPassed: true, reasonCode: 'reviewer_unavailable', reason: 'Host cannot dispatch explicit model', roundsCompleted: 0, missingPasses: policy.passes, unresolvedFindings: [], attempts: [{ status: 'unavailable', evidence: 'Host tool catalog contains no explicit-model dispatch' }] });
test('policy maps all four passes to primary reviewer with fallback chain', () => {
  const config = applyReviewPolicy({}, policy);
  assert.equal(Object.keys(config.reviewers).length, 4);
  assert.equal(config.reviewers.opportunities.model, policy.model);
  assert.deepEqual(config.reviewers.opportunities.fallbackModels, (policy.fallbackModels ?? []).filter(model => model !== policy.model));
  assert.throws(() => applyReviewPolicy({}, { ...policy, model: 'auto' }), /Explicit/);
  assert.throws(() => applyReviewPolicy({}, { ...policy, max_rounds: 5 }), /cap/);
});
test('unavailable best effort requires attempts and current evidence hashes', () => {
  validateBestEffort(state(), policy, 'draft', 'evidence');
  assert.throws(() => validateBestEffort(state(), policy, 'changed', 'evidence'), /hashes/);
  const unproven = state(); unproven.attempts = [];
  assert.throws(() => validateBestEffort(unproven, policy, 'draft', 'evidence'), /disclosure/);
});
test('best effort blocks serious findings and enforces the round cap', () => {
  const unsafe = state(); unsafe.unresolvedFindings = [{ severity: 'high', message: 'Flight quote is for one traveler' }];
  assert.throws(() => validateBestEffort(unsafe, policy, 'draft', 'evidence'), /block/);
  const limited = state(); limited.reasonCode = 'round_limit'; limited.roundsCompleted = 3;
  assert.throws(() => validateBestEffort(limited, policy, 'draft', 'evidence'), /exhausted/);
  limited.roundsCompleted = 4;
  validateBestEffort(limited, policy, 'draft', 'evidence');
});
test('coverage audits all 18 destinations and distinguishes discovery from shortlist comparison', () => {
  const destinations = Array.from({ length: 18 }, (_, index) => `Destination ${index + 1}`);
  const report = { job: 'discovery', candidates: [], destinationChecks: destinations.map(destination => ({ destination, status: 'blocked' })) };
  const receipt = { destinationAssessments: destinations.map(destination => ({ destination, status: 'blocked', reason: 'TEST captured provider error', nextAction: 'Retry alternate public provider' })) };
  validateCoverage(receipt, report, destinations);
  validateCoverage(receipt, report, destinations.map(name => ({ name, airports: [] })));
  assert.throws(() => validateCoverage({ destinationAssessments: receipt.destinationAssessments.slice(1) }, report, destinations), /every/);
  const duplicate = structuredClone(receipt);
  duplicate.destinationAssessments[1] = duplicate.destinationAssessments[0];
  assert.throws(() => validateCoverage(duplicate, report, destinations), /every/);
  receipt.destinationAssessments[0].status = 'not_checked';
  report.destinationChecks[0].status = 'not_checked';
  assert.throws(() => validateCoverage(receipt, report, destinations), /Unchecked/);
  receipt.destinationAssessments[0].status = 'not_shortlisted';
  receipt.destinationAssessments[0].reason = 'TEST longer transit than comparable shortlisted alternatives';
  report.job = 'comparison';
  delete report.destinationChecks;
  validateCoverage(receipt, report, destinations);
});
