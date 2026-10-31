'use strict';

const createConstructionPriority = ({
  STRUCTURE_CONTAINER, STRUCTURE_LINK, STRUCTURE_EXTENSION, STRUCTURE_ROAD
}) => {
  const isDeferred = (site, linksPending) => Boolean(site && linksPending &&
    site.structureType === STRUCTURE_EXTENSION);
  const priority = site => site.structureType === STRUCTURE_CONTAINER
    ? 0 : site.structureType === STRUCTURE_LINK ? 1
      : site.structureType === STRUCTURE_EXTENSION ? 2
        : site.structureType === STRUCTURE_ROAD ? 4 : 3;
  const crewLimit = site => site.structureType === STRUCTURE_LINK
    ? 6 : site.structureType === STRUCTURE_EXTENSION ? 3
      : site.structureType === STRUCTURE_CONTAINER ? 4 : 1;
  const desiredCrew = site => {
    if (!site || !Number.isFinite(site.progressTotal)) return 0;
    const remaining = Math.max(0, site.progressTotal - (site.progress || 0));
    return remaining > 0
      ? Math.min(crewLimit(site), Math.max(1, Math.ceil(remaining / 1000)))
      : 0;
  };
  const desiredCrewTotal = (sites, linksPending) => sites
    .filter(site => !isDeferred(site, linksPending))
    .reduce((total, site) => total + desiredCrew(site), 0);
  return { isDeferred, priority, crewLimit, desiredCrew, desiredCrewTotal };
};

module.exports = { createConstructionPriority };
