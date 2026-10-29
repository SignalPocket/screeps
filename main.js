'use strict';

// A small bootstrap colony: workers harvest, refill, build, and upgrade.
module.exports.loop = function () {
  if (!Memory.creeps) Memory.creeps = {};

  const workerBody = [WORK, CARRY, MOVE];
  const workerCost = workerBody.reduce((total, part) => total + BODYPART_COST[part], 0);
  const sourceWorkerTarget = 5;
  const builderTarget = 3;
  const fixerTarget = 1;
  const haulerTarget = 3;
  const remoteScoutTarget = 2;
  const remoteHaulerTarget = 4;
  const remoteBuilderTarget = 2;
  const southMinerTarget = 2;
  const southHaulerTarget = 4;
  const southBuilderTarget = 2;
  const southwestMinerTarget = 2;
  const southwestHaulerTarget = 4;
  const southwestBuilderTarget = 2;
  const expansionBuilderTarget = 2;
  const roadsPaused = room => !room.controller || room.controller.level <= 2;
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
  const getBodyCode = parts => {
    const types = parts.map(part =>
      typeof part === 'string' ? part : part.type);
    const displayOrder = [MOVE, CARRY, WORK, TOUGH, ATTACK,
      RANGED_ATTACK, HEAL, CLAIM];
    const groups = displayOrder.map(type => {
      const count = types.filter(partType => partType === type).length;
      return count ? (bodyPartCodes[type] || type).repeat(count) : null;
    }).filter(Boolean);
    const unknownTypes = [...new Set(types.filter(type =>
      displayOrder.indexOf(type) === -1))];
    for (const type of unknownTypes) {
      const count = types.filter(partType => partType === type).length;
      groups.push((bodyPartCodes[type] || type).repeat(count));
    }
    return groups.join('-');
  };
  const getObjectLabel = target => {
    if (!target) return null;
    if (target.name) return target.name;
    const room = target.room;
    if (room && target === room.controller) return 'Room Controller';
    if (room && target.energyCapacity !== undefined &&
        target.ticksToRegeneration !== undefined) {
      const sourceIndex = room.find(FIND_SOURCES)
        .findIndex(source => source.id === target.id);
      return sourceIndex >= 0 ? `Source ${sourceIndex + 1}` : 'Source';
    }
    if (target.resourceType && target.amount !== undefined) {
      return `dropped ${target.resourceType} (${target.pos.x},${target.pos.y})`;
    }
    if (target.structureType) {
      if (target.structureType === STRUCTURE_CONTAINER && room) {
        if (room.controller && target.pos.getRangeTo(room.controller) <= 3) {
          return 'Controller container';
        }
        const sourceIndex = room.find(FIND_SOURCES)
          .findIndex(source => source.pos.getRangeTo(target) <= 5);
        if (sourceIndex >= 0) return `Source ${sourceIndex + 1} container`;
      }
      const siteSuffix = target.progressTotal !== undefined ? ' site' : '';
      return `${target.structureType}${siteSuffix} (${target.pos.x},${target.pos.y})`;
    }
    return target.id || null;
  };
  const formatTaskTarget = targetReference => {
    if (!targetReference || typeof targetReference !== 'string') {
      return targetReference || '-';
    }
    const id = targetReference.split(/[\s@()]/)[0];
    const target = Game.getObjectById(id);
    const label = getObjectLabel(target);
    return label ? targetReference.replace(id, label) : targetReference;
  };
  const shortCreepName = name => name
    .replace(/^worker-/, '')
    .replace(/^Spawn/, 'S');
  const shortRoles = {
    miner: 'M',
    harvester: 'Hv',
    hauler: 'Ha',
    builder: 'B',
    digger: 'D',
    fixer: 'F',
    upgrader: 'U',
    'remote-scout': 'Sc',
    'remote-hauler': 'RH',
    'remote-builder': 'RB',
    claimer: 'Cl',
    'expansion-builder': 'EB',
    worker: 'W'
  };
  const shortTasks = {
    'mine-to-container': 'Mine',
    'source-work': 'Src',
    harvest: 'Mine',
    'emergency-refill': 'Fill!',
    'urgent-upgrade': 'RC!',
    upgrade: 'RC',
    scavenge: 'Pick',
    refill: 'Fill',
    build: 'Build',
    'dig-road': 'Dig',
    repair: 'Fix',
    'supply-worker': 'Give',
    'await-supply': 'WaitE',
    'remote-scout': 'Scout',
    'remote-harvest': 'Src',
    'remote-container': 'Cont',
    'remote-haul': 'RHaul',
    'remote-road': 'RBuild',
    claim: 'Claim',
    'expansion-build': 'Expand',
    'stage-supply': 'Stage',
    standby: 'Wait',
    withdraw: 'Get',
    store: 'Store'
  };
  // Movement calls are processed in cargo-first order below. Keep a soft
  // five-step reservation for each route so later creeps can choose another
  // lane before they meet, without making narrow corridors impassable.
  const movementReservations = {};
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
    if (!movementReservations[roomName]) {
      movementReservations[roomName] = {};
    }
    for (const step of decoded.slice(start, start + 5)) {
      movementReservations[roomName][`${step.x}:${step.y}`] = creep.name;
    }
  };
  const moveCreep = (creep, target, range = 1) => {
    const position = target.pos || target;
    if (!position) return ERR_INVALID_TARGET;
    // A work range can geometrically overlap an adjacent room at an exit, but
    // actions such as build cannot cross the room boundary. Enter the target
    // room first, then allow the requested working range on the next tick.
    const targetRoomName = position.roomName || creep.room.name;
    const effectiveRange = targetRoomName === creep.room.name ? range : 0;
    if (creep.memory.navCostVersion !== 'prefer-visible-roads-v2') {
      creep.memory.navCostVersion = 'prefer-visible-roads-v2';
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
    creep.memory.navStuck = samePosition && consecutiveMove && sameGoal
      ? (creep.memory.navStuck || 0) + 1
      : 0;
    const recalculate = creep.memory.navStuck >= 2;
    const carryingCargo = creep.store.getUsedCapacity() > 0;
    const result = creep.moveTo(target, {
      range: effectiveRange,
      reusePath: recalculate ? 0 : carryingCargo ? 10 : 2,
      // Occupied tiles remain traversable so packed creeps can swap instead of
      // deadlocking. Empty creeps receive a soft penalty for loaded traffic.
      ignoreCreeps: !recalculate,
      plainCost: 2,
      swampCost: 10,
      maxOps: 2000,
      costCallback: (roomName, costs) => {
        const visibleRoom = Game.rooms[roomName];
        if (!visibleRoom) return costs;
        for (const road of visibleRoom.find(FIND_STRUCTURES, {
          filter: structure => structure.structureType === STRUCTURE_ROAD
        })) {
          costs.set(road.pos.x, road.pos.y, 1);
        }
        const reservations = movementReservations[roomName] || {};
        for (const key of Object.keys(reservations)) {
          if (reservations[key] === creep.name) continue;
          const [x, y] = key.split(':').map(Number);
          const currentCost = costs.get(x, y);
          if (currentCost < 255) {
            costs.set(x, y, Math.max(currentCost,
              carryingCargo ? 12 : 30));
          }
        }
        if (recalculate || !carryingCargo) {
          for (const other of visibleRoom.find(FIND_MY_CREEPS, {
            filter: candidate => candidate.name !== creep.name &&
              (recalculate || candidate.store.getUsedCapacity() > 0)
          })) {
            const currentCost = costs.get(other.pos.x, other.pos.y);
            if (currentCost < 255) {
              costs.set(other.pos.x, other.pos.y,
                Math.max(currentCost, recalculate ? 20 : 10));
            }
          }
        }
        return costs;
      }
    });
    creep.memory.navGoal = goal;
    creep.memory.navLastX = creep.pos.x;
    creep.memory.navLastY = creep.pos.y;
    creep.memory.navLastRoom = creep.room.name;
    creep.memory.navLastTick = Game.time;
    if (result === OK) reserveUpcomingRoute(creep);
    return result;
  };
  for (const name in Memory.creeps) {
    if (Game.creeps[name]) continue;
    const memory = Memory.creeps[name] || {};
    const role = shortRoles[memory.role] || memory.role || 'W';
    const task = shortTasks[memory.lastTask || memory.task] ||
      memory.lastTask || memory.task || 'Idle';
    const roomName = memory.lastRoom || memory.home || '?';
    const reason = memory.retired
      ? 'RETIRED'
      : memory.lastTtl <= 1 ? 'EXPIRED' : 'DIED';
    console.log(`[${Game.time}] ${reason} ${shortCreepName(name)} ` +
      `${role}/${task} in ${roomName}`);
    delete Memory.creeps[name];
  }
  const buildBody = (role, energy) => {
    if (role === 'claimer') {
      if (energy >= BODYPART_COST[CLAIM] + BODYPART_COST[WORK] +
          BODYPART_COST[CARRY] + BODYPART_COST[MOVE]) {
        return [WORK, CARRY, CLAIM, MOVE];
      }
      if (energy >= BODYPART_COST[CLAIM] + BODYPART_COST[WORK] +
          BODYPART_COST[MOVE]) {
        return [WORK, CLAIM, MOVE];
      }
      // Claiming remains possible during an energy emergency even if the
      // universal WORK floor cannot be afforded.
      return energy >= BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]
        ? [CLAIM, MOVE] : null;
    }
    if (role === 'miner' || role === 'harvester' || role === 'digger' ||
        role === 'remote-scout') {
      // Source workers travel once, then stay put. Give full-size workers two
      // MOVE parts so the trip to their station is not painfully slow, but
      // preserve WORK on small emergency bodies used to restart the room.
      const moveParts = energy >= 350 ? 2 : 1;
      const workParts = Math.min(48,
        Math.floor((energy - BODYPART_COST[CARRY] -
          moveParts * BODYPART_COST[MOVE]) /
          BODYPART_COST[WORK]));
      if (workParts < 1) return null;
      const body = Array(workParts).fill(WORK);
      body.push(CARRY, ...Array(moveParts).fill(MOVE));
      return body;
    }

    if (role === 'hauler' || role === 'remote-hauler') {
      // Every carrier gets WORK/CARRY/MOVE so it can build, repair, upgrade,
      // or temporarily harvest when its logistics lane has no demand.
      const pairCost = BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
      if (energy < workerCost) return null;
      const body = [WORK, CARRY, MOVE];
      let cost = workerCost;
      while (body.length + 2 <= 50 && cost + pairCost <= energy) {
        body.push(CARRY, MOVE);
        cost += pairCost;
      }
      // Use an otherwise stranded 50 energy for more capacity. The paired MOVE
      // parts keep this efficient on the room's roads and acceptable off-road.
      if (body.length < 50 && cost + BODYPART_COST[CARRY] <= energy) {
        body.push(CARRY);
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
    // A single 200-energy module is too slow once it has to travel or carry.
    // Spend the next 50 energy on a second MOVE before adding extra load.
    if (body.filter(part => part === MOVE).length === 1 &&
        body.length < 50 && cost + BODYPART_COST[MOVE] <= energy) {
      body.push(MOVE);
      cost += BODYPART_COST[MOVE];
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
  const hasWorkParts = creep => creep && creep.getActiveBodyparts(WORK) > 0;
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
  const hasRemoteReplacementLife = creep => creep &&
    (creep.spawning || creep.ticksToLive > getRemoteReplacementLead(creep));
  const hasLocalReplacementLife = creep => creep &&
    (creep.spawning || creep.ticksToLive >
      creep.body.length * CREEP_SPAWN_TIME + 50);
  const findMinerStation = (room, source, container, reserved, ignoreCreep, preferred) => {
    // Use a single walkable tile within range one of both the source and container.
    const terrain = room.getTerrain();
    const isAvailable = (x, y) => {
      if (x < 0 || x > 49 || y < 0 || y > 49 ||
          source.pos.getRangeTo(x, y) > 1 || container.pos.getRangeTo(x, y) > 1 ||
          (x === source.pos.x && y === source.pos.y)) return false;
      const key = `${x}:${y}`;
      if (reserved[key]) return false;
      const tileStructures = room.lookForAt(LOOK_STRUCTURES, x, y);
      const completedRoad = tileStructures.some(structure =>
        structure.structureType === STRUCTURE_ROAD);
      if (terrain.get(x, y) === TERRAIN_MASK_WALL && !completedRoad) {
        return false;
      }
      const blocked = tileStructures.some(structure =>
        OBSTACLE_OBJECT_TYPES.includes(structure.structureType) &&
        !(structure.structureType === STRUCTURE_RAMPART &&
          (structure.my || structure.isPublic)));
      if (blocked) return false;
      return !room.lookForAt(LOOK_CREEPS, x, y)
        .some(creep => creep.name !== ignoreCreep);
    };

    if (preferred && Number.isInteger(preferred.x) &&
        Number.isInteger(preferred.y) &&
        isAvailable(preferred.x, preferred.y)) return preferred;
    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
      for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
        if (x === source.pos.x && y === source.pos.y) continue;
        if (isAvailable(x, y)) return { x, y };
      }
    }
    return null;
  };
  const getSource2TunnelSite = room => {
    const source = room.find(FIND_SOURCES)[1];
    if (!source) return null;
    return room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_ROAD &&
        site.progressTotal > 300 && source.pos.getRangeTo(site) <= 2
    }).sort((a, b) => source.pos.getRangeTo(a) -
      source.pos.getRangeTo(b))[0] || null;
  };
  const roomSituationCache = {};
  const getRoomSituation = room => {
    const cached = roomSituationCache[room.name];
    if (cached) return cached;
    const sources = room.find(FIND_SOURCES);
    const containers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
        sources.some(source => source.pos.getRangeTo(structure) <= 2)
    });
    const bufferRatios = containers.map(container => {
      const capacity = container.store.getCapacity(RESOURCE_ENERGY) || 1;
      return container.store[RESOURCE_ENERGY] / capacity;
    });
    const bufferRatio = bufferRatios.length
      ? Math.max(...bufferRatios)
      : 0;
    const storedSourceEnergy = containers.reduce((total, container) =>
      total + container.store[RESOURCE_ENERGY], 0);
    // Long source routes need more than the static carrier floor. Add up to
    // three local haulers while source buffers are materially backed up.
    const haulingSurge = bufferRatio >= 0.75
      ? Math.min(3, Math.ceil(storedSourceEnergy / 1000))
      : bufferRatio >= 0.5 ? 1 : 0;
    const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
      filter: resource => resource.resourceType === RESOURCE_ENERGY
    }).reduce((total, resource) => total + resource.amount, 0);
    const energyRatio = room.energyCapacityAvailable > 0
      ? room.energyAvailable / room.energyCapacityAvailable
      : 0;
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => !roadsPaused(room) ||
        site.structureType !== STRUCTURE_ROAD
    });
    const buildRemaining = sites.reduce((total, site) =>
      total + site.progressTotal - site.progress, 0);
    const repairCrisis = room.find(FIND_STRUCTURES, {
      filter: structure => structure.hitsMax > 0 &&
        structure.hits < structure.hitsMax * 0.35 &&
        (structure.my || structure.structureType === STRUCTURE_CONTAINER) &&
        (!roadsPaused(room) || structure.structureType !== STRUCTURE_ROAD) &&
        structure.structureType !== STRUCTURE_WALL &&
        structure.structureType !== STRUCTURE_RAMPART
    }).length > 0;
    const controllerDanger = room.controller && room.controller.my &&
      room.controller.ticksToDowngrade < 3000;
    let mode = sites.length ? 'construction' : 'stable';
    // Stable roster: room conditions change task priority, not creep identity.
    // Builders and the fixer fall back to RC work when their primary work is absent.
    const targets = {
      source: sourceWorkerTarget,
      builder: builderTarget,
      fixer: fixerTarget,
      upgrader: sites.length === 0 && bufferRatio >= 0.8 ? 2 : 1,
      hauler: haulerTarget + (room.controller &&
        room.controller.level >= 3 ? 1 : 0) + haulingSurge,
      digger: getSource2TunnelSite(room) ? 1 : 0
    };
    if (controllerDanger) {
      mode = 'controller-emergency';
    } else if (repairCrisis) {
      mode = 'repair-crisis';
    } else if (bufferRatio >= 0.8 || droppedEnergy >= 500) {
      mode = 'logistics-backup';
    } else if (energyRatio < 0.35 && bufferRatio < 0.25) {
      mode = 'energy-starved';
    }
    const situation = {
      mode,
      targets,
      signals: {
        energyRatio,
        bufferRatio,
        droppedEnergy,
        buildRemaining,
        controllerTicks: room.controller && room.controller.ticksToDowngrade
      }
    };
    roomSituationCache[room.name] = situation;
    return situation;
  };
  const getBuilderTarget = room => getRoomSituation(room).targets.builder;
  const getSourceSpotCount = (room, source) => {
    const terrain = room.getTerrain();
    let spots = 0;
    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
      for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
        if (x < 0 || x > 49 || y < 0 || y > 49 ||
            (x === source.pos.x && y === source.pos.y) ||
            terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        const blocked = room.lookForAt(LOOK_STRUCTURES, x, y).some(structure =>
          OBSTACLE_OBJECT_TYPES.includes(structure.structureType));
        const blockedSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)
          .some(site => OBSTACLE_OBJECT_TYPES.includes(site.structureType));
        if (!blocked && !blockedSite) spots++;
      }
    }
    return spots;
  };
  const getSourceBodyWorkCapacity = room => {
    const moveParts = room.energyCapacityAvailable >= 350 ? 2 : 1;
    return Math.max(1, Math.floor(
      (room.energyCapacityAvailable - BODYPART_COST[CARRY] -
        moveParts * BODYPART_COST[MOVE]) / BODYPART_COST[WORK]));
  };
  const reviewSourceStaffing = (stats, source, options) => {
    const minimum = Math.max(1, options.minimum || 1);
    const maximum = Math.max(minimum, options.maximum || minimum);
    if (!Number.isInteger(stats.targetMiners)) {
      stats.targetMiners = Math.max(minimum,
        Math.min(maximum, options.initialTarget || minimum));
    }
    if (!Number.isInteger(stats.windowStarted)) {
      stats.windowStarted = Game.time;
    }
    if (stats.lastSampleTick !== Game.time) {
      stats.lastSampleTick = Game.time;
      stats.sampleTicks = (stats.sampleTicks || 0) + 1;
      if (source.energy === 0 && source.ticksToRegeneration > 60) {
        stats.earlyEmptyTicks = (stats.earlyEmptyTicks || 0) + 1;
      }
      if (source.energy >= source.energyCapacity * 0.9) {
        stats.highEnergyTicks = (stats.highEnergyTicks || 0) + 1;
      }
      if (Number.isFinite(stats.lastEnergy) && stats.lastEnergy > 0 &&
          source.energy > stats.lastEnergy + source.energyCapacity * 0.5) {
        stats.regeneratedWithEnergy =
          (stats.regeneratedWithEnergy || 0) + 1;
      }
      stats.lastEnergy = source.energy;
    }
    if (Game.time - stats.windowStarted >= 1000) {
      const previous = stats.targetMiners;
      const tooMany = (stats.earlyEmptyTicks || 0) >= 60;
      const tooFew = (stats.regeneratedWithEnergy || 0) > 0 ||
        (stats.highEnergyTicks || 0) >= 150;
      if (tooMany && stats.targetMiners > minimum) stats.targetMiners--;
      else if (tooFew && stats.targetMiners < maximum) stats.targetMiners++;
      const result = stats.targetMiners < previous ? 'fewer' :
        stats.targetMiners > previous ? 'more' : 'stable';
      console.log(`[${Game.time}] ${options.label} 1000-tick mining review: ` +
        `${result}, harvesters ${stats.targetMiners}/${maximum}, ` +
        `early-empty ${stats.earlyEmptyTicks || 0}, ` +
        `high-energy ${stats.highEnergyTicks || 0}, ` +
        `partial-regens ${stats.regeneratedWithEnergy || 0}`);
      stats.lastReviewTick = Game.time;
      stats.windowStarted = Game.time;
      stats.sampleTicks = 0;
      stats.earlyEmptyTicks = 0;
      stats.highEnergyTicks = 0;
      stats.regeneratedWithEnergy = 0;
    }
    return Math.max(minimum, Math.min(maximum, stats.targetMiners));
  };
  const getSourceWorkerTargets = (room, sourceSpotCounts) => {
    if (!room.memory.sourceMiningStats) room.memory.sourceMiningStats = {};
    const maxWorkPerBody = getSourceBodyWorkCapacity(room);
    const targets = {};
    for (const source of room.find(FIND_SOURCES)) {
      const stats = room.memory.sourceMiningStats[source.id] ||
        { earlyExhaustions: 0 };
      if (source.energy === 0 && source.ticksToRegeneration > 50) {
        const cycle = Game.time + source.ticksToRegeneration;
        if (stats.lastEarlyCycle !== cycle) {
          stats.lastEarlyCycle = cycle;
          stats.earlyExhaustions = (stats.earlyExhaustions || 0) + 1;
        }
      }
      room.memory.sourceMiningStats[source.id] = stats;
      const spots = sourceSpotCounts[source.id] || 0;
      const requiredWork = Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER);
      const efficientBodies = Math.max(1,
        Math.ceil(requiredWork / maxWorkPerBody));
      const initialTarget = stats.earlyExhaustions >= 2
        ? Math.min(spots, efficientBodies)
        : spots;
      targets[source.id] = reviewSourceStaffing(stats, source, {
        initialTarget,
        minimum: Math.min(spots, efficientBodies),
        maximum: spots,
        label: `${room.name} S${room.find(FIND_SOURCES).indexOf(source) + 1}`
      });
    }
    return targets;
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
              y < 0 || y > 49) continue;
          const tileStructures = room.lookForAt(LOOK_STRUCTURES, x, y);
          const completedTunnelRoad = tileStructures.some(structure =>
            structure.structureType === STRUCTURE_ROAD);
          if (terrain.get(x, y) === TERRAIN_MASK_WALL &&
              !completedTunnelRoad) continue;
          const blocked = tileStructures.some(structure =>
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
    const minerLimit = Math.min(20, sourceSpotTotal);
    const sourceWorkerTargets = getSourceWorkerTargets(room, sourceSpotCounts);
    const sourceWorkerTargetTotal = Object.values(sourceWorkerTargets)
      .reduce((total, count) => total + count, 0);
    const targets = getRoomSituation(room).targets;
    const localWorkerMinimum = sourceWorkerTargetTotal +
      targets.builder + targets.fixer + targets.upgrader + targets.hauler +
      targets.digger;
    // Every actively worked remote room adds its own permanent workforce to
    // the home room's floor. Remote miners/builders/haulers must not displace
    // the local roster just because they share the same spawn.
    const countedRemoteRooms = new Set();
    let remoteWorkerMinimum = 0;
    for (const plan of Object.values(room.memory)) {
      if (!plan || typeof plan !== 'object' || !plan.active ||
          !plan.targetRoom || countedRemoteRooms.has(plan.targetRoom)) continue;
      countedRemoteRooms.add(plan.targetRoom);
      const needs = Array.isArray(plan.remoteWorkNeeds)
        ? plan.remoteWorkNeeds : [];
      const remoteMiners = needs.length > 0
        ? needs.reduce((total, need) => total +
          Math.max(1, need.minMiners || 0), 0)
        : (plan.remoteMinerTarget || remoteScoutTarget);
      remoteWorkerMinimum += remoteMiners +
        (plan.remoteBuilderTarget || remoteBuilderTarget) +
        (plan.remoteHaulerTarget || remoteHaulerTarget);
    }
    const minimumWorkerLimit = localWorkerMinimum + remoteWorkerMinimum;
    let savedWorkerTarget = Number.isInteger(room.memory.workerTarget)
      ? room.memory.workerTarget
      : minimumWorkerLimit;
    // Congestion is a routing problem, not a reason to discard useful labor.
    // Preserve at least the live population when migrating away from the old
    // congestion response that reduced the room target.
    if (room.memory.populationRoutingVersion !== 'active-v3') {
      // Restore the four-worker operating buffer that existed before the old
      // congestion response cut this room from 17 workers to its minimum 13.
      const operatingPopulation = minimumWorkerLimit + 4;
      savedWorkerTarget = Math.max(savedWorkerTarget,
        room.find(FIND_MY_CREEPS).length, operatingPopulation);
      room.memory.workerTarget = savedWorkerTarget;
      room.memory.populationRoutingVersion = 'active-v3';
    }
    savedWorkerTarget = Math.max(savedWorkerTarget, minimumWorkerLimit);
    room.memory.workerTarget = savedWorkerTarget;
    const congestionCount = room.find(FIND_MY_CREEPS).filter(creep =>
      (creep.memory.navStuck || 0) >= 2 &&
      creep.memory.navLastTick >= Game.time - 1).length;
    room.memory.congestionCount = congestionCount;
    return {
      sourceSpotCounts,
      sourceWorkerTargets,
      sourceWorkerTargetTotal,
      sourceSpotTotal,
      minerLimit,
      localWorkerMinimum,
      remoteWorkerMinimum,
      minimumWorkerLimit,
      workerLimit: Math.max(minimumWorkerLimit, savedWorkerTarget)
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
  // Pack extensions in adjacent two-wide columns. Every pair borders a
  // reserved access aisle, so haulers can still reach every structure.
  const isExtensionClusterTile = (cluster, x, y) => {
    const dx = x - cluster.x;
    const dy = y - cluster.y;
    return Math.max(Math.abs(dx), Math.abs(dy)) <= 3 &&
      (dx + 3) % 3 !== 2;
  };
  // Keep up to three extension sites active whenever the RCL unlocks more.
  // Roads and remote construction must not block core room capacity upgrades.
  const placeExtensionSite = room => {
    if (!room.controller || !room.controller.my) return false;
    const extensionLimit = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
    const builtExtensions = room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_EXTENSION
    }).length;
    const extensionSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_EXTENSION
    });
    const extensionCount = builtExtensions + extensionSites.length;
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return false;
    const terrain = room.getTerrain();
    const sources = room.find(FIND_SOURCES);
    const trafficTiles = room.memory.traffic && room.memory.traffic.tiles || {};
    const usableExtensionTile = (x, y) => x > 1 && x < 48 && y > 1 && y < 48 &&
      terrain.get(x, y) !== TERRAIN_MASK_WALL &&
      room.controller.pos.getRangeTo(x, y) >= 2 &&
      !sources.some(source => source.pos.getRangeTo(x, y) < 2) &&
      !isSingleLaneRoadPosition(room, { pos: { x, y } }) &&
      room.lookForAt(LOOK_STRUCTURES, x, y).length === 0 &&
      room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length === 0;
    let cluster = room.memory.extensionCluster;
    if (!cluster || cluster.version !== 'low-traffic-v1') {
      const anchors = [];
      for (let x = spawn.pos.x - 9; x <= spawn.pos.x + 9; x++) {
        for (let y = spawn.pos.y - 9; y <= spawn.pos.y + 9; y++) {
          const range = spawn.pos.getRangeTo(x, y);
          if (range < 6 || range > 9 || x < 4 || x > 45 || y < 4 || y > 45) {
            continue;
          }
          let usable = 0;
          let traffic = 0;
          let corridor = 0;
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
              const tileX = x + dx;
              const tileY = y + dy;
              if (!isExtensionClusterTile({ x, y }, tileX, tileY)) continue;
              if (usableExtensionTile(tileX, tileY)) usable++;
              traffic += trafficTiles[`${tileX}:${tileY}`] || 0;
              if (isSingleLaneRoadPosition(room,
                { pos: { x: tileX, y: tileY } })) corridor++;
            }
          }
          if (usable < 10) continue;
          anchors.push({
            x,
            y,
            score: traffic * 20 + corridor * 200 +
              Math.abs(range - 7) * 5 - usable
          });
        }
      }
      anchors.sort((a, b) => a.score - b.score ||
        a.x - b.x || a.y - b.y);
      if (anchors.length) {
        cluster = {
          x: anchors[0].x,
          y: anchors[0].y,
          version: 'low-traffic-v1',
          selected: Game.time
        };
        room.memory.extensionCluster = cluster;
        console.log(`[${Game.time}] ${room.name} extension cluster -> ` +
          `${cluster.x},${cluster.y}`);
      }
    }
    if (extensionCount >= extensionLimit || !cluster) return false;
    if (extensionSites.length >= Math.min(3,
      extensionLimit - builtExtensions)) return false;

    const candidates = [];
    for (let radius = 0; radius <= 3; radius++) {
      for (let x = cluster.x - radius; x <= cluster.x + radius; x++) {
        for (let y = cluster.y - radius; y <= cluster.y + radius; y++) {
          if (Math.max(Math.abs(x - cluster.x), Math.abs(y - cluster.y)) !==
              radius || !isExtensionClusterTile(cluster, x, y) ||
              !usableExtensionTile(x, y) ||
              room.lookForAt(LOOK_CREEPS, x, y).length > 0) continue;
          candidates.push({
            x,
            y,
            score: (trafficTiles[`${x}:${y}`] || 0) * 20 +
              radius * 2 + x / 100 + y / 10000
          });
        }
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
  const migrateExtensionsToCluster = room => {
    const cluster = room.memory.extensionCluster;
    if (!cluster || cluster.version !== 'low-traffic-v1' ||
        !room.controller || !room.controller.my) return false;
    const extensionLimit = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION]
      [room.controller.level] || 0;
    const built = room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_EXTENSION
    });
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_EXTENSION
    });
    // Never remove another extension until the previous replacement is fully
    // built and the room is back at its complete extension count.
    if (sites.length > 0) {
      const site = sites[0];
      room.memory.extensionMigration = {
        ...(room.memory.extensionMigration || {}),
        status: 'rebuilding',
        siteId: site.id,
        siteX: site.pos.x,
        siteY: site.pos.y,
        progress: site.progress,
        progressTotal: site.progressTotal,
        clusterX: cluster.x,
        clusterY: cluster.y
      };
      return false;
    }
    if (built.length < extensionLimit) {
      room.memory.extensionMigration = {
        ...(room.memory.extensionMigration || {}),
        status: 'awaiting-site',
        clusterX: cluster.x,
        clusterY: cluster.y
      };
      return false;
    }
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn || spawn.spawning ||
        room.energyAvailable < room.energyCapacityAvailable) return false;
    const inCluster = extension => isExtensionClusterTile(cluster,
      extension.pos.x, extension.pos.y);
    const trafficTiles = room.memory.traffic && room.memory.traffic.tiles || {};
    const oldExtensions = built.filter(extension => !inCluster(extension))
      .sort((a, b) =>
        (trafficTiles[`${b.pos.x}:${b.pos.y}`] || 0) -
          (trafficTiles[`${a.pos.x}:${a.pos.y}`] || 0) ||
        a.id.localeCompare(b.id));
    if (!oldExtensions.length) {
      room.memory.extensionMigration = {
        status: 'complete',
        completed: Game.time,
        clusterX: cluster.x,
        clusterY: cluster.y
      };
      return false;
    }
    const extension = oldExtensions[0];
    const result = extension.destroy();
    if (result !== OK) return false;
    room.memory.extensionMigration = {
      status: 'replacing',
      destroyed: Game.time,
      oldX: extension.pos.x,
      oldY: extension.pos.y,
      clusterX: cluster.x,
      clusterY: cluster.y,
      remaining: oldExtensions.length - 1
    };
    console.log(`[${Game.time}] ${room.name} moving extension ` +
      `${extension.pos.x},${extension.pos.y} -> cluster ` +
      `${cluster.x},${cluster.y}; one-at-a-time`);
    return true;
  };
  const getContainerPurpose = (room, position) => {
    const source = room.find(FIND_SOURCES).find(candidate =>
      candidate.pos.getRangeTo(position) <= 1);
    if (source) return `source:${source.id}`;
    if (room.controller && room.controller.pos.getRangeTo(position) <= 3) {
      return 'controller';
    }
    return null;
  };
  const placeSourceContainerSite = room => {
    if (!room.controller || !room.controller.my || room.controller.level < 2) {
      return false;
    }
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    const terrain = room.getTerrain();
    for (const source of room.find(FIND_SOURCES)) {
      const hasContainer = source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER
      }).length > 0;
      const hasContainerSite = source.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {
        filter: site => site.structureType === STRUCTURE_CONTAINER
      }).length > 0;
      if (hasContainer || hasContainerSite) continue;

      const candidates = [];
      for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
        for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
          if ((x === source.pos.x && y === source.pos.y) || x < 0 || x > 49 ||
              y < 0 || y > 49 || terrain.get(x, y) === TERRAIN_MASK_WALL ||
              room.lookForAt(LOOK_STRUCTURES, x, y).length > 0 ||
              room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
          let coverage = 0;
          for (let spotX = source.pos.x - 1; spotX <= source.pos.x + 1; spotX++) {
            for (let spotY = source.pos.y - 1; spotY <= source.pos.y + 1; spotY++) {
              if (spotX >= 0 && spotX <= 49 && spotY >= 0 && spotY <= 49 &&
                  (spotX !== source.pos.x || spotY !== source.pos.y) &&
                  terrain.get(spotX, spotY) !== TERRAIN_MASK_WALL &&
                  Math.max(Math.abs(x - spotX), Math.abs(y - spotY)) <= 1) {
                coverage++;
              }
            }
          }
          candidates.push({
            x,
            y,
            coverage,
            range: spawn ? spawn.pos.getRangeTo(x, y) : 0
          });
        }
      }
      candidates.sort((a, b) => b.coverage - a.coverage || a.range - b.range);
      for (const candidate of candidates) {
        const result = room.createConstructionSite(
          candidate.x, candidate.y, STRUCTURE_CONTAINER);
        if (result === OK) {
          console.log(`[${Game.time}] Placed source container site in ${room.name} at ${candidate.x},${candidate.y}`);
          return true;
        }
      }
    }
    return false;
  };
  const manageControllerContainer = room => {
    if (!room.controller || !room.controller.my || room.controller.level < 2) {
      return false;
    }
    const controllerContainer = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
        structure.pos.getRangeTo(room.controller) <= 3
    })[0];
    const controllerSite = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_CONTAINER &&
        site.pos.getRangeTo(room.controller) <= 3
    })[0];
    if (controllerContainer || controllerSite) {
      room.memory.controllerContainerPlan = {
        ready: Boolean(controllerContainer),
        siteId: controllerSite && controllerSite.id,
        containerId: controllerContainer && controllerContainer.id
      };
      return true;
    }

    const containers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    });
    const containerLimit = CONTROLLER_STRUCTURES[STRUCTURE_CONTAINER]
      [room.controller.level] || 0;
    let plan = room.memory.controllerContainerPlan;
    if (!plan || (!plan.retireContainerId && !plan.retired)) {
      if (containers.length < containerLimit) {
        plan = { retired: true, ready: false };
      } else {
        const essential = new Set(containers
          .filter(container => getContainerPurpose(room, container.pos))
          .map(container => container.id));
        const trafficTiles = room.memory.traffic && room.memory.traffic.tiles || {};
        const excess = containers
          .filter(container => !essential.has(container.id))
          .sort((a, b) =>
            (trafficTiles[`${a.pos.x}:${a.pos.y}`] || 0) -
              (trafficTiles[`${b.pos.x}:${b.pos.y}`] || 0) ||
            a.id.localeCompare(b.id));
        if (!excess.length) return false;
        plan = {
          ready: false,
          retired: false,
          retireContainerId: excess[0].id,
          retireX: excess[0].pos.x,
          retireY: excess[0].pos.y
        };
        console.log(`[${Game.time}] ${room.name} draining excess container ` +
          `${excess[0].id} at ${excess[0].pos.x},${excess[0].pos.y} ` +
          `for controller container replacement`);
      }
      room.memory.controllerContainerPlan = plan;
    }

    const retiring = Game.getObjectById(plan.retireContainerId);
    if (retiring) {
      if (getContainerPurpose(room, retiring.pos)) {
        delete plan.retireContainerId;
        delete plan.drainCreep;
        plan.retired = false;
        console.log(`[${Game.time}] ${room.name} kept important container at ` +
          `${retiring.pos.x},${retiring.pos.y}`);
        return false;
      }
      if (retiring.store[RESOURCE_ENERGY] > 0) {
        const currentDrainer = Game.creeps[plan.drainCreep];
        const drainers = Object.values(Game.creeps)
          .filter(creep => creep.memory.home === room.name &&
            creep.memory.role === 'hauler' && !creep.spawning)
          .sort((a, b) =>
            b.store.getCapacity(RESOURCE_ENERGY) -
              a.store.getCapacity(RESOURCE_ENERGY) ||
            a.pos.getRangeTo(retiring) - b.pos.getRangeTo(retiring));
        const emptyDrainer = drainers.find(creep =>
          creep.store[RESOURCE_ENERGY] === 0);
        if (emptyDrainer && currentDrainer !== emptyDrainer) {
          plan.drainCreep = emptyDrainer.name;
        } else if (!currentDrainer ||
            currentDrainer.memory.role !== 'hauler') {
          plan.drainCreep = drainers[0] && drainers[0].name;
        }
        return false;
      }
      const result = retiring.destroy();
      if (result !== OK) return false;
      plan.retired = true;
      delete plan.retireContainerId;
      delete plan.drainCreep;
      console.log(`[${Game.time}] ${room.name} removed drained excess container ` +
        `at ${plan.retireX},${plan.retireY}`);
      return true;
    }
    if (!plan.retired) return false;

    const spawn = room.find(FIND_MY_SPAWNS)[0];
    const terrain = room.getTerrain();
    const candidates = [];
    for (let x = room.controller.pos.x - 3;
      x <= room.controller.pos.x + 3; x++) {
      for (let y = room.controller.pos.y - 3;
        y <= room.controller.pos.y + 3; y++) {
        const range = room.controller.pos.getRangeTo(x, y);
        if (x < 0 || x > 49 || y < 0 || y > 49 || range < 1 || range > 3 ||
            terrain.get(x, y) === TERRAIN_MASK_WALL ||
            room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0 ||
            room.lookForAt(LOOK_STRUCTURES, x, y).some(structure =>
              structure.structureType !== STRUCTURE_ROAD &&
              structure.structureType !== STRUCTURE_RAMPART)) continue;
        candidates.push({
          x,
          y,
          score: (spawn ? spawn.pos.getRangeTo(x, y) : 0) +
            (terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 10 : 0)
        });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const candidate of candidates) {
      const result = room.createConstructionSite(
        candidate.x, candidate.y, STRUCTURE_CONTAINER);
      if (result === OK) {
        plan.siteX = candidate.x;
        plan.siteY = candidate.y;
        console.log(`[${Game.time}] ${room.name} controller container site ` +
          `placed at ${candidate.x},${candidate.y}`);
        return true;
      }
    }
    return false;
  };
  const isRetiringContainer = (room, structure) =>
    Boolean(room.memory.controllerContainerPlan &&
      room.memory.controllerContainerPlan.retireContainerId === structure.id);
  const getImportantRoadPaths = room => {
    const spawn = room.find(FIND_MY_SPAWNS)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!spawn) return [];
    const sources = room.find(FIND_SOURCES);
    const targets = [
      ...sources.map(source => ({ label: 'source', object: source })),
      ...(room.controller ? [{ label: 'controller', object: room.controller }] : []),
      ...(room.storage ? [{ label: 'storage', object: room.storage }] : [])
    ];
    const signature = ['v2', spawn.id,
      ...targets.map(target => target.object.id)].join(':');
    const cached = room.memory.roadPlan;
    if (cached && cached.signature === signature &&
        Game.time - cached.updated < 1000 && Array.isArray(cached.paths)) {
      return cached.paths;
    }

    const findPath = (origin, destination) => room.findPath(origin, destination, {
      ignoreCreeps: true,
      range: 1,
      plainCost: 2,
      swampCost: 10,
      maxOps: 4000,
      maxRooms: 1
    }).map(step => ({ x: step.x, y: step.y }));
    const paths = targets.map(target => ({
      label: target.label,
      targetId: target.object.id,
      points: findPath(spawn.pos, target.object.pos)
    }));
    if (room.controller) {
      for (const source of sources) {
        paths.push({
          label: 'source-controller',
          targetId: room.controller.id,
          sourceId: source.id,
          points: findPath(source.pos, room.controller.pos)
        });
      }
    }
    const usablePaths = paths.filter(path => path.points.length > 0);
    room.memory.roadPlan = { signature, updated: Game.time, paths: usablePaths };
    return usablePaths;
  };
  const isSingleLaneRoadPosition = (room, target) => {
    if (!target || !target.pos) return false;
    return getImportantRoadPaths(room).some(path => path.points.some(point =>
      point.x === target.pos.x && point.y === target.pos.y));
  };
  const heatmapRoadTileCache = {};
  const getHeatmapRoadTiles = room => {
    if (heatmapRoadTileCache[room.name]) {
      return heatmapRoadTileCache[room.name];
    }
    const trafficTiles = room.memory.traffic && room.memory.traffic.tiles || {};
    const tiles = new Set(Object.entries(trafficTiles)
      .filter(([, visits]) => visits >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([key]) => key));
    heatmapRoadTileCache[room.name] = tiles;
    return tiles;
  };
  const isHeatmapRoadPosition = (room, target) => target && target.pos &&
    getHeatmapRoadTiles(room).has(`${target.pos.x}:${target.pos.y}`);
  const updateTrafficHeatmap = room => {
    if (!room.memory.traffic || !room.memory.traffic.tiles) {
      room.memory.traffic = {
        started: Game.time,
        lastDecay: Game.time,
        tiles: {}
      };
    }
    const traffic = room.memory.traffic;
    if (!Number.isInteger(traffic.started)) traffic.started = Game.time;
    if (!Number.isInteger(traffic.lastDecay)) traffic.lastDecay = Game.time;
    for (const creep of room.find(FIND_MY_CREEPS)) {
      const previous = creep.memory.trafficPosition;
      if (previous && previous.roomName === room.name &&
          (previous.x !== creep.pos.x || previous.y !== creep.pos.y)) {
        const key = `${creep.pos.x}:${creep.pos.y}`;
        traffic.tiles[key] = (traffic.tiles[key] || 0) + 1;
      }
      creep.memory.trafficPosition = {
        x: creep.pos.x,
        y: creep.pos.y,
        roomName: room.name
      };
    }

    if (Game.time - traffic.lastDecay >= 1000) {
      for (const key of Object.keys(traffic.tiles)) {
        const decayed = Math.floor(traffic.tiles[key] / 2);
        if (decayed > 0) traffic.tiles[key] = decayed;
        else delete traffic.tiles[key];
      }
      traffic.lastDecay = Game.time;
    }

    const hotTiles = Object.entries(traffic.tiles)
      .filter(([, visits]) => visits >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80);
    const maximum = hotTiles.length ? hotTiles[0][1] : 1;
    for (const [key, visits] of hotTiles) {
      const [x, y] = key.split(':').map(Number);
      const intensity = visits / maximum;
      const fill = intensity >= 0.67 ? '#ff453a' :
        intensity >= 0.34 ? '#ff9f0a' : '#ffd60a';
      room.visual.circle(x, y, {
        fill,
        radius: 0.18 + intensity * 0.27,
        opacity: 0.18 + intensity * 0.42,
        stroke: 'transparent'
      });
    }
    return traffic;
  };
  const drawRoadPlan = (room, paths, traffic, roadBudget) => {
    for (const path of paths) {
      const stroke = path.label === 'controller' ? '#64d2ff' :
        path.label === 'source-controller' ? '#bf5af2' : '#30d158';
      room.visual.poly(path.points.map(point => [point.x, point.y]), {
        fill: 'transparent',
        stroke,
        strokeWidth: 0.08,
        opacity: 0.28,
        lineStyle: 'dashed'
      });
    }
    const samples = Object.values(traffic.tiles)
      .reduce((total, visits) => total + visits, 0);
    const roadCount = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD
    }).length;
    const roadSiteCount = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_ROAD
    }).length;
    room.visual.text(
      `traffic ${samples} | roads ${roadCount}+${roadSiteCount}/${roadBudget}`,
      1, 1,
      { align: 'left', color: '#ffffff', font: 0.55, opacity: 0.75 }
    );
  };
  const getRoadBudget = (room, paths, controllerLevel) => {
    const strategicTiles = new Set();
    for (const path of paths) {
      for (const point of path.points) {
        strategicTiles.add(`${point.x}:${point.y}`);
      }
    }
    const offNetworkRoads = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD &&
        !strategicTiles.has(`${structure.pos.x}:${structure.pos.y}`)
    }).length;
    const dottedNetworkMinimum = strategicTiles.size + offNetworkRoads;
    return Math.max(50, controllerLevel * 10,
      dottedNetworkMinimum + 25);
  };
  const placeRoadSite = (room, paths, traffic, roadBudget) => {
    if (!room.controller || !room.controller.my || room.controller.level < 2) {
      return false;
    }
    const roads = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD
    });
    const roadSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_ROAD
    });
    const builtRoadTiles = new Set(roads.map(road =>
      `${road.pos.x}:${road.pos.y}`));
    const queuedRoadTiles = new Set(roadSites.map(site =>
      `${site.pos.x}:${site.pos.y}`));
    const budgetRemaining = roadBudget - roads.length - roadSites.length;
    const batchLimit = Math.min(2 - roadSites.length, budgetRemaining);
    if (batchLimit <= 0) return false;

    const corridorUses = {};
    for (const path of paths) {
      for (const point of path.points) {
        const key = `${point.x}:${point.y}`;
        corridorUses[key] = (corridorUses[key] || 0) + 1;
      }
    }
    const terrain = room.getTerrain();
    const candidates = [];
    const candidateKeys = new Set(Object.keys(corridorUses));
    // The heatmap is now an input to construction, not just a visual. Limit
    // it to the hottest established traffic so occasional detours do not
    // become permanent roads.
    Object.entries(traffic.tiles)
      .filter(([, visits]) => visits >= 10)
      .filter(([key]) => {
        const [x, y] = key.split(':').map(Number);
        return x > 0 && x < 49 && y > 0 && y < 49 &&
          !builtRoadTiles.has(key) && !queuedRoadTiles.has(key) &&
          terrain.get(x, y) !== TERRAIN_MASK_WALL &&
          room.lookForAt(LOOK_STRUCTURES, x, y).length === 0 &&
          room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length === 0;
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .forEach(([key]) => candidateKeys.add(key));
    for (const key of candidateKeys) {
      const visits = traffic.tiles[key] || 0;
      const corridorCount = corridorUses[key] || 0;
      const [x, y] = key.split(':').map(Number);
      if (x <= 0 || x >= 49 || y <= 0 || y >= 49 ||
          builtRoadTiles.has(key) || queuedRoadTiles.has(key) ||
          terrain.get(x, y) === TERRAIN_MASK_WALL ||
          room.lookForAt(LOOK_STRUCTURES, x, y).length > 0 ||
          room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
      const swampBonus = terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 50 : 0;
      const score = visits * 20 + corridorCount * 40 + swampBonus;
      candidates.push({ x, y, visits, corridorCount, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    let placed = 0;
    for (const candidate of candidates) {
      const key = `${candidate.x}:${candidate.y}`;
      const roadExists = room.lookForAt(LOOK_STRUCTURES,
        candidate.x, candidate.y).some(structure =>
        structure.structureType === STRUCTURE_ROAD);
      const roadQueued = room.lookForAt(LOOK_CONSTRUCTION_SITES,
        candidate.x, candidate.y).some(site =>
        site.structureType === STRUCTURE_ROAD);
      if (builtRoadTiles.has(key) || queuedRoadTiles.has(key) ||
          roadExists || roadQueued) continue;
      const result = room.createConstructionSite(
        candidate.x, candidate.y, STRUCTURE_ROAD);
      if (result === OK) {
        queuedRoadTiles.add(key);
        console.log(`[${Game.time}] Placed road site in ${room.name} at ` +
          `${candidate.x},${candidate.y} (heat ${candidate.visits}, ` +
          `corridor ${candidate.corridorCount})`);
        placed++;
        if (placed >= batchLimit) break;
      }
    }
    return placed > 0;
  };
  const getDesiredSourceWorkerLimit = (room, population) => {
    const { sourceWorkerTargetTotal } = getWorkerLimits(room);
    return sourceWorkerTargetTotal;
  };
  const getRemoteHaulReadiness = (targetRoomName, slot) => {
    const remoteRoom = Game.rooms[targetRoomName];
    if (!remoteRoom) return { ready: false, reason: 'room not visible' };
    const sources = remoteRoom.find(FIND_SOURCES)
      .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    const source = sources[slot % Math.max(1, sources.length)];
    if (!source) return { ready: false, reason: 'source not visible' };
    const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    })[0];
    if (!container) return { ready: false, reason: 'container unfinished' };
    const roadReady = remoteRoom.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD &&
        (structure.pos.getRangeTo(source) <= 2 ||
          structure.pos.getRangeTo(container) <= 1)
    }).length > 0;
    if (!roadReady) return { ready: false, reason: 'road unfinished' };
    const haulLoad = Math.min(CARRY_CAPACITY * 6,
      Math.ceil(container.store.getCapacity(RESOURCE_ENERGY) * 0.25));
    if (container.store[RESOURCE_ENERGY] < haulLoad) {
      return { ready: false, reason: `container ${container.store[RESOURCE_ENERGY]}/${haulLoad}` };
    }
    return { ready: true, source, container };
  };
  const getRemoteHaulerTarget = (targetRoomName, baseline) => {
    const remoteRoom = Game.rooms[targetRoomName];
    if (!remoteRoom) return baseline;
    const sources = remoteRoom.find(FIND_SOURCES);
    const containers = remoteRoom.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
        sources.some(source => source.pos.getRangeTo(structure) <= 1)
    });
    if (!containers.length) return baseline;
    const highestPressure = Math.max(...containers.map(container => {
      const capacity = container.store.getCapacity(RESOURCE_ENERGY) || 1;
      return container.store[RESOURCE_ENERGY] / capacity;
    }));
    return baseline + (highestPressure >= 0.75 ? 2 :
      highestPressure >= 0.5 ? 1 : 0);
  };
  const updateEnergyWorkPhase = room => {
    const capacity = room.energyCapacityAvailable || 0;
    const ratio = capacity > 0 ? room.energyAvailable / capacity : 1;
    let phase = room.memory.energyWorkPhase;
    if (phase !== 'refill' && phase !== 'work') {
      phase = ratio >= 1 ? 'work' : 'refill';
      room.memory.energyWorkPhaseSince = Game.time;
    } else if (phase === 'refill' && ratio >= 1) {
      phase = 'work';
      room.memory.energyWorkPhaseSince = Game.time;
      console.log(`[${Game.time}] ${room.name} energy phase refill -> work`);
    } else if (phase === 'work' && ratio <= 0.5 &&
        (room.energyAvailable < workerCost ||
          Game.time - (room.memory.energyWorkPhaseSince || 0) >= 25)) {
      phase = 'refill';
      room.memory.energyWorkPhaseSince = Game.time;
      console.log(`[${Game.time}] ${room.name} energy phase work -> refill` +
        `${room.energyAvailable < workerCost ? ' (spawn reserve)' : ''}`);
    }
    room.memory.energyWorkPhase = phase;
    return phase;
  };
  const getSpawnAssignment = (room, workers) => {
    // Keep the core room productive before assigning optional remote labor.
    const situationTargets = getRoomSituation(room).targets;
    const localMiningLimits = getWorkerLimits(room);
    // Income stations come first: fill every currently usable source position
    // before considering role conversions for secondary work.
    const uncoveredLocalSource = room.find(FIND_SOURCES).find(source => {
      const requiredWork = Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER);
      const assigned = workers.filter(creep =>
        creep.memory.role === 'harvester' &&
        (creep.memory.preferredSource === source.id ||
          creep.memory.harvestSource === source.id ||
          creep.memory.sourceReplacement === source.id) &&
        (creep.spawning || creep.ticksToLive >
          creep.body.length * CREEP_SPAWN_TIME + 25));
      const assignedWork = assigned.reduce((total, creep) =>
        total + creep.getActiveBodyparts(WORK), 0);
      const positionTarget = localMiningLimits.sourceWorkerTargets[source.id] || 0;
      return assigned.length < positionTarget || assignedWork < requiredWork;
    });
    if (uncoveredLocalSource) {
      return {
        role: 'harvester',
        preferredSource: uncoveredLocalSource,
        forceSpawn: true,
        minimumEnergy: Math.ceil(uncoveredLocalSource.energyCapacity /
          ENERGY_REGEN_TIME / HARVEST_POWER) * BODYPART_COST[WORK] +
          BODYPART_COST[CARRY] + BODYPART_COST[MOVE]
      };
    }
    // The S2 tunnel is a dedicated local construction lane. Restore its
    // builder before adding more logistics bodies so the opened mining route
    // does not sit unfinished while general builders upgrade at the RC.
    const tunnelSite = getSource2TunnelSite(room);
    if (tunnelSite && !workers.some(creep =>
      creep.memory.role === 'digger' &&
      (creep.spawning || hasLocalReplacementLife(creep)))) {
      return {
        role: 'digger',
        diggerTarget: tunnelSite.id,
        forceSpawn: true,
        minimumEnergy: room.energyCapacityAvailable
      };
    }
    // Restore the complete local carrier roster before secondary role
    // conversions or optional outpost labor. Added miners need buffer drainage.
    const localHaulerFloor = situationTargets.hauler;
    const viableLocalHaulers = workers.filter(creep =>
      creep.memory.role === 'hauler' && hasLocalReplacementLife(creep));
    if (viableLocalHaulers.length < localHaulerFloor) {
      return {
        role: 'hauler',
        forceSpawn: true,
        minimumEnergy: room.energyCapacityAvailable
      };
    }
    const southwestSurvey = room.memory.southwestSurvey;
    if (southwestSurvey && southwestSurvey.active &&
        southwestSurvey.targetRoom && !workers.some(creep =>
          creep.memory.role === 'remote-scout' &&
          creep.memory.remoteRoom === southwestSurvey.targetRoom)) {
      return {
        role: 'remote-scout',
        remoteRoom: southwestSurvey.targetRoom,
        remoteSlot: 0,
        remoteTeam: 'southwest',
        forceSpawn: true
      };
    }
    if (southwestSurvey && southwestSurvey.active &&
        southwestSurvey.targetRoom) {
      const southwestMiners = workers.filter(creep =>
        creep.memory.role === 'remote-scout' &&
        creep.memory.remoteRoom === southwestSurvey.targetRoom);
      const missingNeed = (southwestSurvey.remoteWorkNeeds || [])
        .find(need => {
          const assigned = southwestMiners.filter(creep =>
            creep.memory.remoteSlot === need.slot);
          const assignedWork = assigned.reduce((total, creep) => total +
            creep.getActiveBodyparts(WORK), 0);
          return assigned.length < need.minMiners ||
            assignedWork < need.requiredWork;
        });
      if (missingNeed) {
        return {
          role: 'remote-scout',
          remoteRoom: southwestSurvey.targetRoom,
          remoteSlot: missingNeed.slot,
          remoteTeam: 'southwest',
          forceSpawn: true
        };
      }
      if (Game.rooms[southwestSurvey.targetRoom] && !workers.some(creep =>
        creep.memory.role === 'remote-builder' &&
        creep.memory.remoteRoom === southwestSurvey.targetRoom)) {
        return {
          role: 'remote-builder',
          remoteRoom: southwestSurvey.targetRoom,
          remoteBuilderSlot: 0,
          remoteTeam: 'southwest',
          forceSpawn: true
        };
      }
    }
    // Once the home carrier floor is secure, balance ready remote hauling
    // lanes before secondary local role conversions can pause spawning.
    const remoteHaulerPlans = [
      { survey: room.memory.leftSurvey, team: 'left',
        fallback: remoteHaulerTarget },
      { survey: room.memory.southSurvey, team: 'south', delivery: 's2',
        fallback: southHaulerTarget },
      { survey: room.memory.southwestSurvey, team: 'southwest',
        fallback: southwestHaulerTarget }
    ].filter(entry => entry.survey && entry.survey.active &&
      entry.survey.targetRoom)
      .map(entry => {
        const target = entry.survey.remoteHaulerTarget || entry.fallback;
        const assigned = workers.filter(creep =>
          creep.memory.role === 'remote-hauler' &&
          creep.memory.remoteRoom === entry.survey.targetRoom &&
          hasRemoteReplacementLife(creep));
        const usedSlots = new Set(assigned.map(creep =>
          creep.memory.remoteHaulerSlot));
        const slot = [...Array(target).keys()].find(candidate =>
          !usedSlots.has(candidate) &&
          getRemoteHaulReadiness(entry.survey.targetRoom, candidate).ready);
        return { ...entry, target, assigned: assigned.length, slot };
      })
      .filter(entry => Number.isInteger(entry.slot))
      .sort((a, b) => a.assigned / a.target - b.assigned / b.target);
    if (remoteHaulerPlans.length) {
      const plan = remoteHaulerPlans[0];
      return {
        role: 'remote-hauler',
        remoteRoom: plan.survey.targetRoom,
        remoteHaulerSlot: plan.slot,
        remoteTeam: plan.team,
        remoteDelivery: plan.delivery,
        forceSpawn: true
      };
    }
    const viableUpgraders = workers.filter(creep =>
      creep.memory.role === 'upgrader' && hasLocalReplacementLife(creep));
    if (viableUpgraders.length < situationTargets.upgrader) {
      const availableUpgrader = workers.find(creep => !creep.spawning &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'worker') &&
        hasWorkParts(creep) && hasLocalReplacementLife(creep));
      return availableUpgrader ? null : {
        role: 'upgrader',
        forceSpawn: true,
        minimumEnergy: Math.min(350, room.energyCapacityAvailable)
      };
    }
    // Home-room income is the first staffing floor. Restore enough viable
    // WORK at every local source before sending emergency replacements to an
    // outpost; optional extra local source positions are handled later.
    const viableBuilders = workers.filter(creep =>
      creep.memory.role === 'builder' && hasLocalReplacementLife(creep));
    if (viableBuilders.length < situationTargets.builder) {
      const availableBuilder = workers.find(creep => !creep.spawning &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'worker') &&
        hasWorkParts(creep) && hasLocalReplacementLife(creep));
      return availableBuilder ? null : {
        role: 'builder',
        forceSpawn: true,
        minimumEnergy: Math.min(350, room.energyCapacityAvailable)
      };
    }
    const viableFixers = workers.filter(creep =>
      creep.memory.role === 'fixer' && hasLocalReplacementLife(creep));
    if (viableFixers.length < situationTargets.fixer) {
      const availableFixer = workers.find(creep => !creep.spawning &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'worker') &&
        hasWorkParts(creep) && hasLocalReplacementLife(creep));
      return availableFixer ? null : {
        role: 'fixer',
        forceSpawn: true,
        minimumEnergy: Math.min(350, room.energyCapacityAvailable)
      };
    }
    // Restore the minimum WORK at every active remote source before filling
    // optional extra local source tiles. Otherwise a dying remote generation
    // can leave an entire developed outpost empty indefinitely.
    const remotePlans = [
      { survey: room.memory.leftSurvey, team: 'left' },
      { survey: room.memory.southSurvey, team: 'south', delivery: 's2' },
      { survey: room.memory.southwestSurvey, team: 'southwest' }
    ].filter(entry => entry.survey && entry.survey.active &&
      entry.survey.targetRoom);
    for (const entry of remotePlans) {
      const survey = entry.survey;
      const remoteWorkers = workers.filter(creep =>
        creep.memory.role === 'remote-scout' &&
        creep.memory.remoteRoom === survey.targetRoom);
      const needs = Array.isArray(survey.remoteWorkNeeds) &&
        survey.remoteWorkNeeds.length > 0
        ? survey.remoteWorkNeeds
        : [...Array(survey.remoteMinerTarget || 1).keys()].map(slot => ({
          slot,
          minMiners: 1,
          requiredWork: 1
        }));
      for (const need of needs) {
        const assigned = remoteWorkers.filter(creep => {
          if (creep.memory.remoteSlot !== need.slot) return false;
          return creep.spawning ||
            creep.ticksToLive > getRemoteReplacementLead(creep);
        });
        const assignedWork = assigned.reduce((total, creep) => total +
          creep.body.filter(part => part.type === WORK && part.hits > 0).length,
        0);
        if (assigned.length === 0 ||
            assignedWork < Math.max(1, need.requiredWork || 0)) {
          return {
            role: 'remote-scout',
            remoteRoom: survey.targetRoom,
            remoteSlot: need.slot,
            remoteTeam: entry.team,
            remoteDelivery: entry.delivery,
            forceSpawn: true
          };
        }
      }
    }
    // Assess each source independently. Fill its usable adjacent positions
    // before remote expansion unless repeated early exhaustion has proven that
    // fewer strong bodies can consume the full regeneration rate.
    const understaffedLocalSource = room.find(FIND_SOURCES).find(source => {
      const assigned = workers.filter(creep =>
        (creep.memory.role === 'miner' || creep.memory.role === 'harvester') &&
        (creep.memory.minerSource === source.id ||
          creep.memory.preferredSource === source.id ||
          creep.memory.harvestSource === source.id ||
          creep.memory.sourceReplacement === source.id)).length;
      return assigned < (localMiningLimits.sourceWorkerTargets[source.id] || 0);
    });
    if (understaffedLocalSource) {
      const assignedCount = workers.filter(creep =>
        (creep.memory.role === 'miner' || creep.memory.role === 'harvester') &&
        (creep.memory.minerSource === understaffedLocalSource.id ||
          creep.memory.preferredSource === understaffedLocalSource.id ||
          creep.memory.harvestSource === understaffedLocalSource.id)).length;
      const container = understaffedLocalSource.pos.findInRange(
        FIND_STRUCTURES, 1, {
          filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
            !isRetiringContainer(room, structure)
        })[0];
      const station = container && findMinerStation(room,
        understaffedLocalSource, container, {});
      if (assignedCount === 0 && container && station) {
        return { role: 'harvester', preferredSource: understaffedLocalSource };
      }
      return { role: 'harvester', preferredSource: understaffedLocalSource };
    }
    const maxWorkPerSourceBody = getSourceBodyWorkCapacity(room);
    const underworkedLocalSource = room.find(FIND_SOURCES).find(source => {
      const requiredWork = Math.min(Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER),
      (localMiningLimits.sourceWorkerTargets[source.id] || 0) *
        maxWorkPerSourceBody);
      const assignedWork = workers.filter(creep =>
        (creep.memory.role === 'miner' || creep.memory.role === 'harvester') &&
        (creep.memory.minerSource === source.id ||
          creep.memory.preferredSource === source.id ||
          creep.memory.harvestSource === source.id ||
          creep.memory.sourceReplacement === source.id) &&
        (creep.spawning || creep.ticksToLive >
          creep.body.length * CREEP_SPAWN_TIME + 25))
        .reduce((total, creep) => total + creep.getActiveBodyparts(WORK), 0);
      return assignedWork < requiredWork;
    });
    if (underworkedLocalSource) {
      return {
        role: 'harvester',
        preferredSource: underworkedLocalSource,
        forceSpawn: true
      };
    }
    const expansion = room.memory.expansionPlan;
    if (expansion && expansion.targetRoom) {
      if (expansion.status === 'claim-ready' &&
          !workers.some(creep => creep.memory.role === 'claimer' &&
            creep.memory.expansionTarget === expansion.targetRoom)) {
        return {
          role: 'claimer',
          expansionTarget: expansion.targetRoom,
          forceSpawn: true
        };
      }
      if (expansion.status === 'bootstrap') {
        const pioneers = workers.filter(creep =>
          creep.memory.role === 'expansion-builder' &&
          creep.memory.expansionTarget === expansion.targetRoom);
        if (pioneers.length < expansionBuilderTarget) {
          return {
            role: 'expansion-builder',
            expansionTarget: expansion.targetRoom,
            forceSpawn: true
          };
        }
      }
    }
    const survey = room.memory.leftSurvey;
    if (survey && survey.active && survey.targetRoom) {
      const scouts = workers.filter(creep =>
        creep.memory.role === 'remote-scout' &&
        creep.memory.remoteRoom === survey.targetRoom);
      if (scouts.length < remoteScoutTarget) {
        const usedSlots = new Set(scouts.map(creep =>
          creep.memory.remoteSlot));
        const remoteSlot = [...Array(remoteScoutTarget).keys()]
          .find(slot => !usedSlots.has(slot));
        return {
          role: 'remote-scout',
          remoteRoom: survey.targetRoom,
          remoteSlot,
          remoteTeam: 'left'
        };
      }
      const remoteHaulers = workers.filter(creep =>
        creep.memory.role === 'remote-hauler' &&
        creep.memory.remoteRoom === survey.targetRoom &&
        hasRemoteReplacementLife(creep));
      const usedSlots = new Set(remoteHaulers.map(creep =>
        creep.memory.remoteHaulerSlot));
      const remoteHaulerSlot = [...Array(survey.remoteHaulerTarget ||
        remoteHaulerTarget).keys()]
        .find(slot => !usedSlots.has(slot) &&
          getRemoteHaulReadiness(survey.targetRoom, slot).ready);
      if (Number.isInteger(remoteHaulerSlot)) {
        return {
          role: 'remote-hauler',
          remoteRoom: survey.targetRoom,
          remoteHaulerSlot,
          remoteTeam: 'left'
        };
      }
      const remoteBuilders = workers.filter(creep =>
        creep.memory.role === 'remote-builder' &&
        creep.memory.remoteRoom === survey.targetRoom);
      if (remoteBuilders.length < remoteBuilderTarget) {
        const usedSlots = new Set(remoteBuilders.map(creep =>
          creep.memory.remoteBuilderSlot));
        const remoteBuilderSlot = [...Array(remoteBuilderTarget).keys()]
          .find(slot => !usedSlots.has(slot));
        return {
          role: 'remote-builder',
          remoteRoom: survey.targetRoom,
          remoteBuilderSlot,
          remoteTeam: 'left'
        };
      }
      for (const need of survey.remoteWorkNeeds || []) {
        const assignedScouts = scouts.filter(creep =>
          creep.memory.remoteSlot === need.slot);
        const assignedWork = assignedScouts.reduce((total, creep) =>
          total + creep.body.filter(part => part.type === WORK &&
            part.hits > 0).length, 0);
        if (assignedScouts.length < need.minMiners ||
            assignedWork < need.requiredWork) {
          return {
            role: 'remote-scout',
            remoteRoom: survey.targetRoom,
            remoteSlot: need.slot,
            remoteTeam: 'left'
          };
        }
      }
    }
    const southSurvey = room.memory.southSurvey;
    if (southSurvey && southSurvey.active && southSurvey.targetRoom) {
      const southMiners = workers.filter(creep =>
        creep.memory.role === 'remote-scout' &&
        creep.memory.remoteRoom === southSurvey.targetRoom);
      for (const need of southSurvey.remoteWorkNeeds ||
        [{ slot: 0, minMiners: 1, requiredWork: 1 }]) {
        const assigned = southMiners.filter(creep =>
          creep.memory.remoteSlot === need.slot);
        const assignedWork = assigned.reduce((total, creep) => total +
          creep.body.filter(part => part.type === WORK && part.hits > 0).length,
        0);
        if (assigned.length < need.minMiners ||
            assignedWork < need.requiredWork) {
          return {
            role: 'remote-scout',
            remoteRoom: southSurvey.targetRoom,
            remoteSlot: need.slot,
            remoteTeam: 'south',
            remoteDelivery: 's2'
          };
        }
      }
      const southBuilders = workers.filter(creep =>
        creep.memory.role === 'remote-builder' &&
        creep.memory.remoteRoom === southSurvey.targetRoom);
      if (southBuilders.length < southBuilderTarget) {
        const usedSlots = new Set(southBuilders.map(creep =>
          creep.memory.remoteBuilderSlot));
        const remoteBuilderSlot = [...Array(southBuilderTarget).keys()]
          .find(slot => !usedSlots.has(slot));
        return {
          role: 'remote-builder',
          remoteRoom: southSurvey.targetRoom,
          remoteBuilderSlot,
          remoteTeam: 'south',
          remoteDelivery: 's2'
        };
      }
      const southHaulers = workers.filter(creep =>
        creep.memory.role === 'remote-hauler' &&
        creep.memory.remoteRoom === southSurvey.targetRoom &&
        hasRemoteReplacementLife(creep));
      const usedHaulerSlots = new Set(southHaulers.map(creep =>
        creep.memory.remoteHaulerSlot));
      const remoteHaulerSlot = [...Array(southSurvey.remoteHaulerTarget ||
        southHaulerTarget).keys()]
        .find(slot => !usedHaulerSlots.has(slot) &&
          getRemoteHaulReadiness(southSurvey.targetRoom, slot).ready);
      if (Number.isInteger(remoteHaulerSlot)) {
        return {
          role: 'remote-hauler',
          remoteRoom: southSurvey.targetRoom,
          remoteHaulerSlot,
          remoteTeam: 'south',
          remoteDelivery: 's2'
        };
      }
    }
    if (southwestSurvey && southwestSurvey.active &&
        southwestSurvey.targetRoom) {
      const southwestMiners = workers.filter(creep =>
        creep.memory.role === 'remote-scout' &&
        creep.memory.remoteRoom === southwestSurvey.targetRoom);
      for (const need of southwestSurvey.remoteWorkNeeds ||
        [{ slot: 0, minMiners: 1, requiredWork: 1 }]) {
        const assigned = southwestMiners.filter(creep =>
          creep.memory.remoteSlot === need.slot);
        const assignedWork = assigned.reduce((total, creep) => total +
          creep.body.filter(part => part.type === WORK && part.hits > 0).length,
        0);
        if (assigned.length < need.minMiners ||
            assignedWork < need.requiredWork) {
          return {
            role: 'remote-scout',
            remoteRoom: southwestSurvey.targetRoom,
            remoteSlot: need.slot,
            remoteTeam: 'southwest',
            forceSpawn: true
          };
        }
      }
      const southwestBuilders = workers.filter(creep =>
        creep.memory.role === 'remote-builder' &&
        creep.memory.remoteRoom === southwestSurvey.targetRoom);
      if (southwestBuilders.length < southwestBuilderTarget) {
        const usedSlots = new Set(southwestBuilders.map(creep =>
          creep.memory.remoteBuilderSlot));
        const remoteBuilderSlot = [...Array(southwestBuilderTarget).keys()]
          .find(slot => !usedSlots.has(slot));
        return {
          role: 'remote-builder',
          remoteRoom: southwestSurvey.targetRoom,
          remoteBuilderSlot,
          remoteTeam: 'southwest',
          forceSpawn: true
        };
      }
      const southwestHaulers = workers.filter(creep =>
        creep.memory.role === 'remote-hauler' &&
        creep.memory.remoteRoom === southwestSurvey.targetRoom &&
        hasRemoteReplacementLife(creep));
      const usedHaulerSlots = new Set(southwestHaulers.map(creep =>
        creep.memory.remoteHaulerSlot));
      const remoteHaulerSlot = [...Array(
        southwestSurvey.remoteHaulerTarget || southwestHaulerTarget).keys()]
        .find(slot => !usedHaulerSlots.has(slot) &&
          getRemoteHaulReadiness(southwestSurvey.targetRoom, slot).ready);
      if (Number.isInteger(remoteHaulerSlot)) {
        return {
          role: 'remote-hauler',
          remoteRoom: southwestSurvey.targetRoom,
          remoteHaulerSlot,
          remoteTeam: 'southwest',
          forceSpawn: true
        };
      }
    }
    const builderTarget = getBuilderTarget(room);
    const builderCount = workers.filter(creep =>
      creep.memory.role === 'builder').length;
    if (builderCount < builderTarget) {
      const availableBuilder = workers.find(creep => !creep.spawning &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'worker') &&
        hasWorkParts(creep));
      return availableBuilder ? null : { role: 'builder' };
    }
    if (workers.filter(creep => creep.memory.role === 'fixer').length <
        fixerTarget) {
      const availableFixer = workers.find(creep => !creep.spawning &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'worker') &&
        hasWorkParts(creep));
      return availableFixer ? null : { role: 'fixer' };
    }
    if (Number.isInteger(room.memory.containerHaulerPendingTarget) &&
        workers.length < room.memory.containerHaulerPendingTarget) {
      return { role: 'hauler' };
    }

    const sourceContainers = room.find(FIND_SOURCES).map(source => ({
      source,
      container: source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
          !isRetiringContainer(room, structure)
      })[0]
    })).filter(entry => entry.container).map(entry => ({
      ...entry,
      station: findMinerStation(room, entry.source, entry.container, {})
    }));
    const minerLimit = getDesiredSourceWorkerLimit(room, workers.length);
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
        role: 'harvester',
        preferredSource: missingSource.source
      };
    }
    const availableHarvester = workers.some(creep => !creep.spawning &&
      creep.memory.role === 'worker');
    if (sourceWorkerCount < minerLimit) {
      return availableHarvester ? null : { role: 'harvester' };
    }
    const haulerTarget = getRoomSituation(room).targets.hauler;
    const haulerCount = workers.filter(creep =>
      creep.memory.role === 'hauler').length;
    return { role: haulerCount < haulerTarget ? 'hauler' : 'worker' };
  };

  // Once S1 is depleted before regeneration, permanently open remote
  // harvesting in the adjacent room on the left with one S1 harvester and one
  // additional mobile harvester.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const exits = Game.map.describeExits(room.name) || {};
    const targetRoom = exits[LEFT];
    const source1 = room.find(FIND_SOURCES)[0];
    if (!targetRoom || !source1) continue;
    for (const orphan of Object.values(Game.creeps).filter(creep =>
      creep.memory.home === room.name &&
      creep.memory.role === 'remote-scout' &&
      creep.memory.remoteRoom === targetRoom &&
      !Number.isInteger(creep.memory.leftScoutSlot))) {
      orphan.memory.role = 'harvester';
      orphan.memory.preferredSource = source1.id;
      delete orphan.memory.remoteRoom;
      delete orphan.memory.remoteSlot;
    }
    if (room.memory.eastSurvey) delete room.memory.eastSurvey;
    const survey = room.memory.leftSurvey || {
      targetRoom,
      active: true,
      expandedPopulation: false
    };
    survey.targetRoom = targetRoom;
    // The western room is now a permanent outpost, not a conditional scout
    // experiment. Do not let an old activation flag silently remove it from
    // staffing and replacement calculations.
    survey.active = true;
    if (!survey.started) survey.started = Game.time;
    survey.remoteMinerTarget = remoteScoutTarget;
    survey.remoteHaulerTarget = getRemoteHaulerTarget(targetRoom,
      remoteHaulerTarget);
    survey.remoteBuilderTarget = remoteBuilderTarget;
    room.memory.leftSurvey = survey;
    const homeCreeps = Object.values(Game.creeps).filter(creep =>
      creep.memory.home === room.name);
    let firstScout = homeCreeps.find(creep =>
      creep.memory.leftScoutSlot === 0);
    if (!firstScout && source1.energy === 0 &&
        source1.ticksToRegeneration > 0) {
      firstScout = homeCreeps.filter(creep => !creep.spawning &&
        creep.memory.role === 'harvester' &&
        creep.memory.preferredSource === source1.id)
        .sort((a, b) => b.ticksToLive - a.ticksToLive)[0];
      if (firstScout) firstScout.memory.leftScoutSlot = 0;
    }
    if (!survey.active && firstScout && source1.energy === 0 &&
        source1.ticksToRegeneration > 0) {
      survey.active = true;
      survey.started = Game.time;
      console.log(`[${Game.time}] ${room.name} drains S1 before regeneration; ` +
        `permanent left harvesting -> ${targetRoom}`);
    }
    if (survey.active) {
      for (const scout of homeCreeps.filter(creep =>
        Number.isInteger(creep.memory.leftScoutSlot))) {
        scout.memory.role = 'remote-scout';
        scout.memory.remoteHome = room.name;
        scout.memory.remoteRoom = targetRoom;
        scout.memory.remoteTeam = 'left';
        scout.memory.remoteSlot = scout.memory.leftScoutSlot;
        delete scout.memory.remoteRecall;
        delete scout.memory.preferredSource;
        delete scout.memory.harvestSource;
        delete scout.memory.harvestX;
        delete scout.memory.harvestY;
      }
      const remoteHaulers = homeCreeps.filter(creep =>
        creep.memory.role === 'remote-hauler' &&
        creep.memory.remoteRoom === targetRoom &&
        hasRemoteReplacementLife(creep));
      const usedHaulerSlots = new Set(remoteHaulers.map(creep =>
        creep.memory.remoteHaulerSlot));
      const surplusHaulers = homeCreeps.filter(creep =>
        creep.memory.role === 'hauler' && !creep.spawning)
        .sort((a, b) => b.ticksToLive - a.ticksToLive)
        .slice(getRoomSituation(room).targets.hauler);
      for (const slot of [...Array(survey.remoteHaulerTarget ||
        remoteHaulerTarget).keys()].filter(candidate =>
        getRemoteHaulReadiness(targetRoom, candidate).ready)) {
        if (usedHaulerSlots.has(slot)) continue;
        const hauler = surplusHaulers.shift();
        if (!hauler) break;
        hauler.memory.role = 'remote-hauler';
        hauler.memory.remoteHome = room.name;
        hauler.memory.remoteRoom = targetRoom;
        hauler.memory.remoteTeam = 'left';
        hauler.memory.remoteHaulerSlot = slot;
        delete hauler.memory.refillTarget;
        delete hauler.memory.withdrawTarget;
        delete hauler.memory.supplyTarget;
        usedHaulerSlots.add(slot);
        console.log(`[${Game.time}] ${hauler.name} assigned remote haul ` +
          `${targetRoom} source ${slot + 1}`);
      }
      const markedRemoteBuilders = homeCreeps.filter(creep =>
        Number.isInteger(creep.memory.remoteBuilderSlot) &&
        creep.memory.remoteRoom === targetRoom)
        .sort((a, b) => a.name.localeCompare(b.name));
      for (let index = 0;
        index < Math.min(remoteBuilderTarget, markedRemoteBuilders.length);
        index++) {
        const builder = markedRemoteBuilders[index];
        builder.memory.role = 'remote-builder';
        builder.memory.remoteHome = room.name;
        builder.memory.remoteRoom = targetRoom;
        builder.memory.remoteTeam = 'left';
        builder.memory.remoteBuilderSlot = index;
      }
      if (firstScout && !survey.expandedPopulation) {
        room.memory.workerTarget = Math.max(room.memory.workerTarget || 0,
          homeCreeps.length + 1);
        survey.expandedPopulation = true;
      }
      const missingRemoteBuilders = Math.max(0, remoteBuilderTarget -
        homeCreeps.filter(creep =>
          creep.memory.role === 'remote-builder' &&
          creep.memory.remoteRoom === targetRoom).length);
      if (missingRemoteBuilders > 0) {
        room.memory.workerTarget = Math.max(room.memory.workerTarget || 0,
          homeCreeps.length + missingRemoteBuilders);
      }
      const remoteRoom = Game.rooms[targetRoom];
      if (remoteRoom) {
        const remoteSources = remoteRoom.find(FIND_SOURCES)
          .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
        if (!survey.sourceStats) survey.sourceStats = {};
        survey.remoteWorkNeeds = remoteSources.map((source, slot) => {
          const baseMiners = slot === 0 ? 3 : 4;
          const stats = survey.sourceStats[source.id] ||
            { minerReduction: 0 };
          const requiredWork = Math.ceil(source.energyCapacity /
            ENERGY_REGEN_TIME / HARVEST_POWER);
          const maxWorkPerBody = getSourceBodyWorkCapacity(room);
          const minimum = Math.ceil(requiredWork / maxWorkPerBody);
          const maximum = Math.max(minimum, Math.min(baseMiners,
            getSourceSpotCount(remoteRoom, source)));
          const initialTarget = Math.max(minimum,
            baseMiners - (stats.minerReduction || 0));
          const targetMiners = reviewSourceStaffing(stats, source, {
            initialTarget,
            minimum,
            maximum,
            label: `${targetRoom} L${slot + 1}`
          });
          stats.minerReduction = Math.max(0, baseMiners - targetMiners);
          survey.sourceStats[source.id] = stats;
          return {
            slot,
            baseMiners,
            minMiners: targetMiners,
            requiredWork
          };
        });
        const remoteMiners = homeCreeps.filter(creep =>
          Number.isInteger(creep.memory.remoteSlot) &&
          creep.memory.remoteRoom === targetRoom);
        for (const need of survey.remoteWorkNeeds) {
          const assigned = remoteMiners.filter(creep =>
            creep.memory.remoteSlot === need.slot);
          let assignedWork = assigned.reduce((work, creep) =>
            work + creep.getActiveBodyparts(WORK), 0);
          while (assigned.length > need.minMiners) {
            const candidateIndex = assigned
              .map((creep, index) => ({ creep, index }))
              .filter(entry => assignedWork -
                entry.creep.getActiveBodyparts(WORK) >= need.requiredWork)
              .sort((a, b) =>
                a.creep.getActiveBodyparts(WORK) -
                  b.creep.getActiveBodyparts(WORK) ||
                a.creep.ticksToLive - b.creep.ticksToLive)[0];
            if (!candidateIndex) break;
            const candidate = candidateIndex.creep;
            assigned.splice(candidateIndex.index, 1);
            assignedWork -= candidate.getActiveBodyparts(WORK);
            candidate.memory.role = 'remote-builder';
            candidate.memory.remoteBuilderSlot = need.slot;
            delete candidate.memory.remoteSlot;
            delete candidate.memory.leftScoutSlot;
            delete candidate.memory.remoteSource;
            delete candidate.memory.remoteContainerBuilding;
            console.log(`[${Game.time}] ${candidate.name} L${need.slot + 1} ` +
              `surplus miner -> remote road builder`);
          }
        }
        const missingRemoteMiners = survey.remoteWorkNeeds.reduce((total, need) => {
          const assigned = remoteMiners.filter(creep =>
            creep.memory.remoteSlot === need.slot);
          const assignedWork = assigned.reduce((work, creep) =>
            work + creep.body.filter(part => part.type === WORK &&
              part.hits > 0).length, 0);
          const missingForCount = Math.max(0,
            need.minMiners - assigned.length);
          const missingForWork = assignedWork < need.requiredWork ? 1 : 0;
          return total + Math.max(missingForCount, missingForWork);
        }, 0);
        if (missingRemoteMiners > 0) {
          room.memory.workerTarget = Math.max(room.memory.workerTarget || 0,
            homeCreeps.length + missingRemoteMiners + missingRemoteBuilders);
        }
      }
    }
  }

  // A compact southern outpost feeds the home room through S2: one miner
  // establishes the first source container, one builder opens the corridor,
  // and one hauler returns the energy to the S2-side container.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const exits = Game.map.describeExits(room.name) || {};
    const targetRoom = exits[BOTTOM];
    if (!targetRoom) continue;
    const survey = room.memory.southSurvey || {
      active: true,
      started: Game.time
    };
    survey.active = true;
    survey.targetRoom = targetRoom;
    survey.remoteMinerTarget = southMinerTarget;
    survey.remoteHaulerTarget = getRemoteHaulerTarget(targetRoom,
      southHaulerTarget);
    survey.remoteBuilderTarget = southBuilderTarget;
    survey.delivery = 's2';
    const remoteRoom = Game.rooms[targetRoom];
    if (remoteRoom) {
      const sources = remoteRoom.find(FIND_SOURCES)
        .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
      if (sources.length > 0) {
        if (!survey.sourceStats) survey.sourceStats = {};
        survey.remoteWorkNeeds = sources.map((source, slot) => {
          const stats = survey.sourceStats[source.id] || {};
          const requiredWork = Math.ceil(source.energyCapacity /
            ENERGY_REGEN_TIME / HARVEST_POWER);
          const maxWorkPerBody = getSourceBodyWorkCapacity(room);
          const minimum = Math.ceil(requiredWork / maxWorkPerBody);
          const maximum = Math.max(minimum,
            getSourceSpotCount(remoteRoom, source));
          const minMiners = reviewSourceStaffing(stats, source, {
            initialTarget: minimum,
            minimum,
            maximum,
            label: `${targetRoom} D${slot + 1}`
          });
          survey.sourceStats[source.id] = stats;
          return { slot, minMiners, requiredWork };
        });
      }
    } else if (!Array.isArray(survey.remoteWorkNeeds)) {
      survey.remoteWorkNeeds = [{
        slot: 0,
        minMiners: 1,
        requiredWork: 1
      }];
    }
    room.memory.southSurvey = survey;
  }

  // Establish the diagonal southwest room through the existing western
  // corridor. Its source workers build adjacent containers in place; builders
  // and haulers join as soon as the room becomes visible and storage is ready.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const homeExits = Game.map.describeExits(room.name) || {};
    const westRoomName = homeExits[LEFT];
    const westExits = westRoomName
      ? Game.map.describeExits(westRoomName) || {}
      : {};
    const southRoomName = homeExits[BOTTOM];
    const southExits = southRoomName
      ? Game.map.describeExits(southRoomName) || {}
      : {};
    const targetRoom = westExits[BOTTOM] || southExits[LEFT];
    if (!targetRoom) continue;
    const survey = room.memory.southwestSurvey || {
      active: true,
      started: Game.time
    };
    survey.active = true;
    survey.targetRoom = targetRoom;
    survey.remoteMinerTarget = southwestMinerTarget;
    survey.remoteBuilderTarget = southwestBuilderTarget;
    survey.remoteHaulerTarget = getRemoteHaulerTarget(targetRoom,
      southwestHaulerTarget);
    const remoteRoom = Game.rooms[targetRoom];
    if (remoteRoom) {
      const sources = remoteRoom.find(FIND_SOURCES)
        .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
      if (!survey.sourceStats) survey.sourceStats = {};
      survey.remoteWorkNeeds = sources.map((source, slot) => {
        const stats = survey.sourceStats[source.id] || {};
        const requiredWork = Math.ceil(source.energyCapacity /
          ENERGY_REGEN_TIME / HARVEST_POWER);
        const maxWorkPerBody = getSourceBodyWorkCapacity(room);
        const minimum = Math.ceil(requiredWork / maxWorkPerBody);
        const maximum = Math.max(minimum,
          getSourceSpotCount(remoteRoom, source));
        const minMiners = reviewSourceStaffing(stats, source, {
          initialTarget: minimum,
          minimum,
          maximum,
          label: `${targetRoom} SW${slot + 1}`
        });
        survey.sourceStats[source.id] = stats;
        return { slot, minMiners, requiredWork };
      });
    } else if (!Array.isArray(survey.remoteWorkNeeds)) {
      survey.remoteWorkNeeds = [{ slot: 0, minMiners: 1, requiredWork: 1 }];
    }
    room.memory.southwestSurvey = survey;
  }

  // Persistent expansion objective: select the best prepared visible remote
  // room, wait for a GCL slot, claim it, and bootstrap its first spawn.
  const primarySpawn = Object.values(Game.spawns)
    .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (primarySpawn) {
    const homeRoom = primarySpawn.room;
    const ownedRoomCount = Object.values(Game.rooms).filter(room =>
      room.controller && room.controller.my).length;
    const candidateNames = [
      homeRoom.memory.leftSurvey && homeRoom.memory.leftSurvey.targetRoom,
      homeRoom.memory.southSurvey && homeRoom.memory.southSurvey.targetRoom
    ].filter(Boolean);
    let plan = homeRoom.memory.expansionPlan;
    if (!plan || !plan.targetRoom) {
      const candidates = candidateNames.map(roomName => Game.rooms[roomName])
        .filter(room => room && room.controller && !room.controller.owner)
        .map(room => ({
          room,
          score: room.find(FIND_SOURCES).length * 100 +
            room.find(FIND_STRUCTURES, {
              filter: structure => structure.structureType === STRUCTURE_CONTAINER
            }).length * 25 +
            room.find(FIND_STRUCTURES, {
              filter: structure => structure.structureType === STRUCTURE_ROAD
            }).length
        }))
        .sort((a, b) => b.score - a.score ||
          a.room.name.localeCompare(b.room.name));
      if (candidates.length > 0) {
        plan = {
          targetRoom: candidates[0].room.name,
          selected: Game.time,
          status: 'waiting-gcl'
        };
        homeRoom.memory.expansionPlan = plan;
        console.log(`[${Game.time}] expansion target ${plan.targetRoom} ` +
          `score ${candidates[0].score}`);
      }
    }
    if (plan && plan.targetRoom) {
      const targetRoom = Game.rooms[plan.targetRoom];
      const targetController = targetRoom && targetRoom.controller;
      plan.gclLevel = Game.gcl.level;
      plan.ownedRooms = ownedRoomCount;
      plan.canClaim = Game.gcl.level > ownedRoomCount;
      if (targetController && targetController.my) {
        const targetSpawn = targetRoom.find(FIND_MY_SPAWNS)[0];
        const spawnSite = targetRoom.find(FIND_MY_CONSTRUCTION_SITES, {
          filter: site => site.structureType === STRUCTURE_SPAWN
        })[0];
        if (targetSpawn) {
          plan.status = 'established';
          plan.spawnId = targetSpawn.id;
        } else {
          plan.status = 'bootstrap';
          if (!spawnSite) {
            const terrain = targetRoom.getTerrain();
            const sources = targetRoom.find(FIND_SOURCES);
            const roads = targetRoom.find(FIND_STRUCTURES, {
              filter: structure => structure.structureType === STRUCTURE_ROAD
            });
            const candidates = [];
            for (let x = 3; x <= 46; x++) {
              for (let y = 3; y <= 46; y++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL ||
                    targetController.pos.getRangeTo(x, y) < 3 ||
                    sources.some(source => source.pos.getRangeTo(x, y) < 3) ||
                    targetRoom.lookForAt(LOOK_STRUCTURES, x, y).length > 0 ||
                    targetRoom.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)
                      .length > 0) continue;
                const sourceRange = sources.reduce((total, source) =>
                  total + source.pos.getRangeTo(x, y), 0);
                const controllerRange = targetController.pos.getRangeTo(x, y);
                const roadAdjacent = roads.some(road =>
                  road.pos.getRangeTo(x, y) <= 1);
                candidates.push({
                  x,
                  y,
                  score: sourceRange * 2 + controllerRange -
                    (roadAdjacent ? 5 : 0)
                });
              }
            }
            candidates.sort((a, b) => a.score - b.score ||
              a.x - b.x || a.y - b.y);
            for (const candidate of candidates) {
              if (targetRoom.createConstructionSite(candidate.x, candidate.y,
                STRUCTURE_SPAWN) === OK) {
                plan.spawnX = candidate.x;
                plan.spawnY = candidate.y;
                console.log(`[${Game.time}] ${plan.targetRoom} bootstrap ` +
                  `spawn site ${candidate.x},${candidate.y}`);
                break;
              }
            }
          } else {
            plan.spawnSiteId = spawnSite.id;
          }
        }
      } else if (!plan.canClaim) {
        plan.status = 'waiting-gcl';
      } else if (homeRoom.energyCapacityAvailable <
          BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]) {
        plan.status = 'waiting-energy-capacity';
      } else {
        plan.status = 'claim-ready';
      }
      if (plan.lastReportedStatus !== plan.status) {
        console.log(`[${Game.time}] expansion ${plan.targetRoom}: ` +
          `${plan.lastReportedStatus || 'planned'} -> ${plan.status} ` +
          `(GCL ${plan.gclLevel}, rooms ${plan.ownedRooms})`);
        plan.lastReportedStatus = plan.status;
      }
    }
  }

  // Plan the two remote-source corridors to the home controller container and
  // expose only five road construction sites at a time.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const survey = room.memory.leftSurvey;
    const remoteRoom = survey && survey.active &&
      Game.rooms[survey.targetRoom];
    if (!remoteRoom) continue;
    const controllerContainer = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
        structure.pos.getRangeTo(room.controller) <= 3
    }).sort((a, b) => a.pos.getRangeTo(room.controller) -
      b.pos.getRangeTo(room.controller))[0];
    if (!controllerContainer) continue;
    const remoteSources = remoteRoom.find(FIND_SOURCES)
      .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    const signature = [survey.targetRoom, controllerContainer.id,
      ...remoteSources.map(source => source.id)].join(':');
    let plan = room.memory.remoteRoadPlan;
    if (!plan || plan.signature !== signature) {
      const paths = remoteSources.map((source, slot) => {
        const search = PathFinder.search(source.pos, {
          pos: controllerContainer.pos,
          range: 1
        }, {
          maxRooms: 2,
          maxOps: 10000,
          plainCost: 2,
          swampCost: 10,
          roomCallback: roomName => {
            if (roomName !== room.name && roomName !== remoteRoom.name) {
              return false;
            }
            const visibleRoom = Game.rooms[roomName];
            if (!visibleRoom) return false;
            const costs = new PathFinder.CostMatrix();
            for (const structure of visibleRoom.find(FIND_STRUCTURES)) {
              if (structure.structureType === STRUCTURE_ROAD) {
                costs.set(structure.pos.x, structure.pos.y, 1);
              } else if (OBSTACLE_OBJECT_TYPES.includes(
                structure.structureType)) {
                costs.set(structure.pos.x, structure.pos.y, 255);
              }
            }
            for (const site of visibleRoom.find(FIND_MY_CONSTRUCTION_SITES)) {
              if (site.structureType !== STRUCTURE_ROAD) {
                costs.set(site.pos.x, site.pos.y, 255);
              }
            }
            return costs;
          }
        });
        return {
          slot,
          incomplete: search.incomplete,
          points: search.path.map(position => ({
            x: position.x,
            y: position.y,
            roomName: position.roomName
          }))
        };
      });
      plan = { signature, created: Game.time, paths };
      room.memory.remoteRoadPlan = plan;
      console.log(`[${Game.time}] ${room.name} planned remote roads: ` +
        paths.map(path => `L${path.slot + 1}=${path.points.length}`).join(' '));
    }
    const corridor = new Map();
    for (const path of plan.paths || []) {
      for (let index = 0; index < path.points.length; index++) {
        const point = path.points[index];
        const key = `${point.roomName}:${point.x}:${point.y}`;
        if (!corridor.has(key)) corridor.set(key, { ...point, index });
      }
    }
    const activeRoadSites = [];
    for (const point of corridor.values()) {
      const visibleRoom = Game.rooms[point.roomName];
      if (!visibleRoom) continue;
      const site = visibleRoom.lookForAt(LOOK_CONSTRUCTION_SITES,
        point.x, point.y).find(candidate =>
        candidate.structureType === STRUCTURE_ROAD);
      if (site) activeRoadSites.push(site);
    }
    let availableSites = Math.max(0, 5 - activeRoadSites.length);
    if (availableSites <= 0) continue;
    const candidates = [...corridor.values()].sort((a, b) =>
      a.index - b.index || a.roomName.localeCompare(b.roomName));
    for (const point of candidates) {
      if (availableSites <= 0) break;
      const visibleRoom = Game.rooms[point.roomName];
      if (!visibleRoom) continue;
      const structures = visibleRoom.lookForAt(LOOK_STRUCTURES,
        point.x, point.y);
      const sites = visibleRoom.lookForAt(LOOK_CONSTRUCTION_SITES,
        point.x, point.y);
      if (structures.some(structure =>
        structure.structureType === STRUCTURE_ROAD) || structures.some(structure =>
        structure.structureType !== STRUCTURE_RAMPART) || sites.length > 0) {
        continue;
      }
      if (visibleRoom.createConstructionSite(point.x, point.y,
        STRUCTURE_ROAD) === OK) {
        availableSites--;
      }
    }
  }

  // Build the southern source-to-S2 corridor five sites at a time.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const survey = room.memory.southSurvey;
    const remoteRoom = survey && survey.active &&
      Game.rooms[survey.targetRoom];
    const source2 = room.find(FIND_SOURCES)
      .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y)[1];
    if (!remoteRoom || !source2) continue;
    const s2Container = source2.pos.findInRange(FIND_STRUCTURES, 1, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
        !isRetiringContainer(room, structure)
    }).sort((a, b) => b.pos.y - a.pos.y)[0];
    const remoteSources = remoteRoom.find(FIND_SOURCES)
      .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    if (!s2Container || remoteSources.length === 0) continue;
    const signature = [survey.targetRoom, s2Container.id,
      ...remoteSources.map(source => source.id)].join(':');
    let plan = room.memory.southRemoteRoadPlan;
    if (!plan || plan.signature !== signature) {
      const paths = remoteSources.map((remoteSource, slot) => {
        const search = PathFinder.search(remoteSource.pos, {
          pos: s2Container.pos,
          range: 1
        }, {
          maxRooms: 2,
          maxOps: 10000,
          plainCost: 2,
          swampCost: 10,
          roomCallback: roomName => {
            if (roomName !== room.name && roomName !== remoteRoom.name) {
              return false;
            }
            const visibleRoom = Game.rooms[roomName];
            if (!visibleRoom) return false;
            const costs = new PathFinder.CostMatrix();
            for (const structure of visibleRoom.find(FIND_STRUCTURES)) {
              if (structure.structureType === STRUCTURE_ROAD) {
                costs.set(structure.pos.x, structure.pos.y, 1);
              } else if (OBSTACLE_OBJECT_TYPES.includes(
                structure.structureType)) {
                costs.set(structure.pos.x, structure.pos.y, 255);
              }
            }
            for (const site of visibleRoom.find(FIND_MY_CONSTRUCTION_SITES)) {
              if (site.structureType !== STRUCTURE_ROAD) {
                costs.set(site.pos.x, site.pos.y, 255);
              }
            }
            return costs;
          }
        });
        return {
          slot,
          incomplete: search.incomplete,
          points: search.path.map(position => ({
            x: position.x,
            y: position.y,
            roomName: position.roomName
          }))
        };
      });
      plan = {
        signature,
        created: Game.time,
        paths
      };
      room.memory.southRemoteRoadPlan = plan;
      console.log(`[${Game.time}] ${room.name} planned south roads ` +
        paths.map(path => `D${path.slot + 1}=${path.points.length}`)
          .join(' ') + ' to S2');
    }
    const points = (plan.paths || []).flatMap(path =>
      path.points.map((point, index) => ({
        ...point,
        slot: path.slot,
        index
      }))).sort((a, b) => a.index - b.index || a.slot - b.slot);
    let activeSites = 0;
    for (const point of points) {
      const visibleRoom = Game.rooms[point.roomName];
      if (!visibleRoom) continue;
      if (visibleRoom.lookForAt(LOOK_CONSTRUCTION_SITES, point.x, point.y)
        .some(site => site.structureType === STRUCTURE_ROAD)) activeSites++;
    }
    let availableSites = Math.max(0, 5 - activeSites);
    for (const point of points) {
      if (availableSites <= 0) break;
      const visibleRoom = Game.rooms[point.roomName];
      if (!visibleRoom) continue;
      const structures = visibleRoom.lookForAt(LOOK_STRUCTURES,
        point.x, point.y);
      const sites = visibleRoom.lookForAt(LOOK_CONSTRUCTION_SITES,
        point.x, point.y);
      if (structures.some(structure =>
        structure.structureType === STRUCTURE_ROAD) || structures.some(
        structure => structure.structureType !== STRUCTURE_RAMPART) ||
        sites.length > 0) continue;
      if (visibleRoom.createConstructionSite(point.x, point.y,
        STRUCTURE_ROAD) === OK) availableSites--;
    }
  }

  // Build the southwest source-to-home corridor five sites at a time once a
  // bootstrap worker provides vision in the diagonal room.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const survey = room.memory.southwestSurvey;
    const remoteRoom = survey && survey.active &&
      Game.rooms[survey.targetRoom];
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    const homeExits = Game.map.describeExits(room.name) || {};
    const westRoomName = homeExits[LEFT];
    const southRoomName = homeExits[BOTTOM];
    if (!remoteRoom || !spawn || !westRoomName) continue;
    const remoteSources = remoteRoom.find(FIND_SOURCES)
      .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    if (!remoteSources.length) continue;
    const signature = [survey.targetRoom, spawn.id,
      ...remoteSources.map(source => source.id)].join(':');
    let plan = room.memory.southwestRemoteRoadPlan;
    if (!plan || plan.signature !== signature ||
        (plan.paths || []).some(path => path.incomplete) &&
          Game.time - (plan.created || 0) >= 25) {
      const allowedRooms = new Set([
        room.name, westRoomName, southRoomName, remoteRoom.name
      ]);
      const paths = remoteSources.map((remoteSource, slot) => {
        const search = PathFinder.search(remoteSource.pos, {
          pos: spawn.pos,
          range: 1
        }, {
          maxRooms: 3,
          maxOps: 15000,
          plainCost: 2,
          swampCost: 10,
          roomCallback: roomName => {
            if (!allowedRooms.has(roomName)) return false;
            const visibleRoom = Game.rooms[roomName];
            if (!visibleRoom) return false;
            const costs = new PathFinder.CostMatrix();
            for (const structure of visibleRoom.find(FIND_STRUCTURES)) {
              if (structure.structureType === STRUCTURE_ROAD) {
                costs.set(structure.pos.x, structure.pos.y, 1);
              } else if (OBSTACLE_OBJECT_TYPES.includes(
                structure.structureType)) {
                costs.set(structure.pos.x, structure.pos.y, 255);
              }
            }
            return costs;
          }
        });
        return {
          slot,
          incomplete: search.incomplete,
          points: search.path.map(position => ({
            x: position.x,
            y: position.y,
            roomName: position.roomName
          }))
        };
      });
      plan = { signature, created: Game.time, paths };
      room.memory.southwestRemoteRoadPlan = plan;
      console.log(`[${Game.time}] ${room.name} planned southwest roads ` +
        paths.map(path => `SW${path.slot + 1}=${path.points.length}`)
          .join(' '));
    }
    const points = (plan.paths || []).flatMap(path =>
      path.points.map((point, index) => ({
        ...point,
        slot: path.slot,
        index
      }))).sort((a, b) => a.index - b.index || a.slot - b.slot);
    let activeSites = 0;
    for (const point of points) {
      const visibleRoom = Game.rooms[point.roomName];
      if (visibleRoom && visibleRoom.lookForAt(LOOK_CONSTRUCTION_SITES,
        point.x, point.y).some(site =>
        site.structureType === STRUCTURE_ROAD)) activeSites++;
    }
    let availableSites = Math.max(0, 5 - activeSites);
    for (const point of points) {
      if (availableSites <= 0) break;
      const visibleRoom = Game.rooms[point.roomName];
      if (!visibleRoom) continue;
      const structures = visibleRoom.lookForAt(LOOK_STRUCTURES,
        point.x, point.y);
      const sites = visibleRoom.lookForAt(LOOK_CONSTRUCTION_SITES,
        point.x, point.y);
      if (structures.some(structure =>
        structure.structureType === STRUCTURE_ROAD) || structures.some(
        structure => structure.structureType !== STRUCTURE_RAMPART) ||
        sites.length > 0) continue;
      if (visibleRoom.createConstructionSite(point.x, point.y,
        STRUCTURE_ROAD) === OK) availableSites--;
    }
  }

  // The S2 wall tunnel is the one RCL2 road exception. Add one dedicated
  // digger without consuming the population reserved for the rest of the room.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my ||
        room.memory.s2DiggerRequested) continue;
    const tunnelSite = getSource2TunnelSite(room);
    if (!tunnelSite) continue;
    const currentPopulation = Object.values(Game.creeps).filter(creep =>
      creep.memory.home === room.name).length;
    room.memory.workerTarget = Math.max(room.memory.workerTarget || 0,
      currentPopulation + 1);
    room.memory.s2DiggerRequested = {
      tick: Game.time,
      siteId: tunnelSite.id
    };
    console.log(`[${Game.time}] ${room.name} dedicated S2 digger requested ` +
      `for tunnel ${tunnelSite.pos.x},${tunnelSite.pos.y}`);
  }

  const spawnGroups = {};
  for (const spawn of Object.values(Game.spawns)) {
    if (!spawnGroups[spawn.room.name]) spawnGroups[spawn.room.name] = [];
    spawnGroups[spawn.room.name].push(spawn);
  }
  const spawnOrder = [];
  for (const [roomName, spawns] of Object.entries(spawnGroups)) {
    spawns.sort((a, b) => a.name.localeCompare(b.name));
    const room = Game.rooms[roomName];
    updateEnergyWorkPhase(room);
    const start = room.memory.nextSpawnIndex % spawns.length || 0;
    for (let offset = 0; offset < spawns.length; offset++) {
      spawnOrder.push(spawns[(start + offset) % spawns.length]);
    }
  }
  for (const spawn of spawnOrder) {
    const workers = Object.values(Game.creeps).filter(c =>
      c.memory.home === spawn.room.name);
    for (const worker of workers) {
      if (worker.memory.role !== 'miner') continue;
      worker.memory.role = 'harvester';
      worker.memory.preferredSource = worker.memory.minerSource ||
        worker.memory.preferredSource;
      delete worker.memory.minerSource;
      delete worker.memory.minerContainer;
      delete worker.memory.minerX;
      delete worker.memory.minerY;
      delete worker.memory.working;
      console.log(`[${Game.time}] ${worker.name} miner role removed -> ` +
        'source harvester');
    }
    const { workerLimit } = getWorkerLimits(spawn.room);
    const assignment = getSpawnAssignment(spawn.room, workers);
    const requiresDedicatedBody = assignment &&
      (assignment.role === 'remote-scout' ||
        assignment.role === 'remote-hauler' ||
        assignment.role === 'remote-builder' || assignment.role === 'digger' ||
        assignment.role === 'claimer' ||
        assignment.role === 'expansion-builder');
    const hasCapableIdleWorker = assignment && !assignment.forceSpawn &&
      !requiresDedicatedBody &&
      workers.some(creep =>
      !creep.spawning && creep.memory.idleNow &&
      (assignment.role === 'hauler'
        ? creep.getActiveBodyparts(CARRY) > 0
        : hasWorkParts(creep)));
    const specialistReplacement = assignment &&
      (assignment.role === 'upgrader' || assignment.role === 'builder' ||
        assignment.role === 'fixer' || assignment.role === 'digger' ||
        assignment.role === 'remote-scout' ||
        assignment.role === 'remote-hauler' ||
        assignment.role === 'remote-builder' ||
        assignment.role === 'claimer' ||
        assignment.role === 'expansion-builder' || assignment.forceSpawn);
    const needsWorker = assignment && !hasCapableIdleWorker &&
      (workers.length < workerLimit || specialistReplacement);
    if (!needsWorker) {
      delete spawn.room.memory.spawnWaitSince;
      delete spawn.room.memory.spawnWaitRole;
      continue;
    }
    if (spawn.room.memory.spawnWaitRole !== assignment.role) {
      spawn.room.memory.spawnWaitRole = assignment.role;
      spawn.room.memory.spawnWaitSince = Game.time;
    }
    const sourceWorkerCount = workers.filter(creep =>
      creep.memory.role === 'miner' || creep.memory.role === 'harvester').length;
    const emergency = workers.length === 0 || sourceWorkerCount === 0 ||
      (spawn.room.controller && spawn.room.controller.ticksToDowngrade < 1000);
    const energyFull = spawn.room.energyAvailable >=
      spawn.room.energyCapacityAvailable;
    const waited = Game.time - (spawn.room.memory.spawnWaitSince || Game.time);
    const waitForFullBody = assignment.role === 'miner' ||
      assignment.role === 'harvester' || assignment.role === 'digger' ||
      assignment.role === 'remote-scout' ||
      assignment.role === 'remote-hauler' || assignment.role === 'claimer' ||
      assignment.role === 'expansion-builder';
    const chargeComplete = energyFull || emergency ||
      (assignment.minimumEnergy && spawn.room.energyAvailable >=
        assignment.minimumEnergy) ||
      (!waitForFullBody && waited >= 25);
    const body = chargeComplete
      ? buildBody(assignment.role, spawn.room.energyAvailable)
      : null;
    if (!spawn.spawning && body) {
      const name = `worker-${spawn.name}-${Game.time}`;
      const result = spawn.spawnCreep(body, name, {
        memory: {
          home: spawn.room.name,
          working: false,
          role: assignment.role,
          remoteHome: assignment.role && assignment.role.indexOf('remote-') === 0
            ? spawn.room.name
            : undefined,
          minerSource: assignment.source && assignment.source.id,
          preferredSource: assignment.preferredSource &&
            assignment.preferredSource.id,
          sourceReplacement: assignment.forceSpawn &&
            assignment.preferredSource && assignment.preferredSource.id,
          minerContainer: assignment.container && assignment.container.id,
          minerX: assignment.station && assignment.station.x,
          minerY: assignment.station && assignment.station.y,
          diggerTarget: assignment.diggerTarget,
          remoteRoom: assignment.remoteRoom,
          remoteSlot: assignment.remoteSlot,
          remoteTeam: assignment.remoteTeam,
          remoteDelivery: assignment.remoteDelivery,
          leftScoutSlot: assignment.remoteTeam === 'left'
            ? assignment.remoteSlot : undefined,
          remoteHaulerSlot: assignment.remoteHaulerSlot,
          remoteBuilderSlot: assignment.remoteBuilderSlot,
          expansionTarget: assignment.expansionTarget
        }
      });
      if (result === OK) {
        delete spawn.room.memory.spawnWaitSince;
        delete spawn.room.memory.spawnWaitRole;
        const roomSpawns = spawnGroups[spawn.room.name];
        const spawnIndex = roomSpawns.findIndex(candidate => candidate.id === spawn.id);
        spawn.room.memory.nextSpawnIndex = (spawnIndex + 1) % roomSpawns.length;
        const cost = body.reduce((total, part) => total + BODYPART_COST[part], 0);
        console.log(`[${Game.time}] Spawning ${name} (${assignment.role}, ${cost} energy): ${getBodyCode(body)}`);
      }
    }
  }

  const ownedRooms = new Set(Object.values(Game.spawns).map(spawn => spawn.room.name));
  // Traffic exists anywhere our creeps travel, not only in rooms containing
  // one of our spawns. Record and draw heatmaps in every currently visible
  // room with our creeps; construction authority remains in the owned loop.
  const trafficByRoom = {};
  for (const room of Object.values(Game.rooms)) {
    if (room.find(FIND_MY_CREEPS).length === 0) continue;
    trafficByRoom[room.name] = updateTrafficHeatmap(room);
  }
  for (const roomName of ownedRooms) {
    const room = Game.rooms[roomName];
    const situation = getRoomSituation(room);
    if (room.memory.schedulerVersion !== 'stable-roster-v1') {
      room.memory.schedulerVersion = 'stable-roster-v1';
      console.log(`[${Game.time}] ${room.name} scheduler -> stable-roster-v1`);
    }
    if (room.memory.situationMode !== situation.mode) {
      console.log(`[${Game.time}] ${room.name} situation ` +
        `${room.memory.situationMode || 'unknown'} -> ${situation.mode}; ` +
        `targets Src${situation.targets.source} Ha${situation.targets.hauler} ` +
        `B${situation.targets.builder} F${situation.targets.fixer} ` +
        `U${situation.targets.upgrader} D${situation.targets.digger}`);
      room.memory.situationMode = situation.mode;
      room.memory.situationChanged = Game.time;
    }
    const traffic = trafficByRoom[room.name] || updateTrafficHeatmap(room);
    const paths = getImportantRoadPaths(room);
    delete room.memory.highwayPlan;
    const plannedPaths = paths;
    const controllerLevel = room.controller ? room.controller.level : 0;
    const roadBudget = getRoadBudget(room, plannedPaths, controllerLevel);
    drawRoadPlan(room, plannedPaths, traffic, roadBudget);
    manageControllerContainer(room);
    placeSourceContainerSite(room);
    migrateExtensionsToCluster(room);
    placeExtensionSite(room);
    if (!roadsPaused(room)) {
      placeRoadSite(room, plannedPaths, traffic, roadBudget);
    }
  }

  const reservedEnergy = {};
  const reservedCapacity = {};
  const getUnreservedEnergy = target => target && target.store
    ? Math.max(0, target.store[RESOURCE_ENERGY] -
      (reservedEnergy[target.id] || 0))
    : 0;
  const getUnreservedCapacity = target => target && target.store
    ? Math.max(0, target.store.getFreeCapacity(RESOURCE_ENERGY) -
      (reservedCapacity[target.id] || 0))
    : 0;
  const reserveAmount = (ledger, target, available, requested) => {
    if (!target || requested <= 0) return 0;
    const amount = Math.max(0, Math.min(requested, available));
    if (amount > 0) ledger[target.id] = (ledger[target.id] || 0) + amount;
    return amount;
  };
  const releaseAmount = (ledger, target, amount) => {
    if (!target || amount <= 0) return;
    ledger[target.id] = Math.max(0, (ledger[target.id] || 0) - amount);
    if (ledger[target.id] === 0) delete ledger[target.id];
  };
  const reserveEnergyFrom = (target, requested) =>
    reserveAmount(reservedEnergy, target, getUnreservedEnergy(target), requested);
  const reserveCapacityIn = (target, requested) =>
    reserveAmount(reservedCapacity, target,
      getUnreservedCapacity(target), requested);
  const isControllerBuffer = target => target && target.room &&
    target.room.controller && target.structureType === STRUCTURE_CONTAINER &&
    target.pos.getRangeTo(target.room.controller) <= 3;
  const canWithdrawFrom = (creep, target) => {
    if (!target || target.structureType !== STRUCTURE_CONTAINER) return false;
    if (creep.memory.role !== 'upgrader' && isControllerBuffer(target)) {
      const assignedToController = hasWorkParts(creep) &&
        (creep.memory.demandLane === 'upgrade' ||
          creep.memory.task === 'upgrade' ||
          creep.memory.lastTask === 'upgrade');
      if (!assignedToController) return false;
    }
    if (creep.memory.role === 'digger') {
      const site = Game.getObjectById(creep.memory.diggerTarget) ||
        getSource2TunnelSite(creep.room);
      return !!site && target.pos.getRangeTo(site) <= 3;
    }
    return true;
  };
  const urgentUpgradeAssigned = {};
  const reservedHarvestSpots = {};
  const creeps = Object.values(Game.creeps).filter(creep => !creep.spawning);
  for (const creep of creeps) {
    if (creep.memory.sourceReplacement && hasWorkParts(creep)) {
      creep.memory.role = 'harvester';
      creep.memory.preferredSource = creep.memory.sourceReplacement;
    }
  }
  const roomUpgraders = {};
  const roomBuilders = {};
  const roomFixers = {};
  const roomDiggers = {};
  const roomHaulers = {};
  const assignedCreeps = {};
  const sourceWorkerShortages = {};
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const roomCreeps = creeps.filter(creep => creep.room.name === room.name);
    const minerLimit = getDesiredSourceWorkerLimit(room, roomCreeps.length);
    const sourceWorkerCount = roomCreeps.filter(creep =>
      (creep.memory.role === 'miner' || creep.memory.role === 'harvester')).length;
    sourceWorkerShortages[room.name] = sourceWorkerCount < minerLimit;
  }

  for (const creep of creeps) {
    if ((creep.memory.role === 'remote-scout' ||
          creep.memory.role === 'remote-hauler' ||
          creep.memory.role === 'remote-builder') &&
        creep.memory.remoteHome) {
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'upgrader' && !roomUpgraders[creep.room.name]) {
      roomUpgraders[creep.room.name] = creep;
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'builder' &&
        (!roomBuilders[creep.room.name] ||
          roomBuilders[creep.room.name].length <
            getBuilderTarget(creep.room))) {
      if (!roomBuilders[creep.room.name]) roomBuilders[creep.room.name] = [];
      roomBuilders[creep.room.name].push(creep);
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'fixer' &&
        !roomFixers[creep.room.name]) {
      roomFixers[creep.room.name] = creep;
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'digger' &&
        getSource2TunnelSite(creep.room) && !roomDiggers[creep.room.name]) {
      roomDiggers[creep.room.name] = creep;
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'hauler' &&
        !sourceWorkerShortages[creep.room.name] &&
        (roomHaulers[creep.room.name] || 0) <
          getRoomSituation(creep.room).targets.hauler) {
      assignedCreeps[creep.name] = true;
      roomHaulers[creep.room.name] = (roomHaulers[creep.room.name] || 0) + 1;
    }
  }

  // Keep one upgrader, then assign one miner to each source with an adjacent container.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const roomCreeps = creeps.filter(creep => creep.room.name === room.name);
    if (!roomUpgraders[room.name]) {
      const upgrader = roomCreeps.find(creep =>
        creep.memory.role === 'hauler' && hasWorkParts(creep)) ||
        roomCreeps.find(creep => !assignedCreeps[creep.name] &&
          creep.memory.role !== 'miner' && hasWorkParts(creep)) ||
        roomCreeps.find(creep => hasWorkParts(creep));
      if (upgrader) {
        delete assignedCreeps[upgrader.name];
        roomUpgraders[room.name] = upgrader;
        upgrader.memory.role = 'upgrader';
        assignedCreeps[upgrader.name] = true;
      }
    }
    const builderTarget = getBuilderTarget(room);
    if (!roomBuilders[room.name]) roomBuilders[room.name] = [];
    while (roomBuilders[room.name].length < builderTarget) {
      const builder = roomCreeps.find(creep =>
        creep.memory.role === 'hauler' &&
        creep.memory.task === 'build' && hasWorkParts(creep)) ||
        roomCreeps.find(creep => creep.memory.role === 'hauler' &&
          hasWorkParts(creep)) ||
        roomCreeps.find(creep => !assignedCreeps[creep.name] &&
          creep.memory.role === 'worker' && hasWorkParts(creep));
      if (!builder) break;
      delete assignedCreeps[builder.name];
      builder.memory.role = 'builder';
      roomBuilders[room.name].push(builder);
      assignedCreeps[builder.name] = true;
    }
    if (!roomFixers[room.name]) {
      const fixer = roomCreeps.find(creep => !assignedCreeps[creep.name] &&
        creep.memory.role === 'hauler' && creep.memory.task === 'repair' &&
        hasWorkParts(creep)) ||
        roomCreeps.find(creep => !assignedCreeps[creep.name] &&
          creep.memory.role === 'hauler' && hasWorkParts(creep));
      if (fixer) {
        fixer.memory.role = 'fixer';
        roomFixers[room.name] = fixer;
        assignedCreeps[fixer.name] = true;
      }
    }

    const sourceContainers = room.find(FIND_SOURCES).map(source => ({
      source,
      container: source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
          !isRetiringContainer(room, structure)
      })[0]
    })).filter(entry => entry.container);
    const miners = {};
    const minerStations = {};
    const reservedMinerSpots = {};

    for (const entry of sourceContainers) {
      let miner = roomCreeps.find(creep => !assignedCreeps[creep.name] &&
        creep.memory.role === 'miner' && creep.memory.minerSource === entry.source.id);
      let inheritedStation;
      const replacement = miner && roomCreeps.filter(creep =>
        !assignedCreeps[creep.name] && creep.memory.role === 'harvester' &&
        creep.memory.sourceReplacement === entry.source.id &&
        creep.pos.getRangeTo(entry.source) <= 5 &&
        creep.getActiveBodyparts(WORK) > miner.getActiveBodyparts(WORK))
        .sort((a, b) => b.getActiveBodyparts(WORK) -
          a.getActiveBodyparts(WORK))[0];
      if (replacement) {
        if (Number.isInteger(miner.memory.minerX) &&
            Number.isInteger(miner.memory.minerY)) {
          inheritedStation = {
            x: miner.memory.minerX,
            y: miner.memory.minerY
          };
        }
        miner.memory.role = 'harvester';
        miner.memory.preferredSource = entry.source.id;
        delete miner.memory.minerSource;
        delete miner.memory.minerContainer;
        delete miner.memory.minerX;
        delete miner.memory.minerY;
        miner = replacement;
        delete miner.memory.sourceReplacement;
        console.log(`[${Game.time}] ${room.name} upgraded source miner ` +
          `${entry.source.id} to ${miner.getActiveBodyparts(WORK)} WORK`);
      }
      if (!miner) continue;
      const station = inheritedStation || findMinerStation(room, entry.source,
        entry.container, reservedMinerSpots, miner.name,
        { x: miner.memory.minerX, y: miner.memory.minerY });
      if (!station) continue;
      miners[entry.source.id] = miner;
      minerStations[entry.source.id] = station;
      reservedMinerSpots[`${station.x}:${station.y}`] = miner.name;
      assignedCreeps[miner.name] = true;
    }
    for (const entry of sourceContainers) {
      let miner = miners[entry.source.id];
      if (!miner) {
        miner = room.lookForAt(LOOK_CREEPS,
          entry.container.pos.x, entry.container.pos.y)
          .find(creep => roomCreeps.includes(creep) &&
            !assignedCreeps[creep.name] && hasWorkParts(creep)) ||
          roomCreeps.find(creep => !assignedCreeps[creep.name] &&
            hasWorkParts(creep));
        if (!miner) continue;
        const station = findMinerStation(room, entry.source, entry.container,
          reservedMinerSpots, miner.name);
        if (!station) continue;
        miners[entry.source.id] = miner;
        minerStations[entry.source.id] = station;
        reservedMinerSpots[`${station.x}:${station.y}`] = miner.name;
        assignedCreeps[miner.name] = true;
      }
      miner.memory.role = 'harvester';
      miner.memory.preferredSource = entry.source.id;
      delete miner.memory.minerSource;
      delete miner.memory.minerContainer;
      delete miner.memory.minerX;
      delete miner.memory.minerY;
    }

    const { sourceSpotCounts } = getWorkerLimits(room);
    const minerLimit = getDesiredSourceWorkerLimit(room, roomCreeps.length);
    let sourceWorkerCount = Object.keys(miners).length;
    let haulerCount = roomHaulers[room.name] || 0;
    const haulerTarget = getRoomSituation(room).targets.hauler;
    const rolePriority = { harvester: 0, miner: 1, worker: 2, hauler: 3 };
    const roleCandidates = roomCreeps
      .filter(creep => !assignedCreeps[creep.name])
      .sort((a, b) => {
        const aPriority = rolePriority[a.memory.role] === undefined
          ? 4 : rolePriority[a.memory.role];
        const bPriority = rolePriority[b.memory.role] === undefined
          ? 4 : rolePriority[b.memory.role];
        return aPriority - bPriority;
      });
    for (const creep of roleCandidates) {
      if (creep.memory.sourceReplacement && hasWorkParts(creep)) {
        creep.memory.role = 'harvester';
      } else if (sourceWorkerCount < minerLimit && hasWorkParts(creep)) {
        creep.memory.role = 'harvester';
        sourceWorkerCount++;
      } else if (haulerCount < haulerTarget) {
        creep.memory.role = 'hauler';
        haulerCount++;
      } else if (hasWorkParts(creep)) {
        creep.memory.role = 'worker';
      } else {
        // Existing carry-only bodies remain haulers until their balanced
        // WORK/CARRY/MOVE replacements are spawned.
        creep.memory.role = 'hauler';
      }
      assignedCreeps[creep.name] = true;
      if (creep.memory.minerSource && creep.memory.role === 'harvester') {
        creep.memory.preferredSource = creep.memory.minerSource;
      }
      delete creep.memory.minerSource;
      delete creep.memory.minerContainer;
      delete creep.memory.minerX;
      delete creep.memory.minerY;
    }

    // Balance total WORK across sources before filling additional walkable
    // spots. This prevents several strong harvesters from over-mining S1 while
    // S2 remains below its regeneration rate.
    const sourceNeeds = room.find(FIND_SOURCES).map(source => {
      const dedicatedMinerCount = miners[source.id] ? 1 : 0;
      const dedicatedWork = miners[source.id]
        ? miners[source.id].getActiveBodyparts(WORK) : 0;
      const requiredWork = Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER);
      return {
        sourceId: source.id,
        remaining: Math.max(0,
          (sourceSpotCounts[source.id] || 0) - dedicatedMinerCount),
        workDeficit: Math.max(0, requiredWork - dedicatedWork)
      };
    });
    const harvesters = roomCreeps
      .filter(creep => creep.memory.role === 'harvester')
      .sort((a, b) => b.getActiveBodyparts(WORK) -
        a.getActiveBodyparts(WORK) || a.name.localeCompare(b.name));
    for (const creep of harvesters) {
      const markedReplacement = creep.memory.sourceReplacement &&
        sourceNeeds.find(need =>
          need.sourceId === creep.memory.sourceReplacement);
      const available = sourceNeeds.filter(need => need.remaining > 0)
        .sort((a, b) =>
          Number(b.workDeficit > 0) - Number(a.workDeficit > 0) ||
          b.workDeficit - a.workDeficit ||
          Number(b.sourceId === creep.memory.preferredSource) -
            Number(a.sourceId === creep.memory.preferredSource) ||
          b.remaining - a.remaining || a.sourceId.localeCompare(b.sourceId));
      const need = markedReplacement || available[0];
      const preferredSource = need && need.sourceId;
      if (need) {
        if (!markedReplacement) need.remaining--;
        need.workDeficit = Math.max(0, need.workDeficit -
          creep.getActiveBodyparts(WORK));
      }
      if (creep.memory.preferredSource !== preferredSource) {
        creep.memory.preferredSource = preferredSource;
        delete creep.memory.harvestSource;
        delete creep.memory.harvestX;
        delete creep.memory.harvestY;
      }
    }
    for (const creep of roomCreeps) {
      if (creep.memory.role !== 'harvester') {
        delete creep.memory.preferredSource;
      }
    }
  }
  for (const creep of creeps) {
    if (creep.memory.role === 'remote-scout' ||
        creep.memory.role === 'remote-hauler' ||
        creep.memory.role === 'remote-builder') continue;
    if (!creep.room.controller || !creep.room.controller.my) {
      creep.memory.role = 'worker';
      delete creep.memory.minerSource;
      delete creep.memory.minerContainer;
      delete creep.memory.minerX;
      delete creep.memory.minerY;
    }
  }

  // Calculate total room demand once, then reserve one work lane per mobile
  // creep. Individual task queues execute these assignments instead of every
  // creep independently choosing the same first available job.
  const roomDemandPlans = {};
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const roomCreeps = creeps.filter(creep => creep.room.name === room.name);
    const situation = getRoomSituation(room);
    const assignments = {};
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => !roadsPaused(room) || site.structureType !== STRUCTURE_ROAD
    });
    const buildRemaining = sites.reduce((total, site) =>
      total + site.progressTotal - site.progress, 0);
    const repairTargets = room.find(FIND_STRUCTURES, {
      filter: structure => structure.hits !== undefined &&
        structure.hits < structure.hitsMax * 0.75 &&
        structure.structureType !== STRUCTURE_WALL &&
        structure.structureType !== STRUCTURE_RAMPART &&
        (!roadsPaused(room) || structure.structureType !== STRUCTURE_ROAD) &&
        (structure.structureType !== STRUCTURE_ROAD ||
          isHeatmapRoadPosition(room, structure)) &&
        (structure.structureType !== STRUCTURE_CONTAINER ||
          getContainerPurpose(room, structure.pos)) &&
        (structure.my || structure.structureType === STRUCTURE_ROAD ||
          structure.structureType === STRUCTURE_CONTAINER)
    });
    const repairEnergy = repairTargets.reduce((total, structure) =>
      total + Math.ceil((structure.hitsMax * 0.75 - structure.hits) /
        REPAIR_POWER), 0);

    const workCreeps = roomCreeps.filter(creep => hasWorkParts(creep) &&
      creep.memory.role !== 'miner' && creep.memory.role !== 'harvester' &&
      creep.memory.role !== 'digger');
    for (const creep of workCreeps.filter(worker =>
      worker.memory.role === 'upgrader')) assignments[creep.name] = 'upgrade';

    if (situation.mode === 'controller-emergency') {
      for (const creep of workCreeps) assignments[creep.name] = 'upgrade';
    } else {
      let repairSlots = repairTargets.length > 0
        ? (situation.mode === 'repair-crisis' ? 2 : 1)
        : 0;
      const fixers = workCreeps.filter(creep => creep.memory.role === 'fixer');
      const builders = workCreeps.filter(creep => creep.memory.role === 'builder');
      const flexible = workCreeps.filter(creep => creep.memory.role === 'worker')
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const creep of fixers) {
        if (repairSlots > 0) {
          assignments[creep.name] = 'repair';
          repairSlots--;
        } else {
          assignments[creep.name] = 'upgrade';
        }
      }

      let buildSlots = sites.length > 0
        ? Math.min(builders.length + flexible.length,
          Math.max(1, Math.ceil(buildRemaining / 1500)))
        : 0;
      for (const creep of builders) {
        if (buildSlots > 0) {
          assignments[creep.name] = 'build';
          buildSlots--;
        } else {
          assignments[creep.name] = 'upgrade';
        }
      }
      for (const creep of flexible) {
        if (repairSlots > 0) {
          assignments[creep.name] = 'repair';
          repairSlots--;
        } else if (buildSlots > 0) {
          assignments[creep.name] = 'build';
          buildSlots--;
        } else {
          assignments[creep.name] = 'upgrade';
        }
      }
    }

    const spawnFree = room.find(FIND_MY_STRUCTURES, {
      filter: structure => (structure.structureType === STRUCTURE_SPAWN ||
        structure.structureType === STRUCTURE_EXTENSION)
    }).reduce((total, structure) => total +
      structure.store.getFreeCapacity(RESOURCE_ENERGY), 0);
    const controllerBuffers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
        structure.pos.getRangeTo(room.controller) <= 3
    });
    const bufferFree = controllerBuffers.reduce((total, structure) =>
      total + structure.store.getFreeCapacity(RESOURCE_ENERGY), 0);
    const bufferStored = controllerBuffers.reduce((total, structure) =>
      total + structure.store[RESOURCE_ENERGY], 0);
    const bufferCapacity = controllerBuffers.reduce((total, structure) =>
      total + structure.store.getCapacity(RESOURCE_ENERGY), 0);
    const usesControllerBuffer = creep =>
      assignments[creep.name] === 'upgrade' && bufferStored > 0;
    const supplyFree = workCreeps.reduce((total, creep) => total +
      (usesControllerBuffer(creep)
        ? 0 : creep.store.getFreeCapacity(RESOURCE_ENERGY)), 0);
    const sources = room.find(FIND_SOURCES);
    const sourceBuffers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
        sources.some(source => source.pos.getRangeTo(structure) <= 1)
    });
    const sourceStored = sourceBuffers.reduce((total, structure) => total +
      structure.store[RESOURCE_ENERGY], 0);
    const sourceCapacity = sourceBuffers.reduce((total, structure) => total +
      structure.store.getCapacity(RESOURCE_ENERGY), 0);
    const servesAsLocalHauler = creep =>
      creep.memory.role === 'hauler' ||
      (creep.memory.role === 'remote-hauler' &&
        creep.room.name === (creep.memory.remoteHome || creep.memory.home) &&
        !getRemoteHaulReadiness(creep.memory.remoteRoom,
          Number.isInteger(creep.memory.remoteHaulerSlot)
            ? creep.memory.remoteHaulerSlot : 0).ready);
    const energyWorkPhase = room.memory.energyWorkPhase || 'refill';
    const emergencyEnergyRefill = room.energyAvailable < workerCost;
    // Dedicated haulers continuously top off room energy; the phase gate only
    // decides whether WORK creeps must join that refill wave.
    let refillDemand = spawnFree;
    // Keep enough room energy to replace a basic worker, then let haulers
    // stock the controller buffer. Mobile WORK creeps can continue topping
    // off spawn/extensions while the haulers remove the long energy commute
    // from upgraders.
    const emergencyRoomReserve = Math.min(room.energyCapacityAvailable,
      workerCost);
    let emergencyRefillDemand = energyWorkPhase === 'refill' ||
      emergencyEnergyRefill
      ? Math.min(refillDemand, Math.max(0,
        emergencyRoomReserve - room.energyAvailable))
      : 0;
    let urgentBufferDemand = Math.max(0,
      bufferCapacity * 0.5 - bufferStored);
    let bufferDemand = Math.max(0, bufferCapacity - bufferStored);
    let supplyDemand = supplyFree;
    const supplyTargets = {};
    const incomingSupply = {};
    const recipientRemaining = {};
    for (const worker of workCreeps) {
      recipientRemaining[worker.name] =
        usesControllerBuffer(worker)
          ? 0 : worker.store.getFreeCapacity(RESOURCE_ENERGY);
    }
    const refillStructures = room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        (structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_EXTENSION) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    const refillDistance = creep => refillStructures.length > 0
      ? Math.min(...refillStructures.map(structure =>
        creep.pos.getRangeTo(structure)))
      : Infinity;
    const loadedHaulers = roomCreeps.filter(creep =>
      servesAsLocalHauler(creep) && creep.store[RESOURCE_ENERGY] > 0)
      .sort((a, b) => refillDistance(a) - refillDistance(b) ||
        a.name.localeCompare(b.name));
    const emptyHaulers = roomCreeps.filter(creep =>
      servesAsLocalHauler(creep) && creep.store[RESOURCE_ENERGY] === 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const creep of loadedHaulers) {
      const carried = creep.store[RESOURCE_ENERGY];
      if (refillDemand > 0) {
        // Spawn and extensions remain the first delivery commitment, but only
        // reserve enough loaded cargo to finish them. Surplus carriers must
        // keep working instead of waiting behind an already reserved target.
        assignments[creep.name] = 'refill';
        emergencyRefillDemand = Math.max(0,
          emergencyRefillDemand - carried);
        refillDemand = Math.max(0, refillDemand - carried);
      } else if (urgentBufferDemand > 0) {
        assignments[creep.name] = 'buffer';
        urgentBufferDemand = Math.max(0, urgentBufferDemand - carried);
        bufferDemand = Math.max(0, bufferDemand - carried);
      } else if (bufferDemand > 0) {
        assignments[creep.name] = 'buffer';
        bufferDemand = Math.max(0, bufferDemand - carried);
      } else if (supplyDemand > 0) {
        const recipient = workCreeps.filter(worker =>
          recipientRemaining[worker.name] > 0 &&
          creep.pos.getRangeTo(worker) <= 8 &&
          (creep.pos.getRangeTo(worker) <= 3 ||
            carried >= Math.min(CARRY_CAPACITY,
              recipientRemaining[worker.name]))).sort((a, b) => {
          const rolePriority = worker => worker.memory.role === 'upgrader'
            ? 0 : worker.memory.role === 'worker' ? 1 : 2;
          return rolePriority(a) - rolePriority(b) ||
            creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b) ||
            a.name.localeCompare(b.name);
        })[0];
        if (recipient) {
          const committed = Math.min(carried,
            recipientRemaining[recipient.name]);
          assignments[creep.name] = 'supply';
          supplyTargets[creep.name] = recipient.name;
          incomingSupply[recipient.name] =
            (incomingSupply[recipient.name] || 0) + committed;
          recipientRemaining[recipient.name] -= committed;
          supplyDemand = Math.max(0, supplyDemand - committed);
        } else {
          assignments[creep.name] = controllerBuffers.length > 0
            ? 'buffer-stage' : 'standby';
        }
      } else {
        assignments[creep.name] = controllerBuffers.length > 0
          ? 'buffer-stage' : 'standby';
      }
    }
    // WORK-heavy creeps should not cross the room to perform logistics while
    // dedicated haulers exist. They join refill only as a true no-hauler
    // recovery fallback.
    const availableLocalHaulers = roomCreeps.filter(creep =>
      servesAsLocalHauler(creep) && !creep.spawning);
    if ((energyWorkPhase === 'refill' || emergencyEnergyRefill) &&
        availableLocalHaulers.length === 0) {
      for (const creep of workCreeps.filter(worker =>
        worker.memory.role !== 'upgrader')) {
        assignments[creep.name] = 'refill';
        refillDemand = Math.max(0, refillDemand -
          creep.store[RESOURCE_ENERGY]);
      }
    }
    let collectionDemand = refillDemand + bufferDemand + supplyDemand;
    const sourcePressure = sourceCapacity > 0
      ? sourceStored / sourceCapacity
      : 0;
    // Do not leave most carriers waiting while thousands of energy remain at
    // sources. Dispatch enough empty haulers to pull buffers toward a 25%
    // operating reserve; delivery lanes will place those loads as room demand
    // opens.
    const sourceBacklog = Math.max(0,
      sourceStored - sourceCapacity * 0.25);
    collectionDemand = Math.max(collectionDemand, sourceBacklog);
    if (sourcePressure >= 0.8 && sourceStored > 0 && emptyHaulers.length > 0) {
      // Keep one pickup in motion when source buffers are nearly full, even if
      // current delivery demand was just covered by loaded haulers.
      collectionDemand = Math.max(collectionDemand,
        emptyHaulers[0].store.getCapacity(RESOURCE_ENERGY));
    }
    for (const creep of emptyHaulers) {
      if (collectionDemand > 0 && sourceStored > 0) {
        assignments[creep.name] = 'collect';
        collectionDemand = Math.max(0, collectionDemand -
          creep.store.getCapacity(RESOURCE_ENERGY));
      } else {
        assignments[creep.name] = sourceBuffers.length > 0
          ? 'collect-stage' : 'standby';
      }
    }
    // Do not re-route a carrier every time a few points of room demand change.
    // Keep its current lane for a short commitment window while that lane is
    // still useful; target-level reservations handle the individual job.
    const laneCommitmentTicks = 8;
    const stickyCarriers = roomCreeps.filter(servesAsLocalHauler);
    for (const creep of stickyCarriers) {
      const previousLane = creep.memory.demandLane;
      const proposedLane = assignments[creep.name];
      const loaded = creep.store[RESOURCE_ENERGY] > 0;
      const supplyTarget = Game.getObjectById(creep.memory.supplyTarget);
      const previousStillUseful =
        loaded && previousLane === 'refill' && spawnFree > 0 ||
        loaded && (previousLane === 'buffer' ||
          previousLane === 'buffer-stage') && bufferFree > 0 ||
        loaded && previousLane === 'supply' && supplyTarget &&
          supplyTarget.store.getFreeCapacity(RESOURCE_ENERGY) > 0 ||
        !loaded && previousLane === 'collect' && sourceStored > 0 ||
        !loaded && previousLane === 'collect-stage' &&
          sourceBuffers.length > 0;
      const laneAge = Game.time -
        (creep.memory.demandLaneSince || Game.time);
      if (previousLane && previousLane !== proposedLane &&
          previousStillUseful && laneAge < laneCommitmentTicks) {
        assignments[creep.name] = previousLane;
        if (previousLane === 'supply' && supplyTarget) {
          supplyTargets[creep.name] = supplyTarget.name;
        }
      } else if (previousLane !== assignments[creep.name]) {
        creep.memory.demandLaneSince = Game.time;
      } else if (!Number.isInteger(creep.memory.demandLaneSince)) {
        creep.memory.demandLaneSince = Game.time;
      }
    }
    const laneCounts = {};
    for (const lane of Object.values(assignments)) {
      laneCounts[lane] = (laneCounts[lane] || 0) + 1;
    }
    roomDemandPlans[room.name] = {
      assignments,
      supplyTargets,
      incomingSupply,
      demand: { spawnFree, bufferFree, supplyFree, sourceStored,
        buildRemaining, repairEnergy, energyWorkPhase },
      laneCounts
    };
    room.memory.demandPlan = {
      tick: Game.time,
      spawnFree,
      bufferFree,
      supplyFree,
      sourceStored,
      buildRemaining,
      repairEnergy,
      energyWorkPhase,
      lanes: laneCounts
    };
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
    if (creep.memory.role === 'harvester') {
      creep.memory.working = false;
      delete creep.memory.energySources;
      delete creep.memory.energySource;
      delete creep.memory.withdrawTarget;
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
    const controllerEmergency = creep.room.controller &&
      creep.room.controller.my &&
      creep.room.controller.ticksToDowngrade < 1000;
    if (creep.store.getFreeCapacity() === 0 ||
        (controllerEmergency && creep.memory.role === 'upgrader' &&
          creep.store[RESOURCE_ENERGY] > 0)) {
      creep.memory.working = true;
    }
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
    const preferredSource = Game.getObjectById(creep.memory.preferredSource);
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

    if (source && (!preferredSource || source.id === preferredSource.id) &&
        source.energy > 0 && reservedHarvestSpots[currentKey] === creep.name &&
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
    const candidateSources = preferredSource
      ? (preferredSource.energy > 0 ? [preferredSource] : [])
      : creep.room.find(FIND_SOURCES_ACTIVE);
    for (const candidate of candidateSources) {
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

  // Match each dropped-energy pile to one closest hauler so the room does not
  // swarm it.
  const dropAssignments = {};
  for (const creep of creeps) {
    delete creep.memory.reserveHauler;
    delete creep.memory.controllerFeedTarget;
    if (creep.memory.role !== 'hauler' ||
        creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
      delete creep.memory.dropTarget;
    }
  }
  for (const room of Object.values(Game.rooms)) {
    const sourceHarvesters = creeps.filter(creep =>
      creep.room.name === room.name && creep.memory.role === 'harvester');
    const containers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
        !isRetiringContainer(room, structure) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    const isSourceCleanupDrop = resource => sourceHarvesters.some(harvester => {
      if (harvester.pos.getRangeTo(resource) > 1) return false;
      const source = Game.getObjectById(harvester.memory.preferredSource);
      return containers.some(container =>
        harvester.pos.getRangeTo(container) <= 1 ||
        (source && source.pos.getRangeTo(container) <= 1));
    });
    const haulers = creeps.filter(creep =>
      creep.room.name === room.name && creep.memory.role === 'hauler' &&
      creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    const drops = room.find(FIND_DROPPED_RESOURCES, {
      filter: resource => resource.resourceType === RESOURCE_ENERGY &&
        resource.amount > 0 && !isSourceCleanupDrop(resource)
    });
    const assignedDrops = new Set();
    const assignedHaulers = new Set();
    for (const hauler of haulers) {
      const existingDrop = Game.getObjectById(hauler.memory.dropTarget);
      if (existingDrop && existingDrop.resourceType === RESOURCE_ENERGY &&
          existingDrop.amount > 0 && !isSourceCleanupDrop(existingDrop) &&
          !assignedDrops.has(existingDrop.id)) {
        dropAssignments[hauler.name] = existingDrop.id;
        assignedDrops.add(existingDrop.id);
        assignedHaulers.add(hauler.name);
      } else {
        delete hauler.memory.dropTarget;
      }
    }
    const pairs = [];
    for (const drop of drops) {
      for (const hauler of haulers) {
        pairs.push({
          drop,
          hauler,
          distance: hauler.pos.getRangeTo(drop)
        });
      }
    }
    pairs.sort((a, b) => a.distance - b.distance ||
      a.hauler.name.localeCompare(b.hauler.name));
    for (const pair of pairs) {
      if (assignedDrops.has(pair.drop.id) ||
          assignedHaulers.has(pair.hauler.name)) continue;
      dropAssignments[pair.hauler.name] = pair.drop.id;
      pair.hauler.memory.dropTarget = pair.drop.id;
      assignedDrops.add(pair.drop.id);
      assignedHaulers.add(pair.hauler.name);
    }
  }

  // Match refill carriers to spawn/extension capacity as a room-wide job.
  // Reserving only while creeps execute lets an earlier, distant creep claim
  // the target before a later, adjacent creep. This plan assigns the closest
  // available carrier first and accounts for the capacity each load will use.
  const plannedRefillTargets = {};
  for (const room of Object.values(Game.rooms)) {
    const demandPlan = roomDemandPlans[room.name];
    if (!demandPlan) continue;
    const carriers = creeps.filter(creep =>
      creep.room.name === room.name &&
      demandPlan.assignments[creep.name] === 'refill' &&
      creep.store[RESOURCE_ENERGY] > 0);
    const targets = room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        (structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_EXTENSION) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    const remaining = {};
    for (const target of targets) {
      remaining[target.id] = target.store.getFreeCapacity(RESOURCE_ENERGY);
    }
    const assigned = new Set();
    // Once a carrier starts a refill trip, keep that reservation until the
    // target fills or the carrier unloads. Re-solving every tick can make two
    // approaching creeps exchange targets and reverse direction forever.
    for (const carrier of carriers) {
      const target = Game.getObjectById(carrier.memory.refillTarget);
      const isRefilling = carrier.memory.task === 'refill' ||
        carrier.memory.role === 'remote-hauler' &&
          carrier.memory.task === 'remote-haul';
      if (!isRefilling || !target ||
          remaining[target.id] === undefined || remaining[target.id] <= 0) {
        continue;
      }
      plannedRefillTargets[carrier.name] = target.id;
      remaining[target.id] -= Math.min(
        carrier.store[RESOURCE_ENERGY], remaining[target.id]);
      assigned.add(carrier.name);
    }
    const pairs = [];
    for (const carrier of carriers) {
      if (assigned.has(carrier.name)) continue;
      for (const target of targets) {
        pairs.push({
          carrier,
          target,
          distance: carrier.pos.getRangeTo(target)
        });
      }
    }
    pairs.sort((a, b) => a.distance - b.distance ||
      a.carrier.name.localeCompare(b.carrier.name));
    for (const pair of pairs) {
      if (assigned.has(pair.carrier.name) || remaining[pair.target.id] <= 0) {
        continue;
      }
      plannedRefillTargets[pair.carrier.name] = pair.target.id;
      remaining[pair.target.id] -= Math.min(
        pair.carrier.store[RESOURCE_ENERGY], remaining[pair.target.id]);
      assigned.add(pair.carrier.name);
    }
  }

  // Let logistics reserve source energy before general workers withdraw it.
  // The controller buffer remains protected for the dedicated upgrader.
  const taskPriority = creep =>
    (creep.memory.role === 'hauler' ||
      creep.memory.role === 'remote-hauler')
      ? 0 : creep.memory.role === 'upgrader'
        ? 1 : creep.memory.role === 'fixer' ? 2 : 3;
  const taskCreeps = creeps.slice().sort((a, b) =>
    taskPriority(a) - taskPriority(b));
  const reservedJobs = {
    build: {},
    repair: {}
  };
  const reservedRemoteSourceCoverage = {};
  const isSharedBuildTarget = target => target && target.room &&
    target.room.controller && target.structureType === STRUCTURE_CONTAINER &&
    target.pos.getRangeTo(target.room.controller) <= 3;
  const exclusiveClaimAvailable = (bucket, target, creepName) => target &&
    (isSharedBuildTarget(target) || !bucket[target.id] ||
      bucket[target.id] === creepName);
  const claimExclusive = (bucket, target, creepName) => {
    if (!exclusiveClaimAvailable(bucket, target, creepName)) return false;
    if (!isSharedBuildTarget(target)) bucket[target.id] = creepName;
    return true;
  };
  const releaseExclusive = (bucket, target, creepName) => {
    if (isSharedBuildTarget(target)) return;
    if (target && bucket[target.id] === creepName) delete bucket[target.id];
  };
  const retainTaskTarget = (creep, taskNames, memoryKey, valid) => {
    const target = Game.getObjectById(creep.memory[memoryKey]);
    if (taskNames.indexOf(creep.memory.task) === -1 || !valid(target)) {
      delete creep.memory[memoryKey];
      return null;
    }
    return target;
  };
  const retainExclusiveTarget = (creep, taskName, memoryKey, bucket, valid) => {
    const taskNames = Array.isArray(taskName) ? taskName : [taskName];
    const target = retainTaskTarget(creep, taskNames, memoryKey, valid);
    if (!claimExclusive(bucket, target, creep.name)) {
      delete creep.memory[memoryKey];
      return null;
    }
    return target;
  };
  for (const creep of taskCreeps) {
    retainTaskTarget(creep, ['refill', 'emergency-refill'], 'refillTarget',
      target => target && creep.store[RESOURCE_ENERGY] > 0 &&
        (target.structureType === STRUCTURE_SPAWN ||
          target.structureType === STRUCTURE_EXTENSION) &&
        target.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    retainExclusiveTarget(creep, ['build', 'dig-road'], 'buildTarget',
      reservedJobs.build,
      target => target && target.progressTotal !== undefined &&
        creep.store[RESOURCE_ENERGY] > 0);
    retainExclusiveTarget(creep, 'repair', 'repairTarget', reservedJobs.repair,
      target => target &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'fixer') &&
        hasWorkParts(creep) && target.hits < target.hitsMax &&
        creep.store[RESOURCE_ENERGY] > 0);
    const controllerPlan = creep.room.memory.controllerContainerPlan;
    retainTaskTarget(creep, ['withdraw'], 'withdrawTarget', target =>
      canWithdrawFrom(creep, target) &&
      (!controllerPlan || target.id !== controllerPlan.retireContainerId ||
        controllerPlan.drainCreep === creep.name) &&
      creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
      target.store[RESOURCE_ENERGY] > 0);
    retainTaskTarget(creep, ['supply-worker'], 'supplyTarget', target =>
      target && target.my && !target.spawning && target.name !== creep.name &&
      roomDemandPlans[creep.room.name] &&
      roomDemandPlans[creep.room.name].supplyTargets[creep.name] === target.name &&
      (target.memory.role === 'builder' || target.memory.role === 'fixer' ||
        target.memory.role === 'upgrader' || target.memory.role === 'worker') &&
      target.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
  }
  const executionCreeps = taskCreeps.slice().sort((a, b) =>
    Number(b.store.getUsedCapacity() > 0) -
      Number(a.store.getUsedCapacity() > 0) ||
    taskPriority(a) - taskPriority(b) || a.name.localeCompare(b.name));
  for (const creep of executionCreeps) {
    const controller = creep.room.controller;
    const demandPlan = roomDemandPlans[creep.room.name];
    const demandLane = demandPlan && demandPlan.assignments[creep.name];
    const incomingSupply = demandPlan &&
      demandPlan.incomingSupply[creep.name] || 0;
    creep.memory.demandLane = demandLane || 'none';
    creep.memory.incomingSupply = incomingSupply;
    const perform = (target, action, range = 1) => {
      const result = action(target);
      if (result === ERR_NOT_IN_RANGE) moveCreep(creep, target, range);
      if (result !== OK && result !== ERR_NOT_IN_RANGE) return false;
      creep.memory.taskTarget = target.id || target.name || target.structureType;
      return true;
    };
    const transferEnergy = (target, range = 1) => {
      const amount = reserveCapacityIn(target, creep.store[RESOURCE_ENERGY]);
      if (amount <= 0) return false;
      const result = creep.transfer(target, RESOURCE_ENERGY);
      if (result === ERR_NOT_IN_RANGE) moveCreep(creep, target, range);
      if (result !== OK && result !== ERR_NOT_IN_RANGE) {
        releaseAmount(reservedCapacity, target, amount);
        return false;
      }
      creep.memory.taskTarget = target.id || target.name || target.structureType;
      return true;
    };
    const scavenge = () => {
      if (creep.memory.role !== 'hauler' ||
          demandLane !== 'collect' ||
          creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;
      const drop = Game.getObjectById(dropAssignments[creep.name]);
      if (!drop) return false;
      return perform(drop, resource => creep.pickup(resource));
    };
    const selectPersistentTarget = (memoryKey, valid, findTarget) => {
      let target = Game.getObjectById(creep.memory[memoryKey]);
      if (!valid(target)) {
        delete creep.memory[memoryKey];
        target = findTarget();
      }
      if (target) creep.memory[memoryKey] = target.id;
      return target || null;
    };
    const getRefillTarget = extraFilter => {
      const valid = structure => structure &&
        (structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_EXTENSION) &&
        getUnreservedCapacity(structure) > 0 &&
        (!extraFilter || extraFilter(structure));
      const planned = Game.getObjectById(plannedRefillTargets[creep.name]);
      if (valid(planned)) {
        creep.memory.refillTarget = planned.id;
        return planned;
      }
      if (demandLane === 'refill') {
        // If the room-wide matcher left a carrier unmatched, claim only
        // genuinely unreserved capacity. This keeps it productive without
        // racing a closer carrier for an already committed extension.
        return selectPersistentTarget('refillTarget', valid, () =>
          creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: valid
          }));
      }
      return selectPersistentTarget('refillTarget', valid, () =>
        creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
          filter: valid
        }));
    };
    const getBuildTarget = extraFilter => {
      let target = Game.getObjectById(creep.memory.buildTarget);
      const tunnelSite = creep.memory.role === 'digger'
        ? getSource2TunnelSite(creep.room)
        : null;
      const valid = site => site && site.progressTotal !== undefined &&
        (!roadsPaused(creep.room) ||
          site.structureType !== STRUCTURE_ROAD ||
          tunnelSite && site.id === tunnelSite.id) &&
        (!extraFilter || extraFilter(site)) &&
        exclusiveClaimAvailable(reservedJobs.build, site, creep.name);
      if (!extraFilter && creep.room.controller) {
        const prioritySite = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
          filter: site => site.structureType === STRUCTURE_CONTAINER &&
            site.pos.getRangeTo(creep.room.controller) <= 3 &&
            exclusiveClaimAvailable(reservedJobs.build, site, creep.name)
        })[0];
        if (prioritySite && (!target || target.id !== prioritySite.id)) {
          releaseExclusive(reservedJobs.build, target, creep.name);
          target = prioritySite;
          creep.memory.buildTarget = prioritySite.id;
        }
      }
      if (!valid(target)) {
        delete creep.memory.buildTarget;
        target = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES, {
          filter: site => valid(site)
        });
      }
      if (!target) return null;
      if (!claimExclusive(reservedJobs.build, target, creep.name)) return null;
      creep.memory.buildTarget = target.id;
      return target;
    };
    const getRepairTarget = () => {
      const repairable = structure => structure &&
        structure.hits !== undefined && structure.hits < structure.hitsMax &&
        structure.structureType !== STRUCTURE_WALL &&
        structure.structureType !== STRUCTURE_RAMPART &&
        (!roadsPaused(creep.room) ||
          structure.structureType !== STRUCTURE_ROAD) &&
        (structure.structureType !== STRUCTURE_ROAD ||
          isHeatmapRoadPosition(creep.room, structure)) &&
        (structure.structureType !== STRUCTURE_CONTAINER ||
          getContainerPurpose(creep.room, structure.pos)) &&
        (structure.my || structure.structureType === STRUCTURE_ROAD ||
          structure.structureType === STRUCTURE_CONTAINER) &&
        exclusiveClaimAvailable(reservedJobs.repair, structure, creep.name);
      const target = selectPersistentTarget('repairTarget', repairable, () =>
        creep.pos.findClosestByPath(FIND_STRUCTURES, {
          filter: structure => repairable(structure) &&
            structure.hits < structure.hitsMax * 0.75
        }));
      if (!target) return null;
      if (!claimExclusive(reservedJobs.repair, target, creep.name)) return null;
      return target;
    };
    const getWorkerSupplyTarget = () => {
      if (creep.memory.role !== 'hauler' ||
          creep.store[RESOURCE_ENERGY] === 0) return null;
      const valid = worker => worker && worker.my && !worker.spawning &&
        worker.name !== creep.name && hasWorkParts(worker) &&
        (worker.memory.role === 'builder' || worker.memory.role === 'fixer' ||
          worker.memory.role === 'upgrader' || worker.memory.role === 'worker') &&
        getUnreservedCapacity(worker) > 0;
      const plannedName = demandPlan && demandPlan.supplyTargets[creep.name];
      const plannedTarget = plannedName && Game.creeps[plannedName];
      if (!valid(plannedTarget)) {
        delete creep.memory.supplyTarget;
        return null;
      }
      creep.memory.supplyTarget = plannedTarget.id;
      return plannedTarget;
    };
    const awaitPlannedSupply = () => {
      if (incomingSupply <= 0 ||
          creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 ||
          creep.memory.role === 'hauler' || creep.memory.role === 'miner' ||
          creep.memory.role === 'harvester' ||
          creep.memory.role === 'digger') return false;
      let anchor;
      if (demandLane === 'build') {
        anchor = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES, {
          filter: site => !roadsPaused(creep.room) ||
            site.structureType !== STRUCTURE_ROAD
        });
      } else if (demandLane === 'repair') {
        anchor = creep.pos.findClosestByPath(FIND_STRUCTURES, {
          filter: structure => structure.hits !== undefined &&
            structure.hits < structure.hitsMax * 0.75 &&
            structure.structureType !== STRUCTURE_WALL &&
            structure.structureType !== STRUCTURE_RAMPART &&
            (!roadsPaused(creep.room) ||
              structure.structureType !== STRUCTURE_ROAD)
        });
      }
      if (!anchor) anchor = controller;
      if (anchor && creep.pos.getRangeTo(anchor) > 3) {
        moveCreep(creep, anchor, 3);
      }
      const givers = Object.entries(demandPlan.supplyTargets)
        .filter(([, receiver]) => receiver === creep.name)
        .map(([giver]) => shortCreepName(giver));
      creep.memory.taskTarget = incomingSupply > 0
        ? `${incomingSupply} from ${givers.join(',')}`
        : 'queued for room supply';
      return true;
    };
    const storeEnergyInBuffer = () => {
      const energySources = Array.isArray(creep.memory.energySources)
        ? creep.memory.energySources
        : [];
      const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: structure =>
          (structure.structureType === STRUCTURE_STORAGE ||
            (structure.structureType === STRUCTURE_CONTAINER && controller &&
              structure.pos.getRangeTo(controller) <= 3)) &&
          energySources.indexOf(structure.id) === -1 &&
          getUnreservedCapacity(structure) > 0
      });
      return container ? transferEnergy(container) : false;
    };
    const stageAtSourceBuffer = () => {
      if (creep.memory.role !== 'hauler' ||
          demandLane !== 'collect-stage') return false;
      const sources = creep.room.find(FIND_SOURCES);
      const buffers = creep.room.find(FIND_STRUCTURES, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
          sources.some(source => source.pos.getRangeTo(structure) <= 1)
      }).sort((a, b) => creep.pos.getRangeTo(a) -
        creep.pos.getRangeTo(b) ||
        b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
      const buffer = buffers[0];
      if (!buffer) return false;
      if (creep.pos.getRangeTo(buffer) > 1) moveCreep(creep, buffer, 1);
      creep.memory.taskTarget = buffer.id;
      return true;
    };
    const storeRemoteDelivery = () => {
      const deliverySource2 = creep.memory.remoteDelivery === 's2'
        ? creep.room.find(FIND_SOURCES)
          .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y)[1]
        : null;
      const validBuffer = structure => structure &&
        structure.room.name === creep.room.name &&
        (structure.structureType === STRUCTURE_CONTAINER ||
          structure.structureType === STRUCTURE_STORAGE) &&
        getUnreservedCapacity(structure) > 0 &&
        (structure.structureType === STRUCTURE_STORAGE ||
          controller && structure.pos.getRangeTo(controller) <= 3 ||
          deliverySource2 && deliverySource2.pos.getRangeTo(structure) <= 1);
      let target = Game.getObjectById(creep.memory.remoteDeliveryTarget);
      if (!validBuffer(target)) {
        delete creep.memory.remoteDeliveryTarget;
        const candidates = creep.room.find(FIND_STRUCTURES, {
          filter: validBuffer
        }).sort((a, b) => creep.pos.getRangeTo(a) -
          creep.pos.getRangeTo(b) ||
          getUnreservedCapacity(b) - getUnreservedCapacity(a));
        target = candidates[0];
        if (target) creep.memory.remoteDeliveryTarget = target.id;
      }
      if (target) return transferEnergy(target);
      // If primary delivery buffers are full, unload into the nearest
      // purposeful room container. A loaded remote carrier must not camp at
      // the border waiting for distant demand to reopen.
      const overflow = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: structure =>
          structure.structureType === STRUCTURE_CONTAINER &&
          !isRetiringContainer(creep.room, structure) &&
          getContainerPurpose(creep.room, structure.pos) &&
          getUnreservedCapacity(structure) > 0
      });
      if (overflow) {
        creep.memory.remoteDeliveryTarget = overflow.id;
        return transferEnergy(overflow);
      }
      return storeEnergyInBuffer();
    };
    let tasks;
    if (creep.memory.role === 'claimer') {
      tasks = [{
        name: 'claim',
        run: () => {
          const targetRoomName = creep.memory.expansionTarget;
          if (!targetRoomName) return false;
          if (creep.room.name !== targetRoomName) {
            moveCreep(creep, new RoomPosition(25, 25, targetRoomName), 20);
            creep.memory.taskTarget = `${targetRoomName} controller`;
            return true;
          }
          const target = creep.room.controller;
          if (!target) return false;
          if (target.my) {
            const homeRoom = Game.rooms[creep.memory.home];
            if (homeRoom && homeRoom.memory.expansionPlan) {
              homeRoom.memory.expansionPlan.status = 'bootstrap';
            }
            creep.memory.taskTarget = `${targetRoomName} claimed`;
            return true;
          }
          const hostileReservation = target.reservation &&
            target.reservation.username !== creep.owner.username;
          const result = hostileReservation || target.owner
            ? creep.attackController(target)
            : creep.claimController(target);
          if (result === ERR_NOT_IN_RANGE) moveCreep(creep, target);
          if (result !== OK && result !== ERR_NOT_IN_RANGE &&
              result !== ERR_TIRED) return false;
          creep.memory.taskTarget = target.id;
          return true;
        }
      }];
    } else if (creep.memory.role === 'expansion-builder') {
      tasks = [{
        name: 'expansion-build',
        run: () => {
          const targetRoomName = creep.memory.expansionTarget;
          if (!targetRoomName) return false;
          if (creep.room.name !== targetRoomName) {
            moveCreep(creep, new RoomPosition(25, 25, targetRoomName), 20);
            creep.memory.taskTarget = `${targetRoomName} bootstrap`;
            return true;
          }
          const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
          if (spawn) {
            creep.memory.home = targetRoomName;
            creep.memory.role = 'worker';
            delete creep.memory.expansionTarget;
            creep.memory.taskTarget = `${spawn.name} established`;
            return true;
          }
          const site = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: candidate => candidate.structureType === STRUCTURE_SPAWN
          })[0];
          if (creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.expansionBuilding = false;
          } else if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            creep.memory.expansionBuilding = true;
          }
          if (creep.memory.expansionBuilding && site) {
            return perform(site, target => creep.build(target), 3);
          }
          const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
          if (source && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return perform(source, target => creep.harvest(target));
          }
          if (site && creep.store[RESOURCE_ENERGY] > 0) {
            creep.memory.expansionBuilding = true;
            return perform(site, target => creep.build(target), 3);
          }
          creep.memory.taskTarget = site
            ? `${site.id} waiting energy`
            : `${targetRoomName} waiting spawn site`;
          return true;
        }
      }];
    } else if (creep.memory.role === 'remote-scout') {
      tasks = [{
        name: 'remote-scout',
        run: () => {
          delete creep.memory.remoteAction;
          const homeRoomName = creep.memory.remoteHome || creep.memory.home;
          const targetRoomName = creep.memory.remoteRoom;
          if (!homeRoomName || !targetRoomName) return false;
          const travelTo = roomName => {
            creep.memory.remoteAction = 'Travel';
            moveCreep(creep, new RoomPosition(25, 25, roomName), 20);
            creep.memory.taskTarget = `${roomName} travel`;
            return true;
          };
          // Remote miners stay at their assigned source. Haulers own the trip
          // home, so an old shuttle flag must never pull a miner off L1/L2.
          delete creep.memory.remoteReturning;
          if (creep.room.name !== targetRoomName) return travelTo(targetRoomName);
          const remoteSources = creep.room.find(FIND_SOURCES)
            .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
          if (remoteSources.length === 0) {
            creep.memory.remoteAction = 'Wait';
            creep.memory.taskTarget = `${targetRoomName} no sources`;
            return true;
          }
          const slot = Number.isInteger(creep.memory.remoteSlot)
            ? creep.memory.remoteSlot : 0;
          const source = remoteSources[slot % remoteSources.length];
          if (creep.memory.remoteSource !== source.id) {
            creep.memory.remoteSource = source.id;
            creep.memory.remoteFoundTick = Game.time;
            console.log(`[${Game.time}] ${creep.name} found remote source ` +
              `${slot % remoteSources.length + 1} in ${targetRoomName} at ` +
              `${source.pos.x},${source.pos.y}`);
          }
          const misplacedSites = source.pos.findInRange(
            FIND_MY_CONSTRUCTION_SITES, 2, {
              filter: site => site.structureType === STRUCTURE_CONTAINER &&
                source.pos.getRangeTo(site) > 1
            });
          for (const site of misplacedSites) {
            if (site.remove() === OK) {
              console.log(`[${Game.time}] Removed remote container site at ` +
                `${targetRoomName} ${site.pos.x},${site.pos.y}; replacing adjacent`);
            }
          }
          const sourceContainers = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: structure => structure.structureType === STRUCTURE_CONTAINER
          }).sort((a, b) =>
            b.store.getFreeCapacity(RESOURCE_ENERGY) -
            a.store.getFreeCapacity(RESOURCE_ENERGY));
          let container = sourceContainers[0];
          let containerSite = source.pos.findInRange(
            FIND_MY_CONSTRUCTION_SITES, 1, {
              filter: site => site.structureType === STRUCTURE_CONTAINER
            })[0];
          if (!container && !containerSite) {
            const terrain = creep.room.getTerrain();
            const candidates = [];
            for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
              for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
                if (x === source.pos.x && y === source.pos.y ||
                    terrain.get(x, y) === TERRAIN_MASK_WALL ||
                    creep.room.lookForAt(LOOK_STRUCTURES, x, y).length > 0 ||
                    creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) {
                  continue;
                }
                candidates.push({ x, y, range: creep.pos.getRangeTo(x, y) });
              }
            }
            candidates.sort((a, b) => a.range - b.range);
            for (const candidate of candidates) {
              if (creep.room.createConstructionSite(candidate.x, candidate.y,
                STRUCTURE_CONTAINER) === OK) {
                creep.memory.remoteAction = 'Site';
                containerSite = creep.room.lookForAt(LOOK_CONSTRUCTION_SITES,
                  candidate.x, candidate.y)[0];
                console.log(`[${Game.time}] ${creep.name} placed remote ` +
                  `container at ${targetRoomName} ${candidate.x},${candidate.y}`);
                break;
              }
            }
          }
          if (container && !containerSite && sourceContainers.length < 2 &&
              sourceContainers.every(candidate =>
                candidate.store.getFreeCapacity(RESOURCE_ENERGY) === 0) &&
              creep.store[RESOURCE_ENERGY] > 0) {
            const terrain = creep.room.getTerrain();
            const candidates = [];
            for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
              for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
                if (x === source.pos.x && y === source.pos.y ||
                    terrain.get(x, y) === TERRAIN_MASK_WALL ||
                    creep.room.lookForAt(LOOK_STRUCTURES, x, y).length > 0 ||
                    creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)
                      .length > 0) continue;
                candidates.push({ x, y, range: creep.pos.getRangeTo(x, y) });
              }
            }
            candidates.sort((a, b) => a.range - b.range);
            for (const candidate of candidates) {
              if (creep.room.createConstructionSite(candidate.x, candidate.y,
                STRUCTURE_CONTAINER) === OK) {
                creep.memory.remoteAction = 'Site';
                containerSite = creep.room.lookForAt(LOOK_CONSTRUCTION_SITES,
                  candidate.x, candidate.y)[0];
                console.log(`[${Game.time}] ${creep.name} placed remote ` +
                  `overflow container at ${targetRoomName} ` +
                  `${candidate.x},${candidate.y}`);
                break;
              }
            }
          }
          if (!containerSite) {
            delete creep.memory.remoteContainerBuilding;
          } else if (creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.remoteContainerBuilding = false;
          } else if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 ||
              source.energy === 0) {
            creep.memory.remoteContainerBuilding = true;
          }
          if (containerSite && creep.memory.remoteContainerBuilding &&
              creep.store[RESOURCE_ENERGY] > 0) {
            creep.memory.remoteAction = 'BuildC';
            return perform(containerSite, site => creep.build(site), 3);
          }
          if (container && creep.store[RESOURCE_ENERGY] > 0 &&
              (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 ||
                source.energy === 0) &&
              getUnreservedCapacity(container) > 0) {
            creep.memory.remoteAction = 'Store';
            return transferEnergy(container);
          }
          if (creep.pos.getRangeTo(source) > 1) {
            creep.memory.remoteAction = 'Mine';
            moveCreep(creep, source, 1);
            creep.memory.taskTarget = source.id;
            return true;
          }
          if (source.energy > 0 &&
              creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            creep.memory.remoteAction = 'Mine';
            return perform(source, target => creep.harvest(target));
          }
          if (container && creep.store[RESOURCE_ENERGY] > 0) {
            if (getUnreservedCapacity(container) > 0) {
              creep.memory.remoteAction = 'Store';
              return transferEnergy(container);
            }
          }
          if (container && creep.store[RESOURCE_ENERGY] > 0) {
            creep.memory.remoteAction = 'Wait';
            creep.memory.taskTarget = `${container.id} full; no overflow`;
            return true;
          }
          creep.memory.remoteAction = 'Wait';
          creep.memory.taskTarget = `${source.id} regen ` +
            `${source.ticksToRegeneration}`;
          return true;
        }
      }];
    } else if (creep.memory.role === 'remote-hauler') {
      tasks = [{
        name: 'remote-haul',
        run: () => {
          const homeRoomName = creep.memory.remoteHome || creep.memory.home;
          const targetRoomName = creep.memory.remoteRoom;
          if (!homeRoomName || !targetRoomName) return false;
          const travelTo = roomName => {
            moveCreep(creep, new RoomPosition(25, 25, roomName), 20);
            creep.memory.taskTarget = `${roomName} haul`;
            return true;
          };
          const slot = Number.isInteger(creep.memory.remoteHaulerSlot)
            ? creep.memory.remoteHaulerSlot : 0;
          const readiness = getRemoteHaulReadiness(targetRoomName, slot);
          // Direction is cargo-driven, not readiness-driven. A readiness
          // threshold can fluctuate as other haulers withdraw; it must never
          // send a partially loaded creep back across the same border.
          if (creep.room.name === homeRoomName &&
              creep.store[RESOURCE_ENERGY] > 0) {
            creep.memory.remoteHaulReturning = true;
          }
          const pitchInLocally = () => {
            if (!hasWorkParts(creep) || creep.store[RESOURCE_ENERGY] === 0 ||
                !controller || !controller.my) return false;
            const site = getBuildTarget();
            if (site) return perform(site, target => creep.build(target), 3);
            const repairTarget = getRepairTarget();
            if (repairTarget) {
              return perform(repairTarget,
                target => creep.repair(target), 3);
            }
            return perform(controller,
              target => creep.upgradeController(target), 3);
          };
          if (!readiness.ready) {
            if (creep.store[RESOURCE_ENERGY] === 0) {
              delete creep.memory.remoteHaulReturning;
            } else {
              creep.memory.remoteHaulReturning = true;
            }
            if (creep.room.name !== homeRoomName) return travelTo(homeRoomName);
            if (creep.store[RESOURCE_ENERGY] > 0) {
              const refillTarget = getRefillTarget();
              if (refillTarget) return transferEnergy(refillTarget);
              if (storeRemoteDelivery()) return true;
              const recipient = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
                filter: worker => worker.name !== creep.name &&
                  hasWorkParts(worker) && getUnreservedCapacity(worker) > 0 &&
                  creep.pos.getRangeTo(worker) <= 8
              });
              if (recipient) return transferEnergy(recipient);
              if (pitchInLocally()) return true;
            } else {
              const localPickupThreshold = Math.min(CARRY_CAPACITY,
                creep.store.getCapacity(RESOURCE_ENERGY));
              const localSources = creep.room.find(FIND_SOURCES);
              const localContainers = creep.room.find(FIND_STRUCTURES, {
                filter: structure =>
                  structure.structureType === STRUCTURE_CONTAINER &&
                  canWithdrawFrom(creep, structure) &&
                  getUnreservedEnergy(structure) >= localPickupThreshold &&
                  localSources.some(source =>
                    source.pos.getRangeTo(structure) <= 1)
              }).sort((a, b) => {
                const aCapacity = a.store.getCapacity(RESOURCE_ENERGY) || 1;
                const bCapacity = b.store.getCapacity(RESOURCE_ENERGY) || 1;
                const pressure = getUnreservedEnergy(b) / bCapacity -
                  getUnreservedEnergy(a) / aCapacity;
                return creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b) ||
                  pressure;
              });
              const localContainer = localContainers[0];
              if (localContainer) {
                const amount = reserveEnergyFrom(localContainer,
                  creep.store.getFreeCapacity(RESOURCE_ENERGY));
                if (amount > 0) {
                  const result = creep.withdraw(localContainer, RESOURCE_ENERGY);
                  if (result === ERR_NOT_IN_RANGE) {
                    moveCreep(creep, localContainer);
                  } else if (result !== OK) {
                    releaseAmount(reservedEnergy, localContainer, amount);
                  }
                  creep.memory.taskTarget = `${localContainer.id} ` +
                    `(local until L${slot + 1}: ${readiness.reason})`;
                  return true;
                }
              }
            }
            creep.memory.taskTarget = `local until L${slot + 1}: ` +
              readiness.reason;
            return true;
          }
          if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            creep.memory.remoteHaulReturning = true;
          }
          if (creep.memory.remoteHaulReturning) {
            if (creep.room.name !== homeRoomName) return travelTo(homeRoomName);
            if (creep.store[RESOURCE_ENERGY] > 0) {
              const refillTarget = getRefillTarget();
              if (refillTarget) return transferEnergy(refillTarget);
              if (storeRemoteDelivery()) return true;
              const recipient = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
                filter: worker => worker.name !== creep.name &&
                  hasWorkParts(worker) &&
                  (worker.memory.role === 'builder' ||
                    worker.memory.role === 'fixer' ||
                    worker.memory.role === 'upgrader' ||
                    worker.memory.role === 'worker') &&
                  getUnreservedCapacity(worker) > 0 &&
                  creep.pos.getRangeTo(worker) <= 8
              });
              if (recipient) return transferEnergy(recipient);
              if (pitchInLocally()) return true;
              creep.memory.taskTarget = 'home delivery full';
              return true;
            }
            delete creep.memory.remoteHaulReturning;
          }
          if (creep.room.name !== targetRoomName) return travelTo(targetRoomName);
          const sources = creep.room.find(FIND_SOURCES)
            .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
          if (sources.length === 0) {
            creep.memory.taskTarget = `${targetRoomName} no source`;
            return true;
          }
          const source = sources[slot % sources.length];
          const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: structure => structure.structureType === STRUCTURE_CONTAINER
          })[0];
          if (!container) {
            const site = source.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {
              filter: candidate => candidate.structureType === STRUCTURE_CONTAINER
            })[0];
            const remoteBuilder = Object.values(Game.creeps).find(worker =>
              worker.memory.role === 'remote-scout' &&
              worker.memory.remoteRoom === targetRoomName &&
              worker.memory.remoteSlot === slot &&
              worker.room.name === targetRoomName &&
              getUnreservedCapacity(worker) > 0);
            if (remoteBuilder && creep.store[RESOURCE_ENERGY] > 0) {
              return transferEnergy(remoteBuilder);
            }
            if (site && creep.pos.getRangeTo(site) > 3) moveCreep(creep, site, 3);
            creep.memory.taskTarget = site
              ? `${site.id} waiting for container`
              : `${source.id} waiting for container`;
            return true;
          }
          if (getUnreservedEnergy(container) > 0 &&
              creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            const amount = reserveEnergyFrom(container,
              creep.store.getFreeCapacity(RESOURCE_ENERGY));
            if (amount <= 0) return true;
            const result = creep.withdraw(container, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
              moveCreep(creep, container);
              creep.memory.taskTarget = container.id;
              return true;
            }
            if (result !== OK) {
              releaseAmount(reservedEnergy, container, amount);
              return false;
            }
            creep.memory.taskTarget = container.id;
            return true;
          }
          if (creep.store[RESOURCE_ENERGY] > 0) {
            creep.memory.remoteHaulReturning = true;
            return travelTo(homeRoomName);
          }
          const sourceCovered = Object.values(Game.creeps).some(worker =>
            worker.memory.role === 'remote-scout' &&
            worker.memory.remoteRoom === targetRoomName &&
            worker.memory.remoteSlot === slot % sources.length &&
            worker.room.name === targetRoomName &&
            worker.pos.getRangeTo(source) <= 1);
          if (hasWorkParts(creep) && !sourceCovered && source.energy > 0 &&
              creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return perform(source, target => creep.harvest(target));
          }
          creep.memory.taskTarget = `${container.id} empty`;
          return true;
        }
      }];
    } else if (creep.memory.role === 'remote-builder') {
      tasks = [{
        name: 'remote-road',
        run: () => {
          const homeRoom = Game.rooms[creep.memory.home];
          const plan = homeRoom && (creep.memory.remoteTeam === 'south'
            ? homeRoom.memory.southRemoteRoadPlan
            : creep.memory.remoteTeam === 'southwest'
              ? homeRoom.memory.southwestRemoteRoadPlan
              : homeRoom.memory.remoteRoadPlan);
          const slot = Number.isInteger(creep.memory.remoteBuilderSlot)
            ? creep.memory.remoteBuilderSlot : 0;
          const path = plan && plan.paths &&
            (plan.paths.find(candidate => candidate.slot === slot) ||
              plan.paths[0]);
          if (!homeRoom) return false;
          if (creep.room.name === creep.memory.remoteRoom) {
            const remoteSources = creep.room.find(FIND_SOURCES)
              .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
            const uncoveredSource = remoteSources.find((source, sourceSlot) =>
              !reservedRemoteSourceCoverage[source.id] &&
              source.energy > 0 &&
              !Object.values(Game.creeps).some(worker =>
                worker.memory.role === 'remote-scout' &&
                worker.memory.remoteRoom === creep.memory.remoteRoom &&
                worker.memory.remoteSlot === sourceSlot &&
                worker.room.name === creep.memory.remoteRoom &&
                worker.pos.getRangeTo(source) <= 1));
            if (uncoveredSource) {
              reservedRemoteSourceCoverage[uncoveredSource.id] = creep.name;
              const container = uncoveredSource.pos.findInRange(
                FIND_STRUCTURES, 1, {
                  filter: structure =>
                    structure.structureType === STRUCTURE_CONTAINER &&
                    getUnreservedCapacity(structure) > 0
                })[0];
              if (container && creep.store[RESOURCE_ENERGY] > 0 &&
                  (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 ||
                    uncoveredSource.energy === 0)) {
                return transferEnergy(container);
              }
              if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                return perform(uncoveredSource,
                  target => creep.harvest(target));
              }
              if (container && creep.store[RESOURCE_ENERGY] > 0) {
                return transferEnergy(container);
              }
            }
          }
          if (!path) {
            const targetRoomName = creep.memory.remoteRoom;
            if (!targetRoomName) return false;
            if (creep.room.name !== targetRoomName) {
              moveCreep(creep,
                new RoomPosition(25, 25, targetRoomName), 20);
            }
            creep.memory.taskTarget = `${targetRoomName} survey road`;
            return true;
          }
          const roadSites = [];
          const seenSiteIds = new Set();
          const orderedPaths = [path, ...(plan.paths || []).filter(candidate =>
            candidate !== path)];
          for (const candidatePath of orderedPaths) {
            for (const point of candidatePath.points) {
              const visibleRoom = Game.rooms[point.roomName];
              if (!visibleRoom) continue;
              const site = visibleRoom.lookForAt(LOOK_CONSTRUCTION_SITES,
                point.x, point.y).find(candidate =>
                candidate.structureType === STRUCTURE_ROAD);
              if (!site || seenSiteIds.has(site.id)) continue;
              roadSites.push(site);
              seenSiteIds.add(site.id);
            }
          }
          // Unplanned fallback work belongs inside the outpost. Home-room road
          // sites outside the saved corridor may be specialized jobs (such as
          // the S2 wall tunnel) and must not pull a remote builder back and
          // forth across the exit.
          const corridorRooms = [Game.rooms[creep.memory.remoteRoom]]
            .filter(Boolean);
          for (const corridorRoom of corridorRooms) {
            for (const site of corridorRoom.find(
              FIND_MY_CONSTRUCTION_SITES, {
                filter: candidate =>
                  (candidate.structureType === STRUCTURE_ROAD ||
                    candidate.structureType === STRUCTURE_CONTAINER)
              })) {
              if (seenSiteIds.has(site.id)) continue;
              roadSites.push(site);
              seenSiteIds.add(site.id);
            }
          }
          // Once the outpost corridor and its containers are complete, bring
          // the remote builder home for core capacity work instead of leaving
          // it parked in an empty remote queue.
          if (roadSites.length === 0) {
            for (const extensionSite of homeRoom.find(
              FIND_MY_CONSTRUCTION_SITES, {
                filter: candidate =>
                  candidate.structureType === STRUCTURE_EXTENSION
              })) {
              roadSites.push(extensionSite);
              seenSiteIds.add(extensionSite.id);
            }
          }
          if (!homeRoom.memory.remoteBuildTargets) {
            homeRoom.memory.remoteBuildTargets = {};
          }
          const teamKey = creep.memory.remoteTeam || creep.memory.remoteRoom;
          const targetKey = `${teamKey}:${creep.name}`;
          let site = Game.getObjectById(
            homeRoom.memory.remoteBuildTargets[targetKey]);
          if (!site || !seenSiteIds.has(site.id)) {
            const travelScore = candidate => {
              if (candidate.room.name === creep.room.name) {
                return creep.pos.getRangeTo(candidate);
              }
              return 1000 + Game.map.getRoomLinearDistance(
                creep.room.name, candidate.room.name) * 50;
            };
            site = roadSites.slice().sort((a, b) =>
              travelScore(a) - travelScore(b) ||
              (a.structureType === STRUCTURE_CONTAINER ? 0 : 1) -
                (b.structureType === STRUCTURE_CONTAINER ? 0 : 1) ||
              (a.progressTotal - a.progress) -
                (b.progressTotal - b.progress) ||
              a.room.name.localeCompare(b.room.name) ||
              a.pos.x - b.pos.x || a.pos.y - b.pos.y)[0];
            if (site) homeRoom.memory.remoteBuildTargets[targetKey] = site.id;
            else delete homeRoom.memory.remoteBuildTargets[targetKey];
          }
          delete homeRoom.memory.remoteBuildTargets[teamKey];
          if (creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.remoteRoadBuilding = false;
          } else if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            creep.memory.remoteRoadBuilding = true;
          }
          if (site && creep.store[RESOURCE_ENERGY] > 0) {
            creep.memory.remoteRoadBuilding = true;
          }
          if (creep.memory.remoteRoadBuilding &&
              creep.store[RESOURCE_ENERGY] > 0 && site) {
            if (!reservedJobs.build[site.id]) {
              reservedJobs.build[site.id] = creep.name;
            }
            creep.memory.buildTarget = site.id;
            const onExit = creep.pos.x === 0 || creep.pos.x === 49 ||
              creep.pos.y === 0 || creep.pos.y === 49;
            if (onExit && site.room.name === creep.room.name) {
              // Do not remain on an exit tile while working: the border
              // transition can send the creep back to the adjacent room.
              const inwardRange = Math.max(0,
                Math.min(2, creep.pos.getRangeTo(site) - 1));
              moveCreep(creep, site, inwardRange);
            }
            return perform(site, target => creep.build(target), 3);
          }
          if (!creep.memory.remoteRoadBuilding &&
              creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            const targetRoomName = creep.memory.remoteRoom;
            if (site && site.structureType === STRUCTURE_EXTENSION &&
                creep.room.name === homeRoom.name) {
              const supply = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: structure =>
                  (structure.structureType === STRUCTURE_CONTAINER ||
                    structure.structureType === STRUCTURE_STORAGE) &&
                  getUnreservedEnergy(structure) > 0
              });
              if (supply) {
                const amount = reserveEnergyFrom(supply,
                  creep.store.getFreeCapacity(RESOURCE_ENERGY));
                if (amount > 0) {
                  const result = creep.withdraw(supply, RESOURCE_ENERGY);
                  if (result === ERR_NOT_IN_RANGE) {
                    moveCreep(creep, supply);
                    creep.memory.taskTarget = supply.id;
                    return true;
                  }
                  if (result === OK) {
                    creep.memory.taskTarget = supply.id;
                    return true;
                  }
                  releaseAmount(reservedEnergy, supply, amount);
                }
              }
            }
            if (creep.room.name !== targetRoomName) {
              moveCreep(creep, new RoomPosition(25, 25, targetRoomName), 20);
              creep.memory.taskTarget = `${targetRoomName} road energy`;
              return true;
            }
            const sources = creep.room.find(FIND_SOURCES)
              .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
            const source = sources[slot % Math.max(1, sources.length)];
            const container = source && source.pos.findInRange(
              FIND_STRUCTURES, 1, {
                filter: structure =>
                  structure.structureType === STRUCTURE_CONTAINER &&
                  getUnreservedEnergy(structure) > 0
              })[0];
            if (container) {
              const amount = reserveEnergyFrom(container,
                creep.store.getFreeCapacity(RESOURCE_ENERGY));
              if (amount > 0) {
                const result = creep.withdraw(container, RESOURCE_ENERGY);
                if (result === ERR_NOT_IN_RANGE) {
                  moveCreep(creep, container);
                  creep.memory.taskTarget = container.id;
                  return true;
                }
                if (result === OK) {
                  creep.memory.taskTarget = container.id;
                  return true;
                }
                releaseAmount(reservedEnergy, container, amount);
              }
            }
            if (source && source.energy > 0) {
              return perform(source, target => creep.harvest(target));
            }
          }
          if (site) {
            moveCreep(creep, site, 3);
            creep.memory.taskTarget = site.id;
            return true;
          }
          const onRoomExit = creep.pos.x === 0 || creep.pos.x === 49 ||
            creep.pos.y === 0 || creep.pos.y === 49;
          if (creep.room.name === creep.memory.remoteRoom && onRoomExit) {
            // Finish the crossing by stepping into the room. Waiting on the
            // arrival edge lets congestion push the builder straight back
            // across the border when there is not yet a visible site.
            moveCreep(creep,
              new RoomPosition(25, 25, creep.memory.remoteRoom), 20);
            creep.memory.taskTarget = `${creep.memory.remoteRoom} enter room`;
            return true;
          }
          // A loaded builder may remember that it is in building mode while
          // every remaining site is in the still-invisible outpost. Do not
          // leave it waiting on the home-side exit just because no target can
          // be resolved until it crosses the room boundary.
          if (creep.room.name !== creep.memory.remoteRoom) {
            moveCreep(creep,
              new RoomPosition(25, 25, creep.memory.remoteRoom), 20);
            creep.memory.taskTarget = `${creep.memory.remoteRoom} road queue`;
            return true;
          }
          creep.memory.taskTarget = `L${slot + 1} road queue`;
          return true;
        }
      }];
    } else if (creep.memory.role === 'miner') {
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
              moveCreep(creep, station, 0);
              creep.memory.taskTarget = `${source.id}@${station.x},${station.y}`;
              return true;
            }
            const depositContainers = creep.pos.findInRange(
              FIND_STRUCTURES, 1, {
                filter: structure =>
                  structure.structureType === STRUCTURE_CONTAINER &&
                  !isRetiringContainer(creep.room, structure) &&
                  // A range-2 container can still be reached from a tile that
                  // remains adjacent to the source, so use it as overflow.
                  source.pos.getRangeTo(structure) <= 2 &&
                  getUnreservedCapacity(structure) > 0
              }).sort((a, b) =>
              getUnreservedCapacity(b) - getUnreservedCapacity(a));
            const depositContainer = depositContainers[0];
            if (!depositContainer) {
              // A temporarily full buffer is not a reason to leave harvest
              // capacity unused. Finish filling CARRY while a hauler makes
              // space, then wait without dropping.
              if (source.energy > 0 &&
                  creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                return perform(source, target => creep.harvest(target));
              }
              creep.memory.taskTarget = `${container.id} (all buffers full)`;
              return true;
            }
            if (creep.store[RESOURCE_ENERGY] > 0 &&
                (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 || source.energy === 0)) {
              return transferEnergy(depositContainer);
            }
            if (source.energy > 0 && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
              return perform(source, target => creep.harvest(target));
            }
            if (creep.store[RESOURCE_ENERGY] > 0) {
              return transferEnergy(depositContainer);
            }
            creep.memory.taskTarget = source.id;
            return true;
          }
        }
      ];
    } else if (creep.memory.role === 'harvester') {
      // Stay at the assigned source, filling its container for mobile haulers.
      tasks = [
        {
          name: 'source-work',
          run: () => {
            delete creep.memory.sourceAction;
            const assignment = findHarvestAssignment(creep);
            const preferredSource = Game.getObjectById(creep.memory.preferredSource);
            const source = assignment ? assignment.source : preferredSource;
            if (!source) return false;
            if (creep.pos.getRangeTo(source) > 5) {
              moveCreep(creep, source, 1);
              creep.memory.taskTarget = `${source.id} (returning)`;
              return true;
            }
            const containers = creep.room.find(FIND_STRUCTURES, {
              filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
                !isRetiringContainer(creep.room, structure) &&
                source.pos.getRangeTo(structure) <= 2
            });
            const availableContainers = containers.filter(structure =>
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
            const container = availableContainers.length
              ? availableContainers.sort((a, b) =>
                b.store.getFreeCapacity(RESOURCE_ENERGY) -
                  a.store.getFreeCapacity(RESOURCE_ENERGY) ||
                creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b))[0]
              : creep.pos.findClosestByRange(containers);
            const buildOverflowContainer = () => {
              delete creep.memory.containerSiteError;
              const existingSite = getBuildTarget(site =>
                site.structureType === STRUCTURE_CONTAINER &&
                source.pos.getRangeTo(site) <= 1);
              if (existingSite) {
                return perform(existingSite, site => creep.build(site), 3);
              }
              if (!creep.room.controller || !creep.room.controller.my ||
                  creep.room.controller.level < 2) {
                creep.memory.containerSiteError = 'requires RCL 2';
                return false;
              }

              const terrain = creep.room.getTerrain();
              const candidates = [];
              for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
                for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
                  if (x < 0 || x > 49 || y < 0 || y > 49 ||
                      terrain.get(x, y) === TERRAIN_MASK_WALL ||
                      source.pos.getRangeTo(x, y) > 1 ||
                      (x === source.pos.x && y === source.pos.y) ||
                      creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) {
                    continue;
                  }
                  candidates.push({
                    x,
                    y,
                    range: creep.pos.getRangeTo(x, y)
                  });
                }
              }
              candidates.sort((a, b) => a.range - b.range);
              const placementResults = new Set();
              for (const candidate of candidates) {
                const result = creep.room.createConstructionSite(
                  candidate.x, candidate.y, STRUCTURE_CONTAINER);
                if (result === OK) {
                  creep.memory.taskTarget =
                    `container site at ${candidate.x},${candidate.y}`;
                  return true;
                }
                placementResults.add(result);
              }
              const failedAtContainerLimit = placementResults.has(ERR_RCL_NOT_ENOUGH);
              const currentPopulation = Object.values(Game.creeps)
                .filter(worker => worker.memory.home === creep.room.name).length;
              if (Number.isInteger(
                creep.room.memory.containerHaulerPendingTarget) &&
                  currentPopulation >=
                    creep.room.memory.containerHaulerPendingTarget) {
                delete creep.room.memory.containerHaulerPendingTarget;
              }
              const roomEnergyFull = creep.room.energyAvailable ===
                creep.room.energyCapacityAvailable;
              if (failedAtContainerLimit && roomEnergyFull &&
                  !Number.isInteger(
                    creep.room.memory.containerHaulerPendingTarget)) {
                const currentTarget = getWorkerLimits(creep.room).workerLimit;
                const requestedPopulation = currentPopulation + 1;
                const increasedTarget = Math.max(currentTarget, requestedPopulation);
                creep.room.memory.workerTarget = increasedTarget;
                creep.room.memory.containerHaulerPendingTarget =
                  requestedPopulation;
                delete creep.room.memory.containerMaxedBoostLevel;
                console.log(`[${Game.time}] ${creep.room.name} energy and ` +
                  `containers full; requesting hauler ${requestedPopulation}/` +
                  `${increasedTarget}`);
              }
              const errorNames = {
                [ERR_FULL]: 'construction-site limit reached',
                [ERR_INVALID_TARGET]: 'no legal adjacent source tile',
                [ERR_RCL_NOT_ENOUGH]: 'container limit reached for this RCL',
                [ERR_NOT_OWNER]: 'room not owned'
              };
              const failureResult = failedAtContainerLimit
                ? ERR_RCL_NOT_ENOUGH
                : placementResults.has(ERR_FULL)
                  ? ERR_FULL
                  : placementResults.has(ERR_INVALID_TARGET)
                    ? ERR_INVALID_TARGET
                    : [...placementResults][0] || ERR_INVALID_TARGET;
              creep.memory.containerSiteError =
                errorNames[failureResult] || `create error ${failureResult}`;
              return false;
            };
            const refillNearby = () => {
              const target = getRefillTarget(structure =>
                source.pos.getRangeTo(structure) <= 5);
              if (!target) return false;
              const refilling = transferEnergy(target);
              if (refilling) creep.memory.sourceAction = 'Fill';
              return refilling;
            };
            if (creep.store[RESOURCE_ENERGY] === 0) {
              delete creep.memory.cleanupEnergy;
            }
            const droppedEnergy = creep.pos.findClosestByRange(
              FIND_DROPPED_RESOURCES, {
                filter: resource => resource.resourceType === RESOURCE_ENERGY &&
                  resource.amount > 0 && creep.pos.getRangeTo(resource) <= 1
              });
            if (droppedEnergy &&
                creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
              const collecting = perform(droppedEnergy,
                resource => creep.pickup(resource));
              if (collecting) creep.memory.cleanupEnergy = true;
              return collecting;
            }
            const shouldUnload = creep.store[RESOURCE_ENERGY] >= CARRY_CAPACITY ||
              creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 ||
              source.energy === 0 || creep.memory.cleanupEnergy;
            if (creep.store[RESOURCE_ENERGY] > 0 && shouldUnload) {
              if (container) {
                if (getUnreservedCapacity(container) === 0) {
                  if (buildOverflowContainer()) return true;
                  if (refillNearby()) return true;
                  creep.memory.taskTarget =
                    `${container.id} (full; ${creep.memory.containerSiteError ||
                      'holding'})`;
                  return true;
                }
                // Move into transfer range instead of dropping just because the
                // assigned harvesting tile is on the far side of the source.
                return transferEnergy(container);
              }
              if (buildOverflowContainer()) return true;
              if (refillNearby()) return true;
              creep.memory.taskTarget =
                `${source.id} (holding; ${creep.memory.containerSiteError ||
                  'container unavailable'})`;
              return true;
            }
            if (assignment &&
                (creep.pos.x !== assignment.x || creep.pos.y !== assignment.y)) {
              moveCreep(creep, new RoomPosition(
                assignment.x, assignment.y, creep.room.name), 0);
              creep.memory.taskTarget =
                `${source.id}@${assignment.x},${assignment.y}`;
              return true;
            }
            if (assignment && source.energy > 0 &&
                creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
              return perform(source, target => creep.harvest(target));
            }
            if (source.energy > 0 &&
                creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
              if (creep.pos.getRangeTo(source) <= 1) {
                return perform(source, target => creep.harvest(target));
              }
              moveCreep(creep, source, 1);
              creep.memory.taskTarget = `${source.id} (returning)`;
              return true;
            }
            if (source.energy === 0) {
              creep.memory.taskTarget =
                `${source.id} (regen ${source.ticksToRegeneration})`;
              return true;
            }
            return false;
          }
        }
      ];
    } else if (creep.memory.working && creep.memory.role === 'digger') {
      tasks = [
        {
          name: 'dig-road',
          run: () => {
            const site = Game.getObjectById(creep.memory.diggerTarget) ||
              getSource2TunnelSite(creep.room);
            if (!site) return false;
            creep.memory.diggerTarget = site.id;
            const target = getBuildTarget(candidate => candidate.id === site.id);
            return target
              ? perform(target, road => creep.build(road), 3)
              : false;
          }
        }
      ];
    } else if (creep.memory.working && creep.memory.role === 'builder') {
      tasks = [
        {
          name: 'refill',
          run: () => {
            if (demandLane !== 'refill') return false;
            const target = getRefillTarget();
            return target ? transferEnergy(target) : false;
          }
        },
        {
          name: 'build',
          run: () => {
            if (demandLane !== 'build') return false;
            const nonRoadSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
              filter: site => site.structureType !== STRUCTURE_ROAD
            });
            const tunnelSite = getSource2TunnelSite(creep.room);
            const roadSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
              filter: site => site.structureType === STRUCTURE_ROAD &&
                (!tunnelSite || site.id !== tunnelSite.id)
            });
            const roadCrew = creep.room.find(FIND_MY_CREEPS, {
              filter: worker => worker.memory.role === 'builder'
            }).sort((a, b) => a.name.localeCompare(b.name))[0];
            const ownsRoadLane = roadCrew && roadCrew.name === creep.name &&
              roadSites.length > 0;
            const site = ownsRoadLane
              ? getBuildTarget(candidate =>
                candidate.structureType === STRUCTURE_ROAD &&
                (!tunnelSite || candidate.id !== tunnelSite.id))
              : nonRoadSites.length > 0
                ? getBuildTarget(candidate =>
                  candidate.structureType !== STRUCTURE_ROAD)
                : getBuildTarget(candidate =>
                  candidate.structureType === STRUCTURE_ROAD &&
                  (!tunnelSite || candidate.id !== tunnelSite.id));
            return site
              ? perform(site, target => creep.build(target), 3)
              : false;
          }
        },
        {
          name: 'upgrade',
          run: () => controller && controller.my
            ? perform(controller, target => creep.upgradeController(target), 3)
            : false
        }
      ];
    } else if (creep.memory.working && creep.memory.role === 'fixer') {
      tasks = [
        {
          name: 'refill',
          run: () => {
            if (demandLane !== 'refill') return false;
            const target = getRefillTarget();
            return target ? transferEnergy(target) : false;
          }
        },
        {
          name: 'repair',
          run: () => {
            if (demandLane !== 'repair') return false;
            const target = getRepairTarget();
            return target
              ? perform(target, structure => creep.repair(structure), 3)
              : false;
          }
        },
        {
          name: 'upgrade',
          run: () => controller && controller.my
            ? perform(controller, target => creep.upgradeController(target), 3)
            : false
        }
      ];
    } else if (creep.memory.working && creep.memory.role === 'upgrader') {
      // The room's upgrader stays on the controller unless spawn energy is below one worker's cost.
      tasks = [
        {
          name: 'emergency-refill',
          run: () => {
            const hasHauler = creeps.some(worker =>
              worker.room.name === creep.room.name &&
              worker.memory.role === 'hauler');
            if (creep.room.memory.energyWorkPhase !== 'refill' ||
                creep.room.energyAvailable >= workerCost || hasHauler) {
              return false;
            }
            const target = getRefillTarget();
            if (!target) return false;
            return transferEnergy(target);
          }
        },
        {
          name: 'scavenge',
          run: scavenge
        },
        {
          name: 'upgrade',
          run: () => controller && controller.my
            ? perform(controller, target => creep.upgradeController(target), 3)
            : false
        }
      ];
    } else if (creep.memory.working ||
        creep.memory.role === 'hauler' &&
          creep.store[RESOURCE_ENERGY] > 0) {
      // Critical downgrade protection comes first; scavenge before routine work and storage.
      tasks = [
      {
        name: 'urgent-upgrade',
        run: () => {
          const roomName = creep.room.name;
          if (urgentUpgradeAssigned[roomName] || !controller || !controller.my ||
              controller.ticksToDowngrade >= 3000 ||
              !hasWorkParts(creep)) return false;
          urgentUpgradeAssigned[roomName] = true;
          return perform(controller, target => creep.upgradeController(target), 3);
        }
      },
      {
        name: 'scavenge',
        run: scavenge
      },
      {
        name: 'refill',
        run: () => {
          if (demandLane !== 'refill') {
            return false;
          }
          const target = getRefillTarget();
          if (!target) return false;
          return transferEnergy(target);
        }
      },
      {
        name: 'repair',
        run: () => {
          if (!hasWorkParts(creep) || demandLane !== 'repair') return false;
          const target = getRepairTarget();
          return target
            ? perform(target, structure => creep.repair(structure), 3)
            : false;
        }
      },
      {
        name: 'build',
        run: () => {
          if (!hasWorkParts(creep) || demandLane !== 'build') return false;
          const site = getBuildTarget();
          return site ? perform(site, target => creep.build(target), 3) : false;
        }
      },
      {
        name: 'store',
        run: () => creep.memory.role === 'hauler' && demandLane === 'buffer'
          ? storeEnergyInBuffer()
          : false
      },
      {
        name: 'stage-buffer',
        run: () => {
          if (creep.memory.role !== 'hauler' ||
              demandLane !== 'buffer-stage' || !controller) return false;
          const buffer = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
              structure.pos.getRangeTo(controller) <= 3
          });
          if (!buffer) return false;
          if (creep.pos.getRangeTo(buffer) > 1) moveCreep(creep, buffer, 1);
          creep.memory.taskTarget = buffer.id;
          return true;
        }
      },
      {
        name: 'stage-collect',
        run: stageAtSourceBuffer
      },
      {
        name: 'supply-worker',
        run: () => {
          if (creep.memory.role !== 'hauler' || demandLane !== 'supply') {
            return false;
          }
          const target = getWorkerSupplyTarget();
          return target ? transferEnergy(target) : false;
        }
      },
      {
        // Once refill and construction are handled, every loaded hauler helps the RC.
        name: 'upgrade',
        run: () => {
          if (demandLane !== 'upgrade' || !controller || !controller.my ||
              !hasWorkParts(creep)) {
            return false;
          }
          return perform(controller, target => creep.upgradeController(target), 3);
        }
      },
      {
        name: 'store',
        run: () => {
          // Dedicated haulers used the earlier buffer step; other mobile roles
          // may store unused energy without returning it to its source.
          if (creep.memory.role === 'hauler' || creep.memory.role === 'worker' ||
              creep.memory.role === 'builder' ||
              creep.memory.role === 'fixer' ||
              creep.memory.role === 'digger') return false;
          return storeEnergyInBuffer();
        }
      }
      ];
    } else {
      // Empty creeps collect dropped energy before withdrawing from containers or harvesting.
      tasks = [
      {
        name: 'await-supply',
        run: awaitPlannedSupply
      },
      {
        name: 'scavenge',
        run: scavenge
      },
      {
        name: 'stage-collect',
        run: stageAtSourceBuffer
      },
      {
        // The upgrader normally withdraws, but may harvest when no stored energy is available.
        name: 'harvest',
        run: () => {
          if (creep.memory.role === 'hauler') return false;
          if (creep.memory.role === 'builder' ||
              creep.memory.role === 'fixer' ||
              creep.memory.role === 'worker') {
            const storedEnergy = creep.pos.findClosestByPath(FIND_STRUCTURES, {
              filter: structure => canWithdrawFrom(creep, structure) &&
                getUnreservedEnergy(structure) > 0
            });
            if (storedEnergy) return false;
          }
          if (creep.memory.role === 'digger') {
            const source = creep.room.find(FIND_SOURCES)[1];
            const sourceContainer = source &&
              creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: structure =>
                  structure.structureType === STRUCTURE_CONTAINER &&
                  source.pos.getRangeTo(structure) <= 1 &&
                  getUnreservedEnergy(structure) > 0
              });
            if (sourceContainer) return false;
            const tunnelSite = getSource2TunnelSite(creep.room);
            if (!source || !tunnelSite) return false;
            const terrain = creep.room.getTerrain();
            const staging = [];
            for (let x = tunnelSite.pos.x - 3;
              x <= tunnelSite.pos.x + 3; x++) {
              for (let y = tunnelSite.pos.y - 3;
                y <= tunnelSite.pos.y + 3; y++) {
                if (x < 0 || x > 49 || y < 0 || y > 49 ||
                    tunnelSite.pos.getRangeTo(x, y) > 3 ||
                    source.pos.getRangeTo(x, y) <= 1 ||
                    terrain.get(x, y) === TERRAIN_MASK_WALL ||
                    creep.room.lookForAt(LOOK_STRUCTURES, x, y)
                      .some(structure => OBSTACLE_OBJECT_TYPES
                        .includes(structure.structureType)) ||
                    creep.room.lookForAt(LOOK_CREEPS, x, y)
                      .some(other => other.name !== creep.name)) continue;
                staging.push({ x, y, range: creep.pos.getRangeTo(x, y) });
              }
            }
            staging.sort((a, b) => a.range - b.range);
            if (!staging.length) return false;
            moveCreep(creep, new RoomPosition(staging[0].x,
              staging[0].y, creep.room.name), 0);
            creep.memory.taskTarget = `${tunnelSite.id} wait energy`;
            return true;
          }
          if (creep.memory.role === 'upgrader') {
            const storedEnergy = creep.pos.findClosestByPath(FIND_STRUCTURES, {
              filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
                getUnreservedEnergy(structure) > 0
            });
            if (storedEnergy) return false;
            const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            return source
              ? perform(source, target => creep.harvest(target))
              : false;
          }
          // The slot finder keeps ordinary mobile workers out of reserved source positions.
          const assignment = findHarvestAssignment(creep);
          if (!assignment) return false;
          creep.memory.taskTarget = `${assignment.source.id}@${assignment.x},${assignment.y}`;
          if (creep.pos.x !== assignment.x || creep.pos.y !== assignment.y) {
            moveCreep(creep, new RoomPosition(
              assignment.x, assignment.y, creep.room.name), 0);
            return true;
          }
          return perform(assignment.source, target => creep.harvest(target));
        }
      },
      {
        name: 'withdraw',
        run: () => {
          if (creep.memory.role === 'hauler' && demandLane !== 'collect') {
            return false;
          }
          // Keep the selected container while traveling so changing availability cannot reverse the trip.
          let container = Game.getObjectById(creep.memory.withdrawTarget);
          const controllerContainer = controller &&
            creep.room.find(FIND_STRUCTURES, {
              filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
                structure.pos.getRangeTo(controller) <= 3 &&
                getUnreservedEnergy(structure) > 0
            })[0];
          const plan = creep.room.memory.controllerContainerPlan;
          const retiringContainer = creep.memory.role === 'hauler' && plan &&
            plan.drainCreep === creep.name &&
            Game.getObjectById(plan.retireContainerId);
          if (creep.memory.role === 'upgrader' && controllerContainer) {
            container = controllerContainer;
          } else if (retiringContainer &&
              retiringContainer.store[RESOURCE_ENERGY] > 0) {
            container = retiringContainer;
          }
          if (container) creep.memory.withdrawTarget = container.id;
          if (!canWithdrawFrom(creep, container) ||
              getUnreservedEnergy(container) <= 0) {
            delete creep.memory.withdrawTarget;
            const candidates = creep.room.find(FIND_STRUCTURES, {
              filter: s => canWithdrawFrom(creep, s) &&
                getUnreservedEnergy(s) > 0 &&
                (!plan || s.id !== plan.retireContainerId ||
                  plan.drainCreep === creep.name)
            });
            if (creep.memory.role === 'hauler' && demandLane === 'collect') {
              const localSources = creep.room.find(FIND_SOURCES);
              candidates.sort((a, b) => {
                const aIsSource = localSources.some(source =>
                  source.pos.getRangeTo(a) <= 1);
                const bIsSource = localSources.some(source =>
                  source.pos.getRangeTo(b) <= 1);
                if (aIsSource !== bIsSource) return bIsSource - aIsSource;
                const aCapacity = a.store.getCapacity(RESOURCE_ENERGY) || 1;
                const bCapacity = b.store.getCapacity(RESOURCE_ENERGY) || 1;
                const pressure = getUnreservedEnergy(b) / bCapacity -
                  getUnreservedEnergy(a) / aCapacity;
                return creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b) ||
                  pressure;
              });
              container = candidates[0];
            } else {
              container = creep.pos.findClosestByPath(candidates);
            }
            if (!container) return false;
            creep.memory.withdrawTarget = container.id;
          }
          if (!container) return false;
          const amount = reserveEnergyFrom(container,
            creep.store.getFreeCapacity(RESOURCE_ENERGY));
          if (amount <= 0) return false;
          const result = creep.withdraw(container, RESOURCE_ENERGY);
          if (result === ERR_NOT_IN_RANGE) {
            moveCreep(creep, container);
            creep.memory.taskTarget = container.id;
            return true;
          }
          if (result !== OK) {
            releaseAmount(reservedEnergy, container, amount);
            return false;
          }
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

    if (creep.memory.role === 'remote-scout' &&
        creep.memory.task === 'remote-scout') {
      if (creep.memory.remoteAction === 'BuildC' ||
          creep.memory.remoteAction === 'Site') {
        creep.memory.task = 'remote-container';
      } else if (creep.memory.remoteAction === 'Mine') {
        creep.memory.task = 'remote-harvest';
      }
    }

    if (creep.memory.role === 'miner' && !creep.memory.task) {
      const sourceId = creep.memory.minerSource;
      creep.memory.role = 'harvester';
      if (sourceId) creep.memory.preferredSource = sourceId;
      delete creep.memory.minerSource;
      delete creep.memory.minerContainer;
      delete creep.memory.minerX;
      delete creep.memory.minerY;
      creep.memory.task = 'source-work';
      creep.memory.taskTarget = sourceId
        ? `${sourceId} (idle miner -> Src)`
        : 'idle miner -> Src';
      console.log(`[${Game.time}] ${creep.name} idle miner -> Src`);
    }

    // Every active creep gets a useful fallback or an explicit positioned wait.
    // This keeps temporary reservation pressure from becoming unexplained idle time.
    if (!creep.memory.task && creep.store[RESOURCE_ENERGY] > 0 &&
        hasWorkParts(creep) && controller && controller.my &&
        creep.memory.role !== 'miner' && creep.memory.role !== 'harvester' &&
        creep.memory.role !== 'hauler' &&
        creep.memory.role !== 'remote-hauler') {
      if (perform(controller,
        target => creep.upgradeController(target), 3)) {
        creep.memory.task = 'upgrade';
      }
    }
    if (!creep.memory.task && creep.memory.role === 'hauler' &&
        demandLane === 'supply' &&
        creep.store[RESOURCE_ENERGY] > 0) {
      const recipient = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
        filter: worker => !worker.spawning && worker.name !== creep.name &&
          hasWorkParts(worker) &&
          (worker.memory.role === 'builder' || worker.memory.role === 'fixer' ||
            worker.memory.role === 'upgrader' || worker.memory.role === 'worker')
      });
      if (recipient) {
        if (creep.pos.getRangeTo(recipient) > 1) moveCreep(creep, recipient);
        creep.memory.task = 'stage-supply';
        creep.memory.taskTarget = recipient.id;
      }
    }
    if (!creep.memory.task) {
      let anchor;
      let range = 3;
      if (creep.memory.role === 'digger') {
        anchor = Game.getObjectById(creep.memory.diggerTarget) ||
          getSource2TunnelSite(creep.room);
        range = 3;
      } else if (creep.store[RESOURCE_ENERGY] === 0) {
        anchor = creep.pos.findClosestByPath(FIND_STRUCTURES, {
          filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
            structure.store[RESOURCE_ENERGY] > 0 &&
            canWithdrawFrom(creep, structure)
        });
        range = 1;
      }
      if (!anchor) {
        anchor = controller && controller.my
          ? controller
          : creep.room.find(FIND_MY_SPAWNS)[0];
      }
      if (anchor && creep.pos.getRangeTo(anchor) > range) {
        moveCreep(creep, anchor, range);
      }
      creep.memory.task = 'standby';
      creep.memory.taskTarget = anchor
        ? anchor.id || anchor.name
        : `${creep.room.name} no anchor`;
    }

    // Waiting is idle, not productive work. The 100-tick summary owns the
    // consecutive-idle counter so a creep is never retired after four ticks.
    creep.memory.idleNow = !creep.memory.task ||
      creep.memory.task === 'standby';

    const sourceId = creep.memory.minerSource ||
      creep.memory.preferredSource || creep.memory.harvestSource;
    const sourceIndex = sourceId
      ? creep.room.find(FIND_SOURCES).findIndex(source => source.id === sourceId)
      : -1;
    let speech;
    if (creep.memory.task === 'source-work' && creep.memory.sourceAction) {
      speech = creep.memory.sourceAction;
    } else if (creep.memory.task === 'mine-to-container' ||
        creep.memory.task === 'source-work' ||
        creep.memory.task === 'harvest') {
      speech = sourceIndex >= 0 ? `S${sourceIndex + 1}` : 'Mine';
    } else if (creep.memory.task === 'build') {
      const site = Game.getObjectById(creep.memory.taskTarget);
      if (site && site.structureType === STRUCTURE_ROAD) speech = 'Road';
      else if (site && site.structureType === STRUCTURE_CONTAINER) speech = 'Cont';
      else if (site && site.structureType === STRUCTURE_EXTENSION) speech = 'Ext';
      else speech = 'Build';
    } else if (creep.memory.task === 'dig-road') {
      speech = 'Dig';
    } else if (creep.memory.task === 'remote-scout' ||
        creep.memory.task === 'remote-harvest' ||
        creep.memory.task === 'remote-container') {
      const remoteSuffix = creep.memory.task === 'remote-container'
        ? 'C' : creep.memory.task === 'remote-harvest' ? 'S' : 'T';
      const remotePrefix = creep.memory.remoteTeam === 'south' ? 'D' :
        creep.memory.remoteTeam === 'southwest' ? 'SW' : 'L';
      speech = `${remotePrefix}${(creep.memory.remoteSlot || 0) + 1}` +
        `${remoteSuffix}`;
    } else if (creep.memory.task === 'remote-haul') {
      const remotePrefix = creep.memory.remoteTeam === 'south' ? 'D' :
        creep.memory.remoteTeam === 'southwest' ? 'SW' : 'H';
      speech = `${remotePrefix}${(creep.memory.remoteHaulerSlot || 0) + 1}` +
        `${creep.memory.remoteTeam === 'south' ? 'H' : ''}`;
    } else if (creep.memory.task === 'remote-road') {
      const remotePrefix = creep.memory.remoteTeam === 'south' ? 'D' :
        creep.memory.remoteTeam === 'southwest' ? 'SW' : 'RB';
      speech = `${remotePrefix}${(creep.memory.remoteBuilderSlot || 0) + 1}` +
        `${creep.memory.remoteTeam === 'south' ? 'B' : ''}`;
    } else {
      const taskSpeech = {
        upgrade: 'RC',
        'urgent-upgrade': 'RC!',
        'emergency-refill': 'Fill!',
        refill: 'Fill',
        repair: 'Fix',
        'supply-worker': 'Give',
        'await-supply': 'WaitE',
        'stage-supply': 'Stage',
        'stage-buffer': 'StageRC',
        'stage-collect': 'StageS',
        standby: 'Wait',
        withdraw: 'Get',
        store: 'Store',
        scavenge: 'Pick',
        claim: 'Claim',
        'expansion-build': 'New'
      };
      speech = taskSpeech[creep.memory.task] || 'Idle';
    }
    creep.memory.lastTtl = creep.ticksToLive;
    creep.memory.lastRoom = creep.room.name;
    creep.memory.lastTask = creep.memory.task || 'idle';
    creep.say(speech);
  }

  // Log live task/target assignments every 25 ticks without filling the console each tick.
  if (Game.time % 25 === 0) {
    const assignments = creeps.map(creep => {
      const ttl = creep.ticksToLive === undefined ? '?' : creep.ticksToLive;
      const role = shortRoles[creep.memory.role] || creep.memory.role || 'W';
      const task = shortTasks[creep.memory.task] || creep.memory.task || 'Idle';
      return `  ${shortCreepName(creep.name)} ${role}[${getBodyCode(creep.body)}]/${task} -> ` +
        `${formatTaskTarget(creep.memory.taskTarget)} T${ttl}`;
    });
    console.log(`[${Game.time}] Jobs:\n${assignments.join('\n') || '  none'}`);
  }

  // Explain worker-cap and temporary spawn blockers every 100 ticks.
  if (Game.time % 100 === 0) {
    const ownedRooms = new Set(Object.values(Game.spawns)
      .map(spawn => spawn.room.name));
    for (const roomName of ownedRooms) {
      const room = Game.rooms[roomName];
      if (!room) continue;
      const { sourceSpotCounts, sourceSpotTotal, minerLimit, workerLimit,
        minimumWorkerLimit } = getWorkerLimits(room);
      const strategy = getRoomStrategy(room);
      const situation = getRoomSituation(room);
      const roomCreeps = Object.values(Game.creeps)
        .filter(creep => creep.memory.home === room.name);
      for (const creep of roomCreeps) {
        creep.memory.idleStreak = creep.memory.idleNow
          ? (creep.memory.idleStreak || 0) + 1
          : 0;
      }
      const desiredSourceWorkers = getDesiredSourceWorkerLimit(
        room, roomCreeps.length);
      const sourceWorkerCount = roomCreeps.filter(creep =>
        creep.memory.role === 'miner' || creep.memory.role === 'harvester').length;
      const haulerCount = roomCreeps.filter(creep => creep.memory.role === 'hauler').length;
      const builderCount = roomCreeps.filter(creep =>
        creep.memory.role === 'builder').length;
      const fixerCount = roomCreeps.filter(creep =>
        creep.memory.role === 'fixer').length;
      const diggerCount = roomCreeps.filter(creep =>
        creep.memory.role === 'digger').length;
      const idleCreeps = roomCreeps.filter(creep => creep.memory.idleNow);
      const idleCount = idleCreeps.length;
      const retireCandidate = idleCreeps.find(creep =>
        (creep.memory.idleStreak || 0) >= 4 &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'worker'));
      if (retireCandidate && workerLimit > minimumWorkerLimit) {
        const replaceSurplusHauler = retireCandidate.memory.role === 'hauler' &&
          haulerCount > situation.targets.hauler;
        const nextTarget = replaceSurplusHauler
          ? workerLimit
          : Math.max(minimumWorkerLimit, workerLimit - 1);
        retireCandidate.memory.retired = true;
        if (retireCandidate.suicide() === OK) {
          room.memory.workerTarget = nextTarget;
          console.log(`[${Game.time}] ${replaceSurplusHauler ? 'Replacing' : 'Retiring'} ` +
            `idle ${retireCandidate.name}; ${room.name} worker target ${nextTarget}`);
        } else {
          delete retireCandidate.memory.retired;
        }
      }
      const sources = room.find(FIND_SOURCES).map((source, index) => {
        const assignedWorkers = roomCreeps.filter(creep =>
          (creep.memory.role === 'miner' && creep.memory.minerSource === source.id) ||
          (creep.memory.role === 'harvester' &&
            creep.memory.preferredSource === source.id)).length;
        const availability = source.energy > 0
          ? 'active'
          : `regenerates in ${source.ticksToRegeneration} ticks`;
        const state = source.energy > 0 ? '' : ` R${source.ticksToRegeneration}`;
        return `S${index + 1} ${assignedWorkers}/${sourceSpotCounts[source.id] || 0} ` +
          `E${source.energy}/${source.energyCapacity}${state}`;
      });
      const roomSpawns = Object.values(Game.spawns)
        .filter(spawn => spawn.room.name === room.name);
      const spawns = roomSpawns
        .map(spawn => `${spawn.name}:${spawn.spawning ? 'B' : 'I'}`);
      const buildCodes = {
        [STRUCTURE_ROAD]: 'R',
        [STRUCTURE_CONTAINER]: 'C',
        [STRUCTURE_EXTENSION]: 'E'
      };
      const buildTargets = room.find(FIND_MY_CONSTRUCTION_SITES)
        .map(site => `${buildCodes[site.structureType] || site.structureType}` +
          `@${site.pos.x},${site.pos.y} ${site.progress}/${site.progressTotal}`);
      const roadCount = room.find(FIND_STRUCTURES, {
        filter: structure => structure.structureType === STRUCTURE_ROAD
      }).length;
      const roadSiteCount = room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: site => site.structureType === STRUCTURE_ROAD
      }).length;
      const controllerLevel = room.controller ? room.controller.level : 0;
      const summaryPaths = getImportantRoadPaths(room);
      const roadBudget = getRoadBudget(
        room, summaryPaths, controllerLevel);
      const congestionCount = roomCreeps.filter(creep =>
        (creep.memory.navStuck || 0) >= 2 &&
        creep.memory.navLastTick >= Game.time - 1).length;
      const allBusyAtTarget = roomCreeps.length >= workerLimit &&
        idleCount === 0 && congestionCount === 0;
      room.memory.busySummaryStreak = allBusyAtTarget
        ? (room.memory.busySummaryStreak || 0) + 1
        : 0;
      let reportedWorkerLimit = workerLimit;
      let targetIncrease;
      if (room.memory.busySummaryStreak >= 4) {
        reportedWorkerLimit = workerLimit + 1;
        room.memory.workerTarget = reportedWorkerLimit;
        room.memory.busySummaryStreak = 0;
        targetIncrease = `target->${reportedWorkerLimit}`;
      }
      const blockers = [];
      if (idleCount > 0) blockers.push(`${idleCount} idle; spawn paused`);
      if (congestionCount > 0) blockers.push(`${congestionCount} congested`);
      if (roomCreeps.length >= reportedWorkerLimit) blockers.push('pop target');
      if (roomSpawns.every(spawn => spawn.spawning)) blockers.push('spawns busy');
      if (Number.isInteger(room.memory.spawnWaitSince) &&
          room.energyAvailable < room.energyCapacityAvailable) {
        blockers.push(`charging body ${Math.min(25,
          Game.time - room.memory.spawnWaitSince)}/25`);
      }
      if (room.energyAvailable < workerCost) {
        blockers.push(`energy<${workerCost}`);
      }
      const status = blockers.length ? blockers.join(', ') : 'spawn ready';
      const expansion = room.memory.expansionPlan;
      const expansionStatus = expansion
        ? `  Expand ${expansion.targetRoom} ${expansion.status} ` +
          `GCL${expansion.gclLevel || '?'} rooms${expansion.ownedRooms || 0}`
        : null;
      console.log([
        `[${Game.time}] ${room.name} RCL${controllerLevel} ${strategy.mode}`,
        `  Pop ${roomCreeps.length}/${reportedWorkerLimit} min${minimumWorkerLimit} | ` +
          `Src ${sourceWorkerCount}/${desiredSourceWorkers} spots${minerLimit} ` +
          `Ha ${haulerCount} ` +
          `B ${builderCount}/${getBuilderTarget(room)} F ${fixerCount} ` +
          `D ${diggerCount}/${situation.targets.digger} ` +
          `Idle ${idleCount} | ` +
          `Energy available ${room.energyAvailable} | max ${room.energyCapacityAvailable}`,
        `  ${sources.join(' | ') || 'No sources'}`,
        `  Build ${buildTargets.join(', ') || 'none'} | Roads ` +
          `${roadCount}+${roadSiteCount}/${roadBudget}` +
          `${roadsPaused(room) ? ' PAUSED@RCL2' : ''}`,
        expansionStatus,
        `  Sit ${situation.mode} Src${situation.targets.source} ` +
          `Ha${situation.targets.hauler} B${situation.targets.builder} ` +
          `F${situation.targets.fixer} U${situation.targets.upgrader} ` +
          `D${situation.targets.digger} | ` +
          `Buf${Math.round(situation.signals.bufferRatio * 100)}% ` +
          `Drop${situation.signals.droppedEnergy} | stable-v1`,
        `  Busy ${room.memory.busySummaryStreak}/4${targetIncrease ? ` ${targetIncrease}` : ''} | ` +
          `Sp ${spawns.join(',') || 'none'} | ${status}`,
        `  Next: ${strategy.gate}`
      ].filter(Boolean).join('\n'));
    }
  }
};
