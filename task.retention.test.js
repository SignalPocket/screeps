'use strict';

const assert = require('assert');
const { createTaskReservations } = require('./task.reservations');
const shared = Object.freeze({ id: 'extension', shared: true });
const exclusive = Object.freeze({ id: 'road' });
const objects = { extension: shared, road: exclusive };
let limit = 2;
const api = createTaskReservations({
  Game: { getObjectById: id => objects[id] || null },
  isSharedTarget: target => target.shared,
  getSharedTargetLimit: () => limit
});
const worker = (name, task = 'build', target = 'extension') =>
  ({ name, memory: { task, buildTarget: target, unrelated: 'preserve' } });
const valid = target => Boolean(target);
const retain = (creep, bucket, predicate = valid) =>
  api.retainExclusive(creep, ['build', 'remote-haul'], 'buildTarget', bucket, predicate);
const buckets = api.createBuckets(['build', 'repair']);
assert.notStrictEqual(buckets.build, buckets.repair);
const a = worker('A');
assert.strictEqual(retain(a, buckets.build), shared);
assert.strictEqual(retain(a, buckets.build), shared);
assert.deepStrictEqual(buckets.build.extension, ['A'], 'repeat retention consumes one slot');
assert.strictEqual(retain(worker('B', 'remote-haul'), buckets.build), shared);
const denied = worker('C');
assert.strictEqual(retain(denied, buckets.build), null);
assert.deepStrictEqual(denied.memory, { task: 'build', unrelated: 'preserve' });
assert.strictEqual(retain(worker('C'), buckets.repair), shared, 'buckets are independent');
api.release(buckets.build, shared, 'stranger');
assert.deepStrictEqual(buckets.build.extension, ['A', 'B']);
api.release(buckets.build, shared, 'A');
assert.deepStrictEqual(buckets.build.extension, ['B']);
assert.strictEqual(retain(worker('C'), buckets.build), shared);
api.release(buckets.build, shared, 'B');
api.release(buckets.build, shared, 'C');
assert.strictEqual(Object.hasOwn(buckets.build, 'extension'), false);
api.release(buckets.build, shared, 'C');
api.release(buckets.build, null, 'C');
assert.deepStrictEqual(buckets.build, {});

// Task switches, disappeared objects and caller validity all revoke stale memory.
for (const creep of [worker('wrong-task', 'repair'), worker('gone', 'build', 'missing'),
  worker('invalid')]) {
  const bucket = {};
  assert.strictEqual(retain(creep, bucket,
    target => creep.name !== 'invalid' && valid(target)), null);
  assert.deepStrictEqual(bucket, {});
  assert.strictEqual(Object.hasOwn(creep.memory, 'buildTarget'), false);
  assert.strictEqual(creep.memory.unrelated, 'preserve');
}
const plain = worker('plain', 'build', 'road');
assert.strictEqual(api.retain(plain, 'build', 'buildTarget', valid), exclusive);
assert.strictEqual(plain.memory.buildTarget, 'road');
assert.strictEqual(retain(plain, buckets.build), exclusive);
assert.strictEqual(retain(plain, buckets.build), exclusive);
const conflict = worker('other', 'build', 'road');
assert.strictEqual(retain(conflict, buckets.build), null);
assert.strictEqual(Object.hasOwn(conflict.memory, 'buildTarget'), false);
api.release(buckets.build, exclusive, 'other');
assert.strictEqual(buckets.build.road, 'plain');
api.release(buckets.build, exclusive, 'plain');
assert.strictEqual(retain(worker('other', 'build', 'road'), buckets.build), exclusive);

// Shrinking capacity retains existing owners but admits no newcomer until free.
const changing = {};
assert(api.claim(changing, shared, 'A'));
assert(api.claim(changing, shared, 'B'));
limit = 1;
assert(api.claim(changing, shared, 'A'));
assert.strictEqual(api.claim(changing, shared, 'C'), false);
api.release(changing, shared, 'A');
assert.strictEqual(api.claim(changing, shared, 'C'), false);
api.release(changing, shared, 'B');
assert(api.claim(changing, shared, 'C'));
for (limit of [0, undefined, -1]) {
  const bucket = {};
  assert(api.claim(bucket, shared, 'A'), 'invalid/empty limits retain one useful owner');
  assert.strictEqual(api.claim(bucket, shared, 'B'), false);
}
const nextTick = api.createBuckets(['build']);
assert.strictEqual(retain(worker('new-owner'), nextTick.build), shared,
  'per-tick buckets must not inherit prior ownership');
assert.strictEqual(api.claim(nextTick.build, null, 'A'), false);
console.log('Task target retention and ownership recovery passed');
