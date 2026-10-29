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

  return { needsMaintenance, isRepairTarget, selectRepairTarget };
};

module.exports = { createOutpostMaintenance };
