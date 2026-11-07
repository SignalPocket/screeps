'use strict';

// Room routing and tile routing are different jobs. Select an actual connected
// room first, then give the local pathfinder a reachable exit with range zero.
const selectRoomExitWaypoint = ({ Game, creep, targetRoom, recalculate = false }) => {
  const fromRoom = creep.room.name;
  const exits = Game.map.describeExits(fromRoom) || {};
  const saved = creep.memory.navRoomWaypoint;
  let exit;
  let nextRoom;
  if (!recalculate && saved && saved.fromRoom === fromRoom &&
      saved.targetRoom === targetRoom && exits[saved.exit] === saved.nextRoom) {
    exit = saved.exit;
    nextRoom = saved.nextRoom;
  } else {
    const route = Game.map.findRoute(fromRoom, targetRoom);
    if (!Array.isArray(route) || !route.length ||
        exits[route[0].exit] !== route[0].room) {
      delete creep.memory.navRoomWaypoint;
      delete creep.memory._move;
      return null;
    }
    exit = route[0].exit;
    nextRoom = route[0].room;
  }
  const neighbor = Game.rooms[nextRoom];
  const positions = creep.room.find(exit).filter(position => {
    if (creep.room.getTerrain().get(position.x, position.y) & 1) return false;
    if (!neighbor) return true;
    const x = position.x === 0 ? 49 : position.x === 49 ? 0 : position.x;
    const y = position.y === 0 ? 49 : position.y === 49 ? 0 : position.y;
    return !(neighbor.getTerrain().get(x, y) & 1);
  });
  let position = !recalculate && saved && saved.fromRoom === fromRoom &&
    saved.targetRoom === targetRoom && saved.nextRoom === nextRoom &&
    positions.find(candidate => candidate.x === saved.x && candidate.y === saved.y);
  if (!position) position = creep.pos.findClosestByPath(positions, {
    ignoreCreeps: true, maxRooms: 1
  });
  if (!position) {
    delete creep.memory.navRoomWaypoint;
    delete creep.memory._move;
    return null;
  }
  const changed = !saved || saved.fromRoom !== fromRoom ||
    saved.targetRoom !== targetRoom || saved.nextRoom !== nextRoom ||
    saved.x !== position.x || saved.y !== position.y;
  creep.memory.navRoomWaypoint = { fromRoom, targetRoom, nextRoom,
    exit, x: position.x, y: position.y };
  if (changed) delete creep.memory._move;
  return { position, changed };
};

module.exports = { selectRoomExitWaypoint };
