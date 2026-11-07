'use strict';

const createCreepLifecycle = ({ Game, WORK, MOVE, CREEP_SPAWN_TIME }) => {
  const hasWorkParts = creep =>
    Boolean(creep && creep.getActiveBodyparts(WORK) > 0);

  // A mobile worker should be able to clear one road step of fatigue per tick.
  // Stationary upgrader/miner bodies deliberately trade MOVE for WORK and must
  // not be promoted into construction or repair routes.
  const hasRoadMobility = creep => {
    if (!creep || !Array.isArray(creep.body)) return false;
    const activeNonMove = creep.body.filter(part => {
      const type = typeof part === 'string' ? part : part.type;
      const active = typeof part === 'string' || part.hits > 0;
      return active && type !== MOVE;
    }).length;
    return creep.getActiveBodyparts(MOVE) * 2 >= activeNonMove;
  };

  const hasBuilderBody = creep => Boolean(creep &&
    creep.getActiveBodyparts(WORK) >= 3 && hasRoadMobility(creep));

  const getRemoteReplacementLead = creep => {
    if (!creep) return Infinity;
    const homeRoomName = creep.memory.remoteHome || creep.memory.home ||
      creep.room.name;
    const targetRoomName = creep.memory.remoteRoom || creep.room.name;
    const route = Game.map.findRoute(homeRoomName, targetRoomName);
    const roomTransitions = Array.isArray(route) ? route.length : 1;
    // Include spawning, the cross-room trip, traffic, and time waiting for the
    // spawn behind another already-requested specialist.
    const home = Game.rooms && Game.rooms[homeRoomName];
    const observations = home && home.memory.haulTripStats &&
      home.memory.haulTripStats[targetRoomName];
    const measuredTravel = Math.max(0, ...Object.values(observations &&
      observations.slots || {}).filter(value => Game.time - value.updated <= 1500)
      .map(value => value.outboundTicks || 0));
    const queued = Object.values(Game.spawns || {}).filter(spawn =>
      spawn.room.name === homeRoomName && spawn.spawning)
      .reduce((longest, spawn) => Math.max(longest, spawn.spawning.remainingTime || 0), 0);
    return Math.max(creep.body.length, 6) * CREEP_SPAWN_TIME +
      150 + Math.max(roomTransitions * 75, measuredTravel) + queued;
  };

  const hasRemoteReplacementLife = creep => Boolean(creep &&
    (creep.spawning || creep.ticksToLive > getRemoteReplacementLead(creep)));

  const getLocalReplacementLead = creep => {
    const base = creep.body.length * CREEP_SPAWN_TIME + 50;
    if (!['miner', 'harvester'].includes(creep.memory.role)) return base;
    const homeName = creep.memory.home || creep.room.name;
    const room = Game.rooms && Game.rooms[homeName];
    const sourceId = creep.memory.minerSource || creep.memory.preferredSource || creep.memory.harvestSource;
    const path = room && room.memory.roadPlan && room.memory.roadPlan.paths
      .find(path => path.targetId === sourceId);
    const move = Math.max(1, creep.getActiveBodyparts(MOVE));
    const weight = creep.body.filter(part => (typeof part === 'string' ? part : part.type) !== MOVE).length;
    const roadTicks = Math.max(1, Math.ceil(weight / (move * 2)));
    const travel = (path ? path.points.length : 25) * roadTicks;
    const queued = Object.values(Game.spawns || {}).filter(spawn =>
      spawn.room && spawn.room.name === homeName && spawn.spawning)
      .reduce((longest, spawn) => Math.max(longest, spawn.spawning.remainingTime || 0), 0);
    return base + travel + queued;
  };
  const hasLocalReplacementLife = creep => Boolean(creep &&
    (creep.spawning || creep.ticksToLive > getLocalReplacementLead(creep)));

  return {
    hasWorkParts,
    hasRoadMobility,
    hasBuilderBody,
    getRemoteReplacementLead,
    getLocalReplacementLead,
    hasRemoteReplacementLife,
    hasLocalReplacementLife
  };
};

module.exports = { createCreepLifecycle };
