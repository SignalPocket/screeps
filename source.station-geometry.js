'use strict';

const rangeTo = (position, x, y) => Math.max(
  Math.abs(position.x - x), Math.abs(position.y - y));

const isSourceStationAvailable = ({ room, source, x, y, container = null,
  reserved = null, ignoreCreep = null, allowWalkableRamparts = false,
  blockConstructionSites = false, avoidCreeps = false, terrain = null,
  LOOK_STRUCTURES, LOOK_CONSTRUCTION_SITES, LOOK_CREEPS,
  OBSTACLE_OBJECT_TYPES, STRUCTURE_ROAD, STRUCTURE_RAMPART,
  TERRAIN_MASK_WALL }) => {
  if (!room || !source || x < 0 || x > 49 || y < 0 || y > 49 ||
      rangeTo(source.pos, x, y) > 1 ||
      x === source.pos.x && y === source.pos.y ||
      container && rangeTo(container.pos, x, y) > 1) return false;
  const key = `${x}:${y}`;
  if (reserved && (reserved instanceof Set
    ? reserved.has(key) : reserved[key])) return false;
  const tileStructures = room.lookForAt(LOOK_STRUCTURES, x, y);
  const completedRoad = tileStructures.some(structure =>
    structure.structureType === STRUCTURE_ROAD);
  const roomTerrain = terrain || room.getTerrain();
  if (roomTerrain.get(x, y) === TERRAIN_MASK_WALL && !completedRoad) {
    return false;
  }
  const blocked = tileStructures.some(structure =>
    OBSTACLE_OBJECT_TYPES.includes(structure.structureType) &&
    !(allowWalkableRamparts &&
      structure.structureType === STRUCTURE_RAMPART &&
      (structure.my || structure.isPublic)));
  if (blocked) return false;
  if (blockConstructionSites &&
      room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)
        .some(site => OBSTACLE_OBJECT_TYPES.includes(site.structureType))) {
    return false;
  }
  return !avoidCreeps || !room.lookForAt(LOOK_CREEPS, x, y)
    .some(creep => creep.name !== ignoreCreep);
};

const getSourceStationCandidates = options => {
  const { source, room } = options;
  if (!source || !room) return [];
  const terrain = options.terrain || room.getTerrain();
  const candidates = [];
  for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
    for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
      if (isSourceStationAvailable({ ...options, terrain, x, y })) {
        candidates.push({ x, y });
      }
    }
  }
  return candidates;
};

module.exports = { isSourceStationAvailable, getSourceStationCandidates };
