import fs from 'node:fs';
import path from 'node:path';

const explicit = value => typeof value === 'string' && value.trim() && value.toLowerCase() !== 'auto';

export function loadAutomationConfig(local, report = null) {
  const filename = path.join(local, 'automation.json');
  let config = {};
  try { config = JSON.parse(fs.readFileSync(filename, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const researcherFilename = path.join(local, '../.agents/config/researcher.json');
  let researcher = null;
  try { researcher = JSON.parse(fs.readFileSync(researcherFilename, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (researcher !== null && !explicit(researcher.model)) throw new Error('Explicit default researcher model required in .agents/config/researcher.json');
  const configuredModel = process.env.TRAVEL_RESEARCHER_MODEL ?? process.env.TRAVEL_MODEL ?? report?.configuredModel ?? report?.model ?? researcher?.model ?? null;
  const jobs = { discovery: {}, comparison: {}, ...(config.jobs ?? {}) };
  const researcherDefaultJobs = [];
  if (explicit(configuredModel)) {
    for (const job of ['discovery', 'comparison']) {
      if (!explicit(jobs[job].researcherModel)) {
        jobs[job].researcherModel = configuredModel;
        if (process.env.TRAVEL_RESEARCHER_MODEL == null && report?.configuredModel == null && report?.model == null && researcher !== null) researcherDefaultJobs.push(job);
      }
    }
  }
  return {
    researchPolicy: { allowRegularBrowser: true, ...(config.researchPolicy ?? {}) },
    privateBrowserRequired: config.privateBrowserRequired === true,
    pipeline: config.pipeline ?? { requireReviewedDossiers: true },
    ...config,
    researcherDefault: researcher?.model ?? null,
    researcherDefaultJobs,
    jobs
  };
}

export function configForReport(config, report) {
  const model = report?.configuredModel ?? report?.model ?? null;
  if (!explicit(model)) return config;
  const explicitOverride = process.env.TRAVEL_RESEARCHER_MODEL != null;
  const reportModel = job => !explicitOverride && config.researcherDefaultJobs?.includes(job) ? model : config.jobs[job]?.researcherModel ?? model;
  return {
    ...config,
    jobs: {
      ...config.jobs,
      discovery: { ...config.jobs.discovery, researcherModel: reportModel('discovery') },
      comparison: { ...config.jobs.comparison, researcherModel: reportModel('comparison') }
    }
  };
}
