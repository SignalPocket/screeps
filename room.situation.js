'use strict';
const { withCombatStatus } = typeof Game === 'undefined'
  ? require('./room.combat') : require('room.combat');
const {planLabor,applyLaborPolicy,workRate}=typeof Game==='undefined'
 ? require('./labor.capacity'):require('labor.capacity');
const { getRoadBacklog } = typeof Game === 'undefined'
  ? require('./road.backlog') : require('road.backlog');

const { updateRoomTrends, applyTrendAdjustments } =
  typeof Game === 'undefined'
    ? require('./room.trends')
    : require('room.trends');
const { getOperationalMetrics } = typeof Game === 'undefined'
  ? require('./health.operations') : require('health.operations');
const { scaleEnergyBudget } = typeof Game === 'undefined'
  ? require('./room.scaling') : require('room.scaling');

const { updateDeliveryPolicy } = typeof Game === 'undefined'
  ? require('./outpost.delivery') : require('outpost.delivery');
const { applySpawnCapacityBudget } = typeof Game === 'undefined'
  ? require('./spawn.capacity') : require('spawn.capacity');

const { applyOperationPolicy } = typeof Game === 'undefined'
  ? require('./colony.operations') : require('colony.operations');

const createRoomSituation = dependencies => {
  const {
    Game, derivePopulationPolicy, deriveRoomStatus, getRoomSources, buildBody=null,
    getRoomStructures, getSlowWorkInventory, getSourceBodyWorkCapacity,
    getSourceSpotCount, getSource2TunnelSite, hasLocalReplacementLife,
    isMaintainedRoad = () => true, isMaintainedContainer = () => true,
    getContainerPurpose = null,
    roadsPaused, STRUCTURE_CONTAINER, STRUCTURE_ROAD, STRUCTURE_WALL,
    STRUCTURE_RAMPART, STRUCTURE_EXTENSION, STRUCTURE_SPAWN,
    RESOURCE_ENERGY, TERRAIN_MASK_WALL, LOOK_STRUCTURES,
    OBSTACLE_OBJECT_TYPES, FIND_DROPPED_RESOURCES,
    FIND_MY_CONSTRUCTION_SITES, FIND_SOURCES, FIND_MY_SPAWNS,
    ENERGY_REGEN_TIME, HARVEST_POWER, CREEP_SPAWN_TIME = 3
  } = dependencies;
  const cache = {};

  /**
   * Measure a live room once per tick and adapt it to the pure colony policy.
   * This is the only layer that should translate Screeps objects into policy
   * inputs. The cached return value is shared by spawn, work, and reporting so
   * every consumer sees the same decision snapshot.
   */
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
    const highestSourceBufferRatio = bufferRatios.length
      ? Math.max(...bufferRatios) : 0;
    const storedSourceEnergy = containers.reduce((total, container) =>
      total + container.store[RESOURCE_ENERGY], 0);
    const sourceBufferCapacity = containers.reduce((total, container) =>
      total + (container.store.getCapacity(RESOURCE_ENERGY) || 0), 0);
    const sourceBufferRatio = sourceBufferCapacity > 0
      ? storedSourceEnergy / sourceBufferCapacity : 0;
    // Controller-buffer fill is measured separately from source buffers. A
    // full source buffer indicates missing collection; a full controller
    // buffer indicates delivery is ahead of WORK consumption. Combining them
    // would make the policy respond to two opposite bottlenecks as one fact.
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
    for (const plan of activeRemotePlans) {
      const remoteRoom = Game.rooms[plan.targetRoom];
      if (!plan.started) plan.started = Game.time;
      const backlog = remoteRoom ? getRoomStructures(remoteRoom)
        .filter(s => s.structureType === STRUCTURE_CONTAINER)
        .reduce((sum, s) => sum + (s.store[RESOURCE_ENERGY] || 0), 0) : 0;
      const deliveryPolicy = updateDeliveryPolicy({ tick: Game.time,
        survey: plan, economy: (room.memory.outpostEconomy || {})[plan.targetRoom],
        backlog, visible: Boolean(remoteRoom) });
      if (remoteRoom) remoteRoom.memory.deliveryPolicy = deliveryPolicy;
    }
    const remoteRoomsWithConstruction = activeRemotePlans.filter(plan => {
      if (plan.deliveryPolicy.blocked) return false;
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
    const remoteMinerDemand = activeRemotePlans.reduce((total, plan) => {
      if (plan.deliveryPolicy.blocked) return total;
      const needs = Array.isArray(plan.remoteWorkNeeds)
        ? plan.remoteWorkNeeds : [];
      return total + (needs.length
        ? needs.reduce((sum, need) => sum +
          Math.max(1, need.minMiners || 0), 0)
        : Math.max(1, plan.remoteMinerTarget || 0));
    }, 0);
    const remoteHaulerDemand = activeRemotePlans.reduce((total, plan) =>
      total + Math.max(1, plan.remoteHaulerTarget || 0), 0);
    const remoteBuilderDemand = activeRemotePlans.reduce((total, plan) =>
      total + Math.max(0, plan.remoteBuilderTarget || 0), 0);
    const coreRoadTargets = [...roomSpawns,
      ...(room.controller ? [room.controller] : []), ...sources];
    const coreRoadAccessComplete = coreRoadTargets.every(target =>
      structures.some(structure => structure.structureType === STRUCTURE_ROAD &&
        target.pos.getRangeTo(structure) <= 1));
    const sourceDistances = sources.map(source => roomSpawns[0]
      ? roomSpawns[0].pos.getRangeTo(source) : 15);
    const maxWorkPerBody = getSourceBodyWorkCapacity(room);
    const efficientSourceWorkers = sources.reduce((total, source) => {
      const requiredWork = Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER);
      return total + Math.max(Math.min(1, getSourceSpotCount(room, source)),
        Math.ceil(requiredWork / maxWorkPerBody));
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
    const energyStarvedSignal = energyRatio < 0.35 &&
      sourceBufferRatio < 0.25 &&
      storedEnergy < starvationReserve;
    if (energyStarvedSignal) {
      room.memory.energyStarvedUntil = Game.time + 25;
    } else if ((room.memory.energyStarvedUntil || 0) <= Game.time) {
      delete room.memory.energyStarvedUntil;
    }
    const roadBacklog = getRoadBacklog(room.memory.roadNetworkPlan,
      slowInventory.structures, slowInventory.sites);
    room.memory.roadBacklog = { ...roadBacklog, updated: Game.time };
    const construction = sites.reduce((summary, site) => {
      summary[site.structureType] = (summary[site.structureType] || 0) + 1;
      return summary;
    }, { remaining: buildRemaining + roadBacklog.unqueuedBuildLowerBound,
      roadUnqueued: roadBacklog.unqueued });
    const extensionClusters = [room.memory.extensionCluster].filter(cluster => cluster &&
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
    const operational = getOperationalMetrics(room.memory);
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
      bufferRatio: sourceBufferRatio,
      highestSourceBufferRatio,
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
      remoteMinerDemand,
      deliveryEligibleMinerDemand: remoteMinerDemand,
      remoteHaulerDemand,
      remoteBuilderDemand,
      mathRemoteBuilders: Boolean(buildBody),
      remoteBacklog: operational.remoteBacklog,
      remoteBlockedRooms: operational.remoteBlockedRooms,
      averageRemoteDistance: activeRemotePlans.length > 1 ? 40 : 25,
      remoteRoomsWithConstruction,
      remoteInfrastructureDemand: activeRemotePlans.reduce((total, plan) => {
        const backlog = Game.rooms[plan.targetRoom]?.memory.roadBacklog;
        return total + (backlog && (backlog.missing > 0 || backlog.repairHits > 0)
          ? Math.max(1, plan.remoteBuilderTarget || 0) : 0);
      }, 0),
      extensionMigrationActive: Boolean(room.memory.singleExtensionLayout &&
        (room.memory.singleExtensionLayout.migration || structures.some(s=>
          s.my && s.structureType === STRUCTURE_EXTENSION &&
          !room.memory.singleExtensionLayout.extensionTiles.some(p=>
            p.x===s.pos.x&&p.y===s.pos.y)))),
      coreRoadAccessComplete
    });
    // Apply the last completed trend analysis before recording this sample so
    // the snapshot's desired population matches the policy used this tick.
    applyTrendAdjustments(policy, room.memory.roomTrendHistory);
    if(buildBody && room.controller?.my){
      const roster=Object.values(Game.creeps).filter(c=>c.memory.home===room.name);
      if(!room.memory.laborPlan || Game.time-room.memory.laborPlan.updated>=20){
        const viable=roster.filter(c=>!c.spawning && hasLocalReplacementLife(c));
        const homeIncome=sources.reduce((total,source)=>{
          const miners=viable.filter(c=>['miner','harvester'].includes(c.memory.role) &&
            (c.memory.minerSource||c.memory.preferredSource||c.memory.harvestSource)===source.id);
          const rate=miners.reduce((sum,c)=>sum+workRate(c.getActiveBodyparts('work'),c.store.getCapacity('energy'),2),0);
          return total+Math.min(source.energyCapacity/ENERGY_REGEN_TIME,rate);
        },0);
        const end=Math.floor(Game.time/100)*100,start=end-500;
        const remoteIncome=Object.values(room.memory.outpostEconomy||{}).reduce((sum,stats)=>sum+
          Object.entries(stats.buckets||{}).filter(([tick])=>Number(tick)>=start&&Number(tick)<end)
            .reduce((value,[,amount])=>value+amount,0)/500,0);
        const roadWork=roadsPaused(room)?0:(room.memory.roadBacklog?.unqueuedBuildLowerBound||0);
        const readyStructures=structures.filter(s=>s.my&&[STRUCTURE_SPAWN,STRUCTURE_EXTENSION].includes(s.structureType));
        const deficit=readyStructures.reduce((sum,s)=>sum+s.store.getFreeCapacity(RESOURCE_ENERGY),0);
        room.memory.laborPlan=planLabor({tick:Game.time,previous:room.memory.laborPlan,
          stats:room.memory.laborStats,creeps:viable,buildRemaining:buildRemaining+roadWork,
          repairEnergy:repairRemaining/100,income:homeIncome+remoteIncome,storedEnergy,
          reserveFloor:policy.budgets.reserveFloor,deficit,clusters:policy.roles.refiller.min,
          controllerSpots:Math.max(1,Math.min(2,controllerWorkSpots)),
          controllerDanger:room.controller.ticksToDowngrade<3000,
          canBuild:policy.permissions.optionalConstruction||sites.some(s=>[STRUCTURE_SPAWN,STRUCTURE_CONTAINER].includes(s.structureType)),
          travel:Math.max(8,Math.min(40,sourceDistances.reduce((a,b)=>a+b,0)/Math.max(1,sourceDistances.length))),
          newBuilder:{body:buildBody('worker',room.energyCapacityAvailable)||[]},
          newUpgrader:{body:buildBody('controller',room.energyCapacityAvailable)||[]},
          energyCapacity:room.energyCapacityAvailable});
      }
      applyLaborPolicy(policy,room.memory.laborPlan);
    }
    applyOperationPolicy(policy, room, Game);
    if (buildBody && room.controller?.my) {
      const spawnTicks = (role, options) => {
        const body = buildBody(role, room.energyCapacityAvailable, options);
        return Math.max(CREEP_SPAWN_TIME,
          (body ? body.length : 1) * CREEP_SPAWN_TIME);
      };
      applySpawnCapacityBudget(policy, {
        source: spawnTicks('miner', { miningProduction: 10 }),
        refiller: spawnTicks('refiller', { maximize: true }),
        hauler: spawnTicks('hauler'),
        builder: spawnTicks('builder'),
        repairBuilder: spawnTicks('builder'),
        tunnelBuilder: spawnTicks('builder'),
        upgrader: spawnTicks('upgrader', { maximize: true, operationWork:
          policy.operations && policy.operations.upgradePush ? policy.operations.upgradeWork : undefined }),
        rebalancer: spawnTicks('rebalancer'),
        defender: spawnTicks('defender'),
        remoteMiner: spawnTicks('remote-miner'),
        remoteHauler: spawnTicks('remote-hauler'),
        remoteBuilder: spawnTicks('builder'),
        remoteReserver: 12
      }, { spawnCount: Math.max(1, roomSpawns.length), utilization: 0.8,
        auxiliaryLoad: policy.operations && policy.operations.managed
          ? Math.max(policy.operations.relayTarget,
            Object.values(Game.creeps).filter(c => c.memory.home === room.name &&
              c.memory.role === 'controller-relay').length) * 9 : 0 });
    }
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
    const viableRemoteHaulers = Object.values(Game.creeps).filter(creep =>
      creep.memory.home === room.name &&
      creep.memory.role === 'remote-hauler' &&
      (creep.spawning || hasLocalReplacementLife(creep))).length;
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
      bufferRatio: sourceBufferRatio,
      droppedEnergy,
      controllerTicks: room.controller && room.controller.ticksToDowngrade,
      buildRemaining,
      repairCritical: repairCrisis,
      repairRemaining,
      policyHealth: policy.health,
      policyMode: policy.mode
    });
    const situation = {
      mode: policy.mode,
      targets,
      policy,
      status,
      signals: {
        energyRatio,
        bufferRatio: sourceBufferRatio,
        controllerBufferRatio,
        controllerBufferCapacity,
        droppedEnergy,
        buildRemaining,
        repairRemaining,
        repairCritical: repairCrisis,
        controllerTicks: room.controller && room.controller.ticksToDowngrade,
        remoteBacklog: operational.remoteBacklog,
        remoteBlockedRooms: operational.remoteBlockedRooms,
        remoteRosterGap: operational.remoteRosterGap,
        remoteHaulerShortfall: Math.max(0,
          (policy.remote.haulers || 0) - viableRemoteHaulers),
        operationalSamples: operational.samples,
        taskFlips: operational.taskFlips,
        roleChanges: operational.roleChanges,
        stuckTicks: operational.stuckTicks
      }
    };
    room.memory.populationPolicy = {
      updated: Game.time,
      mode: policy.mode,
      health: policy.health,
      permissions: policy.permissions,
      budgets: policy.budgets,
      roles: policy.roles,
      remote: policy.remote,
      totals: policy.totals
    };
    Object.assign(status, withCombatStatus(status, room.memory.combatStatus));
    room.memory.roomStatus = Object.assign({ updated: Game.time }, status);
    cache[room.name] = situation;
    return situation;
  };

  return { getRoomSituation };
};

module.exports = { createRoomSituation };
