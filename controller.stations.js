'use strict';

// Assigns stable, unique standing tiles around each owned controller buffer.
// Invalid saved stations are reconciled every tick instead of lingering in
// creep memory after the buffer or walkable tile disappears.
const planControllerStations = ({ rooms, creeps, getRoomStructures,
  RoomPosition, STRUCTURE_CONTAINER, STRUCTURE_RAMPART, TERRAIN_MASK_WALL,
  LOOK_STRUCTURES, OBSTACLE_OBJECT_TYPES }) => {
  const stations = {};
  for (const room of rooms) {
    if (!room.controller || !room.controller.my) continue;
    const upgraders = creeps.filter(creep =>
      creep.room.name === room.name && creep.memory.role === 'upgrader')
      .sort((a, b) => a.name.localeCompare(b.name));
    const buffer = getRoomStructures(room)
      .filter(structure => structure.structureType === STRUCTURE_CONTAINER &&
        structure.pos.getRangeTo(room.controller) <= 3)
      .sort((a, b) => a.pos.getRangeTo(room.controller) -
        b.pos.getRangeTo(room.controller))[0];
    if (!buffer) {
      for (const upgrader of upgraders) {
        delete upgrader.memory.controllerStation;
      }
      continue;
    }
    const terrain = room.getTerrain();
    const candidates = [];
    for (let x = buffer.pos.x - 1; x <= buffer.pos.x + 1; x++) {
      for (let y = buffer.pos.y - 1; y <= buffer.pos.y + 1; y++) {
        if (x < 1 || x > 48 || y < 1 || y > 48 ||
            x === buffer.pos.x && y === buffer.pos.y ||
            terrain.get(x, y) === TERRAIN_MASK_WALL ||
            room.controller.pos.getRangeTo(x, y) > 3) continue;
        const blocked = room.lookForAt(LOOK_STRUCTURES, x, y)
          .some(structure => OBSTACLE_OBJECT_TYPES.includes(
            structure.structureType) &&
            !(structure.structureType === STRUCTURE_RAMPART &&
              (structure.my || structure.isPublic)));
        if (!blocked) candidates.push({ x, y, roomName: room.name });
      }
    }
    candidates.sort((a, b) =>
      room.controller.pos.getRangeTo(a.x, a.y) -
        room.controller.pos.getRangeTo(b.x, b.y) ||
      a.x - b.x || a.y - b.y);
    const used = new Set();
    for (const upgrader of upgraders) {
      const saved = upgrader.memory.controllerStation;
      let station = saved && saved.bufferId === buffer.id &&
        candidates.find(candidate => candidate.x === saved.x &&
          candidate.y === saved.y && !used.has(`${saved.x}:${saved.y}`));
      if (!station) {
        station = candidates.find(candidate =>
          !used.has(`${candidate.x}:${candidate.y}`));
      }
      if (!station) {
        delete upgrader.memory.controllerStation;
        continue;
      }
      used.add(`${station.x}:${station.y}`);
      upgrader.memory.controllerStation = {
        x: station.x, y: station.y, roomName: room.name, bufferId: buffer.id
      };
      stations[upgrader.name] = {
        position: new RoomPosition(station.x, station.y, room.name), buffer
      };
    }
  }
  return stations;
};

module.exports = { planControllerStations };
