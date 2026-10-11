import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scoreKeys = ['foodCulture', 'beach', 'winterScenery', 'nature', 'easeOfTravel'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const httpsUrl = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));

// Structural gate only: it proves coverage and completeness, not that the cited facts are true.
export function validateTriage(triage, trip) {
  if (triage?.schema !== 'triage-v1' || !Array.isArray(triage.destinations)) throw new Error('Triage must use schema triage-v1 with a destinations array');
  const expected = trip.destinations.map(destination => destination.name);
  const names = triage.destinations.map(entry => entry.name);
  if (new Set(names).size !== names.length || expected.length !== names.length || !expected.every(name => names.includes(name))) throw new Error('Triage must cover every configured destination exactly once');
  for (const entry of triage.destinations) {
    const label = entry.name;
    if (!text(entry.region)) throw new Error(`${label}: region is required`);
    if (!Number.isFinite(entry.journey?.oneWayHours) || typeof entry.journey.withinCap !== 'boolean' || !text(entry.journey.route) || !httpsUrl(entry.journey.source)) throw new Error(`${label}: journey needs route, oneWayHours, withinCap and an https source`);
    if (!text(entry.entry?.requirement) || ![true, false, null].includes(entry.entry.feasibleByDec23) || !httpsUrl(entry.entry.source)) throw new Error(`${label}: entry needs requirement, feasibleByDec23 (true, false or null) and an https source`);
    if (!text(entry.decemberFit?.summary) || !httpsUrl(entry.decemberFit.source)) throw new Error(`${label}: decemberFit needs a summary and an https source`);
    for (const key of scoreKeys) {
      const score = entry.scores?.[key];
      if (!Number.isInteger(score?.score) || score.score < 0 || score.score > 5 || !text(score.reason)) throw new Error(`${label}: ${key} needs an integer score 0-5 and a reason`);
    }
    const band = entry.costBand;
    if (!Number.isFinite(band?.lowUsd) || !Number.isFinite(band.highUsd) || band.lowUsd <= 0 || band.lowUsd > band.highUsd || !text(band.basis) || !Array.isArray(band.sources) || !band.sources.length || !band.sources.every(httpsUrl)) throw new Error(`${label}: costBand needs 0 < lowUsd <= highUsd, a basis and https sources`);
    if (!['finalist', 'wildcard', 'cut'].includes(entry.verdict)) throw new Error(`${label}: verdict must be finalist, wildcard or cut`);
    if (entry.verdict === 'cut' && !text(entry.cutReason)) throw new Error(`${label}: a cut needs a cutReason`);
  }
}

export function experienceScore(entry, weights) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const weighted = scoreKeys.reduce((sum, key) => sum + (weights[key] ?? 0) * entry.scores[key].score / 5, 0);
  return Math.round(weighted / total * 1000) / 10;
}

// Applies the profile's hard cuts, scores experience and proposes finalists and wildcards.
export function rankTriage(triage, profile) {
  const { weights, finalists: pick, minExperience = 55 } = profile.scoring;
  const ceiling = profile.attested.budgetCeilingUsd;
  const round = value => Math.round(value * 10) / 10;
  const rows = triage.destinations.map(entry => {
    const experience = experienceScore(entry, weights);
    const mid = (entry.costBand.lowUsd + entry.costBand.highUsd) / 2;
    const cuts = [];
    if (!entry.journey.withinCap) cuts.push('travel time exceeds the cap');
    if (entry.entry.feasibleByDec23 === false) cuts.push('entry authorization cannot be obtained in time');
    if (entry.costBand.lowUsd > ceiling) cuts.push('low-case cost exceeds the budget ceiling');
    return {
      name: entry.name,
      region: entry.region,
      experience,
      valueIndex: round(experience / (mid / 1000)),
      valueIndexWorst: round(experience / (entry.costBand.highUsd / 1000)),
      valueIndexBest: round(experience / (entry.costBand.lowUsd / 1000)),
      costBand: [entry.costBand.lowUsd, entry.costBand.highUsd],
      headroomWorstCaseUsd: ceiling - entry.costBand.highUsd,
      entryUnknown: entry.entry.feasibleByDec23 === null,
      cuts
    };
  });
  const eligible = rows.filter(row => !row.cuts.length);
  const finalists = [];
  const perRegion = {};
  for (const row of [...eligible].filter(item => item.experience >= minExperience).sort((a, b) => b.valueIndex - a.valueIndex)) {
    if (finalists.length >= pick.count) break;
    if ((perRegion[row.region] ?? 0) >= pick.maxPerRegion) continue;
    perRegion[row.region] = (perRegion[row.region] ?? 0) + 1;
    finalists.push(row.name);
  }
  const wildcards = [...eligible].filter(item => !finalists.includes(item.name)).sort((a, b) => b.experience - a.experience).slice(0, pick.wildcards).map(item => item.name);
  const proposed = new Set([...finalists, ...wildcards]);
  const recorded = new Set(triage.destinations.filter(entry => entry.verdict !== 'cut').map(entry => entry.name));
  return {
    ceilingUsd: ceiling,
    ranked: [...rows].sort((a, b) => Number(!!a.cuts.length) - Number(!!b.cuts.length) || b.valueIndex - a.valueIndex),
    finalists,
    wildcards,
    hardCut: rows.filter(row => row.cuts.length).map(row => ({ name: row.name, reasons: row.cuts })),
    disagreements: [
      ...[...proposed].filter(name => !recorded.has(name)).map(name => `${name}: proposed by ranking but recorded as cut`),
      ...[...recorded].filter(name => !proposed.has(name)).map(name => `${name}: recorded as ${triage.destinations.find(entry => entry.name === name).verdict} but not proposed by ranking`)
    ]
  };
}

function main(argv) {
  const [command = 'rank', file] = argv;
  if (command !== 'rank') throw new Error('Usage: node scripts/triage.mjs rank [triage.json]');
  const trip = read(path.join(project, 'local/trip.json'));
  const profile = read(path.join(project, 'local/decision-profile.json'));
  const source = path.resolve(file ?? path.join(project, 'local/decision/triage.json'));
  const triage = read(source);
  validateTriage(triage, trip);
  const result = rankTriage(triage, profile);
  fs.writeFileSync(path.join(path.dirname(source), 'triage-ranking.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
