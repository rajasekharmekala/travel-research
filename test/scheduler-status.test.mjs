import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordOutcome, stuckThreshold } from '../scripts/scheduler-status.mjs';

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sched-')), 'scheduler.json');

test('progress resets the blocked streak', () => {
  const filename = file();
  recordOutcome(filename, 'BLOCKED', 'nothing claimable');
  recordOutcome(filename, 'BLOCKED', 'still nothing');
  const state = recordOutcome(filename, 'PROGRESS', 'review receipts recorded');
  assert.equal(state.consecutiveBlocked, 0);
  assert.equal(state.stuck, false);
  assert.equal(state.lastOutcome, 'PROGRESS');
});

test('three consecutive blocked runs flag stuck', () => {
  const filename = file();
  for (let run = 1; run < stuckThreshold; run++) {
    assert.equal(recordOutcome(filename, 'BLOCKED', `blocked ${run}`).stuck, false);
  }
  const state = recordOutcome(filename, 'BLOCKED', 'blocked again');
  assert.equal(state.consecutiveBlocked, stuckThreshold);
  assert.equal(state.stuck, true);
});

test('outcome requires a valid value and reason', () => {
  const filename = file();
  assert.throws(() => recordOutcome(filename, 'IDLE', 'x'), /PROGRESS or BLOCKED/);
  assert.throws(() => recordOutcome(filename, 'BLOCKED', '  '), /reason/);
});
