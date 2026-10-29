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
  const starved = energyRatio < 0.35 && bufferRatio < 0.25 &&
    storedEnergy < 500;
  const logisticsBacklog = bufferRatio >= 0.65 ||
    (state.droppedEnergy || 0) >= 500;

  const sourceMinimum = Math.max(sources,
    state.efficientSourceWorkers || sources);
  const sourceDesired = Math.max(sourceMinimum,
    state.learnedSourceWorkers || sourceMinimum);
  const sourceMaximum = Math.max(sourceDesired,
    state.sourceWorkSpots || sourceDesired);

  const refillerMinimum = rcl >= 2 && energyConsumers > 1 ? 1 : 0;
  const refillerDesired = refillerMinimum
    ? clamp(1 + Math.floor(extensionCount / 10), 1, 4)
    : 0;
  const refillerMaximum = refillerMinimum
    ? clamp(Math.ceil(energyConsumers / 6), refillerDesired, 4)
    : 0;

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
  const fixerDesired = repairBacklog > 0 ? 1 : 0;
  const fixerMaximum = repairBacklog > 100000 && !starved ? 2 : fixerDesired;

  const upgraderMinimum = state.controllerOwned === false ? 0 : 1;
  let upgraderDesired = upgraderMinimum;
  if (controllerDanger) upgraderDesired = Math.max(2, upgraderDesired);
  else if (!starved && (bufferRatio >= 0.75 || storedEnergy >= 6000)) {
    upgraderDesired = clamp(1 + Math.floor(storedEnergy / 6000), 2,
      Math.max(2, Math.ceil(rcl / 2) + 1));
  }
  const upgraderMaximum = Math.max(upgraderDesired,
    Math.max(1, Math.ceil(rcl / 2) + 1));

  const rebalancerNeeded = (state.sourceContainerCount || 0) >= 2 &&
    ((state.containerImbalance || 0) >= 0.35 ||
      (state.activeRemoteRooms || 0) > 0);
  const rebalancerDesired = rebalancerNeeded ? 1 : 0;

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
      refillerMaximum, 'spawn and extension count')),
    hauler: normalize(role(haulerMinimum, haulerDesired, haulerMaximum,
      'source route length and buffered energy')),
    builder: normalize(role(builderMinimum, builderDesired, builderMaximum,
      'construction backlog and priority structures')),
    fixer: normalize(role(fixerMinimum, fixerDesired, fixerMaximum,
      'repair backlog and critical damage')),
    upgrader: normalize(role(upgraderMinimum, upgraderDesired,
      upgraderMaximum, 'controller risk and energy surplus')),
    rebalancer: normalize(role(0, rebalancerDesired, 1,
      'container energy imbalance')),
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
