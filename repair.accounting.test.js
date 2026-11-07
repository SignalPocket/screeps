'use strict';
const assert = require('assert');
const { accountRepairs } = require('./repair.accounting');
const asset = (id, hits, room = 'R', type = 'container') =>
  ({ _id: id, type, room, x: 10, y: 10, hits, hitsMax: 10000 });
const sample = (tick, objects, roles = []) => ({ tick, objects, roles, rooms: {} });
const creep = (memory, changes = {}) => ({ name: 'builder', room: 'R', x: 20, y: 20,
  body: [{ type: 'work', hits: 100 }], store: { energy: 50 }, memory, ...changes });
const before = sample(10, [asset('c', 1000), asset('lost', 500)]);
const after = sample(20, [asset('c', 2000), asset('new', 9000, 'S')],
  [creep({ task: 'emergency-repair', taskTarget: 'c',
    waitAge: { updated: 20, state: 'cpu-deferred', age: 2, reason: 'ceiling' } })]);
const saved = JSON.stringify([before, after]);
const report = accountRepairs(before, after);
assert.strictEqual(JSON.stringify([before, after]), saved, 'diagnostics must not mutate inputs');
assert.strictEqual(report.assets.find(o => o.id === 'c').netHitsPerTick, 100);
assert.strictEqual(report.assets.find(o => o.id === 'new').netHits, null, 'new asset has no inferred rate');
assert.strictEqual(report.crews[0].phase, 'cpu-deferred', 'CPU override wins over repair label/range');
assert.strictEqual(report.rooms.length, 2);
assert.strictEqual(report.totals.matched, 1);
assert.strictEqual(report.rooms.find(r => r.room === 'R').netHitChange, 1000);
assert.strictEqual(accountRepairs(before, sample(20,
  [{ ...asset('c', 2000), hitsMax: 20000 }])).assets[0].netHits, null,
  'changed capacity cannot be treated as a comparable hit interval');
assert(report.limits.includes('gross repair throughput and energy spent are unknown'));
for (const hits of [2499, 2500, 7499, 7500, 7999, 8000, 8999, 9000]) {
  const r = accountRepairs(sample(1, []), sample(2, [asset('c', hits)])).assets[0];
  assert.strictEqual(r.rescueTriggerGeometry, hits < 2500);
  assert.strictEqual(r.maintenanceStartGeometry, hits < 7500);
  assert.strictEqual(r.maintenanceFinishGeometry, hits < 9000);
  assert.strictEqual(r.emergencyRunnerFinishGeometry, hits < 8000);
}
const phases = (memory, changes = {}) => accountRepairs(before,
  sample(20, [asset('c', 2000)], [creep(memory, changes)])).crews[0];
assert.strictEqual(phases({ task: 'repair', taskTarget: 'c' }).phase, 'outside-repair-range');
assert.strictEqual(phases({ task: 'repair', taskTarget: 'c' }, { room: 'S' }).targetRange, null);
assert.strictEqual(phases({ task: 'repair-load', repairLoading: true }).phase, 'supply-assignment');
assert.strictEqual(phases({ task: 'repair', waitAge: { updated: 19, state: 'cpu-deferred' } },
  { store: { energy: 0 } }).phase, 'empty-carry', 'stale CPU record is not current execution evidence');
assert.strictEqual(phases({ task: 'repair', waitAge: { updated: 20, state: 'budget' } }).phase, 'budget-held');
const changed = accountRepairs(before, sample(20, [asset('c', 500)]));
assert.strictEqual(changed.assets[0].netHitsPerTick, -50, 'damage/decay must not become negative repairs');
const many = accountRepairs(sample(1, []), sample(2,
  Array.from({ length: 105 }, (_, i) => asset('c' + i, 500)),
  Array.from({ length: 55 }, (_, i) => creep({ task: 'repair' }, { name: 'b' + i }))));
assert.strictEqual(many.assets.length, 100);
assert.strictEqual(many.crews.length, 50);
assert.deepStrictEqual(many.omitted, { assets: 5, crews: 5 });
assert.strictEqual(many.totals.assets, 105);
assert.throws(() => accountRepairs(before, { ...after, tick: 10 }), /advancing/);
console.log('repair endpoint accounting: thresholds, CPU precedence, rates, evidence limits and bounds passed');
