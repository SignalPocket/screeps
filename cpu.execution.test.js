'use strict';

const assert = require('assert');
const fs = require('fs');
const { summarizeCreepExecution } = require('./cpu.policy');
const creep = (name, role, room = 'W7N4') =>
  ({ name, memory: { role }, room: { name: room } });
const creeps = [creep('home', 'hauler'), creep('remote1', 'remote-miner', 'W8N3'),
  creep('remote2', 'remote-miner', 'W7N3'), creep('builder', 'builder')];
const input = JSON.stringify(creeps);
const first = summarizeCreepExecution({ creeps, executedCount: 2, tick: 100 });
assert.deepStrictEqual([first.available, first.executed, first.deferred], [4, 2, 2]);
assert.deepStrictEqual(first.roles['remote-miner'],
  { available: 2, executed: 1, deferred: 1 });
assert.deepStrictEqual(first.deferredCreeps, [
  { name: 'remote2', role: 'remote-miner', room: 'W7N3', consecutiveTicks: 1 },
  { name: 'builder', role: 'builder', room: 'W7N4', consecutiveTicks: 1 }
]);
// Rotation visits remote2 but defers remote1: count by queue position, not name
// or role. Only builder has lost two consecutive executor opportunities.
const second = summarizeCreepExecution({
  creeps: [creeps[0], creeps[2], creeps[1], creeps[3]],
  executedCount: 2, tick: 101, previous: first });
assert.deepStrictEqual(second.deferredCreeps.map(c => [c.name, c.consecutiveTicks]),
  [['remote1', 1], ['builder', 2]]);
assert.strictEqual(summarizeCreepExecution({ creeps, executedCount: 0,
  tick: 103, previous: second }).deferredCreeps[3].consecutiveTicks, 1,
'missing telemetry ticks must not imply continuous deferral');
const all = summarizeCreepExecution({ creeps, executedCount: 4,
  tick: 102, previous: second });
assert.deepStrictEqual(all.deferredCreeps, []);
assert.strictEqual(all.roles.builder.executed, 1);
const reset = summarizeCreepExecution({ creeps: [creeps[3]], executedCount: 0,
  tick: 103, previous: all });
assert.strictEqual(reset.deferredCreeps[0].consecutiveTicks, 1);
assert.strictEqual(reset.available, 1, 'dead or removed creeps leave the report');
assert.deepStrictEqual(summarizeCreepExecution({ creeps: [], executedCount: 0,
  tick: 104, previous: reset }).roles, {});
assert.strictEqual(JSON.stringify(creeps), input, 'telemetry never changes creep memory');
assert.strictEqual(first.deferredCreeps[1].consecutiveTicks, 1,
  'later reports never mutate previous telemetry');
const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.indexOf('const previousCpuExecution = Memory.cpuPolicy') <
  main.indexOf('Memory.cpuPolicy = { updated: Game.time'));
assert(main.includes('executedCount: executedCreepCount, tick: Game.time'));
assert(main.includes('previous: previousCpuExecution'));
console.log('CPU executor telemetry identifies deferred roles and consecutive missed visits');
