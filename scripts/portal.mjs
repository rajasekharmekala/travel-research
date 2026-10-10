import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { reconcile, destinationId, digest } from './research-store.mjs';
import { comparisonReadiness } from './dossier.mjs';
import { readArtifact } from './research-artifacts.mjs';
import { applyReviewPolicy } from './review-policy.mjs';
import { renderHome, renderDestination } from './portal-view.mjs';
import { buildPages } from './build-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const optional = filename => { try { return readJson(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };

export function buildPortal(project = root, now = new Date()) {
  const local = path.join(project, 'local');
  const trip = readJson(path.join(local, 'trip.json'));
  const policy = readJson(path.join(project, '.agents/config/reviewer.json'));
  const config = applyReviewPolicy(readJson(path.join(local, 'automation.json')), policy);
  const state = reconcile(optional(path.join(local, 'research/state.json')), trip);
  const readiness = comparisonReadiness(state, trip, now);
  const output = path.join(local, 'portal');
  fs.mkdirSync(path.join(output, 'destinations'), { recursive: true, mode: 0o700 });
  const media = optional(path.join(output, 'media/catalog.json')) ?? {};
  const entries = trip.destinations.map(destination => {
    const id = destinationId(destination);
    const record = state.destinations[id];
    const ready = readiness.coverage.find(item => item.id === id);
    const entry = { ...record, status: record.status === 'approved' && !ready.ready ? 'stale' : record.status };
    const image = media[destination.name];
    if (image && /^media\/[a-z0-9-]+\.(jpg|png|webp)$/.test(image.file) && fs.existsSync(path.join(output, image.file))) entry.image = image;
    const artifact = record.status === 'approved' ? record.assessment : record.artifact;
    if (artifact?.reportPath) {
      try {
        const loaded = readArtifact(local, path.join(local, artifact.reportPath), config, trip, { reviewed: record.status === 'approved', historicalPrices: true, now });
        if (loaded.report.job !== 'destination' || loaded.report.destinationId !== id || loaded.draftSha256 !== artifact.draftSha256 || loaded.evidenceSha256 !== artifact.evidenceSha256 || (record.status === 'approved' && artifact.policySha256 !== digest(policy))) throw new Error('Stored dossier identity, hashes or policy no longer match');
        entry.report = loaded.report;
        if (entry.status === 'approved') entry.receipts = policy.passes.map(role => readJson(path.join(local, artifact.runDir, 'review', `${role}.review.json`)));
      } catch (error) { entry.status = 'invalid'; entry.error = error.message; }
    }
    return entry;
  });
  const atomicWrite = (filename, content) => {
    const temporary = `${filename}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, filename);
  };
  for (const entry of entries) atomicWrite(path.join(output, 'destinations', `${entry.id}.html`), renderDestination(entry));
  const comparisonFile = path.join(local, 'reports/comparison-latest.html');
  const comparison = fs.existsSync(comparisonFile) ? { href: '../reports/comparison-latest.html', label: 'Last published reviewed comparison. Recheck dates and quote freshness.' } : null;
  atomicWrite(path.join(output, 'index.html'), renderHome(trip, entries, state.proposals, comparison));
  const publicBuild = buildPages(project);
  return { output: path.join(output, 'index.html'), publicOutput: publicBuild.directory, destinations: entries.length, approved: entries.filter(entry => entry.status === 'approved').length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(buildPortal(), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
