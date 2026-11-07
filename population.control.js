'use strict';

// Existing auxiliary bodies remain outside the core-worker budget while they
// age out. Permission controls replacement target, not whether living relays
// suddenly consume the core cap and deadlock recovery.
const getPopulationLimit = (workerLimit, brigadePlan,
  brigadeAllowed = true, activeBrigadeCount = 0,
  transitionAllowance = 0) => workerLimit + Math.max(
  Math.max(0, activeBrigadeCount || 0),
  brigadeAllowed && brigadePlan && Array.isArray(brigadePlan.segments)
    ? brigadePlan.segments.length : 0) +
  Math.max(0, transitionAllowance || 0);

// Headcount is not capability. When the room is full of bodies that do not
// cover required slots, permit a small overlap while the correct replacements
// spawn and the surplus is reassigned or retired.
const getCapabilityTransitionAllowance = (jobs, required = {},
  maximum = 4) => {
  const gap = Object.entries(jobs || {}).reduce((total, [key, job]) => {
    const target = Math.max(0, required[key] == null
      ? job.min || 0 : required[key]);
    const coverage = required[key] == null
      ? job.coverageCount || 0 : job.count || 0;
    return total + Math.max(0, target - coverage);
  }, 0);
  return Math.min(Math.max(0, maximum), gap);
};

// A capability gap must remain spawnable even when the current roster already
// exceeds its correctly-sized steady-state budget. Existing wrong-role bodies
// are retained for handoff; they do not consume the temporary slots reserved
// for the missing capability.
const getRequiredPopulationTransitionAllowance = (workerLimit,
  currentCorePopulation, capabilityAllowance, retainedAllowance = 0) =>
  Math.max(0, currentCorePopulation - workerLimit, retainedAllowance) +
    Math.max(0, capabilityAllowance);

const selectRetirementCandidates = ({
  population, populationLimit, retiringCount, candidates, score,
  maxConcurrent = 4
}) => {
  const slots = Math.max(0, maxConcurrent - retiringCount);
  const needed = Math.max(0,
    population - populationLimit - retiringCount);
  return candidates.slice().sort((a, b) =>
    score(a) - score(b) || a.name.localeCompare(b.name))
    .slice(0, Math.min(slots, needed));
};

module.exports = { getPopulationLimit, getCapabilityTransitionAllowance,
  getRequiredPopulationTransitionAllowance, selectRetirementCandidates };
