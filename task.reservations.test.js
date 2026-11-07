'use strict';

const assert = require('assert');
const { createTaskReservations } = require('./task.reservations');

const shared = { id: 'extension-site', shared: true };
const exclusive = { id: 'road-site', shared: false };
const reservations = createTaskReservations({
  Game: { getObjectById: () => null },
  isSharedTarget: target => target.shared,
  getSharedTargetLimit: () => 2
});
const buckets = reservations.createBuckets(['build']);
assert.strictEqual(reservations.claim(buckets.build, shared, 'A'), true);
assert.strictEqual(reservations.claim(buckets.build, shared, 'B'), true);
assert.strictEqual(reservations.claim(buckets.build, shared, 'C'), false);
reservations.release(buckets.build, shared, 'A');
assert.strictEqual(reservations.claim(buckets.build, shared, 'C'), true);
assert.strictEqual(reservations.claim(buckets.build, exclusive, 'A'), true);
assert.strictEqual(reservations.claim(buckets.build, exclusive, 'B'), false);

console.log('task reservation scenarios passed');
