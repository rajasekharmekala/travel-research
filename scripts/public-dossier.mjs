import fs from 'node:fs';
import path from 'node:path';
import { readArtifact, runFile } from './research-artifacts.mjs';
import { applyReviewPolicy } from './review-policy.mjs';
import { pageShell } from './portal-view.mjs';
import { loadPresentation } from './presentation.mjs';
import { renderMarkdown, splitMemoTitle } from './memo.mjs';

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

const searchParameters = new Set(['ctyhocn', 'arrivaldate', 'departuredate', 'checkin', 'checkout', 'checkindate', 'checkoutdate', 'departure_date', 'return_date', 'adults', 'children', 'rooms', 'room1numadults', 'group_adults', 'no_rooms', 'currency', 'selected_currency', 'origin', 'destination', 'from', 'to']);

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
    const query = new URLSearchParams();
    for (const [key, parameter] of url.searchParams) {
      if (searchParameters.has(key.toLowerCase()) && /^[A-Za-z0-9_.-]{1,40}$/.test(parameter)) query.append(key, parameter);
    }
    return `${url.origin}${url.pathname}${query.size ? `?${query}` : ''}`;
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
  const links = values => [...new Set((values ?? []).map(publicSource).filter(Boolean))];
  const references = evidence => links([
    ...(report.dossier.sections ?? []).filter(section => section.evidence?.some(file => evidence?.includes(file))).flatMap(section => section.sources ?? []),
    ...report.candidates.flatMap(candidate => (candidate.pricingEffort?.attempts ?? []).filter(attempt => evidence?.includes(attempt.evidence)).map(attempt => attempt.source))
  ]);
  const sections = report.dossier.sections.map(section => {
    const image = presentation?.images?.[section.key] ?? null;
    const sources = links(section.sources);
    return {
      key: section.key,
      title: sectionTitle(section.key),
      text: clean(section.text),
      observedAt: section.observedAt ?? null,
      paragraphs: (section.paragraphs ?? []).map(paragraph => ({ text: clean(paragraph.text), sources: links(paragraph.sources) })),
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
    const attempts = candidate.pricingEffort?.attempts ?? [];
    const nativeRatings = candidate.ratings;
    const ratings = nativeRatings ?? rated?.ratings ?? null;
    return {
      label: `Option ${index + 1}: ${candidate.destination}`,
      priceType: candidate.priceType,
      travelers: candidate.travelers ?? null,
      ratings: ratings ? Object.fromEntries(Object.entries(ratings).map(([key, rating]) => [key, {
        label: clean(rating.label), rationale: clean(rating.rationale),
        comparison: clean(rating.comparison ?? ''), changeCondition: clean(rating.changeCondition ?? '')
      }])) : null,
      legacyVerdict: report.dossier.verdict,
      reason: clean(candidate.reason),
      tradeoffs: clean(candidate.compromises),
      flights: clean(candidate.flightDetails),
      lodging: clean(candidate.hotelDetails),
      observedAt: candidate.observedAt ?? null,
      depart: candidate.depart ?? null,
      return: candidate.return ?? null,
      totalUsd: total,
      sources: links(candidate.sources),
      attempts: attempts.map(attempt => ({
        kind: clean(attempt.kind), channel: clean(attempt.channel), source: publicSource(attempt.source),
        observedAt: attempt.observedAt, searchContext: clean(attempt.searchContext), result: clean(attempt.result)
      })),
      costs: Object.entries(candidate.costs ?? {}).map(([key, amount]) => {
        const recorded = candidate.costBasis?.[key] ?? rated?.costBasis?.[key];
        const derivation = candidate.pricingEffort?.basis?.[key];
        return {
          label: costLabels[key] ?? sectionTitle(key),
          amount,
          basis: recorded?.basis ?? (derivation ? 'derived; not an all-in verified offer' : 'not classified'),
          note: clean(recorded?.calculation ?? recorded?.note ?? derivation?.calculation ?? 'No calculation recorded; this allocation is not a verified market cost.'),
          assumptions: clean(recorded?.assumptions ?? derivation?.assumptions ?? ''),
          range: recorded?.rangeUsd ?? null,
          sensitivity: clean(recorded?.sensitivity ?? ''),
          sources: links([...(recorded?.sources ?? []), ...attempts.filter(attempt => derivation?.evidence?.includes(attempt.evidence)).map(attempt => attempt.source)])
        };
      })
    };
  });
  return {
    thesis: clean(report.dossier.thesis),
    memo: report.dossier.memo ? { headline: clean(report.dossier.memo.headline), markdown: clean(report.dossier.memo.markdown) } : null,
    entry: report.dossier.entry ? Object.fromEntries(Object.entries(report.dossier.entry).map(([key, value]) => [key, typeof value === 'string' ? clean(value) : Array.isArray(value) ? value.map(clean) : value])) : null,
    lodging: (report.dossier.lodging ?? []).map(item => ({ ...item, name: clean(item.name), area: clean(item.area), whyHere: clean(item.whyHere), chaseNote: clean(item.chaseNote), priceBasis: clean(item.priceBasis), sources: links(item.sources) })),
    travelerVoices: (report.dossier.travelerVoices ?? []).map(voice => ({ author: clean(voice.author), context: clean(voice.context), takeaway: clean(voice.takeaway), quote: voice.quote ? clean(voice.quote) : null, url: links([voice.url])[0] ?? null })),
    verdict: report.dossier.verdict,
    researchDate: String(report.candidates[0]?.observedAt ?? '').slice(0, 10),
    reviewStatus,
    sections,
    options,
    itinerary: report.dossier.itinerary.map((day, index) => ({
      day: index + 1,
      date: day.date,
      location: clean(day.location),
      plan: clean(day.plan),
      lodging: clean(day.lodging),
      transfer: clean(day.transfer),
      weatherAlternative: clean(day.weatherAlternative),
      travelDayReason: clean(day.travelDayReason ?? ''),
      sources: links([...(day.sources ?? []), ...references(day.evidence)]),
      visits: (day.visits ?? []).map(visit => ({
        name: clean(visit.name), significance: clean(visit.significance), whyVisit: clean(visit.whyVisit),
        duration: clean(visit.duration), logistics: clean(visit.logistics), cost: clean(visit.cost),
        sources: links(visit.sources)
      }))
    })),
    flags: [...report.dossier.unresolved.map(clean), ...findings.map(clean)],
    actions: report.dossier.actions?.length
      ? report.dossier.actions.map(action => ({ priority: action.priority, text: clean(action.check), why: clean(action.why), how: clean(action.how), decisionImpact: clean(action.decisionImpact) }))
      : report.dossier.nextChecks.map((item, index) => ({ priority: index < 4 ? 'High' : 'Medium', text: clean(item) })),
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
  let artifact;
  try {
    artifact = readArtifact(local, filename, config, trip, { historicalPrices: true });
  } catch (error) {
    // Research drafted for an earlier trip window is superseded, not publishable; the destination shows as pending until re-run.
    if (/configured windows|fingerprint is stale/.test(error.message)) return null;
    throw error;
  }
  if (report.job !== 'destination' || report.destinationId !== id || artifact.draftSha256 !== reference.draftSha256 || artifact.evidenceSha256 !== reference.evidenceSha256) {
    throw new Error('Public dossier requires a matching validated checkpoint');
  }
  let reviewApproved = false;
  let reviewStatus = 'Provisional: independent review is incomplete or did not approve this draft.';
  try {
    readArtifact(local, filename, config, trip, { reviewed: true, historicalPrices: true });
    reviewApproved = true;
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
  return { ...projectPublicDossier(report, trip, reviewStatus, findings, presentation), reviewApproved };
}

const figure = image => image ? `<figure class="section-image"><img src="${escape(image.src)}" alt="${escape(image.alt)}" loading="lazy"><figcaption>Image: ${escape(image.artist)}, ${escape(image.license)}, <a href="${escape(image.sourceUrl)}" rel="noreferrer">${escape(image.title)} on Wikimedia Commons</a></figcaption></figure>` : '';

const ratingBlock = option => option.ratings
  ? `<div class="ratings"><p><strong>Value rating: ${escape(option.ratings.value.label)}</strong></p><p>${escape(option.ratings.value.rationale)}</p>${option.ratings.value.comparison ? `<p><strong>Compared with:</strong> ${escape(option.ratings.value.comparison)}</p>` : ''}${option.ratings.value.changeCondition ? `<p><strong>What changes this rating:</strong> ${escape(option.ratings.value.changeCondition)}</p>` : ''}<p><strong>Price confidence: ${escape(option.ratings.priceConfidence.label)}</strong></p><p>${escape(option.ratings.priceConfidence.rationale)}</p></div>`
  : `<div class="ratings"><p><strong>Destination verdict: ${escape(String(option.legacyVerdict ?? 'unverified').replaceAll('_', ' '))}</strong></p><p>Option-level value evidence is incomplete. The destination verdict is not a comparative price-value rating.</p><p><strong>Price confidence: ${option.priceType === 'estimate' ? 'Estimate only' : 'Recorded snapshot; inclusions require verification'}</strong></p></div>`;

const inlineSources = sources => (sources ?? []).map(source => `<a href="${escape(source)}" rel="noreferrer">${escape(source)}</a>`).join(' · ');

const costTable = option => `<div class="table-scroll"><table class="cost-table"><thead><tr><th>Party cost line</th><th>USD</th><th>Basis</th><th>Calculation, assumptions and sources</th></tr></thead><tbody>${option.costs.map(line => `<tr><td>${escape(line.label)}</td><td>${escape(money(line.amount))}</td><td>${escape(line.basis)}</td><td>${escape(line.note)}${line.assumptions ? `<p><strong>Assumptions:</strong> ${escape(line.assumptions)}</p>` : ''}${line.range ? `<p><strong>Planning range:</strong> USD ${escape(money(line.range.low))} to ${escape(money(line.range.high))}. ${escape(line.sensitivity)}</p>` : ''}<div class="references">${inlineSources(line.sources)}</div></td></tr>`).join('')}</tbody></table></div>`;

const effortTable = option => option.attempts?.length ? `<h4>Search Evidence And Rejected Leads</h4><p>These are recorded attempts, not promises of current availability. Failed searches are not quotes.</p><div class="table-scroll"><table class="cost-table"><thead><tr><th>Provider / channel</th><th>Exact search context</th><th>Observed result or blocker</th></tr></thead><tbody>${option.attempts.map(attempt => `<tr><td>${escape(attempt.kind)} / ${escape(attempt.channel)}<div class="references">${inlineSources(attempt.source ? [attempt.source] : [])}</div><p>${escape(attempt.observedAt)}</p></td><td>${escape(attempt.searchContext)}</td><td>${escape(attempt.result)}</td></tr>`).join('')}</tbody></table></div>` : '<p>Provider-attempt evidence is absent in this legacy dossier; its numeric allocations cannot be treated as verified offers.</p>';

const sourceLinks = section => section.sources.map((source, index) => `<a href="${escape(source)}" rel="noreferrer">${escape(section.sourceLabels[index])}</a>`).join('');

const styles = '<style>.section-image{margin:1.25rem 0}.section-image img{display:block;width:100%;max-height:380px;object-fit:cover;border-radius:8px}.section-image figcaption{font-size:.85rem;color:#666;margin-top:.4rem}.ratings p{margin:.3rem 0}.table-scroll{max-width:100%;overflow-x:auto}.cost-table{width:100%;min-width:720px;table-layout:fixed;border-collapse:collapse;margin:.75rem 0;font-size:.92rem}.cost-table th,.cost-table td{border-bottom:1px solid #ddd;padding:.55rem;text-align:left;vertical-align:top}.cost-table th:first-child{width:15%}.cost-table th:nth-child(2){width:12%}.cost-table th:nth-child(3){width:20%}.cost-table th:nth-child(2),.cost-table td:nth-child(2){white-space:nowrap}.cost-table th:last-child{width:auto}.cost-table:has(th:last-child:nth-child(3)) th:first-child{width:30%}.cost-table:has(th:last-child:nth-child(3)) th:nth-child(2){width:30%;white-space:normal}.cost-table:has(th:last-child:nth-child(3)) td:nth-child(2){white-space:normal}.references a{overflow-wrap:anywhere}.prose{white-space:pre-line}.book article{min-width:0}.book article p,.itinerary li{overflow-wrap:anywhere}</style>';

const memoStyle = '<style>.memo{border-left:4px solid var(--link,#2a6f97);padding:.25rem 0 .25rem 1.25rem;margin:1.5rem 0 2.5rem}.memo p{font-size:1.05rem;line-height:1.75}.memo h2{margin-top:2rem}.memo blockquote{margin:1rem 0;padding-left:1rem;border-left:3px solid #ccc;color:#444}.table-scroll{max-width:100%;overflow-x:auto}.cost-table{width:100%;border-collapse:collapse;margin:.75rem 0;font-size:.95rem}.cost-table th,.cost-table td{border-bottom:1px solid #ddd;padding:.4rem .5rem;text-align:left;vertical-align:top}</style>';

// Renders the head-to-head decision memo (markdown, first line "# Title") as a public page.
export function renderDecisionMemo(markdown) {
  const { title, body } = splitMemoTitle(publicText(markdown));
  const content = `${memoStyle}<main><section class="intro"><div class="wrap"><p class="eyebrow">Decision memo</p><h1>${escape(title)}</h1><p class="notice">Researcher-prepared, not independently reviewed. Observed prices are not purchase availability and nothing here authorizes a purchase.</p></div></section><div class="wrap"><article class="memo">${renderMarkdown(body)}</article></div></main>`;
  return pageShell(title, content).replace('Private research &middot;', 'Published research &middot;');
}

export function renderPublicDossier(entry) {
  const dossier = entry.publicDossier;
  const list = items => `<ul>${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`;
  const chapters = dossier.sections.map(section => `<section class="chapter" id="${escape(section.key.replace(/_/g, '-'))}"><h2>${escape(section.title)}</h2>${figure(section.image)}<div class="prose">${escape(section.text)}</div>${(section.paragraphs ?? []).map(paragraph => `<p>${escape(paragraph.text)} <span class="references">${inlineSources(paragraph.sources)}</span></p>`).join('')}<div class="references">${sourceLinks(section)}</div>${section.observedAt ? `<p>Evidence observed: ${escape(section.observedAt)}</p>` : ''}</section>`).join('');
  const options = dossier.options.map(option => `<section><h3>${escape(option.label)}</h3>${ratingBlock(option)}<p>${escape(option.reason)}</p><p>${escape(option.tradeoffs)}</p><p><strong>Party cost: ${option.totalUsd === null ? 'not recorded' : `USD ${escape(money(option.totalUsd))}`}</strong>. Travelers: ${escape(option.travelers ?? 'not recorded')}. ${escape(option.priceType)}; observed ${escape(option.observedAt)}.</p><p>${escape(option.depart ?? '')} to ${escape(option.return ?? '')}</p>${costTable(option)}<h4>Flight Choice</h4><p>${escape(option.flights)}</p><h4>Lodging Choice</h4><p>${escape(option.lodging)}</p><div class="references">${inlineSources(option.sources)}</div>${effortTable(option)}</section>`).join('');
  const itinerary = dossier.itinerary.map(day => `<li><h3>Day ${day.day} · ${escape(day.date)} · ${escape(day.location)}</h3><p>${escape(day.plan)}</p>${day.travelDayReason ? `<p>${escape(day.travelDayReason)}</p>` : ''}${(day.visits ?? []).map(visit => `<section><h4>${escape(visit.name)}</h4><p><strong>Why it matters:</strong> ${escape(visit.significance)}</p><p><strong>Why this visit:</strong> ${escape(visit.whyVisit)}</p><p><strong>Time:</strong> ${escape(visit.duration)}. ${escape(visit.logistics)}</p><p><strong>Cost basis:</strong> ${escape(visit.cost)}</p><div class="references">${inlineSources(visit.sources)}</div></section>`).join('')}<p>Lodging: ${escape(day.lodging)}</p><p>Transfer: ${escape(day.transfer)}</p><p>Weather alternative: ${escape(day.weatherAlternative)}</p><div class="references">${inlineSources(day.sources)}</div></li>`).join('');
  const memoSection = dossier.memo ? `${memoStyle}<section class="chapter memo" id="memo"><p class="eyebrow">Advisor memo</p><h2>${escape(dossier.memo.headline)}</h2>${renderMarkdown(dossier.memo.markdown)}</section><h2 id="workings">The workings behind the memo</h2>` : '';
  const chaseLabels = { 'the-edit': 'In The Edit by Chase Travel', 'chase-travel-portal': 'On Chase Travel portal', 'not-listed': 'Not listed on Chase Travel', unverified: 'Chase Travel status unverified' };
  const entryRows = dossier.entry ? [['Entry route', `${dossier.entry.mechanism}: ${dossier.entry.requirement}`], ['Lead time', dossier.entry.leadTimeDays === null ? 'Unknown' : `${dossier.entry.leadTimeDays} days`], ['Last safe application date', dossier.entry.lastSafeApplyDate ?? 'Not applicable or unknown'], ['Feasible before departure', dossier.entry.feasibleByDepart === null ? 'Unknown' : (dossier.entry.feasibleByDepart ? 'Yes' : 'No')], ['US visa dependency', dossier.entry.usVisaDependency], ['Transit', dossier.entry.transit], ['Fees', dossier.entry.fees], ['Application steps', `<ol>${dossier.entry.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol>`], ['Documents to prepare', `<ul>${(dossier.entry.documents ?? []).map(item => `<li>${escape(item)}</li>`).join('')}</ul>`], ...(dossier.entry.nextAction ? [['Next action', dossier.entry.nextAction]] : [])] : [];
  const entrySection = dossier.entry ? `<section class="chapter" id="entry"><h2>Entry And Visa Lead Time</h2><p>For an Indian passport holder. US re-entry is user-attested, not verified.</p><div class="table-scroll"><table class="cost-table"><tbody>${entryRows.map(([label, value]) => `<tr><th>${escape(label)}</th><td>${value.startsWith('<') ? value : escape(value)}</td></tr>`).join('')}</tbody></table></div><div class="references">${inlineSources([dossier.entry.source])}</div></section>` : '';
  const lodgingSection = dossier.lodging?.length ? `<section class="chapter" id="lodging"><h2>Where To Stay</h2><p>Mid-range and well-reviewed local picks. Card-benefit status is a lead to check on the Chase Travel portal, which needs your own login; nightly prices here come from public pages and may differ there. Card benefits are upside, never subtracted from cost.</p>${dossier.lodging.map(item => `<section><h3>${escape(item.name)} <small>${escape(item.area)}</small></h3><p><strong>${escape(item.tier.replace('-', ' '))}</strong> &middot; guest rating ${escape(item.guestRating.score)} / ${escape(item.guestRating.scale)} (${escape(item.guestRating.source)}) &middot; about USD ${escape(money(item.nightlyUsd))} a night (${escape(item.priceBasis)})</p><p>${escape(item.whyHere)}</p><p><strong>${escape(chaseLabels[item.chaseTravel])}.</strong> ${escape(item.chaseNote)}</p><div class="references">${inlineSources(item.sources)}</div></section>`).join('')}</section>` : '';
  const voicesSection = dossier.travelerVoices?.length ? `<section class="chapter" id="voices"><h2>What Travelers Say</h2>${dossier.travelerVoices.map(voice => `<blockquote><p>${voice.quote ? `&ldquo;${escape(voice.quote)}&rdquo; ` : ''}${escape(voice.takeaway)}</p><footer>${escape(voice.author)}, ${escape(voice.context)}${voice.url ? ` &middot; <a href="${escape(voice.url)}" rel="noreferrer">source</a>` : ''}</footer></blockquote>`).join('')}</section>` : '';
  const decisionNav = `${dossier.entry ? '<a href="#entry">Entry And Visa</a>' : ''}${dossier.lodging?.length ? '<a href="#lodging">Where To Stay</a>' : ''}${dossier.travelerVoices?.length ? '<a href="#voices">What Travelers Say</a>' : ''}`;
  const memoNav = dossier.memo ? '<a href="#memo">Advisor memo</a><a href="#workings">The workings</a>' : '';
  const content = `${styles}<main><section class="intro"><div class="wrap"><p class="eyebrow">Destination dossier</p><h1>${escape(entry.destination.name)}</h1><p class="deck">${escape(dossier.thesis)}</p><p>Research snapshot: ${escape(dossier.researchDate)}. ${escape(dossier.reviewStatus)}</p></div></section><div class="wrap book"><aside class="contents"><strong>In This Dossier</strong><nav>${memoNav}${decisionNav}<a href="#options">Options And Value</a><a href="#itinerary">Itinerary</a><a href="#flags">Open Flags</a><a href="#actions">Your Action Plan</a><a href="../index.html">All destinations</a></nav></aside><article><p class="notice">For your decision, not permission to book. Estimates, unverified eligibility and unresolved conditions remain visible. Ratings are researcher-prepared labels with a stated basis, not independent reviewer approvals. Trip-purpose wording is removed from this public view.</p>${memoSection}${entrySection}<section class="chapter" id="options"><h2>Options And Value</h2><p>Planning confidence: provisional; route timing, closures and reservations need confirmation. Booking readiness: not verified. Ratings are qualitative labels with a stated basis, not numerical scores.</p>${options}</section>${chapters}<section class="chapter" id="itinerary"><h2>Provisional Itinerary</h2><p>Itinerary follows ${escape(dossier.options[dossier.itineraryCandidateIndex ?? 0]?.label ?? 'the recorded candidate')}.</p><ol class="itinerary">${itinerary}</ol></section>${lodgingSection}${voicesSection}<section class="chapter" id="flags"><h2>Open Flags</h2>${list([...new Set(dossier.flags)])}</section><section class="chapter" id="actions"><h2>Your Action Plan</h2><p>Resolve high-priority checks before nonrefundable commitments. Verified routing, inclusive prices and eligibility can change the value assessment; changed hours or weather can change the itinerary.</p><ol>${dossier.actions.map(action => `<li><strong>${escape(action.priority)} priority:</strong> ${escape(action.text)}${action.why ? `<p><strong>Why:</strong> ${escape(action.why)}</p><p><strong>How to check:</strong> ${escape(action.how)}</p><p><strong>Decision impact:</strong> ${escape(action.decisionImpact)}</p>` : ''}</li>`).join('')}</ol></section><section class="chapter"><h2>Limitations And Freshness</h2><p>Research expires after 30 days; price snapshots become historical after 24 hours. Always recheck current availability. Failed or incomplete checks are not confirmed facts.</p>${list(dossier.limitations)}</section></article></div></main>`;
  return pageShell(entry.destination.name, content, { home: '../index.html' }).replace('Private research &middot;', 'Published research &middot;');
}
