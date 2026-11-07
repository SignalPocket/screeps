'use strict';
const assert = require('assert');
const { applySpawnCapacityBudget } = require('./spawn.capacity');

const policy = {
  roles: {
    source: { min: 2, desired: 2, max: 7 },
    refiller: { min: 1, desired: 1, max: 1 },
    hauler: { min: 2, desired: 2, max: 3 },
    builder: { min: 1, desired: 1, max: 1 },
    repairBuilder: { min: 1, desired: 1, max: 1 },
    upgrader: { min: 1, desired: 1, max: 1 },
    rebalancer: { min: 1, desired: 1, max: 2 }
  },
  remote: { minersMin: 6, miners: 6, haulersMin: 3, haulers: 27,
    buildersMin: 3, builders: 12 }
};
applySpawnCapacityBudget(policy, { source: 30, refiller: 42, hauler: 36,
  builder: 27, repairBuilder: 27, upgrader: 27, rebalancer: 36,
  remoteMiner: 18, remoteHauler: 36, remoteBuilder: 27 },
{ lifetime: 1500, utilization: 0.8 });
assert.ok(policy.spawnCapacity.boundedLoad <= 1200);
assert.strictEqual(policy.remote.buildersMin, 3);
assert.ok(policy.remote.builders < 12,
  'optional remote construction contracts before income hauling');
assert.ok(policy.remote.haulers >= policy.remote.haulersMin &&
  policy.remote.haulers < 27,
  'income hauling is bounded only after optional construction contracts');
assert.ok(policy.totals.min <= policy.totals.desired);
console.log('spawn replacement capacity bounds optional desired staffing');
