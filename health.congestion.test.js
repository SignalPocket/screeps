'use strict';

const assert = require('assert');
const { createMovementService } = require('./movement.service');
const { updateOperationalHealth, getOperationalMetrics } = require('./health.operations');
const { classifyColonyScenarios } = require('./colony.scenarios');
const { applyScenarioPolicy } = require('./scenario.policy');

// Exercise the real movement -> health window -> scenario -> permission chain.
// A stationary worker's old collision must not keep growth disabled forever.
const game = { time: 100, rooms: {}, creeps: {} };
const carrier = { name: 'carrier', room: { name: 'HOME' }, fatigue: 0,
  memory: { role: 'remote-hauler', home: 'HOME', task: 'remote-haul' },
  store: { energy: 100, getUsedCapacity: () => 100 },
  pos: { x: 10, y: 10, getRangeTo(position) {
    return Math.max(Math.abs(this.x - position.x), Math.abs(this.y - position.y));
  } },
  moveTo: () => 0 };
const movement = createMovementService({ Game: game,
  Room: { deserializePath: () => [] }, OK: 0, ERR_INVALID_TARGET: -7, ERR_TIRED: -11 });
const target = { id: 'delivery', pos: { roomName: 'HOME', x: 30, y: 30 } };
const memory = {};
const sample = tick => {
  game.time = tick;
  return updateOperationalHealth(memory, tick, [carrier]);
};
const policyFor = roomMemory => {
  const metrics = getOperationalMetrics(roomMemory);
  const scenarios = classifyColonyScenarios({ operationalSamples: metrics.samples,
    stuckTicks: metrics.stuckTicks });
  return applyScenarioPolicy({ health: 'healthy', roles: {}, remote: {},
    permissions: { remoteGrowth: true, optionalPopulation: true,
      remoteMaintenance: true, expansionMaintenance: true } }, scenarios);
};

for (let tick = 100; tick <= 102; tick++) {
  game.time = tick;
  movement.moveCreep(carrier, target);
  sample(tick);
}
assert.strictEqual(getOperationalMetrics(memory).stuckTicks, 1,
  'two consecutive blocked observations establish the first stuck sample');
assert.strictEqual(policyFor(memory).permissions.remoteGrowth, true,
  'a short collision does not bypass the minimum observation window');

// The health pass can follow execution this tick or see the preceding tick.
sample(103);
assert.strictEqual(getOperationalMetrics(memory).stuckTicks, 2);
for (let tick = 104; tick <= 119; tick++) sample(tick);
assert.strictEqual(getOperationalMetrics(memory).stuckTicks, 2,
  'a saved navStuck counter stops accumulating after the one-tick grace');
assert.strictEqual(policyFor(memory).permissions.remoteGrowth, true);

// Real continued blockage must still activate the shared traffic restriction.
for (let tick = 120; tick <= 159; tick++) {
  game.time = tick;
  movement.moveCreep(carrier, target);
  sample(tick);
}
const congested = policyFor(memory);
assert.strictEqual(congested.health, 'strained');
assert.strictEqual(congested.scenarioDecision.execution.clearTraffic, true);
assert.strictEqual(congested.permissions.remoteGrowth, false);
assert.strictEqual(congested.permissions.optionalPopulation, false);
assert.strictEqual(congested.permissions.remoteMaintenance, true);
assert.strictEqual(congested.permissions.expansionMaintenance, true);

const blockedSamples = getOperationalMetrics(memory).stuckTicks;
carrier.fatigue = 12;
for (let tick = 160; tick <= 165; tick++) {
  game.time = tick;
  assert.strictEqual(movement.moveCreep(carrier, target), -11);
  sample(tick);
}
assert.strictEqual(getOperationalMetrics(memory).stuckTicks, blockedSamples,
  'forced fatigue waits add no congestion to the health window');
assert.strictEqual(policyFor(memory).permissions.remoteGrowth, false,
  'fatigue does not erase already measured congestion');

carrier.fatigue = 0;
for (let tick = 166; tick <= 249; tick++) {
  game.time = tick;
  const leg = Math.floor((tick - 166) / 20) % 4;
  if (leg === 0) carrier.pos.x++;
  if (leg === 1) carrier.pos.y++;
  if (leg === 2) carrier.pos.x--;
  if (leg === 3) carrier.pos.y--;
  movement.moveCreep(carrier, target);
  sample(tick);
}
assert.strictEqual(getOperationalMetrics(memory).stuckTicks, blockedSamples,
  'resumed movement adds no blocked observations');
const previous = memory.operationalHealth.current;
sample(250);
assert.strictEqual(memory.operationalHealth.previous, previous);
assert.strictEqual(previous.stuckTicks, blockedSamples);
assert.strictEqual(getOperationalMetrics(memory).stuckTicks, 0);
assert.strictEqual(policyFor(memory).permissions.remoteGrowth, true,
  'a clean new observation window releases the congestion restriction');
updateOperationalHealth(memory, 251, []);
assert.strictEqual(Object.keys(memory.operationalHealth.states).length, 0,
  'dead carriers leave no state that could affect later windows');

// Exact evidence boundaries matter: one missing sample or blocked tick must
// not switch policy early. Counts represent creep-ticks, not unique ticks.
const restriction = (samples, stuckTicks) => policyFor({ operationalHealth: {
  current: { samples, stuckTicks } } }).permissions.remoteGrowth === false;
assert.strictEqual(restriction(24, 100), false);
assert.strictEqual(restriction(25, 12), false);
assert.strictEqual(restriction(25, 13), true);
assert.strictEqual(restriction(26, 12), false);
assert.strictEqual(restriction(26, 13), true);
const crowd = {};
updateOperationalHealth(crowd, 500, ['a', 'b'].map(name => ({ name,
  memory: { navStuck: 2, navLastTick: 500 } })));
assert.strictEqual(getOperationalMetrics(crowd).stuckTicks, 2);
assert.strictEqual(getOperationalMetrics(crowd).samples, 1);

console.log('movement, congestion evidence windows and policy recovery passed');
