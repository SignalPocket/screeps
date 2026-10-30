'use strict';

// Assigns stable, unique standing tiles around each owned controller buffer.
// Invalid saved stations are reconciled every tick instead of lingering in
// creep memory after the buffer or walkable tile disappears.
const planControllerStations = ({ rooms, creeps, getRoomStructures,
  getContainerPurpose = null,
  RoomPosition, STRUCTURE_CONTAINER, STRUCTURE_RAMPART, TERRAIN_MASK_WALL,
  LOOK_STRUCTURES, OBSTACLE_OBJECT_TYPES }) => {
  const stations = {};
  for (const room of rooms) {
    if (!room.controller || !room.controller.my) continue;
    const roomCreeps = creeps.filter(creep => creep.room.name === room.name);
    const upgraders = roomCreeps.filter(creep =>
      creep.memory.role === 'upgrader' ||
      (creep.memory.demandLane === 'upgrade' &&
        (creep.memory.task === 'upgrade' ||
          creep.memory.lastTask === 'upgrade')))
      .sort((a, b) => a.name.localeCompare(b.name));
    const upgraderNames = new Set(upgraders.map(creep => creep.name));
    for (const creep of roomCreeps) {
      if (!upgraderNames.has(creep.name)) delete creep.memory.controllerStation;
    }
    const buffers = getRoomStructures(room)
      .filter(structure => structure.structureType === STRUCTURE_CONTAINER &&
        (getContainerPurpose
          ? getContainerPurpose(room, structure.pos) === 'controller'
          : structure.pos.getRangeTo(room.controller) <= 3))
      .sort((a, b) => a.pos.getRangeTo(room.controller) -
        b.pos.getRangeTo(room.controller) || a.id.localeCompare(b.id));
    if (!buffers.length) {
      for (const upgrader of upgraders) {
        delete upgrader.memory.controllerStation;
      }
      continue;
    }
    const terrain = room.getTerrain();
    const brigadePlan = room.memory && room.memory.controllerBrigadePlan;
    const brigadeStops = new Set([
      ...(brigadePlan && Array.isArray(brigadePlan.segments)
        ? brigadePlan.segments.flatMap(segment =>
          [segment.pickup, segment.delivery]).filter(Boolean) : []),
      ...(brigadePlan && Array.isArray(brigadePlan.rightOfWay)
        ? brigadePlan.rightOfWay : [])
    ].map(point => `${point.x}:${point.y}`));
    const candidates = [];
    for (const buffer of buffers) {
      for (let x = buffer.pos.x - 1; x <= buffer.pos.x + 1; x++) {
        for (let y = buffer.pos.y - 1; y <= buffer.pos.y + 1; y++) {
        if (x < 1 || x > 48 || y < 1 || y > 48 ||
            x === buffer.pos.x && y === buffer.pos.y ||
            brigadeStops.has(`${x}:${y}`) ||
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
    candidates.sort((a, b) =>
      room.controller.pos.getRangeTo(a.x, a.y) -
        room.controller.pos.getRangeTo(b.x, b.y) ||
      a.bufferId.localeCompare(b.bufferId) || a.x - b.x || a.y - b.y);
    const used = new Set();
    for (const [index, upgrader] of upgraders.entries()) {
      const preferredBuffer = buffers[index % buffers.length];
      const saved = upgrader.memory.controllerStation;
      let station = saved && saved.bufferId === preferredBuffer.id &&
        candidates.find(candidate => candidate.x === saved.x &&
          candidate.y === saved.y && candidate.bufferId === saved.bufferId &&
          !used.has(`${saved.x}:${saved.y}`));
      if (!station) {
        station = candidates.find(candidate =>
          candidate.bufferId === preferredBuffer.id &&
          !used.has(`${candidate.x}:${candidate.y}`)) ||
          candidates.find(candidate =>
            !used.has(`${candidate.x}:${candidate.y}`));
      }
      if (!station) {
        delete upgrader.memory.controllerStation;
        continue;
      }
      used.add(`${station.x}:${station.y}`);
      upgrader.memory.controllerStation = {
        x: station.x, y: station.y, roomName: room.name,
        bufferId: station.bufferId
      };
      stations[upgrader.name] = {
        position: new RoomPosition(station.x, station.y, room.name),
        buffer: station.buffer
      };
    }
  }
  return stations;
};

module.exports = { planControllerStations };
