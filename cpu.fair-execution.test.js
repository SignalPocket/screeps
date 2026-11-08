'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { deriveCpuPolicy, selectFairExecutionCreeps } = require('./cpu.policy');

const creep = (name, room, extra = {}) => ({ name, room: { name },
  memory: { role: 'builder', builderScope: 'local', ...extra } });
const w7 = creep('w7-builder', 'W7N4');
const w8 = creep('w8-builder', 'W8N4');
const newBuilder = creep('new-builder', 'W8N4');
const outpost = creep('outpost-builder', 'W8N3', { builderScope: 'outpost' });
const expansion = creep('expansion-builder', 'W9N4', {
  builderScope: 'expansion' });
const hauler = { name: 'hauler', room: { name: 'W8N4' },
  memory: { role: 'hauler' } };
const creeps = [w7, w8, newBuilder, outpost, expansion, hauler];
const previous = { updated: 99, deferredCreeps: [
  { name: w7.name, consecutiveTicks: 12 },
  { name: w8.name, consecutiveTicks: 18 },
  { name: newBuilder.name, consecutiveTicks: 3 },
  { name: outpost.name, consecutiveTicks: 40 },
  { name: expansion.name, consecutiveTicks: 50 },
  { name: hauler.name, consecutiveTicks: 60 }
] };
const before = JSON.stringify({ creeps, previous });

assert.deepStrictEqual(selectFairExecutionCreeps({ creeps, previous,
  tick: 100, mode: 'constrained' }), [w8],
'the longest-deferred eligible home builder receives the bounded fair visit');
assert.deepStrictEqual(selectFairExecutionCreeps({ creeps, previous,
  tick: 101, mode: 'constrained' }), [], 'cadence bounds extra admission');
assert.deepStrictEqual(selectFairExecutionCreeps({ creeps, previous,
  tick: 100, mode: 'recovery' }), [], 'recovery remains survival-only');
assert.deepStrictEqual(selectFairExecutionCreeps({ creeps, previous: {
  ...previous, updated: 98 }, tick: 100, mode: 'normal' }), [],
'stale telemetry cannot manufacture prolonged deferral');
assert.deepStrictEqual(selectFairExecutionCreeps({ creeps, previous,
  tick: 100, mode: 'normal', threshold: 20 }), [],
'builders below the configured bound remain optional');
assert.deepStrictEqual(selectFairExecutionCreeps({ creeps, previous,
  tick: 100, mode: 'normal', limit: 2 }), [w8, w7],
'multi-room ties are deterministic and globally bounded');
assert.strictEqual(JSON.stringify({ creeps, previous }), before,
'fairness selection never mutates roster or telemetry inputs');

const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.includes('const fairExecutionCreeps = selectFairExecutionCreeps({'));
assert(main.indexOf('const executionCreeps = fairExecutionCreeps.concat(') <
  main.indexOf('survivalExecutionCreeps,'),
'the bounded fair visit is admitted before the protected chain reaches its ceiling');
assert(main.includes('survivalExecutionCreeps.length + fairExecutionCreeps.length'));
assert(main.includes('fairCreeps: fairExecutionCreeps.map(creep => creep.name)'));

const queueStart = main.indexOf('  const sortedExecutionCreeps =');
const queueEnd = main.indexOf('  const controllerStations =', queueStart);
const guardStart = main.indexOf('  const executionCpuCeiling =');
const guardEnd = main.indexOf('    const pickupJob=', guardStart);
const executable = (name, role, room = 'W8N4', extra = {}) => ({ name,
  room: { name }, memory: { role, ...extra }, store: { energy: 0 } });
const fair = executable('fair-builder', 'builder', 'W8N4', {
  builderScope: 'local' });
const other = executable('other-builder', 'builder', 'W7N4', {
  builderScope: 'local' });
const protectedHome = executable('home-harvester', 'harvester');
const protectedRemote = executable('remote-hauler', 'remote-hauler');
const protectedRoster = [protectedHome, protectedRemote,
  ...Array.from({ length: 18 }, (_, index) =>
    executable(`protected-${index}`, 'harvester'))];
const integrationContext = {
  Game: { time: 100, cpu: { limit: 100, getUsed: () => 100 } },
  cpuPolicy: deriveCpuPolicy(2000), CONTROLLER_BRIGADE_ROLE: 'controller-relay',
  RESOURCE_ENERGY: 'energy', selectFairExecutionCreeps,
  previousCpuExecution: { updated: 99, deferredCreeps: [
    { name: fair.name, consecutiveTicks: 20 },
    { name: other.name, consecutiveTicks: 15 }
  ] },
  executionOrderRecords: [fair, other, ...protectedRoster]
    .map(creep => ({ creep })),
  sortExecutionRecords: records => records.slice(), visited: []
};
vm.runInNewContext(main.slice(queueStart, queueEnd) +
  main.slice(guardStart, guardEnd) +
  'visited.push(creep.name); }', integrationContext);
assert.strictEqual(integrationContext.visited[0], fair.name);
assert.strictEqual(integrationContext.visited.length,
  protectedRoster.length + 1, 'fairness adds only one bounded visit');
assert(protectedRoster.every(creep => integrationContext.visited
  .includes(creep.name)), 'the complete protected roster still executes');
assert(!integrationContext.visited.includes(other.name),
'additional optional builders remain behind the ceiling');

console.log('bounded builder fairness preserves recovery, cadence, churn and room isolation');
