import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcile, claimDestination, checkpointDestination, transaction, recordReviewRound, requestRevision, digest } from './research-store.mjs';
import { comparisonReadiness } from './dossier.mjs';
import { readArtifact, promoteDestination, validateComparisonInputs, runFile } from './research-artifacts.mjs';
import { applyReviewPolicy } from './review-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, 'local');
const store = path.join(local, 'research');
const json = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));

export async function main(args = process.argv.slice(2)) {
  const [action, input, argument] = args;
  const trip = json(path.join(local, 'trip.json'));
  const config = applyReviewPolicy(json(path.join(local, 'automation.json')), json(path.join(root, '.agents/config/reviewer.json')));
  let result;
  if (['init', 'claim', 'checkpoint', 'promote', 'propose', 'revise', 'record-review'].includes(action)) {
    result = await transaction(store, async existing => {
      const state = reconcile(existing, trip);
      state.reviewPolicySha256 = digest(config.reviewPolicy);
      let value;
      if (action === 'init') value = { destinations: Object.keys(state.destinations).length, tripSha256: state.tripSha256 };
      if (action === 'claim') value = claimDestination(state, { runId: input, leaseMinutes: argument === undefined ? 120 : Number(argument) });
      if (action === 'checkpoint') {
        const request = json(runFile(local, input));
        if (request.outcome === 'awaiting_review') {
          const artifact = readArtifact(local, path.join(local, request.reportPath), config, trip);
          if (artifact.report.job !== 'destination' || artifact.report.destinationId !== request.id) throw new Error('Checkpoint artifact must match the claimed destination');
          request.artifact = { runDir: artifact.runDir, reportPath: artifact.reportPath, draftSha256: artifact.draftSha256, evidenceSha256: artifact.evidenceSha256 };
        }
        value = checkpointDestination(state, request);
      }
      if (action === 'promote') {
        const artifact = readArtifact(local, input, config, trip, { reviewed: true, historicalPrices: true });
        value = promoteDestination(state, artifact, config);
      }
      if (action === 'propose') {
        const proposal = json(runFile(local, input));
        if (!proposal.name?.trim() || !proposal.rationale?.trim() || !proposal.tradeoffs?.trim() || !Array.isArray(proposal.sources) || !proposal.sources.length || !proposal.evidence?.trim()) throw new Error('Proposal needs name, rationale, tradeoffs, sources and evidence');
        if (trip.destinations.some(destination => destination.name === proposal.name) || state.proposals.some(item => item.name === proposal.name)) throw new Error('Destination already configured or proposed');
        value = { ...proposal, status: 'proposed', proposedAt: new Date().toISOString(), userAccepted: false };
        state.proposals.push(value);
      }
      if (action === 'revise') value = requestRevision(state, json(runFile(local, input)), config.reviewPolicy.max_rounds);
      if (action === 'record-review') value = recordReviewRound(state, json(runFile(local, input)), config.reviewPolicy.max_rounds);
      return { state, value };
    });
  } else if (['status', 'ready', 'validate-comparison'].includes(action)) {
    let state;
    try { state = reconcile(json(path.join(store, 'state.json')), trip); } catch (error) { if (error.code !== 'ENOENT') throw error; state = reconcile(null, trip); }
    if (action === 'status') result = state;
    else {
      result = comparisonReadiness(state, trip);
      for (const item of result.coverage.filter(item => item.ready)) {
        try {
          const artifact = readArtifact(local, path.join(local, item.assessment.reportPath), config, trip, { reviewed: true, historicalPrices: true });
          if (artifact.draftSha256 !== item.assessment.draftSha256 || artifact.evidenceSha256 !== item.assessment.evidenceSha256 || item.assessment.policySha256 !== digest(config.reviewPolicy)) throw new Error('Dossier hashes or review policy changed');
        } catch (error) { item.ready = false; item.reason = `artifact_invalid: ${error.message}`; }
      }
      result.ready = result.coverage.length > 0 && result.coverage.every(item => item.ready);
      if (action === 'validate-comparison') {
        const artifact = readArtifact(local, input, config, trip);
        if (artifact.report.job !== 'comparison') throw new Error('Expected comparison report');
        result = validateComparisonInputs(artifact.report, state, trip, config, local);
      }
    }
  } else throw new Error('Use init | claim <run-id> [lease-minutes] | checkpoint <run/checkpoint.json> | revise <run/revision.json> | promote <run/draft.json> | propose <run/proposal.json> | status | ready | validate-comparison <run/draft.json>');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
