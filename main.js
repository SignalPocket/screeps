'use strict';

// A small bootstrap colony: workers harvest, refill, build, and upgrade.
module.exports.loop = function () {
  if (!Memory.creeps) Memory.creeps = {};
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) delete Memory.creeps[name];
  }

  const workerBody = [WORK, CARRY, MOVE];
  const workerCost = workerBody.reduce((total, part) => total + BODYPART_COST[part], 0);
  // The workforce cap assumes five workers per source and does not count walkable tiles.
  // Each spawn still waits only for enough room energy to build one worker.
  const getWorkerLimits = room => {
    const sourceLimit = room.find(FIND_SOURCES).length * 5;
    return {
      sourceLimit,
      workerLimit: Math.min(20, sourceLimit)
    };
  };

  for (const spawn of Object.values(Game.spawns)) {
    const workers = Object.values(Game.creeps).filter(c =>
      c.memory.home === spawn.room.name);
    const { workerLimit } = getWorkerLimits(spawn.room);
    if (!spawn.spawning && spawn.room.energyAvailable >= workerCost &&
        workers.length < workerLimit) {
      spawn.spawnCreep(workerBody, `worker-${spawn.name}-${Game.time}`, {
        memory: {
          home: spawn.room.name,
          working: false
        }
      });
    }
  }

  const reservedEnergy = {};
  const reservedCapacity = {};
  const reservedDrops = {};
  const urgentUpgradeAssigned = {};
  const reservedHarvestSpots = {};
  const creeps = Object.values(Game.creeps).filter(creep => !creep.spawning);
  const roomUpgraders = {};

  // Keep one upgrader per owned room; preserve the assignment across ticks when possible.
  for (const creep of creeps) {
    if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'upgrader' && !roomUpgraders[creep.room.name]) {
      roomUpgraders[creep.room.name] = creep;
    }
  }
  for (const creep of creeps) {
    if (!creep.room.controller || !creep.room.controller.my) {
      creep.memory.role = 'worker';
      continue;
    }
    if (!roomUpgraders[creep.room.name]) roomUpgraders[creep.room.name] = creep;
    creep.memory.role = roomUpgraders[creep.room.name] === creep ? 'upgrader' : 'worker';
  }

  for (const creep of creeps) {
    if (creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
    if (creep.store.getFreeCapacity() === 0) creep.memory.working = true;
    if (creep.memory.working) {
      delete creep.memory.harvestSource;
      delete creep.memory.harvestX;
      delete creep.memory.harvestY;
    }
  }

  // Reserve existing source tiles first so harvesters do not swap to a newly open spot.
  for (const creep of creeps) {
    const source = Game.getObjectById(creep.memory.harvestSource);
    const x = creep.memory.harvestX;
    const y = creep.memory.harvestY;
    if (creep.memory.working || !source || source.energy === 0 ||
        !Number.isInteger(x) || !Number.isInteger(y)) {
      delete creep.memory.harvestSource;
      delete creep.memory.harvestX;
      delete creep.memory.harvestY;
      continue;
    }
    const key = `${source.id}:${x}:${y}`;
    if (reservedHarvestSpots[key]) {
      delete creep.memory.harvestSource;
      delete creep.memory.harvestX;
      delete creep.memory.harvestY;
    } else {
      reservedHarvestSpots[key] = creep.name;
    }
  }

  const findHarvestAssignment = creep => {
    let source = Game.getObjectById(creep.memory.harvestSource);
    let x = creep.memory.harvestX;
    let y = creep.memory.harvestY;
    const currentKey = source && `${source.id}:${x}:${y}`;
    const terrain = creep.room.getTerrain();
    // A source tile must be walkable, unblocked by structures, and not occupied by another creep.
    const isOpen = (spotX, spotY) => {
      if (spotX < 0 || spotX > 49 || spotY < 0 || spotY > 49 ||
          terrain.get(spotX, spotY) === TERRAIN_MASK_WALL) return false;
      const blocked = creep.room.lookForAt(LOOK_STRUCTURES, spotX, spotY).some(structure =>
        OBSTACLE_OBJECT_TYPES.includes(structure.structureType) &&
        !(structure.structureType === STRUCTURE_RAMPART &&
          (structure.my || structure.isPublic)));
      if (blocked) return false;
      return !creep.room.lookForAt(LOOK_CREEPS, spotX, spotY)
        .some(other => other.name !== creep.name);
    };

    if (source && source.energy > 0 && reservedHarvestSpots[currentKey] === creep.name &&
        isOpen(x, y)) {
      return { source, x, y };
    }

    if (currentKey && reservedHarvestSpots[currentKey] === creep.name) {
      delete reservedHarvestSpots[currentKey];
    }
    delete creep.memory.harvestSource;
    delete creep.memory.harvestX;
    delete creep.memory.harvestY;

    let best;
    let bestRange = Infinity;
    for (const candidate of creep.room.find(FIND_SOURCES_ACTIVE)) {
      for (let spotX = candidate.pos.x - 1; spotX <= candidate.pos.x + 1; spotX++) {
        for (let spotY = candidate.pos.y - 1; spotY <= candidate.pos.y + 1; spotY++) {
          if ((spotX === candidate.pos.x && spotY === candidate.pos.y) ||
              !isOpen(spotX, spotY)) continue;
          const key = `${candidate.id}:${spotX}:${spotY}`;
          if (reservedHarvestSpots[key]) continue;
          const range = creep.pos.getRangeTo(spotX, spotY);
          if (range < bestRange) {
            best = { source: candidate, x: spotX, y: spotY, key };
            bestRange = range;
          }
        }
      }
    }

    if (!best) return null;
    creep.memory.harvestSource = best.source.id;
    creep.memory.harvestX = best.x;
    creep.memory.harvestY = best.y;
    reservedHarvestSpots[best.key] = creep.name;
    return best;
  };

  for (const creep of creeps) {
    const controller = creep.room.controller;
    const perform = (target, action) => {
      const result = action(target);
      if (result === ERR_NOT_IN_RANGE) creep.moveTo(target);
      if (result !== OK && result !== ERR_NOT_IN_RANGE) return false;
      creep.memory.taskTarget = target.id || target.name || target.structureType;
      return true;
    };
    let tasks;
    if (creep.memory.working && creep.memory.role === 'upgrader') {
      // The room's upgrader stays on the controller unless spawn energy is below one worker's cost.
      tasks = [
        {
          name: 'emergency-refill',
          run: () => {
            if (creep.room.energyAvailable >= workerCost) return false;
            const target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
              filter: s => (s.structureType === STRUCTURE_SPAWN ||
                s.structureType === STRUCTURE_EXTENSION) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) -
                  (reservedCapacity[s.id] || 0) > 0
            });
            if (!target) return false;
            const amount = Math.min(creep.store[RESOURCE_ENERGY],
              target.store.getFreeCapacity(RESOURCE_ENERGY) -
                (reservedCapacity[target.id] || 0));
            reservedCapacity[target.id] = (reservedCapacity[target.id] || 0) + amount;
            return perform(target, structure => creep.transfer(structure, RESOURCE_ENERGY));
          }
        },
        {
          name: 'upgrade',
          run: () => controller && controller.my
            ? perform(controller, target => creep.upgradeController(target))
            : false
        }
      ];
    } else if (creep.memory.working) {
      // Refill and downgrade protection come first; scavenge before sites and container storage.
      tasks = [
      {
        name: 'refill',
        run: () => {
          const target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_SPAWN ||
              s.structureType === STRUCTURE_EXTENSION) &&
              s.store.getFreeCapacity(RESOURCE_ENERGY) -
                (reservedCapacity[s.id] || 0) > 0
          });
          if (!target) return false;
          const amount = Math.min(creep.store[RESOURCE_ENERGY],
            target.store.getFreeCapacity(RESOURCE_ENERGY) -
              (reservedCapacity[target.id] || 0));
          reservedCapacity[target.id] = (reservedCapacity[target.id] || 0) + amount;
          return perform(target, structure => creep.transfer(structure, RESOURCE_ENERGY));
        }
      },
      {
        name: 'urgent-upgrade',
        run: () => {
          const roomName = creep.room.name;
          if (urgentUpgradeAssigned[roomName] || !controller || !controller.my ||
              controller.ticksToDowngrade >= 3000) return false;
          urgentUpgradeAssigned[roomName] = true;
          return perform(controller, target => creep.upgradeController(target));
        }
      },
      {
        name: 'scavenge',
        run: () => {
          const drop = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: resource => resource.resourceType === RESOURCE_ENERGY &&
              resource.amount > 0 && !reservedDrops[resource.id]
          });
          if (!drop) return false;
          reservedDrops[drop.id] = creep.name;
          return perform(drop, resource => creep.pickup(resource));
        }
      },
      {
        name: 'build',
        run: () => {
          const site = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES);
          return site ? perform(site, target => creep.build(target)) : false;
        }
      },
      {
        name: 'store',
        run: () => {
          const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER &&
              s.store.getFreeCapacity(RESOURCE_ENERGY) -
                (reservedCapacity[s.id] || 0) > 0
          });
          if (!container) return false;
          const amount = Math.min(creep.store[RESOURCE_ENERGY],
            container.store.getFreeCapacity(RESOURCE_ENERGY) -
              (reservedCapacity[container.id] || 0));
          reservedCapacity[container.id] =
            (reservedCapacity[container.id] || 0) + amount;
          return perform(container, target => creep.transfer(target, RESOURCE_ENERGY));
        }
      }
      ];
    } else {
      // Empty creeps collect dropped energy before withdrawing from containers or harvesting.
      tasks = [
      {
        name: 'scavenge',
        run: () => {
          const drop = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: resource => resource.resourceType === RESOURCE_ENERGY &&
              resource.amount > 0 && !reservedDrops[resource.id]
          });
          if (!drop) return false;
          reservedDrops[drop.id] = creep.name;
          return perform(drop, resource => creep.pickup(resource));
        }
      },
      {
        name: 'withdraw',
        run: () => {
          const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER &&
              s.store[RESOURCE_ENERGY] - (reservedEnergy[s.id] || 0) > 0
          });
          if (!container) return false;
          const amount = Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY),
            container.store[RESOURCE_ENERGY] - (reservedEnergy[container.id] || 0));
          reservedEnergy[container.id] = (reservedEnergy[container.id] || 0) + amount;
          return perform(container, target => creep.withdraw(target, RESOURCE_ENERGY));
        }
      },
      {
        name: 'harvest',
        run: () => {
          const assignment = findHarvestAssignment(creep);
          if (!assignment) return false;
          creep.memory.taskTarget = `${assignment.source.id}@${assignment.x},${assignment.y}`;
          if (creep.pos.x !== assignment.x || creep.pos.y !== assignment.y) {
            creep.moveTo(new RoomPosition(assignment.x, assignment.y, creep.room.name));
            return true;
          }
          return perform(assignment.source, target => creep.harvest(target));
        }
      }
      ];
    }

    delete creep.memory.task;
    delete creep.memory.taskTarget;
    for (const task of tasks) {
      if (task.run()) {
        creep.memory.task = task.name;
        break;
      }
    }
  }

  // Log live task/target assignments every 25 ticks without filling the console each tick.
  if (Game.time % 25 === 0) {
    const assignments = creeps.map(creep =>
      `  ${creep.name}: ${creep.memory.task || 'idle'} -> ${creep.memory.taskTarget || '-'}`);
    console.log(`[${Game.time}] Creep tasks:\n${assignments.join('\n') || '  none'}`);
  }

  // Explain worker-cap and temporary spawn blockers every 100 ticks.
  if (Game.time % 100 === 0) {
    for (const spawn of Object.values(Game.spawns)) {
      const { sourceLimit, workerLimit } = getWorkerLimits(spawn.room);
      const workerCount = Object.values(Game.creeps)
        .filter(creep => creep.memory.home === spawn.room.name).length;
      const blockers = [];
      const bindingLimits = [];
      if (sourceLimit === workerLimit) bindingLimits.push('source cap');
      if (20 === workerLimit) bindingLimits.push('hard cap');
      if (workerCount >= workerLimit) {
        blockers.push(`worker limit reached (${bindingLimits.join(' and ')})`);
      }
      if (spawn.spawning) blockers.push(`spawn busy with ${spawn.spawning.name}`);
      if (spawn.room.energyAvailable < workerCost) {
        blockers.push(`energy below worker cost (${workerCost})`);
      }
      const status = blockers.length ? blockers.join(', ') : 'eligible to spawn';
      console.log(`[${Game.time}] ${spawn.room.name} (${spawn.name}) workers ${workerCount}/${workerLimit}; limits: sources ${sourceLimit}, hard cap 20; energy ${spawn.room.energyAvailable}/${spawn.room.energyCapacityAvailable} (worker cost ${workerCost}); ${status}`);
    }
  }
};
