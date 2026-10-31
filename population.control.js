'use strict';

const getPopulationLimit = (workerLimit, brigadePlan,
  brigadeAllowed = true) => workerLimit +
  (brigadeAllowed && brigadePlan && Array.isArray(brigadePlan.segments)
    ? brigadePlan.segments.length : 0);

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

module.exports = { getPopulationLimit, selectRetirementCandidates };
