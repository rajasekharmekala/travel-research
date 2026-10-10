import fs from 'node:fs';
import path from 'node:path';

const explicit = value => typeof value === 'string' && value.trim() && value.toLowerCase() !== 'auto';

export function loadAutomationConfig(local, report = null) {
  const filename = path.join(local, 'automation.json');
  let config = {};
  try { config = JSON.parse(fs.readFileSync(filename, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const configuredModel = process.env.TRAVEL_RESEARCHER_MODEL ?? report?.configuredModel ?? report?.model ?? null;
  const jobs = { discovery: {}, comparison: {}, ...(config.jobs ?? {}) };
  if (explicit(configuredModel)) {
    if (!explicit(jobs.discovery.researcherModel)) jobs.discovery.researcherModel = configuredModel;
    if (!explicit(jobs.comparison.researcherModel)) jobs.comparison.researcherModel = configuredModel;
  }
  return {
    researchPolicy: { allowRegularBrowser: true, ...(config.researchPolicy ?? {}) },
    privateBrowserRequired: config.privateBrowserRequired === true,
    pipeline: config.pipeline ?? { requireReviewedDossiers: true },
    ...config,
    jobs
  };
}

export function configForReport(config, report) {
  const model = report?.configuredModel ?? report?.model ?? null;
  if (!explicit(model)) return config;
  return {
    ...config,
    jobs: {
      ...config.jobs,
      discovery: { ...config.jobs.discovery, researcherModel: config.jobs.discovery?.researcherModel ?? model },
      comparison: { ...config.jobs.comparison, researcherModel: config.jobs.comparison?.researcherModel ?? model }
    }
  };
}
