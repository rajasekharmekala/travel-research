import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';
import { syncPages } from '../scripts/sync-pages.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('Pages sync rebuilds sanitized docs, pushes docs-only commits, and preserves unrelated staging', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-pages-sync-'));
  const repository = path.join(temp, 'worktree');
  const remote = path.join(temp, 'mereddy/travel-search.git');
  try {
    fs.mkdirSync(path.join(repository, 'local'), { recursive: true });
    fs.mkdirSync(path.dirname(remote), { recursive: true });
    fs.writeFileSync(path.join(repository, 'local/trip.json'), JSON.stringify({ travelers: 2, budget: { targetUsd: 'PRIVATE-BUDGET' }, destinations: [{ name: 'Initial public name', style: 'PRIVATE-PREFERENCE' }] }));
    buildPages(repository);
    git(temp, 'init', '--bare', remote);
    fs.mkdirSync(repository, { recursive: true });
    git(repository, 'init', '-b', 'main');
    git(repository, 'config', 'user.name', 'Pages Test');
    git(repository, 'config', 'user.email', 'pages-test@example.invalid');
    fs.writeFileSync(path.join(repository, 'application.txt'), 'baseline');
    git(repository, 'add', 'docs', 'application.txt');
    git(repository, 'commit', '-m', 'fixture baseline');
    git(repository, 'remote', 'add', 'origin', remote);
    git(repository, 'push', '-u', 'origin', 'main');

    fs.writeFileSync(path.join(repository, 'local/trip.json'), JSON.stringify({ coreHoliday: { start: 'PRIVATE-DATE' }, destinations: [{ name: 'Updated public name', airports: ['PRIVATE-AIRPORT'] }] }));
    fs.writeFileSync(path.join(repository, 'application.txt'), 'unrelated staged edit');
    git(repository, 'add', 'application.txt');
    const result = syncPages(repository);
    assert.equal(result.published, true);
    const committedFiles = git(repository, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split('\n').filter(Boolean);
    assert.ok(committedFiles.length > 0);
    assert.ok(committedFiles.every(file => file.startsWith('docs/')));
    assert.equal(git(remote, 'show', 'main:docs/index.html').includes('Updated public name'), true);
    assert.equal(git(remote, 'show', 'main:docs/index.html').includes('PRIVATE-'), false);
    assert.match(git(repository, 'status', '--short'), /application\.txt/);
    assert.equal(syncPages(repository).published, false);

    const remoteHead = git(remote, 'rev-parse', 'main');
    fs.writeFileSync(path.join(repository, 'docs/unlisted.txt'), 'must not publish');
    assert.throws(() => syncPages(repository), /unexpected or untracked content/);
    assert.equal(git(remote, 'rev-parse', 'main'), remoteHead);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
