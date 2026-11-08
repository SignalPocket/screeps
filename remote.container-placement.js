'use strict';

const placeRemoteContainerSite = ({ room, source, creep,
  TERRAIN_MASK_WALL, LOOK_STRUCTURES, LOOK_CONSTRUCTION_SITES,
  STRUCTURE_ROAD, STRUCTURE_CONTAINER, OK = 0 }) => {
  const terrain = room.getTerrain();
  const candidates = [];
  for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
    for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
      if (x === source.pos.x && y === source.pos.y || x <= 0 || x >= 49 ||
          y <= 0 || y >= 49 || terrain.get(x, y) === TERRAIN_MASK_WALL) {
        continue;
      }
      const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
      if (structures.some(structure =>
        structure.structureType !== STRUCTURE_ROAD)) continue;
      if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
      candidates.push({ x, y, range: creep.pos.getRangeTo(x, y),
        road: structures.some(structure =>
          structure.structureType === STRUCTURE_ROAD) });
    }
  }
  candidates.sort((a, b) => a.range - b.range ||
    Number(b.road) - Number(a.road) || a.x - b.x || a.y - b.y);
  for (const candidate of candidates) {
    if (room.createConstructionSite(candidate.x, candidate.y,
      STRUCTURE_CONTAINER) !== OK) continue;
    const site = room.lookForAt(LOOK_CONSTRUCTION_SITES,
      candidate.x, candidate.y).find(entry =>
      entry.structureType === STRUCTURE_CONTAINER) || null;
    return { ...candidate, site };
  }
  return null;
};

module.exports = { placeRemoteContainerSite };
