'use strict';

const createOutpostStatus = ({
  Game,
  deriveRoomStatus,
  getRoomSources,
  getRoomStructures,
  STRUCTURE_CONTAINER,
  RESOURCE_ENERGY,
  FIND_DROPPED_RESOURCES,
  FIND_MY_CONSTRUCTION_SITES
}) => {
  const updateOutpostStatus = room => {
    const sources = getRoomSources(room);
    if (sources.length === 0) return null;
    const containers = getRoomStructures(room).filter(structure =>
      structure.structureType === STRUCTURE_CONTAINER &&
      sources.some(source => source.pos.getRangeTo(structure) <= 2));
    const storedSourceEnergy = containers.reduce((total, container) =>
      total + (container.store[RESOURCE_ENERGY] || 0), 0);
    const bufferCapacity = containers.reduce((total, container) =>
      total + (container.store.getCapacity(RESOURCE_ENERGY) || 0), 0);
    const sourceEnergy = sources.reduce((total, source) =>
      total + source.energy, 0);
    const sourceCapacity = sources.reduce((total, source) =>
      total + source.energyCapacity, 0);
    const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
      filter: resource => resource.resourceType === RESOURCE_ENERGY
    }).reduce((total, resource) => total + resource.amount, 0);
    const status = deriveRoomStatus({
      hasSpawn: false,
      sourceCount: sources.length,
      storedEnergy: storedSourceEnergy,
      storedSourceEnergy,
      sourceEnergyRatio: sourceCapacity > 0 ? sourceEnergy / sourceCapacity : 0,
      emptySourceCount: sources.filter(source => source.energy === 0).length,
      bufferRatio: bufferCapacity > 0
        ? storedSourceEnergy / bufferCapacity : 0,
      droppedEnergy,
      buildRemaining: room.find(FIND_MY_CONSTRUCTION_SITES)
        .reduce((total, site) => total + site.progressTotal - site.progress, 0)
    });
    room.memory.roomStatus = Object.assign({ updated: Game.time,
      kind: 'outpost' }, status);
    return status;
  };

  return { updateOutpostStatus };
};

module.exports = { createOutpostStatus };
