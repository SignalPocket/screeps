'use strict';

const createOutpostMaintenance = ({ STRUCTURE_CONTAINER, STRUCTURE_ROAD }) => {
  const startRatio = structure => structure.structureType === STRUCTURE_CONTAINER
    ? 0.75 : structure.structureType === STRUCTURE_ROAD ? 0.4 : 0;
  const finishRatio = structure => structure.structureType === STRUCTURE_CONTAINER
    ? 0.9 : structure.structureType === STRUCTURE_ROAD ? 0.8 : 0;
  const healthRatio = structure => structure.hitsMax > 0
    ? structure.hits / structure.hitsMax : 1;
  const needsMaintenance = structures => structures.some(structure =>
    startRatio(structure) > 0 && healthRatio(structure) < startRatio(structure));
  const isRepairTarget = structure => Boolean(structure) &&
    finishRatio(structure) > 0 &&
    healthRatio(structure) < finishRatio(structure);
  const selectRepairTarget = (structures, position) => structures
    .filter(isRepairTarget)
    .sort((a, b) =>
      Number(b.structureType === STRUCTURE_CONTAINER) -
        Number(a.structureType === STRUCTURE_CONTAINER) ||
      healthRatio(a) - healthRatio(b) ||
      position.getRangeTo(a) - position.getRangeTo(b) ||
      a.id.localeCompare(b.id))[0];
  const getBuilderTarget = (structures, constructionSiteCount = 0) => {
    const repairTargets = structures.filter(isRepairTarget).length;
    if (constructionSiteCount === 0 && !needsMaintenance(structures)) return 0;
    // Remote roads decay continuously and one traveller cannot keep a dense
    // route network healthy while also building.
    return Math.min(4, Math.max(1,
      Math.ceil(constructionSiteCount / 4), Math.ceil(repairTargets / 25)));
  };

  return { needsMaintenance, isRepairTarget, selectRepairTarget,
    getBuilderTarget };
};

module.exports = { createOutpostMaintenance };
