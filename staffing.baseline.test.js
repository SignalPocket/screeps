'use strict';

const assert = require('assert');
const { BASELINE_SLOTS, selectBaselineStaffingGap } =
  require('./staffing.baseline');

assert.deepStrictEqual(BASELINE_SLOTS.map(slot => slot.key),
  ['miner', 'upgrader', 'spawnFiller', 'builderFixer']);

const complete = {
  miner: 1, upgrader: 1, spawnFiller: 1, builderFixer: 1
};
assert.strictEqual(selectBaselineStaffingGap(complete), null);
assert.strictEqual(selectBaselineStaffingGap({}).key, 'miner');
assert.strictEqual(selectBaselineStaffingGap({ ...complete, miner: 0 }).role,
  'source');
assert.strictEqual(selectBaselineStaffingGap({ ...complete, upgrader: 0 }).key,
  'upgrader');
assert.strictEqual(selectBaselineStaffingGap({ ...complete, spawnFiller: 0 }).role,
  'refiller');
assert.strictEqual(selectBaselineStaffingGap({ ...complete, builderFixer: 0 }).role,
  'builder');
assert.strictEqual(selectBaselineStaffingGap({
  miner: 2, upgrader: 0, spawnFiller: 0, builderFixer: 0
}).key, 'upgrader', 'extra miners cannot skip the second baseline slot');

console.log('baseline staffing selector scenarios passed');
