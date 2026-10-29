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
    creep.getActiveBodyparts(WORK) >= 4 && hasRoadMobility(creep));

  const getRemoteReplacementLead = creep => {
    if (!creep) return Infinity;
    const homeRoomName = creep.memory.remoteHome || creep.memory.home ||
      creep.room.name;
    const targetRoomName = creep.memory.remoteRoom || creep.room.name;
    const route = Game.map.findRoute(homeRoomName, targetRoomName);
    const roomTransitions = Array.isArray(route) ? route.length : 1;
    // Include spawning, the cross-room trip, traffic, and time waiting for the
    // spawn behind another already-requested specialist.
    return creep.body.length * CREEP_SPAWN_TIME + 150 +
      roomTransitions * 75;
  };

  const hasRemoteReplacementLife = creep => Boolean(creep &&
    (creep.spawning || creep.ticksToLive > getRemoteReplacementLead(creep)));

  const hasLocalReplacementLife = creep => Boolean(creep &&
    (creep.spawning || creep.ticksToLive >
      creep.body.length * CREEP_SPAWN_TIME + 50));

  return {
    hasWorkParts,
    hasRoadMobility,
    hasBuilderBody,
    getRemoteReplacementLead,
    hasRemoteReplacementLife,
    hasLocalReplacementLife
  };
};

module.exports = { createCreepLifecycle };
