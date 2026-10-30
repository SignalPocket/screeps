'use strict';

const { updateRoomTrends, applyTrendAdjustments } =
  typeof Game === 'undefined'
    ? require('./room.trends')
    : require('room.trends');
const { getOperationalMetrics } = typeof Game === 'undefined'
  ? require('./health.operations') : require('health.operations');
const { scaleEnergyBudget } = typeof Game === 'undefined'
  ? require('./room.scaling') : require('room.scaling');

const createRoomSituation = dependencies => {
  const {
    Game, derivePopulationPolicy, deriveRoomStatus, getRoomSources,
    getRoomStructures, getSlowWorkInventory, getSourceBodyWorkCapacity,
    getSourceSpotCount, getSource2TunnelSite, hasLocalReplacementLife,
    isMaintainedRoad = () => true, isMaintainedContainer = () => true,
    getContainerPurpose = null,
    roadsPaused, STRUCTURE_CONTAINER, STRUCTURE_ROAD, STRUCTURE_WALL,
    STRUCTURE_RAMPART, STRUCTURE_EXTENSION, STRUCTURE_SPAWN,
    RESOURCE_ENERGY, TERRAIN_MASK_WALL, LOOK_STRUCTURES,
    OBSTACLE_OBJECT_TYPES, FIND_DROPPED_RESOURCES,
    FIND_MY_CONSTRUCTION_SITES, FIND_SOURCES, FIND_MY_SPAWNS,
    ENERGY_REGEN_TIME, HARVEST_POWER
  } = dependencies;
  const cache = {};

  const getRoomSituation = room => {
    if (cache[room.name]) return cache[room.name];
    const sources = getRoomSources(room);
    const structures = getRoomStructures(room);
    const slowInventory = getSlowWorkInventory(room);
    const containers = structures.filter(structure =>
      structure.structureType === STRUCTURE_CONTAINER &&
        (getContainerPurpose
          ? String(getContainerPurpose(room, structure.pos) || '')
            .startsWith('source:')
          : sources.some(source => source.pos.getRangeTo(structure) <= 2)));
    const bufferRatios = containers.map(container => {
      const capacity = container.store.getCapacity(RESOURCE_ENERGY) || 1;
      return container.store[RESOURCE_ENERGY] / capacity;
    });
    const bufferRatio = bufferRatios.length ? Math.max(...bufferRatios) : 0;
    const storedSourceEnergy = containers.reduce((total, container) =>
      total + container.store[RESOURCE_ENERGY], 0);
    const sourceBufferCapacity = containers.reduce((total, container) =>
      total + (container.store.getCapacity(RESOURCE_ENERGY) || 0), 0);
    const sourceBufferRatio = sourceBufferCapacity > 0
      ? storedSourceEnergy / sourceBufferCapacity : 0;
    const controllerContainers = structures.filter(structure =>
      structure.structureType === STRUCTURE_CONTAINER && room.controller &&
      (getContainerPurpose
        ? getContainerPurpose(room, structure.pos) === 'controller'
        : structure.pos.getRangeTo(room.controller) <= 3));
    const controllerBufferStored = controllerContainers.reduce(
      (total, container) => total + container.store[RESOURCE_ENERGY], 0);
    const controllerBufferCapacity = controllerContainers.reduce(
      (total, container) => total +
        container.store.getCapacity(RESOURCE_ENERGY), 0);
    const controllerBufferRatio = controllerBufferCapacity > 0
      ? controllerBufferStored / controllerBufferCapacity : 0;
    const controllerWorkSpots = controllerContainers.reduce(
      (total, container) => {
        const terrain = room.getTerrain();
        let spots = 0;
        for (let x = container.pos.x - 1; x <= container.pos.x + 1; x++) {
          for (let y = container.pos.y - 1; y <= container.pos.y + 1; y++) {
            if (x < 1 || x > 48 || y < 1 || y > 48 ||
                x === container.pos.x && y === container.pos.y ||
                terrain.get(x, y) === TERRAIN_MASK_WALL ||
                room.controller.pos.getRangeTo(x, y) > 3) continue;
            const blocked = room.lookForAt(LOOK_STRUCTURES, x, y)
              .some(structure => OBSTACLE_OBJECT_TYPES.includes(
                structure.structureType) &&
                !(structure.structureType === STRUCTURE_RAMPART &&
                  (structure.my || structure.isPublic)));
            if (!blocked) spots++;
          }
        }
        return total + spots;
      }, 0);
    const currentUpgraders = Object.values(Game.creeps).filter(creep =>
      creep.memory.home === room.name && creep.memory.role === 'upgrader' &&
      (creep.spawning || hasLocalReplacementLife(creep))).length;
    const haulingSurgeUnit = Math.max(500,
      Math.round(sourceBufferCapacity * 0.25));
    const haulingSurge = bufferRatio >= 0.75
      ? Math.min(3, Math.ceil(storedSourceEnergy / haulingSurgeUnit))
      : bufferRatio >= 0.5 ? 1 : 0;
    const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
      filter: resource => resource.resourceType === RESOURCE_ENERGY
    }).reduce((total, resource) => total + resource.amount, 0);
    const energyRatio = room.energyCapacityAvailable > 0
      ? room.energyAvailable / room.energyCapacityAvailable : 0;
    const sites = slowInventory.sites.filter(site =>
      !roadsPaused(room) || site.structureType !== STRUCTURE_ROAD);
    const buildRemaining = sites.reduce((total, site) =>
      total + site.progressTotal - site.progress, 0);
    const repairStructures = slowInventory.structures.filter(structure =>
      structure.hitsMax > 0 &&
        (structure.my || structure.structureType === STRUCTURE_ROAD ||
          structure.structureType === STRUCTURE_CONTAINER) &&
        (!roadsPaused(room) || structure.structureType !== STRUCTURE_ROAD) &&
        (structure.structureType !== STRUCTURE_ROAD ||
          isMaintainedRoad(room, structure)) &&
        (structure.structureType !== STRUCTURE_CONTAINER ||
          isMaintainedContainer(room, structure)) &&
        structure.structureType !== STRUCTURE_WALL &&
        structure.structureType !== STRUCTURE_RAMPART);
    const repairCrisis = repairStructures.some(structure =>
      structure.hits < structure.hitsMax * 0.35);
    const repairRemaining = repairStructures.reduce((total, structure) =>
      total + Math.max(0, structure.hitsMax * 0.75 - structure.hits), 0);
    const activeRemotePlans = [room.memory.leftSurvey,
      room.memory.southSurvey, room.memory.southwestSurvey]
      .filter(plan => plan && plan.active && plan.targetRoom);
    const remoteRoomsWithConstruction = activeRemotePlans.filter(plan => {
      const remoteRoom = Game.rooms[plan.targetRoom];
      return remoteRoom && remoteRoom.find(FIND_MY_CONSTRUCTION_SITES).length;
    }).length;
    const activeRemoteSources = activeRemotePlans.reduce((total, plan) => {
      if (Array.isArray(plan.remoteWorkNeeds) && plan.remoteWorkNeeds.length) {
        return total + plan.remoteWorkNeeds.length;
      }
      const remoteRoom = Game.rooms[plan.targetRoom];
      return total + (remoteRoom ? remoteRoom.find(FIND_SOURCES).length :
        Math.max(1, plan.remoteMinerTarget || 1));
    }, 0);
    const roomSpawns = room.find(FIND_MY_SPAWNS);
    const sourceDistances = sources.map(source => roomSpawns[0]
      ? roomSpawns[0].pos.getRangeTo(source) : 15);
    const maxWorkPerBody = getSourceBodyWorkCapacity(room);
    const efficientSourceWorkers = sources.reduce((total, source) => {
      const requiredWork = Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER);
      return total + Math.max(1, Math.ceil(requiredWork / maxWorkPerBody));
    }, 0);
    const sourceWorkSpots = sources.reduce((total, source) =>
      total + getSourceSpotCount(room, source), 0);
    const learnedSourceWorkers = sources.reduce((total, source) => {
      const stats = room.memory.sourceMiningStats &&
        room.memory.sourceMiningStats[source.id];
      return total + Math.max(1, stats && stats.targetMiners || 1);
    }, 0);
    const sourceEnergy = sources.reduce((total, source) =>
      total + source.energy, 0);
    const sourceCapacity = sources.reduce((total, source) =>
      total + source.energyCapacity, 0);
    const sourceStatsTotal = field => sources.reduce((total, source) => {
      const stats = room.memory.sourceMiningStats &&
        room.memory.sourceMiningStats[source.id];
      return total + (stats && stats[field] || 0);
    }, 0);
    const sourceSampleTicks = sourceStatsTotal('sampleTicks');
    const storedEnergy = structures.reduce((total, structure) =>
      total + (structure.store && structure.store[RESOURCE_ENERGY] || 0), 0);
    const starvationReserve = scaleEnergyBudget(
      room.energyCapacityAvailable, 0.5);
    const energyStarvedSignal = energyRatio < 0.35 && bufferRatio < 0.25 &&
      storedEnergy < starvationReserve;
    if (energyStarvedSignal) {
      room.memory.energyStarvedUntil = Game.time + 25;
    } else if ((room.memory.energyStarvedUntil || 0) <= Game.time) {
      delete room.memory.energyStarvedUntil;
    }
    const construction = sites.reduce((summary, site) => {
      summary[site.structureType] = (summary[site.structureType] || 0) + 1;
      return summary;
    }, { remaining: buildRemaining });
    const extensionClusters = [room.memory.extensionCluster,
      room.memory.extensionOverflowCluster].filter(cluster => cluster &&
      structures.some(structure => structure.my &&
        structure.structureType === STRUCTURE_EXTENSION &&
        Math.max(Math.abs(structure.pos.x - cluster.x),
          Math.abs(structure.pos.y - cluster.y)) <= 3));
    const extensionContainers = structures.filter(structure =>
      structure.structureType === STRUCTURE_CONTAINER &&
      (getContainerPurpose
        ? getContainerPurpose(room, structure.pos) === 'extensions'
        : extensionClusters.some(cluster =>
          Math.max(Math.abs(structure.pos.x - cluster.x),
            Math.abs(structure.pos.y - cluster.y)) <= 3)));
    const extensionBufferCapacity = extensionContainers.reduce(
      (total, container) => total +
        (container.store.getCapacity(RESOURCE_ENERGY) || 0), 0);
    const extensionBufferRatio = extensionBufferCapacity > 0
      ? extensionContainers.reduce((total, container) => total +
        container.store[RESOURCE_ENERGY], 0) / extensionBufferCapacity
      : null;
    const policy = derivePopulationPolicy({
      rcl: room.controller && room.controller.level,
      controllerOwned: Boolean(room.controller && room.controller.my),
      controllerTicks: room.controller && room.controller.ticksToDowngrade,
      spawnCount: roomSpawns.length,
      sourceCount: sources.length,
      efficientSourceWorkers,
      learnedSourceWorkers,
      sourceWorkSpots,
      sourceContainerCount: containers.length,
      averageSourceDistance: sourceDistances.length
        ? sourceDistances.reduce((sum, value) => sum + value, 0) /
          sourceDistances.length : 15,
      energyRatio,
      energyCapacity: room.energyCapacityAvailable,
      bufferRatio,
      storedEnergy,
      energyStarvedHold: (room.memory.energyStarvedUntil || 0) > Game.time,
      storedSourceEnergy,
      sourceBufferCapacity,
      controllerBufferRatio,
      controllerBufferStored,
      controllerWorkSpots,
      currentUpgraders,
      droppedEnergy,
      extensionCount: structures.filter(structure =>
        structure.structureType === STRUCTURE_EXTENSION && structure.my).length,
      extensionClusterCount: extensionClusters.length,
      energyConsumerCount: structures.filter(structure => structure.my &&
        (structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_EXTENSION)).length,
      construction,
      repair: { critical: repairCrisis, remaining: repairRemaining },
      blockedSourceSite: Boolean(getSource2TunnelSite(room)),
      containerImbalance: bufferRatios.length >= 2
        ? Math.max(...bufferRatios) - Math.min(...bufferRatios) : 0,
      activeRemoteRooms: activeRemotePlans.length,
      activeRemoteSources,
      averageRemoteDistance: activeRemotePlans.length > 1 ? 40 : 25,
      remoteRoomsWithConstruction
    });
    const operational = getOperationalMetrics(room.memory);
    // Apply the last completed trend analysis before recording this sample so
    // the snapshot's desired population matches the policy used this tick.
    applyTrendAdjustments(policy, room.memory.roomTrendHistory);
    const trendHistory = updateRoomTrends(room.memory, Game.time, {
      repair: repairRemaining,
      build: buildRemaining,
      sourceRatio: sourceBufferRatio,
      // A room without a controller work buffer must not look like a hauling
      // failure. There is no destination to keep stocked yet.
      workBufferRatio: controllerBufferCapacity > 0
        ? controllerBufferRatio : 1,
      lowestSourceRatio: bufferRatios.length ? Math.min(...bufferRatios) : 0,
      extensionBufferRatio,
      readyRatio: energyRatio,
      energyCapacity: room.energyCapacityAvailable,
      storedEnergy,
      dropped: droppedEnergy,
      population: Object.values(Game.creeps).filter(creep =>
        creep.memory.home === room.name).length,
      desiredPopulation: policy.totals.desired,
      controllerTicks: room.controller && room.controller.ticksToDowngrade,
      controllerProgress: room.controller && room.controller.progressTotal > 0
        ? room.controller.progress / room.controller.progressTotal : 0,
      activeOutposts: activeRemotePlans.length,
      ...operational
    });
    const targets = Object.fromEntries(Object.entries(policy.roles)
      .map(([name, staffing]) => [name, staffing.desired]));
    targets.hauler = Math.max(targets.hauler,
      policy.roles.hauler.min + haulingSurge);
    const status = deriveRoomStatus({
      sourceCount: sources.length,
      energyRatio,
      energyCapacity: room.energyCapacityAvailable,
      storedEnergy,
      storedSourceEnergy,
      sourceEnergyRatio: sourceCapacity > 0 ? sourceEnergy / sourceCapacity : 0,
      emptySourceCount: sources.filter(source => source.energy === 0).length,
      sourceEarlyEmptyRate: sourceSampleTicks > 0
        ? sourceStatsTotal('earlyEmptyTicks') / sourceSampleTicks : 0,
      sourceHighEnergyRate: sourceSampleTicks > 0
        ? sourceStatsTotal('highEnergyTicks') / sourceSampleTicks : 0,
      bufferRatio,
      droppedEnergy,
      controllerTicks: room.controller && room.controller.ticksToDowngrade,
      buildRemaining,
      repairCritical: repairCrisis,
      repairRemaining
    });
    const situation = {
      mode: policy.mode,
      targets,
      policy,
      status,
      signals: {
        energyRatio,
        bufferRatio,
        controllerBufferRatio,
        droppedEnergy,
        buildRemaining,
        controllerTicks: room.controller && room.controller.ticksToDowngrade
      }
    };
    room.memory.populationPolicy = {
      updated: Game.time,
      mode: policy.mode,
      roles: policy.roles,
      remote: policy.remote,
      totals: policy.totals
    };
    room.memory.roomStatus = Object.assign({ updated: Game.time }, status);
    cache[room.name] = situation;
    return situation;
  };

  return { getRoomSituation };
};

module.exports = { createRoomSituation };
