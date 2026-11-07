'use strict';

const assert = require('assert');
const { derivePopulationPolicy } = require('./colony.policy');

const base = {
  rcl: 3,
  controllerOwned: true,
  controllerTicks: 10000,
  controllerWorkSpots: 4,
  controllerBufferRatio: 0.2,
  currentUpgraders: 1,
  spawnCount: 1,
  sourceCount: 2,
  efficientSourceWorkers: 2,
  learnedSourceWorkers: 2,
  sourceWorkSpots: 7,
  sourceContainerCount: 2,
  averageSourceDistance: 20,
  energyRatio: 1,
  energyCapacity: 1300,
  bufferRatio: 0.2,
  storedEnergy: 1000,
  storedSourceEnergy: 500,
  sourceBufferCapacity: 4000,
  extensionCount: 10,
  energyConsumerCount: 11,
  construction: { remaining: 0 },
  repair: { remaining: 0 }
};

const bootstrap = derivePopulationPolicy({ ...base, rcl: 1,
  sourceContainerCount: 0, extensionCount: 0, energyConsumerCount: 1 });
assert.strictEqual(bootstrap.mode, 'bootstrap');
assert.strictEqual(bootstrap.health, 'critical');
assert.strictEqual(bootstrap.roles.refiller.desired, 0);
assert.strictEqual(bootstrap.roles.hauler.desired, 0);
assert.deepStrictEqual(bootstrap.roles.repairBuilder,
  { min: 0, desired: 0, max: 0,
    reason: 'repair backlog and critical damage' });

const routineRepair = derivePopulationPolicy({ ...base,
  repair: { remaining: 1 } });
assert.deepStrictEqual(routineRepair.roles.repairBuilder,
  { min: 1, desired: 1, max: 1,
    reason: 'repair backlog and critical damage' });

const unowned = derivePopulationPolicy({ ...base, controllerOwned: false });
assert.strictEqual(unowned.roles.repairBuilder.min, 0);
assert.strictEqual(unowned.roles.repairBuilder.desired, 0);

const lowEnergy = derivePopulationPolicy({ ...base, energyRatio: 0.2,
  bufferRatio: 0.1, storedEnergy: 0,
  construction: { remaining: 20000, road: 4 } });
assert.strictEqual(lowEnergy.mode, 'energy-starved');
assert.strictEqual(lowEnergy.health, 'recovering');
assert.strictEqual(lowEnergy.roles.builder.desired, 0);
assert.strictEqual(lowEnergy.permissions.optionalConstruction, false);
assert.strictEqual(lowEnergy.permissions.optionalPopulation, false);
const blockedSourceRecovery = derivePopulationPolicy({ ...base,
  energyRatio: 0.2, bufferRatio: 0.1, storedEnergy: 0,
  blockedSourceSite: true });
assert.strictEqual(blockedSourceRecovery.roles.tunnelBuilder.min, 1);
assert.strictEqual(blockedSourceRecovery.roles.tunnelBuilder.desired, 1);

const heldLowEnergy = derivePopulationPolicy({ ...base,
  energyRatio: 0.5, bufferRatio: 0.1, storedEnergy: 600,
  energyStarvedHold: true,
  construction: { remaining: 20000, road: 4 } });
assert.strictEqual(heldLowEnergy.mode, 'energy-starved');
assert.strictEqual(heldLowEnergy.roles.builder.desired, 0);

const infrastructure = derivePopulationPolicy({ ...base,
  storedEnergy: 10000, bufferRatio: 0.4,
  construction: { remaining: 20000, container: 1, extension: 2 } });
assert.strictEqual(infrastructure.roles.builder.min, 1);
assert.ok(infrastructure.roles.builder.desired >= 2);
assert.strictEqual(infrastructure.roles.refiller.desired, 1);

const splitExtensions = derivePopulationPolicy({ ...base,
  extensionCount: 18, energyConsumerCount: 19, extensionClusterCount: 2 });
assert.strictEqual(splitExtensions.roles.refiller.min, 2);
assert.strictEqual(splitExtensions.roles.refiller.desired, 2);
assert.strictEqual(splitExtensions.roles.refiller.max, 2);

const remote = derivePopulationPolicy({ ...base, rcl: 5,
  storedEnergy: 10000, bufferRatio: 0.4, coreRoadAccessComplete: true,
  activeRemoteRooms: 2,
  activeRemoteSources: 4, averageRemoteDistance: 40,
  remoteHaulerDemand: 4,
  remoteRoomsWithConstruction: 1 });
assert.strictEqual(remote.health, 'surplus');
assert.strictEqual(remote.permissions.remoteGrowth, true);
assert.strictEqual(remote.remote.miners, 4);
assert.ok(remote.remote.haulers >= 4);
assert.strictEqual(remote.remote.builders, 1);
assert.strictEqual(remote.roles.rebalancer.min, 1);
  assert.strictEqual(remote.roles.rebalancer.desired, 1);
  assert.ok(remote.roles.rebalancer.max >= 2);

const strainedRemote = derivePopulationPolicy({ ...base, rcl: 5,
  energyRatio: 0.4, bufferRatio: 0.1, storedEnergy: 1000,
  coreRoadAccessComplete: true, activeRemoteRooms: 2,
  activeRemoteSources: 4, remoteHaulerDemand: 7 });
assert.strictEqual(strainedRemote.health, 'strained');
assert.strictEqual(strainedRemote.permissions.remoteMaintenance, true);
assert.strictEqual(strainedRemote.permissions.remoteGrowth, false);
assert.strictEqual(strainedRemote.remote.haulersMin, 2);
assert.strictEqual(strainedRemote.remote.haulers, 2);

const blockedRemoteRecovery = derivePopulationPolicy({ ...base, rcl: 5,
  energyRatio: 0.4, bufferRatio: 0.1, storedEnergy: 1000,
  coreRoadAccessComplete: false, activeRemoteRooms: 2,
  activeRemoteSources: 4, remoteHaulerDemand: 7,
  remoteBacklog: 20254, remoteBlockedRooms: 3 });
assert.strictEqual(blockedRemoteRecovery.health, 'strained');
assert.strictEqual(blockedRemoteRecovery.permissions.remoteGrowth, false);
assert.strictEqual(
  blockedRemoteRecovery.permissions.remoteHaulingRecovery, true);
assert.strictEqual(blockedRemoteRecovery.remote.haulersMin, 2);
assert.strictEqual(blockedRemoteRecovery.remote.haulers, 7);

const distanceScaledRecovery = derivePopulationPolicy({ ...base, rcl: 5,
  energyRatio: 0.4, bufferRatio: 0.1, storedEnergy: 1000,
  activeRemoteRooms: 3, activeRemoteSources: 6,
  averageRemoteDistance: 40, remoteHaulerDemand: 7,
  remoteBacklog: 20254, remoteBlockedRooms: 3 });
assert.strictEqual(distanceScaledRecovery.permissions.remoteHaulingRecovery,
  true);
assert.strictEqual(distanceScaledRecovery.remote.haulers, 7,
  'recovery must stay within concrete survey carrier slots');

const healthyDistanceScaled = derivePopulationPolicy({ ...base, rcl: 5,
  storedEnergy: 10000, bufferRatio: 0.4, coreRoadAccessComplete: true,
  activeRemoteRooms: 3, activeRemoteSources: 6,
  averageRemoteDistance: 40, remoteHaulerDemand: 7 });
assert.strictEqual(healthyDistanceScaled.permissions.remoteGrowth, true);
assert.strictEqual(healthyDistanceScaled.remote.haulers, 7,
  'healthy growth must also stay within concrete survey carrier slots');

const criticalRemote = derivePopulationPolicy({ ...base, rcl: 5,
  controllerTicks: 2500, storedEnergy: 10000, bufferRatio: 0.4,
  activeRemoteRooms: 2, activeRemoteSources: 4, remoteHaulerDemand: 7 });
assert.strictEqual(criticalRemote.health, 'critical');
assert.strictEqual(criticalRemote.permissions.remoteMaintenance, false);
assert.strictEqual(criticalRemote.remote.minersMin, 0);
assert.strictEqual(criticalRemote.remote.haulersMin, 0);

const roadBlockedRemote = derivePopulationPolicy({ ...base, rcl: 5,
  storedEnergy: 10000, bufferRatio: 0.4, coreRoadAccessComplete: false,
  activeRemoteRooms: 1, activeRemoteSources: 2, remoteHaulerDemand: 7 });
assert.strictEqual(roadBlockedRemote.permissions.remoteGrowth, false);
assert.strictEqual(roadBlockedRemote.remote.haulers, 7,
  'unfinished home roads must not throttle funded established export routes');

const healthyExpansion = derivePopulationPolicy({ ...base, rcl: 4,
  storedEnergy: 10000, bufferRatio: 0.4, coreRoadAccessComplete: false });
assert.strictEqual(healthyExpansion.permissions.expansion, true,
  'claim permission depends on sponsor health; capability and GCL are checked by the expansion planner');
const strainedExpansion = derivePopulationPolicy({ ...base, rcl: 5,
  energyRatio: 0.4, bufferRatio: 0.1, storedEnergy: 1000,
  coreRoadAccessComplete: true });
assert.strictEqual(strainedExpansion.permissions.expansion, false);
assert.strictEqual(strainedExpansion.permissions.expansionMaintenance, true);
const criticalExpansion = derivePopulationPolicy({ ...base, rcl: 5,
  controllerTicks: 2500, storedEnergy: 10000, bufferRatio: 0.4,
  coreRoadAccessComplete: true });
assert.strictEqual(criticalExpansion.permissions.expansion, false);
assert.strictEqual(criticalExpansion.permissions.expansionMaintenance, false);

const chargedFromReserve = derivePopulationPolicy({ ...base, rcl: 5,
  energyRatio: 0.2, bufferRatio: 0.4, storedEnergy: 10000 });
assert.strictEqual(chargedFromReserve.health, 'healthy');
const logisticsRecovery = derivePopulationPolicy({ ...base, rcl: 5,
  energyRatio: 0.1, bufferRatio: 0.99, highestSourceBufferRatio: 1,
  storedEnergy: 20000, storedSourceEnergy: 3950,
  activeRemoteRooms: 3, activeRemoteSources: 6,
  coreRoadAccessComplete: true });
assert.strictEqual(logisticsRecovery.mode, 'logistics-backup');
assert.strictEqual(logisticsRecovery.health, 'strained');
assert.strictEqual(logisticsRecovery.permissions.remoteGrowth, false);
assert.strictEqual(logisticsRecovery.permissions.optionalPopulation, false);
assert.ok(logisticsRecovery.roles.hauler.desired >
  logisticsRecovery.roles.hauler.min);
const surplus = derivePopulationPolicy({ ...base, rcl: 5,
  energyRatio: 1, bufferRatio: 0.4, storedEnergy: 20000 });
assert.strictEqual(surplus.health, 'surplus');
const drainedBuffersFlowing = derivePopulationPolicy({ ...base, rcl: 5,
  energyRatio: 1, bufferRatio: 0.1, storedEnergy: 20000 });
assert.strictEqual(drainedBuffersFlowing.health, 'healthy');
const fullBuffersAreBacklog = derivePopulationPolicy({ ...base, rcl: 5,
  energyRatio: 1, bufferRatio: 0.9, highestSourceBufferRatio: 0.9,
  storedEnergy: 20000 });
assert.notStrictEqual(fullBuffersAreBacklog.health, 'surplus');

const imbalancedRemote = derivePopulationPolicy({ ...base,
  storedEnergy: 10000, bufferRatio: 0.4,
  activeRemoteRooms: 3, activeRemoteSources: 4, containerImbalance: 0.65 });
assert.strictEqual(imbalancedRemote.roles.rebalancer.desired, 3);

const repairSurge = derivePopulationPolicy({ ...base,
  storedEnergy: 12000, bufferRatio: 0.8,
  repair: { critical: true, remaining: 600000 } });
assert.strictEqual(repairSurge.roles.repairBuilder.min, 2);
assert.strictEqual(repairSurge.roles.repairBuilder.desired, 3);
assert.ok(repairSurge.roles.repairBuilder.max >= 5);

const damagedOrDowngradedRepair = derivePopulationPolicy({ ...base,
  energyCapacity: 550, storedEnergy: 12000, bufferRatio: 0.8,
  repair: { critical: true, remaining: 600000 } });
assert.strictEqual(damagedOrDowngradedRepair.roles.repairBuilder.desired, 5);
assert.ok(damagedOrDowngradedRepair.roles.repairBuilder.desired >
  repairSurge.roles.repairBuilder.desired);

const starvedRepairCrisis = derivePopulationPolicy({ ...base,
  energyRatio: 0.1, bufferRatio: 0.1, storedEnergy: 0,
  repair: { critical: true, remaining: 600000 } });
assert.strictEqual(starvedRepairCrisis.roles.repairBuilder.min, 1);
assert.strictEqual(starvedRepairCrisis.roles.repairBuilder.desired, 2);

const emergency = derivePopulationPolicy({ ...base, controllerTicks: 2500 });
assert.strictEqual(emergency.mode, 'controller-emergency');
assert.ok(emergency.roles.upgrader.desired >= 2);

const fullController = derivePopulationPolicy({ ...base,
  storedEnergy: 10000, bufferRatio: 0.4,
  controllerBufferRatio: 1, currentUpgraders: 1 });
assert.strictEqual(fullController.roles.upgrader.desired, 2);
const stillFullController = derivePopulationPolicy({ ...base,
  storedEnergy: 10000, bufferRatio: 0.4,
  controllerBufferRatio: 1, currentUpgraders: 2 });
assert.strictEqual(stillFullController.roles.upgrader.desired, 2);

for (const scenario of [bootstrap, lowEnergy, infrastructure, remote,
  imbalancedRemote, repairSurge, emergency, fullController,
  stillFullController, starvedRepairCrisis]) {
  for (const entry of Object.values(scenario.roles)) {
    assert.ok(entry.min <= entry.desired);
    assert.ok(entry.desired <= entry.max);
  }
}

console.log('population policy scenarios passed');

const migrationPolicy = derivePopulationPolicy({...base,rcl:5,
  storedEnergy:50000,controllerBufferRatio:1,extensionMigrationActive:true});
assert.strictEqual(migrationPolicy.roles.upgrader.desired,1);
assert.strictEqual(migrationPolicy.roles.upgrader.max,1);
assert.strictEqual(migrationPolicy.permissions.controllerBrigade,false);
const fundedStrainedExports = derivePopulationPolicy({ ...base, rcl: 5,
  energyCapacity: 1750, energyRatio: 0.6, bufferRatio: 0.15,
  storedEnergy: 50000, coreRoadAccessComplete: false,
  activeRemoteRooms: 3, activeRemoteSources: 6, remoteHaulerDemand: 7,
  remoteBacklog: 1700, remoteBlockedRooms: 0 });
assert.strictEqual(fundedStrainedExports.permissions.remoteGrowth, false);
assert.strictEqual(fundedStrainedExports.permissions.remoteHaulingRecovery, true);
assert.strictEqual(fundedStrainedExports.remote.haulers, 7);
assert.strictEqual(fundedStrainedExports.remote.haulersMin, 3);
console.log('funded established exports retain measured capacity before a full-container outage');
