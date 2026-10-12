import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultFile = path.join(root, 'local', 'status', 'scheduler.json');
export const stuckThreshold = 3;

export function recordOutcome(filename, outcome, reason = '') {
  if (!['PROGRESS', 'BLOCKED'].includes(outcome)) throw new Error('Outcome must be PROGRESS or BLOCKED');
  if (typeof reason !== 'string' || !reason.trim()) throw new Error('Outcome requires a reason');
  let state = { consecutiveBlocked: 0, lastOutcome: null, lastReason: null, lastRun: null, updatedAt: null };
  try { state = { ...state, ...JSON.parse(fs.readFileSync(filename, 'utf8')) }; } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!Number.isInteger(state.consecutiveBlocked) || state.consecutiveBlocked < 0) state.consecutiveBlocked = 0;
  state.consecutiveBlocked = outcome === 'BLOCKED' ? state.consecutiveBlocked + 1 : 0;
  state.lastOutcome = outcome;
  state.lastReason = reason.trim();
  state.lastRun = new Date().toISOString();
  state.updatedAt = state.lastRun;
  state.stuck = state.consecutiveBlocked >= stuckThreshold;
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filename, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  return state;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, outcome, ...rest] = process.argv.slice(2);
    if (action !== 'record') throw new Error('Use record <PROGRESS|BLOCKED> "<reason>"');
    const state = recordOutcome(defaultFile, outcome, rest.join(' '));
    console.log(`OUTCOME: ${state.lastOutcome} - ${state.lastReason}`);
    if (state.stuck) console.log(`STUCK: ${state.consecutiveBlocked} consecutive BLOCKED runs. Pipeline needs intervention.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
