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
    // Count each usable source-adjacent tile once, assigning shared tiles to their nearest source.
    const sources = room.find(FIND_SOURCES);
    const spotOwners = {};
    const spotDistances = {};
    const terrain = room.getTerrain();
    for (const source of sources) {
      for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
        for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
          if (x === source.pos.x && y === source.pos.y || x < 0 || x > 49 ||
              y < 0 || y > 49 || terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
          const blocked = room.lookForAt(LOOK_STRUCTURES, x, y).some(structure =>
            OBSTACLE_OBJECT_TYPES.includes(structure.structureType) &&
            !(structure.structureType === STRUCTURE_RAMPART &&
              (structure.my || structure.isPublic)));
          const blockedSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).some(site =>
            OBSTACLE_OBJECT_TYPES.includes(site.structureType));
          const key = `${x}:${y}`;
          if (blocked || blockedSite) continue;
          const distance = source.pos.getRangeTo(x, y);
          if (spotDistances[key] === undefined || distance < spotDistances[key]) {
            spotOwners[key] = source.id;
            spotDistances[key] = distance;
          }
        }
      }
    }
    const sourceSpotCounts = Object.fromEntries(sources.map(source => [source.id, 0]));
    for (const sourceId of Object.values(spotOwners)) sourceSpotCounts[sourceId]++;
    const sourceSpotTotal = Object.values(sourceSpotCounts)
      .reduce((total, count) => total + count, 0);
    return {
      sourceSpotCounts,
      sourceSpotTotal,
      minerLimit: Math.min(20, sourceSpotTotal),
      workerLimit: 20
    };
  };
  // Re-evaluate the earliest unmet gate so rooms advance or regress as conditions change.
  const getRoomStrategy = room => {
    const level = room.controller ? room.controller.level : 0;
    const sources = room.find(FIND_SOURCES);
    const roads = room.find(FIND_STRUCTURES)
      .filter(structure => structure.structureType === STRUCTURE_ROAD);
    const roadTargets = [
      ...room.find(FIND_MY_SPAWNS),
      ...(room.controller ? [room.controller] : []),
      ...sources
    ];
    const roadAccess = roadTargets.filter(target =>
      roads.some(road => target.pos.getRangeTo(road) <= 1)).length;
    const towerCount = room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_TOWER
    }).length;
    const hasStorage = Boolean(room.storage && room.storage.my);
    const ownedSpawnRooms = new Set(Object.values(Game.spawns)
      .map(spawn => spawn.room.name)).size;
    const hasGclSlot = Boolean(Game.gcl && Game.gcl.level > ownedSpawnRooms);
    let mode;
    let gate;
    let objectives;
    let progress;

    if (level < 3) {
      mode = 'setup';
      gate = 'reach controller level 3';
      objectives = 'establish energy buffers, build extensions, and raise RCL';
      progress = `RCL ${level}/3`;
    } else if (level < 5) {
      mode = 'development';
      gate = 'reach controller level 5';
      objectives = 'build extensions, raise RCL, fill containers, and repair';
      progress = `RCL ${level}/5`;
    } else if (roadAccess < roadTargets.length) {
      mode = 'roads';
      gate = 'build road access beside every spawn, controller, and source';
      objectives = 'complete core road access while maintaining energy and RCL';
      progress = `road access ${roadAccess}/${roadTargets.length}`;
    } else if (level < 6 || towerCount < 1 || !hasStorage) {
      mode = 'infrastructure';
      gate = 'reach RCL 6 and build a tower and storage';
      objectives = 'build core infrastructure and repair damaged structures';
      progress = `RCL ${level}/6, tower ${towerCount ? 'ready' : 'needed'}, storage ${hasStorage ? 'ready' : 'needed'}`;
    } else if (level < 7 || !hasGclSlot) {
      mode = 'remote-sources';
      gate = 'reach RCL 7 and have an available GCL room slot';
      objectives = 'prepare additional energy sources and maintain the core room';
      progress = `RCL ${level}/7, GCL slot ${hasGclSlot ? 'ready' : 'needed'}`;
    } else {
      mode = 'expansion-ready';
      gate = 'claim and establish another room';
      objectives = 'expand, then run setup gates in the new room';
      progress = 'RCL and GCL gates met';
    }

    const strategy = { mode, gate, objectives, progress, updated: Game.time };
    room.memory.strategy = strategy;
    return strategy;
  };
  // Place extensions only after all current construction targets are finished and RCL permits more.
  const placeExtensionSite = room => {
    if (!room.controller || !room.controller.my ||
        room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) return false;
    const extensionLimit = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
    const extensionCount = room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_EXTENSION
    }).length + room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_EXTENSION
    }).length;
    if (extensionCount >= extensionLimit) return false;

    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return false;
    const terrain = room.getTerrain();
    const roads = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD
    });
    const sources = room.find(FIND_SOURCES);
    const candidates = [];

    for (let x = spawn.pos.x - 5; x <= spawn.pos.x + 5; x++) {
      for (let y = spawn.pos.y - 5; y <= spawn.pos.y + 5; y++) {
        const range = spawn.pos.getRangeTo(x, y);
        // Keep spawn-adjacent worker tiles clear and prefer sites near existing roads.
        if (x < 0 || x > 49 || y < 0 || y > 49 || range < 2 || range > 5 ||
            terrain.get(x, y) === TERRAIN_MASK_WALL ||
            (room.controller.pos.getRangeTo(x, y) < 2) ||
            sources.some(source => source.pos.getRangeTo(x, y) < 2) ||
            room.lookForAt(LOOK_STRUCTURES, x, y).length > 0 ||
            room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0 ||
            room.lookForAt(LOOK_CREEPS, x, y).length > 0) continue;
        const roadAdjacent = roads.some(road => road.pos.getRangeTo(x, y) <= 1);
        candidates.push({ x, y, score: range * 2 - (roadAdjacent ? 1 : 0) });
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    for (const candidate of candidates) {
      const result = room.createConstructionSite(
        candidate.x, candidate.y, STRUCTURE_EXTENSION);
      if (result === OK) {
        console.log(`[${Game.time}] Placed extension site in ${room.name} at ${candidate.x},${candidate.y}`);
        return true;
      }
    }
    return false;
  };
  const getSpawnAssignment = (room, workers) => {
    // Fill upgrader, container-miner, and source-harvester roles before adding haulers.
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
    const { minerLimit } = getWorkerLimits(room);
    const sourceWorkerCount = workers.filter(creep =>
      creep.memory.role === 'miner' || creep.memory.role === 'harvester').length;
    const missingSource = sourceContainers.find(entry =>
      entry.station &&
      !workers.some(creep => creep.memory.minerSource === entry.source.id));
    if (missingSource && sourceWorkerCount < minerLimit) {
      const availableMiner = workers.find(creep => !creep.spawning &&
        (creep.memory.role === 'worker' || creep.memory.role === 'harvester'));
      if (availableMiner) return null;
      return {
        role: 'miner',
        source: missingSource.source,
        container: missingSource.container,
        station: missingSource.station
      };
    }
    const availableHarvester = workers.some(creep => !creep.spawning &&
      creep.memory.role === 'worker');
    if (sourceWorkerCount < minerLimit) {
      return availableHarvester ? null : { role: 'harvester' };
    }
    return { role: 'hauler' };
  };

  const spawnedRooms = {};
  for (const spawn of Object.values(Game.spawns)) {
    if (spawnedRooms[spawn.room.name]) continue;
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
        spawnedRooms[spawn.room.name] = true;
        const cost = body.reduce((total, part) => total + BODYPART_COST[part], 0);
        console.log(`[${Game.time}] Spawning ${name} (${assignment.role}, ${cost} energy): ${getBodyCode(body)}`);
      }
    }
  }

  const ownedRooms = new Set(Object.values(Game.spawns).map(spawn => spawn.room.name));
  for (const roomName of ownedRooms) {
    placeExtensionSite(Game.rooms[roomName]);
  }

  const reservedEnergy = {};
  const reservedCapacity = {};
  const reservedDrops = {};
  const urgentUpgradeAssigned = {};
  const reservedHarvestSpots = {};
  const creeps = Object.values(Game.creeps).filter(creep => !creep.spawning);
  const roomUpgraders = {};
  const assignedCreeps = {};

  for (const creep of creeps) {
    if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'upgrader' && !roomUpgraders[creep.room.name]) {
      roomUpgraders[creep.room.name] = creep;
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'hauler') {
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
    }

    const { minerLimit } = getWorkerLimits(room);
    let sourceWorkerCount = roomCreeps.filter(creep =>
      creep.memory.role === 'miner' || creep.memory.role === 'harvester').length;
    for (const creep of roomCreeps) {
      if (creep === roomUpgraders[room.name]) {
        creep.memory.role = 'upgrader';
      } else if (!assignedCreeps[creep.name]) {
        if (sourceWorkerCount < minerLimit) {
          creep.memory.role = 'harvester';
          sourceWorkerCount++;
        } else {
          creep.memory.role = 'hauler';
        }
        assignedCreeps[creep.name] = true;
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
      if (creep.memory.minerSource && Number.isInteger(creep.memory.minerX) &&
          Number.isInteger(creep.memory.minerY)) {
        const key = `${creep.memory.minerSource}:${creep.memory.minerX}:${creep.memory.minerY}`;
        reservedHarvestSpots[key] = creep.name;
      }
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
      delete creep.memory.withdrawTarget;
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
        // Once room energy is full, haulers spend their load advancing the controller.
        name: 'upgrade',
        run: () => creep.memory.role === 'hauler' && controller && controller.my
          ? perform(controller, target => creep.upgradeController(target))
          : false
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
        // Prefer live source energy; the slot finder returns null when no safe spot is available.
        name: 'harvest',
        run: () => {
          if (creep.memory.role === 'hauler') return false;
          const assignment = findHarvestAssignment(creep);
          if (!assignment) return false;
          creep.memory.taskTarget = `${assignment.source.id}@${assignment.x},${assignment.y}`;
          if (creep.pos.x !== assignment.x || creep.pos.y !== assignment.y) {
            creep.moveTo(new RoomPosition(assignment.x, assignment.y, creep.room.name));
            return true;
          }
          return perform(assignment.source, target => creep.harvest(target));
        }
      },
      {
        name: 'withdraw',
        run: () => {
          // Keep the selected container while traveling so changing availability cannot reverse the trip.
          let container = Game.getObjectById(creep.memory.withdrawTarget);
          if (!container || container.structureType !== STRUCTURE_CONTAINER ||
              container.store[RESOURCE_ENERGY] - (reservedEnergy[container.id] || 0) <= 0) {
            delete creep.memory.withdrawTarget;
            container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
              filter: s => s.structureType === STRUCTURE_CONTAINER &&
                s.store[RESOURCE_ENERGY] - (reservedEnergy[s.id] || 0) > 0
            });
            if (!container) return false;
            creep.memory.withdrawTarget = container.id;
          }
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
    const ownedRooms = new Set(Object.values(Game.spawns)
      .map(spawn => spawn.room.name));
    for (const roomName of ownedRooms) {
      const room = Game.rooms[roomName];
      if (!room) continue;
      const { sourceSpotCounts, sourceSpotTotal, minerLimit, workerLimit } =
        getWorkerLimits(room);
      const strategy = getRoomStrategy(room);
      const roomCreeps = Object.values(Game.creeps)
        .filter(creep => creep.memory.home === room.name);
      const sourceWorkerCount = roomCreeps.filter(creep =>
        creep.memory.role === 'miner' || creep.memory.role === 'harvester').length;
      const haulerCount = roomCreeps.filter(creep => creep.memory.role === 'hauler').length;
      const sources = room.find(FIND_SOURCES).map((source, index) =>
        `source ${index + 1}: ${sourceSpotCounts[source.id] || 0} spots`);
      const spawns = Object.values(Game.spawns)
        .filter(spawn => spawn.room.name === room.name)
        .map(spawn => `${spawn.name} ${spawn.spawning ? 'busy' : 'idle'}`);
      const blockers = [];
      if (sourceWorkerCount >= minerLimit) blockers.push('miner cap reached; haulers may still spawn');
      if (roomCreeps.length >= workerLimit) blockers.push('room hard cap reached');
      if (spawns.every(status => status.endsWith('busy'))) blockers.push('all spawns busy');
      if (room.energyAvailable < workerCost) {
        blockers.push(`energy below worker cost (${workerCost})`);
      }
      const status = blockers.length ? blockers.join(', ') : 'eligible to spawn';
      console.log([
        `[${Game.time}] ${room.name}`,
        `  mode: ${strategy.mode} (${strategy.progress})`,
        `  goals: ${strategy.objectives}`,
        `  next gate: ${strategy.gate}`,
        `  sources: ${sources.join(', ') || 'none'} (${sourceSpotTotal} total spots)`,
        `  miners/harvesters: ${sourceWorkerCount}/${minerLimit}; haulers: ${haulerCount}`,
        `  room creeps: ${roomCreeps.length}/${workerLimit}; spawns: ${spawns.join(', ') || 'none'}`,
        `  energy: ${room.energyAvailable}/${room.energyCapacityAvailable} (worker cost: ${workerCost})`,
        `  spawn status: ${status}`
      ].join('\n'));
    }
  }
};
