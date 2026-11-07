'use strict';

const assert = require('assert');
const { classifyColonyScenarios, reconcileScenarioRecords } =
  require('./colony.scenarios');

const candidates = classifyColonyScenarios({
  hostileCount: 1,
  cpuMode: 'recovery',
  cpuBucket: 500,
  baselineGap: { key: 'spawnFiller' },
  initialBootstrap: true,
  postAttackRecovery: false,
  towerReserveDeficit: true,
  controllerSupplyDeficit: true,
  controllerTicks: 2500,
  refillDeficit: true,
  energyRatio: 0.25,
  sourceBufferOverflow: true,
  bufferRatio: 0.9,
  repairCritical: true,
  repairRemaining: 12000,
  buildRemaining: 4000
});
assert.deepStrictEqual(candidates.slice(0, 4).map(item => item.key), [
  'active-attack', 'cpu-emergency', 'baseline-gap', 'initial-bootstrap'
]);
assert.ok(candidates.some(item => item.key === 'construction-wave'));

const first = reconcileScenarioRecords([], candidates, 100);
const refreshed = reconcileScenarioRecords(first,
  classifyColonyScenarios({
    hostileCount: 0,
    cpuMode: 'normal',
    postAttackRecovery: true,
    woundedFriendly: true,
    towerReserveDeficit: false,
    salvageAvailable: false,
    repairCritical: true,
    repairRemaining: 8000,
    controllerSupplyDeficit: false,
    refillDeficit: false,
    sourceBufferOverflow: false,
    buildRemaining: 0
  }), 101);
assert.strictEqual(refreshed.some(item => item.key === 'active-attack'), false);
assert.strictEqual(refreshed[0].key, 'post-attack-recovery');
assert.strictEqual(refreshed.find(item => item.key === 'critical-repair').firstSeen,
  100);
assert.strictEqual(refreshed[0].firstSeen, 101);
assert.strictEqual(refreshed[0].lastSeen, 101);

const ordinary = reconcileScenarioRecords([], classifyColonyScenarios({
  hostileCount: 0,
  cpuMode: 'normal',
  postAttackRecovery: false,
  towerReserveDeficit: false,
  controllerSupplyDeficit: false,
  refillDeficit: false,
  sourceBufferOverflow: false,
  repairCritical: false,
  buildRemaining: 0
}), 200);
assert.deepStrictEqual(ordinary.map(item => item.key), ['ordinary-operation']);

console.log('colony scenario classification and lifecycle passed');
