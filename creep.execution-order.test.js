'use strict';

const assert = require('assert');
const {
  snapshotExecutionOrder,
  sortTaskRecords,
  sortExecutionRecords
} = require('./creep.execution-order');

let memoryReads = 0;
let storeReads = 0;
const creep = (name, memory, loaded = false) => ({
  name,
  get memory() {
    memoryReads++;
    return memory;
  },
  store: {
    getUsedCapacity() {
      storeReads++;
      return loaded ? 50 : 0;
    }
  }
});

const creeps = [
  creep('builder', { role: 'builder', builderScope: 'outpost' }),
  creep('hauler', { role: 'hauler', dispatchCommitment: { since: 20 } }, true),
  creep('refiller', { role: 'refiller' })
];
const priority = (_creep, memory) => memory.role === 'refiller' ? 0
  : memory.role === 'hauler' ? 1 : 5;
const records = snapshotExecutionOrder(creeps, priority, 100);

assert.strictEqual(memoryReads, creeps.length,
  'execution ordering snapshots Memory once per creep');
assert.strictEqual(storeReads, creeps.length,
  'execution ordering snapshots store occupancy once per creep');
assert.deepStrictEqual(sortTaskRecords(records).map(record => record.name),
  ['refiller', 'hauler', 'builder']);
assert.deepStrictEqual(sortExecutionRecords(records).map(record => record.name),
  ['builder', 'hauler', 'refiller'],
  'outpost emergencies and commitments preserve the existing execution order');
assert.strictEqual(memoryReads, creeps.length,
  'sorting plain records performs no additional Memory reads');
assert.strictEqual(storeReads, creeps.length,
  'sorting plain records performs no additional store reads');

console.log('creep execution ordering snapshots isolate-backed values once');
