'use strict';

const assert = require('assert');
require('./health.operations.test');
const { analyzeRecords, deriveRecoveryDirective, updateRoomTrends,
  applyTrendAdjustments } =
  require('./room.trends');

const records = [
  { tick: 0, repair: 10000, source: 0.7, work: 0.1, dropped: 600 },
  { tick: 100, repair: 40000, source: 0.8, work: 0.1, dropped: 700 },
  { tick: 200, repair: 90000, source: 0.75, work: 0.15, dropped: 800 }
];
const analysis = analyzeRecords(records);
assert.strictEqual(analysis.repairBonus, 2);
assert.strictEqual(analysis.haulerBonus, 3);
const matureRepair = analyzeRecords([
  { tick: 0, repair: 0, source: 0, work: 1, dropped: 0,
    capacity: 1300 },
  { tick: 250, repair: 3000, source: 0, work: 1, dropped: 0,
    capacity: 1300 },
  { tick: 500, repair: 6000, source: 0, work: 1, dropped: 0,
    capacity: 1300 }
]);
const downgradedRepair = analyzeRecords([
  { tick: 0, repair: 0, source: 0, work: 1, dropped: 0,
    capacity: 550 },
  { tick: 250, repair: 3000, source: 0, work: 1, dropped: 0,
    capacity: 550 },
  { tick: 500, repair: 6000, source: 0, work: 1, dropped: 0,
    capacity: 550 }
]);
assert.strictEqual(matureRepair.repairBonus, 0);
assert.strictEqual(downgradedRepair.repairBonus, 1);

const memory = {};
updateRoomTrends(memory, 105, {
  repair: 10, build: 20, sourceRatio: 0.5, workBufferRatio: 0.2,
  lowestSourceRatio: 0.25, extensionBufferRatio: 0.75,
  readyRatio: 0.5, storedEnergy: 12345, dropped: 0,
  population: 14, desiredPopulation: 16, controllerTicks: 9876,
  controllerProgress: 0.3334, activeOutposts: 2
});
updateRoomTrends(memory, 150, {
  repair: 999, build: 999, sourceRatio: 1, workBufferRatio: 0,
  readyRatio: 0, dropped: 999
});
assert.strictEqual(memory.roomTrendHistory.records.length, 1);
assert.strictEqual(memory.roomTrendHistory.records[0].repair, 10);
assert.strictEqual(memory.roomTrendHistory.records[0].stored, 12345);
assert.strictEqual(memory.roomTrendHistory.records[0].sourceLow, 0.25);
assert.strictEqual(memory.roomTrendHistory.records[0].extensions, 0.75);
assert.strictEqual(memory.roomTrendHistory.records[0].population, 14);
assert.strictEqual(memory.roomTrendHistory.records[0].desired, 16);
assert.strictEqual(memory.roomTrendHistory.records[0].controllerProgress,
  0.333);
const oldDatabase = {
  version: 1, interval: 100, maxRecords: 36,
  records: [{ tick: 100, repair: 1, source: 0, work: 0, dropped: 0 }],
  adjustment: {}
};
const migratingMemory = { roomTrendHistory: oldDatabase };
updateRoomTrends(migratingMemory, 200, {});
assert.strictEqual(migratingMemory.roomTrendHistory.records.length, 1);
assert.strictEqual(migratingMemory.roomTrendHistory.interval, 250);
assert.strictEqual(migratingMemory.roomTrendHistory.version, 4);
for (let index = 2; index <= 45; index++) {
  updateRoomTrends(memory, index * 250, {
    repair: index * 1000, build: 0, sourceRatio: 0.5,
    workBufferRatio: 0.2, readyRatio: 0.5, dropped: 0
  });
}
assert.strictEqual(memory.roomTrendHistory.records.length, 32);
assert.strictEqual(memory.roomTrendHistory.interval, 250);
assert.strictEqual(memory.roomTrendHistory.version, 4);
assert.strictEqual(deriveRecoveryDirective([{
  ready: 1, controllerTicks: 10000, taskFlips: 4, roleChanges: 0,
  laneChanges: 0, foreignDispatch: 0, staleReturns: 0,
  cargoMisroutes: 0, remoteBlocked: 0, remoteBacklog: 0, build: 0
}], {}).key, 'assignments');
assert.strictEqual(deriveRecoveryDirective([{
  ready: 1, controllerTicks: 10000, taskFlips: 0, roleChanges: 0,
  laneChanges: 0, foreignDispatch: 1, staleReturns: 0,
  cargoMisroutes: 0, remoteBlocked: 1, remoteBacklog: 2000, build: 0
}], {}).key, 'remote-ownership');
assert.strictEqual(deriveRecoveryDirective([{
  ready: 1, controllerTicks: 10000, taskFlips: 0, roleChanges: 0,
  stuck: 10, sourceCoverageGap: 2, sourceRecovery: 20,
  foreignDispatch: 0, staleReturns: 0, cargoMisroutes: 0,
  remoteBlocked: 0, remoteBacklog: 0, build: 0
}], {}).key, 'movement');
assert.strictEqual(deriveRecoveryDirective([{
  ready: 1, controllerTicks: 10000, taskFlips: 0, roleChanges: 0,
  stuck: 0, sourceCoverageGap: 2, sourceRecovery: 20,
  foreignDispatch: 0, staleReturns: 0, cargoMisroutes: 0,
  remoteBlocked: 0, remoteBacklog: 0, build: 0
}], {}).key, 'source-recovery');

const policy = {
  roles: {
    repairBuilder: { min: 0, desired: 1, max: 1, reason: 'repair' },
    hauler: { min: 1, desired: 2, max: 3, reason: 'haul' }
  },
  remote: { miners: 1, haulers: 1, builders: 0 },
  totals: { min: 0, desired: 0, max: 0 }
};
applyTrendAdjustments(policy, { adjustment: {
  repairBonus: 2, haulerBonus: 1
} });
assert.strictEqual(policy.roles.repairBuilder.desired, 3);
assert.strictEqual(policy.roles.repairBuilder.max, 3);
assert.strictEqual(policy.roles.hauler.desired, 3);
assert.strictEqual(policy.totals.desired, 8);

console.log('room trend scenarios passed');
