'use strict';

const assert = require('assert');
const fs = require('fs');
const { getSpawnActivityStatus } = require('./spawn.status');
const base = { idleCount: 1, congestionCount: 0, population: 4,
  workerLimit: 8, spawns: [{ spawning: { name: 'replacement' } }] };

assert.deepStrictEqual(getSpawnActivityStatus(base), ['1 idle', 'spawns busy'],
  'idle workers must not imply that a busy spawn is paused');
assert.deepStrictEqual(getSpawnActivityStatus({ ...base,
  spawns: [{ spawning: null }] }), ['1 idle']);
assert.deepStrictEqual(getSpawnActivityStatus({ ...base,
  spawns: [...base.spawns, { spawning: null }] }), ['1 idle'],
  'one busy spawn must not hide an available spawn');
assert.deepStrictEqual(getSpawnActivityStatus({ ...base, idleCount: 0,
  spawns: [] }), [], 'an empty spawn list is not busy');
assert.deepStrictEqual(getSpawnActivityStatus({ ...base, congestionCount: 2,
  population: 8 }), ['1 idle', '2 congested', 'pop target', 'spawns busy']);
const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert.ok(main.includes('const blockers = getSpawnActivityStatus({'));
assert.ok(main.includes('room.memory.spawnActivityStatus = { updated: Game.time, status,'),
  'persist the actual console status for fresh-tick readback');
assert.ok(!main.includes('idle; spawn paused'),
  'the live console must use the independent status observations');
console.log('spawn activity status scenarios passed');
