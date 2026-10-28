'use strict';

// A small bootstrap colony: workers harvest, refill, build, and upgrade.
module.exports.loop = function () {
  if (!Memory.creeps) Memory.creeps = {};

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
    upgrader: 'U',
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
    repair: 'Fix',
    'feed-controller': 'RC+',
    withdraw: 'Get',
    store: 'Store'
  };
  const moveCreep = (creep, target, range = 1) => {
    const position = target.pos || target;
    if (!position) return ERR_INVALID_TARGET;
    const goal = target.id ||
      `${position.roomName || creep.room.name}:${position.x}:${position.y}:${range}`;
    const samePosition = creep.memory.navLastX === creep.pos.x &&
      creep.memory.navLastY === creep.pos.y &&
      creep.memory.navLastRoom === creep.room.name;
    const consecutiveMove = creep.memory.navLastTick === Game.time - 1;
    const sameGoal = creep.memory.navGoal === goal;
    creep.memory.navStuck = samePosition && consecutiveMove && sameGoal
      ? (creep.memory.navStuck || 0) + 1
      : 0;
    const recalculate = creep.memory.navStuck >= 2;
    const result = creep.moveTo(target, {
      range,
      reusePath: recalculate ? 0 : 10,
      ignoreCreeps: !recalculate,
      plainCost: 2,
      swampCost: 10,
      maxOps: 2000
    });
    creep.memory.navGoal = goal;
    creep.memory.navLastX = creep.pos.x;
    creep.memory.navLastY = creep.pos.y;
    creep.memory.navLastRoom = creep.room.name;
    creep.memory.navLastTick = Game.time;
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
    if (role === 'miner' || role === 'harvester') {
      // Source workers travel once, then stay put: one MOVE, one CARRY, and all remaining capacity as WORK.
      const workParts = Math.min(48,
        Math.floor((energy - BODYPART_COST[CARRY] - BODYPART_COST[MOVE]) /
          BODYPART_COST[WORK]));
      if (workParts < 1) return null;
      const body = Array(workParts).fill(WORK);
      body.push(CARRY, MOVE);
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
          (x === source.pos.x && y === source.pos.y)) return false;
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
    const minerLimit = Math.min(20, sourceSpotTotal);
    const minimumWorkerLimit = minerLimit + 1;
    const savedWorkerTarget = Number.isInteger(room.memory.workerTarget)
      ? room.memory.workerTarget
      : Math.max(20, minimumWorkerLimit);
    return {
      sourceSpotCounts,
      sourceSpotTotal,
      minerLimit,
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
  const placeSourceContainerSite = room => {
    if (!room.controller || !room.controller.my || room.controller.level < 2) {
      return false;
    }
    if (room.memory.controllerContainerPlan &&
        !room.memory.controllerContainerPlan.ready) return false;
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
        const essential = new Set();
        for (const source of room.find(FIND_SOURCES)) {
          const closest = source.pos.findClosestByRange(containers);
          if (closest) essential.add(closest.id);
        }
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
    for (const key of Object.keys(corridorUses)) {
      const visits = traffic.tiles[key] || 0;
      const corridorCount = corridorUses[key] || 0;
      const [x, y] = key.split(':').map(Number);
      if (x <= 0 || x >= 49 || y <= 0 || y >= 49 ||
          builtRoadTiles.has(key) || queuedRoadTiles.has(key) ||
          terrain.get(x, y) === TERRAIN_MASK_WALL ||
          room.lookForAt(LOOK_STRUCTURES, x, y).length > 0 ||
          room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
      const swampBonus = terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 5 : 0;
      const score = corridorCount * 100 + visits + swampBonus;
      candidates.push({ x, y, visits, score });
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
        console.log(`[${Game.time}] Placed road site in ${room.name} at ${candidate.x},${candidate.y} (dotted strategic corridor)`);
        placed++;
        if (placed >= batchLimit) break;
      }
    }
    return placed > 0;
  };
  const getSpawnAssignment = (room, workers) => {
    // Fill upgrader, container-miner, and source-harvester roles before adding haulers.
    if (!workers.some(creep => creep.memory.role === 'upgrader')) {
      const availableUpgrader = workers.find(creep => !creep.spawning &&
        creep.memory.role !== 'miner');
      return availableUpgrader ? null : { role: 'upgrader' };
    }
    if (Number.isInteger(room.memory.containerHaulerPendingTarget) &&
        workers.length < room.memory.containerHaulerPendingTarget) {
      return { role: 'hauler' };
    }

    const sourceContainers = room.find(FIND_SOURCES).map(source => ({
      source,
      container: source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
          !isRetiringContainer(room, structure) &&
          structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
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

  const spawnGroups = {};
  for (const spawn of Object.values(Game.spawns)) {
    if (!spawnGroups[spawn.room.name]) spawnGroups[spawn.room.name] = [];
    spawnGroups[spawn.room.name].push(spawn);
  }
  const spawnOrder = [];
  for (const [roomName, spawns] of Object.entries(spawnGroups)) {
    spawns.sort((a, b) => a.name.localeCompare(b.name));
    const room = Game.rooms[roomName];
    const start = room.memory.nextSpawnIndex % spawns.length || 0;
    for (let offset = 0; offset < spawns.length; offset++) {
      spawnOrder.push(spawns[(start + offset) % spawns.length]);
    }
  }
  for (const spawn of spawnOrder) {
    const workers = Object.values(Game.creeps).filter(c =>
      c.memory.home === spawn.room.name);
    const { workerLimit } = getWorkerLimits(spawn.room);
    const hasIdleWorkers = workers.some(creep =>
      !creep.spawning && (creep.memory.idleStreak || 0) > 0);
    const assignment = getSpawnAssignment(spawn.room, workers);
    const body = assignment && buildBody(assignment.role, spawn.room.energyAvailable);
    if (!spawn.spawning && !hasIdleWorkers && body && workers.length < workerLimit) {
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
        const roomSpawns = spawnGroups[spawn.room.name];
        const spawnIndex = roomSpawns.findIndex(candidate => candidate.id === spawn.id);
        spawn.room.memory.nextSpawnIndex = (spawnIndex + 1) % roomSpawns.length;
        const cost = body.reduce((total, part) => total + BODYPART_COST[part], 0);
        console.log(`[${Game.time}] Spawning ${name} (${assignment.role}, ${cost} energy): ${getBodyCode(body)}`);
      }
    }
  }

  const ownedRooms = new Set(Object.values(Game.spawns).map(spawn => spawn.room.name));
  for (const roomName of ownedRooms) {
    const room = Game.rooms[roomName];
    const traffic = updateTrafficHeatmap(room);
    const paths = getImportantRoadPaths(room);
    const controllerLevel = room.controller ? room.controller.level : 0;
    const roadBudget = getRoadBudget(room, paths, controllerLevel);
    drawRoadPlan(room, paths, traffic, roadBudget);
    manageControllerContainer(room);
    placeSourceContainerSite(room);
    placeExtensionSite(room);
    placeRoadSite(room, paths, traffic, roadBudget);
  }

  const reservedEnergy = {};
  const reservedCapacity = {};
  const urgentUpgradeAssigned = {};
  const reservedHarvestSpots = {};
  const creeps = Object.values(Game.creeps).filter(creep => !creep.spawning);
  const roomUpgraders = {};
  const assignedCreeps = {};
  const rebalanceRoles = Game.time % 100 === 0;
  const sourceWorkerShortages = {};
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const { minerLimit } = getWorkerLimits(room);
    const sourceWorkerCount = creeps.filter(creep =>
      creep.room.name === room.name &&
      (creep.memory.role === 'miner' || creep.memory.role === 'harvester')).length;
    sourceWorkerShortages[room.name] = sourceWorkerCount < minerLimit;
  }

  for (const creep of creeps) {
    if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'upgrader' && !roomUpgraders[creep.room.name]) {
      roomUpgraders[creep.room.name] = creep;
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'hauler' && !rebalanceRoles &&
        !sourceWorkerShortages[creep.room.name]) {
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
        upgrader.memory.role = 'upgrader';
        assignedCreeps[upgrader.name] = true;
      }
    }

    const sourceContainers = room.find(FIND_SOURCES).map(source => ({
      source,
      container: source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
          !isRetiringContainer(room, structure) &&
          structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
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
        miner = room.lookForAt(LOOK_CREEPS,
          entry.container.pos.x, entry.container.pos.y)
          .find(creep => roomCreeps.includes(creep) &&
            !assignedCreeps[creep.name]) ||
          roomCreeps.find(creep => !assignedCreeps[creep.name]);
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

    const { minerLimit, sourceSpotCounts } = getWorkerLimits(room);
    let sourceWorkerCount = Object.keys(miners).length;
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
      if (sourceWorkerCount < minerLimit) {
        creep.memory.role = 'harvester';
        sourceWorkerCount++;
      } else {
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

    // Preserve source ownership; assign only new or excess harvesters.
    const sourceNeeds = room.find(FIND_SOURCES).map(source => {
      const dedicatedMinerCount = miners[source.id] ? 1 : 0;
      return {
        sourceId: source.id,
        remaining: Math.max(0,
          (sourceSpotCounts[source.id] || 0) - dedicatedMinerCount)
      };
    });
    const harvesters = roomCreeps
      .filter(creep => creep.memory.role === 'harvester')
      .sort((a, b) => a.name.localeCompare(b.name));
    const unassignedHarvesters = [];
    for (const creep of harvesters) {
      const currentNeed = sourceNeeds.find(need =>
        need.sourceId === creep.memory.preferredSource);
      if (currentNeed && currentNeed.remaining > 0) {
        currentNeed.remaining--;
      } else {
        unassignedHarvesters.push(creep);
      }
    }
    let nextSourceIndex = 0;
    for (const creep of unassignedHarvesters) {
      let preferredSource;
      for (let offset = 0; offset < sourceNeeds.length; offset++) {
        const index = (nextSourceIndex + offset) % sourceNeeds.length;
        const need = sourceNeeds[index];
        if (need.remaining <= 0) continue;
        preferredSource = need.sourceId;
        need.remaining--;
        nextSourceIndex = (index + 1) % sourceNeeds.length;
        break;
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
    if (!creep.room.controller || !creep.room.controller.my) {
      creep.memory.role = 'worker';
      delete creep.memory.minerSource;
      delete creep.memory.minerContainer;
      delete creep.memory.minerX;
      delete creep.memory.minerY;
    }
  }

  const roomCollectionEnergy = {};
  for (const room of Object.values(Game.rooms)) {
    const hasLooseEnergy = room.find(FIND_DROPPED_RESOURCES).some(resource =>
      resource.resourceType === RESOURCE_ENERGY && resource.amount > 0) ||
      room.find(FIND_STRUCTURES).some(structure =>
        structure.structureType === STRUCTURE_CONTAINER &&
        structure.store[RESOURCE_ENERGY] > 0);
    roomCollectionEnergy[room.name] = {
      hasLooseEnergy,
      hasActiveSource: room.find(FIND_SOURCES_ACTIVE).length > 0
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
    const collectionEnergy = roomCollectionEnergy[creep.room.name];
    const preferredSource = Game.getObjectById(creep.memory.preferredSource);
    const canHarvest = creep.memory.role !== 'hauler' &&
      (preferredSource ? preferredSource.energy > 0 :
        collectionEnergy && collectionEnergy.hasActiveSource);
    const canCollect = canHarvest ||
      (collectionEnergy && collectionEnergy.hasLooseEnergy);
    if (creep.store.getFreeCapacity() === 0 ||
        (creep.store[RESOURCE_ENERGY] > 0 && !canCollect)) {
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

  // Match each dropped-energy pile to one closest hauler so the room does not swarm it.
  const dropAssignments = {};
  for (const creep of creeps) {
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
        (source && source.pos.getRangeTo(container) <= 5));
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

  // Give the dedicated upgrader first claim on stored energy so controller upkeep
  // cannot be starved by hauler reservations made earlier in the tick.
  const taskCreeps = creeps.slice().sort((a, b) =>
    (a.memory.role === 'upgrader' ? 0 : 1) -
    (b.memory.role === 'upgrader' ? 0 : 1));
  const reservedJobs = {
    refill: {},
    build: {},
    repair: {},
    withdraw: {},
    feed: {}
  };
  for (const creep of taskCreeps) {
    const refillTarget = Game.getObjectById(creep.memory.refillTarget);
    if (refillTarget && creep.store[RESOURCE_ENERGY] > 0 &&
        (refillTarget.structureType === STRUCTURE_SPAWN ||
          refillTarget.structureType === STRUCTURE_EXTENSION) &&
        refillTarget.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        !reservedJobs.refill[refillTarget.id]) {
      reservedJobs.refill[refillTarget.id] = creep.name;
    } else {
      delete creep.memory.refillTarget;
    }
    const buildTarget = Game.getObjectById(creep.memory.buildTarget);
    if (buildTarget && buildTarget.progressTotal !== undefined &&
        creep.store[RESOURCE_ENERGY] > 0 &&
        !reservedJobs.build[buildTarget.id]) {
      reservedJobs.build[buildTarget.id] = creep.name;
    } else {
      delete creep.memory.buildTarget;
    }
    const repairTarget = Game.getObjectById(creep.memory.repairTarget);
    if (repairTarget && creep.memory.role === 'hauler' &&
        repairTarget.hits < repairTarget.hitsMax &&
        creep.store[RESOURCE_ENERGY] > 0 &&
        !reservedJobs.repair[repairTarget.id]) {
      reservedJobs.repair[repairTarget.id] = creep.name;
    } else {
      delete creep.memory.repairTarget;
    }
    const withdrawTarget = Game.getObjectById(creep.memory.withdrawTarget);
    const controllerPlan = creep.room.memory.controllerContainerPlan;
    const canDrainRetiring = !controllerPlan ||
      withdrawTarget && withdrawTarget.id !== controllerPlan.retireContainerId ||
      controllerPlan.drainCreep === creep.name;
    if (withdrawTarget && withdrawTarget.structureType === STRUCTURE_CONTAINER &&
        canDrainRetiring &&
        creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        withdrawTarget.store[RESOURCE_ENERGY] > 0 &&
        !reservedJobs.withdraw[withdrawTarget.id]) {
      reservedJobs.withdraw[withdrawTarget.id] = creep.name;
    } else {
      delete creep.memory.withdrawTarget;
    }
    const feedTarget = Game.getObjectById(creep.memory.controllerFeedTarget);
    if (feedTarget && creep.memory.role === 'hauler' &&
        creep.store[RESOURCE_ENERGY] > 0 && feedTarget.room.controller &&
        feedTarget.structureType === STRUCTURE_CONTAINER &&
        feedTarget.pos.getRangeTo(feedTarget.room.controller) <= 3 &&
        feedTarget.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        !reservedJobs.feed[feedTarget.id]) {
      reservedJobs.feed[feedTarget.id] = creep.name;
    } else {
      delete creep.memory.controllerFeedTarget;
    }
  }
  for (const creep of taskCreeps) {
    const controller = creep.room.controller;
    const perform = (target, action, range = 1) => {
      const result = action(target);
      if (result === ERR_NOT_IN_RANGE) moveCreep(creep, target, range);
      if (result !== OK && result !== ERR_NOT_IN_RANGE) return false;
      creep.memory.taskTarget = target.id || target.name || target.structureType;
      return true;
    };
    const scavenge = () => {
      if (creep.memory.role !== 'hauler' ||
          creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;
      const drop = Game.getObjectById(dropAssignments[creep.name]);
      if (!drop) return false;
      return perform(drop, resource => creep.pickup(resource));
    };
    const getRefillTarget = extraFilter => {
      let target = Game.getObjectById(creep.memory.refillTarget);
      const valid = structure => structure &&
        (structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_EXTENSION) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) -
          (reservedCapacity[structure.id] || 0) > 0 &&
        (!extraFilter || extraFilter(structure)) &&
        (!reservedJobs.refill[structure.id] ||
          reservedJobs.refill[structure.id] === creep.name);
      if (!valid(target)) {
        delete creep.memory.refillTarget;
        target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
          filter: structure => valid(structure) &&
            !reservedJobs.refill[structure.id]
        });
      }
      if (!target) return null;
      reservedJobs.refill[target.id] = creep.name;
      creep.memory.refillTarget = target.id;
      return target;
    };
    const getBuildTarget = extraFilter => {
      let target = Game.getObjectById(creep.memory.buildTarget);
      const valid = site => site && site.progressTotal !== undefined &&
        (!extraFilter || extraFilter(site)) &&
        (!reservedJobs.build[site.id] ||
          reservedJobs.build[site.id] === creep.name);
      if (!valid(target)) {
        delete creep.memory.buildTarget;
        target = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES, {
          filter: site => valid(site) && !reservedJobs.build[site.id]
        });
      }
      if (!target) return null;
      reservedJobs.build[target.id] = creep.name;
      creep.memory.buildTarget = target.id;
      return target;
    };
    const getRepairTarget = () => {
      const repairable = structure => structure &&
        structure.hits !== undefined && structure.hits < structure.hitsMax &&
        structure.structureType !== STRUCTURE_WALL &&
        structure.structureType !== STRUCTURE_RAMPART &&
        (structure.my || structure.structureType === STRUCTURE_ROAD ||
          structure.structureType === STRUCTURE_CONTAINER) &&
        (!reservedJobs.repair[structure.id] ||
          reservedJobs.repair[structure.id] === creep.name);
      let target = Game.getObjectById(creep.memory.repairTarget);
      if (!repairable(target)) {
        delete creep.memory.repairTarget;
        target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
          filter: structure => repairable(structure) &&
            structure.hits < structure.hitsMax * 0.75 &&
            !reservedJobs.repair[structure.id]
        });
      }
      if (!target) return null;
      reservedJobs.repair[target.id] = creep.name;
      creep.memory.repairTarget = target.id;
      return target;
    };
    const getControllerFeedTarget = () => {
      if (creep.memory.role !== 'hauler' ||
          creep.store[RESOURCE_ENERGY] === 0 || !controller) return null;
      let target = Game.getObjectById(creep.memory.controllerFeedTarget);
      const valid = container => container &&
        container.structureType === STRUCTURE_CONTAINER &&
        container.pos.getRangeTo(controller) <= 3 &&
        container.store.getFreeCapacity(RESOURCE_ENERGY) -
          (reservedCapacity[container.id] || 0) > 0 &&
        (!reservedJobs.feed[container.id] ||
          reservedJobs.feed[container.id] === creep.name);
      if (!valid(target)) {
        delete creep.memory.controllerFeedTarget;
        target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
          filter: structure => valid(structure) &&
            !reservedJobs.feed[structure.id]
        });
      }
      if (!target) return null;
      reservedJobs.feed[target.id] = creep.name;
      creep.memory.controllerFeedTarget = target.id;
      return target;
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
              moveCreep(creep, station, 0);
              creep.memory.taskTarget = `${source.id}@${station.x},${station.y}`;
              return true;
            }
            if (container.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
              return false;
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
                (creep.pos.getRangeTo(structure) <= 1 ||
                  source.pos.getRangeTo(structure) <= 5)
            });
            const availableContainers = containers.filter(structure =>
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
            const container = creep.pos.findClosestByRange(
              availableContainers.length ? availableContainers : containers);
            const buildOverflowContainer = () => {
              delete creep.memory.containerSiteError;
              const existingSite = getBuildTarget(site =>
                site.structureType === STRUCTURE_CONTAINER &&
                (creep.pos.getRangeTo(site) <= 1 ||
                  source.pos.getRangeTo(site) <= 5));
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
              for (let x = source.pos.x - 5; x <= source.pos.x + 5; x++) {
                for (let y = source.pos.y - 5; y <= source.pos.y + 5; y++) {
                  if (x < 0 || x > 49 || y < 0 || y > 49 ||
                      terrain.get(x, y) === TERRAIN_MASK_WALL ||
                      source.pos.getRangeTo(x, y) > 5 ||
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
                [ERR_INVALID_TARGET]: 'no legal tile within five',
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
              const amount = Math.min(creep.store[RESOURCE_ENERGY],
                target.store.getFreeCapacity(RESOURCE_ENERGY) -
                  (reservedCapacity[target.id] || 0));
              reservedCapacity[target.id] =
                (reservedCapacity[target.id] || 0) + amount;
              const refilling = perform(target,
                structure => creep.transfer(structure, RESOURCE_ENERGY));
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
            const shouldUnload = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 ||
              source.energy === 0 || creep.memory.cleanupEnergy;
            if (creep.store[RESOURCE_ENERGY] > 0 && shouldUnload) {
              if (container) {
                if (container.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                  if (buildOverflowContainer()) return true;
                  if (refillNearby()) return true;
                  creep.memory.taskTarget =
                    `${container.id} (full; ${creep.memory.containerSiteError ||
                      'holding'})`;
                  return true;
                }
                // Move into transfer range instead of dropping just because the
                // assigned harvesting tile is on the far side of the source.
                return perform(container,
                  target => creep.transfer(target, RESOURCE_ENERGY));
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
    } else if (creep.memory.working && creep.memory.role === 'upgrader') {
      // The room's upgrader stays on the controller unless spawn energy is below one worker's cost.
      tasks = [
        {
          name: 'emergency-refill',
          run: () => {
            if (creep.room.energyAvailable >= workerCost) return false;
            const target = getRefillTarget();
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
            ? perform(controller, target => creep.upgradeController(target), 3)
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
          const target = getRefillTarget();
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
          const site = getBuildTarget();
          return site ? perform(site, target => creep.build(target), 3) : false;
        }
      },
      {
        name: 'repair',
        run: () => {
          const target = getRepairTarget();
          return target
            ? perform(target, structure => creep.repair(structure), 3)
            : false;
        }
      },
      {
        name: 'feed-controller',
        run: () => {
          const target = getControllerFeedTarget();
          if (!target) return false;
          const amount = Math.min(creep.store[RESOURCE_ENERGY],
            target.store.getFreeCapacity(RESOURCE_ENERGY) -
              (reservedCapacity[target.id] || 0));
          reservedCapacity[target.id] =
            (reservedCapacity[target.id] || 0) + amount;
          return perform(target,
            container => creep.transfer(container, RESOURCE_ENERGY));
        }
      },
      {
        // Once refill and construction are handled, every loaded hauler helps the RC.
        name: 'upgrade',
        run: () => {
          if (creep.memory.role !== 'hauler' || !controller || !controller.my) {
            return false;
          }
          return perform(controller, target => creep.upgradeController(target), 3);
        }
      },
      {
        name: 'store',
        run: () => {
          // Haulers keep their load for refill, building, or upgrading; never ping-pong it.
          if (creep.memory.role === 'hauler') return false;
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
        // The upgrader normally withdraws, but may harvest when no stored energy is available.
        name: 'harvest',
        run: () => {
          if (creep.memory.role === 'hauler') return false;
          if (creep.memory.role === 'upgrader') {
            const storedEnergy = creep.pos.findClosestByPath(FIND_STRUCTURES, {
              filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
                structure.store[RESOURCE_ENERGY] -
                  (reservedEnergy[structure.id] || 0) > 0 &&
                (!reservedJobs.withdraw[structure.id] ||
                  reservedJobs.withdraw[structure.id] === creep.name)
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
          // Keep the selected container while traveling so changing availability cannot reverse the trip.
          let container = Game.getObjectById(creep.memory.withdrawTarget);
          const previousContainer = container;
          const controllerContainer = controller &&
            creep.room.find(FIND_STRUCTURES, {
              filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
                structure.pos.getRangeTo(controller) <= 3 &&
                structure.store[RESOURCE_ENERGY] -
                  (reservedEnergy[structure.id] || 0) > 0 &&
                (!reservedJobs.withdraw[structure.id] ||
                  reservedJobs.withdraw[structure.id] === creep.name)
            })[0];
          const plan = creep.room.memory.controllerContainerPlan;
          const retiringContainer = creep.memory.role === 'hauler' && plan &&
            plan.drainCreep === creep.name &&
            Game.getObjectById(plan.retireContainerId);
          if (creep.memory.role === 'upgrader' && controllerContainer) {
            container = controllerContainer;
          } else if (retiringContainer &&
              retiringContainer.store[RESOURCE_ENERGY] > 0 &&
              (!reservedJobs.withdraw[retiringContainer.id] ||
                reservedJobs.withdraw[retiringContainer.id] === creep.name)) {
            container = retiringContainer;
          }
          if (previousContainer && container &&
              previousContainer.id !== container.id &&
              reservedJobs.withdraw[previousContainer.id] === creep.name) {
            delete reservedJobs.withdraw[previousContainer.id];
          }
          if (container) creep.memory.withdrawTarget = container.id;
          if (!container || container.structureType !== STRUCTURE_CONTAINER ||
              container.store[RESOURCE_ENERGY] - (reservedEnergy[container.id] || 0) <= 0 ||
              (reservedJobs.withdraw[container.id] &&
                reservedJobs.withdraw[container.id] !== creep.name)) {
            delete creep.memory.withdrawTarget;
            container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
              filter: s => s.structureType === STRUCTURE_CONTAINER &&
                s.store[RESOURCE_ENERGY] - (reservedEnergy[s.id] || 0) > 0 &&
                (!plan || s.id !== plan.retireContainerId ||
                  plan.drainCreep === creep.name) &&
                !reservedJobs.withdraw[s.id]
            });
            if (!container) return false;
            creep.memory.withdrawTarget = container.id;
          }
          if (!container) return false;
          reservedJobs.withdraw[container.id] = creep.name;
          const amount = Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY),
            container.store[RESOURCE_ENERGY] - (reservedEnergy[container.id] || 0));
          const result = creep.withdraw(container, RESOURCE_ENERGY);
          if (result === ERR_NOT_IN_RANGE) {
            reservedEnergy[container.id] = (reservedEnergy[container.id] || 0) + amount;
            moveCreep(creep, container);
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

    if (creep.memory.task) creep.memory.idleStreak = 0;
    else creep.memory.idleStreak = (creep.memory.idleStreak || 0) + 1;
    let retiring = false;
    if (creep.memory.idleStreak >= 4 &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'worker')) {
      const homeRoom = Game.rooms[creep.memory.home] || creep.room;
      const { workerLimit, minimumWorkerLimit } = getWorkerLimits(homeRoom);
      if (workerLimit > minimumWorkerLimit) {
        const reducedTarget = Math.max(minimumWorkerLimit, workerLimit - 1);
        creep.memory.retired = true;
        const result = creep.suicide();
        if (result === OK) {
          homeRoom.memory.workerTarget = reducedTarget;
          retiring = true;
          console.log(`[${Game.time}] Retiring idle ${creep.name}; ${homeRoom.name} worker target ${reducedTarget}`);
        } else {
          delete creep.memory.retired;
        }
      }
    }

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
    } else {
      const taskSpeech = {
        upgrade: 'RC',
        'urgent-upgrade': 'RC!',
        'emergency-refill': 'Fill!',
        refill: 'Fill',
        repair: 'Fix',
        'feed-controller': 'RC+',
        withdraw: 'Get',
        store: 'Store',
        scavenge: 'Pick'
      };
      speech = taskSpeech[creep.memory.task] || 'Idle';
    }
    creep.memory.lastTtl = creep.ticksToLive;
    creep.memory.lastRoom = creep.room.name;
    creep.memory.lastTask = creep.memory.task || 'idle';
    creep.say(retiring ? 'Retire' : speech);
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
      const roomCreeps = Object.values(Game.creeps)
        .filter(creep => creep.memory.home === room.name);
      const sourceWorkerCount = roomCreeps.filter(creep =>
        creep.memory.role === 'miner' || creep.memory.role === 'harvester').length;
      const haulerCount = roomCreeps.filter(creep => creep.memory.role === 'hauler').length;
      const idleCount = roomCreeps.filter(creep =>
        (creep.memory.idleStreak || 0) > 0).length;
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
      const roadBudget = getRoadBudget(
        room, getImportantRoadPaths(room), controllerLevel);
      const allBusyAtTarget = roomCreeps.length >= workerLimit && idleCount === 0;
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
      if (roomCreeps.length >= reportedWorkerLimit) blockers.push('pop target');
      if (roomSpawns.every(spawn => spawn.spawning)) blockers.push('spawns busy');
      if (room.energyAvailable < workerCost) {
        blockers.push(`energy<${workerCost}`);
      }
      const status = blockers.length ? blockers.join(', ') : 'spawn ready';
      console.log([
        `[${Game.time}] ${room.name} RCL${controllerLevel} ${strategy.mode}`,
        `  Pop ${roomCreeps.length}/${reportedWorkerLimit} min${minimumWorkerLimit} | ` +
          `Src ${sourceWorkerCount}/${minerLimit} Ha ${haulerCount} Idle ${idleCount} | ` +
          `Energy available ${room.energyAvailable} | max ${room.energyCapacityAvailable}`,
        `  ${sources.join(' | ') || 'No sources'}`,
        `  Build ${buildTargets.join(', ') || 'none'} | Roads ${roadCount}+${roadSiteCount}/${roadBudget}`,
        `  Busy ${room.memory.busySummaryStreak}/4${targetIncrease ? ` ${targetIncrease}` : ''} | ` +
          `Sp ${spawns.join(',') || 'none'} | ${status}`,
        `  Next: ${strategy.gate}`
      ].join('\n'));
    }
  }
};
