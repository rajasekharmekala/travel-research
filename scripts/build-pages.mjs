import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { destinationId } from './research-store.mjs';
import { renderHome, renderDestination } from './portal-view.mjs';
import { loadPublicDossier, renderPublicDossier, renderDecisionMemo } from './public-dossier.mjs';
import { pageSlugs } from './page-names.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedFile = /^(destinations\/[a-f0-9]{16}\.html|destinations\/[a-z0-9-]+\.html|media\/[a-z0-9-]+\.(jpg|png|webp)|index\.html|decision\.html|README\.md)$/;
const mediaFile = /^media\/[a-z0-9-]+\.(jpg|png|webp)$/;
const sectionImageName = /^[a-z0-9-]+\.(jpg|png|webp)$/;

// These user-maintained files may coexist with generated pages but are never auto-published.
export const manualPagesFiles = ['todo.html', 'todo.md'];

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function writeAtomic(filename, content) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, content, { flag: 'wx' });
  fs.renameSync(temporary, filename);
}

// Readable page names are the public URLs. Legacy 16-hex pages remain as redirects.
function destinationPages(trip) {
  const pages = trip.destinations.map(destination => {
    if (!destination.name?.trim()) throw new Error('Configured destination names are required');
    return { id: destinationId(destination), name: destination.name };
  });
  const ids = new Set();
  for (const page of pages) {
    if (ids.has(page.id)) throw new Error('Duplicate destination page ID');
    ids.add(page.id);
  }
  const slugs = pageSlugs(pages);
  return pages.map(page => {
    const slug = slugs.get(page.id);
    if (/^[a-f0-9]{16}$/.test(slug)) throw new Error('Page name collides with a legacy page ID');
    return { ...page, slug };
  });
}

function redirectPage(slug) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${slug}.html"><link rel="canonical" href="${slug}.html"><title>Moved</title></head><body><p>This page moved to <a href="${slug}.html">${slug}</a>.</p></body></html>\n`;
}

export function buildPages(workspace = project) {
  const privateDirectory = path.join(workspace, 'local');
  const outputDirectory = path.join(workspace, 'docs');
  const portalMedia = path.join(privateDirectory, 'portal');
  const trip = readJson(path.join(privateDirectory, 'trip.json'));
  const catalogFile = path.join(portalMedia, 'media', 'catalog.json');
  const catalog = fs.existsSync(catalogFile) ? readJson(catalogFile) : {};
  const marker = path.join(outputDirectory, '.travel-pages-manifest.json');
  const previous = fs.existsSync(marker) ? readJson(marker) : { version: 1, files: [] };
  if (!Array.isArray(previous.files) || previous.files.some(file => !generatedFile.test(file))) throw new Error('Invalid generated-pages manifest');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const pages = destinationPages(trip);
  const stateFile = path.join(privateDirectory, 'research', 'state.json');
  const researchState = fs.existsSync(stateFile) ? readJson(stateFile) : { round: 1, destinations: {} };
  const entries = pages.map(page => {
    let publicDossier = null;
    let publicationFailed = false;
    try { publicDossier = loadPublicDossier(workspace, trip, page.id); } catch { publicationFailed = true; }
    const record = researchState.destinations?.[page.id];
    return {
      id: page.id,
      slug: page.slug,
      status: publicationFailed ? 'invalid' : publicDossier?.reviewApproved ? 'approved' : record?.status === 'approved' ? 'stale' : record?.status ?? (publicDossier ? 'awaiting_review' : 'pending'),
      round: researchState.round ?? 1,
      completedRound: record?.completedRound ?? 0,
      blocker: record?.blocker ? { reason: record.blocker.reason, nextAction: record.blocker.nextAction } : null,
      destination: { name: page.name },
      publicDossier,
      ...(publicDossier ? { report: { dossier: { thesis: publicDossier.thesis, verdict: publicDossier.verdict } } } : {}),
      publicMessage: publicationFailed ? 'The saved research failed structural or evidence validation and cannot be displayed. A corrected research run is needed; no unsupported content has been published.' : 'No validated destination research is available yet.'
    };
  });

  const mediaDirectory = path.join(outputDirectory, 'media');
  fs.mkdirSync(mediaDirectory, { recursive: true });
  const publicMedia = {};
  for (const [name, item] of Object.entries(catalog)) {
    if (!entries.some(entry => entry.destination.name === name) || !mediaFile.test(item.file) || !item.alt?.trim() || !item.credit?.trim() || !/^https:\/\//.test(item.source)) continue;
    const source = path.resolve(portalMedia, item.file);
    if (!source.startsWith(path.resolve(portalMedia) + path.sep) || !fs.existsSync(source) || !fs.realpathSync(source).startsWith(fs.realpathSync(portalMedia) + path.sep) || !fs.statSync(source).isFile()) continue;
    const filename = path.basename(item.file);
    fs.copyFileSync(source, path.join(mediaDirectory, filename));
    publicMedia[name] = { file: `media/${filename}`, alt: item.alt, credit: item.credit, source: item.source };
  }

  const sectionMedia = new Set();
  for (const entry of entries) {
    if (!entry.publicDossier) continue;
    for (const section of entry.publicDossier.sections) {
      if (!section.image) continue;
      const filename = path.basename(section.image.src);
      const source = path.join(portalMedia, 'media', filename);
      if (!sectionImageName.test(filename) || !fs.existsSync(source)) throw new Error('Section image is missing from local media');
      fs.copyFileSync(source, path.join(mediaDirectory, filename));
      sectionMedia.add(`media/${filename}`);
      if (!publicMedia[entry.destination.name]) {
        publicMedia[entry.destination.name] = { file: `media/${filename}`, alt: section.image.alt, credit: `${section.image.artist} / ${section.image.license}`, source: section.image.sourceUrl };
      }
    }
  }

  const safeTrip = { destinations: trip.destinations.map(({ name }) => ({ name })) };
  const mediaFiles = [...new Set([...Object.values(publicMedia).map(item => item.file), ...sectionMedia])];
  const decisionSource = path.join(privateDirectory, 'decision', 'decision-memo.md');
  const decisionMemo = fs.existsSync(decisionSource) ? fs.readFileSync(decisionSource, 'utf8') : null;
  const files = [
    ...entries.map(entry => `destinations/${entry.slug}.html`),
    ...entries.map(entry => `destinations/${entry.id}.html`),
    ...mediaFiles,
    ...(decisionMemo ? ['decision.html'] : []),
    'index.html',
    'README.md'
  ].sort();
  const destinationDirectory = path.join(outputDirectory, 'destinations');
  for (const entry of entries) {
    const html = entry.publicDossier ? renderPublicDossier(entry) : renderDestination({ ...entry, image: publicMedia[entry.destination.name] });
    writeAtomic(path.join(destinationDirectory, `${entry.slug}.html`), html);
    writeAtomic(path.join(destinationDirectory, `${entry.id}.html`), redirectPage(entry.slug));
  }
  for (const oldFile of previous.files) if (!files.includes(oldFile) && oldFile !== '.travel-pages-manifest.json') fs.rmSync(path.join(outputDirectory, oldFile), { force: true });
  if (decisionMemo) writeAtomic(path.join(outputDirectory, 'decision.html'), renderDecisionMemo(decisionMemo));
  writeAtomic(path.join(outputDirectory, 'index.html'), renderHome(safeTrip, entries.map(entry => ({ ...entry, image: publicMedia[entry.destination.name] })), [], decisionMemo ? { href: 'decision.html', label: 'Read the decision memo' } : null));
  writeAtomic(path.join(outputDirectory, 'README.md'), '# GitHub Pages build\n\nGenerated by `npm run pages`. Validated destination research is automatically published for personal decision-making, including provisional and estimate-only options. Publication is not booking clearance or reviewer approval. Public views omit trip-purpose wording and private artifact paths. Dates, airports, party costs, document assessments, source limitations, open flags, ratings with stated basis and action plans remain visible. Evidence files and reviewer internals are not published.\n');
  writeAtomic(marker, `${JSON.stringify({ version: 2, files }, null, 2)}\n`);
  return {
    pages: entries.length + 1,
    publicAssessments: entries.filter(entry => entry.publicDossier).length,
    privateInputsPublished: false,
    directory: outputDirectory
  };
}

export function validateGeneratedPages(workspace = project) {
  const directory = path.join(workspace, 'docs');
  try {
    const manifest = readJson(path.join(directory, '.travel-pages-manifest.json'));
    const privateDirectory = path.join(workspace, 'local');
    const trip = readJson(path.join(privateDirectory, 'trip.json'));
    const catalogFile = path.join(privateDirectory, 'portal/media/catalog.json');
    const catalog = fs.existsSync(catalogFile) ? readJson(catalogFile) : {};
    const pages = destinationPages(trip);
    const required = new Set([
      ...pages.flatMap(page => [`destinations/${page.slug}.html`, `destinations/${page.id}.html`]),
      ...Object.entries(catalog)
        .filter(([name, item]) => trip.destinations.some(destination => destination.name === name) && mediaFile.test(item.file) && item.alt?.trim() && item.credit?.trim() && /^https:\/\//.test(item.source))
        .map(([, item]) => item.file),
      ...(fs.existsSync(path.join(privateDirectory, 'decision', 'decision-memo.md')) ? ['decision.html'] : []),
      'index.html',
      'README.md'
    ]);
    const listed = manifest.files;
    if (manifest.version !== 2 || !Array.isArray(listed) || new Set(listed).size !== listed.length) return { valid: false };
    if (![...required].every(file => listed.includes(file)) || !listed.every(file => generatedFile.test(file) && (required.has(file) || mediaFile.test(file)))) return { valid: false };
    const expected = new Set([...listed, '.travel-pages-manifest.json']);
    const actual = new Set();
    const visit = (current, relative = '') => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const name = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) throw new Error('Symlinks are not publishable');
        if (entry.isDirectory()) visit(path.join(current, entry.name), name);
        else if (entry.isFile()) actual.add(name);
        else throw new Error('Unsupported docs entry');
      }
    };
    visit(directory);
    return { valid: [...expected].every(file => actual.has(file)) && [...actual].every(file => expected.has(file) || manualPagesFiles.includes(file)) };
  } catch {
    return { valid: false };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(buildPages(), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
