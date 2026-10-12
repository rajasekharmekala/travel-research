import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const destinationId = destination => digest(destination.name).slice(0, 16);

export function reconcile(state, trip) {
  const next = structuredClone(state ?? { version: 1, destinations: {}, proposals: [] });
  next.round ??= 1;
  const active = new Set(trip.destinations.map(destinationId));
  for (const record of Object.values(next.destinations)) record.active = active.has(record.id);
  for (const destination of trip.destinations) {
    const id = destinationId(destination);
    next.destinations[id] ??= { id, status: 'pending', attempts: 0, history: [], lease: null, assessment: null };
    Object.assign(next.destinations[id], { destination, active: true });
    const record = next.destinations[id];
    record.completedRound ??= ['awaiting_review', 'approved', 'blocked'].includes(record.status) ? next.round : 0;
  }
  next.tripSha256 = digest(trip);
  return next;
}

export function claimDestination(state, { runId, id = null, now = new Date().toISOString(), leaseMinutes = 120 }) {
  if (!runId || !Number.isFinite(leaseMinutes) || leaseMinutes <= 0 || !Number.isFinite(Date.parse(now))) throw new Error('Valid run ID, time, and positive lease duration required');
  const records = Object.values(state.destinations).filter(record => record.active);
  const existing = records.find(record => record.lease?.runId === runId && Date.parse(record.lease.expiresAt) > Date.parse(now));
  if (existing) {
    if (id && existing.id !== id) throw new Error('Run already claims a different destination');
    return existing;
  }
  if (records.length && records.every(record => record.completedRound >= state.round) && !records.some(record => record.lease && Date.parse(record.lease.expiresAt) > Date.parse(now))) state.round += 1;
  const eligible = records.filter(record => {
    if (id && record.id !== id) return false;
    if (record.lease && Date.parse(record.lease.expiresAt) > Date.parse(now)) return false;
    if (record.completedRound >= state.round) return false;
    if (record.retryAfter && Date.parse(record.retryAfter) > Date.parse(now)) return false;
    return true;
  });
  eligible.sort((left, right) => (state.firstDestinationId === left.id ? -1 : state.firstDestinationId === right.id ? 1 : 0) || left.attempts - right.attempts || left.id.localeCompare(right.id));
  const record = eligible[0];
  if (!record) return null;
  if (['approved', 'awaiting_review', 'blocked'].includes(record.status)) {
    record.history.push({ event: 'round_refresh', round: state.round, at: now, artifact: structuredClone(record.artifact), assessment: structuredClone(record.assessment), reviewRounds: structuredClone(record.reviewRounds ?? []) });
    record.previousReport = structuredClone(record.status === 'approved' ? record.assessment : record.artifact) ?? record.previousReport;
    record.previousReviewApproved = record.status === 'approved';
    record.artifact = null;
    record.assessment = null;
    record.reviewRounds = [];
  }
  record.status = 'researching';
  record.attempts += 1;
  record.lease = { runId, token: randomUUID(), round: state.round, claimedAt: now, expiresAt: new Date(Date.parse(now) + leaseMinutes * 60000).toISOString() };
  record.history.push({ event: 'claimed', runId, round: state.round, at: now });
  return record;
}

export function checkpointDestination(state, { id, token, runId, outcome, artifact = null, blocker = null, retryAfter = null, now = new Date().toISOString() }) {
  const record = state.destinations[id];
  if (!record?.lease || record.lease.token !== token || record.lease.runId !== runId || Date.parse(record.lease.expiresAt) <= Date.parse(now)) throw new Error('Missing, expired, or mismatched destination lease');
  if (!['awaiting_review', 'blocked'].includes(outcome)) throw new Error('Checkpoint must be awaiting_review or blocked');
  if (outcome === 'awaiting_review' && (!artifact?.runDir || !artifact.draftSha256 || !artifact.evidenceSha256)) throw new Error('Validated artifact and hashes required');
  if (outcome === 'blocked' && (!blocker?.reason || !blocker.evidence || !blocker.nextAction || !Number.isFinite(Date.parse(retryAfter)) || Date.parse(retryAfter) <= Date.parse(now))) throw new Error('Blocker needs evidence, next action, and future retry time');
  record.completedRound = record.lease.round ?? state.round;
  record.status = outcome;
  record.artifact = artifact;
  record.blocker = blocker;
  record.retryAfter = retryAfter;
  record.lease = null;
  record.history.push({ event: outcome, runId, at: now, artifact, blocker });
  return record;
}

// Clears a self-imposed retry timer on a blocked destination; the reason is logged and no approval state changes.
export function retryNow(state, { id, reason, now = new Date().toISOString() }) {
  const record = state.destinations[id];
  if (record?.status !== 'blocked' || typeof reason !== 'string' || reason.trim().length < 10) throw new Error('retry-now needs a blocked destination and a reason of at least 10 characters');
  record.history.push({ event: 'retry_now', at: now, reason, previousRetryAfter: record.retryAfter ?? null, blocker: record.blocker ?? null });
  record.status = 'pending';
  record.retryAfter = null;
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
  record.completedRound = Math.min(record.completedRound ?? 0, state.round - 1);
  record.previousReport = structuredClone(record.artifact);
  record.previousReviewApproved = false;
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

export async function archiveResearch(local, trip, { reason, firstDestinationId = null, now = new Date().toISOString() } = {}) {
  if (typeof reason !== 'string' || !reason.trim() || !Number.isFinite(Date.parse(now))) throw new Error('Fresh round requires a reason and valid time');
  const empty = reconcile(null, trip);
  if (firstDestinationId && !empty.destinations[firstDestinationId]) throw new Error('First destination is not configured');
  const moves = [];
  let archive;
  try {
    return await transaction(path.join(local, 'research'), async existing => {
      if (Object.values(existing?.destinations ?? {}).some(record => record.lease && Date.parse(record.lease.expiresAt) > Date.parse(now))) throw new Error('Cannot archive while a research lease is active');
      const archiveName = `archive-${now.replace(/[^0-9]/g, '')}-${randomUUID()}`;
      archive = path.join(local, 'runs', archiveName);
      await mkdir(archive, { recursive: true, mode: 0o700 });
      await writeFile(path.join(archive, 'state-before.json'), `${JSON.stringify(existing, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      const entries = await readdir(path.join(local, 'runs'), { withFileTypes: true });
      for (const entry of entries.filter(entry => entry.name !== archiveName)) {
        const from = path.join(local, 'runs', entry.name);
        const to = path.join(archive, entry.name);
        await rename(from, to);
        moves.push({ from, to });
      }
      const outputs = path.join(archive, 'outputs');
      await mkdir(outputs, { mode: 0o700 });
      for (const name of ['decision', 'reports', 'status', 'last-run.json']) {
        const from = path.join(local, name);
        const to = path.join(outputs, name);
        try { await rename(from, to); moves.push({ from, to }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      const state = reconcile(null, trip);
      state.proposals = structuredClone(existing?.proposals ?? []);
      state.firstDestinationId = firstDestinationId;
      state.archivedAt = now;
      state.archive = `runs/${archiveName}`;
      for (const record of Object.values(state.destinations)) {
        const prior = existing?.destinations?.[record.id];
        const reference = (prior?.status === 'approved' ? prior.assessment : prior?.artifact) ?? prior?.previousReport;
        if (reference?.reportPath) {
          record.previousReport = structuredClone(reference);
          for (const key of ['reportPath', 'runDir']) {
            const value = reference[key];
            if (typeof value !== 'string' || !value.startsWith('runs/') || value.includes('..')) throw new Error('Invalid archived report reference');
            record.previousReport[key] = `runs/${archiveName}/${value.slice(5)}`;
          }
          record.previousReviewApproved = prior.status === 'approved' || prior.previousReviewApproved === true;
        }
        record.history.push({ event: 'fresh_round_initialized', at: now, reason, archive: state.archive });
      }
      await writeFile(path.join(archive, 'manifest.json'), JSON.stringify({ reason, now, firstDestinationId, moves: moves.map(move => ({ from: path.relative(local, move.from), to: path.relative(local, move.to) })) }, null, 2), { flag: 'wx', mode: 0o600 });
      return { state, value: { archive: state.archive, destinations: Object.keys(state.destinations).length, firstDestinationId, startedResearch: false } };
    });
  } catch (error) {
    for (const move of moves.reverse()) await rename(move.to, move.from);
    if (archive) await rm(archive, { recursive: true, force: true });
    throw error;
  }
}
