'use strict';

const { scaleEnergyBudget, scaleReserve, scaleBacklog } =
  typeof Game === 'undefined'
    ? require('./room.scaling')
    : require('room.scaling');

// Colony population policy is deliberately independent from the Screeps API.
// main.js converts the live room into this small snapshot; keeping the maths
// here makes staffing decisions testable and prevents role code from inventing
// its own, conflicting head counts.
const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const role = (minimum, desired, maximum, reason) => ({
  min: Math.max(0, Math.floor(minimum)),
  desired: Math.max(0, Math.floor(desired)),
  max: Math.max(0, Math.floor(maximum)),
  reason
});

const normalize = entry => {
  entry.desired = Math.max(entry.min, entry.desired);
  entry.max = Math.max(entry.desired, entry.max);
  return entry;
};

/**
 * Convert one owned room's normalized observations into the authoritative
 * staffing and budget decision for this tick.
 *
 * This function is intentionally pure. Callers may measure the world, and
 * executors may act on the result, but neither may silently redefine role
 * targets or optional-work gates. Safety floors are `min`; sustainable work
 * is `desired`; `max` is a surge ceiling, never a spawn target.
 *
 * @param {object} state API-free room observations from room.situation.js
 * @returns {object} mode, health, permissions, budgets, roles, remote, totals
 */
const derivePopulationPolicy = state => {
  // Phase 1: normalize raw measurements. Defaults here make an incomplete
  // observation conservative rather than allowing NaN to spread into staffing.
  const rcl = clamp(state.rcl || 0, 0, 8);
  const sources = Math.max(1, state.sourceCount || 0);
  const energyRatio = clamp(state.energyRatio || 0, 0, 1);
  const bufferRatio = clamp(state.bufferRatio || 0, 0, 1);
  const storedEnergy = Math.max(0, state.storedEnergy || 0);
  const energyCapacity = Math.max(300, state.energyCapacity || 0);
  const sourceBufferCapacity = Math.max(0,
    state.sourceBufferCapacity || 0);
  const extensionCount = Math.max(0, state.extensionCount || 0);
  const energyConsumers = Math.max(1, state.energyConsumerCount || 1);
  const construction = state.construction || {};
  const repair = state.repair || {};
  const controllerDanger = (state.controllerTicks || Infinity) < 3000;
  const bootstrap = rcl <= 1 || state.spawnCount === 0;
  const starvationReserve = scaleEnergyBudget(energyCapacity, 0.5);
  const droppedBacklog = scaleEnergyBudget(energyCapacity, 0.4, {
    minimum: 100
  });
  const sourceBacklog = scaleEnergyBudget(energyCapacity, 0.75, {
    minimum: 500
  });
  const starved = state.energyStarvedHold ||
    energyRatio < 0.35 && bufferRatio < 0.25 &&
      storedEnergy < starvationReserve;
  const highestSourceBufferRatio = clamp(
    state.highestSourceBufferRatio == null
      ? bufferRatio : state.highestSourceBufferRatio, 0, 1);
  const logisticsBacklog = highestSourceBufferRatio >= 0.65 ||
    (state.storedSourceEnergy || 0) >= sourceBacklog ||
    (state.droppedEnergy || 0) >= droppedBacklog;
  const logisticsRecovery = logisticsBacklog && energyRatio < 0.85;

  // Phase 2: classify economic health. One shared health classification controls optional colony load.  Role
  // modules must not each invent their own interpretation of a low spawn
  // charge, a large reserve, or the current RCL.
  const reserveFloor = scaleReserve(energyCapacity, 2, 600);
  const reserveSurplus = scaleReserve(energyCapacity, 6, 1800);
  let health = 'healthy';
  if (bootstrap || controllerDanger) health = 'critical';
  else if (starved || repair.critical) health = 'recovering';
  else if (logisticsRecovery ||
      energyRatio < 0.5 && storedEnergy < reserveSurplus ||
      storedEnergy < reserveFloor) health = 'strained';
  else if (!logisticsBacklog && energyRatio >= 0.85 &&
      bufferRatio >= 0.2 && bufferRatio <= 0.5 &&
      storedEnergy >= reserveSurplus) {
    health = 'surplus';
  }
  const healthRank = {
    critical: 0, recovering: 1, strained: 2, healthy: 3, surplus: 4
  }[health];
  const remoteMaintenance = rcl >= 3 && healthRank >= 1;
  const remoteBacklogThreshold = scaleEnergyBudget(energyCapacity, 2, {
    minimum: 1000
  });
  // Established income routes need their measured carrier capacity before
  // their containers fill. Home road completion and expansion health gates
  // must not shrink three productive outposts to one carrier each.
  const fundedEstablishedRoutes = (state.activeRemoteRooms || 0) > 0 &&
    (state.remoteHaulerDemand || 0) > (state.activeRemoteRooms || 0) &&
    storedEnergy >= reserveSurplus;
  const remoteHaulingRecovery = rcl >= 5 && remoteMaintenance &&
    (fundedEstablishedRoutes || (state.remoteBlockedRooms || 0) > 0 &&
      (state.remoteBacklog || 0) >= remoteBacklogThreshold);
  const permissions = {
    // Existing productive outposts are income infrastructure from RCL 3 on.
    // Their floor survives a strained room, while expansion to full route
    // throughput waits for a healthy RCL 5 economy.
    remoteMaintenance,
    // Full remote containers are an income outage, not optional expansion.
    // Permit only the measured carrier surge while established rooms are
    // blocked; miners, builders, claims, and new remote rooms keep their
    // ordinary health gates.
    remoteHaulingRecovery,
    remoteGrowth: rcl >= 5 && healthRank >= 3 &&
      state.coreRoadAccessComplete !== false,
    controllerBrigade: rcl >= 5 && healthRank >= 3 &&
      !state.extensionMigrationActive,
    optionalConstruction: healthRank >= 2,
    optionalPopulation: healthRank >= 3,
    // A new claim is governed by actual claim capability and GCL in the
    // expansion planner. Policy contributes only the sponsor-health gate.
    expansion: healthRank >= 3,
    // Once the controller is owned, keep bootstrap support available unless
    // the sponsoring room has fallen into a critical survival state.
    expansionMaintenance: healthRank >= 1
  };
  const budgets = {
    constructionCrewScale: healthRank <= 1 ? 0.25
      : healthRank === 2 ? 0.5 : healthRank === 3 ? 0.75 : 1,
    reserveFloor,
    reserveSurplus
  };

  const sourceMinimum = Math.max(sources,
    state.efficientSourceWorkers || sources);
  // Source staffing is a WORK-capacity requirement. Historical tile-count
  // learning remains diagnostic, but must not turn two efficient miners into
  // a permanent six-body desired roster.
  const sourceDesired = sourceMinimum;
  const sourceMaximum = Math.max(sourceDesired,
    state.sourceWorkSpots || sourceDesired);

  const extensionClusters = Math.max(0,
    state.extensionClusterCount || 0);
  const refillerMinimum = rcl >= 2 && energyConsumers > 1
    ? Math.max(1, extensionClusters) : 0;
  // Each physical extension clump has one stable owner. This scales by layout,
  // not raw extension count, so specialists do not overlap within a clump.
  const refillerDesired = refillerMinimum;
  const refillerMaximum = refillerMinimum;

  const averageSourceDistance = Math.max(5,
    state.averageSourceDistance || 15);
  const routeLoad = sources * averageSourceDistance;
  const containerEconomy = (state.sourceContainerCount || 0) > 0;
  const haulerMinimum = containerEconomy ? Math.max(1,
    Math.ceil(routeLoad / 35)) : 0;
  const haulBacklogUnit = Math.max(500,
    Math.round(sourceBufferCapacity * 0.3));
  const haulerPressure = logisticsBacklog ?
    clamp(Math.ceil((state.storedSourceEnergy || 0) / haulBacklogUnit),
      1, 3) : 0;
  // Logistics recovery is itself essential population work. Keep the
  // measured hauling surge even while unrelated optional growth is paused.
  const haulerDesired = haulerMinimum +
    (permissions.optionalPopulation || logisticsRecovery
      ? haulerPressure : 0);
  const haulerMaximum = haulerDesired + (containerEconomy ? 1 : 0);

  const prioritySites = (construction.container || 0) +
    (construction.extension || 0) + (construction.spawn || 0) +
    (construction.tower || 0);
  const buildRemaining = Math.max(0, construction.remaining || 0);
  const buildUnit = scaleBacklog(8000, energyCapacity);
  const buildMaximumUnit = scaleBacklog(4000, energyCapacity);
  const hasConstruction = buildRemaining > 0 || prioritySites > 0;
  const essentialSites = (construction.spawn || 0) +
    (construction.container || 0);
  const roadRecoveryFloor = construction.roadUnqueued > 0 &&
    !starved && storedEnergy >= reserveSurplus
      ? clamp(Math.ceil((construction.roadUnqueued * 300) / buildUnit),
        1, Math.min(4, Math.max(1, rcl))) : 0;
  const builderMinimum = Math.max(roadRecoveryFloor, essentialSites > 0 ||
    permissions.optionalConstruction && hasConstruction ? 1 : 0);
  let builderDesired = hasConstruction
    ? clamp(Math.ceil(buildRemaining / buildUnit), 1, Math.max(1, rcl))
    : 0;
  if (prioritySites && builderDesired < 2 && !starved) builderDesired = 2;
  if (starved && !prioritySites) builderDesired = builderMinimum;
  if (!permissions.optionalPopulation) builderDesired = builderMinimum;
  const builderMaximum = hasConstruction
    ? Math.max(builderDesired, clamp(
      Math.ceil(buildRemaining / buildMaximumUnit), 1,
      Math.max(2, rcl + 1)))
    : 0;

  const repairBacklog = Math.max(0, repair.remaining || 0);
  // Every owned room with valid damage keeps one fixer as protected staffing.
  // A repair crisis raises that floor to two when the economy can afford it,
  // then scales the crew with remaining damage. The RCL-based ceiling keeps a
  // repair surge from consuming the whole colony permanently.
  const standingFixerMinimum = state.controllerOwned !== false &&
    repairBacklog > 0 ? 1 : 0;
  const repairBuilderMinimum = repair.critical
    ? Math.max(standingFixerMinimum, starved ? 1 : 2)
    : standingFixerMinimum;
  const repairBuilderCapacity = starved
    ? (repair.critical ? 2 : 1)
    : Math.max(3, Math.min(6, rcl + 2));
  const repairUnit = scaleBacklog(125000, energyCapacity);
  const repairSurgeThreshold = scaleBacklog(100000, energyCapacity);
  const repairBuilderDesired = repairBacklog > 0
    ? clamp(Math.ceil(repairBacklog / repairUnit), 1,
      repairBuilderCapacity)
    : standingFixerMinimum;
  const repairBuilderMaximum = repairBacklog > repairSurgeThreshold
    ? Math.max(repairBuilderDesired, repairBuilderCapacity)
    : Math.max(standingFixerMinimum, repairBuilderDesired);

  // Controller labor has two independent halves. Relay/hauler bodies deliver
  // energy to the controller buffer; upgrader WORK parts consume that energy.
  // The minimum therefore remains one even with a complete brigade.
  const baseUpgraderMinimum = state.controllerOwned === false ? 0 : 1;
  const controllerWorkSpots = Math.max(1,
    state.controllerWorkSpots || 1);
  const upgraderStationCapacity = Math.max(baseUpgraderMinimum,
    Math.min(controllerWorkSpots, Math.max(1, rcl + 1)));
  const upgraderMinimum = controllerDanger
    ? Math.min(upgraderStationCapacity, Math.max(2, baseUpgraderMinimum))
    : baseUpgraderMinimum;
  const routineUpgraderCapacity = Math.min(2, upgraderStationCapacity);
  let upgraderDesired = upgraderMinimum;
  const upgraderReserveUnit = scaleReserve(energyCapacity, 5, 1500);
  if (controllerDanger) upgraderDesired = upgraderMinimum;
  else if (!starved && (bufferRatio >= 0.75 ||
      storedEnergy >= upgraderReserveUnit)) {
    upgraderDesired = clamp(1 + Math.floor(
      storedEnergy / upgraderReserveUnit), 2,
      routineUpgraderCapacity);
  }
  if (!starved && (state.controllerBufferRatio || 0) >= 0.9) {
    // A persistently full controller buffer means delivery is outrunning RC
    // consumption. This is why the current policy can request a second
    // upgrader even while the brigade and buffer are full: the second body is
    // meant to drain the buffer, not deliver to it. Raise routine upgrading to
    // its two-station operating cap; max remains the physical surge ceiling.
    upgraderDesired = Math.max(upgraderDesired, routineUpgraderCapacity);
  }
  if (!permissions.optionalPopulation && !controllerDanger) {
    upgraderDesired = upgraderMinimum;
  }
  if (state.extensionMigrationActive && !controllerDanger) {
    upgraderDesired = baseUpgraderMinimum;
  }
  const upgraderMaximum = state.extensionMigrationActive && !controllerDanger
    ? baseUpgraderMinimum : Math.max(upgraderDesired, upgraderStationCapacity);

  const hasBufferNetwork = (state.sourceContainerCount || 0) >= 2;
  const activeOutposts = Math.max(0, state.activeRemoteRooms || 0);
  const containerImbalance = state.containerImbalance || 0;
  const rebalancerMinimum = hasBufferNetwork && activeOutposts > 0 ? 1 : 0;
  // Outposts justify one standing handoff specialist, not one specialist per
  // outpost. Add more only when the room's buffers actually diverge.
  let rebalancerDesired = rebalancerMinimum ||
    (hasBufferNetwork && containerImbalance >= 0.35 ? 1 : 0);
  if (hasBufferNetwork && containerImbalance >= 0.25) {
    rebalancerDesired = Math.max(rebalancerDesired, 2);
  }
  if (hasBufferNetwork && containerImbalance >= 0.5) {
    rebalancerDesired = Math.max(rebalancerDesired, 3);
  }
  if (hasBufferNetwork && containerImbalance >= 0.75) {
    rebalancerDesired = Math.max(rebalancerDesired, 4);
  }
  if (!permissions.optionalPopulation) {
    rebalancerDesired = rebalancerMinimum;
  }
  const rebalancerMaximum = rebalancerDesired > 0
    ? Math.min(6, rebalancerDesired + 1) : 0;

  const activeRemoteRooms = Math.max(0, state.activeRemoteRooms || 0);
  const activeRemoteSources = Math.max(activeRemoteRooms,
    state.activeRemoteSources || 0);
  const remoteMinerDemand = Number.isFinite(state.deliveryEligibleMinerDemand)
    ? Math.max(0, state.deliveryEligibleMinerDemand)
    : Math.max(activeRemoteSources, state.remoteMinerDemand || 0);
  const remoteHaulerDemand = Math.max(activeRemoteRooms,
    state.remoteHaulerDemand || 0);
  const remoteBuilderDemand = Math.max(0,
    state.remoteBuilderDemand || state.remoteRoomsWithConstruction || 0);
  const remoteMinerMinimum = permissions.remoteMaintenance
    ? remoteMinerDemand : 0;
  const remoteHaulerMinimum = permissions.remoteMaintenance &&
    activeRemoteSources > 0 ? activeRemoteRooms : 0;
  const remoteBuilderMinimum = permissions.remoteMaintenance
    ? state.mathRemoteBuilders
      // Measured road/construction throughput is desired work. Preserve at
      // most one maintenance owner per room as a floor; do not promote every
      // calculated road worker into survival staffing.
      ? Math.min(activeRemoteRooms,
        Math.max(0, state.remoteRoomsWithConstruction || 0))
      : Math.max(Math.min(activeRemoteRooms,
      Math.max(0, state.remoteRoomsWithConstruction || 0)),
      !starved && storedEnergy >= reserveSurplus
        ? Math.min(activeRemoteRooms * 2,
          Math.max(0, state.remoteInfrastructureDemand || 0)) : 0) : 0;
  // Each survey already converts route length, source output, and carrier body
  // capacity into concrete slots. Do not apply a second room-wide distance
  // multiplier that creates population with no executable roster slot.
  const remoteHaulerDesired = activeRemoteSources > 0
    ? Math.max(remoteHaulerDemand, activeRemoteRooms) : 0;
  const remote = {
    rooms: activeRemoteRooms,
    minersMin: remoteMinerMinimum,
    miners: permissions.remoteGrowth
      ? remoteMinerDemand : remoteMinerMinimum,
    haulersMin: remoteHaulerMinimum,
    haulers: permissions.remoteGrowth
      ? remoteHaulerDesired
      : permissions.remoteHaulingRecovery
        ? remoteHaulerDesired : remoteHaulerMinimum,
    buildersMin: remoteBuilderMinimum,
    builders: permissions.remoteGrowth
      ? remoteBuilderDemand
      : remoteBuilderMinimum
  };

  const roles = {
    source: normalize(role(sourceMinimum, sourceDesired, sourceMaximum,
      'harvest work and usable source tiles')),
    refiller: normalize(role(refillerMinimum, refillerDesired,
      refillerMaximum, 'one owner per extension clump')),
    hauler: normalize(role(haulerMinimum, haulerDesired, haulerMaximum,
      'source route length and buffered energy')),
    builder: normalize(role(builderMinimum, builderDesired, builderMaximum,
      'construction backlog and priority structures')),
    repairBuilder: normalize(role(repairBuilderMinimum, repairBuilderDesired,
      repairBuilderMaximum,
      'repair backlog and critical damage')),
    upgrader: normalize(role(upgraderMinimum, upgraderDesired,
      upgraderMaximum, 'controller risk and energy surplus')),
    rebalancer: normalize(role(rebalancerMinimum, rebalancerDesired,
      rebalancerMaximum, 'outpost count and container energy imbalance')),
    defender: normalize(role(0, 0, 0, 'active owned-room combat threat')),
    tunnelBuilder: normalize(role(state.blockedSourceSite ? 1 : 0,
      state.blockedSourceSite ? 1 : 0,
      state.blockedSourceSite ? 1 : 0, 'blocked source access'))
  };

  let mode = hasConstruction ? 'construction' : 'stable';
  if (bootstrap) mode = 'bootstrap';
  if (controllerDanger) mode = 'controller-emergency';
  else if (repair.critical) mode = 'repair-crisis';
  else if (logisticsBacklog) mode = 'logistics-backup';
  else if (starved) mode = 'energy-starved';

  const totals = ['min', 'desired', 'max'].reduce((result, key) => {
    const remoteTotal = key === 'min'
      ? remote.minersMin + remote.haulersMin + remote.buildersMin
      : remote.miners + remote.haulers + remote.builders;
    result[key] = Object.values(roles).reduce((sum, entry) =>
      sum + entry[key], 0) + remoteTotal;
    return result;
  }, {});

  return { mode, health, permissions, budgets, roles, remote, totals };
};

module.exports = { derivePopulationPolicy };
