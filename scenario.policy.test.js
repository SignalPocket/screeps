'use strict';
const assert = require('assert');
const { applyScenarioPolicy } = require('./scenario.policy');

const base = () => ({
  health: 'healthy',
  permissions: { remoteGrowth: true, controllerBrigade: true,
    optionalConstruction: true, optionalPopulation: true, expansion: true },
  roles: {
    source: { min: 2, desired: 2, max: 2 },
    upgrader: { min: 1, desired: 1, max: 1 },
    repairBuilder: { min: 0, desired: 0, max: 1 },
    hauler: { min: 2, desired: 2, max: 3 },
    defender: { min: 0, desired: 0, max: 0 }
  },
  remote: { minersMin: 6, miners: 6, haulersMin: 3, haulers: 20,
    buildersMin: 3, builders: 8 }
});

const attack = applyScenarioPolicy(base(), [{ key: 'active-attack' }]);
assert.strictEqual(attack.health, 'critical');
assert.strictEqual(attack.permissions.remoteGrowth, false);
assert.strictEqual(attack.permissions.optionalPopulation, false);
assert.strictEqual(attack.remote.haulers, 3);
assert.strictEqual(attack.roles.defender.min, 1);

const overflow = applyScenarioPolicy(base(),
  [{ key: 'source-buffer-overflow' }]);
assert.strictEqual(overflow.roles.hauler.min, 2);
assert.strictEqual(overflow.roles.hauler.desired, 3);

const overloaded = applyScenarioPolicy(base(),
  [{ key: 'spawn-capacity-overload' }]);
assert.strictEqual(overloaded.health, 'critical');
assert.strictEqual(overloaded.permissions.optionalPopulation, false);

const unstable = applyScenarioPolicy(base(),
  [{ key: 'assignment-instability' }, { key: 'traffic-congestion' }]);
assert.strictEqual(unstable.permissions.remoteGrowth, false);
assert.strictEqual(unstable.scenarioDecision.execution.preserveAssignments, true);
assert.strictEqual(unstable.scenarioDecision.execution.clearTraffic, true);

console.log('scenario constraints compose into room policy');
