'use strict';

// A small bootstrap colony: workers harvest, refill, build, and upgrade.
module.exports.loop = function () {
  if (!Memory.creeps) Memory.creeps = {};
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) delete Memory.creeps[name];
  }

  for (const spawn of Object.values(Game.spawns)) {
    const workers = Object.values(Game.creeps).filter(c =>
      c.memory.home === spawn.room.name);
    if (!spawn.spawning && workers.length < 6) {
      spawn.spawnCreep([WORK, CARRY, MOVE], `worker-${spawn.name}-${Game.time}`, {
        memory: { home: spawn.room.name, working: false }
      });
    }
  }

  for (const creep of Object.values(Game.creeps)) {
    if (creep.spawning) continue;
    if (creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
    if (creep.store.getFreeCapacity() === 0) creep.memory.working = true;

    if (!creep.memory.working) {
      const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
      if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source);
      continue;
    }

    const target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: s => (s.structureType === STRUCTURE_SPAWN ||
        s.structureType === STRUCTURE_EXTENSION) &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    if (target) {
      if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(target);
      continue;
    }
    const controller = creep.room.controller;
    // Keep the controller alive before spending energy on construction.
    if (controller && controller.my && controller.ticksToDowngrade < 3000) {
      if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) creep.moveTo(controller);
      continue;
    }
    const site = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES);
    if (site) {
      if (creep.build(site) === ERR_NOT_IN_RANGE) creep.moveTo(site);
    } else if (controller && controller.my) {
      if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) creep.moveTo(controller);
    }
  }
};
