'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { createWaitAgeTracker, PROLONGED_TICKS } = require('./wait.age');
const creep = (name = 'reserve', room = 'second') => ({name, room: {name:room},
  fatigue:0, memory:{role:'hauler',task:'standby',taskTarget:'parking 2,3',
    waitState:'parked',waitReason:'planner reserve',workJob:{id:'keep'}}});
const c = creep();
const observe = (tick, actor = c, options = {}) => {
  const tracker = createWaitAgeTracker(tick);
  if (options.evaluated !== false) tracker.markEvaluated(actor, options.override);
  if (options.tired) tracker.wrapMovement(() => -11, -11)(actor, {});
  return tracker.finish([actor]);
};
observe(10);
assert.strictEqual(c.memory.waitAge.since, 10);
assert.strictEqual(c.memory.waitAge.age, 0);
for (let tick = 11; tick <= 10 + PROLONGED_TICKS; tick++) {
  // Production clears and recreates the ordinary wait flags every evaluated tick.
  delete c.memory.waitState;
  delete c.memory.waitReason;
  c.memory.waitState = 'parked'; c.memory.waitReason = 'planner reserve';
  observe(tick);
}
assert.strictEqual(c.memory.waitAge.since, 10);
assert.strictEqual(c.memory.waitAge.age, PROLONGED_TICKS);
assert(c.memory.waitAge.prolonged);
assert.strictEqual(observe(110).prolonged, 1, 'same-tick read is idempotent');
assert.strictEqual(c.memory.waitAge.since, 10);
assert.deepStrictEqual(c.memory.workJob, {id:'keep'});

for (const [key, value] of [['waitReason','new unmet condition'],
  ['taskTarget','parking 3,4'], ['role','worker']]) {
  c.memory[key] = value;
  const next = c.memory.waitAge.updated + 1;
  observe(next);
  assert.strictEqual(c.memory.waitAge.since, next, `${key} changes wait identity`);
}
c.room.name = 'home'; observe(114);
assert.strictEqual(c.memory.waitAge.since, 114, 'room transition is independent');
observe(120);
assert.strictEqual(c.memory.waitAge.since, 120, 'missing ticks cannot prove continuity');
observe(119);
assert.strictEqual(c.memory.waitAge.since, 119, 'backwards time restarts safely');

// CPU skips must not inherit stale Park state or a stale energy-budget reason.
c.memory.energyBudgetHeld = true;
c.memory.energyBudgetReason = 'budget spent';
observe(120, c, {evaluated:false});
assert.strictEqual(c.memory.waitAge.state, 'cpu-deferred');
assert.strictEqual(c.memory.waitAge.authority, 'cpu');
assert.strictEqual(c.memory.waitAge.target, '');
observe(121, c, {evaluated:false});
assert.strictEqual(c.memory.waitAge.age, 1);
observe(122);
assert.strictEqual(c.memory.waitAge.state, 'budget');
assert.strictEqual(c.memory.waitAge.authority, 'policy');
assert.strictEqual(c.memory.waitAge.since, 122);
delete c.memory.energyBudgetHeld;
delete c.memory.energyBudgetReason;
observe(123);
assert.strictEqual(c.memory.waitAge.state, 'parked');
assert.strictEqual(c.memory.waitAge.since, 123);

// A safety override clears stale assignment/budget waits, even after a CPU skip.
c.memory.energyBudgetHeld = true;
c.memory.task = 'flee';
assert.strictEqual(observe(124, c, {override:true}).total, 0);
assert.strictEqual(c.memory.waitAge, undefined);
delete c.memory.energyBudgetHeld;
delete c.memory.waitState; delete c.memory.waitReason;
c.memory.task = 'build';
c.fatigue = 10;
assert.strictEqual(observe(125).total, 0,
  'fatigue alone does not imply waiting: adjacent work can still execute');
observe(126, c, {tired:true});
assert.strictEqual(c.memory.waitAge.state, 'fatigue');
assert.strictEqual(c.memory.waitAge.authority, 'movement');
assert.strictEqual(c.memory.waitAge.fatigue, 10);
assert(c.memory.waitAge.movementTired);
observe(127, c, {tired:true});
assert.strictEqual(c.memory.waitAge.since, 126);
assert.strictEqual(observe(128).total, 0, 'resumed task clears the old wait');
assert.strictEqual(c.memory.waitAge, undefined);
assert.strictEqual(c.memory.task, 'build', 'diagnostics do not change task policy');

const movementCalls = [];
const tracker = createWaitAgeTracker(200);
const target = {id:'target'};
const wrapped = tracker.wrapMovement((...args) => {
  movementCalls.push(args); return -9;
}, -11);
const opts = {direct:true};
assert.strictEqual(wrapped(c, target, 3, opts), -9);
assert.deepStrictEqual(movementCalls, [[c,target,3,opts]],
  'movement arguments, single call and result are preserved');
tracker.markEvaluated(c);
assert.strictEqual(tracker.finish([c]).total, 0,
  'non-tired movement results are not labeled fatigue');

// Bounded output and independent rooms/creeps, not a growing history.
const population = Array.from({length:25}, (_,i) => creep(`c${i}`, `room${i%2}`));
const many = createWaitAgeTracker(300);
population.forEach(actor => many.markEvaluated(actor));
const summary = many.finish(population);
assert.strictEqual(summary.total, 25);
assert.strictEqual(summary.longest.length, 10);
assert.strictEqual(summary.authorities.assignment, 25);
population[0].memory.waitReason = 'x'.repeat(500) + 'one';
observe(301, population[0]);
const firstReason = population[0].memory.waitAge.reason;
assert(firstReason.length <= 160);
population[0].memory.waitReason = 'x'.repeat(500) + 'two';
observe(302, population[0]);
assert.notStrictEqual(population[0].memory.waitAge.reason, firstReason);
assert.strictEqual(population[0].memory.waitAge.since, 302);
assert.strictEqual(Object.keys(population[0].memory.waitAge).length, 14);
population[0].spawning = true;
assert.strictEqual(observe(303,population[0]).total, 0);

// Run the actual main-loop admission boundary: the skipped suffix is not evaluated.
const main = fs.readFileSync(require.resolve('./main'), 'utf8');
const start = main.indexOf('  let executedCreepCount = 0;');
const end = main.indexOf('    const managedPickup=', start);
assert(start > 0 && end > start);
const prefix = main.slice(start,end) + '\n  }';
const pair = [creep('executed'), creep('deferred')];
const actual = createWaitAgeTracker(400);
let usedCalls = 0;
vm.runInNewContext(prefix, {waitAge:actual,executionCreeps:pair,
  pickupPlan:{jobs:{}},
  executionCpuCeiling:5,requiredExecutionCount:1,
  Game:{cpu:{getUsed:()=>{usedCalls++;return 6;}}}});
assert.strictEqual(usedCalls, 1);
actual.finish(pair);
assert.strictEqual(pair[0].memory.waitAge.state, 'parked');
assert.strictEqual(pair[1].memory.waitAge.state, 'cpu-deferred');

// Exercise real movement construction, final sampling, and all safety marks.
const moveStart = main.indexOf('  const waitAge = createWaitAgeTracker(Game.time);');
const moveEnd = main.indexOf('  const { findFleeStep }', moveStart);
assert(moveStart > 0 && moveEnd > moveStart);
const context = {createWaitAgeTracker,Game:{time:500},Room:{},
  FIND_STRUCTURES:1,FIND_MY_CONSTRUCTION_SITES:2,FIND_MY_CREEPS:3,
  STRUCTURE_ROAD:'road',STRUCTURE_EXTENSION:'extension',OK:0,
  ERR_INVALID_TARGET:-7,ERR_TIRED:-11,
  createMovementService:()=>({moveCreep:()=>-11}),creep:c};
vm.runInNewContext(main.slice(moveStart,moveEnd) +
  '\nwaitAge.markEvaluated(creep); moveCreep(creep, {}); result=waitAge.finish([creep]);',context);
assert.strictEqual(context.result.states.fatigue, 1);
const finalLine = '  Memory.waitAge = waitAge.finish(creeps);';
const finalIndex = main.indexOf(finalLine);
assert(finalIndex > main.indexOf("    creep.say('Run!');"));
assert(finalIndex < main.indexOf('  const workMetrics ='));
const defenderStart = main.indexOf('  for (const creep of defenders) {');
const defenderEnd = main.indexOf('    const targetRoomName',defenderStart);
const defender = creep('defender'); defender.memory.role = 'defender';
const safety = createWaitAgeTracker(600);
vm.runInNewContext(main.slice(defenderStart,defenderEnd)+'\n  }',
  {defenders:[defender],waitAge:safety});
const memory = {};
vm.runInNewContext(finalLine, {Memory:memory,waitAge:safety,creeps:[defender]});
assert.strictEqual(memory.waitAge.total, 0, 'defense overrides stale Park flags');
for (const anchor of ['      if (healingTarget) {', '    if (!step) continue;']) {
  const at = main.indexOf(anchor);
  const after = main.slice(at+anchor.length).trimStart();
  assert(after.startsWith('waitAge.markEvaluated(creep, true);'),
    'healing and flee must supersede the ordinary wait observation');
}
console.log('persistent wait age, CPU/fatigue separation and production wiring passed');
