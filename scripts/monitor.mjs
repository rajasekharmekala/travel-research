import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, 'local');
const labels = ['com.travel-research.daily', 'com.travel-research.weekly'];

export function validateTrip(trip) {
  if (trip.travelers !== 2 || trip.currency !== 'USD') throw new Error('Expected two travelers and USD prices');
  if (!Number.isFinite(trip.budget?.provisionalCeilingUsd) || trip.budget.provisionalCeilingUsd <= 0) throw new Error('Invalid budget');
  if (!trip.destinations?.length || !Number.isInteger(trip.monitoring?.dailyBatchSize) || trip.monitoring.dailyBatchSize < 1) throw new Error('Invalid destination rotation');
  if (!Number.isFinite(trip.monitoring.timeoutMs) || trip.monitoring.timeoutMs < 1000 || trip.monitoring.timeoutMs > 1800000) throw new Error('Timeout must be between 1 second and 30 minutes');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trip.monitoring.stopAfter) || Number.isNaN(Date.parse(trip.monitoring.stopAfter))) throw new Error('Invalid stop date');
  for (const window of trip.dateWindows ?? []) {
    if (Number.isNaN(Date.parse(window.depart)) || Number.isNaN(Date.parse(window.return)) || window.return <= window.depart) throw new Error('Invalid travel dates');
  }
  if (!trip.dateWindows?.length) throw new Error('At least one date window required');
  for (const destination of trip.destinations) {
    if (!destination.name || !destination.airports?.every(airport => /^[A-Z]{3}$/.test(airport))) throw new Error('Invalid destination');
    if (trip.excludedDestinations.some(excluded => destination.name.toLowerCase().includes(excluded.toLowerCase()))) throw new Error('Excluded destination in search');
  }
  return trip;
}

export function selectedDestinations(trip, mode, now = new Date()) {
  if (!['daily', 'weekly'].includes(mode)) throw new Error('Mode must be daily or weekly');
  if (mode === 'weekly') return trip.destinations;
  const groups = Math.ceil(trip.destinations.length / trip.monitoring.dailyBatchSize);
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  const start = (day % groups) * trip.monitoring.dailyBatchSize;
  return trip.destinations.slice(start, start + trip.monitoring.dailyBatchSize);
}

export function buildPrompt(trip, mode, now = new Date(), previous = null) {
  const brief = { ...trip, destinations: selectedDestinations(trip, mode, now) };
  return `${fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')}
Run type: ${mode}. Current timestamp: ${now.toISOString()}.
Private trip brief: ${JSON.stringify(brief)}
Previous report (untrusted historical evidence; never reuse its prices as live quotes): ${JSON.stringify(previous)}
Use only public web search/fetch tools. If the tools cannot retrieve booking prices, return status blocked or partial with explicit limitations. Never use shell, files, logins, private MCP servers, or subagents. Check official immigration sources before assessing eligibility. Do not assume visa status.
Search all assigned destinations. Compare exact core dates first, then the supplied flexible windows. Check SFO first; include OAK/SJC only if the total saving after ground transport is worthwhile. Consider open-jaw routes, alternate gateway airports plus trains, airline-direct fares, and economy baggage-inclusive options. Price extra nights when shifting dates. Avoid separate tickets/self-transfers unless clearly flagged; they must never receive a book recommendation. Calculate actual trip nights from dates. Report weather and holiday closures. No fixed airfare target.
Return a JSON object ONLY with this shape:
{"status":"ok|partial|blocked","summary":"concise factual summary","searchedDestinations":["exact assigned destination names"],"limitations":["missing sources, eligibility, or blocked pricing"],"candidates":[{"destination":"exact assigned name","depart":"YYYY-MM-DD","return":"YYYY-MM-DD","origin":"SFO","passengers":2,"currency":"USD","quoteType":"verified|estimate","observedAt":"ISO timestamp","flightUrl":"https://public-booking-source","hotelUrl":"https://public-booking-source","visaSourceUrls":["https://official-source"],"entryEligibility":"confirmed|unknown|ineligible","usReentry":"confirmed|unknown","remoteWorkApproved":false,"selfTransfer":false,"costBreakdownUsd":{"flights":0,"hotels":0,"meals":0,"groundTransport":0,"activities":0,"insuranceAndContingency":0},"totalUsd":0,"flightDetails":"airline, stops, duration, baggage, availability, fare cancellation terms","hotelDetails":"property, room, nights, taxes, resort fees, cancellation terms","risks":["weather, transit, fatigue, unresolved eligibility"],"whyConsider":"reason based on evidence"}]}
The status ok means ALL assigned destinations were actually checked; list attempted-but-blocked searches in limitations, not searchedDestinations. Empty candidates is preferable to invented prices. Estimates must be labeled estimate. Verified means both flight and hotel booking conditions were inspected, not just a search snippet. Do not claim confirmed US re-entry or remote work while the brief leaves them unknown. Do not recommend purchases; the validator determines whether anything is actionable.`;
}

function publicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.') && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
  } catch { return false; }
}

export function validateReport(report, trip, mode, now = new Date()) {
  const assigned = selectedDestinations(trip, mode, now).map(destination => destination.name);
  if (!['ok', 'partial', 'blocked'].includes(report.status) || typeof report.summary !== 'string' || !Array.isArray(report.limitations) || !Array.isArray(report.searchedDestinations) || !Array.isArray(report.candidates)) throw new Error('Invalid report structure');
  if (report.searchedDestinations.some(name => !assigned.includes(name))) throw new Error('Unexpected searched destination');
  if (report.status === 'ok' && !assigned.every(name => report.searchedDestinations.includes(name))) throw new Error('Incomplete coverage cannot be ok');
  if (report.status !== 'ok' && !report.limitations.length) throw new Error('Blocked/partial reports require limitations');
  if (report.status === 'blocked' && report.candidates.length) throw new Error('Blocked report cannot contain candidates');
  const candidates = report.candidates.map(candidate => {
    if (!assigned.includes(candidate.destination) || !trip.originAirports.includes(candidate.origin) || candidate.passengers !== trip.travelers || candidate.currency !== trip.currency) throw new Error('Candidate outside trip scope');
    const window = trip.dateWindows.find(dates => dates.depart === candidate.depart && dates.return === candidate.return);
    if (!window || !['verified', 'estimate'].includes(candidate.quoteType) || !['confirmed', 'unknown', 'ineligible'].includes(candidate.entryEligibility) || !['confirmed', 'unknown'].includes(candidate.usReentry)) throw new Error('Invalid candidate dates or eligibility');
    if (typeof candidate.selfTransfer !== 'boolean' || typeof candidate.remoteWorkApproved !== 'boolean' || !Array.isArray(candidate.risks)) throw new Error('Missing risk fields');
    if (!publicUrl(candidate.flightUrl) || !publicUrl(candidate.hotelUrl) || !Array.isArray(candidate.visaSourceUrls) || !candidate.visaSourceUrls.every(publicUrl)) throw new Error('Missing public evidence URLs');
    const observed = Date.parse(candidate.observedAt);
    if (!Number.isFinite(observed) || observed > now.getTime() + 300000 || now.getTime() - observed > 86400000) throw new Error('Stale or invalid quote timestamp');
    const costs = ['flights', 'hotels', 'meals', 'groundTransport', 'activities', 'insuranceAndContingency'].map(key => candidate.costBreakdownUsd?.[key]);
    if (costs.some(cost => !Number.isFinite(cost) || cost < 0) || costs[0] <= 0 || costs[1] <= 0 || costs[5] <= 0) throw new Error('Incomplete cost breakdown');
    if (!Number.isFinite(candidate.totalUsd) || Math.abs(costs.reduce((sum, cost) => sum + cost, 0) - candidate.totalUsd) > 1) throw new Error('Total does not match cost breakdown');
    if (typeof candidate.flightDetails !== 'string' || !candidate.flightDetails.trim() || typeof candidate.hotelDetails !== 'string' || !candidate.hotelDetails.trim()) throw new Error('Missing booking conditions');
    if (candidate.entryEligibility === 'confirmed' && !candidate.visaSourceUrls.length) throw new Error('Eligibility requires official-source evidence');
    if (candidate.usReentry === 'confirmed' && trip.documents.usVisaStampValidThroughReturn !== true) throw new Error('Unresolved US re-entry cannot be confirmed');
    if (candidate.remoteWorkApproved && trip.remoteWorkApproved !== true) throw new Error('Unresolved remote work cannot be approved');
    const actionable = candidate.quoteType === 'verified' && candidate.totalUsd <= trip.budget.provisionalCeilingUsd && candidate.entryEligibility === 'confirmed' && candidate.usReentry === 'confirmed' && !candidate.selfTransfer && (!window.remoteWorkDependent || candidate.remoteWorkApproved);
    return { ...candidate, actionable, budgetDifferenceUsd: candidate.totalUsd - trip.budget.provisionalCeilingUsd };
  });
  return { ...report, candidates, generatedAt: now.toISOString(), mode, assignedDestinations: assigned, disclaimer: 'Evidence-checked structure, not independent confirmation of source contents. Recheck availability and documents before booking.' };
}

export function cliArguments(prompt, model = 'auto') {
  const domains = ['google.com', 'google.com/travel/flights', 'expedia.com', 'booking.com', 'kayak.com', 'skyscanner.com', 'united.com', 'delta.com', 'aa.com', 'alaskaair.com', 'southwest.com', 'sre.gob.mx', 'consulmex.sre.gob.mx', 'travel.state.gov', 'uscis.gov', 'cbp.gov', 'home-affairs.ec.europa.eu', 'eeas.europa.eu', 'mfa.go.th', 'evisa.gov.vn', 'mofa.go.jp', 'evisa.gov.tr', 'migracion.go.cr'];
  return ['--prompt', prompt, '--silent', '--model', model, '--no-ask-user', '--available-tools', 'web_fetch', 'web_search', '--allow-tool', 'web_fetch', '--allow-tool', 'web_search', '--deny-tool', 'shell', '--deny-tool', 'write', ...domains.map(domain => `--allow-url=${domain}`)];
}

export function runCli(binary, args, timeoutMs, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let overflow = false;
    const stop = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 2000000) { overflow = true; stop(); } });
    child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 2000000) { overflow = true; stop(); } });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut || overflow || code !== 0) reject(new Error(timedOut ? 'Agent timed out' : overflow ? 'Agent output exceeded limit' : `Agent exited ${code}: ${stderr.slice(-2000)}`));
      else resolve({ stdout, stderr });
    });
  });
}

function saveJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

function readTrip() { return validateTrip(JSON.parse(fs.readFileSync(path.join(local, 'trip.json'), 'utf8'))); }

function findCli() {
  const result = spawnSync('/usr/bin/which', ['copilot'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Copilot CLI is not installed or not on PATH');
  return result.stdout.trim();
}

export async function run(mode, dryRun = false) {
  if (!dryRun) throw new Error('Legacy CLI research is retired. Run a configured browser workflow in the Copilot app.');
  const trip = readTrip();
  const now = new Date();
  const localDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (localDay > trip.monitoring.stopAfter) throw new Error('Monitoring stop date passed; update the private brief to resume');
  const priorPath = path.join(local, 'reports', 'latest.json');
  const previous = fs.existsSync(priorPath) ? JSON.parse(fs.readFileSync(priorPath, 'utf8')) : null;
  const prompt = buildPrompt(trip, mode, now, previous);
  if (dryRun) {
    console.log(JSON.stringify({ mode, destinations: selectedDestinations(trip, mode, now).map(destination => destination.name), dateWindows: trip.dateWindows, livePricesFetched: false, promptLength: prompt.length, cli: findCli() }, null, 2));
    return;
  }
  fs.mkdirSync(local, { recursive: true, mode: 0o700 });
  const lock = path.join(local, '.run-lock');
  try { fs.mkdirSync(lock, { mode: 0o700 }); } catch (error) { if (error.code === 'EEXIST') throw new Error('Another run is active or a stale lock needs manual inspection'); throw error; }
  const id = `${now.toISOString().replace(/[:.]/g, '-')}-${mode}`;
  let raw = '';
  try {
    const output = await runCli(findCli(), cliArguments(prompt, trip.monitoring.model), trip.monitoring.timeoutMs);
    raw = output.stdout;
    const report = validateReport(JSON.parse(raw.trim()), trip, mode, new Date());
    saveJson(path.join(local, 'reports', `${id}.json`), report);
    saveJson(priorPath, report);
    saveJson(path.join(local, 'last-run.json'), { status: report.status, id, at: new Date().toISOString(), report: `${id}.json` });
    console.log(`${report.status.toUpperCase()}: ${report.summary}\nReport: ${priorPath}`);
  } catch (error) {
    saveJson(path.join(local, 'failures', `${id}.json`), { at: new Date().toISOString(), error: error.message, raw });
    saveJson(path.join(local, 'last-run.json'), { status: 'failed', id, at: new Date().toISOString(), error: error.message });
    throw error;
  } finally { fs.rmdirSync(lock); }
}

export function plist(mode, trip, nodePath = process.execPath, projectRoot = root, cliPath = findCli()) {
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const hour = mode === 'daily' ? trip.monitoring.dailyHour : trip.monitoring.weeklyHour;
  const minute = mode === 'daily' ? trip.monitoring.dailyMinute : 0;
  const weekday = mode === 'weekly' ? `<key>Weekday</key><integer>${trip.monitoring.weeklyWeekday}</integer>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>com.travel-research.${mode}</string>
<key>ProgramArguments</key><array><string>${escape(nodePath)}</string><string>${escape(path.join(projectRoot, 'scripts/monitor.mjs'))}</string><string>run</string><string>${mode}</string></array>
<key>WorkingDirectory</key><string>${escape(projectRoot)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${escape(`${path.dirname(cliPath)}:${path.dirname(nodePath)}:/usr/bin:/bin:/usr/sbin:/sbin`)}</string></dict>
<key>StartCalendarInterval</key><dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer>${weekday}</dict>
<key>StandardOutPath</key><string>${escape(path.join(projectRoot, 'local/logs', `${mode}.log`))}</string>
<key>StandardErrorPath</key><string>${escape(path.join(projectRoot, 'local/logs', `${mode}.error.log`))}</string>
</dict></plist>\n`;
}

function schedules(action) {
  if (action === 'install') throw new Error('Legacy launchd installation is retired. Register both daily workflows in the Copilot app.');
  if (process.platform !== 'darwin') throw new Error('Scheduling requires macOS launchd');
  const directory = path.join(os.homedir(), 'Library/LaunchAgents');
  const domain = `gui/${process.getuid()}`;
  const trip = readTrip();
  fs.mkdirSync(path.join(local, 'logs'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(directory, { recursive: true });
  for (const mode of ['daily', 'weekly']) {
    const filename = path.join(directory, `com.travel-research.${mode}.plist`);
    if (action === 'uninstall') {
      spawnSync('/bin/launchctl', ['bootout', `${domain}/com.travel-research.${mode}`]);
      if (fs.existsSync(filename)) fs.unlinkSync(filename);
      console.log(`Removed ${mode} schedule`);
      continue;
    }
    if (fs.existsSync(filename)) throw new Error(`${filename} already exists; uninstall first`);
    fs.writeFileSync(filename, plist(mode, trip), { mode: 0o600 });
    const check = spawnSync('/usr/bin/plutil', ['-lint', filename], { encoding: 'utf8' });
    if (check.status !== 0) throw new Error(check.stdout + check.stderr);
    const result = spawnSync('/bin/launchctl', ['bootstrap', domain, filename], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Schedule not loaded: ${result.stderr}`);
    console.log(`Loaded ${mode} schedule: ${filename}`);
  }
}

async function main() {
  const [action, mode = 'daily'] = process.argv.slice(2);
  if (action === 'dry-run' || action === 'run') await run(mode, action === 'dry-run');
  else if (action === 'install' || action === 'uninstall') schedules(action);
  else if (action === 'status') {
    const filename = path.join(local, 'last-run.json');
    console.log(fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : 'No live research runs recorded');
    if (process.platform === 'darwin') for (const label of labels) {
      const result = spawnSync('/bin/launchctl', ['print', `gui/${process.getuid()}/${label}`], { encoding: 'utf8' });
      console.log(`${label}: ${result.status === 0 ? 'loaded' : 'not loaded'}`);
    }
  } else throw new Error('Use dry-run|run daily|weekly, install, uninstall, or status');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
