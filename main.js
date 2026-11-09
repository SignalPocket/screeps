const { getRoadBacklog } = typeof Game === 'undefined'
  ? require('./road.backlog') : require('road.backlog');
'use strict';

const { derivePopulationPolicy } = require('colony.policy');
const { getSpawnActivityStatus } = require('spawn.status');
const { createBodyFactory } = require('body.factory');
const { createResourceReservations } = require('resource.reservations');
const { createRoomIndex } = require('room.index');
const { createMovementService } = require('movement.service');
const { createRoadNetwork } = require('road.network');
const { drawRoadNetwork } = require('road.visuals');
const { createCreepLifecycle } = require('creep.lifecycle');
const { createCreepReporting, getTaskSpeech, getWaitSpeech, shortCreepName,
  shortRoles, shortTasks } = require('creep.reporting');
const { createSourceStaffing } = require('source.staffing');
const { createRoomStrategy } = require('room.strategy');
const { createSourcePositions } = require('source.positions');
const { deriveRoomStatus } = require('room.status');
const { createOutpostStatus } = require('outpost.status');
const { observeOutpostExport } = require('outpost.exports');
const { observeHaulTrip } = require('logistics.capacity');
const { harvestBatchFits, harvestSafely } = require('source.harvest');
const {planControllerRelief,reconcileControllerRelief,enforceUpgraderLimit}=require('role.capacity');
const {networkRecoveryNeeded,homePickupCandidates}=require('home.energy');
const {allocateBalancedWork}=require('work.balance');
const {planRepairSupply,exportableEnergy,runOutpostRepair,protectRepairAssignments,planRepairRelief}=require('repair.supply');
const {dispatchEmergencyRepairs}=require('outpost.rescue');
const {observeLabor,reconcileLaborBody,runBudgetedWork,runBudgetedUpgrade,selectUpgradeBudget,workRate,countForRate,profileRate,settle}=require('labor.capacity');
const { createRoomSituation } = require('room.situation');
const { updateRoomCombat, isActiveDefenseAssignment } = require('room.combat');
const { reconcileCombatObjectives, getObjectiveDefenderRequirements } =
  require('combat.objectives');
const { createWorkerLimits } = require('worker.limits');
const { getRoomStagePlan } = require('room.stages');
const { createRemoteHauling, isRoomBorder, selectHomeDeliveryTarget,
  shouldProbeRemoteVision } =
  require('remote.hauling');
const { createEnergyPhase } = require('energy.phase');
const { createEnergyStoreRegistry } = require('energy.store-registry');
const { createRoadPlanner } = require('road.planner');
const { createInfrastructurePlanner } = require('infrastructure.planner');
const { ownedInfrastructureRooms, createOwnedRoomInfrastructure } =
  require('infrastructure.progression');
const { createLandmarkFlags } = require('landmark.flags');
const { createOutpostMaintenance } = require('outpost.maintenance');
const { placeRemoteContainerSite } = require('remote.container-placement');
const { createMemoryMaintenance } = require('memory.maintenance');
const { createCreepNaming } = require('creep.naming');
const { createColonyDashboard } = require('colony.dashboard');
const { collectColonyWorkMetrics } = require('colony.work-metrics');
const { summarizeRoomHealth } = require('health.reporting');
const { calculateSourceCoverageGap, updateOperationalHealth } =
  require('health.operations');
const { scaleEnergyBudget } = require('room.scaling');
const { deriveCpuPolicy, shouldRenderPlanningVisuals,
  shouldPrepareRoadPlan, selectDispatchPlanningCreeps,
  selectFairExecutionCreeps,
  summarizeCreepExecution } =
  require('cpu.policy');
const { PLANNING_STAGES, OBSERVATION_STAGES, ROOM_POLICY_STAGES,
  createCpuStageRecorder, updateCpuPerformanceWindow } =
  require('cpu.telemetry');
const { createWaitAgeTracker } = require('wait.age');
const { snapshotExecutionOrder, sortTaskRecords, sortExecutionRecords } =
  require('creep.execution-order');
const { getOperationScope, retireCompletedPush, isBrigadePlanActive,
  finalizeOperationPolicy, adoptBalancers, adoptDefenders, reactivateDefenders,
  adoptSurplusHaulerForLink } =
  require('colony.operations');
const { planReservationSpawn, runReservation } = require('remote.reservation');
const { classifyColonyScenarios, reconcileScenarioRecords } =
  require('colony.scenarios');
const { applyScenarioPolicy } = require('scenario.policy');
const { buildSourceGroups, selectSourceGroup, selectPassingSourceBuffer } =
  require('source.collection');
const { createRefillManagement } = require('refill.management');
const { refillRetentionSituation, recoverSpawnFiller, selectSupplyRecipient,
  totalSupplyDemand, selectParkingCandidates } = require('park.recovery');
const { createSpawnPolicy } = require('spawn.policy');
const { authorizeSpawnAssignment } = require('spawn.authority');
const { describeSpawnAttempt, recordSpawnDenials } = require('spawn.denial');
const { createTaskReservations } = require('task.reservations');
const { createWorkDispatch, executeReservedWithdrawal, collectPartialHauler,
  recoverBlockedWork } = require('work.dispatch');
const { planPickupJobs } = require('pickup.jobs');
const { planRefillTargets } = require('refill.dispatch');
const { planControllerStations } = require('controller.stations');
const { CONTROLLER_BRIGADE_ROLE, CONTROLLER_BRIGADE_SIZE,
  CONTROLLER_BRIGADE_PLAN_VERSION,
  CONTROLLER_BRIGADE_REPLACEMENT_LEAD,
  createControllerBrigade } = require('controller.brigade');
const { evaluateControllerBrigadeReadiness,
  selectControllerBrigadeReplacementMode,
  shouldRestoreBrigadeBeforeRemoteDefense,
  shouldDeferRemoteDefenseForHomeRecovery } =
  require('controller.brigade.readiness');
const { planSalvageAssignments } = require('salvage.dispatch');
const { planSourceRecovery } = require('source.recovery');
const { planSourceAssignments } = require('source.assignment');
const { createConstructionPriority } = require('construction.priority');
const { getPopulationLimit, getCapabilityTransitionAllowance,
  getRequiredPopulationTransitionAllowance, selectRetirementCandidates } =
  require('population.control');
const { selectHealingTower, runTowers } = require('tower.control');
const { getDefenseTargets, selectCombatTarget, needsEmergencyDefender, selectUndefendedThreat,
  holdMeleeEngagement,
  collectFriendlyDamageEvents, updateWarState, getDefenseRoomNames,
  getOutpostPresenceGap, selectDefenderGarrison,
  createDefenseController } =
  require('defense.control');
const { createOutpostPlanning } = require('outpost.planning');
const { reconcileRemoteHaulerRosters, reconcileRemoteMinerRosters } =
  require('remote.roster');
const { createExpansionPlanner } = require('expansion.planner');
const { planBootstrapSpawn, selectBootstrapWork } = require('bootstrap.workforce');
const { createRemoteCorridorPlanner } = require('remote.corridors');
const { createRcl5Infrastructure } = require('rcl5.infrastructure');
const { createStaffingPlanner } = require('staffing.plan');
const { createMinimumSpawnPlanner } = require('minimum.spawn');
const { selectBalancedRecoveryRequest } = require('recovery.balance');
const { createRemoteSpawnPlanner } = require('remote.spawn');
const { ownedTarget, reconcileOwnedRoomTransitions } =
  require('owned.room.transition');
const { planRemoteRecovery } = require('remote.recovery');
const { createBuilderRoster } = require('builder.roster');
const { BODY_TYPES, getBodyTypeForAssignment, reconcileBodyTypes,
  deriveBodyTargets, buildBodyRoster, canBodyTypeRunLane } =
  require('body.archetypes');
const { reconcileCreepAssignments } = require('creep.assignment');
const { enforceAssignmentContract, contractForSpawnAssignment } =
  require('assignment.contract');
const { normalizeBuilderMemory, isBuilder, isLocalBuilder,
  isOutpostBuilder, isExpansionBuilder } = require('builder.roles');
const { selectRebalancerSurplus, getWithdrawalApproachTarget,
  selectRebalanceTarget, isRebalanceReviewDue,
  selectLogisticsReliefWorkers, selectBufferLane, getBrigadeIntakeDemand,
  deliverStagedEnergy } =
  require('creep.routing');

const { workerCost, routineBodyEnergyCap, buildBody, getBodyCode } = createBodyFactory({
  WORK, CARRY, MOVE, ATTACK, RANGED_ATTACK, HEAL, CLAIM, TOUGH,
  BODYPART_COST
});

/**
 * Run one complete colony control cycle.
 *
 * The order matters:
 *   1. normalize memory and bodies;
 *   2. observe each room and derive one population policy;
 *   3. plan staffing, spawning, remote work, infrastructure, and exact jobs;
 *   4. execute towers, brigade relays, logistics, and WORK actions;
 *   5. record health, dashboard, and human-readable task evidence.
 *
 * Policy decides how much work is authorized. Group planners decide who owns
 * each lane and object. The per-creep executor below carries out that plan and
 * may only use bounded fallback work when its planned object becomes invalid.
 * See docs/runtime-walkthrough.md for the narrative version of this loop.
 */
module.exports.loop = function () {
  if (!Memory.creeps) Memory.creeps = {};
  const cpuStart = Game.cpu && typeof Game.cpu.getUsed === 'function'
    ? Game.cpu.getUsed() : null;
  const cpuStages = createCpuStageRecorder(cpuStart === null ? null
    : () => Game.cpu.getUsed());
  const cpuPolicy = deriveCpuPolicy(Game.cpu && Game.cpu.bucket);
  const allowSlowPlanning = cpuPolicy.allowSlowPlanning;
  const previousCpuExecution = Memory.cpuPolicy && Memory.cpuPolicy.execution;
  Memory.cpuPolicy = { updated: Game.time, ...cpuPolicy };
  // The local engine is terminating the script after the bucket reaches zero,
  // which prevents even the recovery scheduler from running. Yield before any
  // broad scans at the last 250 bucket points so a later tick can resume the
  // normal recovery policy instead of extending an empty-bucket outage.
  if (cpuPolicy.mode === 'recovery' && Game.cpu.bucket < 250) return;
  const tickCreeps = Object.values(Game.creeps);
  const tickRooms = Object.values(Game.rooms);
  const warEvents = collectFriendlyDamageEvents(tickCreeps);
  for (const room of tickRooms) {
    const targets = getDefenseTargets(room, FIND_HOSTILE_CREEPS,
      FIND_HOSTILE_STRUCTURES);
    const combat = updateRoomCombat(room, Game.time, targets);
    if (combat.fighting) warEvents.push({ hostile: true, roomName: room.name });
  }
  for (const creep of tickCreeps) {
    if (isActiveDefenseAssignment(creep, Game.rooms)) {
      creep.memory.role = 'defender';
      creep.memory.assignmentRole = 'defender';
    }
  }
  updateWarState(Memory, Game.time, warEvents);
  retireCompletedPush(Game);
  for (const creep of tickCreeps) {
    if (creep.memory.role === 'remote-scout') {
      creep.memory.role = 'remote-miner';
      creep.memory.birthRole = creep.memory.birthRole === 'remote-scout'
        ? 'remote-miner' : creep.memory.birthRole;
      creep.memory.assignmentRole = 'remote-miner';
    }
    enforceAssignmentContract(creep);
    observeOutpostExport({ tick: Game.time, roomName: creep.room.name,
      energy: creep.store[RESOURCE_ENERGY] || 0, memory: creep.memory,
      homeMemory: Memory.rooms && Memory.rooms[
        creep.memory.remoteHome || creep.memory.home] });
  }
  // Outpost staffing is derived from visible sources, construction, route
  // distance, and container pressure. Unseen discovery starts with one miner.
  const showTrafficHeatmap = false;
  // Recovery favors getting a functional body onto the map. The adaptive
  // wait still gives healthy rooms time to charge larger bodies, but a deep
  // population deficit no longer leaves the spawn idle for 15-30 ticks.
  const REFILLER_MAX_CHARGE_WAIT = 15;
  const MAX_SPAWN_CHARGE_WAIT = 20;
  const { prepareSpawnRequest, clearSpawnWait } = createSpawnPolicy({
    Game, buildBody, CARRY, WORK, MOVE,
    refillerMaxChargeWait: REFILLER_MAX_CHARGE_WAIT,
    maxSpawnChargeWait: MAX_SPAWN_CHARGE_WAIT,
    minSpawnChargeWait: 3,
    emergencyBodyEnergyRatio: 0.5,
    recoveryBodyEnergyRatio: 0.65,
    minimumRecoveryBodyEnergy: 300
  });
  const roadsPaused = room => !room.controller || room.controller.level <= 2;
  const roomScheduleOffset = roomName => [...roomName]
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  const scheduledRoomTick = (room, interval, phase = 0) =>
    (Game.time + roomScheduleOffset(room.name) + phase) % interval === 0;
  const scheduledGlobalTick = (interval, phase = 0) =>
    (Game.time + phase) % interval === 0;
  const renderPlanningVisuals = shouldRenderPlanningVisuals({
    tick: Game.time, allowSlowPlanning
  });
  const { getRoomSources, getRoomStructures, getRoomStructuresByType,
    getRoomSites, getRoomSitesByType, getRoomCreeps,
    getRoomTombstones, getSlowWorkInventory } = createRoomIndex({ Game,
    FIND_SOURCES, FIND_STRUCTURES, FIND_MY_CONSTRUCTION_SITES, FIND_MY_CREEPS,
    FIND_TOMBSTONES });
  observeLabor({Game,getStructures:getRoomStructures,resource:RESOURCE_ENERGY});
  // Spawn, extension, and tower membership is stable for this tick. Build one
  // shared list from the room index and let every filler read live capacity
  // from the same objects instead of repeating structure searches.
  const roomRefillStructureLists = {};
  const getRoomRefillStructures = room => {
    if (!roomRefillStructureLists[room.name]) {
      roomRefillStructureLists[room.name] = [
        ...getRoomStructuresByType(room, STRUCTURE_TOWER),
        ...getRoomStructuresByType(room, STRUCTURE_SPAWN),
        ...getRoomStructuresByType(room, STRUCTURE_EXTENSION)
      ].filter(structure => structure.my);
    }
    return roomRefillStructureLists[room.name];
  };
  const landmarkFlags = createLandmarkFlags({
    Game, FIND_SOURCES, FIND_STRUCTURES, STRUCTURE_CONTAINER,
    COLOR_BLUE, COLOR_CYAN, COLOR_GREEN, COLOR_YELLOW, COLOR_ORANGE,
    COLOR_PURPLE, COLOR_WHITE
  });
  if (allowSlowPlanning) {
    for (const room of tickRooms) {
      if (!room.controller || !room.controller.my) continue;
      if (!room.memory.landmarkFlags ||
          scheduledRoomTick(room, 100, 11)) landmarkFlags.reconcile(room);
      else landmarkFlags.recover(room);
    }
  }
  const { refreshRoomOrdinals, getRoomOrdinal, getBirthName } =
    createCreepNaming({ Game, Memory, getRoomSources });
  if (!Memory.roomOrdinals || scheduledGlobalTick(100, 7)) {
    refreshRoomOrdinals();
  }
  const { getSourceSpotCount, getSourceMinerMinimum, getSourceBodyWorkCapacity,
    reviewSourceStaffing, getSourceWorkerTargets, assignUnallocatedRoles } =
    createSourceStaffing({
    Game, getRoomSources, TERRAIN_MASK_WALL, LOOK_STRUCTURES,
    LOOK_CONSTRUCTION_SITES, STRUCTURE_ROAD, OBSTACLE_OBJECT_TYPES,
    BODYPART_COST, CARRY,
    MOVE, WORK, ENERGY_REGEN_TIME, HARVEST_POWER
  });
  const { getRoomStrategy: calculateRoomStrategy } = createRoomStrategy({
    Game, getRoomSources, getRoomStagePlan, FIND_STRUCTURES, FIND_MY_SPAWNS,
    FIND_MY_STRUCTURES, STRUCTURE_ROAD, STRUCTURE_TOWER
  });
  const roomStrategyCache = {};
  const getRoomStrategy = room => {
    if (!roomStrategyCache[room.name]) {
      roomStrategyCache[room.name] = calculateRoomStrategy(room);
    }
    return roomStrategyCache[room.name];
  };
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
  const waitAge = createWaitAgeTracker(Game.time);
  const { moveCreep: rawMoveCreep } = createMovementService({ Game, Room, FIND_STRUCTURES,
    FIND_MY_CONSTRUCTION_SITES, FIND_MY_CREEPS,
    FIND_HOSTILE_CREEPS: typeof FIND_HOSTILE_CREEPS === 'undefined'
      ? undefined : FIND_HOSTILE_CREEPS,
    STRUCTURE_ROAD, STRUCTURE_EXTENSION,
    OBSTACLE_OBJECT_TYPES: typeof OBSTACLE_OBJECT_TYPES === 'undefined'
      ? [] : OBSTACLE_OBJECT_TYPES,
    TERRAIN_MASK_WALL: typeof TERRAIN_MASK_WALL === 'undefined'
      ? 1 : TERRAIN_MASK_WALL,
    ATTACK: typeof ATTACK === 'undefined' ? undefined : ATTACK,
    RANGED_ATTACK: typeof RANGED_ATTACK === 'undefined'
      ? undefined : RANGED_ATTACK,
    OK, ERR_INVALID_TARGET, ERR_TIRED });
  const moveCreep = waitAge.wrapMovement(rawMoveCreep, ERR_TIRED);
  const { findFleeStep } = createDefenseController({
    PathFinder, FIND_STRUCTURES, FIND_CREEPS, OBSTACLE_OBJECT_TYPES,
    STRUCTURE_ROAD, STRUCTURE_RAMPART
  });
  const { hasWorkParts, hasRoadMobility, hasBuilderBody,
    getRemoteReplacementLead,
    hasRemoteReplacementLife, hasLocalReplacementLife } =
    createCreepLifecycle({ Game, WORK, MOVE, CREEP_SPAWN_TIME });
  const { buildRoomStaffingPlan } = createStaffingPlanner({
    Game, isBuilder, isLocalBuilder, hasWorkParts,
    hasLocalReplacementLife, hasRemoteReplacementLife, getRoomSources
  });
  const { planMinimumSpawn } = createMinimumSpawnPlanner({
    getRoomSources, getSource2TunnelSite, hasBuilderBody
  });
  const { getObjectLabel, formatTaskTarget, logDeadCreeps } =
    createCreepReporting({ Game, getRoomSources, STRUCTURE_CONTAINER });
  logDeadCreeps(Memory.creeps);
  reconcileBodyTypes(tickCreeps, { WORK, CARRY, CLAIM, ATTACK });
  // Brigade slot identity is permanent for this experiment. Generic role
  // balancing must not absorb a tiny relay body into the ordinary hauler pool.
  for (const creep of tickCreeps) {
    if (creep.memory.birthRole === CONTROLLER_BRIGADE_ROLE &&
        Number.isInteger(creep.memory.controllerRelaySlot)) {
      creep.memory.role = CONTROLLER_BRIGADE_ROLE;
    }
  }
  // Source reservations are durable capabilities, not a one-tick role hint.
  // Reassert them before assignment cleanup; otherwise cleanup sees the old
  // builder role, deletes sourceReserve, and causes the same conversion and
  // console message again on every tick.
  for (const creep of tickCreeps) {
    if (!creep.memory.sourceReserve || creep.memory.remoteRoom) continue;
    creep.memory.role = 'harvester';
    creep.memory.preferredSource = creep.memory.sourceReserve;
  }
  reconcileCreepAssignments(tickCreeps);
  for(const creep of tickCreeps)reconcileLaborBody(creep);
  const towerStatuses = runTowers({
    rooms: tickRooms, RESOURCE_ENERGY, FIND_MY_STRUCTURES,
    FIND_HOSTILE_CREEPS, FIND_MY_CREEPS, FIND_STRUCTURES, STRUCTURE_TOWER,
    STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_WALL, STRUCTURE_RAMPART,
    ATTACK, RANGED_ATTACK, HEAL, WORK, CLAIM
  });
  cpuStages.mark('combat');
  const getDefenseThreats = homeRoomName => {
    const home = Game.rooms[homeRoomName];
    const roomNames = getDefenseRoomNames(homeRoomName,
      home && home.memory, tickCreeps);
    const threats = [...roomNames].flatMap(roomName => {
      const room = Game.rooms[roomName];
      return room ? getDefenseTargets(room, FIND_HOSTILE_CREEPS,
        FIND_HOSTILE_STRUCTURES).map(creep => ({
        creep, roomName, homeRoomName,
        requiredDefenders: room.memory.combatStatus.requiredDefenders
      })) : [];
    });
    const objectiveThreats = home ? reconcileCombatObjectives({
      homeRoom: home, Game,
      getTargets: room => getDefenseTargets(room, FIND_HOSTILE_CREEPS,
        FIND_HOSTILE_STRUCTURES),
      invaderCoreType: STRUCTURE_INVADER_CORE
    }) : [];
    for (const threat of objectiveThreats) {
      if (!threats.some(existing => existing.roomName === threat.roomName &&
          existing.creep.id === threat.creep.id)) threats.push(threat);
    }
    updateWarState(Memory, Game.time, threats.map(threat => ({
      hostile: true, roomName: threat.roomName,
      homeRoomName: threat.homeRoomName
    })));
    return threats;
  };
  const postBattleSalvageRooms = new Set(tickRooms
    .filter(room => {
      const status = towerStatuses[room.name];
      if (status && status.hostileCount > 0) return false;
      return getRoomTombstones(room).some(tombstone => {
        const fallen = tombstone.creep;
        const owner = fallen && fallen.owner && fallen.owner.username;
        const name = fallen && fallen.name || '';
        return owner === 'Invader' || /^invader_/i.test(name);
      });
    }).map(room => room.name));
  const getRefillPriority = (room, structure, creep) => {
    if (structure.structureType === STRUCTURE_TOWER) {
      const capacity = structure.store.getCapacity(RESOURCE_ENERGY) || 1;
      // Every incomplete tower outranks the spawn network. Within that tier,
      // send energy to the emptiest tower first so one charged tower cannot
      // hide an empty partner after an attack.
      return structure.store[RESOURCE_ENERGY] / capacity;
    }
    // Spawn and extensions form one energy network. Once tower emergencies
    // are satisfied, distance—not structure type—selects the next target.
    return 1;
  };
  const { reconcileBuilderRosters } = createBuilderRoster({
    Game, normalizeBuilderMemory, hasBuilderBody, isOutpostBuilder
  });
  if (scheduledGlobalTick(10, 3)) {
    reconcileBuilderRosters(tickRooms);
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
    Game, creeps: tickCreeps, derivePopulationPolicy, deriveRoomStatus,
    getRoomSources, buildBody,
    getRoomStructures, getSlowWorkInventory, getSourceBodyWorkCapacity,
    getSourceSpotCount, getSource2TunnelSite, hasLocalReplacementLife,
    isMaintainedRoad: (room, structure) =>
      isHeatmapRoadPosition(room, structure),
    isMaintainedContainer: (room, structure) =>
      Boolean(getContainerPurpose(room, structure.pos)),
    getContainerPurpose: (room, position) =>
      getContainerPurpose(room, position),
    roadsPaused, STRUCTURE_CONTAINER, STRUCTURE_ROAD, STRUCTURE_WALL,
    STRUCTURE_RAMPART, STRUCTURE_EXTENSION, STRUCTURE_SPAWN,
    RESOURCE_ENERGY, TERRAIN_MASK_WALL, LOOK_STRUCTURES,
    OBSTACLE_OBJECT_TYPES, FIND_DROPPED_RESOURCES,
    FIND_MY_CONSTRUCTION_SITES, FIND_SOURCES, FIND_MY_SPAWNS,
    ENERGY_REGEN_TIME, HARVEST_POWER, CREEP_SPAWN_TIME
  });
  const getBuilderTarget = room => getRoomSituation(room).targets.builder;
  const isControllerBrigadeBudgeted = room => {
    const readiness = room.memory.controllerBrigadeReadiness;
    if (readiness && readiness.replacementMode === 'maintenance') return true;
    if (!isBrigadePlanActive(room)) return false;
    const policy = getRoomSituation(room).policy;
    return Boolean(readiness &&
      (policy.permissions && policy.permissions.controllerBrigade &&
        readiness.ready || readiness.replacementMode === 'maintenance'));
  };
  const getActiveControllerBrigadeCount = (room, workers) =>
    (workers || tickCreeps).filter(creep =>
      creep.memory.home === room.name &&
      creep.memory.role === CONTROLLER_BRIGADE_ROLE).length;
  const getPopulationTransitionAllowance = (room, workers,
    knownWorkerLimit) => {
    const roomWorkers = (workers || tickCreeps).filter(creep =>
      creep.memory.home === room.name);
    const situation = getRoomSituation(room);
    const remote = situation.policy.remote || {};
    const remoteBudget = (remote.miners || 0) + (remote.haulers || 0) +
      (remote.builders || 0) + (remote.reservers || 0);
    const activeRemote = roomWorkers.filter(creep =>
      creep.memory.role === 'remote-miner' ||
      creep.memory.role === 'remote-hauler' ||
      creep.memory.role === 'remote-reserver' || isOutpostBuilder(creep)).length;
    const retiring = roomWorkers.filter(creep =>
      creep.memory.staffingRetire || creep.memory.role === 'retire').length;
    const activeExpansion = roomWorkers.filter(isExpansionBuilder).length +
      roomWorkers.filter(creep => creep.memory.role === 'claimer' &&
        creep.memory.expansionTarget).length;
    const expansion = room.memory.expansionPlan;
    let expansionTarget = 0;
    if (expansion && expansion.status === 'claim-ready' &&
        situation.policy.permissions.expansion) expansionTarget = 1;
    if (expansion && expansion.status === 'bootstrap' &&
        situation.policy.permissions.expansionMaintenance) {
      expansionTarget = Math.max(1, Math.min(3,
        Math.ceil(room.energyCapacityAvailable / 600)));
    }
    const staffingPlan = buildRoomStaffingPlan(room, roomWorkers,
      situation.policy);
    const recoveryTargets = {};
    if (situation.policy.permissions &&
        situation.policy.permissions.remoteHaulingRecovery) {
      recoveryTargets.remoteHauler = situation.policy.remote.haulers;
    }
    const ordinaryCapabilityTransition = getCapabilityTransitionAllowance(
      staffingPlan.jobs, recoveryTargets, 4);
    const baselineCapabilityTransition = staffingPlan.baseline
      ? Object.values(staffingPlan.baseline.coverage)
        .filter(count => count < 1).length : 0;
    const operationWork = situation.policy.operations && situation.policy.operations.upgradePush
      ? situation.policy.operations.upgradeWork : 0;
    const qualityAllowance = operationWork && (roomWorkers.some(c => c.memory.qualityFor) ||
      planControllerRelief({ room, workers: roomWorkers, viable: hasLocalReplacementLife,
        operationWork })) ? 1 : 0;
    const capabilityTransition = Math.max(ordinaryCapabilityTransition,
      baselineCapabilityTransition) + qualityAllowance;
    const retainedAllowance = Math.max(0, activeRemote - remoteBudget) +
      retiring + Math.max(activeExpansion, expansionTarget);
    const workerLimit = knownWorkerLimit == null
      ? getWorkerLimits(room).workerLimit : knownWorkerLimit;
    const corePopulation = Math.max(0, roomWorkers.length -
      getActiveControllerBrigadeCount(room, roomWorkers));
    return getRequiredPopulationTransitionAllowance(workerLimit,
      corePopulation, capabilityTransition, retainedAllowance);
  };
  const { getWorkerLimits } = createWorkerLimits({
    Game, getRoomSources, getRoomCreeps, getSourceWorkerTargets,
    getRoomSituation, LOOK_STRUCTURES, LOOK_CONSTRUCTION_SITES,
    OBSTACLE_OBJECT_TYPES, STRUCTURE_ROAD, STRUCTURE_RAMPART,
    TERRAIN_MASK_WALL
  });
  const getBodyRosterPlan = (room, workers) => {
    const situation = getRoomSituation(room);
    const jobs = buildRoomStaffingPlan(room, workers,
      situation.policy).jobs;
    const expansion = room.memory.expansionPlan;
    const allowRemoteGrowth = Boolean(situation.policy.permissions &&
      situation.policy.permissions.remoteGrowth);
    const allowRemoteHaulingRecovery = Boolean(
      situation.policy.permissions &&
      situation.policy.permissions.remoteHaulingRecovery);
    const claimerTarget = situation.policy.permissions &&
      situation.policy.permissions.expansion && expansion &&
      expansion.status === 'claim-ready'
      ? 1 : 0;
    const targets = deriveBodyTargets({
      localMinerMin: jobs.source.min,
      localMinerDesired: jobs.source.desired,
      refillerMin: jobs.refiller.min,
      refillerDesired: jobs.refiller.desired,
      remoteCarrierMin: jobs.remoteHauler.min,
      remoteCarrierDesired: allowRemoteGrowth || allowRemoteHaulingRecovery
        ? jobs.remoteHauler.desired : jobs.remoteHauler.min,
      haulerMin: jobs.hauler.min,
      haulerDesired: jobs.hauler.desired,
      rebalancerMin: jobs.rebalancer.min,
      rebalancerDesired: jobs.rebalancer.desired,
      upgraderMin: jobs.upgrader.min,
      upgraderDesired: jobs.upgrader.desired,
      builderMin: jobs.builder.min,
      builderDesired: jobs.builder.desired,
      repairMin: jobs.repairBuilder.min,
      repairDesired: jobs.repairBuilder.desired,
      tunnelMin: jobs.tunnelBuilder.min,
      tunnelDesired: jobs.tunnelBuilder.desired,
      remoteBuilderMin: jobs.remoteBuilder.min,
      remoteBuilderDesired: allowRemoteGrowth
        ? jobs.remoteBuilder.desired : jobs.remoteBuilder.min,
      remoteMinerMin: jobs.remoteMiner.min,
      remoteMinerDesired: jobs.remoteMiner.desired,
      claimerMin: claimerTarget,
      claimerDesired: claimerTarget
    });
    const roster = buildBodyRoster(workers, targets,
      { WORK, CARRY, CLAIM }, creep => creep.spawning ||
        hasLocalReplacementLife(creep));
    room.memory.bodyRosterPlan = {
      updated: Game.time,
      counts: roster.counts,
      viable: roster.viable,
      targets,
      next: roster.shortages.find(entry => entry.count < entry.min) ||
        roster.shortages.find(entry => entry.count < entry.desired) || null
    };
    return room.memory.bodyRosterPlan;
  };
  const { updateDashboard } = createColonyDashboard({
    Game, Memory, getWorkerLimits, getRoomSituation, getRoomStructures,
    shortRoles, buildRoomStaffingPlan,
    maxSpawnWait: MAX_SPAWN_CHARGE_WAIT, RESOURCE_ENERGY, STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION, FIND_DROPPED_RESOURCES
  });
  const { getRemoteResourceSummary, rankRemoteDispatchRooms,
    getRemoteHaulReadiness, getRemoteHaulerTarget } =
    createRemoteHauling({
      Game, PathFinder, buildBody, FIND_SOURCES, FIND_STRUCTURES,
      FIND_MY_SPAWNS, STRUCTURE_CONTAINER, RESOURCE_ENERGY, CARRY,
      CARRY_CAPACITY, ENERGY_REGEN_TIME, hasRemoteReplacementLife
    });
  const { getPlans: getRemoteSpawnPlans, planMinimumRemoteSpawn,
    planRemoteGrowthSpawn, planRemoteMinerReplacement } =
    createRemoteSpawnPlanner({
      isOutpostBuilder, hasRemoteReplacementLife,
      getRemoteHaulReadiness, getRemoteReplacementLead,
      isOwnedRoom: roomName => ownedTarget(Game, roomName),
      BODYPART_COST, WORK, CARRY, MOVE
    });
  const { updateEnergyWorkPhase } = createEnergyPhase({ Game, workerCost });
  const { getImportantRoadPaths, isSingleLaneRoadPosition,
    getImportantTravelPaths, getInterRoomTravelPaths,
    getConvergedTravelPaths, getControllerFanPaths,
    getInfrastructureServicePaths,
    getInfrastructureRoadPaths,
    getHeatmapRoadTiles, isHeatmapRoadPosition,
    updateTrafficHeatmap,
    drawRoadPlan, drawTravelPaths, drawInterRoomRoadLinks,
    getRoadBudget, placeRoadSite } =
    createRoadPlanner({
    Game, RoomPosition, scheduledRoomTick, getRoomSources, getRoomCreeps,
    showTrafficHeatmap, FIND_MY_SPAWNS, FIND_STRUCTURES,
    FIND_MY_CONSTRUCTION_SITES, STRUCTURE_ROAD, STRUCTURE_CONTAINER,
    STRUCTURE_LINK, STRUCTURE_STORAGE, STRUCTURE_TOWER, STRUCTURE_RAMPART,
    LOOK_STRUCTURES,
    LOOK_CONSTRUCTION_SITES, TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP, OK
  });
  const { isExtensionClusterTile, placeStorageSite,
    getContainerPurpose, refreshContainerPurposes,
    isExtensionRefillBuffer, placeSourceContainerSite,
    manageExtensionContainer, manageControllerContainer,
    placeBorderRelaySite, placeOutpostBorderCacheSite,
    isRetiringContainer } = createInfrastructurePlanner({
    Game, RoomPosition, getRoomSources, isSingleLaneRoadPosition,
    CONTROLLER_STRUCTURES, STRUCTURE_EXTENSION, STRUCTURE_CONTAINER,
    STRUCTURE_STORAGE, STRUCTURE_ROAD, STRUCTURE_RAMPART, FIND_MY_STRUCTURES,
    FIND_MY_CONSTRUCTION_SITES, FIND_MY_SPAWNS, FIND_STRUCTURES,
    TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP, LOOK_STRUCTURES,
    LOOK_CONSTRUCTION_SITES, LOOK_CREEPS, RESOURCE_ENERGY, OK
  });
  const { getRegistry: getEnergyStoreRegistry,
    getRemoteDeliveryStores } = createEnergyStoreRegistry({
      Game, getRoomSources, getRoomStructures, getContainerPurpose,
      STRUCTURE_CONTAINER, STRUCTURE_STORAGE
    });
  const { getMissingSlot: getMissingControllerBrigadeSlot,
    reconcileRealOverlaps: reconcileControllerBrigadeOverlaps,
    reconcileSubstitutes: reconcileControllerBrigadeSubstitutes,
    buildPlan: buildControllerBrigadePlan,
    run: runControllerBrigade } = createControllerBrigade({
    Game, RoomPosition, RESOURCE_ENERGY, OK, ERR_NOT_IN_RANGE,
    LOOK_STRUCTURES, LOOK_CONSTRUCTION_SITES, OBSTACLE_OBJECT_TYPES,
    STRUCTURE_CONTAINER, STRUCTURE_LINK,
    STRUCTURE_ROAD, TERRAIN_MASK_WALL, getRoomStructures,
    getContainerPurpose, moveCreep
  });
  const controllerBrigadePlans = {};
  const getControllerBrigadePlan = room => {
    if (!(room.name in controllerBrigadePlans)) {
      const savedPlan = room.memory.controllerBrigadePlan;
      const retiringContainerId = room.memory.controllerContainerPlan &&
        room.memory.controllerContainerPlan.retireContainerId;
      const pairPlan = room.memory.controllerContainerPairPlan;
      const secondaryReady = pairPlan && pairPlan.secondaryId &&
        Game.getObjectById(pairPlan.secondaryId);
      const savedPlanValid = savedPlan &&
        savedPlan.version === CONTROLLER_BRIGADE_PLAN_VERSION &&
        !savedPlan.provisional &&
        savedPlan.roomName === room.name &&
        savedPlan.storageId === (room.storage && room.storage.id) &&
        (!secondaryReady || savedPlan.stationary) &&
        savedPlan.controllerBufferId !== retiringContainerId &&
        Game.getObjectById(savedPlan.controllerBufferId) &&
        (!Array.isArray(savedPlan.controllerBufferIds) ||
          savedPlan.controllerBufferIds.every(id => Game.getObjectById(id))) &&
        Array.isArray(savedPlan.segments) &&
        (savedPlan.stationary && savedPlan.segments.length >= 16 &&
          savedPlan.segments.length <= CONTROLLER_BRIGADE_SIZE ||
          savedPlan.targetSize === CONTROLLER_BRIGADE_SIZE &&
          savedPlan.segments.length === 8) &&
        savedPlan.segments.every(segment => segment.distance <= 3);
      controllerBrigadePlans[room.name] = savedPlanValid
        ? savedPlan : buildControllerBrigadePlan(room);
      if (controllerBrigadePlans[room.name]) {
        room.memory.controllerBrigadePlan = controllerBrigadePlans[room.name];
      }
    }
    return controllerBrigadePlans[room.name];
  };
  const { getSourceLink, isControllerLink: isRcl5ControllerLink,
    isExtensionLink: isRcl5ExtensionLink,
    placeLinkSite, placeTowerSite, runLinks,
    selectControllerLinkHandoff, selectControllerLinkFeed } =
    createRcl5Infrastructure({
      Game, getRoomSources, getRoomStructures, getRoomStructuresByType,
      getRoomSitesByType, getContainerPurpose, CONTROLLER_STRUCTURES,
      STRUCTURE_LINK, STRUCTURE_TOWER, STRUCTURE_CONTAINER, STRUCTURE_ROAD,
      STRUCTURE_RAMPART,
      FIND_STRUCTURES, FIND_MY_STRUCTURES, FIND_MY_CONSTRUCTION_SITES,
      FIND_MY_SPAWNS,
      TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP, LOOK_STRUCTURES,
      LOOK_CONSTRUCTION_SITES, RESOURCE_ENERGY, OK
    });
  const constructionPriority = createConstructionPriority({
    STRUCTURE_CONTAINER, STRUCTURE_LINK, STRUCTURE_EXTENSION, STRUCTURE_ROAD
  });
  const { isRepairTarget: isOutpostRepairTarget,
    selectRepairTarget: selectOutpostRepairTarget,
    getBuilderTarget: getOutpostBuilderTarget } =
    createOutpostMaintenance({ STRUCTURE_CONTAINER, STRUCTURE_ROAD });
  const getRemoteBuilderTarget = remoteRoom => {
    if (!remoteRoom) return 0;
    const structures = getRoomStructures(remoteRoom);
    const sites = remoteRoom.find(FIND_MY_CONSTRUCTION_SITES);
    const backlog = getRoadBacklog(remoteRoom.memory.roadNetworkPlan,
      structures, sites);
    remoteRoom.memory.roadBacklog = { ...backlog, updated: Game.time };
    const plannedWork = remoteRoom.memory.deliveryPolicy?.blocked ? 0 :
      sites.length + backlog.unqueued;
    const old=remoteRoom.memory.builderCapacityPlan;
    const activeRepairCrew=tickCreeps.filter(c=>c.memory.emergencyRepairRoom===remoteRoom.name).length;
    const criticalDamage=activeRepairCrew>0 || structures.some(s=>s.structureType===STRUCTURE_CONTAINER&&s.hits<s.hitsMax*.25);
    if(old && Game.time-old.updated<20){if(criticalDamage)old.desired=Math.max(2,old.desired);return old.desired;}
    const owners=tickRooms.filter(r=>r.controller?.my);
    const home=owners.find(r=>[r.memory.leftSurvey,r.memory.southSurvey,r.memory.southwestSurvey]
      .some(plan=>plan?.targetRoom===remoteRoom.name));
    const candidates=tickCreeps.filter(c=>c.memory.role==='builder' &&
      c.memory.builderScope==='outpost'&&c.memory.remoteRoom===remoteRoom.name&&
      !c.spawning&&hasRemoteReplacementLife(c));
    const maintenance=planRepairSupply({structures,production:getRoomSources(remoteRoom).reduce((n,s)=>n+s.energyCapacity/ENERGY_REGEN_TIME,0)});
    const power=maintenance.backlog>0?1:5;
    const rates=candidates.map(c=>{
      const estimate=workRate(c.getActiveBodyparts(WORK),c.store.getCapacity(RESOURCE_ENERGY),power,12);
      return Math.min(estimate,profileRate(c,'remoteBuilder:'+remoteRoom.name,home?.memory.laborStats,estimate).rate);
    });
    const future=buildBody('worker',home?.energyCapacityAvailable||800)||[];
    const futureRate=workRate(future.filter(p=>p===WORK).length,future.filter(p=>p===CARRY).length*50,power,12);
    const repairEnergy=structures.filter(isOutpostRepairTarget).reduce((sum,s)=>sum+
      Math.max(0,s.hitsMax*.8-s.hits)/100,0);
    const remaining=sites.reduce((sum,s)=>sum+Math.max(0,s.progressTotal-s.progress),0)+
      (remoteRoom.memory.deliveryPolicy?.blocked?0:backlog.unqueuedBuildLowerBound||0);
    const production=getRoomSources(remoteRoom).reduce((sum,source)=>sum+source.energyCapacity/ENERGY_REGEN_TIME,0);
    const energyBudget=Math.max(.5,production*.25);
    const requiredRate=maintenance.rate+(maintenance.backlog>production*100?0:Math.min(energyBudget,remaining/3000));
    const wanted=countForRate(requiredRate,rates,futureRate,4);
    const stable=settle(old,wanted,Game.time,criticalDamage?2:plannedWork>0||repairEnergy>0?1:0);
    remoteRoom.memory.builderCapacityPlan={...stable,updated:Game.time,requiredRate,energyBudget,futureRate,rates};
    return stable.desired;
  };
  cpuStages.mark('colonyPolicy');
  protectRepairAssignments({Game,getStructures:getRoomStructures,
    creeps:tickCreeps});
  reconcileControllerRelief({Game,isRoadMobile:hasRoadMobility,
    creeps:tickCreeps});
  enforceUpgraderLimit({Game,isRoadMobile:hasRoadMobility,
    getLimit:room=>getRoomSituation(room).policy.roles.upgrader.desired,
    creeps:tickCreeps,rooms:tickRooms});
  dispatchEmergencyRepairs({Game,getStructures:getRoomStructures,
    isRoadMobile:hasRoadMobility,resource:RESOURCE_ENERGY,
    creeps:tickCreeps,rooms:tickRooms});
  const { refreshRemoteWorkNeeds, planRegionalOutposts } =
    createOutpostPlanning({
      Game, getRemoteBuilderTarget, getRemoteHaulerTarget,
      getSourceBodyWorkCapacity, scheduledRoomTick, FIND_SOURCES, LEFT, BOTTOM,
      ENERGY_REGEN_TIME, HARVEST_POWER
    });
  const { updateExpansionPlan } = createExpansionPlanner({
    Game, getRoomSources, getRoomSituation, FIND_STRUCTURES, FIND_MY_SPAWNS,
    FIND_MY_CONSTRUCTION_SITES, FIND_SOURCES, STRUCTURE_CONTAINER,
    STRUCTURE_ROAD, STRUCTURE_SPAWN, STRUCTURE_RAMPART, FIND_MINERALS, LOOK_STRUCTURES,
    LOOK_CONSTRUCTION_SITES, BODYPART_COST, CLAIM, MOVE, OK
  });
  const { planRemoteCorridors } = createRemoteCorridorPlanner({
    Game, PathFinder, scheduledRoomTick, getRoomSources,
    isRetiringContainer, FIND_STRUCTURES, FIND_SOURCES, FIND_MY_SPAWNS,
    FIND_MY_CONSTRUCTION_SITES, STRUCTURE_CONTAINER, STRUCTURE_ROAD,
    STRUCTURE_RAMPART, LOOK_STRUCTURES, LOOK_CONSTRUCTION_SITES,
    OBSTACLE_OBJECT_TYPES, LEFT, BOTTOM, OK
  });
  const { getRefillClusters, isRefillTargetFor, getRefillerCarryFloor,
    reconcileRefillerClusters, releaseUndersizedRefillers } =
    createRefillManagement({
      Game, getRoomStructures, isExtensionClusterTile,
      getRoomSituation: room => refillRetentionSituation(getRoomSituation(room)),
      FIND_MY_SPAWNS, STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TOWER,
      RESOURCE_ENERGY, BODYPART_COST, CARRY, MOVE, CARRY_CAPACITY
    });
  const getDesiredSourceWorkerLimit = (room, population) => {
    return getRoomSituation(room).targets.source;
  };
  const publishRoomScenarios = (room, situation, staffingPlan) => {
    const previousScenarios = room.memory.scenarioRecords &&
      room.memory.scenarioRecords.active || [];
    const towerStatus = towerStatuses[room.name] || {};
    const previouslyUnderAttack = previousScenarios.some(scenario =>
      scenario.key === 'active-attack' ||
      scenario.key === 'post-attack-recovery');
    const towers = getRoomStructures(room).filter(structure =>
      structure.my && structure.structureType === STRUCTURE_TOWER);
    const towerReserveDeficit = (towerStatus.hostileCount > 0 ||
      previouslyUnderAttack) && towers.some(tower => {
      const capacity = tower.store.getCapacity(RESOURCE_ENERGY) || 1;
      return tower.store[RESOURCE_ENERGY] < capacity * 0.5;
    });
    const recoveryEvidence = towerStatus.mode === 'heal' ||
      towerReserveDeficit || postBattleSalvageRooms.has(room.name) ||
      situation.signals.repairCritical;
    const candidates = classifyColonyScenarios({
      hostileCount: towerStatus.hostileCount || 0,
      cpuMode: cpuPolicy.mode,
      cpuBucket: cpuPolicy.bucket,
      spawnCapacityOverloaded: Boolean(
        situation.policy.spawnCapacity?.overloaded),
      minimumSpawnLoad: situation.policy.spawnCapacity?.minimumLoad,
      spawnBudget: situation.policy.spawnCapacity?.budget,
      baselineGap: staffingPlan.baselineGap,
      initialBootstrap: Boolean(staffingPlan.baselineGap &&
        room.controller && room.controller.my &&
        room.controller.level <= 2 &&
        room.find(FIND_MY_SPAWNS).length > 0),
      postAttackRecovery: towerStatus.hostileCount === 0 &&
        previouslyUnderAttack && recoveryEvidence,
      woundedFriendly: towerStatus.mode === 'heal',
      towerReserveDeficit,
      salvageAvailable: postBattleSalvageRooms.has(room.name),
      controllerSupplyDeficit:
        situation.signals.controllerTicks < 3000 ||
        situation.signals.controllerBufferCapacity > 0 &&
        situation.signals.controllerBufferRatio < 0.1,
      controllerTicks: situation.signals.controllerTicks,
      refillDeficit: situation.signals.energyRatio < 0.75 &&
        (situation.signals.bufferRatio > 0.1 ||
          situation.signals.droppedEnergy > 0),
      energyRatio: situation.signals.energyRatio,
      sourceBufferOverflow: situation.signals.bufferRatio >= 0.85,
      bufferRatio: situation.signals.bufferRatio,
      repairCritical: situation.signals.repairCritical,
      repairRemaining: situation.signals.repairRemaining,
      buildRemaining: situation.signals.buildRemaining,
      remoteBacklog: situation.signals.remoteBacklog,
      remoteBlockedRooms: situation.signals.remoteBlockedRooms,
      remoteRosterGap: situation.signals.remoteRosterGap,
      remoteHaulerShortfall: situation.signals.remoteHaulerShortfall,
      operationalSamples: situation.signals.operationalSamples,
      taskFlips: situation.signals.taskFlips,
      roleChanges: situation.signals.roleChanges,
      stuckTicks: situation.signals.stuckTicks
    });
    const records = reconcileScenarioRecords(previousScenarios, candidates,
      Game.time);
    room.memory.scenarioRecords = {
      version: 1, updated: Game.time, active: records
    };
    situation.scenarios = records;
    applyScenarioPolicy(situation.policy, records);
    finalizeOperationPolicy(situation.policy, room, Game);
    adoptBalancers(room, Game, situation.policy);
    adoptSurplusHaulerForLink(room, Game, situation.policy);
    situation.mode = situation.policy.mode;
    situation.targets = Object.fromEntries(Object.entries(
      situation.policy.roles).map(([key, role]) => [key, role.desired]));
    situation.status.health = situation.policy.health;
    situation.status.mode = situation.policy.mode;
    situation.status.scenarios = records.map(record => record.key);
    situation.status.conditionLabel = situation.status.label;
    if (situation.status.key === 'energy-surplus' &&
        situation.policy.health !== 'surplus') {
      situation.status.key = `policy-${situation.policy.health}`;
      situation.status.label = situation.policy.health[0].toUpperCase() +
        situation.policy.health.slice(1);
    }
    situation.status.label = `${situation.policy.health[0].toUpperCase()}${
      situation.policy.health.slice(1)} · ${situation.status.conditionLabel}`;
    room.memory.populationPolicy = {
      updated: Game.time, mode: situation.policy.mode,
      health: situation.policy.health,
      permissions: situation.policy.permissions,
      budgets: situation.policy.budgets,
      roles: situation.policy.roles,
      remote: situation.policy.remote,
      totals: situation.policy.totals,
      spawnCapacity: situation.policy.spawnCapacity,
      scenarioDecision: situation.policy.scenarioDecision
    };
    room.memory.roomStatus = { updated: Game.time, ...situation.status };
    room.memory.roomDecision = {
      version: 1, updated: Game.time,
      health: situation.policy.health,
      mode: situation.policy.mode,
      scenarios: records,
      permissions: situation.policy.permissions,
      roles: situation.policy.roles,
      remote: situation.policy.remote,
      totals: situation.policy.totals,
      spawnCapacity: situation.policy.spawnCapacity,
      scenarioDecision: situation.policy.scenarioDecision
    };
    staffingPlan.scenarios = records;
    return records;
  };
  cpuStages.mark('remotePolicy');
  const getSpawnAssignment = (room, workers) => {
    // The power line is an upgrade-season optimization, not core staffing.
    // Construction, repair, and essential economy jobs keep spawn priority
    // until only small cleanup backlogs remain.
    const spawnSituation = getRoomSituation(room);
    const staffingPlan = buildRoomStaffingPlan(room, workers,
      spawnSituation.policy);
    const brigadeReadiness = evaluateControllerBrigadeReadiness(
      spawnSituation, staffingPlan);
    const savedBrigadePlan = room.memory.controllerBrigadePlan;
    const activeBrigadeCount = workers.filter(creep =>
      creep.memory.role === CONTROLLER_BRIGADE_ROLE).length;
    if (room.memory.defenderSpawnQueuedTick === Game.time) return null;
    const defenseThreats = getDefenseThreats(room.name);
    const defenders = workers.filter(creep =>
      creep.memory.role === 'defender');
    const target = selectUndefendedThreat(defenseThreats, defenders, {
      HEAL, RANGED_ATTACK, ATTACK, WORK, CLAIM
    });
    const defenderCoverage = target ? workers.filter(creep =>
      creep.memory.role === 'defender' &&
      (creep.memory.defenseTargetRoom || room.name) ===
        target.roomName).length : 0;
    const restoringBeforeRemoteDefense = target &&
      shouldRestoreBrigadeBeforeRemoteDefense({
        homeRoom: room.name,
        threatRoom: target.roomName,
        activeCount: activeBrigadeCount,
        targetCount: savedBrigadePlan && savedBrigadePlan.segments
          ? savedBrigadePlan.segments.length : 0,
        maintenanceReady: brigadeReadiness.maintenanceReady
      });
    const homeRecoveryBeforeRemoteDefense = target &&
      shouldDeferRemoteDefenseForHomeRecovery({
        homeRoom: room.name,
        threatRoom: target.roomName,
        maintenanceReady: brigadeReadiness.maintenanceReady
      });
    if (target && needsEmergencyDefender(1, defenderCoverage, false,
        target.requiredDefenders) &&
        (target.creep.structureType === STRUCTURE_INVADER_CORE ||
          !restoringBeforeRemoteDefense &&
          !homeRecoveryBeforeRemoteDefense)) {
      return {
        role: 'defender', forceSpawn: true, emergencyDefense: true,
        minimumEnergy: Math.min(room.energyCapacityAvailable, 300),
        staffingCurrent: defenderCoverage,
        staffingTarget: target.requiredDefenders, minimumGap: true,
        defenseTargetRoom: target.roomName
      };
    }
    staffingPlan.scenarios = spawnSituation.scenarios || [];
    const establishedBrigade = Boolean(savedBrigadePlan &&
      Array.isArray(savedBrigadePlan.segments) &&
      savedBrigadePlan.segments.length > 0);
    const brigadePermitted = Boolean(spawnSituation.policy.permissions &&
      spawnSituation.policy.permissions.controllerBrigade);
    const replacementMode = selectControllerBrigadeReplacementMode({
      permitted: brigadePermitted,
      ready: brigadeReadiness.ready,
      maintenanceReady: brigadeReadiness.maintenanceReady,
      established: establishedBrigade,
      activeCount: activeBrigadeCount,
      operationActive: room.memory.controllerBrigadeOperation?.active === true,
      rcl: room.controller ? room.controller.level : 0
    });
    room.memory.controllerBrigadeReadiness = {
      ...brigadeReadiness,
      established: establishedBrigade,
      maintaining: activeBrigadeCount > 0,
      activeCount: activeBrigadeCount,
      targetCount: savedBrigadePlan && savedBrigadePlan.segments
        ? savedBrigadePlan.segments.length : 0,
      replacementMode,
      updated: Game.time
    };
    // A new line still requires full readiness. Once established, the
    // stationary line may rebuild after core energy staffing recovers because
    // a partial line cannot deliver anything to its controller endpoint.
    const controllerBrigadePlan = replacementMode === 'maintenance' ||
      isBrigadePlanActive(room) && replacementMode !== 'paused'
      ? getControllerBrigadePlan(room) : null;
    if (controllerBrigadePlan) {
      const rosterChanges = reconcileControllerBrigadeOverlaps(
        room.name, controllerBrigadePlan);
      if (rosterChanges.reassigned.length || rosterChanges.released.length) {
        console.log(`[${Game.time}] ${room.name} brigade roster | ` +
          `moved ${rosterChanges.reassigned.length}, ` +
          `released ${rosterChanges.released.length}`);
      }
    }
    const controllerRelaySlot = controllerBrigadePlan &&
      getMissingControllerBrigadeSlot(workers, room.name,
        controllerBrigadePlan.segments.length,
        controllerBrigadePlan.stationary
          ? CONTROLLER_BRIGADE_REPLACEMENT_LEAD : 0);
    const controllerRelayRequest = Number.isInteger(controllerRelaySlot)
      ? {
        role: CONTROLLER_BRIGADE_ROLE,
        controllerRelaySlot,
        brigadeMaintenance: replacementMode === 'maintenance',
        spawnBodyRole: CONTROLLER_BRIGADE_ROLE,
        forceSpawn: true,
        minimumEnergy: 2 * BODYPART_COST[CARRY] + BODYPART_COST[MOVE],
        staffingCurrent: workers.filter(creep =>
          creep.memory.role === CONTROLLER_BRIGADE_ROLE).length,
        staffingTarget: controllerBrigadePlan.segments.length
      } : null;
    // Keep the core room productive before assigning optional remote labor.
    const situationTargets = spawnSituation.targets;
    const maintainRemotes = Boolean(spawnSituation.policy.permissions &&
      spawnSituation.policy.permissions.remoteMaintenance);
    const allowRemoteGrowth = Boolean(spawnSituation.policy.permissions &&
      spawnSituation.policy.permissions.remoteGrowth);
    const allowRemoteHaulingRecovery = Boolean(
      spawnSituation.policy.permissions &&
      spawnSituation.policy.permissions.remoteHaulingRecovery);
    const recoveryEnergy = scaleEnergyBudget(
      room.energyCapacityAvailable, 0.5);
    const standardEnergy = scaleEnergyBudget(
      room.energyCapacityAvailable, 0.65);
    const qualityEnergy = scaleEnergyBudget(
      room.energyCapacityAvailable, 0.9);
    const viableUpgraders = workers.filter(creep =>
      creep.memory.role === 'upgrader' && hasLocalReplacementLife(creep) &&
      creep.getActiveBodyparts(WORK) > 0);
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
    const canAffordQualityRefiller = room.energyAvailable >= qualityEnergy;
    const replacementCluster = missingRefillCluster ||
      refillClusters.find(cluster => undersizedRefiller &&
        undersizedRefiller.memory.refillClusterId === cluster.id);
    const refillerMinimumEnergy = Math.max(recoveryEnergy,
      getRefillerCarryFloor(room) / CARRY_CAPACITY *
        (BODYPART_COST[CARRY] + BODYPART_COST[MOVE]));
    // Exact source coverage is checked after the authoritative minimum plan.
    // Otherwise this local adapter can repeatedly preempt a missing refiller
    // even though the room-wide roster already has ample mining bodies.
    const uncoveredLocalSource = getRoomSources(room).find(source => {
      const requiredWork = Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER);
      const assigned = workers.filter(creep =>
        (creep.memory.role === 'harvester' ||
          creep.memory.role === 'miner') &&
        (creep.memory.preferredSource === source.id ||
          creep.memory.minerSource === source.id ||
          creep.memory.harvestSource === source.id ||
          creep.memory.sourceReplacement === source.id ||
          creep.memory.sourceReserve === source.id) &&
        (creep.spawning || hasLocalReplacementLife(creep)));
      const assignedWork = assigned.reduce((total, creep) =>
        total + creep.getActiveBodyparts(WORK), 0);
      // One 800-energy productive miner is intentionally sufficient. Do not
      // turn historical tile/headcount observations into extra source bodies
      // when the assigned WORK already covers regeneration.
      return assignedWork < requiredWork;
    });
    // An established stationary line is atomic. Once the source floor plus
    // one filler, hauler, upgrader and rebalancer are covered, finish its
    // maintenance pass before optional builder, repair and tunnel staffing.
    // New brigade creation still remains behind the complete local minimum.
    const brigadeCoreGap = ['source', 'refiller', 'hauler', 'upgrader',
      'rebalancer'].some(key => {
      const job = staffingPlan.jobs && staffingPlan.jobs[key];
      if (!job || job.min <= 0) return false;
      const required = key === 'source' ? job.min : 1;
      return job.coverageCount < required;
    });
    if (replacementMode === 'maintenance' && controllerRelayRequest &&
        !brigadeCoreGap) return controllerRelayRequest;
    // Complete every policy-owned local minimum before considering remote
    // replacement, remote recovery, remote growth, or new brigade work. The
    // old ordering protected only a one-hauler emergency floor, allowing
    // remote bodies to jump missing 1/2 hauler and 0/1 rebalancer slots.
    const minimumPlan = planMinimumSpawn({
      room, workers, staffingPlan,
      replacementCluster, recoveryEnergy, standardEnergy,
      refillerMinimumEnergy
    });
    const minimumGap = minimumPlan.gap;
    const viableLocalHaulers = minimumPlan.haulers;
    if (minimumPlan.handled) return minimumPlan.request;
    const urgentReservationRequest = planReservationSpawn({ room, workers,
      policy: spawnSituation.policy, staffingPlan, Game, urgentOnly: true });
    if (urgentReservationRequest) return urgentReservationRequest;
    const bootstrapRequest = planBootstrapSpawn({ room, workers, Game,
      permitted: spawnSituation.policy.permissions?.expansionMaintenance,
      hasSpawn: target => getRoomStructuresByType(target, STRUCTURE_SPAWN)
        .some(spawn => spawn.my), spawnTime: CREEP_SPAWN_TIME });
    if (bootstrapRequest) return bootstrapRequest;
    const outpostPresence = getOutpostPresenceGap(room.name, room.memory,
      tickCreeps);
    if (outpostPresence) {
      const survey = outpostPresence.survey;
      return {
        role: 'remote-miner',
        remoteRoom: survey.targetRoom,
        remoteSlot: 0,
        remoteTeam: outpostPresence.team,
        remoteDelivery: outpostPresence.delivery,
        forceSpawn: true,
        emergencyPresence: true,
        minimumEnergy: Math.min(room.energyCapacityAvailable, 300),
        staffingCurrent: 0, staffingTarget: 1,
        minimumGap: true
      };
    }
    const reservationRequest = planReservationSpawn({ room, workers,
      policy: spawnSituation.policy, staffingPlan, Game });
    if (reservationRequest) return reservationRequest;
    // Established export capacity precedes extra construction staffing once
    // the home income, refilling and controller survival floor are covered.
    const coreIncomeGap = uncoveredLocalSource || staffingPlan.emergency.missing
      .some(entry => ['source', 'refiller', 'hauler', 'upgrader'].includes(entry.key));
    // An established stationary brigade is one atomic home supply line. Once
    // local survival jobs are covered, repair that line before remote roster
    // maintenance; otherwise a zero-member line can remain selected for
    // maintenance while remote replacements consume every spawn cycle.
    if (!coreIncomeGap && replacementMode === 'maintenance' &&
        controllerRelayRequest) return controllerRelayRequest;
    // Ask the remote adapter to map the authoritative staffing gap even when
    // the per-source diagnostic below sees an additional local WORK hole.
    // The adapter returns null for a local selected gap. Skipping it here can
    // make the selector propose a source body while final authority correctly
    // requires the already-selected remote minimum, deadlocking an idle spawn.
    const remoteMinimumRequest = planMinimumRemoteSpawn({
      room, workers, staffingPlan, maintainRemotes
    });
    const remoteMinimumGap = staffingPlan.minimumGap ||
      staffingPlan.ordinaryMinimumGap;
    const remoteMinimumJob = remoteMinimumGap && staffingPlan.jobs &&
      staffingPlan.jobs[remoteMinimumGap.role];
    // Restore one owner to a completely empty remote capability before
    // protecting an aging body in another lane. Four miners and zero
    // carriers still produce zero delivered energy. Once every minimum lane
    // has an owner, due miner replacement again protects funded production.
    if (remoteMinimumRequest && remoteMinimumJob &&
        remoteMinimumJob.coverageCount === 0) return remoteMinimumRequest;
    const expiringRemoteMiner = !coreIncomeGap && planRemoteMinerReplacement({
      room, workers, maintainRemotes });
    if (expiringRemoteMiner) return expiringRemoteMiner;
    if (remoteMinimumRequest) return remoteMinimumRequest;
    const repairRelief=!coreIncomeGap&&planRepairRelief({room,workers,rooms:Game.rooms,viable:hasRemoteReplacementLife});
    if(repairRelief)return repairRelief;
    const controllerRelief=!coreIncomeGap&&planControllerRelief({room,workers,viable:hasLocalReplacementLife,
      operationWork:spawnSituation.policy.operations?.upgradePush?spawnSituation.policy.operations.upgradeWork:0});
    if(controllerRelief)return controllerRelief;
    // An explicitly prepared, healthy claim is a bounded capability action.
    // Once every local and remote minimum plus due replacement work is
    // covered, launch it before desired hauling or other optional growth.
    const readyClaim = room.memory.expansionPlan;
    if (spawnSituation.policy.permissions?.expansion && readyClaim &&
        readyClaim.status === 'claim-ready' &&
        !workers.some(creep => creep.memory.role === 'claimer' &&
          creep.memory.expansionTarget === readyClaim.targetRoom)) {
      return {
        role: 'claimer', expansionTarget: readyClaim.targetRoom,
        forceSpawn: true
      };
    }
    const missingCoreBuilder=staffingPlan.jobs?.builder &&
      staffingPlan.jobs.builder.coverageCount<staffingPlan.jobs.builder.min;
    const missingCoreUpgrader=staffingPlan.jobs?.upgrader &&
      staffingPlan.jobs.upgrader.coverageCount<staffingPlan.jobs.upgrader.min;
    // This bounded push outranks desired remote growth, never core/minimum
    // coverage or due income replacement. Its full roster is budgeted above.
    if (spawnSituation.policy.operations?.upgradePush && controllerRelayRequest) return controllerRelayRequest;
    const establishedHaulRequest = allowRemoteHaulingRecovery && !coreIncomeGap && !missingCoreBuilder && !missingCoreUpgrader
      ? planRemoteGrowthSpawn({ room, workers, staffingPlan,
        allowRemoteGrowth: false, allowRemoteHaulingRecovery: true }) : null;
    if (establishedHaulRequest) return establishedHaulRequest;
    // All policy minimums are covered. Only now repair a genuine per-source
    // WORK hole that aggregate headcount could not reveal.
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
    // Policy decides the aggregate remote minimum. Survey memory is used only
    // to map that gap to one concrete room and lane.
    // When established outposts are already blocked by full containers, add
    // their measured carrier surge before restoring more remote production.
    // Local minimum staffing above remains protected.
    const remoteHaulRecoveryRequest = allowRemoteHaulingRecovery
      ? planRemoteGrowthSpawn({
        room, workers, staffingPlan, allowRemoteGrowth: false,
        allowRemoteHaulingRecovery: true
      }) : null;
    const recoveryLastServed = room.memory.recoveryBalance &&
      room.memory.recoveryBalance.lastServed || {};
    const balancedRecoveryRequest = selectBalancedRecoveryRequest([
      {
        key: 'remote-haul', request: remoteHaulRecoveryRequest,
        current: staffingPlan.jobs.remoteHauler.count,
        target: staffingPlan.jobs.remoteHauler.desired,
        priority: 0
      },
      {
        key: 'brigade', request: controllerRelayRequest,
        current: activeBrigadeCount,
        target: controllerBrigadePlan
          ? controllerBrigadePlan.segments.length : 0,
        priority: 1
      }
    ], recoveryLastServed);
    if (balancedRecoveryRequest) return balancedRecoveryRequest;
    // Every local and remote minimum above is now covered. Only now may the
    // spawn fill yellow, desired staffing for the room.
    if (!emergencyRefillerGap &&
        viableRefillers.length < situationTargets.refiller &&
        canAffordQualityRefiller) {
      return {
        role: 'refiller',
        forceSpawn: true,
        refillClusterId: replacementCluster && replacementCluster.id,
        refillClusterX: replacementCluster && replacementCluster.x,
        refillClusterY: replacementCluster && replacementCluster.y,
        refillSpawnOwner: Boolean(replacementCluster &&
          replacementCluster.fillsSpawn),
        refillerFallbackAllowed: false,
        minimumEnergy: qualityEnergy
      };
    }
    // Home source buffers need their desired carrier roster only after no red
    // local or outpost job remains.
    const localHaulerFloor = situationTargets.hauler;
    if (viableLocalHaulers.length < localHaulerFloor) {
      const activeLocalHauler = workers.some(creep =>
        creep.memory.role === 'hauler');
      return {
        role: 'hauler',
        forceSpawn: true,
        minimumEnergy: activeLocalHauler
          ? standardEnergy : recoveryEnergy
      };
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
        minimumEnergy: standardEnergy
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
        minimumEnergy: standardEnergy
      };
    }
    const pendingContainer = getRoomSitesByType(
      room, STRUCTURE_CONTAINER)[0];
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
          minimumEnergy: standardEnergy
        };
      }
      return null;
    }
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
        minimumEnergy: standardEnergy
      };
    }
    // Desired remote growth is also aggregate-policy bounded; the planner
    // selects only the least-covered eligible lane within that gap.
    const remoteGrowthRequest = planRemoteGrowthSpawn({
      room, workers, staffingPlan, allowRemoteGrowth,
      allowRemoteHaulingRecovery
    });
    if (remoteGrowthRequest) return remoteGrowthRequest;
    const expansion = room.memory.expansionPlan;
    const expansionAllowed = Boolean(spawnSituation.policy.permissions &&
      spawnSituation.policy.permissions.expansion);
    if (expansion && expansion.targetRoom) {
      if (expansionAllowed && expansion.status === 'claim-ready' &&
          !workers.some(creep => creep.memory.role === 'claimer' &&
            creep.memory.expansionTarget === expansion.targetRoom)) {
        return {
          role: 'claimer',
          expansionTarget: expansion.targetRoom,
          forceSpawn: true
        };
      }
    }
    // No explicit authorized gap means no spawn request. Population budget is
    // a ceiling, never a reason to invent an unowned generic worker.
    return null;
  };

  const releaseSurplusRebalancers = (room, workers) => {
    const target = getRoomSituation(room).targets.rebalancer;
    const active = workers.filter(creep => !creep.spawning &&
      creep.memory.role === 'rebalancer');
    const { keepers, surplus } = selectRebalancerSurplus(active, target,
      hasLocalReplacementLife, RESOURCE_ENERGY);
    for (const creep of keepers) {
      delete creep.memory.rebalancerSurplusSince;
    }
    for (const creep of surplus) {
      // A one-tick policy fluctuation must not cancel a loaded delivery. An
      // empty surplus BAL may still have a target selected every tick, so the
      // target itself cannot reset the 25-tick aging window or it will never
      // return to general hauling.
      if (creep.store[RESOURCE_ENERGY] > 0) {
        delete creep.memory.rebalancerSurplusSince;
        continue;
      }
      if (!Number.isInteger(creep.memory.rebalancerSurplusSince)) {
        creep.memory.rebalancerSurplusSince = Game.time;
        continue;
      }
      if (Game.time - creep.memory.rebalancerSurplusSince < 25) continue;
      creep.memory.role = 'hauler';
      delete creep.memory.rebalancerSource;
      delete creep.memory.rebalanceTarget;
      delete creep.memory.rebalanceTargetReviewed;
      delete creep.memory.rebalancePickupTarget;
      delete creep.memory.rebalancerSurplusSince;
      delete creep.memory.working;
      delete creep.memory.task;
      delete creep.memory.taskTarget;
      console.log(`[${Game.time}] ${creep.name} released from container ` +
        `balancing; ${active.length} active for target ${target}`);
    }
    return surplus;
  };

  cpuStages.mark('spawnPolicy');
  cpuStages.aggregate('roomPolicy', ROOM_POLICY_STAGES);
  // All three established outposts share one demand planner. Survey memory
  // records measured lanes; it never mutates creep roles or population caps.
  // Retain distinct route/delivery metadata while deriving every outpost's
  // source, carrier, and maintenance demand through the shared planner.
  for (const creep of tickCreeps) {
    const home = Game.rooms[creep.memory.remoteHome || creep.memory.home];
    observeHaulTrip({ creep, homeMemory: home && home.memory, tick: Game.time,
      resource: RESOURCE_ENERGY });
  }
  const ownedVisibleRooms = tickRooms.filter(room =>
    room.controller && room.controller.my);
  const ownershipTransitions = reconcileOwnedRoomTransitions({
    Game, rooms: ownedVisibleRooms, creeps: tickCreeps,
    getWork: creep => creep.getActiveBodyparts(WORK),
    getCarry: creep => creep.getActiveBodyparts(CARRY),
    getEnergy: creep => creep.store[RESOURCE_ENERGY] || 0
  });
  if (ownershipTransitions.rooms.length ||
      ownershipTransitions.converted.length ||
      ownershipTransitions.retired.length) {
    console.log(`[${Game.time}] owned room transition | rooms ` +
      `${ownershipTransitions.rooms.join(',') || 'stable'} | bootstrap ` +
      `${ownershipTransitions.converted.join(',') || 'none'} | retired ` +
      `${ownershipTransitions.retired.join(',') || 'none'}`);
  }
  const outpostPlansDue = ownedVisibleRooms.filter(room =>
    !room.memory.leftSurvey || !room.memory.southSurvey ||
    !room.memory.southwestSurvey ||
    Game.time - (room.memory.outpostPlanningUpdated || 0) >= 20);
  if (allowSlowPlanning && outpostPlansDue.length > 0) {
    planRegionalOutposts(outpostPlansDue);
    for (const room of outpostPlansDue) room.memory.outpostPlanningUpdated = Game.time;
  }

  // Remote-hauler identity is a roster assignment, not a live dispatch
  // decision. Reconcile existing bodies only when the desired roster changes;
  // surplus bodies keep working their current lane and age out naturally.
  const remoteRostersDue = ownedVisibleRooms.filter(room =>
    !room.memory.remoteHaulerRosterSignature ||
    scheduledRoomTick(room, 10, 6));
  if (allowSlowPlanning && remoteRostersDue.length > 0) {
    reconcileRemoteHaulerRosters({
      rooms: remoteRostersDue, creeps: tickCreeps,
      Game, RESOURCE_ENERGY,
      isOwnedRoom: roomName => ownedTarget(Game, roomName),
      getRemoteHaulerBudget: room =>
        getRoomSituation(room).policy.remote.haulers
    });
  }
  const remoteMinerRosterResults = allowSlowPlanning
    ? reconcileRemoteMinerRosters({
      rooms: ownedVisibleRooms, creeps: tickCreeps,
      getReplacementLead: getRemoteReplacementLead,
      isOwnedRoom: roomName => ownedTarget(Game, roomName),
      getWork: creep => creep.getActiveBodyparts(WORK)
    }) : {};
  for (const [roomName, result] of Object.entries(
    remoteMinerRosterResults)) {
    if (!result.retired.length) continue;
    console.log(`[${Game.time}] ${roomName} remote miner roster | ` +
      `${result.assigned}/${result.needed} slots, ` +
      `${result.overlaps} replacement overlap, ` +
      `${result.retired.length} duplicate retired`);
  }

  // Select a prepared outpost, wait for a GCL slot, then bootstrap its spawn.
  const primarySpawn = Object.values(Game.spawns)
    .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (allowSlowPlanning && (!primarySpawn ||
      !primarySpawn.room.memory.expansionPlan ||
      scheduledGlobalTick(50, 13))) {
    updateExpansionPlan();
  }

  // Plan all remote road corridors and expose at most five sites per route.
  if (allowSlowPlanning) planRemoteCorridors(tickRooms);
  if (allowSlowPlanning && scheduledGlobalTick(50, 17)) {
    createRoadNetwork({Game,FIND_STRUCTURES,FIND_MY_CONSTRUCTION_SITES,
      LOOK_STRUCTURES,LOOK_CONSTRUCTION_SITES,OBSTACLE_OBJECT_TYPES,OK}).run();
  }

  if (renderPlanningVisuals) drawRoadNetwork({Game,RoomPosition});

  cpuStages.mark('remotePlanning');
  cpuStages.aggregate('observation', OBSERVATION_STAGES);
  // Reopen failed mining lanes with bodies that already exist before asking
  // the spawn for another replacement. Only builder capacity above the local
  // maximum is eligible, so recovery cannot create a new home-room shortage.
  const clearRecoveryAssignment = creep => {
    delete creep.memory.builderScope;
    delete creep.memory.builderMission;
    delete creep.memory.buildTarget;
    delete creep.memory.repairTarget;
    delete creep.memory.workJob;
    delete creep.memory.task;
    delete creep.memory.taskTarget;
    delete creep.memory.withdrawTarget;
    delete creep.memory.supplyTarget;
    delete creep.memory.idleNow;
    delete creep.memory.demandLane;
    delete creep.memory.sourceRecoveryPlanTick;
  };
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const homeWorkers = Object.values(Game.creeps).filter(creep =>
      creep.memory.home === room.name);
    const roomPolicy = getRoomSituation(room).policy;
    const policyRoles = roomPolicy.roles;
    const builderCandidates = homeWorkers.filter(creep =>
      !creep.spawning && creep.room.name === room.name &&
      isLocalBuilder(creep) && !isBuilder(creep, 'local', 'tunnel') &&
      creep.getActiveBodyparts(WORK) > 0 &&
      creep.getActiveBodyparts(CARRY) > 0 &&
      (creep.ticksToLive || 0) > 150);
    const recoveryScore = creep => {
      const move = creep.getActiveBodyparts(MOVE);
      const nonMove = creep.body.length - move;
      return (move * 2 - nonMove) * 100000 +
        (creep.ticksToLive || 0) * 10 + creep.getActiveBodyparts(WORK);
    };
    const protectedBuilders = new Set();
    builderCandidates.filter(creep =>
      creep.memory.builderMission === 'repair')
      .sort((a, b) => recoveryScore(b) - recoveryScore(a))
      .slice(0, policyRoles.repairBuilder.max)
      .forEach(creep => protectedBuilders.add(creep.name));
    builderCandidates.filter(creep => !protectedBuilders.has(creep.name))
      .sort((a, b) => recoveryScore(b) - recoveryScore(a))
      .slice(0, policyRoles.builder.max)
      .forEach(creep => protectedBuilders.add(creep.name));
    let surplus = builderCandidates
      .filter(creep => !protectedBuilders.has(creep.name))
      .sort((a, b) => recoveryScore(b) - recoveryScore(a));
    const takeSurplus = () => surplus.shift();

    // Plan home-source recovery once for the whole room. The later generic
    // allocator honors this plan instead of independently undoing it.
    const recoveryPlan = planSourceRecovery({
      sources: getRoomSources(room), workers: homeWorkers, surplus,
      requiredWork: source => Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER),
      minWorkers: source => getSourceMinerMinimum(room, source),
      maxWorkers: source =>
        getWorkerLimits(room).sourceSpotCounts[source.id] || 0,
      getWork: worker => worker.getActiveBodyparts(WORK),
      isViable: worker => worker.spawning || hasLocalReplacementLife(worker)
    });
    for (const sourcePlan of recoveryPlan.plans) {
      for (const worker of sourcePlan.released) {
        worker.memory.role = 'worker';
        delete worker.memory.preferredSource;
        delete worker.memory.harvestSource;
        delete worker.memory.sourceReplacement;
        delete worker.memory.sourceReserve;
        delete worker.memory.harvestX;
        delete worker.memory.harvestY;
        delete worker.memory.task;
        delete worker.memory.taskTarget;
        delete worker.memory.demandLane;
        delete worker.memory.sourceRecoveryPlanTick;
      }
      for (const worker of sourcePlan.retained) {
        worker.memory.role = 'harvester';
        worker.memory.preferredSource = sourcePlan.source.id;
        worker.memory.sourceRecoveryPlanTick = Game.time;
      }
      for (const worker of sourcePlan.promoted) {
        clearRecoveryAssignment(worker);
        worker.memory.role = 'harvester';
        worker.memory.preferredSource = sourcePlan.source.id;
        worker.memory.sourceReplacement = sourcePlan.source.id;
        worker.memory.sourceReserve = sourcePlan.source.id;
        worker.memory.sourceRecoveryPlanTick = Game.time;
        delete worker.memory.remoteRoom;
        delete worker.memory.remoteSlot;
        delete worker.memory.remoteTeam;
        delete worker.memory.remoteDelivery;
        console.log(`[${Game.time}] ${worker.name} local surplus -> ` +
          `${room.name} source recovery ` +
          `(${sourcePlan.assignedWork}/${sourcePlan.requiredWork} WORK)`);
      }
    }
    surplus = recoveryPlan.remainingSurplus;

    const maintainRemoteRecovery = Boolean(roomPolicy.permissions &&
      roomPolicy.permissions.remoteMaintenance);
    const spareLocalCarriers = homeWorkers.filter(worker => !worker.spawning &&
      worker.room.name === room.name && worker.memory.role === 'hauler' &&
      worker.getActiveBodyparts(WORK) === 0 && hasRemoteReplacementLife(worker))
      .sort((a, b) => b.getActiveBodyparts(CARRY) - a.getActiveBodyparts(CARRY) ||
        (b.ticksToLive || 0) - (a.ticksToLive || 0))
      .slice(Math.max(policyRoles.hauler.min, policyRoles.hauler.desired));
    const remoteRecovery = planRemoteRecovery({
      plans: maintainRemoteRecovery ? getRemoteSpawnPlans(room) : [],
      workers: homeWorkers,
      surplus,
      haulerSurplus: spareLocalCarriers,
      minerBudget: roomPolicy.remote && roomPolicy.remote.minersMin || 0,
      haulerBudget: roomPolicy.permissions.remoteHaulingRecovery &&
        roomPolicy.remote ? roomPolicy.remote.haulers : 0,
      builderBudget: roomPolicy.remote && roomPolicy.remote.buildersMin || 0,
      getWork: worker => worker.getActiveBodyparts(WORK),
      getCarry: worker => worker.getActiveBodyparts(CARRY),
      isRemoteViable: worker => worker.spawning ||
        hasRemoteReplacementLife(worker),
      isOutpostBuilder,
      getRemoteBuilderTarget: targetRoom =>
        getRemoteBuilderTarget(Game.rooms[targetRoom])
    });
    for (const assignment of remoteRecovery.assignments) {
      const { worker, entry } = assignment;
      clearRecoveryAssignment(worker);
      worker.memory.remoteHome = room.name;
      worker.memory.remoteRoom = entry.survey.targetRoom;
      worker.memory.remoteTeam = entry.team;
      worker.memory.remoteDelivery = entry.delivery;
      delete worker.memory.preferredSource;
      delete worker.memory.sourceReplacement;
      delete worker.memory.sourceReserve;
      delete worker.memory.harvestSource;
      if (assignment.kind === 'hauler') {
        worker.memory.role = 'remote-hauler';
        worker.memory.bodyType = BODY_TYPES.HAULER;
        worker.memory.remoteHaulerSlot = assignment.slot;
        delete worker.memory.remoteRecall;
        console.log(`[${Game.time}] ${worker.name} local surplus -> ` +
          `${entry.survey.targetRoom} carrier ${assignment.slot + 1} ` +
          'recovery');
      } else if (assignment.kind === 'miner') {
        worker.memory.role = 'remote-miner';
        worker.memory.remoteSlot = assignment.need.slot;
        delete worker.memory.remoteRecall;
        console.log(`[${Game.time}] ${worker.name} local surplus -> ` +
          `${entry.survey.targetRoom} source ` +
          `${assignment.need.slot + 1} recovery`);
      } else {
        worker.memory.role = 'builder';
        worker.memory.builderScope = 'outpost';
        worker.memory.builderMission = 'maintenance';
        worker.memory.remoteBuilderSlot = assignment.slot;
        console.log(`[${Game.time}] ${worker.name} local surplus -> ` +
          `${entry.survey.targetRoom} maintenance recovery`);
      }
    }
  }

  const spawnGroups = {};
  for (const spawn of Object.values(Game.spawns)) {
    if (!spawnGroups[spawn.room.name]) spawnGroups[spawn.room.name] = [];
    spawnGroups[spawn.room.name].push(spawn);
  }
  const spawnOrder = [];
  const spawnAttempts = {};
  for (const [roomName, spawns] of Object.entries(spawnGroups)) {
    spawns.sort((a, b) => a.name.localeCompare(b.name));
    const room = Game.rooms[roomName];
    spawnAttempts[roomName] = [];
    room.memory.spawnLoopTrace = { tick: Game.time, stage: 'planning' };
    updateEnergyWorkPhase(room);
    const roomWorkers = Object.values(Game.creeps).filter(creep =>
      creep.memory.home === room.name);
    const situation = getRoomSituation(room);
    publishRoomScenarios(room, situation,
      buildRoomStaffingPlan(room, roomWorkers, situation.policy));
    room.memory.spawnLoopTrace = { tick: Game.time, stage: 'queued' };
    const start = room.memory.nextSpawnIndex % spawns.length || 0;
    for (let offset = 0; offset < spawns.length; offset++) {
      spawnOrder.push(spawns[(start + offset) % spawns.length]);
    }
  }
  for (const spawn of spawnOrder) {
    if (spawn.spawning) {
      spawnAttempts[spawn.room.name].push(describeSpawnAttempt({
        spawn: spawn.name, busy: true }));
      const roomSpawns = spawnGroups[spawn.room.name] || [];
      if (roomSpawns.every(candidate => candidate.spawning)) {
        clearSpawnWait(spawn.room);
      }
      continue;
    }
    const workers = Object.values(Game.creeps).filter(c =>
      c.memory.home === spawn.room.name);
    spawn.room.memory.spawnLoopTrace = { tick: Game.time,
      stage: 'selecting', population: workers.length };
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
    recoverSpawnFiller({ room: spawn.room, workers,
      viable: hasLocalReplacementLife, energy: RESOURCE_ENERGY });
    reconcileRefillerClusters(spawn.room, workers);
    const { workerLimit } = getWorkerLimits(spawn.room);
    const populationTransitionAllowance = getPopulationTransitionAllowance(
      spawn.room, workers, workerLimit);
    const controllerBrigadeBudgeted = isControllerBrigadeBudgeted(
      spawn.room);
    const activeBrigadeCount = getActiveControllerBrigadeCount(
      spawn.room, workers);
    const populationLimit = getPopulationLimit(workerLimit,
      spawn.room.memory.controllerBrigadePlan,
      controllerBrigadeBudgeted,
      activeBrigadeCount,
      populationTransitionAllowance);
    const bodyRosterPlan = getBodyRosterPlan(spawn.room, workers);
    const proposedAssignment = getSpawnAssignment(spawn.room, workers);
    const authoritySituation = getRoomSituation(spawn.room);
    const authorityStaffingPlan = buildRoomStaffingPlan(spawn.room, workers,
      authoritySituation.policy);
    const authority = authorizeSpawnAssignment({
      assignment: proposedAssignment, staffingPlan: authorityStaffingPlan
    });
    spawn.room.memory.spawnLoopTrace = { tick: Game.time,
      stage: 'authorized', population: workers.length,
      jobKey: authority.jobKey, authorized: authority.authorized };
    const previousSpawnDecision = spawn.room.memory.spawnDecision;
    const remoteBuilderJob = authorityStaffingPlan.jobs.remoteBuilder;
    spawn.room.memory.spawnDecision = {
      version: 3,
      updated: Game.time,
      authorized: authority.authorized,
      phase: authority.phase,
      jobKey: authority.jobKey,
      population: workers.length,
      populationLimit,
      workerLimit,
      populationTransitionAllowance,
      controllerBrigadeBudgeted,
      activeBrigadeCount,
      controllerBrigadeReplacementMode:
        spawn.room.memory.controllerBrigadeReadiness &&
        spawn.room.memory.controllerBrigadeReadiness.replacementMode || null,
      controllerBrigadeTargetCount:
        spawn.room.memory.controllerBrigadeReadiness &&
        spawn.room.memory.controllerBrigadeReadiness.targetCount || 0,
      controllerBrigadeMaintenanceBlockers:
        spawn.room.memory.controllerBrigadeReadiness &&
        spawn.room.memory.controllerBrigadeReadiness.maintenanceBlockers || [],
      role: proposedAssignment && proposedAssignment.role || null,
      controllerRelaySlot: proposedAssignment &&
        Number.isInteger(proposedAssignment.controllerRelaySlot)
        ? proposedAssignment.controllerRelaySlot : null,
      brigadeMaintenance: Boolean(proposedAssignment &&
        proposedAssignment.brigadeMaintenance),
      builderScope: proposedAssignment &&
        proposedAssignment.builderScope || null,
      builderMission: proposedAssignment &&
        proposedAssignment.builderMission || null,
      remoteRoom: proposedAssignment && proposedAssignment.remoteRoom || null,
      reservationDeadline: proposedAssignment &&
        proposedAssignment.reservationDeadline !== undefined
        ? proposedAssignment.reservationDeadline : null,
      remoteBuilderSlot: proposedAssignment &&
        Number.isInteger(proposedAssignment.remoteBuilderSlot)
        ? proposedAssignment.remoteBuilderSlot : null,
      minimumGap: authorityStaffingPlan.minimumGap &&
        (authorityStaffingPlan.minimumGap.role ||
          authorityStaffingPlan.minimumGap.key) || null,
      remoteBuilderCoverage: remoteBuilderJob &&
        remoteBuilderJob.coverageCount || 0,
      remoteBuilderMinimum: remoteBuilderJob && remoteBuilderJob.min || 0,
      reason: authority.reason
    };
    if (!authority.authorized && (!previousSpawnDecision ||
        previousSpawnDecision.reason !== authority.reason ||
        previousSpawnDecision.role !==
          spawn.room.memory.spawnDecision.role ||
        previousSpawnDecision.remoteRoom !==
          spawn.room.memory.spawnDecision.remoteRoom ||
        previousSpawnDecision.remoteBuilderSlot !==
          spawn.room.memory.spawnDecision.remoteBuilderSlot)) {
      console.log(`[${Game.time}] ${spawn.room.name} spawn denied | ` +
        authority.reason);
    }
    const assignment = authority.assignment;
    if (assignment) {
      if (['harvester', 'miner'].includes(assignment.role) && assignment.preferredSource) {
        const totalWork = Math.ceil(assignment.preferredSource.energyCapacity / ENERGY_REGEN_TIME / HARVEST_POWER);
        assignment.requiredWork = Math.min(totalWork, getSourceBodyWorkCapacity(spawn.room));
        assignment.miningProduction = assignment.preferredSource.energyCapacity / ENERGY_REGEN_TIME;
        const productiveBody = buildBody('miner', spawn.room.energyCapacityAvailable,
          { miningProduction: assignment.miningProduction });
        assignment.minimumEnergy = productiveBody && productiveBody.reduce((sum, part) => sum + BODYPART_COST[part], 0);
      }
      const capacityPlan=spawn.room.memory.laborPlan;
      if(capacityPlan && assignment.role==='refiller')assignment.carryParts=capacityPlan.refiller.carryParts;
      const upgradeOperation = getRoomSituation(spawn.room).policy.operations;
      if (assignment.role === 'upgrader' &&
          upgradeOperation?.upgradePush) {
        assignment.operationWork = upgradeOperation.upgradeWork;
        assignment.requiredWork = upgradeOperation.upgradeWork;
        assignment.workLimit = upgradeOperation.upgradeWork;
        assignment.spawnBodyRole = 'upgrader';
        assignment.minimumEnergy = upgradeOperation.upgradeBodyEnergy;
      }
      if(capacityPlan && assignment.role==='upgrader' && !assignment.operationWork){
        const cappedBody = buildBody('upgrader', routineBodyEnergyCap,
          { maximize: true, workLimit: capacityPlan.upgrader.workParts });
        const cappedWork = cappedBody
          ? cappedBody.filter(part => part === WORK).length : 1;
        assignment.workLimit=Math.min(capacityPlan.upgrader.workParts,
          cappedWork);
        if(workers.some(c=>c.memory.role==='upgrader'&&!c.spawning&&hasLocalReplacementLife(c))){
          assignment.requiredWork=assignment.workLimit;
          assignment.minimumEnergy=cappedBody.reduce((sum, part) =>
            sum + BODYPART_COST[part], 0);
        }
      }
      assignment.bodyType = getBodyTypeForAssignment(assignment);
      assignment.bodyRosterNeed = bodyRosterPlan.next &&
        bodyRosterPlan.next.type;
      const jobKey = assignment.role === 'harvester' ||
          assignment.role === 'miner' ? 'source'
        : assignment.role === 'remote-miner' ? 'remoteMiner'
          : assignment.role === 'remote-reserver' ? 'remoteReserver'
        : assignment.role === 'remote-hauler' ? 'remoteHauler'
            : assignment.role === 'builder'
              ? assignment.builderScope === 'outpost' ? 'remoteBuilder'
                : assignment.builderMission === 'repair' ? 'repairBuilder'
                  : assignment.builderMission === 'tunnel'
                    ? 'tunnelBuilder' : 'builder'
              : assignment.role;
      const staffingJob = buildRoomStaffingPlan(spawn.room, workers,
        getRoomSituation(spawn.room).policy).jobs[jobKey];
      if (staffingJob) {
        // Coverage for remote jobs counts rooms; body sizing needs roster units.
        assignment.staffingCurrent = ['remoteHauler','remoteBuilder'].includes(jobKey)
          ? staffingJob.count : staffingJob.coverageCount;
        assignment.staffingTarget = Math.max(1, staffingJob.min || 0,
          staffingJob.desired || 0);
        assignment.minimumGap = assignment.emergencyDefense ||
          assignment.emergencyPresence ||
          staffingJob.coverageCount < staffingJob.min;
      }
    }
    const spawnRequest = prepareSpawnRequest({
      spawn, assignment, workers, workerLimit: populationLimit, hasWorkParts
    });
    spawn.room.memory.spawnLoopTrace = { tick: Game.time,
      stage: 'prepared', population: workers.length, populationLimit,
      jobKey: authority.jobKey, needsWorker: spawnRequest.needsWorker,
      hasBody: Boolean(spawnRequest.body), waited: spawnRequest.waited,
      waitLimit: spawnRequest.waitLimit };
    if (!spawnRequest.needsWorker || !spawnRequest.body) {
      spawnAttempts[spawn.room.name].push(describeSpawnAttempt({
        spawn: spawn.name, proposed: proposedAssignment, authority,
        request: spawnRequest }));
      continue;
    }
    const body = spawnRequest.body;
    if (!spawn.spawning && body) {
      const name = getBirthName(spawn, assignment);
      const result = spawn.spawnCreep(body, name, {
        memory: {
          home: spawn.room.name,
          working: false,
          role: assignment.role,
          birthRole: assignment.role,
          ...contractForSpawnAssignment(assignment),
          qualityFor: assignment.qualityFor,
          bodyType: assignment.bodyType,
          builderScope: assignment.builderScope,
          builderMission: assignment.builderMission,
          assignmentBuilderMission: assignment.builderMission,
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
          remoteHaulerSlot: assignment.remoteHaulerSlot,
          remoteBuilderSlot: assignment.remoteBuilderSlot,
          controllerRelaySlot: assignment.controllerRelaySlot,
          defenseTargetRoom: assignment.defenseTargetRoom,
          recoveryLane: assignment.recoveryLane,
          expansionTarget: assignment.expansionTarget
        }
      });
      spawnAttempts[spawn.room.name].push(describeSpawnAttempt({
        spawn: spawn.name, proposed: proposedAssignment, authority,
        request: spawnRequest, result }));
      if (result === OK) {
        clearSpawnWait(spawn.room);
        if (assignment.role === 'defender') {
          spawn.room.memory.defenderSpawnQueuedTick = Game.time;
        }
        if (assignment.recoveryLane) {
          if (!spawn.room.memory.recoveryBalance) {
            spawn.room.memory.recoveryBalance = { lastServed: {} };
          }
          const balance = spawn.room.memory.recoveryBalance;
          if (!balance.lastServed) balance.lastServed = {};
          balance.lastServed[assignment.recoveryLane] = Game.time;
          balance.lastLane = assignment.recoveryLane;
          balance.lastCoverage = assignment.recoveryCoverage;
          balance.lastCurrent = assignment.recoveryCurrent;
          balance.lastTarget = assignment.recoveryTarget;
          balance.updated = Game.time;
        }
        const roomSpawns = spawnGroups[spawn.room.name];
        const spawnIndex = roomSpawns.findIndex(candidate => candidate.id === spawn.id);
        spawn.room.memory.nextSpawnIndex = (spawnIndex + 1) % roomSpawns.length;
        const cost = body.reduce((total, part) => total + BODYPART_COST[part], 0);
        console.log(`[${Game.time}] Spawning ${name} (${assignment.role}, ${cost} energy): ${getBodyCode(body)}`);
      }
    }
  }

  for (const [roomName, attempts] of Object.entries(spawnAttempts)) {
    recordSpawnDenials(Game.rooms[roomName].memory, Game.time, attempts);
  }

  cpuStages.mark('workforce');
  const reconcileInfrastructure = createOwnedRoomInfrastructure({
    Game, FIND_STRUCTURES, FIND_MY_CONSTRUCTION_SITES, FIND_MY_SPAWNS,
    CONTROLLER_STRUCTURES, getRoomSources, getContainerPurpose, OK,
    manageControllerContainer, manageExtensionContainer, placeSourceContainerSite,
    placeStorageSite, placeTowerSite, placeLinkSite,
    isControllerLink: isRcl5ControllerLink, isExtensionLink: isRcl5ExtensionLink
  });
  // Progression uses controller ownership, including pre-spawn bootstrap rooms.
  // Other workforce/registry loops retain their established spawn scope.
  for (const room of ownedInfrastructureRooms(Game.rooms)) {
    const situation = getRoomSituation(room);
    reconcileInfrastructure(room, { allowSlowPlanning,
      optionalConstruction: situation.policy.permissions.optionalConstruction });
  }
  const ownedRooms = new Set(Object.values(Game.spawns).map(spawn => spawn.room.name));
  for (const roomName of ownedRooms) {
    const room = Game.rooms[roomName];
    if (!room) continue;
    const purposesRefreshed = !room.memory.containerPurposes ||
      scheduledRoomTick(room, 20, 5);
    if (purposesRefreshed) {
      refreshContainerPurposes(room);
    }
    // Keep the shared store inventory present even when no carrier happens to
    // request it this tick. Refresh immediately after purpose classification so
    // the remembered list never describes a container using an old purpose.
    getEnergyStoreRegistry(room, purposesRefreshed);
  }
  // Traffic exists anywhere our creeps travel, not only in rooms containing
  // one of our spawns. Record and draw heatmaps in every currently visible
  // room with our creeps; construction authority remains in the owned loop.
  const trafficByRoom = {};
  for (const room of Object.values(Game.rooms)) {
    if (getRoomCreeps(room).length === 0) continue;
    trafficByRoom[room.name] = updateTrafficHeatmap(room);
    if (!ownedRooms.has(room.name) && scheduledRoomTick(room, 10, 2)) {
      updateOutpostStatus(room);
    }
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
    // Link cooldowns are measured in ticks, so operate the completed network
    // every tick even when no visual or construction pass needs road paths.
    runLinks(room);
    const roadPlacementDue = allowSlowPlanning &&
      scheduledRoomTick(room, 20);
    if (!shouldPrepareRoadPlan({
      renderPlanningVisuals, roadPlacementDue
    })) continue;
    const paths = getImportantRoadPaths(room);
    const travelPaths = getImportantTravelPaths(room);
    const interRoomTravelPaths = getInterRoomTravelPaths(room);
    // The shared road network owns highway placement and direction hints.
    // Build within the corridors where multiple important-place routes
    // converge. The compact canonical plan still owns the total road budget,
    // preventing the richer visual network from increasing the road cap.
    const plannedPaths = getConvergedTravelPaths(travelPaths);
    const controllerFanPaths = getControllerFanPaths(room);
    const infrastructureServicePaths = getInfrastructureServicePaths(room);
    const infrastructureRoadPaths = getInfrastructureRoadPaths(room);
    const localRoadPaths = [...plannedPaths, ...controllerFanPaths,
      ...infrastructureServicePaths, ...infrastructureRoadPaths];
    const controllerLevel = room.controller ? room.controller.level : 0;
    const roadBudget = getRoadBudget(room,
      [...paths, ...infrastructureServicePaths], controllerLevel);
    if (renderPlanningVisuals) {
      drawInterRoomRoadLinks(room);
      drawRoadPlan(room, [
        ...paths,
        ...localRoadPaths,
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
          ...getConvergedTravelPaths(getImportantTravelPaths(relatedRoom)),
          ...(interRoomTravelPaths[relatedRoomName] || [])
        ]);
      }
    }
    // Core placement is reconciled above on capability changes and bounded
    // retries. Roads retain the shared corridor budgets and staggered cadence.
    if (roadPlacementDue) {
      // Remembered infrastructure paths include source-wall tunnels and other
      // access that keeps harvesting viable. Reopen those even while optional
      // construction is paused; ordinary layout growth remains gated below.
      if (!roadsPaused(room) && !room.memory.roadNetworkPlan) {
        placeRoadSite(room, infrastructureRoadPaths, traffic, roadBudget);
      }
      if (situation.policy.permissions.optionalConstruction) {
        placeBorderRelaySite(room, interRoomTravelPaths);
        for (const survey of [room.memory.leftSurvey,
          room.memory.southSurvey, room.memory.southwestSurvey]) {
          const outpostRoom = survey && survey.active &&
            Game.rooms[survey.targetRoom];
          if (outpostRoom) {
            placeOutpostBorderCacheSite(room, outpostRoom,
              interRoomTravelPaths);
          }
        }
        const priorityStructureQueued = [STRUCTURE_CONTAINER,
          STRUCTURE_EXTENSION, STRUCTURE_STORAGE].some(type =>
          getRoomSitesByType(room, type).length > 0);
        if (!roadsPaused(room) && !priorityStructureQueued && !room.memory.roadNetworkPlan) {
          placeRoadSite(room, localRoadPaths, traffic, roadBudget);
        }
      }
    }
  }

  cpuStages.mark('infrastructure');
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
    target.structureType === STRUCTURE_CONTAINER &&
    getContainerPurpose(target.room, target.pos) === 'controller';
  const isControllerLink = target => target && target.room &&
    target.structureType === STRUCTURE_LINK &&
    isRcl5ControllerLink(target.room, target);
  const isExtensionLink = target => target && target.room &&
    target.structureType === STRUCTURE_LINK &&
    isRcl5ExtensionLink(target.room, target);
  const canWithdrawFrom = (creep, target) => {
    if (!target || !target.store) return false;
    // Collection must move energy toward the assigned sink, never withdraw
    // from that sink and immediately put the same load back.
    const lane = creep.memory.demandLane;
    if (lane === 'storage' && target.structureType === STRUCTURE_STORAGE) {
      return false;
    }
    if ((lane === 'storage' || lane === 'refill-buffer') &&
        (isExtensionRefillBuffer(creep.room, target) ||
          isExtensionLink(target))) return false;
    if(creep.memory.role==='hauler'&&!creep.memory.refillSpecialist&&
        (isExtensionRefillBuffer(creep.room,target)||isExtensionLink(target)))return false;
    if (target.structureType === STRUCTURE_STORAGE) {
      return Boolean(target.my);
    }
    if (target.structureType === STRUCTURE_LINK) {
      return (creep.memory.role === 'upgrader' && isControllerLink(target)) ||
        (creep.memory.role === 'refiller' ||
          creep.memory.role === 'hauler' ||
          creep.memory.role === 'remote-hauler') && isExtensionLink(target);
    }
    if (target.structureType !== STRUCTURE_CONTAINER) return false;
    // The extension buffer is reserved spawn fuel. Logistics specialists may
    // move it into the spawn network, but builders and upgraders must use
    // storage, source containers, or the controller buffer instead.
    if (isExtensionRefillBuffer(creep.room, target) &&
        creep.memory.role !== 'refiller' &&
        creep.memory.role !== 'hauler' &&
        creep.memory.role !== 'remote-hauler') {
      return false;
    }
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
    const reservedSource = creep.memory.sourceReserve ||
      creep.memory.sourceReplacement;
    if (reservedSource && hasWorkParts(creep) &&
        !creep.memory.remoteRoom && !creep.memory.remoteTeam &&
        !Number.isInteger(creep.memory.remoteSlot)) {
      creep.memory.role = 'harvester';
      creep.memory.preferredSource = reservedSource;
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
    if (creep.memory.staffingRetire || creep.memory.role === 'retire') {
      assignedCreeps[creep.name] = true;
    } else if (isActiveDefenseAssignment(creep, Game.rooms) ||
        creep.memory.role === 'defender') {
      assignedCreeps[creep.name] = true;
    } else if (enforceAssignmentContract(creep) ||
        creep.memory.assignmentKind) {
      // Spawn selection and workforce allocation consume the same durable
      // contract. General allocation may count this creep, but may not infer a
      // different job from its body shape.
      assignedCreeps[creep.name] = true;
    } else if (creep.memory.role === CONTROLLER_BRIGADE_ROLE) {
      assignedCreeps[creep.name] = true;
    } else if (isExpansionBuilder(creep)) {
      assignedCreeps[creep.name] = true;
    } else if ((creep.memory.role === 'remote-miner' ||
          creep.memory.role === 'remote-hauler' || creep.memory.role === 'remote-reserver' ||
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
        creep.getActiveBodyparts(WORK) > 0 &&
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
        creep.memory.role === 'hauler' && !hasBuilderBody(creep) &&
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
        creep.memory.role !== 'builder' &&
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
        !assignedCreeps[creep.name] &&
        creep.memory.role === 'hauler' &&
        creep.memory.task === 'build' && hasBuilderBody(creep)) ||
        roomCreeps.find(creep => !assignedCreeps[creep.name] &&
          creep.memory.role === 'hauler' && hasBuilderBody(creep)) ||
        roomCreeps.find(creep => !assignedCreeps[creep.name] &&
          creep.memory.role === 'worker' && hasBuilderBody(creep));
      if (!builder) break;
      delete assignedCreeps[builder.name];
      builder.memory.role = 'builder';
      builder.memory.builderScope = 'local';
      builder.memory.builderMission = 'build';
      builder.memory.assignmentBuilderMission = 'build';
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
        repairBuilder.memory.assignmentBuilderMission = 'repair';
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
        const reservedReplacement = roomCreeps.filter(creep =>
          !assignedCreeps[creep.name] && hasWorkParts(creep) &&
          (creep.spawning || hasLocalReplacementLife(creep)) &&
            (creep.memory.sourceReserve === entry.source.id ||
              creep.memory.sourceReplacement === entry.source.id ||
              creep.memory.preferredSource === entry.source.id))
          .sort((a, b) =>
            Number(Boolean(b.memory.sourceReserve ||
              b.memory.sourceReplacement)) -
              Number(Boolean(a.memory.sourceReserve ||
                a.memory.sourceReplacement)) ||
            b.getActiveBodyparts(WORK) - a.getActiveBodyparts(WORK) ||
            (b.ticksToLive || 1500) - (a.ticksToLive || 1500))[0];
        const viableStationMiner = room.lookForAt(LOOK_CREEPS,
          entry.container.pos.x, entry.container.pos.y)
          .find(creep => roomCreeps.includes(creep) &&
            !assignedCreeps[creep.name] && hasWorkParts(creep) &&
            (creep.spawning || hasLocalReplacementLife(creep)));
        // A reserved viable replacement owns the lane before the aging creep
        // currently standing on its container. Choosing the old occupant first
        // releases the replacement as surplus and reopens the same spawn gap.
        miner = reservedReplacement || viableStationMiner ||
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
      if (miner.memory.sourceReserve &&
          miner.memory.sourceReserve !== entry.source.id) {
        delete miner.memory.sourceReserve;
      }
      if (miner.memory.sourceReplacement &&
          miner.memory.sourceReplacement !== entry.source.id) {
        delete miner.memory.sourceReplacement;
      }
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
    let sourceWorkCount = Object.values(miners).reduce((total, creep) =>
      total + creep.getActiveBodyparts(WORK), 0) +
      roomCreeps.filter(creep => creep.memory.role === 'rebalancer' &&
        creep.memory.rebalancerSource).reduce((total, creep) =>
        total + creep.getActiveBodyparts(WORK), 0);
    const sourceWorkTarget = getRoomSources(room).reduce((total, source) =>
      total + Math.ceil(source.energyCapacity / ENERGY_REGEN_TIME /
        HARVEST_POWER), 0);
    let haulerCount = roomHaulers[room.name] || 0;
    const haulerTarget = getRoomSituation(room).targets.hauler;
    // Reserve enough WORK at each individual source before the generic role
    // allocator looks only at the room-wide total. Otherwise a strong S2 body
    // can make S1 appear covered, demoting S1's replacement and causing the
    // spawn to buy that same replacement again on the next tick.
    for (const source of getRoomSources(room)) {
      const requiredWork = Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER);
      let assignedCount = miners[source.id] ? 1 : 0;
      const minimumCount = getSourceMinerMinimum(room, source);
      let assignedWork = miners[source.id]
        ? miners[source.id].getActiveBodyparts(WORK) : 0;
      assignedWork += roomCreeps.filter(creep =>
        creep.memory.role === 'rebalancer' &&
        creep.memory.rebalancerSource === source.id)
        .reduce((total, creep) => total + creep.getActiveBodyparts(WORK), 0);
      const candidates = roomCreeps.filter(creep =>
        !assignedCreeps[creep.name] && hasWorkParts(creep) &&
        (creep.memory.sourceReserve === source.id ||
          creep.memory.sourceReplacement === source.id ||
          creep.memory.preferredSource === source.id ||
          creep.memory.harvestSource === source.id))
        .sort((a, b) =>
          Number(b.memory.sourceReserve === source.id) -
            Number(a.memory.sourceReserve === source.id) ||
          b.getActiveBodyparts(WORK) - a.getActiveBodyparts(WORK) ||
          b.ticksToLive - a.ticksToLive);
      for (const creep of candidates) {
        if (assignedWork >= requiredWork && assignedCount >= minimumCount) break;
        creep.memory.role = 'harvester';
        creep.memory.preferredSource = source.id;
        assignedCreeps[creep.name] = true;
        sourceWorkerCount++;
        const work = creep.getActiveBodyparts(WORK);
        sourceWorkCount += work;
        assignedWork += work;
        assignedCount++;
      }
      // The room-wide recovery planner owns newly promoted and retained
      // recovery bodies for this tick. Even if a later roster calculation
      // sees temporary excess, it may not turn them back into builders before
      // they execute the assignment that was just made.
      for (const creep of roomCreeps.filter(candidate =>
        !assignedCreeps[candidate.name] &&
        candidate.memory.sourceRecoveryPlanTick === Game.time &&
        candidate.memory.sourceReserve === source.id)) {
        creep.memory.role = 'harvester';
        creep.memory.preferredSource = source.id;
        assignedCreeps[creep.name] = true;
        sourceWorkerCount++;
        const work = creep.getActiveBodyparts(WORK);
        sourceWorkCount += work;
        assignedWork += work;
      }
    }
    // Recovery reservations that were not needed to reach the source's WORK
    // floor must rejoin the flexible labor pool before generic role assignment.
    // Otherwise the generic allocator preserves every reserved body as another
    // harvester, permanently overstaffing the same source.
    for (const creep of roomCreeps.filter(candidate =>
      !assignedCreeps[candidate.name] &&
      candidate.memory.role === 'harvester' &&
      (candidate.memory.sourceReserve ||
        candidate.memory.sourceReplacement))) {
      creep.memory.role = 'worker';
      delete creep.memory.preferredSource;
      delete creep.memory.harvestSource;
      delete creep.memory.sourceReplacement;
      delete creep.memory.sourceReserve;
      delete creep.memory.harvestX;
      delete creep.memory.harvestY;
    }
    const rolePriority = { harvester: 0, miner: 1, worker: 2, hauler: 3 };
    const roleCandidates = roomCreeps
      .filter(creep => !assignedCreeps[creep.name])
      .sort((a, b) => {
        const aPriority = rolePriority[a.memory.role] === undefined
          ? 4 : rolePriority[a.memory.role];
        const bPriority = rolePriority[b.memory.role] === undefined
          ? 4 : rolePriority[b.memory.role];
        return aPriority - bPriority ||
          b.getActiveBodyparts(WORK) - a.getActiveBodyparts(WORK) ||
          a.name.localeCompare(b.name);
      });
    ({ sourceWorkerCount, sourceWorkCount, haulerCount } =
      assignUnallocatedRoles({
      candidates: roleCandidates,
      sourceWorkerCount,
      sourceWorkerLimit: minerLimit,
      sourceWorkCount,
      sourceWorkTarget,
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
      }
      // The explicit roomBuilders loop above already filled the sustainable
      // builder target. A remaining flexible WORK body stays a worker; turning
      // every leftover body into a builder is how one build slot became eleven
      // builder identities crowding the same construction site.
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
          (sourceSpotCounts[source.id] ||
            sourceWorkerTargets[source.id] || 0) - dedicatedMinerCount -
            rebalancerCount),
        minimumRemaining: Math.max(0, getSourceMinerMinimum(room, source) - dedicatedMinerCount),
        workDeficit: Math.max(0, requiredWork - dedicatedWork)
      };
    });
    const dedicatedMinerNames = new Set(Object.values(miners)
      .map(creep => creep.name));
    const harvesters = roomCreeps
      .filter(creep => creep.memory.role === 'harvester' &&
        !dedicatedMinerNames.has(creep.name))
      .sort((a, b) =>
        Number(b.memory.sourceRecoveryPlanTick===Game.time) -
          Number(a.memory.sourceRecoveryPlanTick===Game.time) ||
        Number(hasLocalReplacementLife(b)) - Number(hasLocalReplacementLife(a)) ||
        b.getActiveBodyparts(WORK) - a.getActiveBodyparts(WORK) ||
        a.name.localeCompare(b.name));
    const sourceAssignments = planSourceAssignments({
      needs: sourceNeeds,
      candidates: harvesters.map(creep => ({
        creep,
        preferredSource: creep.memory.preferredSource,
        sourceReserve: creep.memory.sourceReserve,
        sourceReplacement: creep.memory.sourceReplacement
      })),
      getWork: candidate => candidate.creep.getActiveBodyparts(WORK)
    }).assignments;
    for (const assignment of sourceAssignments) {
      const creep = assignment.candidate.creep;
      const preferredSource = assignment.sourceId;
      if (!preferredSource) {
        // A source roster can contract after replacements arrive. Do not leave
        // the displaced body labelled harvester with no source: carrier-shaped
        // bodies join local logistics, while WORK-heavy bodies stay flexible.
        const carryParts = creep.getActiveBodyparts(CARRY);
        const workParts = creep.getActiveBodyparts(WORK);
        creep.memory.role = carryParts >= Math.max(2, workParts * 2)
          ? 'hauler' : 'worker';
        delete creep.memory.preferredSource;
        delete creep.memory.sourceReplacement;
        delete creep.memory.sourceReserve;
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
      if (creep.memory.preferredSource !== preferredSource) {
        creep.memory.preferredSource = preferredSource;
        if (creep.memory.sourceReserve !== preferredSource) {
          delete creep.memory.sourceReserve;
        }
        if (creep.memory.sourceReplacement !== preferredSource) {
          delete creep.memory.sourceReplacement;
        }
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

  // A lowered staffing target must not leave a large surplus parked forever.
  // Keep the best bodies for the hard builder capacity, repurpose compatible
  // bodies into real gaps, and recycle only the remainder. Limit concurrent
  // recycling so surplus creeps do not form another traffic jam at the spawn.
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const policyRoles = getRoomSituation(room).policy.roles;
    const localCreeps = creeps.filter(creep =>
      creep.memory.home === room.name && creep.room.name === room.name);
    const localBuilders = localCreeps.filter(creep =>
      isLocalBuilder(creep) && !isBuilder(creep, 'local', 'tunnel') &&
      !creep.memory.staffingRetire);
    const bodyScore = creep => creep.getActiveBodyparts(WORK) * 10000 +
      creep.getActiveBodyparts(CARRY) * 100 +
      creep.getActiveBodyparts(MOVE) * 10 + (creep.ticksToLive || 0);
    const keep = new Set();
    // Desired is the sustainable standing roster. Maximum is permission for a
    // bounded emergency surge, not a number of builder identities to retain
    // after demand falls.
    const repairCapacity = policyRoles.repairBuilder.desired;
    localBuilders.filter(creep =>
      creep.memory.builderMission === 'repair')
      .sort((a, b) => bodyScore(b) - bodyScore(a))
      .slice(0, repairCapacity).forEach(creep => keep.add(creep.name));
    const buildCapacity = policyRoles.builder.desired;
    localBuilders.filter(creep => !keep.has(creep.name) &&
      creep.memory.builderMission !== 'repair')
      .sort((a, b) => bodyScore(b) - bodyScore(a))
      .slice(0, buildCapacity).forEach(creep => keep.add(creep.name));
    let surplus = localBuilders.filter(creep => !keep.has(creep.name))
      .sort((a, b) => bodyScore(b) - bodyScore(a));

    const currentUpgraders = localCreeps.filter(creep =>
      creep.memory.role === 'upgrader' && !creep.memory.staffingRetire).length;
    let upgraderGap = Math.max(0,
      policyRoles.upgrader.desired - currentUpgraders);
    surplus=surplus.sort((a,b)=>Number(b.getActiveBodyparts(WORK)>=(room.memory.laborPlan?.upgrader.workParts||4))-Number(a.getActiveBodyparts(WORK)>=(room.memory.laborPlan?.upgrader.workParts||4)));
    while (upgraderGap > 0 && surplus.length > 0 &&
        surplus[0].getActiveBodyparts(WORK)>=(room.memory.laborPlan?.upgrader.workParts||4)) {
      const creep = surplus.shift();
      creep.memory.role = 'upgrader';
      creep.memory.bodyType = BODY_TYPES.CONTROLLER;
      delete creep.memory.builderScope;
      delete creep.memory.builderMission;
      delete creep.memory.buildTarget;
      delete creep.memory.repairTarget;
      delete creep.memory.workJob;
      delete creep.memory.preferredSource;
      delete creep.memory.harvestSource;
      delete creep.memory.sourceReplacement;
      delete creep.memory.sourceReserve;
      console.log(`[${Game.time}] ${creep.name} surplus builder -> upgrader`);
      upgraderGap--;
    }

    const currentHaulers = localCreeps.filter(creep =>
      creep.memory.role === 'hauler' && !creep.memory.staffingRetire).length;
    let haulerGap = Math.max(0, policyRoles.hauler.desired - currentHaulers);
    for (const creep of surplus.slice()) {
      if (haulerGap <= 0) break;
      const work = creep.getActiveBodyparts(WORK);
      const carry = creep.getActiveBodyparts(CARRY);
      if (carry < Math.max(2, work * 2)) continue;
      creep.memory.role = 'hauler';
      creep.memory.bodyType = BODY_TYPES.HAULER;
      delete creep.memory.builderScope;
      delete creep.memory.builderMission;
      delete creep.memory.buildTarget;
      delete creep.memory.repairTarget;
      delete creep.memory.workJob;
      delete creep.memory.preferredSource;
      delete creep.memory.harvestSource;
      delete creep.memory.sourceReplacement;
      delete creep.memory.sourceReserve;
      surplus = surplus.filter(candidate => candidate.name !== creep.name);
      console.log(`[${Game.time}] ${creep.name} surplus builder -> hauler`);
      haulerGap--;
    }

    const homePopulation = creeps.filter(creep =>
      creep.memory.home === room.name).length;
    const populationLimit = getPopulationLimit(
      getWorkerLimits(room).workerLimit,
      room.memory.controllerBrigadePlan,
      isControllerBrigadeBudgeted(room),
      getActiveControllerBrigadeCount(room, localCreeps),
      getPopulationTransitionAllowance(room));
    const retiringCount = localCreeps.filter(creep =>
      creep.memory.staffingRetire || creep.memory.role === 'retire').length;
    const retirees = selectRetirementCandidates({
      population: homePopulation, populationLimit, retiringCount,
      candidates: surplus, score: bodyScore
    });
    for (const creep of retirees) {
      creep.memory.retiredRole = creep.memory.role;
      creep.memory.staffingRetire = true;
      creep.memory.role = 'retire';
      delete creep.memory.builderScope;
      delete creep.memory.builderMission;
      delete creep.memory.buildTarget;
      delete creep.memory.repairTarget;
      delete creep.memory.workJob;
      delete creep.memory.preferredSource;
      delete creep.memory.harvestSource;
      delete creep.memory.sourceReplacement;
      delete creep.memory.sourceReserve;
      console.log(`[${Game.time}] ${creep.name} surplus population -> ` +
        `recycle (${homePopulation}/${populationLimit})`);
    }
  }

  for (const creep of creeps) {
    if (creep.memory.staffingRetire || creep.memory.role === 'retire' ||
        creep.memory.role === 'defender' ||
        creep.memory.role === 'remote-miner' ||
        creep.memory.role === 'remote-hauler' || creep.memory.role === 'remote-reserver' ||
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

  // Role allocation above is allowed to change identities. Normalize every
  // ownership field once more before demand planning and execution so no
  // previous job can reclaim the creep on the next tick.
  reconcileCreepAssignments(creeps);
  for(const creep of creeps)reconcileLaborBody(creep);

  // Calculate total room demand once, then reserve one work lane per mobile
  // creep. Individual task queues execute these assignments instead of every
  // creep independently choosing the same first available job.
  const roomDemandPlans = {};
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    const roomCreeps = creeps.filter(creep => creep.room.name === room.name);
    const situation = getRoomSituation(room);
    const homePopulation = Object.values(Game.creeps).filter(creep =>
      creep.memory.home === room.name).length;
    const populationLimit = getPopulationLimit(
      getWorkerLimits(room).workerLimit,
      room.memory.controllerBrigadePlan,
      isControllerBrigadeBudgeted(room),
      getActiveControllerBrigadeCount(room),
      getPopulationTransitionAllowance(room));
    const populationEmergency = homePopulation > populationLimit;
    const assignments = {};
    const slowInventory = getSlowWorkInventory(room);
    const extensionLimit = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION] &&
      CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
    const builtExtensionCount = slowInventory.structures.filter(structure =>
      structure.structureType === STRUCTURE_EXTENSION).length;
    const storageDeferred = builtExtensionCount < extensionLimit;
    const tunnelRecoverySite = getSource2TunnelSite(room);
    const sites = slowInventory.sites.filter(site =>
      (!roadsPaused(room) || site.structureType !== STRUCTURE_ROAD) &&
      (!storageDeferred || site.structureType !== STRUCTURE_STORAGE) &&
      (situation.policy.permissions.optionalConstruction ||
        site.structureType === STRUCTURE_CONTAINER ||
        site.structureType === STRUCTURE_SPAWN ||
        tunnelRecoverySite && site.id === tunnelRecoverySite.id));
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

    const workCreeps = roomCreeps.filter(creep => ['builder','worker','upgrader'].includes(creep.memory.role) && hasWorkParts(creep) &&
      creep.getActiveBodyparts(CARRY)>0 &&
      (canBodyTypeRunLane(creep.memory.bodyType, 'upgrade') ||
        canBodyTypeRunLane(creep.memory.bodyType, 'build', creep.memory.role)) &&
      creep.memory.role !== 'retire' &&
      !isBuilder(creep, 'local', 'tunnel') &&
      !isOutpostBuilder(creep) && !isExpansionBuilder(creep));
    // Carriers may use their WORK part when logistics are covered, but they
    // are not delivery recipients. Counting haulers here made them reserve
    // one another as supply targets, then stage beside the controller when
    // the executor rejected that invalid handoff.
    const supplyRecipients = workCreeps.slice();
    for (const creep of workCreeps.filter(worker =>
      worker.memory.role === 'upgrader' ||
      worker.memory.bodyType === BODY_TYPES.CONTROLLER)) {
      assignments[creep.name] = 'upgrade';
    }

    if (situation.mode === 'controller-emergency') {
      for (const creep of workCreeps) assignments[creep.name] = 'upgrade';
    } else {
      let repairSlots = repairTargets.length > 0
        ? Math.max(1, situation.targets.repairBuilder)
        : 0;
      const availableWorkers = workCreeps.filter(creep =>
        creep.memory.role !== 'upgrader' && (
        creep.memory.bodyType === BODY_TYPES.WORKER ||
          isLocalBuilder(creep) || creep.memory.role==='worker'))
        .sort((a, b) =>
          Number(b.memory.builderMission === 'repair') -
            Number(a.memory.builderMission === 'repair') ||
          a.name.localeCompare(b.name));
      const linksPending = sites.some(site =>
        site.structureType === STRUCTURE_LINK);
      // Full source buffers mean hauling is stalled because the controller
      // buffer is not being consumed quickly enough. Keep one builder moving
      // construction, but send the remaining WORK-heavy bodies to the RC so
      // carriers can unload and return to the sources.
      const rawConstructionCrew = Math.max(constructionPriority
        .desiredCrewTotal(sites, linksPending, room.name),
        room.memory.roadBacklog?.missing > 0 && sites.some(site =>
          site.structureType === STRUCTURE_ROAD)
          ? situation.policy.roles.builder.desired : 0);
      const constructionScale = situation.policy.budgets &&
        situation.policy.budgets.constructionCrewScale || 1;
      const desiredConstructionCrew = Math.min(situation.targets.builder,rawConstructionCrew > 0
        ? Math.max(1, Math.ceil(rawConstructionCrew * constructionScale)) : 0);
      let buildSlots = situation.mode === 'logistics-backup'
        ? Math.min(2, availableWorkers.length, desiredConstructionCrew)
        : Math.min(availableWorkers.length, desiredConstructionCrew);
      const balancedWork=allocateBalancedWork({workers:availableWorkers,repairTargets:repairTargets.length,buildSlots});
      for (const creep of availableWorkers) {
        if (balancedWork.repair.has(creep.name)) assignments[creep.name]='repair';
        else if (balancedWork.build.has(creep.name)) assignments[creep.name]='build';
        else assignments[creep.name]=populationEmergency?'standby':'upgrade';
      }
    }

    // A second controller buffer unlocks the stationary brigade and relieves
    // the upgrader clump. Give that small, finite project an actual crew
    // instead of leaving one builder to finish it while dozens keep upgrading.
    const controllerContainerSite = sites.find(site =>
      site.structureType === STRUCTURE_CONTAINER &&
      site.pos.getRangeTo(room.controller) <= 3);
    if (controllerContainerSite &&
        situation.mode !== 'controller-emergency') {
      const remaining = controllerContainerSite.progressTotal -
        controllerContainerSite.progress;
      const constructionScale = situation.policy.budgets &&
        situation.policy.budgets.constructionCrewScale || 1;
      const desiredCrew = Math.max(1, Math.ceil(Math.min(6,
        Math.max(2, Math.ceil(remaining / 1000))) * constructionScale));
      let assignedCrew = workCreeps.filter(creep =>
        assignments[creep.name] === 'build').length;
      for (const creep of workCreeps.filter(candidate =>
        isLocalBuilder(candidate) && assignments[candidate.name] === 'upgrade')
        .sort((a, b) => a.pos.getRangeTo(controllerContainerSite) -
          b.pos.getRangeTo(controllerContainerSite) ||
          a.name.localeCompare(b.name))) {
        if (assignedCrew >= desiredCrew) break;
        assignments[creep.name] = 'build';
        assignedCrew++;
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
        getContainerPurpose(room, structure.pos) === 'controller'
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
        String(getContainerPurpose(room, structure.pos) || '')
          .startsWith('source:')
    );
    const relayBuffers = roomStructures.filter(structure =>
      structure.structureType === STRUCTURE_CONTAINER &&
        String(getContainerPurpose(room, structure.pos) || '')
          .startsWith('relay:')
    );
    const relayStored = relayBuffers.reduce((total, structure) => total +
      structure.store[RESOURCE_ENERGY], 0);
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
    // Translate the selected situation policy into executable RC lanes. An
    // active operation owns its declared count. Without an operation, normal
    // survival and routine policy may reduce the executable count to one or
    // two based on population pressure and room migration state.
    const assignedUpgraders = workCreeps.filter(creep =>
      assignments[creep.name] === 'upgrade').sort((a, b) =>
      Number(b.memory.role === 'upgrader') -
        Number(a.memory.role === 'upgrader') ||
      b.getActiveBodyparts(WORK) - a.getActiveBodyparts(WORK) ||
      a.name.localeCompare(b.name));
    const operationUpgradeSlots = situation.policy.operations?.upgradePush
      ? situation.policy.operations.upgraderTarget : null;
    const routineUpgradeSlots = operationUpgradeSlots != null
      ? Math.min(assignedUpgraders.length, operationUpgradeSlots)
      : situation.mode === 'controller-emergency'
      ? assignedUpgraders.length
      : populationEmergency ? 1
      : room.memory.singleExtensionLayout?.migration ? 1
      : Math.min(2, Math.max(1, situation.targets.upgrader));
    let overflowRepairSlots = Math.max(0,
      repairTargets.length -
        workCreeps.filter(creep => assignments[creep.name] === 'repair').length);
    let overflowBuildSlots = Math.max(0,
      sites.length -
        workCreeps.filter(creep => assignments[creep.name] === 'build').length);
    for (const creep of assignedUpgraders.slice(routineUpgradeSlots)) {
      if (overflowRepairSlots > 0 && repairTargets.length > 0) {
        assignments[creep.name] = 'repair';
        overflowRepairSlots--;
      } else if (overflowBuildSlots > 0 && sites.length > 0) {
        assignments[creep.name] = 'build';
        overflowBuildSlots--;
      } else {
        assignments[creep.name] = 'standby';
      }
    }
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
    room.memory.homeRefillRecovery=networkRecoveryNeeded({energy:room.energyAvailable,capacity:room.energyCapacityAvailable,previous:room.memory.homeRefillRecovery});
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
    const minimalControllerDuringMove = Boolean(room.memory.singleExtensionLayout &&
      (room.memory.singleExtensionLayout.migration || roomStructures.some(s=>
        s.my && s.structureType===STRUCTURE_EXTENSION &&
        !room.memory.singleExtensionLayout.extensionTiles.some(p=>
          p.x===s.pos.x&&p.y===s.pos.y)))) &&
      situation.mode !== 'controller-emergency';
    const controllerReserveTarget = minimalControllerDuringMove
      ? Math.min(bufferCapacity, Math.max(100, activeUpgraderWork * 25))
      : Math.min(bufferCapacity, Math.max(bufferCapacity * 0.75,
        activeUpgraderWork * 75));
    let urgentBufferDemand = Math.max(0,
      controllerReserveTarget - bufferStored);
    let bufferDemand = Math.max(0,
      (minimalControllerDuringMove ? controllerReserveTarget : bufferCapacity) - bufferStored);
    // Mobile workers collect from fixed local stores. Haulers stock those
    // stores; they do not chase moving creeps for direct handoffs.
    let supplyDemand = 0;
    const storage = room.storage && room.storage.my ? room.storage : null;
    const storageFree = storage
      ? storage.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
    const storageStored = storage
      ? storage.store[RESOURCE_ENERGY] : 0;
    const brigadePlan = room.memory.controllerBrigadePlan;
    const activeBrigadeCount = roomCreeps.filter(creep =>
      creep.memory.role === CONTROLLER_BRIGADE_ROLE).length;
    let brigadeIntakeDemand = minimalControllerDuringMove ? 0 : getBrigadeIntakeDemand({
      plan: brigadePlan,
      activeRelayCount: activeBrigadeCount,
      storageEnergy: storageStored,
      controllerReserveTarget,
      storageCapacity: storage
        ? storage.store.getCapacity(RESOURCE_ENERGY) : 0
    });
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
    supplyDemand = totalSupplyDemand(recipientRemaining);
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
        Number(!(a.memory.dispatchCommitment &&
          a.memory.dispatchCommitment.lane === 'buffer')) -
          Number(!(b.memory.dispatchCommitment &&
            b.memory.dispatchCommitment.lane === 'buffer')) ||
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
    const urgentBufferCarriers = new Set();
    for (const creep of loadedHaulers) {
      delete creep.memory.collectionSourceTarget;
      const carried = creep.store[RESOURCE_ENERGY];
      const fillsSpawn = dedicatedRefillerNames.has(creep.name);
      const commitment = hasLiveDispatchCommitment(creep)
        ? creep.memory.dispatchCommitment : null;
      const committedTarget = commitment &&
        Game.getObjectById(commitment.targetId);
      if ((emergencyEnergyRefill||room.memory.homeRefillRecovery) && refillDemand>0 && refillDemandFor(creep) > 0) {
        // During recovery every loaded local carrier becomes a direct filler.
        // Staging energy in StockSp while spawn is below one worker body only
        // prolongs the emergency.
        assignments[creep.name] = 'refill';
        emergencyRefillDemand = Math.max(0,
          emergencyRefillDemand - carried);
        refillDemand = Math.max(0, refillDemand - carried);
      } else if (!fillsSpawn && situation.mode !== 'controller-emergency' &&
          extensionBufferStored + (extensionBufferTarget -
            extensionBufferStored - extensionBufferDemand) <
              Math.min(500, extensionBufferCapacity * 0.25)) {
        // Fund a short-range filler load before routine RC/storage spending.
        assignments[creep.name] = 'refill-buffer';
        extensionBufferDemand = Math.max(0, extensionBufferDemand - carried);
      } else if (!fillsSpawn && commitment &&
          commitment.lane === 'storage' && storageDemand > 0) {
        assignments[creep.name] = 'storage';
        storageDemand = Math.max(0, storageDemand - carried);
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
      } else if (extensionBufferDemand > 0 || brigadeIntakeDemand > 0) {
        const lane = selectBufferLane(
          extensionBufferDemand, extensionBufferTarget,
          brigadeIntakeDemand, controllerReserveTarget);
        // A stationary brigade's controller lane begins at storage. Feeding
        // the endpoint directly leaves the seated relays permanently empty.
        assignments[creep.name] = lane === 'buffer' ? 'storage' : lane;
        if (lane === 'buffer') {
          brigadeIntakeDemand = Math.max(0,
            brigadeIntakeDemand - carried);
          storageDemand = Math.max(0, storageDemand - carried);
        } else {
          extensionBufferDemand = Math.max(0,
            extensionBufferDemand - carried);
        }
      } else if (urgentBufferDemand > 0) {
        assignments[creep.name] = 'buffer';
        urgentBufferCarriers.add(creep.name);
        urgentBufferDemand = Math.max(0, urgentBufferDemand - carried);
        bufferDemand = Math.max(0, bufferDemand - carried);
      } else if (bufferDemand > 0) {
        assignments[creep.name] = 'buffer';
        bufferDemand = Math.max(0, bufferDemand - carried);
      } else if (supplyDemand > 0) {
        const recipient = selectSupplyRecipient({ carrier: creep,
          recipients: supplyRecipients, remaining: recipientRemaining,
          assignments });
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
    // Flexible WORK bodies normally stay out of logistics. During a measured
    // refill backlog, surplus workers temporarily cover only the capacity the
    // carrier group cannot. Their body family remains WORKER so this relief
    // does not hide the shortage of real HAULER bodies.
    if (energyWorkPhase === 'refill' || emergencyEnergyRefill) {
      const emptyCarrierCapacity = emptyHaulers.reduce((total, carrier) =>
        total + carrier.store.getCapacity(RESOURCE_ENERGY), 0);
      const reliefWorkers = selectLogisticsReliefWorkers(
        workCreeps.filter(worker => worker.memory.role !== 'upgrader' &&
          assignments[worker.name] === 'standby'),
        refillDemand, emptyCarrierCapacity,
        worker => worker.store.getCapacity(RESOURCE_ENERGY));
      for (const creep of reliefWorkers) {
        assignments[creep.name] = 'refill';
        refillDemand = Math.max(0, refillDemand -
          creep.store.getCapacity(RESOURCE_ENERGY));
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
    collectionDemand = Math.max(collectionDemand,
      sourceBacklog + relayStored);
    if (sourcePressure >= 0.8 && sourceStored > 0 && emptyHaulers.length > 0) {
      // Keep one pickup in motion when source buffers are nearly full, even if
      // current delivery demand was just covered by loaded haulers.
      collectionDemand = Math.max(collectionDemand,
        emptyHaulers[0].store.getCapacity(RESOURCE_ENERGY));
    }
    const projectedSourceGroups = buildSourceGroups({
      room, sources, buffers: sourceBuffers, getContainerPurpose,
      getUnreservedEnergy
    });
    const stageSources = sources.filter(source => sourceBuffers.some(buffer =>
      getContainerPurpose(room, buffer.pos) === `source:${source.id}`));
    let stageSourceIndex = 0;
    // Delivery demand can exceed the energy that is currently available at
    // the source buffers. Dispatch only enough empty cargo space to collect
    // that energy; otherwise every idle carrier converges on the same source
    // area and competes for a load that does not exist yet.
    let collectibleEnergy = sourceStored + relayStored +
      storageWithdrawalDemand;
    const extensionLinkSource = roomStructures.find(structure =>
      isExtensionLink(structure) &&
        getUnreservedEnergy(structure) > 0);
    let extensionLinkAvailable = extensionLinkSource
      ? getUnreservedEnergy(extensionLinkSource) : 0;
    collectibleEnergy += extensionLinkAvailable;
    const projectedRelays = relayBuffers.filter(buffer =>
      getUnreservedEnergy(buffer) > 0).map(buffer => ({
      buffer,
      stored: getUnreservedEnergy(buffer)
    })).sort((a, b) => b.stored - a.stored ||
      a.buffer.id.localeCompare(b.buffer.id));
    let remainingSourceBacklog = sourceBacklog;
    for (const creep of emptyHaulers) {
      const ownsOpenRefill = dedicatedRefillerNames.has(creep.name) &&
        refillDemandFor(creep) > 0;
      if ((collectionDemand > 0 || ownsOpenRefill) && collectibleEnergy > 0) {
        assignments[creep.name] = 'collect';
        const cargoCapacity = creep.store.getCapacity(RESOURCE_ENERGY);
        const group = selectSourceGroup(projectedSourceGroups,
          creep.memory.collectionSourceTarget);
        const relay = projectedRelays.find(entry => entry.stored > 0);
        const drainSourceBacklog = group && remainingSourceBacklog > 0;
        if (ownsOpenRefill && extensionLinkSource &&
            extensionLinkAvailable > 0) {
          collectionSources[creep.name] = extensionLinkSource.id;
          delete creep.memory.collectionSourceTarget;
          extensionLinkAvailable = Math.max(0,
            extensionLinkAvailable - cargoCapacity);
        } else if (relay) {
          collectionSources[creep.name] = relay.buffer.id;
          delete creep.memory.collectionSourceTarget;
          relay.stored = Math.max(0, relay.stored - cargoCapacity);
        } else if (storage && storageWithdrawalDemand > 0 &&
            !drainSourceBacklog) {
          collectionSources[creep.name] = storage.id;
          delete creep.memory.collectionSourceTarget;
          storageWithdrawalDemand = Math.max(0,
            storageWithdrawalDemand - cargoCapacity);
        } else if (group) {
          collectionSources[creep.name] = group.source.id;
          creep.memory.collectionSourceTarget = group.source.id;
          group.stored = Math.max(0, group.stored - cargoCapacity);
          remainingSourceBacklog = Math.max(0,
            remainingSourceBacklog - cargoCapacity);
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
          extensionBufferStored < extensionBufferTarget &&
          !urgentBufferCarriers.has(creep.name) ||
        loaded && (previousLane === 'buffer' ||
          previousLane === 'buffer-stage') && bufferFree > 0 &&
          proposedLane !== 'refill-buffer' ||
        loaded && previousLane === 'supply' && supplyTarget &&
          supplyTarget.store.getFreeCapacity(RESOURCE_ENERGY) > 0 ||
        loaded && previousLane === 'storage' && storage &&
          storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      const emergencyRefillOverride = loaded && (emergencyEnergyRefill||room.memory.homeRefillRecovery) &&
        proposedLane === 'refill';
      const extensionReserveOverride = loaded && proposedLane === 'refill-buffer' &&
        extensionBufferStored < Math.min(500, extensionBufferCapacity * 0.25);
      if (previousLane && previousLane !== proposedLane &&
          (fillsSpawn ? previousWasRefill : !previousWasRefill) &&
          previousStillUseful && !emergencyRefillOverride &&
          !extensionReserveOverride) {
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
        sourceStored, relayStored, extensionBufferStored,
        extensionBufferCapacity,
        upgradeSlots: routineUpgradeSlots, buildTargets: sites.length,
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
        hasWorkParts(creep) && creep.store[RESOURCE_ENERGY] > 0 &&
          creep.store.getFreeCapacity(RESOURCE_ENERGY) < creep.getActiveBodyparts(WORK) * HARVEST_POWER ||
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
      if (spotX < 0 || spotX > 49 || spotY < 0 || spotY > 49) return false;
      const tileStructures = creep.room.lookForAt(
        LOOK_STRUCTURES, spotX, spotY);
      const completedTunnelRoad = tileStructures.some(structure =>
        structure.structureType === STRUCTURE_ROAD);
      if (terrain.get(spotX, spotY) === TERRAIN_MASK_WALL &&
          !completedTunnelRoad) return false;
      const blocked = tileStructures.some(structure =>
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
      : getRoomSources(creep.room).filter(source => source.energy > 0);
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
      },
      postBattleRooms: postBattleSalvageRooms
    });

  const plannedRefillTargets = planRefillTargets({
    rooms: Object.values(Game.rooms), creeps, roomDemandPlans, Game,
    RESOURCE_ENERGY, getRoomRefillStructures, isRefillTargetFor,
    getRefillPriority
  });

  // Turn the room's demand calculation into authoritative, durable jobs.
  // The job survives future planning passes while its source/target remains
  // useful; only a higher-priority room emergency may replace it.
  const workDispatch = createWorkDispatch({ Game, RESOURCE_ENERGY });
  const workProposals = {};
  const lanePriority = (room, demandPlan, lane) => {
    const extensionDry = demandPlan.demand.extensionBufferStored <
      demandPlan.demand.extensionBufferCapacity * 0.25;
    if (lane === 'refill' && room.energyAvailable < workerCost) return 0;
    if (lane === 'refill-buffer' && extensionDry) return 1;
    if (lane === 'repair') return 2;
    if (lane === 'build') return 3;
    if (lane === 'refill') return 4;
    if (lane === 'buffer') return 5;
    if (lane === 'collect') return 6;
    if (lane === 'upgrade') return 8;
    return 9;
  };
  for (const creep of creeps) {
    const demandPlan = roomDemandPlans[creep.room.name];
    if (!demandPlan) continue;
    const lane = demandPlan.assignments[creep.name];
    if(lane==='build'&&creep.memory.workJob?.lane==='repair'&&demandPlan.demand.fixTargets>0)workDispatch.complete(creep);
    if (lane === 'standby' && creep.memory.workJob) {
      workProposals[creep.name] = { lane, cancelCurrent: true, priority: 0 };
      continue;
    }
    let sourceId = lane === 'collect'
      ? demandPlan.collectionSources[creep.name] : null;
    let targetId = null;
    if (lane === 'refill') targetId = plannedRefillTargets[creep.name];
    else if (lane === 'refill-buffer') {
      const buffer = getRoomStructures(creep.room).find(structure =>
        isExtensionRefillBuffer(creep.room, structure) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
      targetId = buffer && buffer.id;
    } else if (lane === 'buffer') {
      const roomStructures = getRoomStructures(creep.room);
      const controllerEndpoint = roomStructures.find(isControllerLink);
      const extensionEndpoint = roomStructures.find(isExtensionLink);
      const linkFeed = controllerEndpoint && extensionEndpoint &&
        controllerEndpoint.store[RESOURCE_ENERGY] < 400 &&
        extensionEndpoint.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        ? extensionEndpoint : null;
      const buffer = linkFeed || roomStructures.find(structure =>
        structure.structureType === STRUCTURE_CONTAINER &&
        structure.pos.getRangeTo(creep.room.controller) <= 3 &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
      targetId = buffer && buffer.id;
    } else if (lane === 'storage') {
      targetId = creep.room.storage && creep.room.storage.id;
    } else if (lane === 'supply') {
      const recipient = Game.creeps[demandPlan.supplyTargets[creep.name]];
      targetId = recipient && recipient.id;
    } else if (lane === 'build') targetId = creep.memory.buildTarget;
    else if (lane === 'repair') targetId = creep.memory.repairTarget;
    else if (lane === 'upgrade') targetId = creep.room.controller.id;
    if (lane !== 'collect' && Array.isArray(creep.memory.energySources)) {
      sourceId = creep.memory.energySources[creep.memory.energySources.length - 1];
    }
    // Source pressure is a proposal for the next trip, not permission to
    // cancel a useful admitted pickup. workDispatch owns its completion.
    const restoreExtensionReserve = lane === 'refill-buffer' &&
      demandPlan.demand.extensionBufferStored <
        Math.min(500, demandPlan.demand.extensionBufferCapacity * 0.25) &&
      creep.memory.workJob &&
      ['buffer', 'storage', 'supply'].includes(creep.memory.workJob.lane);
    const restoreSpawnNetwork=lane==='refill'&&creep.room.memory.homeRefillRecovery&&
      creep.memory.workJob&&['buffer','storage','supply','refill-buffer'].includes(creep.memory.workJob.lane);
    if(restoreSpawnNetwork)delete creep.memory.dispatchCommitment;
    if (restoreExtensionReserve) delete creep.memory.dispatchCommitment;
    const rerouteRefill = lane === 'refill' && targetId &&
      creep.memory.workJob && creep.memory.workJob.lane === 'refill' &&
      creep.memory.workJob.targetId !== targetId;
    if (rerouteRefill) delete creep.memory.dispatchCommitment;
    const rerouteBuffer = lane === 'buffer' && targetId &&
      creep.memory.workJob && creep.memory.workJob.lane === 'buffer' &&
      creep.memory.workJob.targetId !== targetId;
    workProposals[creep.name] = {
      lane, sourceId, targetId,
      amount: lane === 'collect'
        ? creep.store.getFreeCapacity(RESOURCE_ENERGY)
        : creep.store[RESOURCE_ENERGY],
      priority: lanePriority(creep.room, demandPlan, lane),
      cancelCurrent: Boolean(creep.memory.waitState === 'blocked' &&
        (creep.memory.workJob?.lane !== 'build' ||
          (creep.memory.waitAge?.age || 0) >= 5) ||
        rerouteBuffer || rerouteRefill ||
        restoreExtensionReserve || restoreSpawnNetwork),
      reason: rerouteRefill
        ? 'refill matcher selected a nearer or higher-priority target'
        : rerouteBuffer
          ? 'assigned controller buffer became invalid'
          : 'previous assignment completed or invalid'
    };
  }
  const ownedWorkJobs = workDispatch.reconcile(creeps, workProposals);
  for (const [creepName, job] of Object.entries(ownedWorkJobs)) {
    const creep = Game.creeps[creepName];
    const plan = creep && roomDemandPlans[creep.room.name];
    if (!creep || !plan) continue;
    plan.assignments[creepName] = job.lane;
    if (job.lane === 'collect' && job.sourceId) {
      plan.collectionSources[creepName] = job.sourceId;
    } else if (job.lane === 'refill' && job.targetId) {
      plannedRefillTargets[creepName] = job.targetId;
      creep.memory.refillTarget = job.targetId;
    } else if (job.lane === 'build' && job.targetId) {
      creep.memory.buildTarget = job.targetId;
    } else if (job.lane === 'repair' && job.targetId) {
      creep.memory.repairTarget = job.targetId;
    }
  }
  for (const [roomName, plan] of Object.entries(roomDemandPlans)) {
    plan.laneCounts = {};
    for (const lane of Object.values(plan.assignments)) {
      plan.laneCounts[lane] = (plan.laneCounts[lane] || 0) + 1;
    }
    if (Game.rooms[roomName] && Game.rooms[roomName].memory.demandPlan) {
      Game.rooms[roomName].memory.demandPlan.lanes = plan.laneCounts;
      Game.rooms[roomName].memory.demandPlan.jobs = Object.fromEntries(
        Object.entries(ownedWorkJobs)
          .filter(([, job]) => job.roomName === roomName)
          .map(([name, job]) => [name, {
            lane: job.lane, sourceId: job.sourceId,
            targetId: job.targetId, amount: job.amount,
            priority: job.priority, created: job.created
          }])
      );
    }
  }

  // Let logistics reserve source energy before general workers withdraw it.
  // The controller buffer remains protected for the dedicated upgrader.
  const taskPriority = (_creep, memory) => memory.emergencyRepairRoom
    ? -1 : memory.role === 'refiller' || memory.role === 'claimer'
      ? 0 : memory.role === 'hauler' || memory.role === 'remote-hauler'
        ? 1 : memory.role === CONTROLLER_BRIGADE_ROLE ||
          memory.role === 'rebalancer'
          ? 2 : memory.role === 'upgrader'
            ? 3 : memory.role === 'builder' &&
              (memory.builderScope || 'local') === 'local' &&
              (memory.builderMission || 'build') === 'repair' ? 4 : 5;
  const executionOrderRecords = snapshotExecutionOrder(
    creeps, taskPriority, Game.time);
  const taskCreeps = sortTaskRecords(executionOrderRecords)
    .map(record => record.creep);
  // One genuinely empty numbered slot may borrow one uncommitted carrier.
  // This is emergency gap coverage, not a shadow brigade: a BRIG already
  // spawning/traveling owns its slot, and the room may never borrow a carrier
  // for every moving relay. The stand-in resumes its real job when BRIGn sits.
  for (const room of Object.values(Game.rooms).filter(candidate =>
    candidate.controller && candidate.controller.my)) {
    const plan = getControllerBrigadePlan(room);
    const rosterChanges = reconcileControllerBrigadeOverlaps(room.name, plan);
    if (rosterChanges.reassigned.length || rosterChanges.released.length) {
      console.log(`[${Game.time}] ${room.name} released ` +
        `${rosterChanges.released.length} duplicate brigade relays to ` +
        `hauling; moved ${rosterChanges.reassigned.length} into empty slots`);
    }
    const candidates = taskCreeps.filter(creep =>
      creep.memory.home === room.name && creep.room.name === room.name &&
      creep.memory.role !== CONTROLLER_BRIGADE_ROLE && !creep.spawning &&
      ['hauler', 'rebalancer', 'remote-hauler', 'worker']
        .includes(creep.memory.role) &&
      !creep.memory.staffingRetire &&
      creep.getActiveBodyparts(CARRY) > 0 &&
      creep.getActiveBodyparts(MOVE) > 0 &&
      !creep.memory.dispatchCommitment &&
      !(creep.memory.role === 'remote-hauler' &&
        (creep.memory.remoteHaulReturning ||
          creep.store[RESOURCE_ENERGY] > 0)))
      .sort((a, b) => {
        const priority = creep => creep.memory.role === 'hauler' ? 0
          : creep.memory.role === 'rebalancer' ? 1
            : creep.memory.role === 'remote-hauler' &&
              creep.memory.remoteRosterSurplus ? 2
              : creep.memory.role === 'remote-hauler' ? 3 : 4;
        return priority(a) - priority(b) ||
          a.store[RESOURCE_ENERGY] - b.store[RESOURCE_ENERGY] ||
          b.ticksToLive - a.ticksToLive || a.name.localeCompare(b.name);
      });
    // The managed push uses real numbered relays, not borrowed core workers.
    const brigadeAllowed = !getOperationScope(room, Game).managed &&
      getRoomSituation(room).policy.permissions.controllerBrigade;
    const substitutes = reconcileControllerBrigadeSubstitutes({
      creeps: taskCreeps, roomName: room.name,
      plan: brigadeAllowed ? plan : null,
      candidates: brigadeAllowed ? candidates : []
    });
    room.memory.controllerBrigadeSubstitutes = {
      updated: Game.time,
      slots: substitutes
    };
  }
  const reservedRemoteSourceCoverage = {};
  const isSharedBuildTarget = target => target && target.room &&
    (target.structureType === STRUCTURE_EXTENSION ||
      target.structureType === STRUCTURE_LINK ||
      target.room.controller &&
        target.structureType === STRUCTURE_CONTAINER &&
        target.pos.getRangeTo(target.room.controller) <= 3);
  const { createBuckets, isAvailable: exclusiveClaimAvailable,
    claim: claimExclusive, release: releaseExclusive,
    retain: retainTaskTarget, retainExclusive: retainExclusiveTarget } =
    createTaskReservations({
      Game,
      isSharedTarget: isSharedBuildTarget,
      // Shared means a bounded crew, not an unlimited crowd. Construction
      // priority sizes the useful crew from structure cost; completed repair
      // targets retain one exclusive worker.
      getSharedTargetLimit: target => target.progressTotal !== undefined
        ? constructionPriority.desiredCrew(target) : 1
    });
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
  const sortedExecutionCreeps = sortExecutionRecords(executionOrderRecords)
    .map(record => record.creep);
  // Under CPU pressure, preserve the complete funded energy chain: production,
  // transport and home delivery. Only surplus empty carriers and optional work
  // rotate behind the ceiling while the bucket rebuilds.
  const survivalExecutionRoles = new Set([
    'refiller', 'harvester', 'miner', 'hauler', 'rebalancer', 'upgrader',
    // Established remote production is recurring income, not optional work.
    // Missing harvest intents loses output even when the CPU bucket is full.
    'remote-miner',
    // A reserver is the sole actuator that prevents a running outpost from
    // losing its controller reservation. It cannot be rotated behind optional
    // work while constrained CPU is shedding deferred executors.
    'claimer', 'remote-reserver', 'defender', 'retire',
    CONTROLLER_BRIGADE_ROLE
  ]);
  const survivalExecutionCreeps = sortedExecutionCreeps.filter(creep =>
    creep.memory.emergencyRepairRoom ||
    survivalExecutionRoles.has(creep.memory.role) ||
    creep.memory.role === 'remote-hauler' &&
      (!creep.memory.remoteRosterSurplus || creep.memory.refillSpecialist ||
        creep.store[RESOURCE_ENERGY] > 0));
  const deferredExecutionCreeps = sortedExecutionCreeps.filter(creep =>
    !survivalExecutionCreeps.includes(creep));
  const fairExecutionCreeps = selectFairExecutionCreeps({
    creeps: deferredExecutionCreeps, previous: previousCpuExecution,
    tick: Game.time, mode: cpuPolicy.mode,
    limit: cpuPolicy.fairExecutionLimit,
    interval: cpuPolicy.fairExecutionInterval,
    threshold: cpuPolicy.fairDeferralThreshold
  });
  const fairExecutionNames = new Set(fairExecutionCreeps.map(creep =>
    creep.name));
  const rotatingExecutionCreeps = deferredExecutionCreeps.filter(creep =>
    !fairExecutionNames.has(creep.name));
  const executionRotation = rotatingExecutionCreeps.length
    ? Game.time % rotatingExecutionCreeps.length : 0;
  const executionCreeps = fairExecutionCreeps.concat(
    survivalExecutionCreeps,
    rotatingExecutionCreeps.slice(executionRotation),
    rotatingExecutionCreeps.slice(0, executionRotation));
  const pickupCpuCeiling = cpuPolicy.executionCpuRatio !== null &&
    Game.cpu && Number.isFinite(Game.cpu.limit)
    ? Game.cpu.limit * cpuPolicy.executionCpuRatio : null;
  const pickupGuaranteedCount = Math.max(
    survivalExecutionCreeps.length + fairExecutionCreeps.length,
    cpuPolicy.minimumExecutionCreeps || 0);
  const controllerStations = planControllerStations({
    rooms: Object.values(Game.rooms), creeps, getRoomStructures,
    getContainerPurpose, RoomPosition,
    STRUCTURE_CONTAINER, STRUCTURE_RAMPART, TERRAIN_MASK_WALL,
    LOOK_STRUCTURES, OBSTACLE_OBJECT_TYPES
  });
  const conservationParkingByRoom = {};
  const conservationParkingClaims = {};
  const getConservationParkingSpot = creep => {
    const room = creep.room;
    if (!conservationParkingByRoom[room.name]) {
      const terrain = room.getTerrain();
      const sources = getRoomSources(room);
      const protectedRoads = getHeatmapRoadTiles(room);
      const occupied = new Set([
        ...getRoomStructures(room), ...getRoomSites(room)
      ].map(target => `${target.pos.x}:${target.pos.y}`));
      const spawn = getRoomStructuresByType(room, STRUCTURE_SPAWN)
        .find(s=>s.my);
      const plannedExtensions = new Set((room.memory.singleExtensionLayout?.extensionTiles||[])
        .map(p=>`${p.x}:${p.y}`));
      const candidates = selectParkingCandidates({ terrain, sources,
        protectedRoads, occupied, plannedExtensions, spawn,
        storage: room.storage, controller: room.controller,
        wallMask: TERRAIN_MASK_WALL });
      conservationParkingByRoom[room.name] = candidates;
      conservationParkingClaims[room.name] = new Set();
    }
    const candidates = conservationParkingByRoom[room.name];
    const claimed = conservationParkingClaims[room.name];
    if (!candidates.length) return null;
    const savedKey = Number.isInteger(creep.memory.conservationX) &&
      Number.isInteger(creep.memory.conservationY)
      ? `${creep.memory.conservationX}:${creep.memory.conservationY}` : null;
    let chosen = savedKey && !claimed.has(savedKey)
      ? candidates.find(candidate =>
        `${candidate.x}:${candidate.y}` === savedKey) : null;
    const hash = [...creep.name].reduce((total, character) =>
      total + character.charCodeAt(0), 0);
    for (let offset = 0; !chosen && offset < candidates.length; offset++) {
      const candidate = candidates[(hash + offset) % candidates.length];
      const key = `${candidate.x}:${candidate.y}`;
      if (!claimed.has(key)) chosen = candidate;
    }
    if (!chosen) return null;
    claimed.add(`${chosen.x}:${chosen.y}`);
    creep.memory.conservationX = chosen.x;
    creep.memory.conservationY = chosen.y;
    return new RoomPosition(chosen.x, chosen.y, room.name);
  };
  const dispatchPlanningCreeps = selectDispatchPlanningCreeps({
    creeps: executionCreeps, guaranteedCount: pickupGuaranteedCount,
    used: Game.cpu && typeof Game.cpu.getUsed === 'function'
      ? Game.cpu.getUsed() : null,
    ceiling: pickupCpuCeiling
  });
  const dispatchPlanningNames = new Set(dispatchPlanningCreeps.map(c =>
    c.name));
  const pickupParticipants=executionCreeps.filter(c=>!c.spawning&&
    !isExpansionBuilder(c)&&
    (typeof dispatchPlanningNames === 'undefined' ||
      dispatchPlanningNames.has(c.name))&&
    c.room.controller?.my&&
    !(c.memory.role === 'rebalancer' && Boolean(
      c.memory.controllerLinkFeedTarget ||
      c.memory.controllerLinkHandoffTarget ||
      selectControllerLinkFeed(c.room) ||
      selectControllerLinkHandoff(c.room)))&&
    (['refiller', 'rebalancer'].includes(c.memory.role) ||
      !['none', 'standby'].includes(
        roomDemandPlans[c.room.name]?.assignments[c.name] || 'none'))&&
    (c.store[RESOURCE_ENERGY]===0 || c.memory.role === 'hauler' &&
      roomDemandPlans[c.room.name]?.assignments[c.name] === 'collect' &&
      c.store.getFreeCapacity(RESOURCE_ENERGY) > 0)&&
    !['harvester','miner','remote-miner','remote-hauler','controller-relay','retire'].includes(c.memory.role));
  const pickupNames=new Set(pickupParticipants.map(c=>c.name));
  const pickupPlan=planPickupJobs({creeps:pickupParticipants,tick:Game.time,
    getCandidates:c=>homePickupCandidates({creep:c,
      candidates:getRoomStructures(c.room).filter(s=>['container','storage','link'].includes(s.structureType)&&canWithdrawFrom(c,s)&&getUnreservedEnergy(s)>0),
      planned:Game.getObjectById(roomDemandPlans[c.room.name]?.collectionSources[c.name]),
      isSpawnReserve:s=>isExtensionRefillBuffer(c.room,s)||isExtensionLink(s),
      isSourceBuffer:(s,source)=>s.structureType===STRUCTURE_CONTAINER&&source.pos.getRangeTo(s)<=2}),
    getJobPriority:c=>{
      if(c.memory.role==='refiller')return 0;
      if(c.memory.role==='upgrader')return 1;
      const lane=roomDemandPlans[c.room.name]?.assignments[c.name];
      if(['build','repair'].includes(lane))return 2;
      return ['hauler','rebalancer'].includes(c.memory.role)?3:4;
    },
    getPreferredTarget:c=>c.memory.pickupReservation?.targetId||
      c.memory.refillPickupTarget||c.memory.withdrawTarget||
      c.memory.workJob?.sourceId,
    maxCollectors:2});
  for (const creep of pickupParticipants) {
    const job = workDispatch.bindPickup(creep, pickupPlan.jobs[creep.name]);
    if (!job) continue;
    const plan = roomDemandPlans[creep.room.name];
    plan.collectionSources[creep.name] = job.sourceId;
    const saved = creep.room.memory.demandPlan;
    if (saved) {
      saved.collectionSources[creep.name] = job.sourceId;
      saved.jobs[creep.name] = { lane: job.lane, sourceId: job.sourceId,
        targetId: job.targetId, amount: job.amount, priority: job.priority,
        created: job.created };
      saved.commitments[creep.name] = creep.memory.dispatchCommitment;
    }
  }
  for(const room of Object.values(Game.rooms).filter(r=>r.controller?.my)){
    room.memory.pickupReservations={tick:Game.time,jobs:Object.fromEntries(
      Object.entries(pickupPlan.jobs).filter(([name])=>Game.creeps[name].room.name===room.name)),
      maxCollectorsPerStore:2};
  }
  for(const home of Object.values(Game.rooms).filter(r=>r.controller?.my)){
    for(const survey of [home.memory.leftSurvey,home.memory.southSurvey,home.memory.southwestSurvey].filter(p=>p?.active)){
      const remote=Game.rooms[survey.targetRoom];if(!remote)continue;
      remote.memory.repairSupplyPlan={...planRepairSupply({structures:getRoomStructures(remote),production:getRoomSources(remote).reduce((n,s)=>n+s.energyCapacity/ENERGY_REGEN_TIME,0)}),updated:Game.time};
    }
  }
  cpuStages.mark('dispatch');
  cpuStages.aggregate('planning', PLANNING_STAGES);
  const rawPickupEnergy=getUnreservedEnergy;
  const rawReservePickup=reserveEnergyFrom;
  const baseCanWithdraw=canWithdrawFrom;
  const executionCpuCeiling = cpuPolicy.executionCpuRatio !== null &&
    Game.cpu && Number.isFinite(Game.cpu.limit)
    ? Game.cpu.limit * cpuPolicy.executionCpuRatio : null;
  const requiredExecutionCount = Math.max(
    survivalExecutionCreeps.length + fairExecutionCreeps.length,
    cpuPolicy.minimumExecutionCreeps || 0);
  let executedCreepCount = 0;
  for (const creep of executionCreeps) {
    if (executionCpuCeiling !== null &&
        executedCreepCount >= requiredExecutionCount &&
        Game.cpu.getUsed() >= executionCpuCeiling) break;
    executedCreepCount++;
    const pickupJob=pickupPlan.jobs[creep.name];
    waitAge.markEvaluated(creep);
    const managedPickup=pickupNames.has(creep.name);
    const canWithdrawFrom=(actor,target)=>baseCanWithdraw(actor,target)&&
      (!managedPickup||target?.id===pickupJob?.targetId);
    const getUnreservedEnergy=target=>managedPickup&&
      ['container','storage','link'].includes(target?.structureType)
      ? target.id===pickupJob?.targetId
        ? Math.min(rawPickupEnergy(target),pickupJob.amount):0
      : creep.memory.role==='remote-hauler' && target?.room?.memory.repairSupplyPlan
        ? exportableEnergy(target,rawPickupEnergy(target),target.room.memory.repairSupplyPlan)
        : rawPickupEnergy(target);
    const reserveEnergyFrom=(target,amount)=>rawReservePickup(target,
      managedPickup||creep.memory.role==='remote-hauler'?Math.min(amount,getUnreservedEnergy(target)):amount);
    delete creep.memory.energyBudgetHeld;
    delete creep.memory.energyBudgetReason;
    const upgradeOperation = getRoomSituation(creep.room).policy.operations;
    const budgetedUpgrade = target => runBudgetedUpgrade({creep,target,memory:creep.room.memory,
      tick:Game.time,rate:selectUpgradeBudget(creep.room.memory.laborPlan,upgradeOperation),
      emergency:target.ticksToDowngrade<3000,OK});
    const budgetedBuild = target => {
      if(!['builder','worker'].includes(creep.memory.role) ||
          creep.memory.builderMission==='tunnel' || creep.memory.builderScope==='expansion' ||
          ['spawn','container'].includes(target.structureType))return creep.build(target);
      const rate=creep.memory.builderScope==='outpost'?creep.room.memory.builderCapacityPlan?.energyBudget:
        creep.room.memory.laborPlan?.buildBudget;
      const cost=Math.min(creep.getActiveBodyparts(WORK)*BUILD_POWER,creep.store[RESOURCE_ENERGY],
        Math.max(0,target.progressTotal-target.progress));
      return runBudgetedWork({creep,target,memory:creep.room.memory,tick:Game.time,rate,cost,
        action:()=>creep.build(target),OK});
    };
    const budgetedRepair = target => {
      if(creep.memory.builderScope!=='outpost'&&!creep.memory.emergencyRepairRoom)return creep.repair(target);
      const cost=Math.min(creep.getActiveBodyparts(WORK),creep.store[RESOURCE_ENERGY],
        Math.ceil((target.hitsMax-target.hits)/REPAIR_POWER));
      return runBudgetedWork({creep,target,tick:Game.time,
        rate:creep.room.memory.repairSupplyPlan?.rate,cost,
        memory:creep.room.memory.repairBudgetLedger ||= {},action:()=>creep.repair(target),OK});
    };
    const harvestOptions = { resource: RESOURCE_ENERGY, WORK, power: HARVEST_POWER, boosts: BOOSTS };
    const harvestFits = source => harvestBatchFits(creep, source, harvestOptions);
    const harvestWithoutSpill = source => harvestSafely({ creep, source, ...harvestOptions, ERR_FULL });
    const controller = creep.room.controller;
    const controllerStation = controllerStations[creep.name];
    const demandPlan = roomDemandPlans[creep.room.name];
    const demandLane = demandPlan && demandPlan.assignments[creep.name];
    if (demandLane !== 'standby') {
      delete creep.memory.conservationX;
      delete creep.memory.conservationY;
    }
    const incomingSupply = demandPlan &&
      demandPlan.incomingSupply[creep.name] || 0;
    creep.memory.demandLane = demandLane || 'none';
    creep.memory.incomingSupply = incomingSupply;
    const perform = (target, action, range = 1) => {
      if(managedPickup&&target&&target.energyCapacity!==undefined&&
          target.store===undefined&&creep.memory.role!=='upgrader')return false;
      // Keep repairs available while transport-blocked outposts stop building.
      if (target && target.progressTotal !== undefined &&
          creep.room.memory.deliveryPolicy?.blocked &&
          !(creep.room.controller && creep.room.controller.my)) return false;
      const result = action(target);
      if (result === ERR_NOT_IN_RANGE) moveCreep(creep, target, range);
      if (result !== OK && result !== ERR_NOT_IN_RANGE) return false;
      creep.memory.taskTarget = target.id || target.name || target.structureType;
      return true;
    };
    const performBuild = site => {
      const containerPlan = creep.room.memory.controllerContainerPlan;
      const brigadePlan = creep.room.memory.controllerBrigadePlan;
      const isControllerContainerSite = site && containerPlan &&
        (site.id === containerPlan.siteId ||
          site.pos.x === containerPlan.desiredX &&
            site.pos.y === containerPlan.desiredY);
      if (isControllerContainerSite && brigadePlan &&
          brigadePlan.provisional &&
          (creep.pos.x !== site.pos.x || creep.pos.y !== site.pos.y)) {
        moveCreep(creep, site.pos, 0);
        creep.memory.taskTarget = site.id;
        return true;
      }
      return perform(site, target => budgetedBuild(target), 3);
    };
    const rememberDispatchCommitment = (target, amount) => {
      const committedLanes = ['collect', 'refill', 'refill-buffer', 'buffer',
        'storage', 'supply'];
      if (!target || !target.id || !demandLane || demandLane === 'none' ||
          committedLanes.indexOf(demandLane) === -1 || amount <= 0) return;
      const previous = creep.memory.dispatchCommitment;
      const sameJob = previous && previous.lane === demandLane &&
        previous.targetId === target.id;
      if (demandLane === 'collect') {
        const job = creep.memory.workJob;
        if (job) {
          job.sourceId = target.id;
          job.amount = amount;
          job.updated = Game.time;
        }
      } else {
        workDispatch.bindTarget(creep, target, amount);
      }
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
        const trackedRemoteCargo = Number.isFinite(
          creep.memory.remoteCargoRemaining)
          ? creep.memory.remoteCargoRemaining : amount;
        const remoteAmount = Math.min(amount, trackedRemoteCargo);
        stats.deliveredTotal += remoteAmount;
        stats.lastDelivery = Game.time;
        stats.buckets[bucket] = (stats.buckets[bucket] || 0) + remoteAmount;
        for (const key of Object.keys(stats.buckets)) {
          if (Number(key) < Game.time - 1500) delete stats.buckets[key];
        }
        homeMemory.outpostEconomy[origin] = stats;
        creep.memory.remoteCargoRemaining = Math.max(0,
          trackedRemoteCargo - remoteAmount);
        if (creep.memory.remoteCargoRemaining <= 0) {
          delete creep.memory.remoteCargoOrigin;
          delete creep.memory.remoteCargoRemaining;
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
          target.store[RESOURCE_ENERGY] > 0 && (
            managedPickup && pickupJob?.targetId === target.id || storagePickup ||
            isExtensionLink(target) ||
            target.structureType === STRUCTURE_CONTAINER &&
              sources.some(source => source.pos.getRangeTo(target) <= 2));
        if (!validPickup) {
          forgetDispatchCommitment(target);
          return false;
        }
        return executeReservedWithdrawal({ creep, target,
          resource: RESOURCE_ENERGY,
          capacity: creep.store.getFreeCapacity(RESOURCE_ENERGY),
          reserve: reserveEnergyFrom,
          release: (source, amount) => releaseAmount(reservedEnergy,
            source, amount),
          remember: rememberDispatchCommitment,
          forget: forgetDispatchCommitment, move: moveCreep,
          OK, ERR_NOT_IN_RANGE }).state === 'accepted';
      }
      const sourceBuffer = target.structureType === STRUCTURE_CONTAINER &&
        getRoomSources(creep.room).some(source =>
          source.pos.getRangeTo(target) <= 2);
      const preferredLinkFeed = commitment.lane === 'buffer' &&
        getRoomStructures(creep.room).some(structure =>
          isControllerLink(structure) &&
            structure.store[RESOURCE_ENERGY] < 400) &&
        getRoomStructures(creep.room).some(structure =>
          isExtensionLink(structure) &&
            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
      const laneTargetValid = commitment.lane === 'refill'
        ? target.my && (target.structureType === STRUCTURE_SPAWN ||
          target.structureType === STRUCTURE_EXTENSION ||
          target.structureType === STRUCTURE_TOWER)
        : commitment.lane === 'refill-buffer'
          ? isExtensionRefillBuffer(creep.room, target)
          : commitment.lane === 'buffer'
            ? !sourceBuffer && (isExtensionLink(target) ||
              !preferredLinkFeed && (controller &&
              target.structureType === STRUCTURE_CONTAINER &&
              target.pos.getRangeTo(controller) <= 3))
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
          target => creep.withdraw(target, selectSalvageResource(target)));
      }
      const tombstone = Game.getObjectById(
        tombstoneAssignments[creep.name]);
      return tombstone
        ? perform(tombstone,
          target => creep.withdraw(target, selectSalvageResource(target)))
        : false;
    };
    const selectSalvageResource = target => target && target.store &&
      Object.keys(target.store)
        .filter(resourceType => target.store[resourceType] > 0)
        .sort((a, b) => Number(a === RESOURCE_ENERGY) -
          Number(b === RESOURCE_ENERGY))[0];
    const seekTowerHealing = () => {
      const tower = selectHealingTower({
        creep, structures: getRoomStructures(creep.room),
        RESOURCE_ENERGY, STRUCTURE_TOWER
      });
      if (!tower) return false;
      if (creep.pos.getRangeTo(tower) > 5) moveCreep(creep, tower, 5);
      creep.memory.taskTarget = `${tower.id} tower healing`;
      return true;
    };
    const postBattleScavenge = () => {
      if (!postBattleSalvageRooms.has(creep.room.name) ||
          creep.store.getFreeCapacity() <= 0) return false;
      const tombstone = Game.getObjectById(
        tombstoneAssignments[creep.name]);
      const ruin = Game.getObjectById(ruinAssignments[creep.name]);
      const drop = Game.getObjectById(dropAssignments[creep.name]);
      if (tombstone) {
        const resourceType = selectSalvageResource(tombstone);
        if (resourceType) return perform(tombstone,
          target => creep.withdraw(target, resourceType));
      }
      if (ruin) {
        const resourceType = selectSalvageResource(ruin);
        if (resourceType) return perform(ruin,
          target => creep.withdraw(target, resourceType));
      }
      return drop ? perform(drop, resource => creep.pickup(resource)) : false;
    };
    const storeNonEnergySalvage = () => {
      const resourceType = Object.keys(creep.store).find(type =>
        type !== RESOURCE_ENERGY && creep.store[type] > 0);
      const storage = creep.room.storage;
      if (!resourceType || !storage ||
          storage.store.getFreeCapacity(resourceType) <= 0) return false;
      const result = creep.transfer(storage, resourceType);
      if (result === ERR_NOT_IN_RANGE) moveCreep(creep, storage, 1);
      if (result !== OK && result !== ERR_NOT_IN_RANGE) return false;
      creep.memory.taskTarget = `${storage.id} ${resourceType} salvage`;
      return true;
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
      const resourceType = selectSalvageResource(ruin);
      if (!ruin || !resourceType ||
          creep.pos.getRangeTo(ruin) > nearbyRange) return false;
      return perform(ruin,
        target => creep.withdraw(target, resourceType));
    };
    const withdrawNearbyTombstone = () => {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;
      const tombstone = Game.getObjectById(
        tombstoneAssignments[creep.name]);
      const nearbyRange = creep.memory.role === 'upgrader' ? 1 : 3;
      const resourceType = selectSalvageResource(tombstone);
      if (!tombstone || !resourceType ||
          creep.pos.getRangeTo(tombstone) > nearbyRange) return false;
      return perform(tombstone,
        target => creep.withdraw(target, resourceType));
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
      // Refillers are stable specialists, not an exclusive lock on the energy
      // network. When demand planning assigns a loaded hauler to refill, it
      // must be allowed to help instead of watching one specialist service an
      // entire 1800-energy spawn/extension bank alone.
      const openRefillStructures = getRoomRefillStructures(creep.room).filter(
        structure =>
          isRefillTargetFor(creep, structure) &&
          getUnreservedCapacity(structure) > 0);
      const highestPriority = openRefillStructures.reduce((priority, structure) =>
        Math.min(priority, getRefillPriority(creep.room, structure, creep)),
      Infinity);
      const valid = structure => structure &&
        (structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_EXTENSION ||
          structure.structureType === STRUCTURE_TOWER) &&
        isRefillTargetFor(creep, structure) &&
        getRefillPriority(creep.room, structure, creep) === highestPriority &&
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
          getRoomRefillStructures(creep.room).filter(valid)
            .sort((a, b) =>
              getRefillPriority(creep.room, a, creep) -
                getRefillPriority(creep.room, b, creep) ||
              creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b))[0]);
      }
      return selectPersistentTarget('refillTarget', valid, () =>
        getRoomRefillStructures(creep.room).filter(valid)
          .sort((a, b) =>
            getRefillPriority(creep.room, a, creep) -
              getRefillPriority(creep.room, b, creep) ||
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
      const roomSites = getRoomSites(creep.room);
      const extensionFirst = constructionPriority.requiresExtensionFirst(
        creep.room.name, roomSites);
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
      const linkSites = roomSites.filter(site =>
        site.structureType === STRUCTURE_LINK);
      const linksPending = creep.room.controller &&
        creep.room.controller.level >= 5 && linkSites.length > 0;
      const valid = site => site && site.progressTotal !== undefined &&
        (!storageDeferred || site.structureType !== STRUCTURE_STORAGE) &&
        constructionPriority.allowsSite(creep.room.name, roomSites, site) &&
        (extensionFirst || !constructionPriority.isDeferred(site,
          linksPending)) &&
        (site.structureType !== STRUCTURE_ROAD ||
          tunnelSite && site.id === tunnelSite.id ||
          isSingleLaneRoadPosition(creep.room, site)) &&
        (!roadsPaused(creep.room) ||
          site.structureType !== STRUCTURE_ROAD ||
          tunnelSite && site.id === tunnelSite.id) &&
        (!extraFilter || extraFilter(site)) &&
        exclusiveClaimAvailable(reservedJobs.build, site, creep.name);
      const retainedJob = creep.memory.workJob;
      if (creep.store[RESOURCE_ENERGY] > 0 && retainedJob &&
          retainedJob.lane === 'build' && retainedJob.targetId === target?.id &&
          valid(target)) {
        if (!claimExclusive(reservedJobs.build, target, creep.name)) return null;
        workDispatch.bindTarget(creep, target,
          creep.store[RESOURCE_ENERGY]);
        return target;
      }
      if (!extraFilter && !extensionFirst && creep.room.controller) {
        const prioritySite = roomSites.find(site =>
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
      if (!extraFilter && !extensionFirst && !linksPending && (!target ||
          target.structureType === STRUCTURE_ROAD)) {
        const containerSite = roomSites
          .filter(site => site.structureType === STRUCTURE_CONTAINER &&
            exclusiveClaimAvailable(reservedJobs.build, site, creep.name))
          .sort((a, b) => creep.pos.getRangeTo(a) -
            creep.pos.getRangeTo(b) ||
            String(a.id).localeCompare(String(b.id)))[0];
        if (containerSite) {
          releaseExclusive(reservedJobs.build, target, creep.name);
          target = containerSite;
          creep.memory.buildTarget = containerSite.id;
        }
      }
      if (!extraFilter && (!target ||
          target.structureType !== STRUCTURE_EXTENSION)) {
        const extensionSite = roomSites
          .filter(site => site.structureType === STRUCTURE_EXTENSION &&
            exclusiveClaimAvailable(reservedJobs.build, site, creep.name))
          .sort((a, b) => creep.pos.getRangeTo(a) -
            creep.pos.getRangeTo(b) ||
            String(a.id).localeCompare(String(b.id)))[0];
        if (extensionSite) {
          releaseExclusive(reservedJobs.build, target, creep.name);
          target = extensionSite;
          creep.memory.buildTarget = extensionSite.id;
        }
      }
      if (!valid(target)) {
        delete creep.memory.buildTarget;
        target = roomSites.filter(valid)
          .sort((a, b) => {
            return constructionPriority.priority(a) -
              constructionPriority.priority(b) ||
              creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b) ||
              String(a.id).localeCompare(String(b.id));
          })[0];
      }
      if (!target) return null;
      if (!claimExclusive(reservedJobs.build, target, creep.name)) return null;
      creep.memory.buildTarget = target.id;
      workDispatch.bindTarget(creep, target,
        creep.store[RESOURCE_ENERGY]);
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
      workDispatch.bindTarget(creep, target,
        creep.store[RESOURCE_ENERGY]);
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
        anchor = creep.pos.findClosestByPath(getRoomStructures(creep.room)
          .filter(structure => structure.hits !== undefined &&
            structure.hits < structure.hitsMax * 0.75 &&
            structure.structureType !== STRUCTURE_WALL &&
            structure.structureType !== STRUCTURE_RAMPART &&
            (!roadsPaused(creep.room) ||
              structure.structureType !== STRUCTURE_ROAD)));
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
      const plannedBuffer = Game.getObjectById(creep.memory.workJob &&
        creep.memory.workJob.targetId);
      const valid = structure => structure &&
        (wantsStorage
          ? structure.my && structure.structureType === STRUCTURE_STORAGE
          : wantsExtensionBuffer
          ? isExtensionRefillBuffer(creep.room, structure)
          : plannedBuffer === structure && isExtensionLink(structure) ||
            structure.structureType === STRUCTURE_CONTAINER && controller &&
              structure.pos.getRangeTo(controller) <= 3) &&
        energySources.indexOf(structure.id) === -1 &&
        getUnreservedCapacity(structure) > 0;
      const container = valid(plannedBuffer)
        ? plannedBuffer
        : selectPersistentTarget('bufferTarget', valid, () =>
          getRoomStructures(creep.room).filter(valid)
            .sort((a, b) => creep.pos.getRangeTo(a) -
              creep.pos.getRangeTo(b))[0]);
      if (container) creep.memory.bufferTarget = container.id;
      return container ? transferEnergy(container) : false;
    };
    const topUpFromPassingSourceBuffer = allowed => {
      if (!allowed || creep.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) {
        return false;
      }
      const container = selectPassingSourceBuffer({
        room: creep.room,
        position: creep.pos,
        freeCapacity: creep.store.getFreeCapacity(RESOURCE_ENERGY),
        buffers: getRoomStructures(creep.room).filter(structure =>
          structure.structureType === STRUCTURE_CONTAINER),
        getContainerPurpose,
        getUnreservedEnergy
      });
      if (!container) return false;
      const amount = reserveEnergyFrom(container,
        creep.store.getFreeCapacity(RESOURCE_ENERGY));
      if (amount <= 0) return false;
      const result = creep.withdraw(container, RESOURCE_ENERGY, amount);
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
      if (creep.memory.role === 'remote-hauler') {
        creep.memory.remotePickupSource = container.id;
      }
      creep.memory.taskTarget = `${container.id} pass-by top-up`;
      return true;
    };
    const fillPassingExtensionBuffer = () => {
      const compatibleCarrier = creep.memory.role === 'hauler' ||
        creep.memory.role === 'remote-hauler' &&
          creep.memory.remoteHaulReturning &&
          creep.room.name === (creep.memory.remoteHome || creep.memory.home);
      if (!compatibleCarrier || creep.store[RESOURCE_ENERGY] <= 0 ||
          creep.room.energyAvailable < workerCost) return false;
      const extensionBuffer = getRoomStructures(creep.room).find(structure =>
        isExtensionRefillBuffer(creep.room, structure) &&
        creep.pos.getRangeTo(structure) <= 1 &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        creep.memory.withdrawTarget !== structure.id);
      if (!extensionBuffer) return false;
      // Remote cargo must use the tracked handoff path: a staged transfer
      // otherwise empties the carrier without crediting its outpost income.
      const delivered = creep.memory.role === 'remote-hauler'
        ? transferEnergy(extensionBuffer)
        : deliverStagedEnergy({
          creep, target: extensionBuffer, resourceType: RESOURCE_ENERGY,
          moveCreep, OK, ERR_NOT_IN_RANGE
        });
      if (delivered) creep.memory.taskTarget = extensionBuffer.id;
      return delivered;
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
        const cargoRoom = creep.memory.remoteCargoOrigin ||
          creep.memory.remoteDispatchRoom || creep.memory.remoteRoom;
        const relayPurpose = cargoRoom ? `relay:${cargoRoom}` : null;
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
      const preferredRelay = getRemoteDeliveryStores(creep.room)
        .find(structure => validBuffer(structure) && relayPurpose &&
          getContainerPurpose(creep.room, structure.pos) === relayPurpose);
      // Every carrier reads the same room-level inventory. The full registry
      // remains in memory for inspection; this view contains only legal remote
      // handoffs, and live capacity is still checked immediately before use.
      getEnergyStoreRegistry(creep.room);
      let candidates = getRemoteDeliveryStores(creep.room)
        .filter(validBuffer);
      if (preferredRelay && !candidates.some(candidate =>
        candidate.id === preferredRelay.id)) {
        getEnergyStoreRegistry(creep.room, true);
        candidates = getRemoteDeliveryStores(creep.room)
          .filter(validBuffer);
      }
      const bestTarget = selectHomeDeliveryTarget({
        candidates,
        storage: creep.room.storage,
        preferredRelay,
        distance: candidate => creep.pos.getRangeTo(candidate)
      });
      // Retain an ordinary container once selected so a carrier does not
      // flip-flop as it crosses the room. Re-evaluate invalid targets, a newly
      // available named relay, and legacy storage selections made by the old
      // storage-first rule.
      const targetIsStorage = target && target === creep.room.storage;
      if (!validBuffer(target) || preferredRelay && target !== preferredRelay ||
          targetIsStorage && bestTarget && bestTarget !== target) {
        delete creep.memory.remoteDeliveryTarget;
        target = bestTarget;
        if (target) creep.memory.remoteDeliveryTarget = target.id;
      }
      if (target) return transferEnergy(target);
      return false;
    };
    let tasks;
    if (creep.memory.staffingRetire || creep.memory.role === 'retire') {
      tasks = [{
        name: 'recycle',
        run: () => {
          const roomSpawns = getRoomStructuresByType(
            creep.room, STRUCTURE_SPAWN).filter(spawn => spawn.my);
          const spawn = creep.pos.findClosestByPath(roomSpawns) ||
            roomSpawns[0];
          if (!spawn) {
            const homeRoomName = creep.memory.home;
            if (homeRoomName && creep.room.name !== homeRoomName) {
              moveCreep(creep,
                new RoomPosition(25, 25, homeRoomName), 20);
              creep.memory.taskTarget = `${homeRoomName} recycle return`;
              return true;
            }
            creep.memory.taskTarget = 'waiting for recycle spawn';
            return true;
          }
          if (creep.pos.getRangeTo(spawn) > 1) {
            moveCreep(creep, spawn, 1);
            creep.memory.taskTarget = `${spawn.name} recycle`;
            return true;
          }
          if (creep.store[RESOURCE_ENERGY] > 0 &&
              spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            const amount = Math.min(creep.store[RESOURCE_ENERGY],
              spawn.store.getFreeCapacity(RESOURCE_ENERGY));
            const transferResult = creep.transfer(spawn, RESOURCE_ENERGY,
              amount);
            if (transferResult === OK) {
              creep.memory.taskTarget = `${spawn.name} return cargo`;
              return true;
            }
          }
          spawn.recycleCreep(creep);
          creep.memory.taskTarget = `${spawn.name} recycling`;
          return true;
        }
      }];
    } else if (demandLane === 'standby' && !isExpansionBuilder(creep) &&
        ['builder', 'worker', 'upgrader'].includes(creep.memory.role)) {
      tasks = [];
    } else if (managedPickup && !pickupJob) {
      tasks=[{name:'wait-job',run:()=>{
        const parking=getConservationParkingSpot(creep);
        if(parking&&creep.pos.getRangeTo(parking)>0)moveCreep(creep,parking,0);
        creep.memory.waitState = 'blocked';
        creep.memory.waitReason = 'no available reserved pickup';
        creep.memory.taskTarget='waiting for an available reserved pickup';
        return true;
      }}];
    } else if (creep.memory.role === CONTROLLER_BRIGADE_ROLE ||
        Number.isInteger(creep.memory.controllerRelaySubstituteSlot)) {
      tasks = [{
        name: CONTROLLER_BRIGADE_ROLE,
        run: () => runControllerBrigade(creep,
          getControllerBrigadePlan(creep.room))
      }];
    } else if (isLocalBuilder(creep) && creep.memory.home &&
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
          name: 'stock-extension-reserve',
          run: () => {
            if (creep.store[RESOURCE_ENERGY] <= 0) {
              delete creep.memory.refillLoadSource;
              return false;
            }
            const loadSource = Game.getObjectById(
              creep.memory.refillLoadSource);
            if (!isExtensionLink(loadSource)) return false;
            const extensionBuffer = getRoomStructures(creep.room)
              .filter(structure => isLocalExtensionRefillBuffer(structure) &&
                getUnreservedCapacity(structure) > 0)
              .sort((a, b) => creep.pos.getRangeTo(a) -
                creep.pos.getRangeTo(b))[0];
            if (!extensionBuffer) return false;
            creep.memory.taskTarget =
              `${loadSource.id} -> ${extensionBuffer.id} refill reserve`;
            return transferEnergy(extensionBuffer);
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
                isExtensionLink(structure) ||
                structure.structureType === STRUCTURE_CONTAINER &&
                  !isControllerBuffer(structure));
            let source = Game.getObjectById(creep.memory.refillPickupTarget);
            const preferredExtensionLink = getRoomStructures(creep.room)
              .filter(structure => valid(structure) &&
                isExtensionLink(structure))
              .sort((a, b) => creep.pos.getRangeTo(a) -
                creep.pos.getRangeTo(b))[0];
            const localExtensionBuffer = getRoomStructures(creep.room)
              .filter(structure => valid(structure) &&
                isLocalExtensionRefillBuffer(structure))
              .sort((a, b) => creep.pos.getRangeTo(a) -
                creep.pos.getRangeTo(b))[0];
            if (preferredExtensionLink &&
                (!source || source.id !== preferredExtensionLink.id)) {
              source = null;
              delete creep.memory.refillPickupTarget;
            } else if (localExtensionBuffer &&
                (!source || source.id !== localExtensionBuffer.id)) {
              source = null;
              delete creep.memory.refillPickupTarget;
            }
            if (!valid(source)) {
              delete creep.memory.refillPickupTarget;
              const candidates = getRoomStructures(creep.room).filter(valid)
                .sort((a, b) => {
                  const aExtensionLink = isExtensionLink(a);
                  const bExtensionLink = isExtensionLink(b);
                  if (aExtensionLink !== bExtensionLink) {
                    return Number(bExtensionLink) - Number(aExtensionLink);
                  }
                  const aExtensionBuffer =
                    isLocalExtensionRefillBuffer(a);
                  const bExtensionBuffer =
                    isLocalExtensionRefillBuffer(b);
                  if (aExtensionBuffer !== bExtensionBuffer) {
                    return Number(bExtensionBuffer) -
                      Number(aExtensionBuffer);
                  }
                  // Outside the dedicated refill buffers, avoid crossing
                  // the room for a small storage remainder while a source
                  // container can supply a complete delivery load.
                  const load = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                  const aFullLoad = getUnreservedEnergy(a) >= load;
                  const bFullLoad = getUnreservedEnergy(b) >= load;
                  if (aFullLoad !== bFullLoad) {
                    return Number(bFullLoad) - Number(aFullLoad);
                  }
                  return creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b) ||
                    getUnreservedEnergy(b) - getUnreservedEnergy(a);
                });
              source = candidates[0];
              if (source) creep.memory.refillPickupTarget = source.id;
            }
            if (!source) return false;
            creep.memory.refillLoadSource = source.id;
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
          const savedLinkFeedTarget = Game.getObjectById(
            creep.memory.controllerLinkFeedTarget);
          const spawnDemand = Math.max(0,
            creep.room.energyCapacityAvailable - creep.room.energyAvailable);
          if (creep.store[RESOURCE_ENERGY] > 0 && spawnDemand > 0 &&
              savedLinkFeedTarget && isControllerLink(savedLinkFeedTarget) &&
              savedLinkFeedTarget.store.getFreeCapacity(
                RESOURCE_ENERGY) > 0) {
            creep.memory.taskTarget =
              `${savedLinkFeedTarget.id} controller link feed`;
            if (transferEnergy(savedLinkFeedTarget)) return true;
          }
          delete creep.memory.controllerLinkFeedTarget;
          if (creep.store[RESOURCE_ENERGY] === 0 && spawnDemand > 0) {
            const feed = selectControllerLinkFeed(creep.room);
            if (feed) {
              const amount = reserveEnergyFrom(feed.source, Math.min(
                creep.store.getFreeCapacity(RESOURCE_ENERGY), feed.amount));
              if (amount > 0) {
                const result = creep.withdraw(feed.source,
                  RESOURCE_ENERGY, amount);
                if (result === ERR_NOT_IN_RANGE) {
                  moveCreep(creep, feed.source, 1);
                }
                if (result === OK || result === ERR_NOT_IN_RANGE) {
                  creep.memory.controllerLinkFeedTarget = feed.target.id;
                  creep.memory.taskTarget = `${feed.source.id} -> ` +
                    `${feed.target.id} controller link feed`;
                  return true;
                }
                releaseAmount(reservedEnergy, feed.source, amount);
              }
            }
          }
          const savedHandoffTarget = Game.getObjectById(
            creep.memory.controllerLinkHandoffTarget);
          if (creep.store[RESOURCE_ENERGY] > 0 && savedHandoffTarget &&
              isControllerBuffer(savedHandoffTarget) &&
              savedHandoffTarget.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            creep.memory.taskTarget =
              `${savedHandoffTarget.id} controller link handoff`;
            if (transferEnergy(savedHandoffTarget)) return true;
          }
          delete creep.memory.controllerLinkHandoffTarget;
          if (creep.store[RESOURCE_ENERGY] === 0) {
            const handoff = selectControllerLinkHandoff(creep.room);
            if (handoff) {
              const targetCapacity = handoff.target.store.getCapacity(
                RESOURCE_ENERGY) || 0;
              const targetNeed = Math.max(0, Math.ceil(
                targetCapacity * 0.75 -
                handoff.target.store[RESOURCE_ENERGY]));
              const amount = reserveEnergyFrom(handoff.source, Math.min(
                creep.store.getFreeCapacity(RESOURCE_ENERGY),
                targetNeed));
              if (amount > 0) {
                const result = creep.withdraw(handoff.source,
                  RESOURCE_ENERGY, amount);
                if (result === ERR_NOT_IN_RANGE) {
                  moveCreep(creep, handoff.source, 1);
                }
                if (result === OK || result === ERR_NOT_IN_RANGE) {
                  creep.memory.controllerLinkHandoffTarget =
                    handoff.target.id;
                  creep.memory.taskTarget = `${handoff.source.id} -> ` +
                    `${handoff.target.id} controller link handoff`;
                  return true;
                }
                releaseAmount(reservedEnergy, handoff.source, amount);
              }
            }
          }
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
          // Review the balance every 25 ticks so one distant buffer cannot
          // monopolize the creep without making its destination churn.
          let target = Game.getObjectById(creep.memory.rebalanceTarget);
          if (isRebalanceReviewDue(target,
            creep.memory.rebalanceTargetReviewed, Game.time,
            stillNeedsEnergy)) {
            const previousTarget = target;
            target = selectRebalanceTarget(
              getRoomStructures(creep.room),
              getBufferTargetRatio,
              structure => creep.pos.getRangeTo(structure));
            creep.memory.rebalanceTargetReviewed = Game.time;
            creep.memory.rebalanceAssignmentReason = previousTarget
              ? 'assigned buffer reached its policy target'
              : 'assigned buffer missing or invalid';
            creep.memory.rebalanceAssignmentChanged = Game.time;
            if (target) creep.memory.rebalanceTarget = target.id;
            else delete creep.memory.rebalanceTarget;
          }
          if (creep.store[RESOURCE_ENERGY] > 0) {
            if (target) {
              if (transferEnergy(target)) return true;
              // Another rebalancer may have reserved the remaining capacity
              // earlier in this tick. The assignment is still valid; keep it
              // instead of falling through to generic standby and visibly
              // alternating Bal/Idle.
              creep.memory.taskTarget =
                `${target.id} delivery capacity reserved`;
              return true;
            }
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
            const standbyBuffer = homeBuffer ||
              getRoomStructures(creep.room)
                .filter(structure =>
                  structure.structureType === STRUCTURE_CONTAINER &&
                  (!storage || structure.pos.getRangeTo(storage) >= 4) &&
                  (!controller || structure.pos.getRangeTo(controller) > 3))
                .sort((a, b) => creep.pos.getRangeTo(a) -
                  creep.pos.getRangeTo(b))[0];
            if (standbyBuffer && creep.pos.getRangeTo(standbyBuffer) > 1) {
              moveCreep(creep, standbyBuffer, 1);
            }
            creep.memory.taskTarget = standbyBuffer
              ? `${standbyBuffer.id} balanced parking`
              : 'buffers balanced; no parking buffer';
            return true;
          }
          const preferredSource = Game.getObjectById(
            creep.memory.rebalancerSource);
          const pickupCandidates = getRoomStructures(creep.room)
            .filter(structure =>
              structure.structureType === STRUCTURE_CONTAINER &&
              !isExtensionRefillBuffer(creep.room, structure) &&
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
          if (!source || isExtensionRefillBuffer(creep.room, source) ||
              getUnreservedEnergy(source) <= 0 || source.id === target.id) {
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
    } else if (creep.memory.role === 'remote-reserver') {
      tasks = [{ name: 'reserve', run: () => runReservation({ creep, Game,
        move: moveCreep, RoomPosition, OK, ERR_NOT_IN_RANGE, FIND_HOSTILE_CREEPS }) }];
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
          const onArrivalExit = creep.pos.x === 0 || creep.pos.x === 49 ||
            creep.pos.y === 0 || creep.pos.y === 49;
          if (onArrivalExit && !target.my) {
            // The cross-room cached path ends on the exit tile. Reusing it can
            // send the claimer straight back home before it gets an inward
            // step, especially when remote traffic shares the doorway.
            delete creep.memory._move;
            delete creep.memory.navGoal;
            moveCreep(creep, target, 1, { direct: true });
            creep.memory.taskTarget = `${targetRoomName} enter room`;
            return true;
          }
          if (target.my) {
            const homeRoom = Game.rooms[creep.memory.home];
            if (homeRoom && homeRoom.memory.expansionPlan) {
              homeRoom.memory.expansionPlan.status = 'bootstrap';
            }
            if (creep.getActiveBodyparts(WORK) > 0 &&
                creep.getActiveBodyparts(CARRY) > 0) {
              creep.memory.role = 'builder';
              creep.memory.birthRole = 'builder';
              creep.memory.assignmentRole = 'builder';
              creep.memory.assignmentKind = 'expansion-bootstrap';
              creep.memory.builderScope = 'expansion';
              creep.memory.builderMission = 'bootstrap';
            } else {
              creep.memory.role = 'retire';
              creep.memory.assignmentRole = 'retire';
              delete creep.memory.assignmentKind;
              delete creep.memory.expansionTarget;
              creep.memory.staffingRetire = true;
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
          const spawn = getRoomStructuresByType(creep.room, STRUCTURE_SPAWN)
            .find(candidate => candidate.my);
          if (spawn) {
            creep.memory.home = targetRoomName;
            creep.memory.role = 'builder';
            creep.memory.builderScope = 'local';
            creep.memory.builderMission = 'flexible';
            delete creep.memory.assignmentKind;
            delete creep.memory.expansionTarget;
            creep.memory.taskTarget = `${spawn.name} established`;
            return true;
          }
          const work = selectBootstrapWork({ creep,
            controller: creep.room.controller, crew: creeps,
            sources: getRoomSources(creep.room),
            stores: getRoomStructuresByType(creep.room, STRUCTURE_CONTAINER)
              .filter(store => getUnreservedEnergy(store) > 0),
            sites: getRoomSites(creep.room), structures: getRoomStructures(creep.room),
            closest: candidates => creep.pos.findClosestByPath(candidates),
            harvestFits, resource: RESOURCE_ENERGY });
          creep.memory.bootstrapAction = work.action;
          if (!work.target) {
            creep.memory.bootstrapAction = 'standby';
            creep.memory.waitState = 'blocked';
            creep.memory.waitReason = 'bootstrap has no reachable energy source';
            creep.memory.taskTarget = `${targetRoomName} waiting energy`;
            return true;
          }
          if (work.action === 'withdraw') {
            const amount = Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY),
              getUnreservedEnergy(work.target));
            if (amount <= 0) return false;
            reserveEnergyFrom(work.target, amount);
            return perform(work.target,
              target => creep.withdraw(target, RESOURCE_ENERGY, amount), 1);
          }
          const actions = {
            harvest: target => harvestWithoutSpill(target),
            upgrade: target => creep.upgradeController(target),
            build: target => budgetedBuild(target),
            repair: target => budgetedRepair(target)
          };
          return perform(work.target, actions[work.action], work.range);
        }
      }];
    } else if (creep.memory.role === 'remote-miner') {
      tasks = [{
        name: 'remote-miner',
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
          if (creep.room.name !== targetRoomName) {
            const visible=Game.rooms[targetRoomName];
            const sources=visible&&getRoomSources(visible).slice().sort((a,b)=>a.pos.x-b.pos.x||a.pos.y-b.pos.y);
            const source=sources&&sources[(creep.memory.remoteSlot||0)%sources.length];
            if(source){creep.memory.remoteAction='Travel';moveCreep(creep,source,1,{direct:true,maxOps:12000});creep.memory.taskTarget=source.id;return true;}
            return travelTo(targetRoomName);
          }
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
            const placed = placeRemoteContainerSite({ room: creep.room,
              source, creep, TERRAIN_MASK_WALL, LOOK_STRUCTURES,
              LOOK_CONSTRUCTION_SITES, STRUCTURE_ROAD, STRUCTURE_CONTAINER,
              OK });
            if (placed) {
              creep.memory.remoteAction = 'Site';
              containerSite = placed.site;
              console.log(`[${Game.time}] ${creep.name} placed remote ` +
                `container at ${targetRoomName} ${placed.x},${placed.y}`);
            }
          }
          if (container && !containerSite && sourceContainers.length < 2 &&
              sourceContainers.every(candidate =>
                candidate.store.getFreeCapacity(RESOURCE_ENERGY) === 0) &&
              creep.store[RESOURCE_ENERGY] > 0) {
            const placed = placeRemoteContainerSite({ room: creep.room,
              source, creep, TERRAIN_MASK_WALL, LOOK_STRUCTURES,
              LOOK_CONSTRUCTION_SITES, STRUCTURE_ROAD, STRUCTURE_CONTAINER,
              OK });
            if (placed) {
              creep.memory.remoteAction = 'Site';
              containerSite = placed.site;
              console.log(`[${Game.time}] ${creep.name} placed remote ` +
                `overflow container at ${targetRoomName} ` +
                `${placed.x},${placed.y}`);
            }
          }
          if (!containerSite) {
            delete creep.memory.remoteContainerBuilding;
          } else if (creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.remoteContainerBuilding = false;
          } else if (!harvestFits(source) ||
              source.energy === 0) {
            creep.memory.remoteContainerBuilding = true;
          }
          if (containerSite && creep.memory.remoteContainerBuilding &&
              creep.store[RESOURCE_ENERGY] > 0) {
            creep.memory.remoteAction = 'BuildC';
            return perform(containerSite, site => budgetedBuild(site), 3);
          }
          if (container && creep.store[RESOURCE_ENERGY] > 0 &&
              (!harvestFits(source) ||
                source.energy === 0) &&
              getUnreservedCapacity(container) > 0) {
            creep.memory.remoteAction = 'Store';
            return transferEnergy(container);
          }
          if (creep.pos.getRangeTo(source) > 1) {
            creep.memory.remoteAction = 'Mine';
            moveCreep(creep, source, 1,{direct:true,maxOps:12000});
            creep.memory.taskTarget = source.id;
            return true;
          }
          if (source.energy > 0 &&
              creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            creep.memory.remoteAction = 'Mine';
            return perform(source, target => harvestWithoutSpill(target));
          }
          if (container && creep.store[RESOURCE_ENERGY] > 0) {
            if (getUnreservedCapacity(container) > 0) {
              creep.memory.remoteAction = 'Store';
              return transferEnergy(container);
            }
          }
          if (container && creep.store[RESOURCE_ENERGY] > 0) {
            const repairTarget = selectOutpostRepairTarget(
              getRoomStructures(creep.room).filter(structure =>
                exclusiveClaimAvailable(reservedJobs.repair, structure,
                  creep.name)), creep.pos);
            if (repairTarget && claimExclusive(reservedJobs.repair,
              repairTarget, creep.name)) {
              creep.memory.remoteAction = 'Repair';
              return perform(repairTarget,
                target => budgetedRepair(target), 3);
            }
            const buildTarget = getRoomSites(creep.room)
              .filter(site => exclusiveClaimAvailable(reservedJobs.build,
                site, creep.name))
              .sort((a, b) => creep.pos.getRangeTo(a) -
                creep.pos.getRangeTo(b))[0];
            if (buildTarget && claimExclusive(reservedJobs.build,
              buildTarget, creep.name)) {
              creep.memory.remoteAction = 'BuildC';
              return perform(buildTarget, target => budgetedBuild(target), 3);
            }
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
            creep.memory.remoteTransitRoom = roomName;
            moveCreep(creep, new RoomPosition(25, 25, roomName), 20);
            creep.memory.taskTarget = `${roomName} haul`;
            return true;
          };
          if (ownedTarget(Game, targetRoomName)) {
            delete creep.memory.remoteDispatchRoom;
            delete creep.memory.remoteDispatchSlot;
            delete creep.memory.remotePickupTarget;
            delete creep.memory.remotePickupSource;
            delete creep.memory.remoteDeliveryTarget;
            delete creep.memory.remoteCargoOrigin;
            delete creep.memory.remoteCargoRemaining;
            creep.memory.remoteRosterSurplus = true;
            if (creep.store[RESOURCE_ENERGY] > 0 &&
                creep.room.name !== homeRoomName) {
              creep.memory.remoteHaulReturning = true;
              return travelTo(homeRoomName);
            }
            creep.memory.taskTarget = `${targetRoomName} is a local colony`;
            return true;
          }
          const getOutpostBorderCache = () => {
            if (creep.room.name !== targetRoomName) return null;
            const plan = Game.rooms[homeRoomName]?.memory
              .outpostBorderCachePlans?.[targetRoomName];
            if (!plan) return null;
            return creep.room.lookForAt(LOOK_STRUCTURES, plan.x, plan.y)
              .find(structure =>
                structure.structureType === STRUCTURE_CONTAINER) || null;
          };
          const transitRoom = creep.memory.remoteTransitRoom;
          if (transitRoom && (creep.room.name !== transitRoom ||
              isRoomBorder(creep.pos, 1))) {
            // Finish the crossing and step at least two tiles inside before
            // readiness or local-demand logic may reverse the route.
            return travelTo(transitRoom);
          }
          if (transitRoom) delete creep.memory.remoteTransitRoom;
          const rosterSlot = Number.isInteger(creep.memory.remoteHaulerSlot)
            ? creep.memory.remoteHaulerSlot : 0;
          let slot = Number.isInteger(creep.memory.remoteDispatchSlot)
            ? creep.memory.remoteDispatchSlot : rosterSlot;
          if (!creep.memory.remoteRosterSurplus &&
              creep.memory.remoteDispatchRoom &&
              creep.memory.remoteDispatchRoom !== rosterRoomName) {
            // Clean up both new and legacy foreign dispatches on assigned
            // roster carriers. Unknown carried cargo goes home; an empty
            // carrier resumes its own outpost route.
            delete creep.memory.remoteDispatchRoom;
            delete creep.memory.remoteDispatchSlot;
            targetRoomName = rosterRoomName;
            slot = rosterSlot;
            if (creep.store[RESOURCE_ENERGY] > 0) {
              creep.memory.remoteHaulReturning = true;
            }
          }
          if (creep.store[RESOURCE_ENERGY] === 0 &&
              !(creep.memory.remoteCacheReturnHome &&
                creep.room.name !== homeRoomName)) {
            const completedRemoteDelivery =
              creep.memory.remoteHaulReturning &&
              creep.room.name === homeRoomName;
            // Delivery is complete as soon as the carrier is empty. A stale
            // return flag prevents the next outpost pickup from ever being
            // claimed and leaves the creep parked at home indefinitely.
            delete creep.memory.remoteHaulReturning;
            delete creep.memory.remotePickupSource;
            delete creep.memory.remoteDeliveryTarget;
            delete creep.memory.remoteCargoOrigin;
            delete creep.memory.remoteCargoRemaining;
            delete creep.memory.remoteCacheDeliveryPending;
            delete creep.memory.remoteCacheReturnHome;
            // Assigned roster carriers own their named outpost. Shared
            // dispatch is reserved for genuine roster surplus, so one busy
            // remote room cannot drain the carriers from every other room.
            if (completedRemoteDelivery) {
              delete creep.memory.remoteDispatchRoom;
              delete creep.memory.remoteDispatchSlot;
              targetRoomName = rosterRoomName;
              slot = rosterSlot;
            }
          }
          if (creep.store[RESOURCE_ENERGY] === 0 &&
              !creep.memory.remoteHaulReturning &&
              creep.room.name === homeRoomName &&
              !creep.memory.remoteDispatchRoom) {
            const homeRoom = Game.rooms[homeRoomName];
            const surveys = homeRoom && [homeRoom.memory.leftSurvey,
              homeRoom.memory.southSurvey,
              homeRoom.memory.southwestSurvey].filter(survey =>
              survey && survey.active && survey.targetRoom &&
              !ownedTarget(Game, survey.targetRoom));
            // Every roster slot serves its own room. Only bodies beyond all
            // current room targets join the shared overflow fleet.
            const flexible = creep.memory.remoteRosterSurplus;
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
          // Direction is cargo-driven, not readiness-driven. Once remote
          // cargo is aboard, return it home; never reroute a partially loaded
          // carrier through a second outpost because pressure changed.
          if (creep.store[RESOURCE_ENERGY] > 0 &&
              creep.memory.remoteCargoOrigin) {
            creep.memory.remoteHaulReturning = true;
          }
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
          // Readiness decides whether a new trip may leave home. It must not
          // recall an already-outbound hauler from an intermediate room, or a
          // fluctuating container threshold makes it hop across the border.
          const visionProbe=shouldProbeRemoteVision({creep,
            creeps:Object.values(Game.creeps),targetRoomName,readiness,RESOURCE_ENERGY});
          const readinessBlocksDeparture = !readiness.ready && !visionProbe &&
            creep.room.name === homeRoomName &&
            creep.store[RESOURCE_ENERGY] === 0;
          if (creep.room.energyAvailable >= workerCost &&
              topUpFromPassingSourceBuffer(
                creep.room.name === homeRoomName &&
                creep.store[RESOURCE_ENERGY] > 0)) {
            return true;
          }
          if (readinessBlocksDeparture || handlesLocalDemand && !visionProbe) {
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
                const withdrawal = executeReservedWithdrawal({ creep,
                  target: localContainer, resource: RESOURCE_ENERGY,
                  capacity: creep.store.getFreeCapacity(RESOURCE_ENERGY),
                  reserve: reserveEnergyFrom,
                  release: (source, amount) => releaseAmount(reservedEnergy,
                    source, amount),
                  remember: rememberDispatchCommitment,
                  forget: forgetDispatchCommitment,
                  move: (worker, source) => moveCreep(worker, source),
                  OK, ERR_NOT_IN_RANGE, recordSource: false,
                  recordTaskTarget: false });
                if (withdrawal.state !== 'unreserved') {
                  if (withdrawal.state === 'failed') {
                    delete creep.memory.remotePickupTarget;
                  } else if (withdrawal.result === OK) {
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
          if (creep.memory.remoteCacheReturnHome &&
              creep.room.name !== homeRoomName) {
            return travelTo(homeRoomName);
          }
          if (creep.memory.remoteCacheDeliveryPending &&
              creep.room.name === targetRoomName &&
              creep.store[RESOURCE_ENERGY] > 0) {
            const cache = getOutpostBorderCache();
            if (cache && getUnreservedCapacity(cache) > 0) {
              const deliveredToCache = transferEnergy(cache);
              if (creep.store[RESOURCE_ENERGY] === 0) {
                delete creep.memory.remoteCacheDeliveryPending;
                creep.memory.remoteCacheReturnHome = true;
              }
              return deliveredToCache;
            }
            delete creep.memory.remoteCacheDeliveryPending;
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
          const routePlan = Game.rooms[homeRoomName]?.memory.remoteHaulRoutes?.[targetRoomName];
          const plannedSourceId = routePlan?.lanes?.[routePlan?.slotSources?.[slot]]?.sourceId;
          const plannedSourceSlot = sources.findIndex(source => source.id === plannedSourceId);
          const sourceSlot = plannedSourceSlot >= 0 ? plannedSourceSlot : slot % sources.length;
          const source = sources[sourceSlot];
          const borderCache = getOutpostBorderCache();
          if (borderCache && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
              getUnreservedEnergy(borderCache) > 0) {
            const amount = reserveEnergyFrom(borderCache,
              creep.store.getFreeCapacity(RESOURCE_ENERGY));
            if (amount > 0) {
              rememberDispatchCommitment(borderCache, amount);
              const result = creep.withdraw(borderCache, RESOURCE_ENERGY,
                amount);
              if (result === ERR_NOT_IN_RANGE) {
                moveCreep(creep, borderCache);
                creep.memory.taskTarget = borderCache.id;
                return true;
              }
              if (result !== OK) {
                releaseAmount(reservedEnergy, borderCache, amount);
                forgetDispatchCommitment(borderCache);
                return false;
              }
              creep.memory.remotePickupSource = borderCache.id;
              creep.memory.remoteCargoOrigin = targetRoomName;
              creep.memory.remoteCargoRemaining = amount;
              creep.memory.remoteHaulReturning = true;
              delete creep.memory.remoteCacheDeliveryPending;
              if (creep.memory.remoteDeliveryTarget === borderCache.id) {
                delete creep.memory.remoteDeliveryTarget;
              }
              creep.memory.taskTarget = `${borderCache.id} border cache`;
              return true;
            }
          }
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
              worker.memory.role === 'remote-miner' &&
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
            const result = creep.withdraw(container, RESOURCE_ENERGY, amount);
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
            creep.memory.remoteCargoRemaining =
              (creep.memory.remoteCargoRemaining || 0) + amount;
            creep.memory.remoteCacheDeliveryPending = Boolean(borderCache &&
              getUnreservedCapacity(borderCache) > 0);
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
            worker.memory.role === 'remote-miner' &&
            worker.memory.remoteRoom === targetRoomName &&
            worker.memory.remoteSlot === sourceSlot &&
            worker.room.name === targetRoomName &&
            worker.pos.getRangeTo(source) <= 1);
          if (hasWorkParts(creep) && !sourceCovered && source.energy > 0 &&
              creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return perform(source, target => harvestWithoutSpill(target));
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
          const allowOptionalRemoteBuild = Boolean(homeRoom &&
            getRoomSituation(homeRoom).policy.permissions.optionalConstruction);
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
          // Finish source storage before routine road maintenance can consume
          // every load. Keep urgent decay protection active during bootstrap.
          const sourceStoragePending = creep.room.name === creep.memory.remoteRoom &&
            creep.room.find(FIND_MY_CONSTRUCTION_SITES).some(site =>
              site.structureType === STRUCTURE_CONTAINER &&
              getRoomSources(creep.room).some(source =>
                source.pos.getRangeTo(site) <= 1));
          const repairAllowed = structure => isOutpostRepairTarget(structure) &&
            (!sourceStoragePending || structure.hits / structure.hitsMax <
              (structure.structureType === STRUCTURE_CONTAINER ? 0.25 : 0.1));
          if (creep.room.name === creep.memory.remoteRoom &&
              creep.store[RESOURCE_ENERGY] > 0) {
            let repairTarget = Game.getObjectById(
              creep.memory.remoteRepairTarget);
            // A retained routine container job must not let a road decay away.
            const urgentRepair = selectOutpostRepairTarget(
              getRoomStructures(creep.room).filter(structure =>
                repairAllowed(structure) &&
                structure.hits < structure.hitsMax * 0.25 &&
                exclusiveClaimAvailable(reservedJobs.repair, structure,
                  creep.name)), creep.pos);
            if (urgentRepair && (!repairTarget ||
                repairTarget.hits >= repairTarget.hitsMax * 0.25)) {
              repairTarget = urgentRepair;
              creep.memory.remoteRepairTarget = repairTarget.id;
            }
            if (!repairTarget || repairTarget.room.name !==
                creep.memory.remoteRoom ||
                !repairAllowed(repairTarget) ||
                !exclusiveClaimAvailable(reservedJobs.repair, repairTarget,
                  creep.name)) {
              delete creep.memory.remoteRepairTarget;
              repairTarget = selectOutpostRepairTarget(
                getRoomStructures(creep.room).filter(structure =>
                  repairAllowed(structure) &&
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
                target => budgetedRepair(target), 3);
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
                worker.memory.role === 'remote-miner' &&
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
                  target => harvestWithoutSpill(target));
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
          for (const candidatePath of allowOptionalRemoteBuild
            ? orderedPaths : []) {
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
                  (allowOptionalRemoteBuild &&
                    candidate.structureType === STRUCTURE_ROAD ||
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
          if (allowOptionalRemoteBuild && roadSites.length === 0) {
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
            return perform(site, target => budgetedBuild(target), 3);
          }
          if (!creep.memory.remoteRoadBuilding &&
              creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            const targetRoomName = creep.memory.remoteRoom;
            if (site && site.structureType === STRUCTURE_EXTENSION &&
                creep.room.name === homeRoom.name) {
              const supply = creep.pos.findClosestByPath(
                getRoomStructures(creep.room).filter(structure =>
                  (structure.structureType === STRUCTURE_CONTAINER ||
                    structure.structureType === STRUCTURE_STORAGE) &&
                  getUnreservedEnergy(structure) > 0));
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
              return perform(source, target => harvestWithoutSpill(target));
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
                return perform(source, target => harvestWithoutSpill(target));
              }
              creep.memory.taskTarget = `${container.id} (all buffers full)`;
              return true;
            }
            if (creep.store[RESOURCE_ENERGY] > 0 &&
                (!harvestFits(source) || source.energy === 0)) {
              return transferEnergy(depositContainer);
            }
            if (source.energy > 0 && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
              return perform(source, target => harvestWithoutSpill(target));
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
            const containers = getRoomStructuresByType(
              creep.room, STRUCTURE_CONTAINER).filter(structure =>
                !isRetiringContainer(creep.room, structure) &&
                source.pos.getRangeTo(structure) <= 2);
            const sourceLink = getSourceLink(creep.room, source);
            const deposits = sourceLink ? [sourceLink, ...containers] : containers;
            const availableContainers = deposits.filter(structure =>
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
            const container = availableContainers.length
              ? availableContainers.sort((a, b) =>
                Number(b.structureType === STRUCTURE_LINK) -
                  Number(a.structureType === STRUCTURE_LINK) ||
                b.store.getFreeCapacity(RESOURCE_ENERGY) -
                  a.store.getFreeCapacity(RESOURCE_ENERGY) ||
                creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b))[0]
              : creep.pos.findClosestByRange(deposits);
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
                return perform(existingSite, site => budgetedBuild(site), 3);
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
            const shouldUnload = !harvestFits(source) ||
              !harvestFits(source) ||
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
              return perform(source, target => harvestWithoutSpill(target));
            }
            if (source.energy > 0 &&
                creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
              if (creep.pos.getRangeTo(source) <= 1) {
                return perform(source, target => harvestWithoutSpill(target));
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
              ? perform(target, structure => budgetedRepair(structure), 3)
              : false;
          }
        },
        {
          name: 'build',
          run: () => {
            if (demandLane !== 'build') return false;
            const nonRoadSites = getRoomSites(creep.room)
              .filter(site => site.structureType !== STRUCTURE_ROAD);
            const extensionSites = nonRoadSites.filter(site =>
              site.structureType === STRUCTURE_EXTENSION);
            const tunnelSite = getSource2TunnelSite(creep.room);
            const roadSites = getRoomSitesByType(creep.room, STRUCTURE_ROAD)
              .filter(site =>
                (!tunnelSite || site.id !== tunnelSite.id) &&
                isSingleLaneRoadPosition(creep.room, site));
            const roadCrew = getRoomCreeps(creep.room)
              .filter(worker => worker.memory.role === 'builder')
              .sort((a, b) => a.name.localeCompare(b.name))[0];
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
              ? performBuild(site)
              : false;
          }
        },
        {
          name: 'upgrade',
          run: () => {
            if (demandLane !== 'upgrade' || !controller || !controller.my) {
              return false;
            }
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
              target => budgetedUpgrade(target), 3);
          }
        }
      ];
    } else if (creep.memory.working && creep.memory.role === 'upgrader') {
      // The room dispatcher owns controller slots. Surplus upgrader-shaped
      // creeps do not consume energy merely because their role label says UP.
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
            if (demandLane !== 'upgrade' || !controller || !controller.my) {
              return false;
            }
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
              target => budgetedUpgrade(target), 3);
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
          return perform(controller, target => budgetedUpgrade(target), 3);
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
            ? perform(target, structure => budgetedRepair(structure), 3)
            : false;
        }
      },
      {
        name: 'build',
        run: () => {
          if (creep.memory.role === 'hauler' || !hasWorkParts(creep) ||
              demandLane !== 'build') return false;
          const site = getBuildTarget();
          return site ? performBuild(site) : false;
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
          return perform(controller, target => budgetedUpgrade(target), 3);
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
              structure => canWithdrawFrom(creep, structure) &&
                getUnreservedEnergy(structure) > 0);
            if (storedEnergy) return false;
            const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            return source
              ? perform(source, target => harvestWithoutSpill(target))
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
          return perform(assignment.source, target => harvestWithoutSpill(target));
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
              (structure.structureType === STRUCTURE_CONTAINER ||
                structure.structureType === STRUCTURE_LINK) &&
              structure.pos.getRangeTo(controller) <= 3 &&
              getUnreservedEnergy(structure) > 0);
          const plan = creep.room.memory.controllerContainerPlan;
          const retiringContainer = creep.memory.role === 'hauler' && plan &&
            plan.drainCreep === creep.name &&
            Game.getObjectById(plan.retireContainerId);
          // Source precedence for RC work is intentionally strict. A creep
          // assigned to upgrade must drain the controller-side buffer before
          // considering storage or a source container. This is the consumption
          // half of the brigade pipeline: brigade -> RC buffer -> upgrader.
          const assignedToController = creep.memory.role === 'upgrader' ||
            demandLane === 'upgrade' || creep.memory.task === 'upgrade' ||
            creep.memory.lastTask === 'upgrade';
          if (assignedToController && controllerContainer) {
            container = controllerContainer;
          } else if (retiringContainer &&
              retiringContainer.store[RESOURCE_ENERGY] > 0) {
            container = retiringContainer;
          }
          // A retained storage target is not a lifetime claim. Builders may
          // switch to a nearer permitted source container for this empty load;
          // protected extension/controller buffers remain excluded by
          // canWithdrawFrom. Once selected, the nearer container is retained.
          if (isLocalBuilder(creep) && container === creep.room.storage) {
            const nearerContainer = creep.pos.findClosestByPath(
              getRoomStructures(creep.room).filter(structure =>
                structure.structureType === STRUCTURE_CONTAINER &&
                canWithdrawFrom(creep, structure) &&
                getUnreservedEnergy(structure) > 0));
            if (nearerContainer && creep.pos.getRangeTo(nearerContainer) <
                creep.pos.getRangeTo(container)) {
              container = nearerContainer;
              delete creep.memory.withdrawTarget;
            }
          }
          if (container) creep.memory.withdrawTarget = container.id;
          if (!canWithdrawFrom(creep, container) ||
              getUnreservedEnergy(container) <= 0) {
            delete creep.memory.withdrawTarget;
            const candidates = getRoomStructures(creep.room).filter(s =>
              canWithdrawFrom(creep, s) &&
                getUnreservedEnergy(s) > 0 &&
                (!plan || s.id !== plan.retireContainerId ||
                  plan.drainCreep === creep.name));
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
          const withdrawal = executeReservedWithdrawal({ creep,
            target: container, resource: RESOURCE_ENERGY,
            capacity: creep.store.getFreeCapacity(RESOURCE_ENERGY),
            reserve: reserveEnergyFrom,
            release: (source, amount) => releaseAmount(reservedEnergy,
              source, amount),
            remember: rememberDispatchCommitment,
            forget: forgetDispatchCommitment,
            move: worker => {
              const approach = getWithdrawalApproachTarget(worker, container,
                controllerStation);
              moveCreep(worker, approach,
                controllerStation && approach === controllerStation.position
                  ? 0 : 1);
            },
            OK, ERR_NOT_IN_RANGE, supplyAmount: false });
          if (withdrawal.state !== 'accepted') return false;
          if (withdrawal.result === ERR_NOT_IN_RANGE) return true;
          delete creep.memory.collectionSourceTarget;
          return true;
        }
      }
      ];
    }

    delete creep.memory.task;
    delete creep.memory.taskTarget;
    delete creep.memory.waitState;
    delete creep.memory.waitReason;
    if((creep.memory.emergencyRepairRoom || isOutpostBuilder(creep)) && (()=>{
      const destination=Game.rooms[creep.memory.emergencyRepairRoom||creep.memory.remoteRoom];
      if(!destination)return false;
      const active=runOutpostRepair({creep,room:destination,structures:getRoomStructures(destination),
        stores:getRoomStructures(creep.room).filter(s=>s.structureType===STRUCTURE_CONTAINER||s===creep.room.storage),
        work:creep.getActiveBodyparts(WORK),free:creep.store.getFreeCapacity(RESOURCE_ENERGY),energy:creep.store[RESOURCE_ENERGY],
        available:getUnreservedEnergy,reserve:reserveEnergyFrom,
        withdraw:(target,amount)=>perform(target,t=>creep.withdraw(t,RESOURCE_ENERGY,amount)),
        repair:target=>perform(target,t=>budgetedRepair(t),3),
        move:(target,range)=>moveCreep(creep,target,range,{direct:true,maxOps:12000}),
        claim:target=>claimExclusive(reservedJobs.repair,target,creep.name),
        eligible:target=>exclusiveClaimAvailable(reservedJobs.repair,target,creep.name)});
      if(!active)delete creep.memory.emergencyRepairRoom;
      return active;
    })()){
      creep.memory.task=creep.memory.repairLoading?'repair-load':'emergency-repair';
    } else if (seekTowerHealing()) {
      creep.memory.task = 'seek-tower-healing';
    } else if (storeNonEnergySalvage()) {
      creep.memory.task = 'store-salvage';
    } else if (isExpansionBuilder(creep)) {
      delete creep.memory.bootstrapAction;
      if (tasks[0] && tasks[0].run()) {
        creep.memory.task = creep.memory.bootstrapAction || tasks[0].name;
      }
    } else if (postBattleScavenge()) {
      creep.memory.task = 'battle-salvage';
    } else if (fillPassingExtensionBuffer()) {
      creep.memory.task = 'stock-refill-pass';
    } else if (topUpFromPassingSourceBuffer(demandLane === 'storage')) {
      creep.memory.task = 'collect-pass';
    } else if (collectPartialHauler({
      creep, lane: demandLane,
      target: Game.getObjectById(managedPickup ? pickupJob?.targetId
        : creep.memory.workJob?.sourceId),
      resource: RESOURCE_ENERGY, canWithdraw: canWithdrawFrom,
      reserve: reserveEnergyFrom,
      release: (target, amount) => releaseAmount(reservedEnergy, target, amount),
      remember: rememberDispatchCommitment, forget: forgetDispatchCommitment,
      move: moveCreep, OK, ERR_NOT_IN_RANGE
    })) {
      creep.memory.task = 'committed-collect';
    } else if (continueDispatchCommitment()) {
      creep.memory.task = `committed-${demandLane}`;
    } else if (!['miner', 'harvester'].includes(creep.memory.role) &&
        creep.memory.role !== 'refiller' &&
        creep.memory.role !== 'rebalancer' &&
        creep.memory.role !== CONTROLLER_BRIGADE_ROLE &&
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

    if (creep.memory.role === 'remote-miner' &&
        creep.memory.task === 'remote-miner') {
      if (creep.memory.remoteAction === 'BuildC' ||
          creep.memory.remoteAction === 'Site') {
        creep.memory.task = 'remote-container';
      } else if (creep.memory.remoteAction === 'Mine') {
        creep.memory.task = 'remote-harvest';
      } else if (creep.memory.remoteAction === 'Repair') {
        creep.memory.task = 'repair';
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
      if (demandLane === 'refill') {
        const ownedTarget = Game.getObjectById(creep.memory.workJob &&
          creep.memory.workJob.targetId);
        const target = ownedTarget || getRefillTarget();
        if (target && deliverRefill(target)) creep.memory.task = 'refill';
      } else if (demandLane === 'refill-buffer' ||
          demandLane === 'buffer' || demandLane === 'storage') {
        if (storeEnergyInBuffer()) {
          creep.memory.task = demandLane === 'refill-buffer'
            ? 'stock-refill' : demandLane === 'storage'
              ? 'store-storage' : 'store-buffer';
        } else {
        const fixedStores = getRoomStructures(creep.room)
          .filter(structure => demandLane === 'refill-buffer'
            ? isExtensionRefillBuffer(creep.room, structure)
            : demandLane === 'storage'
              ? structure === creep.room.storage
              : structure.structureType === STRUCTURE_CONTAINER &&
                controller && structure.pos.getRangeTo(controller) <= 3)
          .sort((a, b) => creep.pos.getRangeTo(a) -
            creep.pos.getRangeTo(b));
        const fixedStore = fixedStores[0];
        if (fixedStore) {
          const delivering = creep.memory.role === 'remote-hauler'
            ? transferEnergy(fixedStore)
            : deliverStagedEnergy({
              creep, target: fixedStore, resourceType: RESOURCE_ENERGY,
              moveCreep, OK, ERR_NOT_IN_RANGE
            });
          if (delivering) {
            creep.memory.task = demandLane === 'refill-buffer'
              ? 'stock-refill'
              : fixedStore === creep.room.storage
                ? 'store-storage' : 'store';
          } else {
            if (creep.pos.getRangeTo(fixedStore) > 1) {
              moveCreep(creep, fixedStore, 1);
            }
            const isControllerReserve = controller &&
              fixedStore.structureType === STRUCTURE_CONTAINER &&
              fixedStore.pos.getRangeTo(controller) <= 3;
            creep.memory.task = demandLane === 'refill-buffer'
              ? 'stage-refill'
              : isControllerReserve ? 'stage-buffer' : 'store-storage';
          }
          creep.memory.taskTarget = fixedStore.id;
        }
        }
      }
    }

    // Never invent controller work after dispatch. A creep upgrades only when
    // the room plan gave it an upgrade job; otherwise it preserves energy for
    // the higher-priority lane that owns it.
    if (!creep.memory.task && creep.store[RESOURCE_ENERGY] > 0 &&
        demandLane === 'upgrade' && hasWorkParts(creep) &&
        controller && controller.my &&
        creep.memory.role !== 'miner' && creep.memory.role !== 'harvester' &&
        creep.memory.role !== 'hauler' &&
        creep.memory.role !== 'remote-hauler') {
      if (perform(controller,
        target => budgetedUpgrade(target), 3)) {
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
    // Last-resort use of energy already carried by a flexible WORK body. This
    // branch does not authorize a new upgrader or change the durable specialty;
    // it only prevents a paid load from idling after the planned object
    // completed between planning and execution. Repair and construction come
    // before RC. An explicit standby lane bypasses this fallback entirely.
    if (!creep.memory.task && creep.store[RESOURCE_ENERGY] > 0 &&
        demandLane !== 'standby' &&
        hasWorkParts(creep) && creep.memory.role !== 'miner' &&
        creep.memory.role !== 'harvester' &&
        creep.memory.role !== 'hauler' &&
        creep.memory.role !== 'remote-hauler' &&
        creep.memory.role !== 'rebalancer' &&
        creep.memory.role !== 'retire') {
      workDispatch.complete(creep);
      const repairTarget = getRepairTarget();
      if (repairTarget && perform(repairTarget,
        target => budgetedRepair(target), 3)) {
        creep.memory.task = 'repair';
      } else {
        const buildTarget = getBuildTarget();
        if (buildTarget && performBuild(buildTarget)) {
          creep.memory.task = 'build';
        }
        // No unassigned RC fallback: the dispatched upgrade lane above owns
        // routine controller work, including during a minimal-upgrading move.
      }
    }
    // A failed lane gets a second dispatch pass this tick. Use the same target
    // claims and capacity reservations as normal execution, with fixed stores
    // for hauling and reserved source tiles for emergency worker harvesting.
    const localRecoveryRole = ['hauler', 'refiller', 'rebalancer', 'builder', 'worker',
      'upgrader'].includes(creep.memory.role) &&
      !isOutpostBuilder(creep) && !isExpansionBuilder(creep) &&
      !isBuilder(creep, 'local', 'tunnel') &&
      (!creep.memory.home || creep.memory.home === creep.room.name);
    const recovery = localRecoveryRole && recoverBlockedWork({
      creep, lane: demandLane,
      actions: [
        {
          task: 'refill', lane: 'refill',
          eligible: () => creep.store[RESOURCE_ENERGY] > 0,
          run: () => {
            const target = getRefillTarget();
            return Boolean(target && deliverRefill(target));
          }
        },
        {
          task: 'repair', lane: 'repair',
          eligible: () => creep.store[RESOURCE_ENERGY] > 0 &&
            hasWorkParts(creep) && canBodyTypeRunLane(
              creep.memory.bodyType, 'repair', creep.memory.role),
          run: () => {
            const target = getRepairTarget();
            return Boolean(target && perform(target,
              structure => budgetedRepair(structure), 3));
          }
        },
        {
          task: 'build', lane: 'build',
          eligible: () => creep.store[RESOURCE_ENERGY] > 0 &&
            hasWorkParts(creep) && canBodyTypeRunLane(
              creep.memory.bodyType, 'build', creep.memory.role),
          run: () => {
            const target = getBuildTarget();
            return Boolean(target && performBuild(target));
          }
        },
        {
          task: 'store-storage', lane: 'storage',
          eligible: () => creep.store[RESOURCE_ENERGY] > 0 &&
            ['hauler', 'refiller', 'rebalancer'].includes(creep.memory.role),
          run: () => {
            const storage = creep.room.storage;
            // Do not return a load to the store it was just collected from.
            return Boolean(storage &&
              !creep.memory.energySources?.includes(storage.id) &&
              transferEnergy(storage));
          }
        },
        {
          task: 'harvest', lane: 'harvest',
          eligible: () => creep.store[RESOURCE_ENERGY] === 0 &&
            hasWorkParts(creep) &&
            ['builder', 'worker', 'upgrader'].includes(creep.memory.role) &&
            demandLane !== 'none',
          run: () => {
            const assignment = findHarvestAssignment(creep);
            if (!assignment) return false;
            creep.memory.taskTarget = assignment.source.id;
            if (creep.pos.x !== assignment.x || creep.pos.y !== assignment.y) {
              moveCreep(creep, new RoomPosition(assignment.x,
                assignment.y, creep.room.name), 0);
              return true;
            }
            return perform(assignment.source, target => harvestWithoutSpill(target));
          }
        }
      ]
    });
    if (recovery) {
      const blockedLane = demandLane;
      workDispatch.complete(creep);
      const target = Game.getObjectById(creep.memory.taskTarget);
      if (recovery.lane !== 'harvest') {
        workDispatch.reconcile([creep], { [creep.name]: {
          lane: recovery.lane, targetId: target && target.id,
          amount: creep.store[RESOURCE_ENERGY], priority: lanePriority(
            creep.room, demandPlan, recovery.lane),
          reason: 'blocked ' + blockedLane + ': reassigned to executable work'
        } });
      }
      creep.memory.task = recovery.task;
      creep.memory.demandLane = recovery.lane;
      creep.memory.reassignment = { tick: Game.time, from: blockedLane,
        to: recovery.lane, targetId: target && target.id };
      delete creep.memory.waitState;
      delete creep.memory.waitReason;
      if (demandPlan) {
        demandPlan.assignments[creep.name] = recovery.lane;
        delete demandPlan.collectionSources[creep.name];
        delete demandPlan.supplyTargets[creep.name];
        const saved = creep.room.memory.demandPlan;
        if (saved) {
          saved.lanes[blockedLane] = Math.max(0, (saved.lanes[blockedLane] || 0) - 1);
          saved.lanes[recovery.lane] = (saved.lanes[recovery.lane] || 0) + 1;
          delete saved.collectionSources[creep.name];
          if (creep.memory.workJob) saved.jobs[creep.name] = creep.memory.workJob;
          else delete saved.jobs[creep.name];
        }
      }
    }
    if (!creep.memory.task && demandLane === 'standby') {
      const parking = getConservationParkingSpot(creep);
      if (parking && creep.pos.getRangeTo(parking) > 0) {
        moveCreep(creep, parking, 0);
      }
      creep.memory.task = 'standby';
      creep.memory.waitState = 'parked';
      creep.memory.waitReason = 'planner reserve: work crews and controller slots allocated';
      creep.memory.taskTarget = parking
        ? `population conservation ${parking.x},${parking.y}`
        : 'population conservation';
    }
    if (!creep.memory.task) {
      let anchor;
      let range = 3;
      if (isBuilder(creep, 'local', 'tunnel')) {
        anchor = Game.getObjectById(creep.memory.builderTarget) ||
          getSource2TunnelSite(creep.room);
        range = 3;
      } else if (creep.store[RESOURCE_ENERGY] === 0) {
        anchor = creep.pos.findClosestByPath(
          getRoomStructuresByType(creep.room, STRUCTURE_CONTAINER)
            .filter(structure =>
            structure.store[RESOURCE_ENERGY] > 0 &&
            canWithdrawFrom(creep, structure)));
        range = 1;
      }
      if (!anchor) {
        anchor = creep.memory.role === 'upgrader' && controller?.my
          ? controller : getRoomStructuresByType(creep.room, STRUCTURE_SPAWN)
            .find(spawn => spawn.my);
      }
      if (anchor && creep.pos.getRangeTo(anchor) > range) {
        moveCreep(creep, anchor, range);
      }
      creep.memory.task = 'standby';
      creep.memory.waitState = 'blocked';
      creep.memory.waitReason = `assigned ${demandLane || 'none'}: no executable target or action`;
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
    // Speech is an execution trace, not a role label. For example, GetSt says
    // where this load is being collected; a later RC says where it is spent.
    // Durable ownership remains in workJob and dispatchCommitment.
    if(creep.memory.energyBudgetHeld){
      creep.memory.idleNow=true;creep.memory.waitState='parked';
      creep.memory.waitReason=creep.memory.energyBudgetReason||'controller spending budget';
    }
    let speech;
    if(creep.memory.energyBudgetHeld){
      speech='SaveE';
    } else if (creep.memory.role === CONTROLLER_BRIGADE_ROLE) {
      speech = `B${creep.memory.controllerRelaySlot + 1}`;
    } else if (Number.isInteger(
      creep.memory.controllerRelaySubstituteSlot)) {
      speech = `SUB${creep.memory.controllerRelaySubstituteSlot + 1}`;
    } else if (creep.memory.task === 'source-work' && creep.memory.sourceAction) {
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
    } else if (creep.memory.task === 'remote-miner' ||
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
    } else if (creep.memory.task === 'committed-collect' ||
        creep.memory.task === 'collect-pass' ||
        creep.memory.task === 'withdraw' ||
        creep.memory.task === 'refill-load') {
      const targetId = String(creep.memory.taskTarget || '').split(' ')[0];
      const pickup = Game.getObjectById(targetId);
      const sourceIndex = pickup && pickup.pos
        ? getRoomSources(creep.room).findIndex(source =>
          source.pos.getRangeTo(pickup) <= 2)
        : -1;
      if (pickup && isExtensionRefillBuffer(creep.room, pickup)) {
        speech = 'LoadSp';
      } else if (pickup && creep.room.storage === pickup) {
        speech = 'GetSt';
      } else {
        speech = sourceIndex >= 0 ? `GetS${sourceIndex + 1}` : 'Get';
      }
    } else if (creep.memory.task === 'standby' ||
        creep.memory.task === 'wait-job') {
      speech = getWaitSpeech(creep.memory);
    } else {
      // Expansion speech describes the newly claimed room in the live view;
      // historical reporting retains the base label "Expand".
      speech = getTaskSpeech(creep.memory.task, {
        overrides: { 'expansion-build': 'New' }
      });
    }
    creep.memory.lastTtl = creep.ticksToLive;
    creep.memory.lastRoom = creep.room.name;
    creep.memory.lastTask = creep.memory.task || 'idle';
    creep.say(speech);
  }

  Memory.cpuPolicy.execution = {
    ...summarizeCreepExecution({ creeps: executionCreeps,
      executedCount: executedCreepCount, tick: Game.time,
      previous: previousCpuExecution }),
    ceiling: executionCpuCeiling,
    fairCreeps: fairExecutionCreeps.map(creep => creep.name),
    usedAfterCreeps: Game.cpu && typeof Game.cpu.getUsed === 'function'
      ? Game.cpu.getUsed() : null
  };
  cpuStages.mark('creeps');

  // Defense is an explicit scenario-owned job. Run it after ordinary work so
  // combat movement and attack intents cannot be overwritten by fallback
  // dispatch. After the war window, surviving carriers can join an active
  // brigade; other temporary defenders recycle.
  const threatenedRooms = Object.values(Game.rooms).filter(room =>
    getDefenseTargets(room, FIND_HOSTILE_CREEPS,
      FIND_HOSTILE_STRUCTURES).length > 0).map(room => room.name);
  const reactivatedDefenders = reactivateDefenders(Game, threatenedRooms);
  if (reactivatedDefenders.length) {
    console.log(`[${Game.time}] defense reactivated ${
      reactivatedDefenders.map(entry => `${entry.creep}->${entry.targetRoom}`)
        .join(', ')}`);
  }
  const defenders = creeps.filter(candidate =>
    candidate.memory.role === 'defender');
  const objectiveDefenderRequirements = getObjectiveDefenderRequirements(
    Object.values(Game.rooms).filter(room => room.controller &&
      room.controller.my));
  const garrisonRequirements = Object.fromEntries(Object.values(Game.rooms)
    .map(room => [room.name, Math.max(
      room.memory.combatStatus && room.memory.combatStatus.requiredDefenders || 0,
      objectiveDefenderRequirements[room.name] || 0)]));
  for (const [roomName, required] of Object.entries(
    objectiveDefenderRequirements)) garrisonRequirements[roomName] = required;
  const garrison = selectDefenderGarrison(defenders, garrisonRequirements);
  for (const creep of defenders) {
    if (creep.memory.role !== 'defender') continue;
    waitAge.markEvaluated(creep, true);
    const targetRoomName = creep.memory.defenseTargetRoom ||
      creep.room.name;
    if (!(garrison.get(targetRoomName) || []).includes(creep)) {
      creep.memory.retiredRole = 'defender';
      creep.memory.staffingRetire = true;
      creep.memory.role = 'retire';
      creep.memory.task = 'recycle';
      continue;
    }
    const homeRoomName = creep.memory.home || targetRoomName;
    if (creep.memory.defenseReturnHome &&
        creep.room.name !== homeRoomName) {
      moveCreep(creep, new RoomPosition(25, 25, homeRoomName), 20);
      creep.memory.task = 'defend-return';
      creep.memory.taskTarget = `${homeRoomName} brigade`;
      continue;
    }
    const targetRoom = Game.rooms[targetRoomName];
    if (!targetRoom) {
      moveCreep(creep, new RoomPosition(25, 25, targetRoomName), 20);
      creep.memory.task = 'defend';
      creep.memory.taskTarget = targetRoomName;
      creep.memory.idleNow = false;
      continue;
    }
    const hostiles = getDefenseTargets(targetRoom, FIND_HOSTILE_CREEPS,
      FIND_HOSTILE_STRUCTURES);
    if (hostiles.length === 0) {
      if (Memory.war === true) {
        creep.memory.task = 'defend-standby';
        creep.memory.taskTarget = `waiting for war to end`;
        creep.memory.idleNow = false;
        continue;
      }
      if (creep.room.name !== homeRoomName) {
        creep.memory.defenseReturnHome = true;
        moveCreep(creep, new RoomPosition(25, 25, homeRoomName), 20);
        creep.memory.task = 'defend-return';
        creep.memory.taskTarget = `${homeRoomName} brigade`;
        continue;
      }
      const homeRoom = Game.rooms[homeRoomName];
      if (homeRoom && isBrigadePlanActive(homeRoom) &&
          getRoomSituation(homeRoom).policy.permissions
            ?.controllerBrigade) {
        const adopted = adoptDefenders(homeRoom, Game,
          getControllerBrigadePlan(homeRoom), Memory.war, candidate => {
            const defendedRoom = Game.rooms[
              candidate.memory.defenseTargetRoom || candidate.room.name];
            return candidate.room.name === homeRoomName && defendedRoom &&
              getDefenseTargets(defendedRoom, FIND_HOSTILE_CREEPS,
                FIND_HOSTILE_STRUCTURES).length === 0;
          });
        if (adopted.some(entry => entry.creep === creep.name)) continue;
      }
      creep.memory.retiredRole = 'defender';
      creep.memory.staffingRetire = true;
      creep.memory.role = 'retire';
      creep.memory.task = 'recycle';
      continue;
    }
    const target = selectCombatTarget(creep, hostiles, {
      HEAL, RANGED_ATTACK, ATTACK, WORK, CLAIM
    });
    if (creep.room.name !== targetRoomName) {
      moveCreep(creep, target, 1, { avoidFriendlyBlockers: true });
    }
    const result = creep.room.name === targetRoomName
      ? creep.attack(target) : ERR_NOT_IN_RANGE;
    if (result === ERR_NOT_IN_RANGE) {
      moveCreep(creep, target, 1, { avoidFriendlyBlockers: true });
    }
    else holdMeleeEngagement(creep, target, result, OK);
    creep.memory.task = 'defend';
    creep.memory.taskTarget = target.id;
    creep.memory.idleNow = false;
    creep.say('Defend');
  }
  for (const creep of creeps) {
    if (creep.spawning || creep.memory.role === 'defender') continue;
    if (creep.hits < creep.hitsMax) {
      const healers = creep.room.find(FIND_MY_CREEPS, {
        filter: candidate => candidate.id !== creep.id &&
          candidate.getActiveBodyparts(HEAL) > 0
      });
      const towers = getRoomStructuresByType(creep.room, STRUCTURE_TOWER)
        .filter(tower => tower.my);
      const healingTarget = [...healers, ...towers].sort((a, b) =>
        creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b) ||
        String(a.id).localeCompare(String(b.id)))[0];
      if (healingTarget) {
        waitAge.markEvaluated(creep, true);
        moveCreep(creep, healingTarget, 1);
        creep.memory.task = 'seek-healing';
        creep.memory.taskTarget = healingTarget.id;
        creep.memory.idleNow = false;
        creep.say('Heal!');
        continue;
      }
    }
    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
    const roomDefenders = defenders.filter(defender =>
      defender.room.name === creep.room.name);
    const step = findFleeStep(creep, hostiles, 5, roomDefenders);
    if (!step) continue;
    waitAge.markEvaluated(creep, true);
    const threat = creep.pos.findClosestByRange(hostiles);
    moveCreep(creep, step, 0, { direct: true });
    creep.memory.task = 'flee';
    creep.memory.taskTarget = threat && threat.id || 'hostile';
    creep.memory.idleNow = false;
    creep.say('Run!');
  }

  // Always sample final decisions, including CPU skips and safety overrides.
  Memory.waitAge = waitAge.finish(creeps);
  cpuStages.mark('defense');

  // Dashboard data refreshes every ten ticks for console reporting. Avoid the
  // full build/repair assignment scan on other ticks where it is discarded.
  const optionalReportingCpuAvailable = () => !Game.cpu ||
    typeof Game.cpu.getUsed !== 'function' ||
    !Number.isFinite(Game.cpu.limit) ||
    Game.cpu.getUsed() < Game.cpu.limit * 0.7;
  const workMetrics = allowSlowPlanning && optionalReportingCpuAvailable() &&
    scheduledGlobalTick(10)
    ? collectColonyWorkMetrics({
      Game, creeps, roomDemandPlans, getRoomSites, getRoomStructures,
      isOutpostRepairTarget, isOutpostBuilder, isExpansionBuilder, isBuilder,
      REPAIR_POWER
    })
    : null;
  for (const room of Object.values(Game.rooms).filter(candidate =>
    candidate.controller && candidate.controller.my)) {
    const surveys = [room.memory.leftSurvey, room.memory.southSurvey,
      room.memory.southwestSurvey].filter(survey =>
      survey && survey.active && survey.targetRoom);
    const summaries = surveys.map(survey =>
      getRemoteResourceSummary(survey.targetRoom));
    const outpostEconomy = room.memory.outpostEconomy || {};
    const roomCreeps = creeps.filter(creep => creep.memory.home === room.name);
    const remoteRosterGap = surveys.reduce((total, survey) => {
      const assigned = roomCreeps.filter(creep =>
        creep.memory.role === 'remote-hauler' &&
        creep.memory.remoteRoom === survey.targetRoom &&
        !creep.memory.remoteRosterSurplus).length;
      return total + Math.max(0,
        (survey.remoteHaulerTarget || 0) - assigned);
    }, 0);
    const sourceCoverageGap = calculateSourceCoverageGap(
      getRoomSources(room), roomCreeps, {
        workPart: WORK,
        energyRegenTime: ENERGY_REGEN_TIME,
        harvestPower: HARVEST_POWER,
        isViable: hasLocalReplacementLife
      });
    updateOperationalHealth(room.memory, Game.time, roomCreeps, {
      backlog: summaries.reduce((total, summary) =>
        total + (summary.storedEnergy || 0), 0),
      blockedRooms: summaries.filter(summary =>
        (summary.storedEnergy || 0) >= 1000).length,
      rosterGap: remoteRosterGap,
      sourceCoverageGap,
      delivered: Object.values(outpostEconomy).reduce((total, stats) =>
        total + (stats.deliveredTotal || 0), 0)
    });
  }
  if (allowSlowPlanning && optionalReportingCpuAvailable()) {
    updateDashboard(creeps, workMetrics || {});
  }

  if (Game.time % 100 === 0) {
    const healthLines = Object.values(Game.rooms)
      .filter(room => room.controller && room.controller.my)
      .map(room => summarizeRoomHealth(room.name,
        room.memory.roomTrendHistory).console);
    console.log(`[${Game.time}] Colony health:\n` +
      `${healthLines.map(line => `  ${line}`).join('\n') || '  no owned rooms'}`);
  }

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
      const buildTargets = getRoomSites(room)
        .map(site => `${buildCodes[site.structureType] || site.structureType}` +
          `@${site.pos.x},${site.pos.y} ${site.progress}/${site.progressTotal}`);
      const roadCount = getRoomStructuresByType(room, STRUCTURE_ROAD).length;
      const roadSiteCount = getRoomSitesByType(room, STRUCTURE_ROAD).length;
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
      const reportedWorkerLimit = workerLimit;
      const blockers = getSpawnActivityStatus({ idleCount, congestionCount,
        population: roomCreeps.length, workerLimit: reportedWorkerLimit,
        spawns: roomSpawns });
      if (Number.isInteger(room.memory.spawnWaitSince) &&
          room.energyAvailable < room.energyCapacityAvailable) {
        blockers.push(`charging body ${Math.min(25,
          Game.time - room.memory.spawnWaitSince)}/25`);
      }
      if (room.energyAvailable < workerCost) {
        blockers.push(`energy<${workerCost}`);
      }
      const status = blockers.length ? blockers.join(', ') : 'spawn ready';
      room.memory.spawnActivityStatus = { updated: Game.time, status,
        idleCount, congestionCount, spawnCount: roomSpawns.length,
        busySpawns: roomSpawns.filter(spawn => spawn.spawning).length };
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
        `  Busy ${room.memory.busySummaryStreak}/4 | ` +
          `Sp ${spawns.join(',') || 'none'} | ${status}`,
        `  Stage ${strategy.stageName}: ${strategy.stageGoal}`,
        `  Next: ${strategy.gate}`
      ].filter(Boolean).join('\n'));
    }
  }

  cpuStages.mark('reporting');
  // Keep two compact 20-tick CPU windows in Memory. This is diagnostic only;
  // it does not influence staffing or jobs, and attributes each bounded total
  // to broad loop stages without retaining per-tick history.
  if (cpuStart !== null) {
    const used = Math.max(0, Game.cpu.getUsed() - cpuStart);
    Memory.performance = updateCpuPerformanceWindow({
      performance: Memory.performance, tick: Game.time, total: used,
      stages: cpuStages.snapshot()
    });
  }
};
