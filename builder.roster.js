'use strict';

const createBuilderRoster = ({
  Game, normalizeBuilderMemory, hasBuilderBody, isOutpostBuilder,
  log = message => console.log(message)
}) => {
  const reconcileBuilderRosters = rooms => {
    const creeps = Object.values(Game.creeps);
    for (const creep of creeps) {
      normalizeBuilderMemory(creep.memory);
      if (creep.memory.role === 'worker' && hasBuilderBody(creep)) {
        creep.memory.role = 'builder';
        creep.memory.birthRole = creep.memory.birthRole === 'worker'
          ? 'builder' : creep.memory.birthRole;
        creep.memory.builderScope = 'local';
        creep.memory.builderMission = 'flexible';
      }
    }

    // Preserve one outpost builder per planned slot. A replacement may
    // already be spawning when an old builder becomes visible again; keep the
    // active roster and turn the duplicate into useful local capacity.
    for (const homeRoom of rooms.filter(room =>
      room.controller && room.controller.my)) {
      const plans = [homeRoom.memory.leftSurvey, homeRoom.memory.southSurvey,
        homeRoom.memory.southwestSurvey].filter(plan =>
        plan && plan.active && plan.targetRoom &&
        (plan.remoteBuilderTarget || 0) > 0);
      for (const plan of plans) {
        const candidates = creeps.filter(creep =>
          creep.memory.home === homeRoom.name && isOutpostBuilder(creep) &&
          creep.memory.remoteRoom === plan.targetRoom)
          .sort((a, b) =>
            (b.spawning ? Infinity : b.ticksToLive || 0) -
              (a.spawning ? Infinity : a.ticksToLive || 0) ||
            a.name.localeCompare(b.name));
        const retained = new Set();
        for (let slot = 0; slot < plan.remoteBuilderTarget; slot++) {
          const selected = candidates.find(creep =>
            !retained.has(creep.name) &&
            creep.memory.remoteBuilderSlot === slot) ||
            candidates.find(creep => !retained.has(creep.name));
          if (selected) {
            retained.add(selected.name);
            selected.memory.builderRosterRoom = plan.targetRoom;
          }
        }
        for (const creep of candidates.filter(candidate =>
          !retained.has(candidate.name))) {
          creep.memory.builderScope = 'local';
          creep.memory.builderMission = 'flexible';
          delete creep.memory.remoteHome;
          delete creep.memory.remoteRoom;
          delete creep.memory.remoteTeam;
          delete creep.memory.remoteDelivery;
          delete creep.memory.remoteBuilderSlot;
          delete creep.memory.remoteRepairTarget;
          delete creep.memory.remoteRoadBuilding;
          delete creep.memory.builderRosterRoom;
          log(`[${Game.time}] ${creep.name} duplicate outpost builder ` +
            '-> local builder');
        }
      }
    }
  };

  return { reconcileBuilderRosters };
};

module.exports = { createBuilderRoster };
