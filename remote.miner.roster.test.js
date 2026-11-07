'use strict';

const assert = require('assert');
const { reconcileRemoteMinerRosters } = require('./remote.roster');

const room = { name: 'W1N1', controller: { my: true }, memory: {
  leftSurvey: { active: true, targetRoom: 'W1N2',
    remoteWorkNeeds: [
      { slot: 0, minMiners: 1, requiredWork: 3 },
      { slot: 1, minMiners: 1, requiredWork: 3 }
    ] }
} };
const miner = (name, slot, ttl) => ({ name, ticksToLive: ttl,
  memory: { home: 'W1N1', role: 'remote-miner',
    remoteRoom: 'W1N2', remoteSlot: slot },
  getActiveBodyparts: () => 3 });

const keeper0 = miner('keeper0', 0, 1200);
const duplicate0 = miner('duplicate0', 0, 500);
const expiring0 = miner('expiring0', 0, 40);
const keeper1 = miner('keeper1', 1, 1100);
let result = reconcileRemoteMinerRosters({ rooms: [room],
  creeps: [keeper0, duplicate0, expiring0, keeper1],
  getReplacementLead: () => 100 });
assert.strictEqual(result.W1N1.assigned, 2);
assert.strictEqual(result.W1N1.overlaps, 1);
assert.deepStrictEqual(result.W1N1.retired, ['duplicate0']);
assert.strictEqual(expiring0.memory.remoteReplacementOverlap, true);
assert.strictEqual(duplicate0.memory.role, 'retire');

const first = miner('first', 0, 1200);
const movable = miner('movable', 0, 1100);
result = reconcileRemoteMinerRosters({ rooms: [room],
  creeps: [first, movable], getReplacementLead: () => 100 });
assert.strictEqual(result.W1N1.assigned, 2);
assert.strictEqual(movable.memory.remoteSlot, 1,
  'a duplicate fills an uncovered physical source before retirement');
assert.deepStrictEqual(result.W1N1.retired, []);

console.log('remote miner roster enforces one owner and one replacement overlap per source');
