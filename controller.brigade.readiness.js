'use strict';

const MAX_BUILD_REMAINING = 5000;
const MAX_REPAIR_REMAINING = 10000;
const ESSENTIAL_JOBS = [
  'source', 'refiller', 'hauler', 'rebalancer',
  'builder', 'repairBuilder', 'tunnelBuilder',
  'remoteMiner', 'remoteHauler', 'remoteBuilder'
];

const evaluateControllerBrigadeReadiness = (situation, staffingPlan) => {
  const signals = situation && situation.signals || {};
  const jobs = staffingPlan && staffingPlan.jobs || {};
  const buildRemaining = Math.max(0, signals.buildRemaining || 0);
  const repairRemaining = Math.max(0, signals.repairRemaining || 0);
  const blockers = [];

  if (signals.repairCritical) blockers.push('critical repairs');
  if (buildRemaining > MAX_BUILD_REMAINING) {
    blockers.push(`build backlog ${Math.round(buildRemaining)}`);
  }
  if (repairRemaining > MAX_REPAIR_REMAINING) {
    blockers.push(`repair backlog ${Math.round(repairRemaining)}`);
  }
  for (const key of ESSENTIAL_JOBS) {
    const job = jobs[key];
    if (!job || job.min <= 0) continue;
    if (job.coverageCount < job.min) {
      blockers.push(`${key} staffing ${job.coverageCount}/${job.min}`);
    }
  }

  return {
    version: 1,
    ready: blockers.length === 0,
    buildRemaining,
    repairRemaining,
    repairCritical: Boolean(signals.repairCritical),
    blockers
  };
};

module.exports = {
  MAX_BUILD_REMAINING,
  MAX_REPAIR_REMAINING,
  ESSENTIAL_JOBS,
  evaluateControllerBrigadeReadiness
};
