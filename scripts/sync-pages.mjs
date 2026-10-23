import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPages, validateGeneratedPages, manualPagesFiles } from './build-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runGit = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function syncPages(repository = root) {
  const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (git('branch', '--show-current') !== 'main') throw new Error('Pages sync is allowed only from main');
  if (!git('remote', 'get-url', 'origin').endsWith('rajasekharmekala/travel-research.git')) throw new Error('Pages sync remote does not match the configured repository');
  const lock = path.join(repository, '.git', 'pages-sync.lock');
  try { mkdirSync(lock); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('A Pages sync is already running; retry after it completes');
    throw error;
  }
  try {
    buildPages(repository);
    if (!validateGeneratedPages(repository).valid) throw new Error('Pages sync refused unexpected or untracked content under docs');
    const generatedPaths = ['docs', ...manualPagesFiles.map(file => `:(exclude)docs/${file}`)];
    git('add', '--', ...generatedPaths);
    let changes;
    try { git('diff', '--cached', '--quiet', '--', ...generatedPaths); changes = false; } catch (error) {
      if (error.status !== 1) throw error;
      changes = true;
    }
    if (!changes) return { published: false, reason: 'No sanitized Pages changes' };
    git('commit', '--only', '-m', 'Publish sanitized GitHub Pages', '--', ...generatedPaths);
    git('push', 'origin', 'HEAD:main');
    return { published: true, branch: 'main', directory: 'docs' };
  } finally { rmSync(lock, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(syncPages(), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
