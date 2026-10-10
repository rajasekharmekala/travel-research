import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const destinationId = destination => digest(destination.name).slice(0, 16);

export function reconcile(state, trip) {
  const next = structuredClone(state ?? { version: 1, destinations: {}, proposals: [] });
  const active = new Set(trip.destinations.map(destinationId));
  for (const record of Object.values(next.destinations)) record.active = active.has(record.id);
  for (const destination of trip.destinations) {
    const id = destinationId(destination);
    next.destinations[id] ??= { id, status: 'pending', attempts: 0, history: [], lease: null, assessment: null };
    Object.assign(next.destinations[id], { destination, active: true });
  }
  next.tripSha256 = digest(trip);
  return next;
}

export function claimDestination(state, { runId, now = new Date().toISOString(), leaseMinutes = 120 }) {
  if (!runId || !Number.isFinite(leaseMinutes) || leaseMinutes <= 0 || !Number.isFinite(Date.parse(now))) throw new Error('Valid run ID, time, and positive lease duration required');
  const records = Object.values(state.destinations).filter(record => record.active);
  const existing = records.find(record => record.lease?.runId === runId && Date.parse(record.lease.expiresAt) > Date.parse(now));
  if (existing) return existing;
  const eligible = records.filter(record => {
    if (record.lease && Date.parse(record.lease.expiresAt) > Date.parse(now)) return false;
    if (record.status === 'awaiting_review') return false;
    if (record.retryAfter && Date.parse(record.retryAfter) > Date.parse(now)) return false;
    if (record.status !== 'approved') return true;
    return record.assessment?.tripSha256 !== state.tripSha256 || (state.reviewPolicySha256 && record.assessment?.policySha256 !== state.reviewPolicySha256) || !Number.isFinite(Date.parse(record.assessment?.freshUntil)) || Date.parse(record.assessment.freshUntil) <= Date.parse(now);
  });
  eligible.sort((left, right) => left.attempts - right.attempts || left.id.localeCompare(right.id));
  const record = eligible[0];
  if (!record) return null;
  if (record.status === 'approved') {
    record.history.push({ event: 'assessment_refresh', at: now, assessment: structuredClone(record.assessment), reviewRounds: structuredClone(record.reviewRounds ?? []) });
    record.reviewRounds = [];
  }
  record.status = 'researching';
  record.attempts += 1;
  record.lease = { runId, token: randomUUID(), claimedAt: now, expiresAt: new Date(Date.parse(now) + leaseMinutes * 60000).toISOString() };
  record.history.push({ event: 'claimed', runId, at: now });
  return record;
}

export function checkpointDestination(state, { id, token, runId, outcome, artifact = null, blocker = null, retryAfter = null, now = new Date().toISOString() }) {
  const record = state.destinations[id];
  if (!record?.lease || record.lease.token !== token || record.lease.runId !== runId || Date.parse(record.lease.expiresAt) <= Date.parse(now)) throw new Error('Missing, expired, or mismatched destination lease');
  if (!['awaiting_review', 'blocked'].includes(outcome)) throw new Error('Checkpoint must be awaiting_review or blocked');
  if (outcome === 'awaiting_review' && (!artifact?.runDir || !artifact.draftSha256 || !artifact.evidenceSha256)) throw new Error('Validated artifact and hashes required');
  if (outcome === 'blocked' && (!blocker?.reason || !blocker.evidence || !blocker.nextAction || !Number.isFinite(Date.parse(retryAfter)) || Date.parse(retryAfter) <= Date.parse(now))) throw new Error('Blocker needs evidence, next action, and future retry time');
  record.status = outcome;
  record.artifact = artifact;
  record.blocker = blocker;
  record.retryAfter = retryAfter;
  record.lease = null;
  record.history.push({ event: outcome, runId, at: now, artifact, blocker });
  return record;
}

export function recordReviewRound(state, { id, draftSha256, evidenceSha256, round, attempts, now = new Date().toISOString() }, maxRounds) {
  const record = state.destinations[id];
  if (record?.status !== 'awaiting_review' || record.artifact?.draftSha256 !== draftSha256 || record.artifact?.evidenceSha256 !== evidenceSha256) throw new Error('Review round must match the current checkpoint');
  record.reviewRounds ??= [];
  if (!Number.isInteger(round) || round !== record.reviewRounds.length + 1 || round > maxRounds || !Array.isArray(attempts) || attempts.length !== 4 || new Set(attempts.map(attempt => attempt.role)).size !== 4 || attempts.some(attempt => !['source', 'consistency', 'coverage', 'opportunities'].includes(attempt.role) || !['approve', 'revise', 'block', 'unavailable'].includes(attempt.status) || typeof attempt.evidence !== 'string' || !attempt.evidence.trim())) throw new Error('Review round requires four evidenced pass attempts within the persistent cap');
  record.reviewRounds.push({ round, draftSha256, evidenceSha256, attempts, at: now });
  record.history.push({ event: 'review_round', round, at: now, draftSha256, evidenceSha256 });
  return record;
}

export function requestRevision(state, { id, draftSha256, reason, reviewEvidence, now = new Date().toISOString() }, maxRounds) {
  const record = state.destinations[id];
  if (record?.status !== 'awaiting_review' || record.artifact?.draftSha256 !== draftSha256 || typeof reason !== 'string' || !reason.trim() || typeof reviewEvidence !== 'string' || !reviewEvidence.trim() || !record.reviewRounds?.length) throw new Error('Revision requires the current draft, feedback and recorded review round');
  if (record.reviewRounds.length >= maxRounds) throw new Error('Review round cap exhausted; retain unapproved output, do not reset rounds');
  record.status = 'pending';
  record.history.push({ event: 'revision_requested', at: now, reason, reviewEvidence, artifact: record.artifact });
  record.artifact = null;
  record.assessment = null;
  return record;
}

export async function transaction(root, update) {
  await mkdir(root, { recursive: true });
  const lock = path.join(root, '.writer-lock');
  try { await mkdir(lock); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Research store is locked; retry later. Remove the lock only after verifying no writer is running.');
    throw error;
  }
  const temporary = path.join(root, `state.${randomUUID()}.tmp`);
  try {
    let state = null;
    try { state = JSON.parse(await readFile(path.join(root, 'state.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const result = await update(state);
    await writeFile(temporary, `${JSON.stringify(result.state, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, path.join(root, 'state.json'));
    return result.value;
  } finally {
    await rm(temporary, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
