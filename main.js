'use strict';

// A small bootstrap colony: workers harvest, refill, build, and upgrade.
module.exports.loop = function () {
  if (!Memory.creeps) Memory.creeps = {};
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) delete Memory.creeps[name];
  }

  const workerBody = [WORK, CARRY, MOVE];
  const workerCost = workerBody.reduce((total, part) => total + BODYPART_COST[part], 0);
  // Abbreviate body parts in spawn and creep status logs (for example, WWCM).
  const bodyPartCodes = {
    [WORK]: 'W',
    [CARRY]: 'C',
    [MOVE]: 'M',
    [ATTACK]: 'A',
    [RANGED_ATTACK]: 'R',
    [HEAL]: 'H',
    [CLAIM]: 'CL',
    [TOUGH]: 'T'
  };
  const getBodyCode = parts => parts.map(part => {
    const type = typeof part === 'string' ? part : part.type;
    return bodyPartCodes[type] || type;
  }).join('');
  const buildBody = (role, energy) => {
    if (role === 'miner') {
      // Stationary miners need one MOVE to reach their tile, up to five WORK, and a small carry buffer.
      const workParts = Math.min(5,
        Math.floor((energy - BODYPART_COST[CARRY] - BODYPART_COST[MOVE]) /
          BODYPART_COST[WORK]));
      if (workParts < 1) return null;
      const body = Array(workParts).fill(WORK);
      body.push(CARRY, MOVE);
      let carryParts = 1;
      let cost = body.reduce((total, part) => total + BODYPART_COST[part], 0);
      while (body.length < 50 && carryParts < 3 &&
          cost + BODYPART_COST[CARRY] <= energy) {
        body.splice(body.length - 1, 0, CARRY);
        carryParts++;
        cost += BODYPART_COST[CARRY];
      }
      return body;
    }

    // Mobile roles grow in balanced WORK/CARRY/MOVE modules and always need at least one of each.
    if (energy < workerCost) return null;

    const body = [];
    let cost = 0;
    while (body.length + workerBody.length <= 50 && cost + workerCost <= energy) {
      body.push(...workerBody);
      cost += workerCost;
    }
    if (body.length < 50 && cost + BODYPART_COST[WORK] <= energy) {
      body.push(WORK);
      cost += BODYPART_COST[WORK];
    }
    if (body.length < 50 && cost + BODYPART_COST[CARRY] <= energy) {
      body.push(CARRY);
    }
    if (body.indexOf(WORK) === -1 || body.indexOf(CARRY) === -1 ||
        body.indexOf(MOVE) === -1) return null;
    return body.length ? body : null;
  };
  const findMinerStation = (room, source, container, reserved, ignoreCreep, preferred) => {
    // Use a single walkable tile within range one of both the source and container.
    const terrain = room.getTerrain();
    const isAvailable = (x, y) => {
      if (x < 0 || x > 49 || y < 0 || y > 49 ||
          terrain.get(x, y) === TERRAIN_MASK_WALL ||
          source.pos.getRangeTo(x, y) > 1 || container.pos.getRangeTo(x, y) > 1 ||
          (x === source.pos.x && y === source.pos.y) ||
          (x === container.pos.x && y === container.pos.y)) return false;
      const key = `${x}:${y}`;
      if (reserved[key]) return false;
      const blocked = room.lookForAt(LOOK_STRUCTURES, x, y).some(structure =>
        OBSTACLE_OBJECT_TYPES.includes(structure.structureType) &&
        !(structure.structureType === STRUCTURE_RAMPART &&
          (structure.my || structure.isPublic)));
      if (blocked) return false;
      return !room.lookForAt(LOOK_CREEPS, x, y)
        .some(creep => creep.name !== ignoreCreep);
    };

    if (preferred && isAvailable(preferred.x, preferred.y)) return preferred;
    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
      for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
        if (x === source.pos.x && y === source.pos.y) continue;
        if (isAvailable(x, y)) return { x, y };
      }
    }
    return null;
  };
  const getWorkerLimits = room => {
    // Count unique walkable spawn-adjacent tiles; overlapping spawn areas count once.
    const spawnSpots = new Set();
    const terrain = room.getTerrain();
    for (const spawn of room.find(FIND_MY_SPAWNS)) {
      for (let x = spawn.pos.x - 1; x <= spawn.pos.x + 1; x++) {
        for (let y = spawn.pos.y - 1; y <= spawn.pos.y + 1; y++) {
          if (x === spawn.pos.x && y === spawn.pos.y || x < 0 || x > 49 ||
              y < 0 || y > 49 || terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
          const blocked = room.lookForAt(LOOK_STRUCTURES, x, y).some(structure =>
            OBSTACLE_OBJECT_TYPES.includes(structure.structureType) &&
            !(structure.structureType === STRUCTURE_RAMPART &&
              (structure.my || structure.isPublic)));
          if (!blocked) spawnSpots.add(`${x}:${y}`);
        }
      }
    }
    const spawnLimit = spawnSpots.size;
    return {
      spawnLimit,
      workerLimit: Math.min(20, spawnLimit)
    };
  };
  const getSpawnAssignment = (room, workers) => {
    // Fill required room roles before creating additional general workers.
    if (!workers.some(creep => creep.memory.role === 'upgrader')) {
      const availableUpgrader = workers.find(creep => !creep.spawning &&
        creep.memory.role !== 'miner');
      return availableUpgrader ? null : { role: 'upgrader' };
    }

    const sourceContainers = room.find(FIND_SOURCES).map(source => ({
      source,
      container: source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER
      })[0]
    })).filter(entry => entry.container).map(entry => ({
      ...entry,
      station: findMinerStation(room, entry.source, entry.container, {})
    }));
    const missingSource = sourceContainers.find(entry =>
      entry.station &&
      !workers.some(creep => creep.memory.minerSource === entry.source.id));
    if (missingSource) {
      const availableMiner = workers.find(creep => !creep.spawning &&
        creep.memory.role !== 'upgrader' && creep.memory.role !== 'miner');
      if (availableMiner) return null;
      return {
        role: 'miner',
        source: missingSource.source,
        container: missingSource.container,
        station: missingSource.station
      };
    }
    return { role: 'worker' };
  };

  for (const spawn of Object.values(Game.spawns)) {
    const workers = Object.values(Game.creeps).filter(c =>
      c.memory.home === spawn.room.name);
    const { workerLimit } = getWorkerLimits(spawn.room);
    const assignment = getSpawnAssignment(spawn.room, workers);
    const body = assignment && buildBody(assignment.role, spawn.room.energyAvailable);
    if (!spawn.spawning && body && workers.length < workerLimit) {
      const name = `worker-${spawn.name}-${Game.time}`;
      const result = spawn.spawnCreep(body, name, {
        memory: {
          home: spawn.room.name,
          working: false,
          role: assignment.role,
          minerSource: assignment.source && assignment.source.id,
          minerContainer: assignment.container && assignment.container.id,
          minerX: assignment.station && assignment.station.x,
          minerY: assignment.station && assignment.station.y
        }
      });
      if (result === OK) {
        const cost = body.reduce((total, part) => total + BODYPART_COST[part], 0);
        console.log(`[${Game.time}] Spawning ${name} (${assignment.role}, ${cost} energy): ${getBodyCode(body)}`);
      }
    }
  }

  const reservedEnergy = {};
  const reservedCapacity = {};
  const reservedDrops = {};
  const urgentUpgradeAssigned = {};
  const reservedHarvestSpots = {};
  const creeps = Object.values(Game.creeps).filter(creep => !creep.spawning);
  const roomUpgraders = {};
  const assignedCreeps = {};
  const dedicatedMinerSources = {};

  for (const creep of creeps) {
    if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'upgrader' && !roomUpgraders[creep.room.name]) {
      roomUpgraders[creep.room.name] = creep;
      assignedCreeps[creep.name] = true;
    }
  }

  // Keep one upgrader, then assign one miner to each source with an adjacent container.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const roomCreeps = creeps.filter(creep => creep.room.name === room.name);
    if (!roomUpgraders[room.name]) {
      const upgrader = roomCreeps.find(creep => creep.memory.role !== 'miner') || roomCreeps[0];
      if (upgrader) {
        roomUpgraders[room.name] = upgrader;
        assignedCreeps[upgrader.name] = true;
      }
    }

    const sourceContainers = room.find(FIND_SOURCES).map(source => ({
      source,
      container: source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER
      })[0]
    })).filter(entry => entry.container);
    const miners = {};
    const minerStations = {};
    const reservedMinerSpots = {};

    for (const entry of sourceContainers) {
      const miner = roomCreeps.find(creep => !assignedCreeps[creep.name] &&
        creep.memory.role === 'miner' && creep.memory.minerSource === entry.source.id);
      if (!miner) continue;
      const station = findMinerStation(room, entry.source, entry.container,
        reservedMinerSpots, miner.name, { x: miner.memory.minerX, y: miner.memory.minerY });
      if (!station) continue;
      miners[entry.source.id] = miner;
      minerStations[entry.source.id] = station;
      reservedMinerSpots[`${station.x}:${station.y}`] = miner.name;
      assignedCreeps[miner.name] = true;
    }
    for (const entry of sourceContainers) {
      let miner = miners[entry.source.id];
      if (!miner) {
        miner = roomCreeps.find(creep => !assignedCreeps[creep.name]);
        if (!miner) continue;
        const station = findMinerStation(room, entry.source, entry.container,
          reservedMinerSpots, miner.name);
        if (!station) continue;
        miners[entry.source.id] = miner;
        minerStations[entry.source.id] = station;
        reservedMinerSpots[`${station.x}:${station.y}`] = miner.name;
        assignedCreeps[miner.name] = true;
      }
      miner.memory.role = 'miner';
      miner.memory.minerSource = entry.source.id;
      miner.memory.minerContainer = entry.container.id;
      miner.memory.minerX = minerStations[entry.source.id].x;
      miner.memory.minerY = minerStations[entry.source.id].y;
      dedicatedMinerSources[entry.source.id] = true;
    }

    for (const creep of roomCreeps) {
      if (creep === roomUpgraders[room.name]) {
        creep.memory.role = 'upgrader';
      } else if (!assignedCreeps[creep.name]) {
        creep.memory.role = 'worker';
        delete creep.memory.minerSource;
        delete creep.memory.minerContainer;
        delete creep.memory.minerX;
        delete creep.memory.minerY;
      }
    }
  }
  for (const creep of creeps) {
    if (!creep.room.controller || !creep.room.controller.my) {
      creep.memory.role = 'worker';
      delete creep.memory.minerSource;
      delete creep.memory.minerContainer;
      delete creep.memory.minerX;
      delete creep.memory.minerY;
    }
  }

  for (const creep of creeps) {
    if (creep.memory.role === 'miner') {
      delete creep.memory.harvestSource;
      delete creep.memory.harvestX;
      delete creep.memory.harvestY;
      continue;
    }
    // Keep every container used for this load excluded until the creep spends all its energy.
    if (creep.store[RESOURCE_ENERGY] === 0) {
      creep.memory.working = false;
      delete creep.memory.energySources;
      delete creep.memory.energySource;
    } else if (!Array.isArray(creep.memory.energySources)) {
      creep.memory.energySources = creep.memory.energySource
        ? [creep.memory.energySource]
        : [];
      delete creep.memory.energySource;
    }
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
      if (dedicatedMinerSources[candidate.id]) continue;
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
    const scavenge = () => {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;
      const drop = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: resource => resource.resourceType === RESOURCE_ENERGY &&
          resource.amount > 0 && !reservedDrops[resource.id]
      });
      if (!drop) return false;
      reservedDrops[drop.id] = creep.name;
      return perform(drop, resource => creep.pickup(resource));
    };
    let tasks;
    if (creep.memory.role === 'miner') {
      // Move once to the shared station, then harvest and transfer without moving; wait if full.
      tasks = [
        {
          name: 'mine-to-container',
          run: () => {
            const source = Game.getObjectById(creep.memory.minerSource);
            const container = Game.getObjectById(creep.memory.minerContainer);
            if (!source || !container) return false;
            const station = new RoomPosition(creep.memory.minerX,
              creep.memory.minerY, creep.room.name);
            if (creep.pos.x !== station.x || creep.pos.y !== station.y) {
              creep.moveTo(station);
              creep.memory.taskTarget = `${source.id}@${station.x},${station.y}`;
              return true;
            }
            if (container.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
              creep.memory.taskTarget = container.id;
              return true;
            }
            if (creep.store[RESOURCE_ENERGY] > 0 &&
                (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 || source.energy === 0)) {
              return perform(container, target => creep.transfer(target, RESOURCE_ENERGY));
            }
            if (source.energy > 0 && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
              return perform(source, target => creep.harvest(target));
            }
            if (creep.store[RESOURCE_ENERGY] > 0) {
              return perform(container, target => creep.transfer(target, RESOURCE_ENERGY));
            }
            creep.memory.taskTarget = source.id;
            return true;
          }
        }
      ];
    } else if (creep.memory.working && creep.memory.role === 'upgrader') {
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
          name: 'scavenge',
          run: scavenge
        },
        {
          name: 'upgrade',
          run: () => controller && controller.my
            ? perform(controller, target => creep.upgradeController(target))
            : false
        }
      ];
    } else if (creep.memory.working) {
      // Critical downgrade protection comes first; scavenge before routine work and storage.
      tasks = [
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
        run: scavenge
      },
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
        name: 'build',
        run: () => {
          const site = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES);
          return site ? perform(site, target => creep.build(target)) : false;
        }
      },
      {
        name: 'store',
        run: () => {
          // Don't return withdrawn energy to the same container it came from.
          const energySources = Array.isArray(creep.memory.energySources)
            ? creep.memory.energySources
            : [];
          const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER &&
              energySources.indexOf(s.id) === -1 &&
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
        run: scavenge
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
          const result = creep.withdraw(container, RESOURCE_ENERGY);
          if (result === ERR_NOT_IN_RANGE) {
            reservedEnergy[container.id] = (reservedEnergy[container.id] || 0) + amount;
            creep.moveTo(container);
            creep.memory.taskTarget = container.id;
            return true;
          }
          if (result !== OK) return false;
          reservedEnergy[container.id] = (reservedEnergy[container.id] || 0) + amount;
          if (!Array.isArray(creep.memory.energySources)) {
            creep.memory.energySources = [];
          }
          if (creep.memory.energySources.indexOf(container.id) === -1) {
            creep.memory.energySources.push(container.id);
          }
          creep.memory.taskTarget = container.id;
          return true;
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
    const assignments = creeps.map(creep => {
      const timeToLive = creep.ticksToLive === undefined ? 'unknown' : creep.ticksToLive;
      return `  ${creep.name} (${creep.memory.role || 'worker'}, TTL ${timeToLive}, ${getBodyCode(creep.body)}): ${creep.memory.task || 'idle'} -> ${creep.memory.taskTarget || '-'}`;
    });
    console.log(`[${Game.time}] Creep tasks:\n${assignments.join('\n') || '  none'}`);
  }

  // Explain worker-cap and temporary spawn blockers every 100 ticks.
  if (Game.time % 100 === 0) {
    for (const spawn of Object.values(Game.spawns)) {
      const { spawnLimit, workerLimit } = getWorkerLimits(spawn.room);
      const workerCount = Object.values(Game.creeps)
        .filter(creep => creep.memory.home === spawn.room.name).length;
      const blockers = [];
      const bindingLimits = [];
      if (spawnLimit === workerLimit) bindingLimits.push('spawn tile cap');
      if (20 === workerLimit) bindingLimits.push('hard cap');
      if (workerCount >= workerLimit) {
        blockers.push(`worker limit reached (${bindingLimits.join(' and ')})`);
      }
      if (spawn.spawning) blockers.push(`spawn busy with ${spawn.spawning.name}`);
      if (spawn.room.energyAvailable < workerCost) {
        blockers.push(`energy below worker cost (${workerCost})`);
      }
      const status = blockers.length ? blockers.join(', ') : 'eligible to spawn';
      console.log(`[${Game.time}] ${spawn.room.name} (${spawn.name}) workers ${workerCount}/${workerLimit}; limits: spawn tiles ${spawnLimit}, hard cap 20; energy ${spawn.room.energyAvailable}/${spawn.room.energyCapacityAvailable} (worker cost ${workerCost}); ${status}`);
    }
  }
};
