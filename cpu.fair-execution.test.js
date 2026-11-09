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
const parked = creep('parked-builder', 'W7N4', { waitState: 'parked' });
const hauler = { name: 'hauler', room: { name: 'W8N4' },
  memory: { role: 'hauler' } };
const creeps = [w7, w8, newBuilder, outpost, expansion, parked, hauler];
const previous = { updated: 99, deferredCreeps: [
  { name: w7.name, consecutiveTicks: 12 },
  { name: w8.name, consecutiveTicks: 18 },
  { name: newBuilder.name, consecutiveTicks: 3 },
  { name: outpost.name, consecutiveTicks: 40 },
  { name: expansion.name, consecutiveTicks: 50 },
  { name: parked.name, reason: 'parked', consecutiveTicks: 50 },
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
const repairCreeps = [
  creep('w7n4-fixer', 'W7N4', { workJob: { lane: 'repair' } }),
  creep('w8n4-fixer', 'W8N4', { workJob: { lane: 'repair' } }),
  creep('w7n3-fixer', 'W7N3', { builderScope: 'outpost',
    repairWorkTarget: 'w7n3-road' }),
  creep('w8n3-fixer', 'W8N3', { builderScope: 'outpost',
    repairWorkTarget: 'w8n3-road' })
];
const activeRepair = candidate => repairCreeps.includes(candidate);
const repairPrevious = { updated: 199, deferredCreeps: repairCreeps.map(
  candidate => ({ name: candidate.name, reason: 'cpu-deferred',
    consecutiveTicks: 1 })) };
const firstRepairVisit = selectFairExecutionCreeps({ creeps: repairCreeps,
  previous: repairPrevious, tick: 200, mode: 'normal', repairLimit: 2,
  repairInterval: 1, repairThreshold: 1, isActiveRepair: activeRepair });
assert.deepStrictEqual(firstRepairVisit.map(candidate => candidate.name),
  ['w7n3-fixer', 'w7n4-fixer'],
  'normal saturation admits two durable repair continuations across rooms');
const remainingRepairs = repairCreeps.filter(candidate =>
  !firstRepairVisit.includes(candidate));
const secondRepairVisit = selectFairExecutionCreeps({ creeps: repairCreeps,
  previous: { updated: 200, deferredCreeps: remainingRepairs.map(candidate =>
    ({ name: candidate.name, reason: 'cpu-deferred', consecutiveTicks: 2 })) },
  tick: 201, mode: 'normal', repairLimit: 2, repairInterval: 1,
  repairThreshold: 1, isActiveRepair: activeRepair });
assert.deepStrictEqual(secondRepairVisit.map(candidate => candidate.name),
  ['w8n3-fixer', 'w8n4-fixer'],
  'the complete four-room repair set receives a visit before five deferrals');
assert.deepStrictEqual(selectFairExecutionCreeps({ creeps: repairCreeps,
  previous: repairPrevious, tick: 200, mode: 'recovery', repairLimit: 2,
  isActiveRepair: activeRepair }), [],
  'recovery never admits the durable repair fairness lane');
assert.strictEqual(JSON.stringify({ creeps, previous }), before,
'fairness selection never mutates roster or telemetry inputs');

const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.includes('const fairExecutionCreeps = selectFairExecutionCreeps({'));
assert(main.includes('const executionCreeps = survivalExecutionCreeps.concat('));
assert(main.indexOf('survivalExecutionCreeps.concat(') <
  main.indexOf('fairExecutionCreeps,',
    main.indexOf('survivalExecutionCreeps.concat(')),
'survival execution precedes the bounded durable-repair lane');
assert(main.includes('survivalExecutionCreeps.length + fairExecutionCreeps.length'));
assert(main.includes('fairCreeps: fairExecutionCreeps.map(creep => creep.name)'));

const queueStart = main.indexOf('  const sortedExecutionCreeps =');
const queueEnd = main.indexOf('  const controllerStations =', queueStart);
const guardStart = main.indexOf('  const executionCpuCeiling =');
const guardEnd = main.indexOf('    const pickupJob=', guardStart);
const executable = (name, role, room = 'W8N4', extra = {}) => ({ name,
  room: { name: room }, memory: { role, ...extra }, store: { energy: 0 } });
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
  Game: { time: 100, cpu: { limit: 100, getUsed: () => 100 },
    getObjectById: () => null },
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
assert.strictEqual(integrationContext.visited[0], protectedHome.name,
  'survival work executes before the bounded fair visit');
assert.strictEqual(integrationContext.visited.length,
  protectedRoster.length + 1, 'fairness adds only one bounded visit');
assert(protectedRoster.every(creep => integrationContext.visited
  .includes(creep.name)), 'the complete protected roster still executes');
assert(!integrationContext.visited.includes(other.name),
'additional optional builders remain behind the ceiling');
assert.strictEqual(integrationContext.visited[protectedRoster.length],
  fair.name, 'the fair visit remains guaranteed after the survival roster');

const durableOutpostW7 = executable('w7n3-outpost-fixer', 'builder', 'W7N3', {
  builderScope: 'outpost', remoteRoom: 'W7N3',
  repairWorkTarget: 'w7n3-road'
});
durableOutpostW7.store.energy = 25;
const durableOutpostW8 = executable('w8n3-outpost-fixer', 'builder', 'W8N3', {
  builderScope: 'outpost', remoteRoom: 'W8N3',
  repairWorkTarget: 'w8n3-road'
});
const parkedRepair = executable('parked-fixer', 'builder', 'W8N3', {
  builderScope: 'outpost', remoteRoom: 'W8N3', waitState: 'parked'
});
parkedRepair.store.energy = 25;
const completedRepair = executable('completed-fixer', 'builder', 'W8N3', {
  builderScope: 'outpost', remoteRoom: 'W8N3',
  repairWorkTarget: 'complete-road'
});
const repairTargets = {
  'w7n3-road': { hits: 100, hitsMax: 1000, room: { name: 'W7N3' } },
  'w8n3-road': { hits: 100, hitsMax: 1000, room: { name: 'W8N3' } },
  'complete-road': { hits: 1000, hitsMax: 1000, room: { name: 'W8N3' } }
};
const durableContext = {
  Game: { time: 101, cpu: { limit: 100, getUsed: () => 100 },
    getObjectById: id => repairTargets[id] || null },
  cpuPolicy: deriveCpuPolicy(10000),
  CONTROLLER_BRIGADE_ROLE: 'controller-relay', RESOURCE_ENERGY: 'energy',
  selectFairExecutionCreeps,
  previousCpuExecution: { updated: 100, deferredCreeps:
    [durableOutpostW7, durableOutpostW8, parkedRepair, completedRepair]
      .map(candidate => ({
      name: candidate.name, reason: candidate === parkedRepair
        ? 'parked' : 'cpu-deferred', consecutiveTicks: 1
    })) },
  executionOrderRecords: [durableOutpostW7, durableOutpostW8, parkedRepair,
    completedRepair, ...protectedRoster].map(creep => ({ creep })),
  sortExecutionRecords: records => records.slice(), visited: []
};
vm.runInNewContext(main.slice(queueStart, queueEnd) +
  main.slice(guardStart, guardEnd) +
  'visited.push(creep.name); }', durableContext);
assert(protectedRoster.every((creep, index) =>
  durableContext.visited[index] === creep.name),
  'every survival visit precedes durable repair continuations');
assert.deepStrictEqual(durableContext.visited.slice(protectedRoster.length,
  protectedRoster.length + 2),
  ['w7n3-outpost-fixer', 'w8n3-outpost-fixer'],
  'W7N3 and W8N3 live repair continuations remain guaranteed past the ceiling');
assert(!durableContext.visited.includes(parkedRepair.name),
  'intentional conservation parking never consumes repair fairness');
assert(!durableContext.visited.includes(completedRepair.name),
  'completed durable targets leave the continuation lane');

console.log('bounded builder fairness preserves recovery, cadence, churn and room isolation');
