'use strict';

const assert = require('assert');
const { derivePopulationPolicy: derive } = require('./colony.policy');

const base = Object.freeze({
  rcl: 5, controllerOwned: true, controllerTicks: 10000,
  controllerWorkSpots: 3, spawnCount: 1, sourceCount: 2,
  sourceContainerCount: 2, sourceBufferCapacity: 4000,
  energyCapacity: 1300, energyRatio: 0.6, bufferRatio: 0.2,
  storedEnergy: 7799, coreRoadAccessComplete: false,
  activeRemoteRooms: 2, activeRemoteSources: 4,
  remoteHaulerDemand: 7, deliveryEligibleMinerDemand: 4,
  remoteRoomsWithConstruction: 2, remoteBuilderDemand: 5,
  mathRemoteBuilders: true,
  construction: Object.freeze({ remaining: 0 }),
  repair: Object.freeze({ remaining: 0 })
});

const policy = patch => derive(Object.freeze({ ...base, ...patch }));
const assertRecovery = (result, enabled) => {
  assert.strictEqual(result.permissions.remoteMaintenance, true);
  assert.strictEqual(result.permissions.remoteHaulingRecovery, enabled);
  assert.strictEqual(result.permissions.remoteGrowth, false);
  assert.strictEqual(result.remote.haulersMin, 2);
  assert.strictEqual(result.remote.haulers, enabled ? 7 : 2);
  assert.strictEqual(result.remote.miners, 4);
  assert.strictEqual(result.remote.builders, 2);
};

// Funded established routes recover before containers block, at the exact
// six-capacity reserve. Road completion still gates new remote growth.
for (const [storedEnergy, enabled] of [[7799, false], [7800, true], [7801, true]]) {
  assertRecovery(policy({ storedEnergy }), enabled);
}
assertRecovery(policy({ storedEnergy: 7800, remoteHaulerDemand: 2 }), false);
assert.strictEqual(policy({ storedEnergy: 7800, activeRemoteRooms: 0,
  activeRemoteSources: 0 }).permissions.remoteHaulingRecovery, false);

// With no funded reserve, both a blocked route and the backlog threshold
// are necessary. The scaled energy threshold caps at room capacity.
for (const [remoteBacklog, enabled] of [[1299, false], [1300, true], [1301, true]]) {
  assertRecovery(policy({ remoteBlockedRooms: 1, remoteBacklog }), enabled);
}
assertRecovery(policy({ remoteBlockedRooms: 0, remoteBacklog: 1301 }), false);
assertRecovery(policy({ rcl: 4, remoteBlockedRooms: 1, remoteBacklog: 1301 }), false);

// Controller emergency withdraws optional income permissions even when
// funding and blocked-container evidence would otherwise admit recovery.
for (const [controllerTicks, maintenance] of [[2999, false], [3000, true],
  [3001, true]]) {
  const result = policy({ controllerTicks, storedEnergy: 7800 });
  assert.strictEqual(result.permissions.remoteMaintenance, maintenance);
  assert.strictEqual(result.permissions.remoteHaulingRecovery, maintenance);
  assert.strictEqual(result.permissions.expansionMaintenance, maintenance);
  assert.strictEqual(result.permissions.remoteGrowth, false);
  if (!maintenance) {
    assert.strictEqual(result.health, 'critical');
    assert.strictEqual(result.remote.haulers, 0);
    assert.strictEqual(result.remote.miners, 0);
    assert.strictEqual(result.remote.builders, 0);
    assert.strictEqual(result.roles.upgrader.min, 2);
  }
}

// Re-evaluation is reversible and pure; an earlier emergency or funded
// surge must never latch into the next decision from the same observation.
const before = JSON.stringify(base);
const initial = policy({});
policy({ storedEnergy: 7800 });
policy({ controllerTicks: 2999 });
assert.deepStrictEqual(policy({}), initial);
assert.strictEqual(JSON.stringify(base), before);

for (const rcl of [2, 3, 4, 5, 8]) {
  const result = policy({ rcl, storedEnergy: 50000,
    energyRatio: 1, coreRoadAccessComplete: true });
  assert.strictEqual(result.permissions.remoteMaintenance, rcl >= 3);
  assert.strictEqual(result.permissions.remoteGrowth, rcl >= 5);
  assert.strictEqual(result.remote.haulers, rcl >= 5 ? 7 : rcl >= 3 ? 2 : 0);
  for (const entry of Object.values(result.roles)) {
    assert.ok(Number.isInteger(entry.min) && entry.min >= 0);
    assert.ok(entry.min <= entry.desired && entry.desired <= entry.max);
  }
}
console.log('policy recovery and growth threshold boundaries passed');
