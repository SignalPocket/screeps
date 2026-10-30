'use strict';

const { derivePopulationPolicy } = require('colony.policy');
const { createBodyFactory } = require('body.factory');
const { createResourceReservations } = require('resource.reservations');
const { createRoomIndex } = require('room.index');
const { createMovementService } = require('movement.service');
const { createCreepLifecycle } = require('creep.lifecycle');
const { createCreepReporting, shortCreepName, shortRoles, shortTasks } =
  require('creep.reporting');
const { createSourceStaffing } = require('source.staffing');
const { createRoomStrategy } = require('room.strategy');
const { createSourcePositions } = require('source.positions');
const { deriveRoomStatus } = require('room.status');
const { createOutpostStatus } = require('outpost.status');
const { createRoomSituation } = require('room.situation');
const { createWorkerLimits } = require('worker.limits');
const { getRoomStagePlan } = require('room.stages');
const { createRemoteHauling } = require('remote.hauling');
const { createEnergyPhase } = require('energy.phase');
const { createRoadPlanner } = require('road.planner');
const { createInfrastructurePlanner } = require('infrastructure.planner');
const { createOutpostMaintenance } = require('outpost.maintenance');
const { createMemoryMaintenance } = require('memory.maintenance');
const { createCreepNaming } = require('creep.naming');
const { createColonyDashboard } = require('colony.dashboard');
const { createRefillManagement } = require('refill.management');
const { createSpawnPolicy } = require('spawn.policy');
const { createTaskReservations } = require('task.reservations');
const { planRefillTargets } = require('refill.dispatch');
const { planControllerStations } = require('controller.stations');
const { planSalvageAssignments } = require('salvage.dispatch');
const { runTowers } = require('tower.control');
const { createOutpostPlanning } = require('outpost.planning');
const { reconcileRemoteHaulerRosters } = require('remote.roster');
const { createExpansionPlanner } = require('expansion.planner');
const { normalizeBuilderMemory, isBuilder, isLocalBuilder,
  isOutpostBuilder, isExpansionBuilder } = require('builder.roles');
const { selectRebalancerSurplus, getWithdrawalApproachTarget } =
  require('creep.routing');

const { workerCost, buildBody, getBodyCode } = createBodyFactory({
  WORK, CARRY, MOVE, ATTACK, RANGED_ATTACK, HEAL, CLAIM, TOUGH,
  BODYPART_COST
});

// A state-driven colony: one room policy owns population decisions while role
// code executes the resulting jobs.
module.exports.loop = function () {
  if (!Memory.creeps) Memory.creeps = {};

  // Outpost staffing is derived from visible sources, construction, route
  // distance, and container pressure. Unseen discovery starts with one scout.
  const showTrafficHeatmap = false;
  const REFILLER_MAX_CHARGE_WAIT = 25;
  const MAX_SPAWN_CHARGE_WAIT = 60;
  const { prepareSpawnRequest, clearSpawnWait } = createSpawnPolicy({
    Game, buildBody, CARRY, WORK, MOVE,
    refillerMaxChargeWait: REFILLER_MAX_CHARGE_WAIT,
    maxSpawnChargeWait: MAX_SPAWN_CHARGE_WAIT
  });
  const roadsPaused = room => !room.controller || room.controller.level <= 2;
  const roomScheduleOffset = roomName => [...roomName]
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  const scheduledRoomTick = (room, interval, phase = 0) =>
    (Game.time + roomScheduleOffset(room.name) + phase) % interval === 0;
  const { getRoomSources, getRoomStructures, getRoomSites, getRoomCreeps,
    getSlowWorkInventory } = createRoomIndex({ Game, FIND_SOURCES,
    FIND_STRUCTURES, FIND_MY_CONSTRUCTION_SITES, FIND_MY_CREEPS });
  const { refreshRoomOrdinals, getRoomOrdinal, getBirthName } =
    createCreepNaming({ Game, Memory, getRoomSources });
  refreshRoomOrdinals();
  const { getSourceSpotCount, getSourceBodyWorkCapacity,
    reviewSourceStaffing, getSourceWorkerTargets, assignUnallocatedRoles } =
    createSourceStaffing({
    Game, getRoomSources, TERRAIN_MASK_WALL, LOOK_STRUCTURES,
    LOOK_CONSTRUCTION_SITES, OBSTACLE_OBJECT_TYPES, BODYPART_COST, CARRY,
    MOVE, WORK, ENERGY_REGEN_TIME, HARVEST_POWER
  });
  const { getRoomStrategy } = createRoomStrategy({
    Game, getRoomSources, getRoomStagePlan, FIND_STRUCTURES, FIND_MY_SPAWNS,
    FIND_MY_STRUCTURES, STRUCTURE_ROAD, STRUCTURE_TOWER
  });
  const { findMinerStation, getSource2TunnelSite } = createSourcePositions({
    getRoomSources, getRoomSites, LOOK_STRUCTURES, LOOK_CREEPS,
    OBSTACLE_OBJECT_TYPES, STRUCTURE_ROAD, STRUCTURE_RAMPART,
    TERRAIN_MASK_WALL
  });
  const { updateOutpostStatus } = createOutpostStatus({
    Game, deriveRoomStatus, getRoomSources, getRoomStructures,
    STRUCTURE_CONTAINER, RESOURCE_ENERGY, FIND_DROPPED_RESOURCES,
    FIND_MY_CONSTRUCTION_SITES
  });
  const { moveCreep } = createMovementService({ Game, Room, FIND_STRUCTURES,
    FIND_MY_CREEPS, STRUCTURE_ROAD, OK, ERR_INVALID_TARGET });
  const { hasWorkParts, hasRoadMobility, hasBuilderBody,
    getRemoteReplacementLead,
    hasRemoteReplacementLife, hasLocalReplacementLife } =
    createCreepLifecycle({ Game, WORK, MOVE, CREEP_SPAWN_TIME });
  const { getObjectLabel, formatTaskTarget, logDeadCreeps } =
    createCreepReporting({ Game, getRoomSources, STRUCTURE_CONTAINER });
  logDeadCreeps(Memory.creeps);
  const towerStatuses = runTowers({
    rooms: Object.values(Game.rooms), RESOURCE_ENERGY, FIND_MY_STRUCTURES,
    FIND_HOSTILE_CREEPS, FIND_MY_CREEPS, FIND_STRUCTURES, STRUCTURE_TOWER,
    STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_WALL, STRUCTURE_RAMPART,
    ATTACK, RANGED_ATTACK, HEAL, WORK, CLAIM
  });
  const getRefillPriority = (room, structure) => {
    const underAttack = towerStatuses[room.name] &&
      towerStatuses[room.name].hostileCount > 0;
    if (structure.structureType === STRUCTURE_TOWER) return underAttack ? 0 : 2;
    if (structure.structureType === STRUCTURE_SPAWN) return underAttack ? 1 : 0;
    return underAttack ? 2 : 1;
  };
  for (const creep of Object.values(Game.creeps)) {
    normalizeBuilderMemory(creep.memory);
    if (creep.memory.role === 'worker' && hasBuilderBody(creep)) {
      creep.memory.role = 'builder';
      creep.memory.birthRole = creep.memory.birthRole === 'worker'
        ? 'builder' : creep.memory.birthRole;
      creep.memory.builderScope = 'local';
      creep.memory.builderMission = 'flexible';
    }
  }
  // Preserve one outpost builder per planned slot. A replacement may already
  // be spawning when an old builder becomes visible again; keep the active
  // roster and turn the duplicate into useful local construction capacity.
  for (const homeRoom of Object.values(Game.rooms).filter(room =>
    room.controller && room.controller.my)) {
    const plans = [homeRoom.memory.leftSurvey, homeRoom.memory.southSurvey,
      homeRoom.memory.southwestSurvey].filter(plan => plan && plan.active &&
      plan.targetRoom && (plan.remoteBuilderTarget || 0) > 0);
    for (const plan of plans) {
      const candidates = Object.values(Game.creeps).filter(creep =>
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
        console.log(`[${Game.time}] ${creep.name} duplicate outpost builder ` +
          `-> local builder`);
      }
    }
  }
  if (!Memory.memoryMaintenance ||
      Game.time - (Memory.memoryMaintenance.lastRun || 0) >= 1000) {
    const { runMemoryMaintenance } = createMemoryMaintenance({ Game });
    const maintenanceStats = runMemoryMaintenance(Memory);
    Memory.memoryMaintenance = {
      lastRun: Game.time,
      ...maintenanceStats
    };
    console.log(`[${Game.time}] Memory maintenance | ` +
      `dead ${maintenanceStats.deadCreeps}, ` +
      `nav ${maintenanceStats.staleNavigation}, ` +
      `commit ${maintenanceStats.staleCommitments}, ` +
      `room ${maintenanceStats.staleRoomState}`);
  }
  const { getRoomSituation } = createRoomSituation({
    Game, derivePopulationPolicy, deriveRoomStatus, getRoomSources,
    getRoomStructures, getSlowWorkInventory, getSourceBodyWorkCapacity,
    getSourceSpotCount, getSource2TunnelSite, hasLocalReplacementLife,
    isMaintainedRoad: (room, structure) =>
      isHeatmapRoadPosition(room, structure),
    isMaintainedContainer: (room, structure) =>
      Boolean(getContainerPurpose(room, structure.pos)),
    roadsPaused, STRUCTURE_CONTAINER, STRUCTURE_ROAD, STRUCTURE_WALL,
    STRUCTURE_RAMPART, STRUCTURE_EXTENSION, STRUCTURE_SPAWN,
    RESOURCE_ENERGY, TERRAIN_MASK_WALL, LOOK_STRUCTURES,
    OBSTACLE_OBJECT_TYPES, FIND_DROPPED_RESOURCES,
    FIND_MY_CONSTRUCTION_SITES, FIND_SOURCES, FIND_MY_SPAWNS,
    ENERGY_REGEN_TIME, HARVEST_POWER
  });
  const getBuilderTarget = room => getRoomSituation(room).targets.builder;
  const { getWorkerLimits } = createWorkerLimits({
    Game, getRoomSources, getRoomCreeps, getSourceWorkerTargets,
    getRoomSituation, LOOK_STRUCTURES, LOOK_CONSTRUCTION_SITES,
    OBSTACLE_OBJECT_TYPES, STRUCTURE_ROAD, STRUCTURE_RAMPART,
    TERRAIN_MASK_WALL
  });
  const { updateDashboard, drawDashboard } = createColonyDashboard({
    Game, Memory, getWorkerLimits, getRoomStructures, shortRoles,
    maxSpawnWait: MAX_SPAWN_CHARGE_WAIT, RESOURCE_ENERGY, STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION, FIND_DROPPED_RESOURCES
  });
  const { getRemoteResourceSummary, rankRemoteDispatchRooms,
    getRemoteHaulReadiness, getRemoteHaulerTarget } =
    createRemoteHauling({
      Game, PathFinder, buildBody, FIND_SOURCES, FIND_STRUCTURES,
      FIND_MY_SPAWNS, STRUCTURE_CONTAINER, RESOURCE_ENERGY, CARRY,
      CARRY_CAPACITY, ENERGY_REGEN_TIME
    });
  const { updateEnergyWorkPhase } = createEnergyPhase({ Game, workerCost });
  const { getImportantRoadPaths, isSingleLaneRoadPosition,
    getImportantTravelPaths, getInterRoomTravelPaths,
    getConvergedTravelPaths, getHeatmapRoadTiles, isHeatmapRoadPosition,
    updateTrafficHeatmap,
    drawRoadPlan, drawTravelPaths, getRoadBudget, placeRoadSite } =
    createRoadPlanner({
    Game, scheduledRoomTick, getRoomSources, getRoomCreeps,
    showTrafficHeatmap, FIND_MY_SPAWNS, FIND_STRUCTURES,
    FIND_MY_CONSTRUCTION_SITES, STRUCTURE_ROAD, STRUCTURE_CONTAINER,
    LOOK_STRUCTURES,
    LOOK_CONSTRUCTION_SITES, TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP, OK
  });
  const { isExtensionClusterTile, placeExtensionSite, placeStorageSite,
    getContainerPurpose,
    isExtensionRefillBuffer, placeSourceContainerSite,
    manageExtensionContainer, manageControllerContainer,
    isRetiringContainer } = createInfrastructurePlanner({
    Game, RoomPosition, getRoomSources, isSingleLaneRoadPosition,
    CONTROLLER_STRUCTURES, STRUCTURE_EXTENSION, STRUCTURE_CONTAINER,
    STRUCTURE_STORAGE, STRUCTURE_ROAD, STRUCTURE_RAMPART, FIND_MY_STRUCTURES,
    FIND_MY_CONSTRUCTION_SITES, FIND_MY_SPAWNS, FIND_STRUCTURES,
    TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP, LOOK_STRUCTURES,
    LOOK_CONSTRUCTION_SITES, LOOK_CREEPS, RESOURCE_ENERGY, OK
  });
  const { isRepairTarget: isOutpostRepairTarget,
    selectRepairTarget: selectOutpostRepairTarget,
    getBuilderTarget: getOutpostBuilderTarget } =
    createOutpostMaintenance({ STRUCTURE_CONTAINER, STRUCTURE_ROAD });
  const getRemoteBuilderTarget = remoteRoom => {
    if (!remoteRoom) return 0;
    const sites = remoteRoom.find(FIND_MY_CONSTRUCTION_SITES).length;
    return getOutpostBuilderTarget(getRoomStructures(remoteRoom), sites);
  };
  const { refreshRemoteWorkNeeds, planRegionalOutposts } =
    createOutpostPlanning({
      Game, getRemoteBuilderTarget, getRemoteHaulerTarget,
      getSourceBodyWorkCapacity, scheduledRoomTick, FIND_SOURCES, LEFT, BOTTOM,
      ENERGY_REGEN_TIME, HARVEST_POWER
    });
  const { updateExpansionPlan } = createExpansionPlanner({
    Game, getRoomSources, FIND_STRUCTURES, FIND_MY_SPAWNS,
    FIND_MY_CONSTRUCTION_SITES, FIND_SOURCES, STRUCTURE_CONTAINER,
    STRUCTURE_ROAD, STRUCTURE_SPAWN, TERRAIN_MASK_WALL, LOOK_STRUCTURES,
    LOOK_CONSTRUCTION_SITES, BODYPART_COST, CLAIM, MOVE, OK
  });
  const { getRefillClusters, isRefillTargetFor, getRefillerCarryFloor,
    reconcileRefillerClusters, releaseUndersizedRefillers } =
    createRefillManagement({
      Game, getRoomStructures, isExtensionClusterTile, getRoomSituation,
      FIND_MY_SPAWNS, STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TOWER,
      RESOURCE_ENERGY, BODYPART_COST, CARRY, MOVE, CARRY_CAPACITY
    });
  const getDesiredSourceWorkerLimit = (room, population) => {
    const { sourceWorkerTargetTotal } = getWorkerLimits(room);
    return sourceWorkerTargetTotal;
  };
  const getSpawnAssignment = (room, workers) => {
    // Keep the core room productive before assigning optional remote labor.
    const situationTargets = getRoomSituation(room).targets;
    const localMiningLimits = getWorkerLimits(room);
    const recoveryEnergy = Math.min(room.energyCapacityAvailable, 700);
    const viableUpgraders = workers.filter(creep =>
      creep.memory.role === 'upgrader' && hasLocalReplacementLife(creep) &&
      creep.getActiveBodyparts(WORK) >= 4);
    // The controller must always have one real specialist before any optional
    // logistics role is added.
    if (viableUpgraders.length === 0) {
      const activeUpgrader = workers.some(creep =>
        creep.memory.role === 'upgrader' &&
        creep.getActiveBodyparts(WORK) >= 4);
      return {
        role: 'upgrader',
        forceSpawn: true,
        minimumEnergy: activeUpgrader
          ? room.energyCapacityAvailable : recoveryEnergy
      };
    }
    // Once that safety floor exists, establish the exclusive room refiller
    // before adding more upgraders or replacing secondary source positions.
    const refillClusters = getRefillClusters(room);
    const viableRefillers = workers.filter(creep =>
      creep.memory.role === 'refiller' && hasLocalReplacementLife(creep) &&
      creep.store.getCapacity(RESOURCE_ENERGY) >=
        getRefillerCarryFloor(room));
    const activeRefillers = workers.filter(creep =>
      creep.memory.role === 'refiller' && hasLocalReplacementLife(creep));
    const coveredRefillClusters = new Set(activeRefillers.map(creep =>
      creep.memory.refillClusterId).filter(Boolean));
    const missingRefillCluster = refillClusters.find(cluster =>
      !coveredRefillClusters.has(cluster.id));
    const emergencyRefillerGap = activeRefillers.length <
      situationTargets.refiller || Boolean(missingRefillCluster);
    const undersizedRefiller = activeRefillers.find(creep =>
      creep.store.getCapacity(RESOURCE_ENERGY) <
        getRefillerCarryFloor(room));
    const canAffordQualityRefiller = room.energyAvailable >=
      room.energyCapacityAvailable;
    if (emergencyRefillerGap ||
        viableRefillers.length < situationTargets.refiller &&
          canAffordQualityRefiller) {
      const replacementCluster = missingRefillCluster ||
        refillClusters.find(cluster => undersizedRefiller &&
          undersizedRefiller.memory.refillClusterId === cluster.id);
      const refillerMinimumEnergy = Math.max(recoveryEnergy,
        getRefillerCarryFloor(room) / CARRY_CAPACITY *
          (BODYPART_COST[CARRY] + BODYPART_COST[MOVE]));
      return {
        role: 'refiller',
        forceSpawn: true,
        refillClusterId: replacementCluster && replacementCluster.id,
        refillClusterX: replacementCluster && replacementCluster.x,
        refillClusterY: replacementCluster && replacementCluster.y,
        refillSpawnOwner: Boolean(replacementCluster &&
          replacementCluster.fillsSpawn),
        refillerFallbackAllowed: emergencyRefillerGap,
        minimumEnergy: emergencyRefillerGap
          ? refillerMinimumEnergy : room.energyCapacityAvailable
      };
    }
    // Income stations come first: fill every currently usable source position
    // before considering role conversions for secondary work.
    const uncoveredLocalSource = getRoomSources(room).find(source => {
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
      return assignedWork < requiredWork;
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
    // Home source buffers need their own carrier. Without this floor, remote
    // haulers are repeatedly pulled into the S1/S2 corridor and clog the same
    // one-tile delivery path that remote traffic must cross.
    const localHaulerFloor = situationTargets.hauler;
    const viableLocalHaulers = workers.filter(creep =>
      creep.memory.role === 'hauler' && hasLocalReplacementLife(creep));
    if (viableLocalHaulers.length < localHaulerFloor) {
      const activeLocalHauler = workers.some(creep =>
        creep.memory.role === 'hauler');
      return {
        role: 'hauler',
        forceSpawn: true,
        minimumEnergy: activeLocalHauler
          ? room.energyCapacityAvailable : recoveryEnergy
      };
    }
    // Damaged outpost containers can erase the remote economy entirely. Once
    // home income and its dedicated refill specialist are safe, restore one
    // maintainer before remote carrier replacement churn can starve repairs.
    const maintenanceSurveys = [
      { survey: room.memory.leftSurvey, team: 'left' },
      { survey: room.memory.southSurvey, team: 'south', delivery: 's2' },
      { survey: room.memory.southwestSurvey, team: 'southwest' }
    ].filter(entry => entry.survey && entry.survey.active &&
      entry.survey.targetRoom && entry.survey.remoteBuilderTarget > 0);
    const missingMaintainer = maintenanceSurveys.map(entry => {
      const assigned = workers.filter(creep =>
        isOutpostBuilder(creep) &&
        creep.memory.remoteRoom === entry.survey.targetRoom &&
        hasRemoteReplacementLife(creep));
      const usedSlots = new Set(assigned.map(creep =>
        creep.memory.remoteBuilderSlot));
      const missingSlot = [...Array(
        entry.survey.remoteBuilderTarget).keys()]
        .find(slot => !usedSlots.has(slot));
      return { ...entry, missingSlot };
    }).find(entry => Number.isInteger(entry.missingSlot));
    if (missingMaintainer) {
      return {
        role: 'builder',
        builderScope: 'outpost',
        builderMission: 'maintenance',
        remoteRoom: missingMaintainer.survey.targetRoom,
        remoteBuilderSlot: missingMaintainer.missingSlot,
        remoteTeam: missingMaintainer.team,
        remoteDelivery: missingMaintainer.delivery,
        forceSpawn: true
      };
    }
    // A producing outpost with no carrier is an income outage, not optional
    // expansion. Guarantee one viable carrier per ready source lane before
    // surplus upgrading, balancing, or construction.
    const essentialRemotePlans = [
      { survey: room.memory.leftSurvey, team: 'left' },
      { survey: room.memory.southSurvey, team: 'south', delivery: 's2' },
      { survey: room.memory.southwestSurvey, team: 'southwest' }
    ].filter(entry => entry.survey && entry.survey.active &&
      entry.survey.targetRoom);
    for (const entry of essentialRemotePlans) {
      const needs = Array.isArray(entry.survey.remoteWorkNeeds) &&
        entry.survey.remoteWorkNeeds.length
        ? entry.survey.remoteWorkNeeds
        : [{ slot: 0 }];
      for (const need of needs) {
        const readiness = getRemoteHaulReadiness(
          entry.survey.targetRoom, need.slot);
        if (!readiness.ready) continue;
        const covered = workers.some(creep =>
          creep.memory.role === 'remote-hauler' &&
          creep.memory.remoteRoom === entry.survey.targetRoom &&
          creep.memory.remoteHaulerSlot === need.slot &&
          hasRemoteReplacementLife(creep));
        if (!covered) {
          return {
            role: 'remote-hauler',
            remoteRoom: entry.survey.targetRoom,
            remoteHaulerSlot: need.slot,
            remoteTeam: entry.team,
            remoteDelivery: entry.delivery,
            forceSpawn: true,
            minimumEnergy: Math.min(300, room.energyCapacityAvailable)
          };
        }
      }
    }
    // Once each ready lane has a carrier, restore the WORK required at every
    // active remote source before adding surplus upgrading or support roles.
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
        const assigned = remoteWorkers.filter(creep =>
          creep.memory.remoteSlot === need.slot &&
          (creep.spawning ||
            creep.ticksToLive > getRemoteReplacementLead(creep)));
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
            forceSpawn: true,
            minimumEnergy: Math.min(room.energyCapacityAvailable,
              Math.min(3, Math.max(1, need.requiredWork || 1)) *
                BODYPART_COST[WORK] + BODYPART_COST[CARRY] +
                2 * BODYPART_COST[MOVE])
          };
        }
      }
    }
    // A saturated home economy needs a real energy sink before adding more
    // remote production or hauling. Carrier-shaped bodies do not count.
    if (viableUpgraders.length < situationTargets.upgrader) {
      return {
        role: 'upgrader',
        forceSpawn: true
      };
    }
    // Container balancing is a dedicated body requirement; do not repurpose a
    // WORK-heavy source harvester into a logistics role.
    const viableRebalancers = workers.filter(creep =>
      creep.memory.role === 'rebalancer' && hasLocalReplacementLife(creep));
    if (viableRebalancers.length < situationTargets.rebalancer) {
      return {
        role: 'rebalancer',
        forceSpawn: true,
        minimumEnergy: room.energyCapacityAvailable
      };
    }
    // The S2 tunnel is a dedicated local construction lane. Restore its
    // builder before adding more logistics bodies so the opened mining route
    // does not sit unfinished while general builders upgrade at the RC.
    const tunnelSite = getSource2TunnelSite(room);
    if (tunnelSite && !workers.some(creep =>
      isBuilder(creep, 'local', 'tunnel') &&
      (creep.spawning || hasLocalReplacementLife(creep)))) {
      return {
        role: 'builder',
        builderScope: 'local',
        builderMission: 'tunnel',
        builderTarget: tunnelSite.id,
        forceSpawn: true,
        minimumEnergy: room.energyCapacityAvailable
      };
    }
    const pendingContainer = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_CONTAINER
    })[0];
    const viableContainerBuilder = workers.some(creep =>
        isLocalBuilder(creep) && hasBuilderBody(creep) &&
      hasLocalReplacementLife(creep));
    if (pendingContainer && !viableContainerBuilder) {
      const convertibleBuilder = workers.some(creep => !creep.spawning &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'worker') &&
        hasBuilderBody(creep));
      if (!convertibleBuilder) {
        return {
          role: 'builder',
          forceSpawn: true,
          minimumEnergy: room.energyCapacityAvailable
        };
      }
      return null;
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
        isOutpostBuilder(creep) &&
        creep.memory.remoteRoom === southwestSurvey.targetRoom)) {
        return {
          role: 'builder',
          builderScope: 'outpost',
          builderMission: 'maintenance',
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
      { survey: room.memory.leftSurvey, team: 'left' },
      { survey: room.memory.southSurvey, team: 'south', delivery: 's2' },
      { survey: room.memory.southwestSurvey, team: 'southwest' }
    ].filter(entry => entry.survey && entry.survey.active &&
      entry.survey.targetRoom)
      .map(entry => {
        const target = entry.survey.remoteHaulerTarget ||
          Math.max(1, (entry.survey.remoteWorkNeeds || []).length);
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
    // Home-room income is the first staffing floor. Restore enough viable
    // WORK at every local source before sending emergency replacements to an
    // outpost; optional extra local source positions are handled later.
    const viableBuilders = workers.filter(creep => isLocalBuilder(creep) &&
      creep.memory.builderMission !== 'tunnel' && hasBuilderBody(creep) &&
      hasLocalReplacementLife(creep));
    const requiredBuilders = situationTargets.builder +
      situationTargets.repairBuilder;
    if (viableBuilders.length < requiredBuilders) {
      const availableBuilder = workers.find(creep => !creep.spawning &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'worker') &&
        hasBuilderBody(creep) && hasLocalReplacementLife(creep));
      const repairBuilders = viableBuilders.filter(creep =>
        creep.memory.builderMission === 'repair').length;
      return availableBuilder ? null : {
        role: 'builder',
        builderScope: 'local',
        builderMission: repairBuilders < situationTargets.repairBuilder
          ? 'repair' : 'build',
        forceSpawn: true,
        minimumEnergy: Math.min(700, room.energyCapacityAvailable)
      };
    }
    // Assess each source by active WORK, not occupied tiles. One strong miner
    // may cover the source while a surplus S2 body drains its full container.
    const understaffedLocalSource = getRoomSources(room).find(source => {
      const requiredWork = Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER);
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
    const underworkedLocalSource = getRoomSources(room).find(source => {
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
          isExpansionBuilder(creep) &&
          creep.memory.expansionTarget === expansion.targetRoom);
        const expansionBuilderTarget = Math.max(1, Math.min(3,
          Math.ceil(room.energyCapacityAvailable / 600)));
        if (pioneers.length < expansionBuilderTarget) {
          return {
            role: 'builder',
            builderScope: 'expansion',
            builderMission: 'bootstrap',
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
      const scoutTarget = survey.remoteMinerTarget ||
        Math.max(1, (survey.remoteWorkNeeds || []).length);
      if (scouts.length < scoutTarget) {
        const usedSlots = new Set(scouts.map(creep =>
          creep.memory.remoteSlot));
        const remoteSlot = [...Array(scoutTarget).keys()]
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
        Math.max(1, (survey.remoteWorkNeeds || []).length)).keys()]
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
        isOutpostBuilder(creep) &&
        creep.memory.remoteRoom === survey.targetRoom);
      if (remoteBuilders.length < (survey.remoteBuilderTarget || 0)) {
        const usedSlots = new Set(remoteBuilders.map(creep =>
          creep.memory.remoteBuilderSlot));
        const remoteBuilderSlot = [...Array(survey.remoteBuilderTarget || 0).keys()]
          .find(slot => !usedSlots.has(slot));
        return {
          role: 'builder',
          builderScope: 'outpost',
          builderMission: 'maintenance',
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
        isOutpostBuilder(creep) &&
        creep.memory.remoteRoom === southSurvey.targetRoom);
      if (southBuilders.length < (southSurvey.remoteBuilderTarget || 0)) {
        const usedSlots = new Set(southBuilders.map(creep =>
          creep.memory.remoteBuilderSlot));
        const remoteBuilderSlot = [...Array(
          southSurvey.remoteBuilderTarget || 0).keys()]
          .find(slot => !usedSlots.has(slot));
        return {
          role: 'builder',
          builderScope: 'outpost',
          builderMission: 'maintenance',
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
        Math.max(1, (southSurvey.remoteWorkNeeds || []).length)).keys()]
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
        isOutpostBuilder(creep) &&
        creep.memory.remoteRoom === southwestSurvey.targetRoom);
      if (southwestBuilders.length <
          (southwestSurvey.remoteBuilderTarget || 0)) {
        const usedSlots = new Set(southwestBuilders.map(creep =>
          creep.memory.remoteBuilderSlot));
        const remoteBuilderSlot = [...Array(
          southwestSurvey.remoteBuilderTarget || 0).keys()]
          .find(slot => !usedSlots.has(slot));
        return {
          role: 'builder',
          builderScope: 'outpost',
          builderMission: 'maintenance',
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
        southwestSurvey.remoteHaulerTarget || Math.max(1,
          (southwestSurvey.remoteWorkNeeds || []).length)).keys()]
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
    const situation = getRoomSituation(room);
    const builderTarget = getBuilderTarget(room) +
      situation.targets.repairBuilder;
    const builderCount = workers.filter(creep => isLocalBuilder(creep) &&
      creep.memory.builderMission !== 'tunnel' && hasBuilderBody(creep)).length;
    if (builderCount < builderTarget) {
      const availableBuilder = workers.find(creep => !creep.spawning &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'worker') &&
        hasBuilderBody(creep));
      return availableBuilder ? null : {
        role: 'builder', builderScope: 'local', builderMission: 'flexible'
      };
    }
    if (Number.isInteger(room.memory.containerHaulerPendingTarget) &&
        workers.length < room.memory.containerHaulerPendingTarget) {
      return { role: 'hauler' };
    }

    const sourceContainers = getRoomSources(room).map(source => ({
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
      creep.memory.role === 'miner' || creep.memory.role === 'harvester' ||
        creep.memory.role === 'rebalancer' &&
          creep.memory.rebalancerSource).length;
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

  const releaseSurplusRebalancers = (room, workers) => {
    const target = getRoomSituation(room).targets.rebalancer;
    const active = workers.filter(creep => !creep.spawning &&
      creep.memory.role === 'rebalancer');
    const { surplus } = selectRebalancerSurplus(active, target,
      hasLocalReplacementLife, RESOURCE_ENERGY);
    for (const creep of surplus) {
      creep.memory.role = 'hauler';
      delete creep.memory.rebalancerSource;
      delete creep.memory.rebalanceTarget;
      delete creep.memory.rebalancePickupTarget;
      delete creep.memory.working;
      delete creep.memory.task;
      delete creep.memory.taskTarget;
      console.log(`[${Game.time}] ${creep.name} released from container ` +
        `balancing; ${active.length} active for target ${target}`);
    }
    return surplus;
  };

  // Once S1 is depleted before regeneration, permanently open remote
  // harvesting in the adjacent room on the left with one S1 harvester and one
  // additional mobile harvester.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const exits = Game.map.describeExits(room.name) || {};
    const targetRoom = exits[LEFT];
    const source1 = getRoomSources(room)[0];
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
    const visibleLeftRoom = Game.rooms[targetRoom];
    survey.remoteMinerTarget = Array.isArray(survey.remoteWorkNeeds) &&
      survey.remoteWorkNeeds.length
      ? survey.remoteWorkNeeds.reduce((total, need) => total +
        Math.max(1, need.minMiners || 0), 0)
      : visibleLeftRoom ? visibleLeftRoom.find(FIND_SOURCES).length : 1;
    if (!Number.isInteger(survey.remoteHaulerTarget) ||
        scheduledRoomTick(room, 25, 4)) {
      survey.remoteHaulerTarget = getRemoteHaulerTarget(room.name,
        targetRoom);
    }
    survey.remoteBuilderTarget = getRemoteBuilderTarget(visibleLeftRoom);
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
        delete scout.memory.sourceReplacement;
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
        Math.max(1, (survey.remoteWorkNeeds || []).length)).keys()].filter(candidate =>
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
        index < Math.min(survey.remoteBuilderTarget || 0,
          markedRemoteBuilders.length);
        index++) {
        const builder = markedRemoteBuilders[index];
        builder.memory.role = 'builder';
        builder.memory.builderScope = 'outpost';
        builder.memory.builderMission = 'maintenance';
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
      const missingRemoteBuilders = Math.max(0,
        (survey.remoteBuilderTarget || 0) -
        homeCreeps.filter(creep =>
          isOutpostBuilder(creep) &&
          creep.memory.remoteRoom === targetRoom).length);
      if (missingRemoteBuilders > 0) {
        room.memory.workerTarget = Math.max(room.memory.workerTarget || 0,
          homeCreeps.length + missingRemoteBuilders);
      }
      const remoteRoom = Game.rooms[targetRoom];
      if (remoteRoom) {
        const refreshStaffing = !Array.isArray(survey.remoteWorkNeeds) ||
          scheduledRoomTick(room, 25, 7);
        refreshRemoteWorkNeeds(room, survey, remoteRoom, refreshStaffing);
        const remoteMiners = homeCreeps.filter(creep =>
          Number.isInteger(creep.memory.remoteSlot) &&
          creep.memory.remoteRoom === targetRoom);
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

  // The southern and diagonal outposts share source-work planning while
  // retaining their distinct route and delivery policies.
  planRegionalOutposts(Object.values(Game.rooms));

  // Remote-hauler identity is a roster assignment, not a live dispatch
  // decision. Reconcile existing bodies only when the desired roster changes;
  // surplus bodies keep working their current lane and age out naturally.
  reconcileRemoteHaulerRosters({
    rooms: Object.values(Game.rooms), creeps: Object.values(Game.creeps),
    Game, RESOURCE_ENERGY
  });

  // Select a prepared outpost, wait for a GCL slot, then bootstrap its spawn.
  updateExpansionPlan();

  // Plan the two remote-source corridors to the home controller container and
  // expose only five road construction sites at a time.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    if (!scheduledRoomTick(room, 50, 2)) continue;
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
    if (!scheduledRoomTick(room, 50, 18)) continue;
    const survey = room.memory.southSurvey;
    const remoteRoom = survey && survey.active &&
      Game.rooms[survey.targetRoom];
    const source2 = getRoomSources(room)
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
    if (!scheduledRoomTick(room, 50, 34)) continue;
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
  // tunnel builder without consuming population reserved for the room.
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
    console.log(`[${Game.time}] ${room.name} S2 tunnel builder requested ` +
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
    releaseSurplusRebalancers(spawn.room, workers);
    releaseUndersizedRefillers(spawn.room, workers);
    reconcileRefillerClusters(spawn.room, workers);
    const { workerLimit } = getWorkerLimits(spawn.room);
    const assignment = getSpawnAssignment(spawn.room, workers);
    const spawnRequest = prepareSpawnRequest({
      spawn, assignment, workers, workerLimit, hasWorkParts
    });
    if (!spawnRequest.needsWorker) continue;
    const body = spawnRequest.body;
    if (!spawn.spawning && body) {
      const name = getBirthName(spawn, assignment);
      const result = spawn.spawnCreep(body, name, {
        memory: {
          home: spawn.room.name,
          working: false,
          role: assignment.role,
          birthRole: assignment.role,
          builderScope: assignment.builderScope,
          builderMission: assignment.builderMission,
          builderTarget: assignment.builderTarget,
          birthRoomOrdinal: getRoomOrdinal(assignment.remoteRoom ||
            assignment.expansionTarget || spawn.room.name),
          refillClusterId: assignment.refillClusterId,
          refillClusterX: assignment.refillClusterX,
          refillClusterY: assignment.refillClusterY,
          refillSpawnOwner: assignment.refillSpawnOwner || undefined,
          remoteHome: assignment.role && assignment.role.indexOf('remote-') === 0 ||
              assignment.role === 'builder' &&
                assignment.builderScope === 'outpost'
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
        clearSpawnWait(spawn.room);
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
    if (!ownedRooms.has(room.name)) updateOutpostStatus(room);
  }
  for (const roomName of ownedRooms) {
    const room = Game.rooms[roomName];
    const situation = getRoomSituation(room);
    if (room.memory.schedulerVersion !== 'state-policy-v2') {
      room.memory.schedulerVersion = 'state-policy-v2';
      console.log(`[${Game.time}] ${room.name} scheduler -> state-policy-v2`);
    }
    if (room.memory.situationMode !== situation.mode) {
      console.log(`[${Game.time}] ${room.name} situation ` +
        `${room.memory.situationMode || 'unknown'} -> ${situation.mode}; ` +
        `targets Src${situation.targets.source} Ha${situation.targets.hauler} ` +
        `B${situation.targets.builder} repairB` +
        `${situation.targets.repairBuilder} U${situation.targets.upgrader} ` +
        `tunnelB${situation.targets.tunnelBuilder}`);
      room.memory.situationMode = situation.mode;
      room.memory.situationChanged = Game.time;
    }
    const traffic = trafficByRoom[room.name] || updateTrafficHeatmap(room);
    const paths = getImportantRoadPaths(room);
    const travelPaths = getImportantTravelPaths(room);
    const interRoomTravelPaths = getInterRoomTravelPaths(room);
    delete room.memory.highwayPlan;
    // Build within the corridors where multiple important-place routes
    // converge. The compact canonical plan still owns the total road budget,
    // preventing the richer visual network from increasing the road cap.
    const plannedPaths = getConvergedTravelPaths(travelPaths);
    const controllerLevel = room.controller ? room.controller.level : 0;
    const roadBudget = getRoadBudget(room, paths, controllerLevel);
    drawRoadPlan(room, [
      ...travelPaths,
      ...(interRoomTravelPaths[room.name] || [])
    ], traffic, roadBudget);
    const relatedRoomNames = new Set([
      ...Object.keys(interRoomTravelPaths),
      ...[room.memory.leftSurvey, room.memory.southSurvey,
        room.memory.southwestSurvey]
        .filter(survey => survey && survey.active && survey.targetRoom)
        .map(survey => survey.targetRoom)
    ]);
    for (const relatedRoomName of relatedRoomNames) {
      if (relatedRoomName === room.name) continue;
      const relatedRoom = Game.rooms[relatedRoomName];
      if (!relatedRoom) continue;
      drawTravelPaths(relatedRoom, [
        ...getImportantTravelPaths(relatedRoom),
        ...(interRoomTravelPaths[relatedRoomName] || [])
      ]);
    }
    // Site placement and migration are stable planning work. Ten-tick,
    // room-staggered checks are responsive enough without rescanning every
    // structure and construction tile on every game tick.
    if (scheduledRoomTick(room, 25)) {
      manageControllerContainer(room);
      manageExtensionContainer(room);
      placeSourceContainerSite(room);
      placeExtensionSite(room);
      placeStorageSite(room);
      const priorityStructureQueued = room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: site => site.structureType === STRUCTURE_CONTAINER ||
          site.structureType === STRUCTURE_EXTENSION ||
          site.structureType === STRUCTURE_STORAGE
      }).length > 0;
      if (!roadsPaused(room) && !priorityStructureQueued) {
        placeRoadSite(room, plannedPaths, traffic, roadBudget);
      }
    }
  }

  const { reservedEnergy, reservedCapacity, getUnreservedEnergy,
    getUnreservedCapacity, releaseAmount, reserveEnergyFrom,
    reserveCapacityIn } = createResourceReservations(RESOURCE_ENERGY);
  const remoteDispatchClaims = {};
  const remoteRoomDispatchClaims = {};
  for (const hauler of Object.values(Game.creeps).filter(candidate =>
    candidate.memory.role === 'remote-hauler' &&
    candidate.memory.remoteDispatchRoom &&
    candidate.store[RESOURCE_ENERGY] === 0 &&
    !candidate.memory.remoteHaulReturning)) {
    const roomName = hauler.memory.remoteDispatchRoom;
    remoteRoomDispatchClaims[roomName] =
      (remoteRoomDispatchClaims[roomName] || 0) +
      hauler.store.getCapacity(RESOURCE_ENERGY);
  }
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
    if (isBuilder(creep, 'local', 'tunnel')) {
      const site = Game.getObjectById(creep.memory.builderTarget) ||
        getSource2TunnelSite(creep.room);
      return !!site && target.pos.getRangeTo(site) <= 3;
    }
    return true;
  };
  const urgentUpgradeAssigned = {};
  const reservedHarvestSpots = {};
  const creeps = Object.values(Game.creeps).filter(creep => !creep.spawning);
  for (const creep of creeps) {
    if (creep.memory.pickupPriorityVersion !== 'fullest-source-v2') {
      creep.memory.pickupPriorityVersion = 'fullest-source-v2';
      delete creep.memory.withdrawTarget;
      delete creep.memory.remotePickupTarget;
    }
    if (creep.memory.sourceReplacement && hasWorkParts(creep) &&
        !creep.memory.remoteRoom && !creep.memory.remoteTeam &&
        !Number.isInteger(creep.memory.remoteSlot)) {
      creep.memory.role = 'harvester';
      creep.memory.preferredSource = creep.memory.sourceReplacement;
    }
  }
  const roomUpgraders = {};
  const roomBuilders = {};
  const roomRepairBuilders = {};
  const roomTunnelBuilders = {};
  const roomHaulers = {};
  const assignedCreeps = {};
  const sourceWorkerShortages = {};
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const roomCreeps = creeps.filter(creep => creep.room.name === room.name);
    const minerLimit = getDesiredSourceWorkerLimit(room, roomCreeps.length);
    const sourceWorkerCount = roomCreeps.filter(creep =>
      creep.memory.role === 'miner' || creep.memory.role === 'harvester' ||
        creep.memory.role === 'rebalancer' &&
          creep.memory.rebalancerSource).length;
    sourceWorkerShortages[room.name] = sourceWorkerCount < minerLimit;
  }

  for (const creep of creeps) {
    if (isExpansionBuilder(creep)) {
      assignedCreeps[creep.name] = true;
    } else if ((creep.memory.role === 'remote-scout' ||
          creep.memory.role === 'remote-hauler' ||
          isOutpostBuilder(creep)) &&
        creep.memory.remoteHome) {
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'refiller') {
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'rebalancer') {
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        creep.memory.role === 'upgrader' &&
        creep.getActiveBodyparts(WORK) >= 4 &&
        (!hasRoadMobility(creep) || !roomUpgraders[creep.room.name] ||
          roomUpgraders[creep.room.name].length <
            getRoomSituation(creep.room).targets.upgrader)) {
      if (!roomUpgraders[creep.room.name]) {
        roomUpgraders[creep.room.name] = [];
      }
      roomUpgraders[creep.room.name].push(creep);
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        isLocalBuilder(creep) &&
        creep.memory.builderMission !== 'repair' &&
        creep.memory.builderMission !== 'tunnel' &&
        hasBuilderBody(creep) &&
        (!roomBuilders[creep.room.name] ||
          roomBuilders[creep.room.name].length <
            getBuilderTarget(creep.room))) {
      if (!roomBuilders[creep.room.name]) roomBuilders[creep.room.name] = [];
      roomBuilders[creep.room.name].push(creep);
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        isBuilder(creep, 'local', 'repair') && hasBuilderBody(creep) &&
        (!roomRepairBuilders[creep.room.name] ||
          roomRepairBuilders[creep.room.name].length <
            getRoomSituation(creep.room).targets.repairBuilder)) {
      if (!roomRepairBuilders[creep.room.name]) {
        roomRepairBuilders[creep.room.name] = [];
      }
      roomRepairBuilders[creep.room.name].push(creep);
      assignedCreeps[creep.name] = true;
    } else if (creep.room.controller && creep.room.controller.my &&
        isBuilder(creep, 'local', 'tunnel') &&
        getSource2TunnelSite(creep.room) &&
        !roomTunnelBuilders[creep.room.name]) {
      roomTunnelBuilders[creep.room.name] = creep;
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

  // Preserve true WORK-heavy upgraders; never satisfy this roster by relabeling
  // a carrier-shaped body.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const roomCreeps = creeps.filter(creep => creep.room.name === room.name);
    if (!roomUpgraders[room.name]) roomUpgraders[room.name] = [];
    const upgraderTarget = getRoomSituation(room).targets.upgrader;
    while (roomUpgraders[room.name].length < upgraderTarget) {
      const upgrader = roomCreeps.filter(creep =>
        !assignedCreeps[creep.name] &&
        creep.memory.role !== 'hauler' &&
        creep.memory.role !== 'remote-hauler' &&
        creep.memory.role !== 'miner' &&
        creep.memory.role !== 'harvester' &&
        creep.getActiveBodyparts(WORK) >= 4)
        .sort((a, b) => b.getActiveBodyparts(WORK) -
          a.getActiveBodyparts(WORK))[0] ||
        (roomUpgraders[room.name].length === 0
          ? roomCreeps.find(creep => !assignedCreeps[creep.name] &&
            creep.memory.role === 'upgrader' && hasWorkParts(creep))
          : null);
      if (!upgrader) break;
      if (upgrader) {
        delete assignedCreeps[upgrader.name];
        roomUpgraders[room.name].push(upgrader);
        upgrader.memory.role = 'upgrader';
        assignedCreeps[upgrader.name] = true;
      }
    }
    const builderTarget = getBuilderTarget(room);
    if (!roomBuilders[room.name]) roomBuilders[room.name] = [];
    while (roomBuilders[room.name].length < builderTarget) {
      const builder = roomCreeps.find(creep =>
        creep.memory.role === 'hauler' &&
        creep.memory.task === 'build' && hasBuilderBody(creep)) ||
        roomCreeps.find(creep => creep.memory.role === 'hauler' &&
          hasBuilderBody(creep)) ||
        roomCreeps.find(creep => !assignedCreeps[creep.name] &&
          creep.memory.role === 'worker' && hasBuilderBody(creep));
      if (!builder) break;
      delete assignedCreeps[builder.name];
      builder.memory.role = 'builder';
      builder.memory.builderScope = 'local';
      builder.memory.builderMission = 'build';
      roomBuilders[room.name].push(builder);
      assignedCreeps[builder.name] = true;
    }
    if (getRoomSituation(room).targets.repairBuilder > 0 &&
        !roomRepairBuilders[room.name]) {
      const repairBuilder = roomCreeps.find(creep =>
        !assignedCreeps[creep.name] &&
        creep.memory.role === 'hauler' && creep.memory.task === 'repair' &&
        hasBuilderBody(creep)) ||
        roomCreeps.find(creep => !assignedCreeps[creep.name] &&
          creep.memory.role === 'hauler' && hasBuilderBody(creep));
      if (repairBuilder) {
        repairBuilder.memory.role = 'builder';
        repairBuilder.memory.builderScope = 'local';
        repairBuilder.memory.builderMission = 'repair';
        roomRepairBuilders[room.name] = [repairBuilder];
        assignedCreeps[repairBuilder.name] = true;
      }
    }

    const sourceContainers = getRoomSources(room).map(source => ({
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

    const { sourceSpotCounts, sourceWorkerTargets } = getWorkerLimits(room);
    const minerLimit = getDesiredSourceWorkerLimit(room, roomCreeps.length);
    let sourceWorkerCount = Object.keys(miners).length +
      roomCreeps.filter(creep => creep.memory.role === 'rebalancer' &&
        creep.memory.rebalancerSource).length;
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
    ({ sourceWorkerCount, haulerCount } = assignUnallocatedRoles({
      candidates: roleCandidates,
      sourceWorkerCount,
      sourceWorkerLimit: minerLimit,
      haulerCount,
      haulerTarget
    }));
    for (const creep of roleCandidates) {
      if (creep.memory.role === 'worker' &&
          creep.getActiveBodyparts(WORK) >= 4 &&
          !hasRoadMobility(creep)) {
        creep.memory.role = 'upgrader';
        delete creep.memory.buildTarget;
        delete creep.memory.repairTarget;
        delete creep.memory.withdrawTarget;
        delete creep.memory.taskTarget;
        delete creep.memory.task;
        if (creep.memory.mobilityRoleVersion !== 'road-v1') {
          console.log(`[${Game.time}] ${creep.name} kept as upgrader; ` +
            `body is not road-mobile enough for build/repair work`);
          creep.memory.mobilityRoleVersion = 'road-v1';
        }
      } else if (creep.memory.role === 'worker' && hasBuilderBody(creep)) {
        creep.memory.role = 'builder';
        creep.memory.builderScope = 'local';
        creep.memory.builderMission = 'flexible';
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
    const sourceNeeds = getRoomSources(room).map(source => {
      const dedicatedMinerCount = miners[source.id] ? 1 : 0;
      const rebalancerCount = roomCreeps.filter(creep =>
        creep.memory.role === 'rebalancer' &&
        creep.memory.rebalancerSource === source.id).length;
      const dedicatedWork = miners[source.id]
        ? miners[source.id].getActiveBodyparts(WORK) : 0;
      const requiredWork = Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER);
      return {
        sourceId: source.id,
        remaining: Math.max(0,
          (sourceWorkerTargets[source.id] || 0) - dedicatedMinerCount -
            rebalancerCount),
        workDeficit: Math.max(0, requiredWork - dedicatedWork)
      };
    });
    const dedicatedMinerNames = new Set(Object.values(miners)
      .map(creep => creep.name));
    const harvesters = roomCreeps
      .filter(creep => creep.memory.role === 'harvester' &&
        !dedicatedMinerNames.has(creep.name))
      .sort((a, b) => b.getActiveBodyparts(WORK) -
        a.getActiveBodyparts(WORK) || a.name.localeCompare(b.name));
    for (const creep of harvesters) {
      const markedReplacement = creep.memory.sourceReplacement &&
        sourceNeeds.find(need =>
          need.sourceId === creep.memory.sourceReplacement &&
            need.remaining > 0);
      const available = sourceNeeds.filter(need => need.remaining > 0)
        .sort((a, b) =>
          Number(b.workDeficit > 0) - Number(a.workDeficit > 0) ||
          b.workDeficit - a.workDeficit ||
          Number(b.sourceId === creep.memory.preferredSource) -
            Number(a.sourceId === creep.memory.preferredSource) ||
          b.remaining - a.remaining || a.sourceId.localeCompare(b.sourceId));
      const need = markedReplacement || available[0];
      const preferredSource = need && need.sourceId;
      if (!need) {
        // A source roster can contract after replacements arrive. Do not leave
        // the displaced body labelled harvester with no source: carrier-shaped
        // bodies join local logistics, while WORK-heavy bodies stay flexible.
        const carryParts = creep.getActiveBodyparts(CARRY);
        const workParts = creep.getActiveBodyparts(WORK);
        creep.memory.role = carryParts >= Math.max(2, workParts * 2)
          ? 'hauler' : 'worker';
        delete creep.memory.preferredSource;
        delete creep.memory.sourceReplacement;
        delete creep.memory.harvestSource;
        delete creep.memory.harvestX;
        delete creep.memory.harvestY;
        delete creep.memory.task;
        delete creep.memory.taskTarget;
        delete creep.memory.idleNow;
        console.log(`[${Game.time}] ${creep.name} released from full source ` +
          `roster -> ${creep.memory.role} ` +
          `(W${workParts} C${carryParts})`);
        continue;
      }
      need.remaining--;
      need.workDeficit = Math.max(0, need.workDeficit -
        creep.getActiveBodyparts(WORK));
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
        isOutpostBuilder(creep) || isExpansionBuilder(creep)) continue;
    if (!creep.room.controller || !creep.room.controller.my) {
        creep.memory.role = 'builder';
        creep.memory.builderScope = 'local';
        creep.memory.builderMission = 'flexible';
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
    const slowInventory = getSlowWorkInventory(room);
    const extensionLimit = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION] &&
      CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
    const builtExtensionCount = slowInventory.structures.filter(structure =>
      structure.structureType === STRUCTURE_EXTENSION).length;
    const storageDeferred = builtExtensionCount < extensionLimit;
    const sites = slowInventory.sites.filter(site =>
      (!roadsPaused(room) || site.structureType !== STRUCTURE_ROAD) &&
      (!storageDeferred || site.structureType !== STRUCTURE_STORAGE));
    const buildRemaining = sites.reduce((total, site) =>
      total + site.progressTotal - site.progress, 0);
    const repairTargets = slowInventory.structures.filter(structure =>
      structure.hits !== undefined &&
        structure.hits < structure.hitsMax * 0.75 &&
        structure.structureType !== STRUCTURE_WALL &&
        structure.structureType !== STRUCTURE_RAMPART &&
        (!roadsPaused(room) || structure.structureType !== STRUCTURE_ROAD) &&
        (structure.structureType !== STRUCTURE_ROAD ||
          isHeatmapRoadPosition(room, structure)) &&
        (structure.structureType !== STRUCTURE_CONTAINER ||
          getContainerPurpose(room, structure.pos)) &&
        (structure.my || structure.structureType === STRUCTURE_ROAD ||
          structure.structureType === STRUCTURE_CONTAINER));
    const repairEnergy = repairTargets.reduce((total, structure) =>
      total + Math.ceil((structure.hitsMax * 0.75 - structure.hits) /
        REPAIR_POWER), 0);

    const workCreeps = roomCreeps.filter(creep => hasWorkParts(creep) &&
      creep.memory.role !== 'miner' && creep.memory.role !== 'harvester' &&
      !isBuilder(creep, 'local', 'tunnel') &&
      !isOutpostBuilder(creep) && !isExpansionBuilder(creep));
    // Carriers may use their WORK part when logistics are covered, but they
    // are not delivery recipients. Counting haulers here made them reserve
    // one another as supply targets, then stage beside the controller when
    // the executor rejected that invalid handoff.
    const supplyRecipients = workCreeps.filter(creep =>
      isLocalBuilder(creep) || creep.memory.role === 'upgrader' ||
      creep.memory.role === 'worker');
    for (const creep of workCreeps.filter(worker =>
      worker.memory.role === 'upgrader')) assignments[creep.name] = 'upgrade';

    if (situation.mode === 'controller-emergency') {
      for (const creep of workCreeps) assignments[creep.name] = 'upgrade';
    } else {
      let repairSlots = repairTargets.length > 0
        ? Math.max(1, situation.targets.repairBuilder)
        : 0;
      const repairBuilders = workCreeps.filter(creep =>
        isBuilder(creep, 'local', 'repair'));
      const flexible = workCreeps.filter(creep => isLocalBuilder(creep) &&
        creep.memory.builderMission === 'flexible')
        .sort((a, b) => a.name.localeCompare(b.name));
      const builders = workCreeps.filter(creep => isLocalBuilder(creep) &&
        creep.memory.builderMission !== 'repair' &&
        creep.memory.builderMission !== 'flexible');
      for (const creep of repairBuilders) {
        if (repairSlots > 0) {
          assignments[creep.name] = 'repair';
          repairSlots--;
        } else {
          assignments[creep.name] = 'upgrade';
        }
      }

      const extensionPending = sites.some(site =>
        site.structureType === STRUCTURE_EXTENSION);
      const availableBuilders = builders.length + flexible.length;
      // Full source buffers mean hauling is stalled because the controller
      // buffer is not being consumed quickly enough. Keep one builder moving
      // construction, but send the remaining WORK-heavy bodies to the RC so
      // carriers can unload and return to the sources.
      let buildSlots = situation.mode === 'logistics-backup'
        ? Math.min(1, availableBuilders)
        : sites.length > 0
          ? extensionPending
            ? availableBuilders
            : Math.min(availableBuilders,
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

    const roomStructures = getRoomStructures(room);
    const spawnFree = roomStructures.filter(structure => structure.my &&
      (structure.structureType === STRUCTURE_SPAWN ||
        structure.structureType === STRUCTURE_EXTENSION)).reduce(
      (total, structure) => total +
      structure.store.getFreeCapacity(RESOURCE_ENERGY), 0);
    const towerFree = roomStructures.filter(structure => structure.my &&
      structure.structureType === STRUCTURE_TOWER).reduce(
      (total, structure) => total +
      structure.store.getFreeCapacity(RESOURCE_ENERGY), 0);
    const controllerBuffers = roomStructures.filter(structure =>
      structure.structureType === STRUCTURE_CONTAINER &&
        structure.pos.getRangeTo(room.controller) <= 3
    );
    const bufferFree = controllerBuffers.reduce((total, structure) =>
      total + structure.store.getFreeCapacity(RESOURCE_ENERGY), 0);
    const bufferStored = controllerBuffers.reduce((total, structure) =>
      total + structure.store[RESOURCE_ENERGY], 0);
    const bufferCapacity = controllerBuffers.reduce((total, structure) =>
      total + structure.store.getCapacity(RESOURCE_ENERGY), 0);
    const usesControllerBuffer = creep =>
      assignments[creep.name] === 'upgrade' && bufferStored > 0;
    const supplyFree = supplyRecipients.reduce((total, creep) => total +
      (usesControllerBuffer(creep)
        ? 0 : creep.store.getFreeCapacity(RESOURCE_ENERGY)), 0);
    const sources = getRoomSources(room);
    const sourceBuffers = roomStructures.filter(structure =>
      structure.structureType === STRUCTURE_CONTAINER &&
        sources.some(source => source.pos.getRangeTo(structure) <= 2)
    );
    const sourceStored = sourceBuffers.reduce((total, structure) => total +
      structure.store[RESOURCE_ENERGY], 0);
    const sourceCapacity = sourceBuffers.reduce((total, structure) => total +
      structure.store.getCapacity(RESOURCE_ENERGY), 0);
    const sourceCritical = sourceBuffers.some(structure =>
      structure.store.getCapacity(RESOURCE_ENERGY) > 0 &&
      structure.store[RESOURCE_ENERGY] /
        structure.store.getCapacity(RESOURCE_ENERGY) >= 0.9);
    const extensionBuffers = roomStructures.filter(structure =>
      isExtensionRefillBuffer(room, structure));
    const extensionBufferStored = extensionBuffers.reduce(
      (total, structure) => total + structure.store[RESOURCE_ENERGY], 0);
    const extensionBufferCapacity = extensionBuffers.reduce(
      (total, structure) => total +
        structure.store.getCapacity(RESOURCE_ENERGY), 0);
    // This is the handoff point between source haulers and short-range
    // refillers. Keep it full while room energy is missing, otherwise retain
    // a half-buffer reserve for the next spawn cycle.
    const extensionBufferTarget = spawnFree > 0
      ? extensionBufferCapacity
      : extensionBufferCapacity * 0.5;
    let extensionBufferDemand = Math.max(0,
      extensionBufferTarget - extensionBufferStored);
    // Remote carriers standing in their home room are part of the local
    // logistics pool. This lets an idle H1/H2/H3 drain a backed-up S1/S2
    // source buffer before starting another outpost trip. Carriers outside the
    // room are absent from roomCreeps, so their active remote trip is untouched.
    const hasDedicatedLocalHauler = roomCreeps.some(creep =>
      creep.memory.role === 'hauler' && !creep.spawning);
    const servesAsLocalHauler = creep =>
      creep.memory.role === 'refiller' || creep.memory.role === 'hauler' ||
        creep.memory.role === 'remote-hauler' &&
          !creep.memory.remoteRosterSurplus && !hasDedicatedLocalHauler;
    const energyWorkPhase = room.memory.energyWorkPhase || 'refill';
    const emergencyEnergyRefill = room.energyAvailable < workerCost;
    // Dedicated haulers continuously top off room energy; the phase gate only
    // decides whether WORK creeps must join that refill wave.
    let refillDemand = spawnFree + towerFree;
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
    // Keep a useful controller reserve ahead of ordinary extension top-offs.
    // Only actual haulers enter this delivery plan, so the WORK-heavy
    // upgraders can remain on their reserved controller stations.
    const activeUpgraderWork = workCreeps.filter(creep =>
      assignments[creep.name] === 'upgrade').reduce((total, creep) =>
      total + creep.getActiveBodyparts(WORK), 0);
    const controllerReserveTarget = Math.min(bufferCapacity, Math.max(
      bufferCapacity * 0.75,
      activeUpgraderWork * 75));
    let urgentBufferDemand = Math.max(0,
      controllerReserveTarget - bufferStored);
    let bufferDemand = Math.max(0, bufferCapacity - bufferStored);
    // Mobile workers collect from fixed local stores. Haulers stock those
    // stores; they do not chase moving creeps for direct handoffs.
    let supplyDemand = 0;
    const storage = room.storage && room.storage.my ? room.storage : null;
    const storageFree = storage
      ? storage.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
    const storageStored = storage
      ? storage.store[RESOURCE_ENERGY] : 0;
    // Keep one full room charge in reserve during normal operation. In an
    // energy emergency storage is available all the way down to zero.
    const storageReserveFloor = emergencyEnergyRefill
      ? 0 : room.energyCapacityAvailable;
    const storageWithdrawable = Math.max(0,
      storageStored - storageReserveFloor);
    let storageDemand = storageFree;
    const supplyTargets = {};
    const incomingSupply = {};
    const collectionSources = {};
    const recipientRemaining = {};
    for (const worker of supplyRecipients) {
      recipientRemaining[worker.name] =
        usesControllerBuffer(worker)
          ? 0 : worker.store.getFreeCapacity(RESOURCE_ENERGY);
    }
    const refillStructures = roomStructures.filter(structure => structure.my &&
        (structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_EXTENSION ||
          structure.structureType === STRUCTURE_TOWER) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    );
    const refillDemandFor = creep => refillStructures.filter(structure =>
      isRefillTargetFor(creep, structure)).reduce((total, structure) =>
      total + structure.store.getFreeCapacity(RESOURCE_ENERGY), 0);
    const refillDistance = creep => refillStructures.length > 0
      ? Math.min(...refillStructures.map(structure =>
        creep.pos.getRangeTo(structure)))
      : Infinity;
    const hasLiveDispatchCommitment = creep => {
      const commitment = creep.memory.dispatchCommitment;
      if (!commitment || commitment.roomName !== room.name ||
          !commitment.targetId || commitment.lane !== creep.memory.demandLane) {
        return false;
      }
      const target = Game.getObjectById(commitment.targetId);
      if (!target) return false;
      if (commitment.lane === 'collect') {
        return creep.store[RESOURCE_ENERGY] === 0 && target.store &&
          target.store[RESOURCE_ENERGY] > 0;
      }
      if (commitment.lane === 'supply') {
        return false;
      }
      if (commitment.lane === 'refill' ||
          commitment.lane === 'refill-buffer' ||
          commitment.lane === 'buffer' || commitment.lane === 'storage') {
        return creep.store[RESOURCE_ENERGY] > 0 && target.store &&
          target.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      }
      return false;
    };
    const loadedHaulers = roomCreeps.filter(creep =>
      servesAsLocalHauler(creep) && creep.store[RESOURCE_ENERGY] > 0)
      .sort((a, b) => Number(hasLiveDispatchCommitment(b)) -
        Number(hasLiveDispatchCommitment(a)) ||
        refillDistance(a) - refillDistance(b) ||
        a.name.localeCompare(b.name));
    const emptyHaulers = roomCreeps.filter(creep =>
      servesAsLocalHauler(creep) && creep.store[RESOURCE_ENERGY] === 0)
      .sort((a, b) => Number(hasLiveDispatchCommitment(b)) -
        Number(hasLiveDispatchCommitment(a)) ||
        a.name.localeCompare(b.name));
    const localCarriers = [...loadedHaulers, ...emptyHaulers]
      .sort((a, b) =>
        b.store.getCapacity(RESOURCE_ENERGY) -
          a.store.getCapacity(RESOURCE_ENERGY) ||
        b.ticksToLive - a.ticksToLive ||
        Number(b.memory.refillSpecialist) -
          Number(a.memory.refillSpecialist) ||
        Number(b.memory.role === 'hauler') -
          Number(a.memory.role === 'hauler') ||
        a.name.localeCompare(b.name));
    for (const carrier of localCarriers) {
      if (carrier.memory.demandLane !== 'supply' &&
          (!carrier.memory.dispatchCommitment ||
            carrier.memory.dispatchCommitment.lane !== 'supply')) continue;
      delete carrier.memory.dispatchCommitment;
      delete carrier.memory.supplyTarget;
      delete carrier.memory.demandLane;
    }
    const roleRefillers = localCarriers.filter(creep =>
      creep.memory.role === 'refiller').sort((a, b) =>
      b.store.getCapacity(RESOURCE_ENERGY) -
        a.store.getCapacity(RESOURCE_ENERGY) ||
      b.ticksToLive - a.ticksToLive || a.name.localeCompare(b.name));
    // Every existing refiller actively owns the spawn/extension lane. The
    // population policy controls replacements; a temporary surplus must not
    // stand idle while the spawn is empty.
    const dedicatedRefillers = roleRefillers.length > 0
      ? roleRefillers
      : localCarriers.slice(0, 1);
    const dedicatedRefillerNames = new Set(dedicatedRefillers.map(creep =>
      creep.name));
    if (dedicatedRefillers.length > 0) {
      room.memory.refillCarrier = dedicatedRefillers[0].name;
      room.memory.refillCarriers = dedicatedRefillers.map(creep => creep.name);
      for (const carrier of localCarriers) {
        carrier.memory.refillSpecialist =
          dedicatedRefillerNames.has(carrier.name) || undefined;
      }
      for (const dedicatedRefiller of dedicatedRefillers) {
        if (dedicatedRefiller.memory.role === 'remote-hauler') {
          dedicatedRefiller.memory.remoteHaulReturning = true;
        }
      }
    } else {
      delete room.memory.refillCarrier;
      delete room.memory.refillCarriers;
    }
    for (const creep of loadedHaulers) {
      delete creep.memory.collectionSourceTarget;
      const carried = creep.store[RESOURCE_ENERGY];
      const fillsSpawn = dedicatedRefillerNames.has(creep.name);
      const commitment = hasLiveDispatchCommitment(creep)
        ? creep.memory.dispatchCommitment : null;
      const committedTarget = commitment &&
        Game.getObjectById(commitment.targetId);
      if (!fillsSpawn && commitment &&
          commitment.lane === 'storage' && storageDemand > 0) {
        assignments[creep.name] = 'storage';
        storageDemand = Math.max(0, storageDemand - carried);
      } else if (!fillsSpawn && commitment &&
          commitment.lane === 'refill-buffer' && extensionBufferDemand > 0) {
        assignments[creep.name] = 'refill-buffer';
        extensionBufferDemand = Math.max(0,
          extensionBufferDemand - carried);
      } else if (!fillsSpawn && commitment &&
          commitment.lane === 'buffer' && bufferDemand > 0) {
        assignments[creep.name] = 'buffer';
        urgentBufferDemand = Math.max(0, urgentBufferDemand - carried);
        bufferDemand = Math.max(0, bufferDemand - carried);
      } else if (!fillsSpawn && commitment &&
          commitment.lane === 'supply' && committedTarget &&
          recipientRemaining[committedTarget.name] > 0) {
        const committed = Math.min(carried,
          recipientRemaining[committedTarget.name]);
        assignments[creep.name] = 'supply';
        supplyTargets[creep.name] = committedTarget.name;
        incomingSupply[committedTarget.name] =
          (incomingSupply[committedTarget.name] || 0) + committed;
        recipientRemaining[committedTarget.name] -= committed;
        supplyDemand = Math.max(0, supplyDemand - committed);
      } else if (fillsSpawn && refillDemandFor(creep) > 0) {
        // Every clump owner services its own extensions. Only the owner of the
        // closest clump includes spawn capacity in its personal demand.
        assignments[creep.name] = 'refill';
        emergencyRefillDemand = Math.max(0,
          emergencyRefillDemand - carried);
        refillDemand = Math.max(0, refillDemand - carried);
      } else if (fillsSpawn) {
        assignments[creep.name] = 'refill-stage';
      } else if (extensionBufferDemand > 0) {
        assignments[creep.name] = 'refill-buffer';
        extensionBufferDemand = Math.max(0,
          extensionBufferDemand - carried);
      } else if (urgentBufferDemand > 0) {
        assignments[creep.name] = 'buffer';
        urgentBufferDemand = Math.max(0, urgentBufferDemand - carried);
        bufferDemand = Math.max(0, bufferDemand - carried);
      } else if (bufferDemand > 0) {
        assignments[creep.name] = 'buffer';
        bufferDemand = Math.max(0, bufferDemand - carried);
      } else if (supplyDemand > 0) {
        const recipient = supplyRecipients.filter(worker =>
          recipientRemaining[worker.name] > 0 &&
          creep.pos.getRangeTo(worker) <= 1).sort((a, b) => {
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
      } else if (storageDemand > 0) {
        assignments[creep.name] = 'storage';
        storageDemand = Math.max(0, storageDemand - carried);
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
    const operationalCollectionDemand = refillDemand +
      extensionBufferDemand + bufferDemand + supplyDemand;
    // Pull operational energy out of storage while source cargo moves into
    // it. This makes storage a two-way hub instead of a terminal sink.
    // Haulers deliver storage energy to structures and mobile workers. A
    // builder may still use nearby local energy when no delivery is planned.
    const storageDeliveryDemand = refillDemand + extensionBufferDemand +
      bufferDemand + supplyDemand;
    let storageWithdrawalDemand = Math.min(storageWithdrawable,
      storageDeliveryDemand);
    let collectionDemand = operationalCollectionDemand +
      (storageDemand > 0 ? sourceStored : 0);
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
    const projectedSourceGroups = sources.map((source, index) => {
      const buffers = sourceBuffers.filter(buffer =>
        source.pos.getRangeTo(buffer) <= 2);
      return {
        source,
        index,
        stored: buffers.reduce((total, buffer) => total +
          getUnreservedEnergy(buffer), 0),
        capacity: buffers.reduce((total, buffer) => total +
          (buffer.store.getCapacity(RESOURCE_ENERGY) || 0), 0)
      };
    }).filter(group => group.capacity > 0 && group.stored > 0);
    const stageSources = sources.filter(source => sourceBuffers.some(buffer =>
      source.pos.getRangeTo(buffer) <= 2));
    let stageSourceIndex = 0;
    // Delivery demand can exceed the energy that is currently available at
    // the source buffers. Dispatch only enough empty cargo space to collect
    // that energy; otherwise every idle carrier converges on the same source
    // area and competes for a load that does not exist yet.
    let collectibleEnergy = sourceStored + storageWithdrawalDemand;
    for (const creep of emptyHaulers) {
      const ownsOpenRefill = dedicatedRefillerNames.has(creep.name) &&
        refillDemandFor(creep) > 0;
      if ((collectionDemand > 0 || ownsOpenRefill) && collectibleEnergy > 0) {
        assignments[creep.name] = 'collect';
        const cargoCapacity = creep.store.getCapacity(RESOURCE_ENERGY);
        if (storage && storageWithdrawalDemand > 0) {
          collectionSources[creep.name] = storage.id;
          delete creep.memory.collectionSourceTarget;
          storageWithdrawalDemand = Math.max(0,
            storageWithdrawalDemand - cargoCapacity);
        } else {
          let group = projectedSourceGroups.find(candidate =>
            candidate.source.id === creep.memory.collectionSourceTarget &&
            candidate.stored > 0);
          if (!group) {
            group = projectedSourceGroups.slice().sort((a, b) =>
              b.stored / b.capacity - a.stored / a.capacity ||
              b.index - a.index)[0];
          }
          if (group) {
            collectionSources[creep.name] = group.source.id;
            creep.memory.collectionSourceTarget = group.source.id;
            group.stored = Math.max(0, group.stored - cargoCapacity);
          }
        }
        collectionDemand = Math.max(0, collectionDemand - cargoCapacity);
        collectibleEnergy = Math.max(0, collectibleEnergy - cargoCapacity);
      } else {
        assignments[creep.name] = sourceBuffers.length > 0
          ? 'collect-stage' : 'standby';
        if (stageSources.length > 0) {
          const stageSource = stageSources[stageSourceIndex %
            stageSources.length];
          collectionSources[creep.name] = stageSource.id;
          stageSourceIndex++;
        }
      }
    }
    // Do not re-route a carrier while its reserved job remains useful. A lane
    // ends because its source/destination is completed or invalid, not because
    // a timer expired or another demand changed by a few points.
    const stickyCarriers = roomCreeps.filter(servesAsLocalHauler);
    for (const creep of stickyCarriers) {
      const previousLane = creep.memory.demandLane;
      const proposedLane = assignments[creep.name];
      const loaded = creep.store[RESOURCE_ENERGY] > 0;
      const fillsSpawn = dedicatedRefillerNames.has(creep.name);
      const previousWasRefill = previousLane === 'refill' ||
        previousLane === 'refill-stage';
      const supplyTarget = Game.getObjectById(creep.memory.supplyTarget);
      const previousStillUseful =
        loaded && previousLane === 'refill' && refillDemandFor(creep) > 0 ||
        loaded && previousLane === 'refill-buffer' &&
          extensionBufferStored < extensionBufferTarget ||
        loaded && (previousLane === 'buffer' ||
          previousLane === 'buffer-stage') && bufferFree > 0 ||
        loaded && previousLane === 'supply' && supplyTarget &&
          supplyTarget.store.getFreeCapacity(RESOURCE_ENERGY) > 0 ||
        loaded && previousLane === 'storage' && storage &&
          storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      if (previousLane && previousLane !== proposedLane &&
          (fillsSpawn ? previousWasRefill : !previousWasRefill) &&
          previousStillUseful) {
        assignments[creep.name] = previousLane;
        if (previousLane === 'supply' && supplyTarget) {
          supplyTargets[creep.name] = supplyTarget.name;
        }
      } else if (previousLane !== assignments[creep.name]) {
        creep.memory.demandLaneSince = Game.time;
      } else if (!Number.isInteger(creep.memory.demandLaneSince)) {
        creep.memory.demandLaneSince = Game.time;
      }
      const commitment = creep.memory.dispatchCommitment;
      if (commitment && commitment.lane !== assignments[creep.name]) {
        delete creep.memory.dispatchCommitment;
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
      collectionSources,
      demand: { spawnFree, towerFree, bufferFree, supplyFree, storageFree,
        sourceStored, buildTargets: sites.length,
        fixTargets: repairTargets.length,
        sourceCritical, buildRemaining, repairEnergy, energyWorkPhase },
      refillCarrier: dedicatedRefillers[0] && dedicatedRefillers[0].name,
      refillCarriers: dedicatedRefillers.map(creep => creep.name),
      laneCounts
    };
    room.memory.demandPlan = {
      tick: Game.time,
      spawnFree,
      towerFree,
      bufferFree,
      supplyFree,
      storageFree,
      sourceStored,
      buildRemaining,
      repairEnergy,
      energyWorkPhase,
      refillCarrier: dedicatedRefillers[0] && dedicatedRefillers[0].name,
      refillCarriers: dedicatedRefillers.map(creep => creep.name),
      collectionSources,
      commitments: Object.fromEntries(localCarriers
        .filter(creep => creep.memory.dispatchCommitment)
        .map(creep => [creep.name, creep.memory.dispatchCommitment])),
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
      delete creep.memory.refillBypass;
      delete creep.memory.refillBypassDone;
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

  for (const creep of creeps) {
    delete creep.memory.reserveHauler;
    delete creep.memory.controllerFeedTarget;
  }
  const { dropAssignments, ruinAssignments, tombstoneAssignments } =
    planSalvageAssignments({
      rooms: Object.values(Game.rooms), creeps, Game, RESOURCE_ENERGY,
      FIND_DROPPED_RESOURCES, FIND_RUINS, FIND_TOMBSTONES,
      canCollectDrop: (collector, drop, room) => {
        const localSource = getRoomSources(room).find(source =>
          source.pos.getRangeTo(drop) <= 2);
        if (!localSource) return true;
        const hasSourceContainer = getRoomStructures(room).some(structure =>
          structure.structureType === STRUCTURE_CONTAINER &&
          localSource.pos.getRangeTo(structure) <= 2);
        return !hasSourceContainer || collector.memory.role === 'harvester';
      }
    });

  const plannedRefillTargets = planRefillTargets({
    rooms: Object.values(Game.rooms), creeps, roomDemandPlans, Game,
    RESOURCE_ENERGY, FIND_MY_STRUCTURES, STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION, STRUCTURE_TOWER, isRefillTargetFor,
    getRefillPriority
  });

  // Let logistics reserve source energy before general workers withdraw it.
  // The controller buffer remains protected for the dedicated upgrader.
  const taskPriority = creep => creep.memory.role === 'refiller'
    ? 0 : creep.memory.role === 'hauler' ||
      creep.memory.role === 'remote-hauler'
      ? 1 : creep.memory.role === 'rebalancer'
        ? 2 : creep.memory.role === 'upgrader'
          ? 3 : isBuilder(creep, 'local', 'repair') ? 4 : 5;
  const taskCreeps = creeps.slice().sort((a, b) =>
    taskPriority(a) - taskPriority(b));
  const reservedRemoteSourceCoverage = {};
  const isSharedBuildTarget = target => target && target.room &&
    (target.structureType === STRUCTURE_EXTENSION ||
      target.room.controller &&
        target.structureType === STRUCTURE_CONTAINER &&
        target.pos.getRangeTo(target.room.controller) <= 3);
  const { createBuckets, isAvailable: exclusiveClaimAvailable,
    claim: claimExclusive, release: releaseExclusive,
    retain: retainTaskTarget, retainExclusive: retainExclusiveTarget } =
    createTaskReservations({ Game, isSharedTarget: isSharedBuildTarget });
  const reservedJobs = createBuckets(['build', 'repair']);
  for (const creep of taskCreeps) {
    retainTaskTarget(creep,
      ['refill', 'emergency-refill', 'remote-haul'], 'refillTarget',
      target => target && creep.store[RESOURCE_ENERGY] > 0 &&
        (target.structureType === STRUCTURE_SPAWN ||
          target.structureType === STRUCTURE_EXTENSION ||
          target.structureType === STRUCTURE_TOWER) &&
        target.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    retainExclusiveTarget(creep,
      ['build', 'dig-road', 'remote-road', 'remote-haul'], 'buildTarget',
      reservedJobs.build,
      target => target && target.progressTotal !== undefined &&
        creep.store[RESOURCE_ENERGY] > 0);
    retainExclusiveTarget(creep, ['repair', 'remote-haul'], 'repairTarget',
      reservedJobs.repair,
      target => target &&
        (creep.memory.role === 'hauler' ||
          isBuilder(creep, 'local', 'repair') ||
          creep.memory.role === 'remote-hauler') &&
        hasWorkParts(creep) && target.hits < target.hitsMax &&
        creep.store[RESOURCE_ENERGY] > 0);
    const controllerPlan = creep.room.memory.controllerContainerPlan;
    retainTaskTarget(creep, ['withdraw'], 'withdrawTarget', target =>
      canWithdrawFrom(creep, target) &&
      (!controllerPlan || target.id !== controllerPlan.retireContainerId ||
        controllerPlan.drainCreep === creep.name) &&
      creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
      target.store[RESOURCE_ENERGY] > 0);
    retainTaskTarget(creep, ['supply-worker', 'remote-haul'],
      'supplyTarget', target =>
      target && target.my && !target.spawning && target.name !== creep.name &&
      roomDemandPlans[creep.room.name] &&
      roomDemandPlans[creep.room.name].supplyTargets[creep.name] === target.name &&
      (isLocalBuilder(target) || target.memory.role === 'upgrader' ||
        target.memory.role === 'worker') &&
      target.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
  }
  const executionCreeps = taskCreeps.slice().sort((a, b) =>
    Number(!!b.memory.dispatchCommitment) -
      Number(!!a.memory.dispatchCommitment) ||
    (a.memory.dispatchCommitment && a.memory.dispatchCommitment.since ||
      Game.time) -
      (b.memory.dispatchCommitment && b.memory.dispatchCommitment.since ||
        Game.time) ||
    Number(b.store.getUsedCapacity() > 0) -
      Number(a.store.getUsedCapacity() > 0) ||
    taskPriority(a) - taskPriority(b) || a.name.localeCompare(b.name));
  const controllerStations = planControllerStations({
    rooms: Object.values(Game.rooms), creeps, getRoomStructures, RoomPosition,
    STRUCTURE_CONTAINER, STRUCTURE_RAMPART, TERRAIN_MASK_WALL,
    LOOK_STRUCTURES, OBSTACLE_OBJECT_TYPES
  });
  for (const creep of executionCreeps) {
    const controller = creep.room.controller;
    const controllerStation = controllerStations[creep.name];
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
    const rememberDispatchCommitment = (target, amount) => {
      const committedLanes = ['collect', 'refill', 'refill-buffer', 'buffer',
        'storage', 'supply'];
      if (!target || !target.id || !demandLane || demandLane === 'none' ||
          committedLanes.indexOf(demandLane) === -1 || amount <= 0) return;
      const previous = creep.memory.dispatchCommitment;
      const sameJob = previous && previous.lane === demandLane &&
        previous.targetId === target.id;
      creep.memory.dispatchCommitment = {
        lane: demandLane,
        targetId: target.id,
        roomName: creep.room.name,
        amount,
        since: sameJob && Number.isInteger(previous.since)
          ? previous.since : Game.time,
        updated: Game.time
      };
    };
    const forgetDispatchCommitment = target => {
      const commitment = creep.memory.dispatchCommitment;
      if (commitment && (!target || commitment.targetId === target.id)) {
        delete creep.memory.dispatchCommitment;
      }
    };
    const transferEnergy = (target, range = 1) => {
      const amount = reserveCapacityIn(target, creep.store[RESOURCE_ENERGY]);
      if (amount <= 0) return false;
      rememberDispatchCommitment(target, amount);
      const result = creep.transfer(target, RESOURCE_ENERGY, amount);
      if (result === ERR_NOT_IN_RANGE) moveCreep(creep, target, range);
      if (result !== OK && result !== ERR_NOT_IN_RANGE) {
        releaseAmount(reservedCapacity, target, amount);
        forgetDispatchCommitment(target);
        return false;
      }
      if (result === OK && creep.memory.role === 'remote-hauler' &&
          creep.memory.remoteCargoOrigin &&
          creep.room.name === (creep.memory.remoteHome || creep.memory.home)) {
        const homeMemory = creep.room.memory;
        if (!homeMemory.outpostEconomy) homeMemory.outpostEconomy = {};
        const origin = creep.memory.remoteCargoOrigin;
        const stats = homeMemory.outpostEconomy[origin] || {
          deliveredTotal: 0,
          firstDelivery: Game.time,
          buckets: {}
        };
        if (!stats.buckets) stats.buckets = {};
        const bucket = Math.floor(Game.time / 100) * 100;
        stats.deliveredTotal += amount;
        stats.lastDelivery = Game.time;
        stats.buckets[bucket] = (stats.buckets[bucket] || 0) + amount;
        for (const key of Object.keys(stats.buckets)) {
          if (Number(key) < Game.time - 1500) delete stats.buckets[key];
        }
        homeMemory.outpostEconomy[origin] = stats;
        if (amount >= creep.store[RESOURCE_ENERGY]) {
          delete creep.memory.remoteCargoOrigin;
        }
      }
      creep.memory.taskTarget = target.id || target.name || target.structureType;
      return true;
    };
    const continueDispatchCommitment = () => {
      const commitment = creep.memory.dispatchCommitment;
      if (!commitment || commitment.lane !== demandLane ||
          commitment.roomName !== creep.room.name) return false;
      const target = Game.getObjectById(commitment.targetId);
      if (!target) {
        forgetDispatchCommitment();
        return false;
      }
      if (commitment.lane === 'collect') {
        const sources = getRoomSources(creep.room);
        const storagePickup = creep.room.storage &&
          target.id === creep.room.storage.id;
        const validPickup = creep.store[RESOURCE_ENERGY] === 0 &&
          canWithdrawFrom(creep, target) &&
          target.store[RESOURCE_ENERGY] > 0 && (storagePickup ||
            target.structureType === STRUCTURE_CONTAINER &&
              sources.some(source => source.pos.getRangeTo(target) <= 2));
        if (!validPickup) {
          forgetDispatchCommitment(target);
          return false;
        }
        const amount = reserveEnergyFrom(target,
          creep.store.getFreeCapacity(RESOURCE_ENERGY));
        if (amount <= 0) return false;
        rememberDispatchCommitment(target, amount);
        const result = creep.withdraw(target, RESOURCE_ENERGY);
        if (result === ERR_NOT_IN_RANGE) moveCreep(creep, target, 1);
        if (result !== OK && result !== ERR_NOT_IN_RANGE) {
          releaseAmount(reservedEnergy, target, amount);
          forgetDispatchCommitment(target);
          return false;
        }
        creep.memory.taskTarget = target.id;
        return true;
      }
      const sourceBuffer = target.structureType === STRUCTURE_CONTAINER &&
        getRoomSources(creep.room).some(source =>
          source.pos.getRangeTo(target) <= 2);
      const laneTargetValid = commitment.lane === 'refill'
        ? target.my && (target.structureType === STRUCTURE_SPAWN ||
          target.structureType === STRUCTURE_EXTENSION ||
          target.structureType === STRUCTURE_TOWER)
        : commitment.lane === 'refill-buffer'
          ? isExtensionRefillBuffer(creep.room, target)
          : commitment.lane === 'buffer'
            ? !sourceBuffer && (target.structureType === STRUCTURE_CONTAINER ||
              target.structureType === STRUCTURE_STORAGE)
            : commitment.lane === 'storage'
              ? target.my && target.structureType === STRUCTURE_STORAGE
            : commitment.lane === 'supply' && target.my;
      const validDelivery = creep.store[RESOURCE_ENERGY] > 0 && target.store &&
        target.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && laneTargetValid;
      if (!validDelivery) {
        forgetDispatchCommitment(target);
        return false;
      }
      return transferEnergy(target);
    };
    const scavenge = () => {
      if (creep.memory.role !== 'hauler' ||
          demandLane !== 'collect' ||
          demandPlan && demandPlan.demand.sourceCritical ||
          creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;
      const drop = Game.getObjectById(dropAssignments[creep.name]);
      if (drop) return perform(drop, resource => creep.pickup(resource));
      const ruin = Game.getObjectById(ruinAssignments[creep.name]);
      if (ruin) {
        return perform(ruin,
          target => creep.withdraw(target, RESOURCE_ENERGY));
      }
      const tombstone = Game.getObjectById(
        tombstoneAssignments[creep.name]);
      return tombstone
        ? perform(tombstone,
          target => creep.withdraw(target, RESOURCE_ENERGY))
        : false;
    };
    const pickupNearbyDrop = () => {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;
      const drop = Game.getObjectById(dropAssignments[creep.name]);
      const nearbyRange = creep.memory.role === 'upgrader' ? 1 : 3;
      if (!drop || drop.resourceType !== RESOURCE_ENERGY || drop.amount <= 0 ||
          creep.pos.getRangeTo(drop) > nearbyRange) return false;
      return perform(drop, resource => creep.pickup(resource));
    };
    const withdrawNearbyRuin = () => {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;
      const ruin = Game.getObjectById(ruinAssignments[creep.name]);
      const nearbyRange = creep.memory.role === 'upgrader' ? 1 : 3;
      if (!ruin || ruin.store[RESOURCE_ENERGY] <= 0 ||
          creep.pos.getRangeTo(ruin) > nearbyRange) return false;
      return perform(ruin,
        target => creep.withdraw(target, RESOURCE_ENERGY));
    };
    const withdrawNearbyTombstone = () => {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;
      const tombstone = Game.getObjectById(
        tombstoneAssignments[creep.name]);
      const nearbyRange = creep.memory.role === 'upgrader' ? 1 : 3;
      if (!tombstone || tombstone.store[RESOURCE_ENERGY] <= 0 ||
          creep.pos.getRangeTo(tombstone) > nearbyRange) return false;
      return perform(tombstone,
        target => creep.withdraw(target, RESOURCE_ENERGY));
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
      const exclusiveRefillers = demandPlan &&
        (demandPlan.refillCarriers || [demandPlan.refillCarrier])
          .map(name => Game.creeps[name])
          .filter(owner => owner && owner.memory.role === 'refiller');
      if (exclusiveRefillers && exclusiveRefillers.length > 0 &&
          creep.memory.role !== 'refiller') {
        delete creep.memory.refillTarget;
        return null;
      }
      const openRefillStructures = getRoomStructures(creep.room).filter(
        structure => structure.my &&
          (structure.structureType === STRUCTURE_SPAWN ||
            structure.structureType === STRUCTURE_EXTENSION ||
            structure.structureType === STRUCTURE_TOWER) &&
          isRefillTargetFor(creep, structure) &&
          getUnreservedCapacity(structure) > 0);
      const highestPriority = openRefillStructures.reduce((priority, structure) =>
        Math.min(priority, getRefillPriority(creep.room, structure)), Infinity);
      const valid = structure => structure &&
        (structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_EXTENSION ||
          structure.structureType === STRUCTURE_TOWER) &&
        isRefillTargetFor(creep, structure) &&
        getRefillPriority(creep.room, structure) === highestPriority &&
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
          getRoomStructures(creep.room).filter(valid)
            .sort((a, b) =>
              getRefillPriority(creep.room, a) -
                getRefillPriority(creep.room, b) ||
              creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b))[0]);
      }
      return selectPersistentTarget('refillTarget', valid, () =>
        getRoomStructures(creep.room).filter(valid)
          .sort((a, b) =>
            getRefillPriority(creep.room, a) -
              getRefillPriority(creep.room, b) ||
            creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b))[0]);
    };
    const deliverRefill = target => {
      // Movement chooses a current path around live traffic and structures;
      // no room-coordinate waypoint is baked into the refiller role.
      delete creep.memory.refillBypass;
      delete creep.memory.refillBypassDone;
      return transferEnergy(target);
    };
    const getBuildTarget = extraFilter => {
      let target = Game.getObjectById(creep.memory.buildTarget);
      const tunnelSite = isBuilder(creep, 'local', 'tunnel')
        ? getSource2TunnelSite(creep.room)
        : null;
      const extensionLimit = creep.room.controller &&
        CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION] &&
        CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION]
          [creep.room.controller.level] || 0;
      const builtExtensionCount = getRoomStructures(creep.room)
        .filter(structure =>
          structure.structureType === STRUCTURE_EXTENSION).length;
      const storageDeferred = builtExtensionCount < extensionLimit;
      const valid = site => site && site.progressTotal !== undefined &&
        (!storageDeferred || site.structureType !== STRUCTURE_STORAGE) &&
        (site.structureType !== STRUCTURE_ROAD ||
          tunnelSite && site.id === tunnelSite.id ||
          isSingleLaneRoadPosition(creep.room, site)) &&
        (!roadsPaused(creep.room) ||
          site.structureType !== STRUCTURE_ROAD ||
          tunnelSite && site.id === tunnelSite.id) &&
        (!extraFilter || extraFilter(site)) &&
        exclusiveClaimAvailable(reservedJobs.build, site, creep.name);
      if (!extraFilter && creep.room.controller) {
        const prioritySite = getRoomSites(creep.room).find(site =>
          site.structureType === STRUCTURE_CONTAINER &&
            site.pos.getRangeTo(creep.room.controller) <= 3 &&
            exclusiveClaimAvailable(reservedJobs.build, site, creep.name)
        );
        if (prioritySite && (!target || target.id !== prioritySite.id)) {
          releaseExclusive(reservedJobs.build, target, creep.name);
          target = prioritySite;
          creep.memory.buildTarget = prioritySite.id;
        }
      }
      if (!extraFilter && (!target ||
          target.structureType === STRUCTURE_ROAD)) {
        const containerSite = getRoomSites(creep.room)
          .filter(site => site.structureType === STRUCTURE_CONTAINER &&
            exclusiveClaimAvailable(reservedJobs.build, site, creep.name))
          .sort((a, b) => creep.pos.getRangeTo(a) -
            creep.pos.getRangeTo(b))[0];
        if (containerSite) {
          releaseExclusive(reservedJobs.build, target, creep.name);
          target = containerSite;
          creep.memory.buildTarget = containerSite.id;
        }
      }
      if (!extraFilter && (!target ||
          target.structureType === STRUCTURE_ROAD)) {
        const extensionSite = getRoomSites(creep.room)
          .filter(site => site.structureType === STRUCTURE_EXTENSION &&
            exclusiveClaimAvailable(reservedJobs.build, site, creep.name))
          .sort((a, b) => creep.pos.getRangeTo(a) -
            creep.pos.getRangeTo(b))[0];
        if (extensionSite) {
          releaseExclusive(reservedJobs.build, target, creep.name);
          target = extensionSite;
          creep.memory.buildTarget = extensionSite.id;
        }
      }
      if (!valid(target)) {
        delete creep.memory.buildTarget;
        target = getRoomSites(creep.room).filter(valid)
          .sort((a, b) => {
            const priority = site => site.structureType === STRUCTURE_CONTAINER
              ? 0 : site.structureType === STRUCTURE_ROAD ? 2 : 1;
            return priority(a) - priority(b) ||
              creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b);
          })[0];
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
        getRoomStructures(creep.room).filter(structure =>
          repairable(structure) &&
            structure.hits < structure.hitsMax * 0.75)
          .sort((a, b) => creep.pos.getRangeTo(a) -
            creep.pos.getRangeTo(b))[0]);
      if (!target) return null;
      if (!claimExclusive(reservedJobs.repair, target, creep.name)) return null;
      return target;
    };
    const getWorkerSupplyTarget = () => {
      if (creep.memory.role !== 'hauler' ||
          creep.store[RESOURCE_ENERGY] === 0) return null;
      const valid = worker => worker && worker.my && !worker.spawning &&
        worker.name !== creep.name && hasWorkParts(worker) &&
        (isLocalBuilder(worker) || worker.memory.role === 'upgrader' ||
          worker.memory.role === 'worker') &&
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
          isBuilder(creep, 'local', 'tunnel')) return false;
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
      const wantsExtensionBuffer = demandLane === 'refill-buffer';
      const wantsStorage = demandLane === 'storage';
      const valid = structure => structure &&
        (wantsStorage
          ? structure.my && structure.structureType === STRUCTURE_STORAGE
          : wantsExtensionBuffer
          ? isExtensionRefillBuffer(creep.room, structure)
          : structure.structureType === STRUCTURE_STORAGE ||
            structure.structureType === STRUCTURE_CONTAINER && controller &&
              structure.pos.getRangeTo(controller) <= 3) &&
        energySources.indexOf(structure.id) === -1 &&
        getUnreservedCapacity(structure) > 0;
      const container = selectPersistentTarget('bufferTarget', valid, () =>
        getRoomStructures(creep.room).filter(valid)
          .sort((a, b) => creep.pos.getRangeTo(a) -
            creep.pos.getRangeTo(b))[0]);
      return container ? transferEnergy(container) : false;
    };
    const stageAtSourceBuffer = () => {
      if (creep.memory.role !== 'hauler' ||
          demandLane !== 'collect-stage') return false;
      const sources = getRoomSources(creep.room);
      const assignedSource = Game.getObjectById(demandPlan &&
        demandPlan.collectionSources[creep.name]);
      const valid = structure => structure &&
        structure.structureType === STRUCTURE_CONTAINER &&
          sources.some(source => source.pos.getRangeTo(structure) <= 2) &&
          (!assignedSource || assignedSource.pos.getRangeTo(structure) <= 2)
      ;
      const buffer = selectPersistentTarget('stageSourceBufferTarget', valid,
        () => getRoomStructures(creep.room).filter(valid)
          .sort((a, b) => creep.pos.getRangeTo(a) -
            creep.pos.getRangeTo(b) ||
            b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY])[0]);
      if (!buffer) return false;
      if (creep.pos.getRangeTo(buffer) > 1) moveCreep(creep, buffer, 1);
      creep.memory.taskTarget = buffer.id;
      return true;
    };
    const stageAtRefill = () => {
      if (demandLane !== 'refill-stage') return false;
      const spawn = getRoomStructures(creep.room).find(structure =>
        structure.structureType === STRUCTURE_SPAWN && structure.my);
      if (!spawn) return false;
      if (creep.pos.getRangeTo(spawn) > 1) moveCreep(creep, spawn, 1);
      creep.memory.taskTarget = `${spawn.id} refill reserve`;
      return true;
    };
    const storeRemoteDelivery = () => {
      // Inter-room hauling ends at the first reachable home buffer. Remote
      // carriers do not make local distribution decisions; rebalancers move
      // energy from this handoff container to the extension and RC buffers.
      // When a remote carrier temporarily drains a home source buffer, that
      // pickup buffer cannot also be its delivery target. Otherwise it can
      // withdraw from S1/S2 and transfer the same load straight back forever.
      const localSources = getRoomSources(creep.room);
      const isSourceBuffer = structure => localSources.some(source =>
        source.pos.getRangeTo(structure) <= 2);
      const validBuffer = structure => structure &&
        structure.room.name === creep.room.name &&
        structure.id !== creep.memory.remotePickupSource &&
        (structure.structureType === STRUCTURE_CONTAINER ||
          structure.structureType === STRUCTURE_STORAGE) &&
        !isSourceBuffer(structure) &&
        getUnreservedCapacity(structure) > 0;
      let target = Game.getObjectById(creep.memory.remoteDeliveryTarget);
      if (!validBuffer(target)) {
        delete creep.memory.remoteDeliveryTarget;
        const candidates = creep.room.find(FIND_STRUCTURES, {
          filter: validBuffer
        });
        target = candidates.sort((a, b) =>
          Number(b.structureType === STRUCTURE_STORAGE) -
            Number(a.structureType === STRUCTURE_STORAGE) ||
          creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b))[0];
        if (target) creep.memory.remoteDeliveryTarget = target.id;
      }
      if (target) return transferEnergy(target);
      return false;
    };
    let tasks;
    if (isLocalBuilder(creep) && creep.memory.home &&
        creep.room.name !== creep.memory.home) {
      tasks = [{
        name: 'builder-return',
        run: () => {
          moveCreep(creep,
            new RoomPosition(25, 25, creep.memory.home), 20);
          creep.memory.taskTarget = `${creep.memory.home} builder home`;
          return true;
        }
      }];
    } else if (creep.memory.role === 'refiller') {
      // Role identity is the authority. A second ownership list previously
      // allowed a creep to be labelled refiller while denying it refill work,
      // leaving it permanently staged beside an empty spawn.
      const ownsRefillLane = true;
      const isLocalExtensionRefillBuffer = structure =>
        isExtensionRefillBuffer(creep.room, structure) &&
        (!Number.isInteger(creep.memory.refillClusterX) ||
          Math.max(
            Math.abs(structure.pos.x - creep.memory.refillClusterX),
            Math.abs(structure.pos.y - creep.memory.refillClusterY)) <= 4);
      tasks = [
        {
          name: 'refill',
          run: () => {
            if (!ownsRefillLane || creep.store[RESOURCE_ENERGY] <= 0) {
              return false;
            }
            const target = getRefillTarget();
            return target ? deliverRefill(target) : false;
          }
        },
        {
          name: 'refill-load',
          run: () => {
            if (!ownsRefillLane ||
                creep.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) {
              return false;
            }
            const storage = creep.room.storage;
            const valid = structure => structure && structure.store &&
              getUnreservedEnergy(structure) > 0 &&
              (structure === storage ||
                structure.structureType === STRUCTURE_CONTAINER &&
                  !isControllerBuffer(structure));
            let source = Game.getObjectById(creep.memory.refillPickupTarget);
            const localExtensionBuffer = getRoomStructures(creep.room)
              .filter(structure => valid(structure) &&
                isLocalExtensionRefillBuffer(structure))
              .sort((a, b) => creep.pos.getRangeTo(a) -
                creep.pos.getRangeTo(b))[0];
            if (localExtensionBuffer &&
                (!source || source.id !== localExtensionBuffer.id)) {
              source = null;
              delete creep.memory.refillPickupTarget;
            }
            if (!valid(source)) {
              delete creep.memory.refillPickupTarget;
              const candidates = getRoomStructures(creep.room).filter(valid)
                .sort((a, b) => {
                  const aExtensionBuffer =
                    isLocalExtensionRefillBuffer(a);
                  const bExtensionBuffer =
                    isLocalExtensionRefillBuffer(b);
                  if (aExtensionBuffer !== bExtensionBuffer) {
                    return Number(bExtensionBuffer) -
                      Number(aExtensionBuffer);
                  }
                  const aStorage = a === storage;
                  const bStorage = b === storage;
                  if (aStorage !== bStorage) return bStorage - aStorage;
                  return creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b) ||
                    getUnreservedEnergy(b) - getUnreservedEnergy(a);
                });
              source = candidates[0];
              if (source) creep.memory.refillPickupTarget = source.id;
            }
            if (!source) return false;
            const amount = reserveEnergyFrom(source,
              creep.store.getFreeCapacity(RESOURCE_ENERGY));
            if (amount <= 0) return false;
            const result = creep.withdraw(source, RESOURCE_ENERGY, amount);
            if (result === ERR_NOT_IN_RANGE) moveCreep(creep, source);
            if (result !== OK && result !== ERR_NOT_IN_RANGE) {
              releaseAmount(reservedEnergy, source, amount);
              delete creep.memory.refillPickupTarget;
              return false;
            }
            creep.memory.taskTarget = source.id;
            return true;
          }
        },
        {
          name: 'stage-refill',
          run: () => {
            const extensionBuffer = getRoomStructures(creep.room)
              .filter(isLocalExtensionRefillBuffer)
              .sort((a, b) => creep.pos.getRangeTo(a) -
                creep.pos.getRangeTo(b))[0];
            if (extensionBuffer) {
              if (creep.pos.getRangeTo(extensionBuffer) > 1) {
                moveCreep(creep, extensionBuffer, 1);
              }
              creep.memory.taskTarget = `${extensionBuffer.id} refill reserve`;
              return true;
            }
            if (Number.isInteger(creep.memory.refillClusterX) &&
                Number.isInteger(creep.memory.refillClusterY)) {
              const clusterPosition = new RoomPosition(
                creep.memory.refillClusterX,
                creep.memory.refillClusterY, creep.room.name);
              if (creep.pos.getRangeTo(clusterPosition) > 2) {
                moveCreep(creep, clusterPosition, 2);
              }
              creep.memory.taskTarget = `${creep.memory.refillClusterId} ` +
                'extension reserve';
              return true;
            }
            const spawn = getRoomStructures(creep.room).find(structure =>
              structure.structureType === STRUCTURE_SPAWN && structure.my);
            if (!spawn) return false;
            if (creep.pos.getRangeTo(spawn) > 1) moveCreep(creep, spawn, 1);
            creep.memory.taskTarget = `${spawn.id} ` +
              (ownsRefillLane ? 'refill reserve' : 'backup refiller');
            return true;
          }
        }
      ];
    } else if (creep.memory.role === 'rebalancer') {
      tasks = [{
        name: 'rebalance',
        run: () => {
          const storage = creep.room.storage;
          const sources = getRoomSources(creep.room);
          const extensionPlan = creep.room.memory.extensionContainerPlan;
          const extensionCluster = creep.room.memory.extensionCluster;
          const getBufferTargetRatio = structure => {
            if (controller && structure.pos.getRangeTo(controller) <= 3) {
              return 0.75;
            }
            const plannedExtensionBuffer = extensionPlan &&
              structure.pos.x === extensionPlan.x &&
              structure.pos.y === extensionPlan.y;
            const clusteredExtensionBuffer = extensionCluster &&
              structure.pos.getRangeTo(
                extensionCluster.x, extensionCluster.y) <= 3 &&
              !sources.some(source => source.pos.getRangeTo(structure) <= 2) &&
              (!controller || structure.pos.getRangeTo(controller) > 3);
            return plannedExtensionBuffer || clusteredExtensionBuffer
              ? 0.5 : 0;
          };
          const stillNeedsEnergy = structure => {
            if (!structure || structure.structureType !== STRUCTURE_CONTAINER) {
              return false;
            }
            const targetRatio = getBufferTargetRatio(structure);
            const capacity = structure.store.getCapacity(RESOURCE_ENERGY) || 0;
            return targetRatio > 0 && capacity > 0 &&
              structure.store[RESOURCE_ENERGY] < capacity * targetRatio;
          };
          let target = Game.getObjectById(creep.memory.rebalanceTarget);
          if (!stillNeedsEnergy(target)) {
            delete creep.memory.rebalanceTarget;
            target = getRoomStructures(creep.room)
              .filter(stillNeedsEnergy)
              .sort((a, b) => {
                const aCapacity = a.store.getCapacity(RESOURCE_ENERGY) || 1;
                const bCapacity = b.store.getCapacity(RESOURCE_ENERGY) || 1;
                const aProgress = a.store[RESOURCE_ENERGY] /
                  (aCapacity * getBufferTargetRatio(a));
                const bProgress = b.store[RESOURCE_ENERGY] /
                  (bCapacity * getBufferTargetRatio(b));
                return aProgress - bProgress ||
                  creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b);
              })[0];
            if (target) creep.memory.rebalanceTarget = target.id;
          }
          if (creep.store[RESOURCE_ENERGY] > 0) {
            if (target) return transferEnergy(target);
            delete creep.memory.rebalanceTarget;
            if (storage && storage.my) return transferEnergy(storage);
            creep.memory.taskTarget = 'energy ready; buffers balanced';
            return true;
          }
          if (!target) {
            const homeSource = Game.getObjectById(
              creep.memory.rebalancerSource);
            const homeBuffer = homeSource && homeSource.pos.findInRange(
              FIND_STRUCTURES, 2, {
                filter: structure =>
                  structure.structureType === STRUCTURE_CONTAINER
              })[0];
            if (homeBuffer && creep.pos.getRangeTo(homeBuffer) > 1) {
              moveCreep(creep, homeBuffer, 1);
            }
            creep.memory.taskTarget = homeBuffer
              ? `${homeBuffer.id} buffers balanced` : 'buffers balanced';
            return true;
          }
          const preferredSource = Game.getObjectById(
            creep.memory.rebalancerSource);
          const pickupCandidates = getRoomStructures(creep.room)
            .filter(structure =>
              structure.structureType === STRUCTURE_CONTAINER &&
              !stillNeedsEnergy(structure) &&
              getUnreservedEnergy(structure) > 0)
            .sort((a, b) => {
              const aPreferred = preferredSource &&
                preferredSource.pos.getRangeTo(a) <= 2;
              const bPreferred = preferredSource &&
                preferredSource.pos.getRangeTo(b) <= 2;
              const aCapacity = a.store.getCapacity(RESOURCE_ENERGY) || 1;
              const bCapacity = b.store.getCapacity(RESOURCE_ENERGY) || 1;
              return Number(bPreferred) - Number(aPreferred) ||
                b.store[RESOURCE_ENERGY] / bCapacity -
                  a.store[RESOURCE_ENERGY] / aCapacity ||
                creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b);
            });
          if (storage && storage.my && getUnreservedEnergy(storage) > 0) {
            pickupCandidates.push(storage);
          }
          let source = Game.getObjectById(creep.memory.rebalancePickupTarget);
          if (!source || getUnreservedEnergy(source) <= 0 || source.id === target.id) {
            delete creep.memory.rebalancePickupTarget;
            source = pickupCandidates.find(candidate => candidate.id !== target.id);
            if (source) creep.memory.rebalancePickupTarget = source.id;
          }
          if (!source) {
            creep.memory.taskTarget = `${target.id} waiting for source energy`;
            return true;
          }
          const targetCapacity = target.store.getCapacity(RESOURCE_ENERGY) || 0;
          const targetAmount = targetCapacity * getBufferTargetRatio(target);
          const needed = Math.max(0,
            Math.ceil(targetAmount - target.store[RESOURCE_ENERGY]));
          const amount = reserveEnergyFrom(source, Math.min(
            creep.store.getFreeCapacity(RESOURCE_ENERGY), needed));
          if (amount <= 0) return true;
          const result = creep.withdraw(source, RESOURCE_ENERGY, amount);
          if (result === ERR_NOT_IN_RANGE) moveCreep(creep, source);
          if (result !== OK && result !== ERR_NOT_IN_RANGE) {
            releaseAmount(reservedEnergy, source, amount);
            delete creep.memory.rebalancePickupTarget;
            return false;
          }
          creep.memory.taskTarget = `${source.id} -> ${target.id}`;
          return true;
        }
      }];
    } else if (creep.memory.role === 'claimer') {
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
    } else if (isExpansionBuilder(creep)) {
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
            creep.memory.role = 'builder';
            creep.memory.builderScope = 'local';
            creep.memory.builderMission = 'flexible';
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
          const remoteSources = getRoomSources(creep.room)
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
          const rosterRoomName = creep.memory.remoteRoom;
          let targetRoomName = creep.memory.remoteDispatchRoom ||
            rosterRoomName;
          if (!homeRoomName || !targetRoomName) return false;
          const travelTo = roomName => {
            moveCreep(creep, new RoomPosition(25, 25, roomName), 20);
            creep.memory.taskTarget = `${roomName} haul`;
            return true;
          };
          const rosterSlot = Number.isInteger(creep.memory.remoteHaulerSlot)
            ? creep.memory.remoteHaulerSlot : 0;
          let slot = Number.isInteger(creep.memory.remoteDispatchSlot)
            ? creep.memory.remoteDispatchSlot : rosterSlot;
          if (creep.store[RESOURCE_ENERGY] === 0) {
            delete creep.memory.remotePickupSource;
            delete creep.memory.remoteDeliveryTarget;
            delete creep.memory.remoteCargoOrigin;
          }
          if (creep.store[RESOURCE_ENERGY] === 0 &&
              !creep.memory.remoteHaulReturning &&
              creep.room.name === homeRoomName &&
              !creep.memory.remoteDispatchRoom) {
            const homeRoom = Game.rooms[homeRoomName];
            const surveys = homeRoom && [homeRoom.memory.leftSurvey,
              homeRoom.memory.southSurvey,
              homeRoom.memory.southwestSurvey].filter(survey =>
              survey && survey.active && survey.targetRoom);
            // Slot zero remains the outpost's baseline carrier. Additional
            // haulers are a shared fleet and follow the largest room backlog.
            const protectedSlots = 1;
            const flexible = creep.memory.remoteRosterSurplus ||
              rosterSlot >= protectedSlots;
            if (flexible && surveys.length > 1) {
              const best = rankRemoteDispatchRooms(surveys.map(survey =>
                survey.targetRoom), remoteRoomDispatchClaims)[0];
              if (best && best.availableEnergy > 0) {
                targetRoomName = best.roomName;
                slot = best.richestSlot;
                creep.memory.remoteDispatchRoom = targetRoomName;
                creep.memory.remoteDispatchSlot = slot;
                remoteRoomDispatchClaims[targetRoomName] =
                  (remoteRoomDispatchClaims[targetRoomName] || 0) +
                  creep.store.getCapacity(RESOURCE_ENERGY);
              }
            }
          }
          let readiness = getRemoteHaulReadiness(targetRoomName, slot);
          const canClaimPickup = creep.store[RESOURCE_ENERGY] === 0 &&
            !creep.memory.remoteHaulReturning &&
            (creep.room.name === homeRoomName ||
              creep.room.name === targetRoomName);
          if (canClaimPickup && readiness.ready) {
            const currentClaimed =
              remoteDispatchClaims[readiness.container.id] || 0;
            const currentEnergy = Math.max(0,
              getUnreservedEnergy(readiness.container) - currentClaimed);
            remoteDispatchClaims[readiness.container.id] = currentClaimed +
              Math.min(currentEnergy,
                creep.store.getCapacity(RESOURCE_ENERGY));
          }
          // Direction is cargo-driven, not readiness-driven. A readiness
          // threshold can fluctuate as other haulers withdraw; it must never
          // send a partially loaded creep back across the same border.
          if (creep.room.name === homeRoomName &&
              creep.store[RESOURCE_ENERGY] > 0) {
            creep.memory.remoteHaulReturning = true;
          }
          // Haulers are logistics-only. Their WORK part is an emergency body
          // component, not permission to build, repair, or upgrade.
          const pitchInLocally = () => false;
          const waitNearDeliveryBuffer = label => {
            const buffer = getRoomStructures(creep.room)
              .filter(structure =>
                structure.structureType === STRUCTURE_CONTAINER &&
                controller && structure.pos.getRangeTo(controller) <= 3)
              .sort((a, b) => creep.pos.getRangeTo(a) -
                creep.pos.getRangeTo(b))[0];
            if (buffer && creep.pos.getRangeTo(buffer) > 1) {
              moveCreep(creep, buffer, 1);
            }
            creep.memory.taskTarget = buffer
              ? `${buffer.id} ${label}` : label;
            return true;
          };
          // A full home source buffer is more urgent than starting another
          // remote leg. Temporarily use remote carriers as local haulers until
          // S1/S2 are drained and the assigned home delivery is completed.
          const handlesLocalDemand = creep.room.name === homeRoomName &&
            (demandLane === 'collect' || demandLane === 'buffer' ||
              demandLane === 'refill-buffer' ||
              demandLane === 'storage' ||
              demandLane === 'refill' || demandLane === 'refill-stage' ||
              demandLane === 'buffer-stage');
          if (!readiness.ready || handlesLocalDemand) {
            if (creep.store[RESOURCE_ENERGY] === 0) {
              delete creep.memory.remoteHaulReturning;
            } else {
              creep.memory.remoteHaulReturning = true;
            }
            if (creep.room.name !== homeRoomName) return travelTo(homeRoomName);
            if (creep.store[RESOURCE_ENERGY] > 0) {
              if (demandLane === 'refill-stage') return stageAtRefill();
              if (demandLane === 'refill-buffer' &&
                  storeEnergyInBuffer()) return true;
              if (demandLane === 'storage' &&
                  storeEnergyInBuffer()) return true;
              if (demandLane === 'buffer' && storeRemoteDelivery()) return true;
              const refillTarget = demandLane === 'refill'
                ? getRefillTarget() : null;
              if (refillTarget) return deliverRefill(refillTarget);
              if (storeRemoteDelivery()) return true;
              const recipient = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
                filter: worker => worker.name !== creep.name &&
                  hasWorkParts(worker) && getUnreservedCapacity(worker) > 0 &&
                  creep.pos.getRangeTo(worker) <= 1
              });
              if (recipient) return transferEnergy(recipient);
              if (pitchInLocally()) return true;
              return waitNearDeliveryBuffer('delivery full');
            } else {
              const localPickupThreshold = Math.min(CARRY_CAPACITY,
                creep.store.getCapacity(RESOURCE_ENERGY));
              const localSources = getRoomSources(creep.room);
              const validLocalPickup = structure => structure &&
                structure.structureType === STRUCTURE_CONTAINER &&
                canWithdrawFrom(creep, structure) &&
                getUnreservedEnergy(structure) >= localPickupThreshold &&
                localSources.some(source =>
                  source.pos.getRangeTo(structure) <= 2);
              let localContainer = Game.getObjectById(
                creep.memory.remotePickupTarget);
              const plannedSource = Game.getObjectById(demandPlan &&
                demandPlan.collectionSources[creep.name]);
              if (localContainer && plannedSource &&
                  plannedSource.pos.getRangeTo(localContainer) > 2) {
                localContainer = null;
                delete creep.memory.remotePickupTarget;
              }
              if (!validLocalPickup(localContainer)) {
                delete creep.memory.remotePickupTarget;
                const assignedSourceId = demandPlan &&
                  demandPlan.collectionSources[creep.name];
                const localContainers = getRoomStructures(creep.room)
                  .filter(validLocalPickup).sort((a, b) => {
                const assignedSource = Game.getObjectById(assignedSourceId);
                const aAssigned = assignedSource &&
                  assignedSource.pos.getRangeTo(a) <= 2;
                const bAssigned = assignedSource &&
                  assignedSource.pos.getRangeTo(b) <= 2;
                if (aAssigned !== bAssigned) return bAssigned - aAssigned;
                const aCapacity = a.store.getCapacity(RESOURCE_ENERGY) || 1;
                const bCapacity = b.store.getCapacity(RESOURCE_ENERGY) || 1;
                const aCritical = getUnreservedEnergy(a) / aCapacity >= 0.9;
                const bCritical = getUnreservedEnergy(b) / bCapacity >= 0.9;
                if (aCritical !== bCritical) return bCritical - aCritical;
                const pressure = getUnreservedEnergy(b) / bCapacity -
                  getUnreservedEnergy(a) / aCapacity;
                return pressure ||
                  creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b);
                });
                localContainer = localContainers[0];
                if (localContainer) {
                  creep.memory.remotePickupTarget = localContainer.id;
                }
              }
              if (localContainer) {
                const amount = reserveEnergyFrom(localContainer,
                  creep.store.getFreeCapacity(RESOURCE_ENERGY));
                if (amount > 0) {
                  rememberDispatchCommitment(localContainer, amount);
                  const result = creep.withdraw(localContainer, RESOURCE_ENERGY);
                  if (result === ERR_NOT_IN_RANGE) {
                    moveCreep(creep, localContainer);
                  } else if (result !== OK) {
                    releaseAmount(reservedEnergy, localContainer, amount);
                    forgetDispatchCommitment(localContainer);
                    delete creep.memory.remotePickupTarget;
                  } else {
                    creep.memory.remotePickupSource = localContainer.id;
                    delete creep.memory.remoteCargoOrigin;
                    delete creep.memory.collectionSourceTarget;
                    delete creep.memory.remotePickupTarget;
                    if (creep.memory.remoteDeliveryTarget ===
                        localContainer.id) {
                      delete creep.memory.remoteDeliveryTarget;
                    }
                  }
                  creep.memory.taskTarget = `${localContainer.id} ` +
                    `(local until L${slot + 1}: ` +
                    `${readiness.reason || 'home source backlog'})`;
                  return true;
                }
              }
            }
            creep.memory.taskTarget = `local until L${slot + 1}: ` +
              (readiness.reason || 'home source backlog');
            return true;
          }
          if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            creep.memory.remoteHaulReturning = true;
          }
          if (creep.memory.remoteHaulReturning) {
            if (creep.room.name !== homeRoomName) return travelTo(homeRoomName);
            if (creep.store[RESOURCE_ENERGY] > 0) {
              if (demandLane === 'refill-stage') return stageAtRefill();
              if (demandLane === 'refill-buffer' &&
                  storeEnergyInBuffer()) return true;
              if (demandLane === 'storage' &&
                  storeEnergyInBuffer()) return true;
              if (demandLane === 'buffer' && storeRemoteDelivery()) return true;
              const refillTarget = demandLane === 'refill'
                ? getRefillTarget() : null;
              if (refillTarget) return deliverRefill(refillTarget);
              if (storeRemoteDelivery()) return true;
              const recipient = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
                filter: worker => worker.name !== creep.name &&
                  hasWorkParts(worker) &&
                  (isLocalBuilder(worker) ||
                    worker.memory.role === 'upgrader' ||
                    worker.memory.role === 'worker') &&
                  getUnreservedCapacity(worker) > 0 &&
                  creep.pos.getRangeTo(worker) <= 1
              });
              if (recipient) return transferEnergy(recipient);
              if (pitchInLocally()) return true;
              return waitNearDeliveryBuffer('home delivery full');
            }
            delete creep.memory.remoteHaulReturning;
          }
          if (creep.room.name !== targetRoomName) return travelTo(targetRoomName);
          const sources = getRoomSources(creep.room)
            .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
          if (sources.length === 0) {
            creep.memory.taskTarget = `${targetRoomName} no source`;
            return true;
          }
          const source = sources[slot % sources.length];
          const container = source.pos.findInRange(FIND_STRUCTURES, 2, {
            filter: structure => structure.structureType === STRUCTURE_CONTAINER
          }).sort((a, b) =>
            getUnreservedEnergy(b) - getUnreservedEnergy(a) ||
            source.pos.getRangeTo(a) - source.pos.getRangeTo(b))[0];
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
            creep.memory.remotePickupSource = container.id;
            creep.memory.remoteCargoOrigin = targetRoomName;
            delete creep.memory.remoteDispatchRoom;
            delete creep.memory.remoteDispatchSlot;
            if (creep.memory.remoteDeliveryTarget === container.id) {
              delete creep.memory.remoteDeliveryTarget;
            }
            creep.memory.taskTarget = container.id;
            return true;
          }
          if (creep.store[RESOURCE_ENERGY] > 0) {
            creep.memory.remoteHaulReturning = true;
            return travelTo(homeRoomName);
          }
          if (creep.memory.remoteDispatchRoom &&
              getRemoteResourceSummary(targetRoomName).storedEnergy === 0) {
            delete creep.memory.remoteDispatchRoom;
            delete creep.memory.remoteDispatchSlot;
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
    } else if (isOutpostBuilder(creep)) {
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
          if (creep.room.name === creep.memory.remoteRoom &&
              creep.store[RESOURCE_ENERGY] > 0) {
            let repairTarget = Game.getObjectById(
              creep.memory.remoteRepairTarget);
            if (!repairTarget || repairTarget.room.name !==
                creep.memory.remoteRoom ||
                !isOutpostRepairTarget(repairTarget) ||
                !exclusiveClaimAvailable(reservedJobs.repair, repairTarget,
                  creep.name)) {
              delete creep.memory.remoteRepairTarget;
              repairTarget = selectOutpostRepairTarget(
                getRoomStructures(creep.room).filter(structure =>
                  exclusiveClaimAvailable(reservedJobs.repair, structure,
                    creep.name)), creep.pos);
              if (repairTarget) {
                creep.memory.remoteRepairTarget = repairTarget.id;
              }
            }
            if (repairTarget && claimExclusive(reservedJobs.repair,
              repairTarget, creep.name)) {
              creep.memory.taskTarget = repairTarget.id;
              return perform(repairTarget,
                target => creep.repair(target), 3);
            }
          } else if (creep.store[RESOURCE_ENERGY] === 0) {
            // An empty maintainer is not actively assigned to a repair. Drop
            // the stale label so another funded builder can own that target.
            delete creep.memory.remoteRepairTarget;
          }
          if (creep.room.name === creep.memory.remoteRoom) {
            const remoteSources = getRoomSources(creep.room)
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
          if (!site || !seenSiteIds.has(site.id) ||
              !exclusiveClaimAvailable(reservedJobs.build, site, creep.name)) {
            const travelScore = candidate => {
              if (candidate.room.name === creep.room.name) {
                return creep.pos.getRangeTo(candidate);
              }
              return 1000 + Game.map.getRoomLinearDistance(
                creep.room.name, candidate.room.name) * 50;
            };
            site = roadSites.filter(candidate =>
              exclusiveClaimAvailable(reservedJobs.build, candidate,
                creep.name)).sort((a, b) =>
              (a.structureType === STRUCTURE_CONTAINER ? 0 : 1) -
                (b.structureType === STRUCTURE_CONTAINER ? 0 : 1) ||
              travelScore(a) - travelScore(b) ||
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
            if (!claimExclusive(reservedJobs.build, site, creep.name)) {
              delete homeRoom.memory.remoteBuildTargets[targetKey];
              delete creep.memory.buildTarget;
              return false;
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
            const sources = getRoomSources(creep.room)
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
              const sourceIndex = getRoomSources(creep.room)
                .findIndex(candidate => candidate.id === source.id);
              if (sourceIndex === 1 && containers.length >= 1) {
                creep.memory.containerSiteError =
                  'S2 limited to one container; waiting for hauler';
                return false;
              }
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
    } else if (creep.memory.working &&
        isBuilder(creep, 'local', 'tunnel')) {
      tasks = [
        {
          name: 'dig-road',
          run: () => {
            const site = Game.getObjectById(creep.memory.builderTarget) ||
              getSource2TunnelSite(creep.room);
            if (!site) return false;
            creep.memory.builderTarget = site.id;
            const target = getBuildTarget(candidate => candidate.id === site.id);
            return target
              ? perform(target, road => creep.build(road), 3)
              : false;
          }
        }
      ];
    } else if (creep.memory.working && isLocalBuilder(creep)) {
      tasks = [
        {
          name: 'refill',
          run: () => {
            if (demandLane !== 'refill') return false;
            const target = getRefillTarget();
            return target ? deliverRefill(target) : false;
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
          name: 'build',
          run: () => {
            if (demandLane !== 'build') return false;
            const nonRoadSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
              filter: site => site.structureType !== STRUCTURE_ROAD
            });
            const extensionSites = nonRoadSites.filter(site =>
              site.structureType === STRUCTURE_EXTENSION);
            const tunnelSite = getSource2TunnelSite(creep.room);
            const roadSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
              filter: site => site.structureType === STRUCTURE_ROAD &&
                (!tunnelSite || site.id !== tunnelSite.id) &&
                isSingleLaneRoadPosition(creep.room, site)
            });
            const roadCrew = creep.room.find(FIND_MY_CREEPS, {
              filter: worker => worker.memory.role === 'builder'
            }).sort((a, b) => a.name.localeCompare(b.name))[0];
            const ownsRoadLane = roadCrew && roadCrew.name === creep.name &&
              roadSites.length > 0;
            const site = extensionSites.length > 0
              ? getBuildTarget(candidate =>
                candidate.structureType === STRUCTURE_EXTENSION)
              : nonRoadSites.length > 0
                ? getBuildTarget(candidate =>
                  candidate.structureType !== STRUCTURE_ROAD)
                : ownsRoadLane
                  ? getBuildTarget(candidate =>
                    candidate.structureType === STRUCTURE_ROAD &&
                    (!tunnelSite || candidate.id !== tunnelSite.id))
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
          run: () => {
            if (!controller || !controller.my) return false;
            if (controllerStation &&
                (creep.pos.x !== controllerStation.position.x ||
                  creep.pos.y !== controllerStation.position.y)) {
              moveCreep(creep, controllerStation.position, 0);
              creep.memory.taskTarget =
                `${controller.id} via ${controllerStation.position.x},` +
                `${controllerStation.position.y}`;
              return true;
            }
            return perform(controller,
              target => creep.upgradeController(target), 3);
          }
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
            return deliverRefill(target);
          }
        },
        {
          name: 'scavenge',
          run: scavenge
        },
        {
          name: 'upgrade',
          run: () => {
            if (!controller || !controller.my) return false;
            if (controllerStation &&
                (creep.pos.x !== controllerStation.position.x ||
                  creep.pos.y !== controllerStation.position.y)) {
              moveCreep(creep, controllerStation.position, 0);
              creep.memory.taskTarget =
                `${controller.id} via ${controllerStation.position.x},` +
                `${controllerStation.position.y}`;
              return true;
            }
            return perform(controller,
              target => creep.upgradeController(target), 3);
          }
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
              creep.memory.role === 'hauler' ||
              creep.memory.role === 'remote-hauler' ||
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
          return deliverRefill(target);
        }
      },
      {
        name: 'repair',
        run: () => {
          if (creep.memory.role === 'hauler' || !hasWorkParts(creep) ||
              demandLane !== 'repair') return false;
          const target = getRepairTarget();
          return target
            ? perform(target, structure => creep.repair(structure), 3)
            : false;
        }
      },
      {
        name: 'build',
        run: () => {
          if (creep.memory.role === 'hauler' || !hasWorkParts(creep) ||
              demandLane !== 'build') return false;
          const site = getBuildTarget();
          return site ? perform(site, target => creep.build(target), 3) : false;
        }
      },
      {
        name: 'stock-refill',
        run: () => creep.memory.role === 'hauler' &&
          demandLane === 'refill-buffer'
          ? storeEnergyInBuffer()
          : false
      },
      {
        name: 'store-storage',
        run: () => creep.memory.role === 'hauler' && demandLane === 'storage'
          ? storeEnergyInBuffer()
          : false
      },
      {
        name: 'store',
        run: () => creep.memory.role === 'hauler' && demandLane === 'buffer'
          ? storeEnergyInBuffer()
          : false
      },
      {
        name: 'stage-refill',
        run: stageAtRefill
      },
      {
        // A loaded carrier reaches buffer-stage only after every logistics
        // destination is satisfied. Spend that otherwise stranded load on the
        // controller, then return to hauling when empty.
        name: 'upgrade',
        run: () => {
          if (creep.memory.role !== 'hauler' ||
              demandLane !== 'buffer-stage' || !controller || !controller.my ||
              !hasWorkParts(creep) || creep.store[RESOURCE_ENERGY] <= 0) {
            return false;
          }
          return perform(controller,
            target => creep.upgradeController(target), 3);
        }
      },
      {
        name: 'stage-buffer',
        run: () => {
          if (creep.memory.role !== 'hauler' ||
              demandLane !== 'buffer-stage' || !controller) return false;
          const buffer = getRoomStructures(creep.room)
            .filter(structure =>
              structure.structureType === STRUCTURE_CONTAINER &&
              structure.pos.getRangeTo(controller) <= 3)
            .sort((a, b) => creep.pos.getRangeTo(a) -
              creep.pos.getRangeTo(b))[0];
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
        // Non-carrier mobile workers may fall back to the controller.
        name: 'upgrade',
        run: () => {
          if (creep.memory.role === 'hauler' ||
              demandLane !== 'upgrade' || !controller || !controller.my ||
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
          if (creep.memory.role === 'hauler' ||
              creep.memory.role === 'worker' || isLocalBuilder(creep)) {
            return false;
          }
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
          if (isLocalBuilder(creep) || creep.memory.role === 'worker') {
            const storedEnergy = getRoomStructures(creep.room).some(
              structure => canWithdrawFrom(creep, structure) &&
                getUnreservedEnergy(structure) > 0);
            if (storedEnergy) return false;
          }
          if (isBuilder(creep, 'local', 'tunnel')) {
            const source = getRoomSources(creep.room)[1];
            const sourceContainer = source &&
              getRoomStructures(creep.room).some(structure =>
                  structure.structureType === STRUCTURE_CONTAINER &&
                  source.pos.getRangeTo(structure) <= 2 &&
                  getUnreservedEnergy(structure) > 0
              );
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
            const storedEnergy = getRoomStructures(creep.room).some(
              structure => structure.structureType === STRUCTURE_CONTAINER &&
                getUnreservedEnergy(structure) > 0);
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
          const plannedCollectionSource = Game.getObjectById(demandPlan &&
            demandPlan.collectionSources[creep.name]);
          if (creep.memory.role === 'hauler' && demandLane === 'collect' &&
              container && plannedCollectionSource &&
              (plannedCollectionSource.structureType === STRUCTURE_STORAGE
                ? container.id !== plannedCollectionSource.id
                : plannedCollectionSource.pos.getRangeTo(container) > 2)) {
            container = null;
            delete creep.memory.withdrawTarget;
          }
          const controllerContainer = controllerStation &&
            getUnreservedEnergy(controllerStation.buffer) > 0
            ? controllerStation.buffer
            : controller && getRoomStructures(creep.room).find(structure =>
              structure.structureType === STRUCTURE_CONTAINER &&
              structure.pos.getRangeTo(controller) <= 3 &&
              getUnreservedEnergy(structure) > 0);
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
              const localSources = getRoomSources(creep.room);
              const assignedSource = Game.getObjectById(demandPlan &&
                demandPlan.collectionSources[creep.name]);
              candidates.sort((a, b) => {
                const aExact = assignedSource && a.id === assignedSource.id;
                const bExact = assignedSource && b.id === assignedSource.id;
                if (aExact !== bExact) return bExact - aExact;
                const aAssigned = assignedSource &&
                  assignedSource.pos.getRangeTo(a) <= 2;
                const bAssigned = assignedSource &&
                  assignedSource.pos.getRangeTo(b) <= 2;
                if (aAssigned !== bAssigned) return bAssigned - aAssigned;
                const aIsSource = localSources.some(source =>
                  source.pos.getRangeTo(a) <= 2);
                const bIsSource = localSources.some(source =>
                  source.pos.getRangeTo(b) <= 2);
                if (aIsSource !== bIsSource) return bIsSource - aIsSource;
                const aCapacity = a.store.getCapacity(RESOURCE_ENERGY) || 1;
                const bCapacity = b.store.getCapacity(RESOURCE_ENERGY) || 1;
                const aCritical = getUnreservedEnergy(a) / aCapacity >= 0.9;
                const bCritical = getUnreservedEnergy(b) / bCapacity >= 0.9;
                if (aCritical !== bCritical) return bCritical - aCritical;
                const pressure = getUnreservedEnergy(b) / bCapacity -
                  getUnreservedEnergy(a) / aCapacity;
                return pressure ||
                  creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b);
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
          rememberDispatchCommitment(container, amount);
          const result = creep.withdraw(container, RESOURCE_ENERGY);
          if (result === ERR_NOT_IN_RANGE) {
            const approach = getWithdrawalApproachTarget(creep, container,
              controllerStation);
            moveCreep(creep, approach,
              controllerStation && approach === controllerStation.position
                ? 0 : 1);
            creep.memory.taskTarget = container.id;
            return true;
          }
          if (result !== OK) {
            releaseAmount(reservedEnergy, container, amount);
            forgetDispatchCommitment(container);
            return false;
          }
          delete creep.memory.collectionSourceTarget;
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
    if (continueDispatchCommitment()) {
      creep.memory.task = `committed-${demandLane}`;
    } else if (creep.memory.role !== 'refiller' &&
        creep.memory.role !== 'rebalancer' &&
        (pickupNearbyDrop() || withdrawNearbyRuin() ||
          withdrawNearbyTombstone())) {
      creep.memory.task = 'scavenge';
    } else {
      for (const task of tasks) {
        if (task.run()) {
          creep.memory.task = task.name;
          break;
        }
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

    // A loaded local hauler never performs WORK and never gives up merely
    // because another carrier reserved its planned lane first. Try every
    // logistics receiver, then wait beside the controller buffer.
    if (!creep.memory.task && creep.memory.role === 'hauler' &&
        creep.store[RESOURCE_ENERGY] > 0) {
      if (storeEnergyInBuffer()) {
        creep.memory.task = 'store';
      } else {
        const fixedStores = getRoomStructures(creep.room)
          .filter(structure => demandLane === 'refill-buffer'
            ? isExtensionRefillBuffer(creep.room, structure)
            : structure === creep.room.storage ||
              structure.structureType === STRUCTURE_CONTAINER && controller &&
                structure.pos.getRangeTo(controller) <= 3)
          .sort((a, b) => creep.pos.getRangeTo(a) -
            creep.pos.getRangeTo(b));
        const fixedStore = fixedStores[0];
        if (fixedStore) {
          if (creep.pos.getRangeTo(fixedStore) > 1) {
            moveCreep(creep, fixedStore, 1);
          }
          creep.memory.task = 'stage-buffer';
          creep.memory.taskTarget = fixedStore.id;
        }
      }
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
          (isLocalBuilder(worker) || worker.memory.role === 'upgrader' ||
            worker.memory.role === 'worker') &&
          getUnreservedCapacity(worker) > 0 &&
          creep.pos.getRangeTo(worker) <= 1
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
      if (isBuilder(creep, 'local', 'tunnel')) {
        anchor = Game.getObjectById(creep.memory.builderTarget) ||
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
      ? getRoomSources(creep.room).findIndex(source => source.id === sourceId)
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
        'refill-load': 'Load',
        rebalance: 'Bal',
        repair: 'Fix',
        'supply-worker': 'Give',
        'await-supply': 'WaitE',
        'stage-supply': 'Stage',
        'stage-buffer': 'StageRC',
        'stock-refill': 'StockSp',
        'stage-refill': 'StageSp',
        'stage-collect': 'StageS',
        'committed-collect': 'Get',
        'committed-refill': 'Fill',
        'committed-refill-buffer': 'StockSp',
        'committed-buffer': 'StockRC',
        'committed-storage': 'Store',
        'committed-supply': 'Give',
        standby: 'Wait',
        withdraw: 'Get',
        store: 'Store',
        'store-storage': 'Store',
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

  const ownedRoomNames = new Set(Object.values(Game.rooms)
    .filter(room => room.controller && room.controller.my)
    .map(room => room.name));
  const ownedWorkTargets = Object.values(roomDemandPlans)
    .reduce((totals, plan) => ({
      buildTargets: totals.buildTargets +
        (plan.demand.buildTargets || 0),
      fixTargets: totals.fixTargets + (plan.demand.fixTargets || 0)
    }), { buildTargets: 0, fixTargets: 0 });
  const outpostWorkTargets = Object.values(Game.rooms)
    .filter(room => !ownedRoomNames.has(room.name))
    .reduce((totals, room) => ({
      buildTargets: totals.buildTargets + getRoomSites(room).length,
      fixTargets: totals.fixTargets + getRoomStructures(room)
        .filter(isOutpostRepairTarget).length
    }), { buildTargets: 0, fixTargets: 0 });
  updateDashboard(creeps, {
    localBuildTargets: ownedWorkTargets.buildTargets,
    outpostBuildTargets: outpostWorkTargets.buildTargets,
    localFixTargets: ownedWorkTargets.fixTargets,
    outpostFixTargets: outpostWorkTargets.fixTargets
  });
  drawDashboard();

  // Detailed task/target assignments are available on the slower diagnostic
  // cadence so the compact dashboard remains readable.
  if (Game.time % 100 === 0) {
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
    const outpostStatuses = Object.values(Game.rooms).filter(room =>
      !ownedRooms.has(room.name) && room.memory.roomStatus &&
      room.memory.roomStatus.kind === 'outpost').map(room => {
      const status = room.memory.roomStatus;
      return `  ${room.name} ${status.label} ${status.score}/100 | ` +
        `Reserve ${status.reserve} Harvest ${status.harvest} ` +
        `Flow ${status.logistics} | ${status.reasons.join(', ')}`;
    });
    if (outpostStatuses.length) {
      console.log(`[${Game.time}] Outpost health:\n${outpostStatuses.join('\n')}`);
    }
    for (const roomName of ownedRooms) {
      const room = Game.rooms[roomName];
      if (!room) continue;
      const { sourceWorkerTargets, sourceSpotTotal, minerLimit, workerLimit,
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
      const localSourceIds = new Set(getRoomSources(room).map(source =>
        source.id));
      const sourceWorkerCount = roomCreeps.filter(creep =>
        creep.memory.role === 'miner' &&
          localSourceIds.has(creep.memory.minerSource) ||
        creep.memory.role === 'harvester' &&
          (localSourceIds.has(creep.memory.preferredSource) ||
            localSourceIds.has(creep.memory.harvestSource) ||
            localSourceIds.has(creep.memory.sourceReplacement)) ||
        creep.memory.role === 'rebalancer' &&
          localSourceIds.has(creep.memory.rebalancerSource)).length;
      const haulerCount = roomCreeps.filter(creep => creep.memory.role === 'hauler').length;
      const refillerCount = roomCreeps.filter(creep =>
        creep.memory.role === 'refiller').length;
      const rebalancerCount = roomCreeps.filter(creep =>
        creep.memory.role === 'rebalancer').length;
      const localBuilders = roomCreeps.filter(isLocalBuilder);
      const builderCount = localBuilders.length;
      const repairBuilderCount = localBuilders.filter(creep =>
        creep.memory.builderMission === 'repair').length;
      const tunnelBuilderCount = localBuilders.filter(creep =>
        creep.memory.builderMission === 'tunnel').length;
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
      const sources = getRoomSources(room).map((source, index) => {
        const assignedWorkers = roomCreeps.filter(creep =>
          (creep.memory.role === 'miner' && creep.memory.minerSource === source.id) ||
          (creep.memory.role === 'harvester' &&
            creep.memory.preferredSource === source.id) ||
          (creep.memory.role === 'rebalancer' &&
            creep.memory.rebalancerSource === source.id)).length;
        const availability = source.energy > 0
          ? 'active'
          : `regenerates in ${source.ticksToRegeneration} ticks`;
        const state = source.energy > 0 ? '' : ` R${source.ticksToRegeneration}`;
        return `S${index + 1} ${assignedWorkers}/` +
          `${sourceWorkerTargets[source.id] || 0} ` +
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
          `Ha ${haulerCount} Rf ${refillerCount}/${situation.targets.refiller} ` +
          `Bal ${rebalancerCount}/${situation.targets.rebalancer} ` +
          `B ${builderCount} build${getBuilderTarget(room)} ` +
          `repair${repairBuilderCount} tunnel${tunnelBuilderCount} ` +
          `Idle ${idleCount} | ` +
          `Energy available ${room.energyAvailable} | max ${room.energyCapacityAvailable}`,
        `  ${sources.join(' | ') || 'No sources'}`,
        `  Build ${buildTargets.join(', ') || 'none'} | Roads ` +
          `${roadCount}+${roadSiteCount}/${roadBudget}` +
          `${roadsPaused(room) ? ' PAUSED@RCL2' : ''}`,
        expansionStatus,
        `  Sit ${situation.mode} Src${situation.targets.source} ` +
          `Ha${situation.targets.hauler} B${situation.targets.builder} ` +
          `repairB${situation.targets.repairBuilder} ` +
          `U${situation.targets.upgrader} ` +
          `tunnelB${situation.targets.tunnelBuilder} | ` +
          `Buf${Math.round(situation.signals.bufferRatio * 100)}% ` +
          `Drop${situation.signals.droppedEnergy} | stable-v1`,
        `  Health ${situation.status.label} ${situation.status.score}/100 | ` +
          `Reserve ${situation.status.reserve} ` +
          `Harvest ${situation.status.harvest} ` +
          `Flow ${situation.status.logistics} | ` +
          situation.status.reasons.join(', '),
        `  Busy ${room.memory.busySummaryStreak}/4${targetIncrease ? ` ${targetIncrease}` : ''} | ` +
          `Sp ${spawns.join(',') || 'none'} | ${status}`,
        `  Stage ${strategy.stageName}: ${strategy.stageGoal}`,
        `  Next: ${strategy.gate}`
      ].filter(Boolean).join('\n'));
    }
  }
};
