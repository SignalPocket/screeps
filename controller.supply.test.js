'use strict';
const assert = require('assert/strict');
const { captureSupply, compareSupply } = require('./controller.supply');
const make = (tick = 100, progress = 1000) => ({ collections: [
  { name: 'env', data: [{ data: { gameTime: tick, 'memory:u': JSON.stringify({
    rooms: { A: { laborPlan: { updated: tick - 1, upgradeBudget: 15 } } },
    creeps: { a: { role: 'upgrader', task: 'upgrade' } }
  }) } }] },
  { name: 'rooms.objects', data: [
    { type: 'controller', _id: 'c', user: 'u', room: 'A', x: 20, y: 20, level: 5, progress },
    { type: 'creep', name: 'a', user: 'u', room: 'A', x: 23, y: 23,
      ageTime: tick + 100, body: [{ type: 'work', hits: 100 }], store: { energy: 10 } }
  ] }
] });
const db = make();
const original = JSON.stringify(db);
const before = captureSupply(db, 'u');
assert.equal(JSON.stringify(db), original);
assert.deepEqual(before.rooms.A.categories, { 'upgrade-ready': 1 });
const after = captureSupply(make(110, 1030), 'u');
const report = compareSupply(before, after);
assert.equal(report.rooms.A.progressPerTick, 3);
assert.equal(report.rooms.A.progressDelta, 30);
assert.deepEqual(report.rooms.A.laborBudgetEndpoints, [15, 15]);
assert.match(report.rooms.A.limits, /not successful upgrading/);
assert.throws(() => compareSupply(before, before), /advancing/);
assert.throws(() => compareSupply(after, before), /advancing/);
assert.throws(() => compareSupply(before, { ...after, user: 'other' }), /matching/);
for (const [level, progress, pattern] of [[6, 1, /level changed/], [5, 1, /reset progress/], [5, null, /missing/]]) {
  const next = structuredClone(after);
  Object.assign(next.rooms.A, { level, progress });
  assert.match(compareSupply(before, next).rooms.A.unknown, pattern);
  assert.equal(compareSupply(before, next).rooms.A.progressPerTick, null);
}
const rcl8 = structuredClone(before);
rcl8.rooms.A.level = 8;
assert.match(compareSupply(rcl8, { ...rcl8, tick: 101 }).rooms.A.unknown, /RCL8/);
assert.match(compareSupply({ ...before, rooms: {} }, after).rooms.A.unknown, /earlier/);
const replaced = structuredClone(after);
replaced.rooms.A.controllerId = 'new';
assert.match(compareSupply(before, replaced).rooms.A.unknown, /identity/);
assert.equal(compareSupply(before, captureSupply(make(110, 1000), 'u')).rooms.A.progressPerTick, 0);

const classify = (changeCreep, changeMemory = () => {}) => {
  const d = make();
  changeCreep(d.collections[1].data[1]);
  const env = d.collections[0].data[0].data;
  const memory = JSON.parse(env['memory:u']);
  changeMemory(memory);
  env['memory:u'] = JSON.stringify(memory);
  return captureSupply(d, 'u').rooms.A;
};
assert.deepEqual(classify(c => { c.store.energy = 0; }).categories, { 'empty-energy': 1 });
assert.deepEqual(classify(c => { c.x = 24; }).categories, { 'travel-needed': 1 });
assert.deepEqual(classify(c => { c.x = 24; c.fatigue = 2; }).categories, { fatigue: 1 });
assert.deepEqual(classify(c => { c.x = 24; }, m => { m.creeps.a.navStuck = 2; }).categories, { 'blocked-access-signal': 1 });
assert.deepEqual(classify(() => {}, m => { m.creeps.a.energyBudgetHeld = true; }).categories, { 'budget-wait': 1 });
assert.deepEqual(classify(c => { delete c.ageTime; }).categories, { spawning: 1 });
assert.deepEqual(classify(c => { c.body[0].hits = 0; }).categories, { 'no-active-work': 1 });
assert.deepEqual(classify(() => {}, m => { m.cpuPolicy = { execution: { updated: 99, deferredCreeps: [{ name: 'a' }] } }; }).categories, { 'cpu-deferred': 1 });
assert.deepEqual(classify(() => {}, m => { m.cpuPolicy = { execution: { updated: 50, deferredCreeps: [{ name: 'a' }] } }; }).categories, { 'upgrade-ready': 1 });
assert.equal(classify(c => { c.body[0].boost = 'XGH2O'; }).boosted, true);
assert.deepEqual(classify(c => { c.room = 'B'; }).categories, {});
assert.deepEqual(classify(() => {}, m => { m.creeps.a = { role: 'worker', demandLane: 'upgrade', task: 'upgrade' }; }).categories, { 'upgrade-ready': 1 });
assert.equal(classify(() => {}, m => { delete m.rooms.A.laborPlan; }).laborBudget, null);
assert.throws(() => captureSupply(make(), 'missing'), /Missing user memory/);
assert.throws(() => captureSupply(make(), ''), /explicit user/);
assert.throws(() => captureSupply({ collections: [] }, 'u'), /tick/);
console.log('controller supply measurement boundaries passed');
