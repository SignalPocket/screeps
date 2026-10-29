'use strict';

const createSourcePositions = ({
  getRoomSources,
  getRoomSites,
  LOOK_STRUCTURES,
  LOOK_CREEPS,
  OBSTACLE_OBJECT_TYPES,
  STRUCTURE_ROAD,
  STRUCTURE_RAMPART,
  TERRAIN_MASK_WALL
}) => {
  const findMinerStation = (room, source, container, reserved, ignoreCreep,
    preferred) => {
    // Use one walkable tile within range one of both source and container.
    const terrain = room.getTerrain();
    const isAvailable = (x, y) => {
      if (x < 0 || x > 49 || y < 0 || y > 49 ||
          source.pos.getRangeTo(x, y) > 1 ||
          container.pos.getRangeTo(x, y) > 1 ||
          (x === source.pos.x && y === source.pos.y)) return false;
      const key = `${x}:${y}`;
      if (reserved[key]) return false;
      const tileStructures = room.lookForAt(LOOK_STRUCTURES, x, y);
      const completedRoad = tileStructures.some(structure =>
        structure.structureType === STRUCTURE_ROAD);
      if (terrain.get(x, y) === TERRAIN_MASK_WALL && !completedRoad) {
        return false;
      }
      const blocked = tileStructures.some(structure =>
        OBSTACLE_OBJECT_TYPES.includes(structure.structureType) &&
        !(structure.structureType === STRUCTURE_RAMPART &&
          (structure.my || structure.isPublic)));
      if (blocked) return false;
      return !room.lookForAt(LOOK_CREEPS, x, y)
        .some(creep => creep.name !== ignoreCreep);
    };

    if (preferred && Number.isInteger(preferred.x) &&
        Number.isInteger(preferred.y) &&
        isAvailable(preferred.x, preferred.y)) return preferred;
    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
      for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
        if (x === source.pos.x && y === source.pos.y) continue;
        if (isAvailable(x, y)) return { x, y };
      }
    }
    return null;
  };

  const getSource2TunnelSite = room => {
    const source = getRoomSources(room)[1];
    if (!source) return null;
    return getRoomSites(room).filter(site =>
      site.structureType === STRUCTURE_ROAD &&
        site.progressTotal > 300 && source.pos.getRangeTo(site) <= 2
    ).sort((a, b) => source.pos.getRangeTo(a) -
      source.pos.getRangeTo(b))[0] || null;
  };

  return { findMinerStation, getSource2TunnelSite };
};

module.exports = { createSourcePositions };
