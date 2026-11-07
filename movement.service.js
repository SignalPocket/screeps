'use strict';
const { isBrigadePlanActive } = typeof Game === 'undefined'
  ? require('./colony.operations') : require('colony.operations');
const { laneCost } = typeof Game==='undefined' ? require('./road.network') : require('road.network');

const BRIGADE_BYPASS_COST = 50;

// A brigade lane is a right-of-way, not a room divider. Price it high enough
// that ordinary workers take a nearby side route, while leaving PathFinder an
// escape when structures or terrain make crossing the saved lane unavoidable.
// Occupied relay tiles are blocked separately below during stuck recovery.
const applyBrigadeBypassCost = (costs, x, y) => {
  const currentCost = costs.get(x, y);
  if (currentCost < 255) costs.set(x, y,
    Math.max(currentCost, BRIGADE_BYPASS_COST));
};

/**
 * Move creeps without letting every caller invent different terrain rules.
 *
 * The service builds one room cost model per tick, retains useful cached paths,
 * reserves next steps to reduce collisions, and invalidates a route when a
 * creep is stuck or oscillating. Cost 1 is a strategic/preferred road, cost 2
 * is another road, cost 4 is plain terrain, and less desirable legal terrain
 * costs more. Brigade seats and right-of-way receive special protection.
 */
const createMovementService = options => {
  const { Game, Room, FIND_STRUCTURES, FIND_MY_CONSTRUCTION_SITES,
    FIND_MY_CREEPS, STRUCTURE_ROAD, STRUCTURE_EXTENSION,
    OK, ERR_INVALID_TARGET, ERR_TIRED } = options;
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
    const brigadePlan = isBrigadePlanActive(room) ? room.memory.controllerBrigadePlan : null;
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
    // Construction sites are normally traversable. Keep extension sites in
    // the shared room model so every creep prices them exactly like ordinary
    // plain terrain instead of avoiding the future extension footprint.
    // Completed extensions are intentionally absent: the engine blocks them.
    const extensionSites = FIND_MY_CONSTRUCTION_SITES !== undefined &&
      STRUCTURE_EXTENSION !== undefined
      ? room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: site => site.structureType === STRUCTURE_EXTENSION
      }).map(site => ({ x: site.pos.x, y: site.pos.y }))
      : [];
    const cached = {
      roads,
      extensionSites,
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
          other.memory.role === 'controller-relay' ||
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
    const effectiveRange = range;
    if (targetRoomName === creep.room.name &&
        creep.pos.getRangeTo(position) <= effectiveRange) return OK;
    // Fatigue prevents a move attempt; it is not evidence of a blocked route.
    // Break the observation chain so the first recovered tick cannot count
    // the preceding forced wait as a collision or an oscillation.
    if (creep.fatigue > 0) {
      creep.memory.navStuck = 0;
      delete creep.memory.navLastTick;
      return ERR_TIRED;
    }
    if (creep.memory.navCostVersion !== 'brigade-bypass-v10') {
      creep.memory.navCostVersion = 'brigade-bypass-v10';
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
      // The normal hierarchy is preferred road 1, ordinary road 2, plain 4,
      // swamp 20. Direct positioning without road preference remains an
      // explicit exception for seating a creep on an exact working tile.
      plainCost: direct && !movementOptions.preferRoads ? 1 : 4,
      swampCost: direct && !movementOptions.preferRoads ? 5 : 20,
      maxOps: movementOptions.maxOps || 2000,
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
        for (const site of roomCache ? roomCache.extensionSites : []) {
          const currentCost = costs.get(site.x, site.y);
          if (currentCost < 255 &&
              !roomCache.roadTiles.has(`${site.x}:${site.y}`)) {
            costs.set(site.x, site.y, 4);
          }
        }

        if (!direct && roomCache && Game.rooms[roomName].memory.roadNetworkPlan) {
          let heading={dx:Math.sign(position.x-creep.pos.x),dy:Math.sign(position.y-creep.pos.y)};
          if (targetRoomName!==roomName) {
            const exits=Game.map.describeExits(roomName)||{};
            const exit=Object.keys(exits).find(k=>exits[k]===targetRoomName);
            if(exit)heading={dx:exit==='3'?1:exit==='7'?-1:0,
              dy:exit==='5'?1:exit==='1'?-1:0};
          }
          for(const [key,lane] of Object.entries(Game.rooms[roomName].memory.roadNetworkPlan.directions)){
            if(!roomCache.roadTiles.has(key)||!roomCache.roadTiles.has(lane.peer))continue;
            const cost=laneCost(lane,heading,true);
            if(cost!==null){const [x,y]=key.split(':').map(Number);if(costs.get(x,y)<255)costs.set(x,y,cost);}
          }
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
            applyBrigadeBypassCost(costs, x, y);
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
    // Keep only the latest recovery attempt, with its own tick and goal. A
    // successful moveTo result accepts an intent; it does not prove movement.
    // This distinguishes failed path searches from collisions without storing
    // paths or growing an event log, and survives later CPU-deferred ticks.
    if (recalculate) creep.memory.navRecovery = {
      tick: Game.time,
      reason: oscillating ? 'oscillation' : 'blocked',
      result,
      stuck: creep.memory.navStuck,
      goal,
      room: creep.room.name,
      x: creep.pos.x,
      y: creep.pos.y
    };
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

module.exports = { createMovementService, applyBrigadeBypassCost,
  BRIGADE_BYPASS_COST };
