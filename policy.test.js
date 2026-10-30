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
  bufferRatio: 0.2,
  storedEnergy: 1000,
  storedSourceEnergy: 500,
  extensionCount: 10,
  energyConsumerCount: 11,
  construction: { remaining: 0 },
  repair: { remaining: 0 }
};

const bootstrap = derivePopulationPolicy({ ...base, rcl: 1,
  sourceContainerCount: 0, extensionCount: 0, energyConsumerCount: 1 });
assert.strictEqual(bootstrap.mode, 'bootstrap');
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
assert.strictEqual(lowEnergy.roles.builder.desired, 1);

const heldLowEnergy = derivePopulationPolicy({ ...base,
  energyRatio: 0.5, bufferRatio: 0.1, storedEnergy: 600,
  energyStarvedHold: true,
  construction: { remaining: 20000, road: 4 } });
assert.strictEqual(heldLowEnergy.mode, 'energy-starved');
assert.strictEqual(heldLowEnergy.roles.builder.desired, 1);

const infrastructure = derivePopulationPolicy({ ...base,
  construction: { remaining: 20000, container: 1, extension: 2 } });
assert.strictEqual(infrastructure.roles.builder.min, 1);
assert.ok(infrastructure.roles.builder.desired >= 2);
assert.strictEqual(infrastructure.roles.refiller.desired, 1);

const splitExtensions = derivePopulationPolicy({ ...base,
  extensionCount: 18, energyConsumerCount: 19, extensionClusterCount: 2 });
assert.strictEqual(splitExtensions.roles.refiller.min, 2);
assert.strictEqual(splitExtensions.roles.refiller.desired, 2);
assert.strictEqual(splitExtensions.roles.refiller.max, 2);

const remote = derivePopulationPolicy({ ...base, activeRemoteRooms: 2,
  activeRemoteSources: 4, averageRemoteDistance: 40,
  remoteRoomsWithConstruction: 1 });
assert.strictEqual(remote.remote.miners, 4);
assert.ok(remote.remote.haulers >= 4);
assert.strictEqual(remote.remote.builders, 1);
assert.strictEqual(remote.roles.rebalancer.min, 1);
  assert.strictEqual(remote.roles.rebalancer.desired, 1);
  assert.ok(remote.roles.rebalancer.max >= 2);

const imbalancedRemote = derivePopulationPolicy({ ...base,
  activeRemoteRooms: 3, activeRemoteSources: 4, containerImbalance: 0.65 });
assert.strictEqual(imbalancedRemote.roles.rebalancer.desired, 3);

const repairSurge = derivePopulationPolicy({ ...base,
  storedEnergy: 12000, bufferRatio: 0.8,
  repair: { critical: true, remaining: 600000 } });
assert.strictEqual(repairSurge.roles.repairBuilder.min, 2);
assert.strictEqual(repairSurge.roles.repairBuilder.desired, 5);
assert.ok(repairSurge.roles.repairBuilder.max >= 5);

const starvedRepairCrisis = derivePopulationPolicy({ ...base,
  energyRatio: 0.1, bufferRatio: 0.1, storedEnergy: 0,
  repair: { critical: true, remaining: 600000 } });
assert.strictEqual(starvedRepairCrisis.roles.repairBuilder.min, 1);
assert.strictEqual(starvedRepairCrisis.roles.repairBuilder.desired, 2);

const emergency = derivePopulationPolicy({ ...base, controllerTicks: 2500 });
assert.strictEqual(emergency.mode, 'controller-emergency');
assert.ok(emergency.roles.upgrader.desired >= 2);

const fullController = derivePopulationPolicy({ ...base,
  controllerBufferRatio: 1, currentUpgraders: 1 });
assert.strictEqual(fullController.roles.upgrader.desired, 2);
const stillFullController = derivePopulationPolicy({ ...base,
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
