'use strict';

const assert = require('assert');
const { analyzeRecords, updateRoomTrends, applyTrendAdjustments } =
  require('./room.trends');

const records = [
  { tick: 0, repair: 10000, source: 0.7, work: 0.1, dropped: 600 },
  { tick: 100, repair: 40000, source: 0.8, work: 0.1, dropped: 700 },
  { tick: 200, repair: 90000, source: 0.75, work: 0.15, dropped: 800 }
];
const analysis = analyzeRecords(records);
assert.strictEqual(analysis.repairBonus, 2);
assert.strictEqual(analysis.haulerBonus, 3);

const memory = {};
updateRoomTrends(memory, 105, {
  repair: 10, build: 20, sourceRatio: 0.5, workBufferRatio: 0.2,
  readyRatio: 0.5, dropped: 0
});
updateRoomTrends(memory, 150, {
  repair: 999, build: 999, sourceRatio: 1, workBufferRatio: 0,
  readyRatio: 0, dropped: 999
});
assert.strictEqual(memory.roomTrendHistory.records.length, 1);
assert.strictEqual(memory.roomTrendHistory.records[0].repair, 10);
for (let index = 2; index <= 45; index++) {
  updateRoomTrends(memory, index * 100, {
    repair: index * 1000, build: 0, sourceRatio: 0.5,
    workBufferRatio: 0.2, readyRatio: 0.5, dropped: 0
  });
}
assert.strictEqual(memory.roomTrendHistory.records.length, 36);

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
