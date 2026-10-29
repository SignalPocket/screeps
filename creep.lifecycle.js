'use strict';

const createCreepLifecycle = ({ Game, WORK, CREEP_SPAWN_TIME }) => {
  const hasWorkParts = creep =>
    Boolean(creep && creep.getActiveBodyparts(WORK) > 0);

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
    getRemoteReplacementLead,
    hasRemoteReplacementLife,
    hasLocalReplacementLife
  };
};

module.exports = { createCreepLifecycle };
