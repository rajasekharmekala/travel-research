import fs from 'node:fs';
import path from 'node:path';
import { readArtifact, runFile } from './research-artifacts.mjs';
import { applyReviewPolicy } from './review-policy.mjs';
import { pageShell } from './portal-view.mjs';
import { loadPresentation } from './presentation.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const money = value => Number(value).toLocaleString('en-US');

const purposeRules = [
  [/\bhoneymoon(?:ers?|ing)?\b/gi, 'trip'],
  [/\bnewlyweds?\b/gi, 'travelers'],
  [/\bthis couple['\u2019]s\b/gi, 'these'],
  [/\bfor this couple\b/gi, match => `${match[0] === 'F' ? 'For' : 'for'} this trip`]
];

const sectionTitles = {
  decision: 'Decision summary',
  entry_and_transit: 'Entry and transit',
  climate_and_weather: 'Climate and weather',
  experiences_and_closures: 'Experiences and closures',
  neighborhoods_and_lodging: 'Neighborhoods and lodging',
  transport_and_fatigue: 'Transport and travel fatigue',
  budget_and_value: 'Budget and value',
  risks_and_cancellation: 'Risks and cancellation',
  alternatives_and_pushback: 'Alternatives and pushback'
};

const costLabels = {
  flights: 'Flights',
  hotels: 'Hotels',
  meals: 'Meals',
  groundTransport: 'Ground transport',
  activities: 'Activities',
  insuranceAndContingency: 'Insurance and contingency'
};

export function publicText(value) {
  let text = String(value ?? '');
  for (const [pattern, replacement] of purposeRules) text = text.replace(pattern, replacement);
  return text.replace(/local\/[\w./-]+/g, '[private artifact omitted]');
}

export function sectionTitle(key) {
  if (sectionTitles[key]) return sectionTitles[key];
  const words = String(key ?? '').replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function publicSource(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return `${url.origin}${url.pathname}`;
  } catch { return null; }
}

function routeOf(url) {
  const match = url.pathname.match(/([A-Z]{3})-([A-Z]{3})/i);
  return match ? ` (${match[1].toUpperCase()} to ${match[2].toUpperCase()})` : '';
}

const sourceNames = [
  [/(^|\.)kayak\.com$/, url => /hotel/i.test(url.pathname) ? 'KAYAK hotel search' : `KAYAK flight search${routeOf(url)}`],
  [/(^|\.)wien\.info$/, () => 'Vienna Tourism (wien.info)'],
  [/(^|\.)munich\.travel$/, () => 'Munich Tourism (munich.travel)'],
  [/(^|\.)europa\.eu$/, () => 'EU Your Europe (europa.eu)'],
  [/(^|\.)uscis\.gov$/, () => 'USCIS'],
  [/(^|\.)weatherspark\.com$/, () => 'Weather Spark'],
  [/(^|\.)cityairporttrain\.com$/, () => 'City Airport Train'],
  [/(^|\.)viennaairport\.com$/, () => 'Vienna Airport']
];

function sourceLabels(urls) {
  const bases = urls.map(value => {
    const url = new URL(value);
    const known = sourceNames.find(([host]) => host.test(url.hostname));
    return known ? known[1](url) : url.hostname.replace(/^www\./, '');
  });
  return bases.map((label, index) => {
    if (bases.filter(other => other === label).length < 2) return label;
    const detail = new URL(urls[index]).pathname.split('/').filter(Boolean).pop() ?? '';
    return detail ? `${label}: ${detail.replace(/[-_]+/g, ' ')}` : label;
  });
}

export function projectPublicDossier(report, trip, reviewStatus, findings = [], presentation = null) {
  const clean = value => publicText(value);
  const sections = report.dossier.sections.map(section => {
    const image = presentation?.images?.[section.key] ?? null;
    const sources = [...new Set(section.sources.map(publicSource).filter(Boolean))];
    return {
      key: section.key,
      title: sectionTitle(section.key),
      text: clean(section.text),
      sources,
      sourceLabels: sourceLabels(sources),
      image: image ? {
        src: `../media/${image.file}`,
        alt: image.alt,
        title: image.title.replace(/^File:/, ''),
        artist: image.artist,
        license: image.license,
        sourceUrl: image.sourceUrl
      } : null
    };
  });
  const options = report.candidates.map((candidate, index) => {
    const rated = presentation?.options?.get(index) ?? null;
    const total = Number.isFinite(candidate.totalUsd) ? candidate.totalUsd : null;
    return {
      label: `Option ${index + 1}: ${candidate.destination}`,
      priceType: candidate.priceType,
      travelers: candidate.travelers ?? null,
      ratings: rated?.ratings ?? null,
      reason: clean(candidate.reason),
      tradeoffs: clean(candidate.compromises),
      flights: clean(candidate.flightDetails),
      lodging: clean(candidate.hotelDetails),
      observedAt: candidate.observedAt ?? null,
      totalUsd: total,
      costs: Object.entries(candidate.costs ?? {}).map(([key, amount]) => ({
        label: costLabels[key] ?? sectionTitle(key),
        amount,
        basis: rated?.costBasis?.[key]?.basis ?? 'not classified',
        note: rated?.costBasis?.[key]?.note ?? 'No basis recorded for this line.'
      }))
    };
  });
  return {
    thesis: clean(report.dossier.thesis).split(/(?<=\.)\s/)[0],
    verdict: report.dossier.verdict,
    researchDate: String(report.candidates[0]?.observedAt ?? '').slice(0, 10),
    reviewStatus,
    sections,
    options,
    itinerary: report.dossier.itinerary.map((day, index) => ({
      day: index + 1,
      location: clean(day.location),
      plan: clean(day.plan),
      lodging: clean(day.lodging),
      transfer: clean(day.transfer),
      weatherAlternative: clean(day.weatherAlternative)
    })),
    flags: [...report.dossier.unresolved.map(clean), ...findings.map(clean)],
    actions: report.dossier.nextChecks.map((item, index) => ({ priority: index < 4 ? 'High' : 'Medium', text: clean(item) })),
    limitations: report.limitations.map(clean)
  };
}

export function loadPublicDossier(workspace, trip, id) {
  const local = path.join(workspace, 'local');
  const stateFile = path.join(local, 'research/state.json');
  if (!fs.existsSync(stateFile)) return null;
  const record = read(stateFile).destinations?.[id];
  const reference = record?.status === 'approved' ? record.assessment : record?.artifact;
  if (!reference?.reportPath) return null;
  const filename = runFile(local, path.resolve(local, reference.reportPath));
  const report = read(filename);
  const policy = read(path.join(workspace, '.agents/config/reviewer.json'));
  const configFile = path.join(local, 'automation.json');
  const settings = fs.existsSync(configFile) ? read(configFile) : {
    jobs: {
      discovery: { researcherModel: report.configuredModel ?? report.model },
      comparison: { researcherModel: report.configuredModel ?? report.model }
    },
    researchPolicy: { allowRegularBrowser: true },
    privateBrowserRequired: false
  };
  const config = applyReviewPolicy(settings, policy);
  const artifact = readArtifact(local, filename, config, trip, { historicalPrices: true });
  if (report.job !== 'destination' || report.destinationId !== id || artifact.draftSha256 !== reference.draftSha256 || artifact.evidenceSha256 !== reference.evidenceSha256) {
    throw new Error('Public dossier requires a matching validated checkpoint');
  }
  let reviewStatus = 'Provisional: independent review is incomplete or did not approve this draft.';
  try {
    readArtifact(local, filename, config, trip, { reviewed: true, historicalPrices: true });
    reviewStatus = 'Four independent passes approved the source draft. Approval is not booking readiness.';
  } catch (error) {
    reviewStatus = error.message === 'Unresolved findings cannot receive approved publication'
      ? 'Provisional research: reviewers retain unresolved findings. See open flags; approval is not clean clearance.'
      : 'Provisional research: independent review evidence is incomplete or not cleared for this draft.';
  }
  const presentation = loadPresentation(path.dirname(filename), artifact, {
    candidates: report.candidates,
    sectionKeys: report.dossier.sections.map(section => section.key),
    mediaDirectory: path.join(local, 'portal', 'media')
  });
  const reviewFile = path.join(path.dirname(filename), 'review/state.json');
  const review = fs.existsSync(reviewFile) ? read(reviewFile) : null;
  const findings = review?.draftSha256 === artifact.draftSha256 && review?.evidenceSha256 === artifact.evidenceSha256
    ? (review.unresolvedFindings ?? []).map(finding => finding.message)
    : [];
  for (const role of policy.passes) {
    const receiptFile = path.join(path.dirname(filename), 'review', `${role}.review.json`);
    if (!fs.existsSync(receiptFile)) continue;
    const receipt = read(receiptFile);
    if (receipt.draftSha256 !== artifact.draftSha256 || receipt.evidenceSha256 !== artifact.evidenceSha256) continue;
    findings.push(...(receipt.findings ?? []).filter(finding => !finding.resolved).map(finding => `${role}: ${finding.message}`));
  }
  return projectPublicDossier(report, trip, reviewStatus, findings, presentation);
}

const figure = image => image ? `<figure class="section-image"><img src="${escape(image.src)}" alt="${escape(image.alt)}" loading="lazy"><figcaption>Image: ${escape(image.artist)}, ${escape(image.license)}, <a href="${escape(image.sourceUrl)}" rel="noreferrer">${escape(image.title)} on Wikimedia Commons</a></figcaption></figure>` : '';

const ratingBlock = option => option.ratings
  ? `<div class="ratings"><p><strong>Value rating: ${escape(option.ratings.value.label)}</strong></p><p>${escape(option.ratings.value.rationale)}</p><p><strong>Price confidence: ${escape(option.ratings.priceConfidence.label)}</strong></p><p>${escape(option.ratings.priceConfidence.rationale)}</p></div>`
  : '<div class="ratings"><p><strong>Value rating: Not yet rated</strong></p><p>No researcher-prepared rating is attached to this option.</p></div>';

const costTable = option => `<table class="cost-table"><thead><tr><th>Cost line</th><th>USD</th><th>Basis</th><th>How this line was derived</th></tr></thead><tbody>${option.costs.map(line => `<tr><td>${escape(line.label)}</td><td>${escape(money(line.amount))}</td><td>${escape(line.basis)}</td><td>${escape(line.note)}</td></tr>`).join('')}</tbody></table>`;

const sourceLinks = section => section.sources.map((source, index) => `<a href="${escape(source)}" rel="noreferrer">${escape(section.sourceLabels[index])}</a>`).join('');

const styles = '<style>.section-image{margin:1.25rem 0}.section-image img{display:block;width:100%;max-height:380px;object-fit:cover;border-radius:8px}.section-image figcaption{font-size:.85rem;color:#666;margin-top:.4rem}.ratings p{margin:.3rem 0}.cost-table{width:100%;border-collapse:collapse;margin:.75rem 0;font-size:.92rem}.cost-table th,.cost-table td{border-bottom:1px solid #ddd;padding:.4rem;text-align:left;vertical-align:top}</style>';

export function renderPublicDossier(entry) {
  const dossier = entry.publicDossier;
  const list = items => `<ul>${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`;
  const chapters = dossier.sections.map(section => `<section class="chapter" id="${escape(section.key.replace(/_/g, '-'))}"><h2>${escape(section.title)}</h2>${figure(section.image)}<div class="prose">${escape(section.text)}</div><div class="references">${sourceLinks(section)}</div></section>`).join('');
  const options = dossier.options.map(option => `<section class="chapter"><h3>${escape(option.label)}</h3>${ratingBlock(option)}<p>Why it is a candidate: ${escape(option.reason)}</p><p><strong>Party cost: ${option.totalUsd === null ? 'not recorded' : `USD ${money(option.totalUsd)}`}${option.travelers ? ` for ${escape(option.travelers)} travelers` : ''}.</strong> Price evidence: ${escape(option.priceType)}. Price snapshot time: ${escape(option.observedAt ?? 'not recorded')}. Observed prices become historical after 24 hours; recheck before any decision.</p>${costTable(option)}<p>${escape(option.flights)}</p><p>${escape(option.lodging)}</p><p>Tradeoffs: ${escape(option.tradeoffs)}</p></section>`).join('');
  const itinerary = dossier.itinerary.map(day => `<li class="day"><span>Day ${day.day}</span><div><h3>${escape(day.location)}</h3><p>${escape(day.plan)}</p><dl><dt>Stay</dt><dd>${escape(day.lodging)}</dd><dt>Transfers</dt><dd>${escape(day.transfer)}</dd><dt>Weather alternative</dt><dd>${escape(day.weatherAlternative)}</dd></dl></div></li>`).join('');
  const content = `${styles}<main><section class="intro"><div class="wrap"><p class="eyebrow">Destination dossier</p><h1>${escape(entry.destination.name)}</h1><p class="deck">${escape(dossier.thesis)}</p><p>Research snapshot: ${escape(dossier.researchDate)}. ${escape(dossier.reviewStatus)}</p></div></section><div class="wrap book"><aside class="contents"><strong>In This Dossier</strong><nav><a href="#options">Options And Value</a><a href="#itinerary">Itinerary</a><a href="#flags">Open Flags</a><a href="#actions">Your Action Plan</a><a href="../index.html">All destinations</a></nav></aside><article><p class="notice">For your decision, not permission to book. Estimates, unverified eligibility and unresolved conditions remain visible. Ratings are researcher-prepared labels with a stated basis, not independent reviewer approvals. Trip-purpose wording is removed from this public view.</p><section class="chapter" id="options"><h2>Options And Value</h2><p>Planning confidence: provisional; route timing, closures and reservations need confirmation. Booking readiness: not verified. Ratings are qualitative labels with a stated basis, not numerical scores.</p>${options}</section>${chapters}<section class="chapter" id="itinerary"><h2>Provisional Itinerary</h2><ol class="itinerary">${itinerary}</ol></section><section class="chapter" id="flags"><h2>Open Flags</h2>${list([...new Set(dossier.flags)])}</section><section class="chapter" id="actions"><h2>Your Action Plan</h2><p>Resolve high-priority checks before nonrefundable commitments. Verified routing, inclusive prices and eligibility can change the value assessment; changed hours or weather can change the itinerary.</p><ol>${dossier.actions.map(action => `<li><strong>${escape(action.priority)} priority:</strong> ${escape(action.text)}</li>`).join('')}</ol></section><section class="chapter"><h2>Limitations And Freshness</h2><p>Research expires after 30 days; price snapshots become historical after 24 hours. Always recheck current availability. Failed or incomplete checks are not confirmed facts.</p>${list(dossier.limitations)}</section></article></div></main>`;
  return pageShell(entry.destination.name, content, { home: '../index.html' }).replace('Private research &middot;', 'Published research &middot;');
}
