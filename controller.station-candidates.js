'use strict';

// Buffer-relative geometric candidates. A tile shared by two buffer
// neighborhoods intentionally appears twice: room policy measures potential
// buffer adjacency, while the station allocator separately enforces unique
// occupied coordinates.
const getControllerStationCandidates = ({ room, buffers, excluded = new Set(),
  STRUCTURE_RAMPART, TERRAIN_MASK_WALL, LOOK_STRUCTURES,
  OBSTACLE_OBJECT_TYPES }) => {
  if (!room || !room.controller) return [];
  const terrain = room.getTerrain();
  const candidates = [];
  for (const buffer of buffers || []) {
    for (let x = buffer.pos.x - 1; x <= buffer.pos.x + 1; x++) {
      for (let y = buffer.pos.y - 1; y <= buffer.pos.y + 1; y++) {
        if (x < 1 || x > 48 || y < 1 || y > 48 ||
            x === buffer.pos.x && y === buffer.pos.y ||
            excluded.has(`${x}:${y}`) ||
            terrain.get(x, y) === TERRAIN_MASK_WALL ||
            room.controller.pos.getRangeTo(x, y) > 3) continue;
        const blocked = room.lookForAt(LOOK_STRUCTURES, x, y)
          .some(structure => OBSTACLE_OBJECT_TYPES.includes(
            structure.structureType) &&
            !(structure.structureType === STRUCTURE_RAMPART &&
              (structure.my || structure.isPublic)));
        if (!blocked) candidates.push({
          x, y, roomName: room.name, bufferId: buffer.id, buffer
        });
      }
    }
  }
  return candidates;
};

module.exports = { getControllerStationCandidates };
