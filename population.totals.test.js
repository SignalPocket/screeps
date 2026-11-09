'use strict';

const assert = require('assert');
const { calculatePopulationTotals } = require('./population.totals');
const { applyScenarioPolicy } = require('./scenario.policy');
const { applySpawnCapacityBudget } = require('./spawn.capacity');

assert.deepStrictEqual(calculatePopulationTotals(), {
  min: 0, desired: 0, max: 0
}, 'missing policy fields produce zero totals');

const initial = {
  roles: {
    source: { min: 2, desired: 3, max: 4 },
    hauler: { min: 1, desired: 2, max: 3 },
    missing: {},
    invalid: { min: -2, desired: NaN, max: null }
  },
  remote: {
    minersMin: 2, miners: 3,
    haulersMin: 1, haulers: 2,
    buildersMin: 0, builders: 1
  }
};
const initialSnapshot = JSON.stringify(initial);
assert.deepStrictEqual(calculatePopulationTotals(initial), {
  min: 6, desired: 11, max: 13
}, 'initial policy uses remote minima only for min and desired counts for max');
assert.strictEqual(JSON.stringify(initial), initialSnapshot,
  'calculation does not mutate its input');

const augmented = {
  roles: initial.roles,
  remote: { ...initial.remote, reserversMin: 2, reservers: 3 }
};
assert.deepStrictEqual(calculatePopulationTotals(augmented), {
  min: 8, desired: 14, max: 16
}, 'operation reserver augmentation joins the same remote schema');

const zeroAndInvalid = {
  roles: { source: { min: 0, desired: undefined, max: false } },
  remote: { minersMin: 0, miners: NaN, haulers: null,
    builders: undefined, reservers: false }
};
assert.deepStrictEqual(calculatePopulationTotals(zeroAndInvalid), {
  min: 0, desired: 0, max: 0
}, 'zero and existing falsey invalid counts retain their zero fallback');

const composed = {
  health: 'healthy',
  permissions: { remoteGrowth: true, controllerBrigade: true,
    optionalConstruction: true, optionalPopulation: true, expansion: true },
  roles: {
    source: { min: 1, desired: 1, max: 2 },
    builder: { min: 0, desired: 2, max: 3 },
    defender: { min: 0, desired: 0, max: 0 }
  },
  remote: { minersMin: 1, miners: 1, haulersMin: 1, haulers: 2,
    buildersMin: 0, builders: 2, reserversMin: 1, reservers: 1 }
};
applyScenarioPolicy(composed, [{ key: 'active-attack' }]);
assert.deepStrictEqual(composed.totals, { min: 5, desired: 7, max: 9 },
  'scenario totals include protected local work and contracted remotes');
applySpawnCapacityBudget(composed, {
  source: 30, builder: 300, defender: 30,
  remoteMiner: 30, remoteHauler: 30, remoteBuilder: 300,
  remoteReserver: 12
}, { lifetime: 300, utilization: 0.5 });
assert.deepStrictEqual(composed.totals, { min: 5, desired: 5, max: 6 },
  'capacity totals follow scenario changes and desired contraction');

console.log('one pure authority totals initial and augmented population policy');
