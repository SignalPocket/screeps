'use strict';

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

const derivePopulationPolicy = state => {
  const rcl = clamp(state.rcl || 0, 0, 8);
  const sources = Math.max(1, state.sourceCount || 0);
  const energyRatio = clamp(state.energyRatio || 0, 0, 1);
  const bufferRatio = clamp(state.bufferRatio || 0, 0, 1);
  const storedEnergy = Math.max(0, state.storedEnergy || 0);
  const extensionCount = Math.max(0, state.extensionCount || 0);
  const energyConsumers = Math.max(1, state.energyConsumerCount || 1);
  const construction = state.construction || {};
  const repair = state.repair || {};
  const controllerDanger = (state.controllerTicks || Infinity) < 3000;
  const bootstrap = rcl <= 1 || state.spawnCount === 0;
  const starved = state.energyStarvedHold ||
    energyRatio < 0.35 && bufferRatio < 0.25 && storedEnergy < 500;
  const logisticsBacklog = bufferRatio >= 0.65 ||
    (state.droppedEnergy || 0) >= 500;

  const sourceMinimum = Math.max(sources,
    state.efficientSourceWorkers || sources);
  const sourceDesired = Math.max(sourceMinimum,
    state.learnedSourceWorkers || sourceMinimum);
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
  const haulerDesired = haulerMinimum + (logisticsBacklog ?
    clamp(Math.ceil((state.storedSourceEnergy || 0) / 1200), 1, 3) : 0);
  const haulerMaximum = haulerDesired + (containerEconomy ? 1 : 0);

  const prioritySites = (construction.container || 0) +
    (construction.extension || 0) + (construction.spawn || 0) +
    (construction.tower || 0);
  const buildRemaining = Math.max(0, construction.remaining || 0);
  const hasConstruction = buildRemaining > 0 || prioritySites > 0;
  const builderMinimum = hasConstruction ? 1 : 0;
  let builderDesired = hasConstruction
    ? clamp(Math.ceil(buildRemaining / 8000), 1, Math.max(1, rcl))
    : 0;
  if (prioritySites && builderDesired < 2 && !starved) builderDesired = 2;
  if (starved && !prioritySites) builderDesired = builderMinimum;
  const builderMaximum = hasConstruction
    ? Math.max(builderDesired, clamp(Math.ceil(buildRemaining / 4000), 1,
      Math.max(2, rcl + 1)))
    : 0;

  const repairBacklog = Math.max(0, repair.remaining || 0);
  const fixerMinimum = repair.critical ? 1 : 0;
  const fixerDesired = repairBacklog > 0
    ? clamp(Math.ceil(repairBacklog / 200000), 1, starved ? 1 : 3)
    : 0;
  const fixerMaximum = repairBacklog > 100000 && !starved
    ? Math.max(fixerDesired, 3) : fixerDesired;

  const upgraderMinimum = state.controllerOwned === false ? 0 : 1;
  const controllerWorkSpots = Math.max(1,
    state.controllerWorkSpots || 1);
  const upgraderStationCapacity = Math.max(upgraderMinimum,
    Math.min(controllerWorkSpots, Math.max(1, rcl + 1)));
  let upgraderDesired = upgraderMinimum;
  if (controllerDanger) upgraderDesired = Math.min(
    upgraderStationCapacity, Math.max(2, upgraderDesired));
  else if (!starved && (bufferRatio >= 0.75 || storedEnergy >= 6000)) {
    upgraderDesired = clamp(1 + Math.floor(storedEnergy / 6000), 2,
      upgraderStationCapacity);
  }
  if (!starved && (state.controllerBufferRatio || 0) >= 0.9) {
    // A persistently full controller buffer means delivery is outrunning RC
    // consumption. Fill every usable controller station immediately instead
    // of raising the target one creep at a time across several spawn cycles.
    upgraderDesired = Math.max(upgraderDesired, upgraderStationCapacity);
  }
  const upgraderMaximum = Math.max(upgraderDesired,
    upgraderStationCapacity);

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
  const rebalancerMaximum = rebalancerDesired > 0
    ? Math.min(6, rebalancerDesired + 1) : 0;

  const activeRemoteRooms = Math.max(0, state.activeRemoteRooms || 0);
  const activeRemoteSources = Math.max(activeRemoteRooms,
    state.activeRemoteSources || 0);
  const remote = {
    rooms: activeRemoteRooms,
    miners: activeRemoteSources,
    haulers: activeRemoteSources > 0
      ? Math.max(activeRemoteRooms,
        Math.ceil(activeRemoteSources * Math.max(1,
          (state.averageRemoteDistance || 25) / 25)))
      : 0,
    builders: Math.max(0, state.remoteRoomsWithConstruction || 0)
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
    fixer: normalize(role(fixerMinimum, fixerDesired, fixerMaximum,
      'repair backlog and critical damage')),
    upgrader: normalize(role(upgraderMinimum, upgraderDesired,
      upgraderMaximum, 'controller risk and energy surplus')),
    rebalancer: normalize(role(rebalancerMinimum, rebalancerDesired,
      rebalancerMaximum, 'outpost count and container energy imbalance')),
    digger: normalize(role(0, state.blockedSourceSite ? 1 : 0,
      state.blockedSourceSite ? 1 : 0, 'blocked source access'))
  };

  let mode = hasConstruction ? 'construction' : 'stable';
  if (bootstrap) mode = 'bootstrap';
  if (controllerDanger) mode = 'controller-emergency';
  else if (repair.critical) mode = 'repair-crisis';
  else if (logisticsBacklog) mode = 'logistics-backup';
  else if (starved) mode = 'energy-starved';

  const totals = ['min', 'desired', 'max'].reduce((result, key) => {
    result[key] = Object.values(roles).reduce((sum, entry) =>
      sum + entry[key], 0) + remote.miners + remote.haulers + remote.builders;
    return result;
  }, {});

  return { mode, roles, remote, totals };
};

module.exports = { derivePopulationPolicy };
