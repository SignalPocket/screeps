'use strict';

const createMovementService = options => {
  const { Game, Room, FIND_STRUCTURES, FIND_MY_CREEPS, STRUCTURE_ROAD,
    OK, ERR_INVALID_TARGET } = options;
  const movementReservations = {};
  const movementRoomCache = {};
  const getMovementRoomCache = roomName => {
    if (movementRoomCache[roomName]) return movementRoomCache[roomName];
    const room = Game.rooms[roomName];
    if (!room) return null;
    const preferredUses = {};
    for (const path of room.memory.travelPathPlan &&
      Array.isArray(room.memory.travelPathPlan.paths)
      ? room.memory.travelPathPlan.paths : []) {
      for (const point of path.points || []) {
        const key = `${point.x}:${point.y}`;
        preferredUses[key] = (preferredUses[key] || 0) + 1;
      }
    }
    const preferredRoadTiles = new Set(Object.entries(preferredUses)
      .filter(([, uses]) => uses >= 2).map(([key]) => key));
    const brigadePlan = room.memory.controllerBrigadePlan;
    const brigadeRightOfWay = new Set([
      ...(brigadePlan && Array.isArray(brigadePlan.segments)
        ? brigadePlan.segments.flatMap(segment =>
          [segment.pickup, segment.delivery]).filter(Boolean) : []),
      ...(brigadePlan && Array.isArray(brigadePlan.rightOfWay)
        ? brigadePlan.rightOfWay : [])
    ].map(point => `${point.x}:${point.y}`));
    const roads = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD
    }).map(road => ({
      x: road.pos.x,
      y: road.pos.y,
      preferred: preferredRoadTiles.has(`${road.pos.x}:${road.pos.y}`)
    }));
    const cached = {
      roads,
      roadTiles: new Set(roads.map(road => `${road.x}:${road.y}`)),
      preferredRoadTiles,
      brigadeRightOfWay,
      creeps: room.find(FIND_MY_CREEPS).map(other => ({
        name: other.name,
        x: other.pos.x,
        y: other.pos.y,
        loaded: other.store.getUsedCapacity() > 0,
        stationary: other.memory.role === 'miner' ||
          other.memory.role === 'harvester' ||
          other.memory.role === 'upgrader' ||
          other.memory.task === 'remote-harvest'
      }))
    };
    movementRoomCache[roomName] = cached;
    return cached;
  };
  const reserveUpcomingRoute = creep => {
    const path = creep.memory._move && creep.memory._move.path;
    if (typeof path !== 'string' || path.length === 0) return;
    let decoded;
    try {
      decoded = Room.deserializePath(path);
    } catch (error) {
      return;
    }
    if (!Array.isArray(decoded) || decoded.length === 0) return;
    let start = decoded.findIndex(step =>
      step.x === creep.pos.x && step.y === creep.pos.y);
    if (start >= 0) start += 1;
    else start = decoded.findIndex(step =>
      Math.max(Math.abs(step.x - creep.pos.x),
        Math.abs(step.y - creep.pos.y)) <= 1);
    if (start < 0) return;
    const roomName = creep.room.name;
    if (!movementReservations[roomName]) movementReservations[roomName] = {};
    for (const step of decoded.slice(start, start + 5)) {
      movementReservations[roomName][`${step.x}:${step.y}`] = creep.name;
    }
  };
  const moveCreep = (creep, target, range = 1, movementOptions = {}) => {
    const position = target.pos || target;
    if (!position) return ERR_INVALID_TARGET;
    const targetRoomName = position.roomName || creep.room.name;
    const effectiveRange = targetRoomName === creep.room.name ? range : 0;
    if (targetRoomName === creep.room.name &&
        creep.pos.getRangeTo(position) <= effectiveRange) return OK;
    if (creep.memory.navCostVersion !== 'planned-roads-v6') {
      creep.memory.navCostVersion = 'planned-roads-v6';
      delete creep.memory._move;
      delete creep.memory.navGoal;
    }
    const goal = target.id ||
      `${targetRoomName}:${position.x}:${position.y}:${effectiveRange}`;
    const samePosition = creep.memory.navLastX === creep.pos.x &&
      creep.memory.navLastY === creep.pos.y &&
      creep.memory.navLastRoom === creep.room.name;
    const consecutiveMove = creep.memory.navLastTick === Game.time - 1;
    const sameGoal = creep.memory.navGoal === goal;
    const oscillating = consecutiveMove &&
      creep.memory.navPrevX === creep.pos.x &&
      creep.memory.navPrevY === creep.pos.y &&
      creep.memory.navPrevRoom === creep.room.name && !samePosition;
    creep.memory.navStuck = (samePosition || oscillating) &&
      consecutiveMove && sameGoal
      ? (creep.memory.navStuck || 0) + 1 : 0;
    const recalculate = oscillating || creep.memory.navStuck >= 2;
    const carryingCargo = creep.store.getUsedCapacity() > 0;
    const direct = movementOptions.direct === true;
    const routeReuse = carryingCargo ? 50 : 25;
    if (recalculate) delete creep.memory._move;
    const result = creep.moveTo(target, {
      range: effectiveRange,
      reusePath: recalculate ? 0 : routeReuse,
      ignoreCreeps: !recalculate,
      // Roads should win over a modest shortcut, while still allowing a
      // clearly shorter off-road route. This avoids both road avoidance and
      // long ornamental detours.
      plainCost: direct && movementOptions.preferRoads ? 2 : direct ? 1 : 3,
      swampCost: direct && movementOptions.preferRoads ? 10 : direct ? 5 : 12,
      maxOps: 2000,
      costCallback: (roomName, costs) => {
        if (!Game.rooms[roomName]) return costs;
        const roomCache = getMovementRoomCache(roomName);
        for (const key of roomCache ? roomCache.preferredRoadTiles : []) {
          const [x, y] = key.split(':').map(Number);
          costs.set(x, y, 2);
        }
        for (const road of roomCache ? roomCache.roads : []) {
          costs.set(road.x, road.y,
            direct && movementOptions.preferRoads ? 1
              : road.preferred ? 1 : 2);
        }
        if (movementOptions.roadOnly) {
          for (let x = 1; x <= 48; x++) {
            for (let y = 1; y <= 48; y++) {
              if (!roomCache || !roomCache.roadTiles.has(`${x}:${y}`)) {
                costs.set(x, y, 255);
              }
            }
          }
        }
        if (creep.memory.role !== 'controller-relay') {
          for (const key of roomCache ? roomCache.brigadeRightOfWay : []) {
            const [x, y] = key.split(':').map(Number);
            costs.set(x, y, 255);
          }
        }
        const reservations = movementReservations[roomName] || {};
        for (const key of Object.keys(reservations)) {
          if (reservations[key] === creep.name) continue;
          const [x, y] = key.split(':').map(Number);
          const currentCost = costs.get(x, y);
          const owner = Game.creeps && Game.creeps[reservations[key]];
          if (owner && owner.memory.role === 'controller-relay' &&
              creep.memory.role !== 'controller-relay') {
            costs.set(x, y, 255);
            continue;
          }
          if (currentCost < 255) {
            costs.set(x, y, Math.max(currentCost,
              carryingCargo ? 12 : 30));
          }
        }
        if (recalculate || !carryingCargo) {
          const otherCreeps = roomCache ? roomCache.creeps : [];
          for (const other of otherCreeps.filter(candidate =>
            candidate.name !== creep.name &&
            (recalculate || candidate.loaded))) {
            const currentCost = costs.get(other.x, other.y);
            if (currentCost < 255) {
              costs.set(other.x, other.y, recalculate && other.stationary
                ? 255 : Math.max(currentCost, recalculate ? 50 : 10));
            }
          }
        }
        return costs;
      }
    });
    creep.memory.navGoal = goal;
    creep.memory.navPrevX = creep.memory.navLastX;
    creep.memory.navPrevY = creep.memory.navLastY;
    creep.memory.navPrevRoom = creep.memory.navLastRoom;
    creep.memory.navLastX = creep.pos.x;
    creep.memory.navLastY = creep.pos.y;
    creep.memory.navLastRoom = creep.room.name;
    creep.memory.navLastTick = Game.time;
    if (result === OK) reserveUpcomingRoute(creep);
    return result;
  };
  return { moveCreep, getMovementRoomCache, reserveUpcomingRoute,
    movementReservations };
};

module.exports = { createMovementService };
