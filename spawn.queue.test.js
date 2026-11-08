'use strict';

const assert = require('assert');
const { getSpawnQueueWait } = require('./spawn.queue');

assert.strictEqual(getSpawnQueueWait(undefined, 'W1N1'), 0);
assert.strictEqual(getSpawnQueueWait({}, 'W1N1'), 0);
assert.strictEqual(getSpawnQueueWait({ idle: {
  room: { name: 'W1N1' }, spawning: null
} }, 'W1N1'), 0);
const spawns = {
  short: { room: { name: 'W1N1' }, spawning: { remainingTime: 1 } },
  long: { room: { name: 'W1N1' }, spawning: { remainingTime: 49 } },
  idle: { room: { name: 'W1N1' }, spawning: null },
  other: { room: { name: 'W2N2' }, spawning: { remainingTime: 500 } },
  missingRoom: { spawning: { remainingTime: 900 } },
  missingTime: { room: { name: 'W1N1' }, spawning: {} },
  invalidTime: { room: { name: 'W1N1' },
    spawning: { remainingTime: '90' } }
};
assert.strictEqual(getSpawnQueueWait(spawns, 'W1N1'), 49);
assert.strictEqual(getSpawnQueueWait(spawns, 'W2N2'), 500);
assert.strictEqual(getSpawnQueueWait(spawns, 'W3N3'), 0);
assert.strictEqual(getSpawnQueueWait(spawns), 0);
console.log('shared spawn queue wait observation preserves room isolation and boundaries');
