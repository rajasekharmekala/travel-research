import fs from 'node:fs';
import path from 'node:path';
import { hash, validate, validateReviews, evidenceHash } from './publish.mjs';
import { comparisonReadiness } from './dossier.mjs';
import { digest } from './research-store.mjs';

export function runFile(local, filename) {
  const resolved = fs.realpathSync(path.resolve(filename));
  const runs = fs.realpathSync(path.join(local, 'runs'));
  if (!resolved.startsWith(runs + path.sep) || !fs.statSync(resolved).isFile()) throw new Error('Artifact must be a file inside local/runs');
  return resolved;
}

export function readArtifact(local, filename, config, trip, { reviewed = false, historicalPrices = false, requirePricingEffort = false, now = new Date() } = {}) {
  const resolved = runFile(local, filename);
  const bytes = fs.readFileSync(resolved);
  const report = JSON.parse(bytes);
  const directory = path.dirname(resolved);
  validate(report, config, trip, directory, now, { historicalPrices });
  if (requirePricingEffort) validatePricingEffort(report, directory);
  const draftSha256 = hash(bytes);
  const evidenceSha256 = evidenceHash(report, directory);
  let receipts = [];
  if (reviewed) {
    receipts = config.reviewPolicy.passes.map(role => JSON.parse(fs.readFileSync(path.join(directory, 'review', `${role}.review.json`))));
    validateReviews(receipts, config, report, draftSha256, evidenceSha256, trip);
  }
  return { report, receipts, runDir: path.relative(local, directory), reportPath: path.relative(local, resolved), draftSha256, evidenceSha256 };
}

export function promoteDestination(state, artifact, config, now = new Date()) {
  const { report } = artifact;
  const record = state.destinations[report.destinationId];
  if (report.job !== 'destination' || record?.status !== 'awaiting_review' || report.tripSha256 !== state.tripSha256 || record.artifact?.draftSha256 !== artifact.draftSha256 || record.artifact?.evidenceSha256 !== artifact.evidenceSha256 || record.artifact?.reportPath !== artifact.reportPath) throw new Error('Promotion requires the current checkpoint and matching reviewed dossier');
  if (config.pipeline?.requireReviewedDossiers === true) {
    const round = record.reviewRounds?.at(-1);
    if (!round || round.draftSha256 !== artifact.draftSha256 || round.evidenceSha256 !== artifact.evidenceSha256 || round.attempts.some(attempt => attempt.status !== 'approve') || artifact.receipts?.length !== 4 || artifact.receipts.some(receipt => receipt.round !== round.round)) throw new Error('Promotion requires a recorded current approving review round and matching receipts');
  }
  const freshUntil = new Date(Math.min(...report.dossier.sections.map(section => Date.parse(section.observedAt) + 30 * 86400000))).toISOString();
  const priceFreshUntil = new Date(Math.min(...report.candidates.map(candidate => Date.parse(candidate.observedAt) + 86400000))).toISOString();
  if (Date.parse(freshUntil) <= now.getTime()) throw new Error('Cannot promote expired assessment');
  record.status = 'approved';
  record.assessment = { reportPath: artifact.reportPath, runDir: artifact.runDir, draftSha256: artifact.draftSha256, evidenceSha256: artifact.evidenceSha256, tripSha256: report.tripSha256, policySha256: digest(config.reviewPolicy), freshUntil, priceFreshUntil, approvedAt: now.toISOString(), verdict: report.dossier.verdict };
  record.history.push({ event: 'approved', at: now.toISOString(), assessment: structuredClone(record.assessment) });
  return record;
}

export function validateComparisonInputs(report, state, trip, config, local, now = new Date()) {
  const readiness = comparisonReadiness(state, trip, now);
  if (!readiness.ready || report.tripSha256 !== readiness.tripSha256 || !Array.isArray(report.comparisonInputs) || report.comparisonInputs.length !== readiness.coverage.length || new Set(report.comparisonInputs.map(input => input.id)).size !== readiness.coverage.length) throw new Error('Comparison requires all configured destinations with current approved dossiers');
  for (const item of readiness.coverage) {
    const input = report.comparisonInputs.find(entry => entry.id === item.id);
    const assessment = item.assessment;
    if (!input || input.draftSha256 !== assessment.draftSha256 || input.evidenceSha256 !== assessment.evidenceSha256 || assessment.policySha256 !== digest(config.reviewPolicy)) throw new Error('Comparison dossier references or review policy changed');
    const artifact = readArtifact(local, path.join(local, assessment.reportPath), config, trip, { reviewed: true, historicalPrices: true, now });
    if (artifact.draftSha256 !== input.draftSha256 || artifact.evidenceSha256 !== input.evidenceSha256) throw new Error('Comparison input changed since approval');
  }
  return readiness;
}

export function validatePricingEffort(report, directory) {
  for (const candidate of report.candidates ?? []) {
    if (candidate.priceType !== 'estimate') continue;
    const effort = candidate.pricingEffort;
    if (!effort || !Array.isArray(effort.attempts)) throw new Error('Estimate checkpoint requires documented pricingEffort');
    for (const kind of ['flights', 'hotels']) {
      const attempts = effort.attempts.filter(attempt => attempt.kind === kind);
      for (const channel of ['aggregator', 'direct']) {
        if (!attempts.some(attempt => attempt.channel === channel)) throw new Error(`Pricing effort requires ${kind} ${channel} attempt`);
      }
      for (const attempt of attempts) {
        const evidence = attempt.evidence;
        if (!['aggregator', 'direct'].includes(attempt.channel) || !/^https:\/\//.test(attempt.source ?? '') || !Number.isFinite(Date.parse(attempt.observedAt)) || !attempt.result?.trim() || !attempt.searchContext?.trim() || typeof evidence !== 'string' || !report.browser?.evidenceFiles?.includes(evidence)) throw new Error('Pricing attempt needs source, time, exact search context, result and hashed browser evidence');
        const filename = fs.realpathSync(path.resolve(directory, evidence));
        if (!filename.startsWith(fs.realpathSync(directory) + path.sep) || !fs.statSync(filename).isFile() || !fs.readFileSync(filename, 'utf8').trim()) throw new Error('Pricing attempt requires nonempty run-local evidence');
      }
      const basis = effort.basis?.[kind];
      if (!basis?.calculation?.trim() || !basis.assumptions?.trim() || !Array.isArray(basis.evidence) || !basis.evidence.length || basis.evidence.some(file => !attempts.some(attempt => attempt.evidence === file))) throw new Error(`Estimate requires traceable ${kind} calculation, assumptions and evidence`);
    }
  }
}
