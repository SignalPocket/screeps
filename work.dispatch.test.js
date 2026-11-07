'use strict';
const assert = require('assert');
const { collectPartialHauler } = require('./work.dispatch');
const { getWaitSpeech } = require('./creep.reporting');
const run = (overrides = {}) => {
  const calls = [];
  const creep = { memory: { role: 'hauler' }, store: {
    energy: 200, getFreeCapacity: () => 150
  }, withdraw: (...args) => { calls.push(['withdraw', ...args]); return overrides.result ?? 0; } };
  const target = { id: 'reserved-storage' };
  const options = { creep, lane: 'collect', target, resource: 'energy',
    canWithdraw: () => true,
    reserve: (t, amount) => { calls.push(['reserve', t.id, amount]); return 75; },
    release: (t, amount) => calls.push(['release', t.id, amount]),
    remember: () => calls.push(['remember']), forget: () => calls.push(['forget']),
    move: () => calls.push(['move']), OK: 0, ERR_NOT_IN_RANGE: -9,
    ...overrides };
  return { done: collectPartialHauler(options), calls, creep, target };
};
let r = run();
assert(r.done);
assert.deepStrictEqual(r.calls[1], ['withdraw', r.target, 'energy', 75]);
assert.deepStrictEqual(r.creep.memory.energySources, ['reserved-storage']);
assert.strictEqual(r.creep.memory.taskTarget, 'reserved-storage');
r = run({ result: -9 });
assert(r.done); assert(r.calls.some(c => c[0] === 'move'));
assert.strictEqual(r.creep.memory.energySources, undefined);
r = run({ result: -6 });
assert(!r.done); assert(r.calls.some(c => c[0] === 'release'));
assert(r.calls.some(c => c[0] === 'forget'));
for (const overrides of [{ target: null }, { lane: 'refill' },
  { canWithdraw: () => false }, { reserve: () => 0 }]) {
  r = run(overrides); assert(!r.done);
  assert(!r.calls.some(c => c[0] === 'withdraw'));
}
for (const energy of [0, 400]) {
  const creep = { memory: { role: 'hauler' }, store: {
    energy, getFreeCapacity: () => 400-energy
  }, withdraw: () => { throw Error('unexpected withdraw'); } };
  assert(!run({ creep }).done);
}
assert.strictEqual(getWaitSpeech({ waitState: 'parked' }), 'Park');
assert.strictEqual(getWaitSpeech({ waitState: 'blocked' }), 'Blocked');
assert.strictEqual(getWaitSpeech({}), 'Blocked');
console.log('partial-hauler pickup and waiting-label regression scenarios passed');
// Exercise the actual main-loop pickup admission with partial carriers.
const fs = require('fs');
const vm = require('vm');
const main = fs.readFileSync(require.resolve('./main'), 'utf8');
const admission = main.slice(main.indexOf('  const pickupParticipants='),
  main.indexOf('  const pickupNames='));
const partial = n => ({ name: n, memory: { role: 'hauler' },
  room: { name: 'W1N1', controller: { my: true } },
  store: { energy: 50, getFreeCapacity: () => 150 },
  pos: { getRangeTo: () => 1 } });
const carriers = ['a', 'b', 'c'].map(partial);
const participants = vm.runInNewContext(admission + '\npickupParticipants', {
  executionCreeps: carriers, RESOURCE_ENERGY: 'energy',
  roomDemandPlans: { W1N1: { assignments: { a: 'collect', b: 'collect', c: 'collect' } } }
});
assert.strictEqual(participants.length, 3);
const { planPickupJobs } = require('./pickup.jobs');
const allocated = planPickupJobs({ creeps: participants, tick: 10,
  getCandidates: () => [{ id: 'storage', store: { energy: 1000 } }],
  getPreferredTarget: () => 'storage', maxCollectors: 2 });
assert.strictEqual(Object.keys(allocated.jobs).length, 2);
assert.strictEqual(allocated.jobs.a.amount, 150);
assert.strictEqual(allocated.jobs.c, undefined);
console.log('main-loop partial pickup admission retains the two-collector cap');
// Waiting details must clear each execution tick, including recovery to work.
const resetStart = main.indexOf('    delete creep.memory.task;',
  main.indexOf("const stageAtSourceBuffer"));
const resetEnd = main.indexOf('    if((creep.memory.emergencyRepairRoom', resetStart);
const recovered = { memory: { task: 'standby', taskTarget: 'old',
  waitState: 'blocked', waitReason: 'old reason' } };
vm.runInNewContext(main.slice(resetStart, resetEnd), { creep: recovered });
assert.strictEqual(recovered.memory.waitState, undefined);
assert.strictEqual(recovered.memory.waitReason, undefined);
console.log('waiting diagnostics clear when execution resumes');
const { recoverBlockedWork } = require('./work.dispatch');
const blocked = { memory: { task: 'wait-job' } };
let attempts = [];
const recoveryActions = [
  { lane: 'repair', eligible: () => false,
    run: () => { throw Error('CARRY/MOVE body cannot repair'); } },
  { lane: 'refill', eligible: () => true,
    run: () => { attempts.push('refill'); return false; } },
  { lane: 'storage', eligible: () => true,
    run: () => { attempts.push('storage'); return true; } },
  { lane: 'build', eligible: () => true,
    run: () => { throw Error('already assigned a useful job'); } }
];
assert.strictEqual(recoverBlockedWork({ creep: blocked, lane: 'collect',
  actions: recoveryActions }).lane, 'storage');
assert.deepStrictEqual(attempts, ['refill', 'storage']);
assert.strictEqual(recoverBlockedWork({ creep: blocked, lane: 'standby',
  actions: recoveryActions }), null);
assert.strictEqual(recoverBlockedWork({ creep: { memory: { task: 'build' } },
  lane: 'build', actions: recoveryActions }), null);
assert.strictEqual(recoverBlockedWork({ creep: blocked, lane: 'repair',
  actions: [{ eligible: () => true, run: () => false }] }), null);
console.log('blocked dispatch tries eligible alternatives without disrupting active or parked creeps');

// Empty reserves must not take pickup admissions away from assigned workers.
const reserve = partial('reserve'); reserve.store.energy = 0;
reserve.memory.role = 'builder';
const active = partial('active'); active.store.energy = 0;
const idleParticipants = vm.runInNewContext(admission + '\npickupParticipants', {
  executionCreeps: [reserve, active], RESOURCE_ENERGY: 'energy',
  roomDemandPlans: { W1N1: { assignments: { reserve: 'standby', active: 'collect' } } }
});
assert.strictEqual(idleParticipants.length, 1);
assert.strictEqual(idleParticipants[0].name, 'active');
console.log('parked workers do not consume pickup slots');
// Run the installed main-loop recovery block, including its ownership update.
const recoveryBlock = main.slice(main.indexOf('    const localRecoveryRole ='),
  main.indexOf("    if (!creep.memory.task && demandLane === 'standby')"));
const target = { id: 'open-extension' };
const recoveringCarrier = { name: 'carrier', memory: {
  role: 'hauler', task: 'wait-job', waitState: 'blocked' },
  room: { name: 'W1N1', memory: { demandPlan: {
    lanes: { collect: 1 }, collectionSources: { carrier: 'old-store' }, jobs: {} } } },
  store: { energy: 50 } };
const plan = { assignments: { carrier: 'collect' },
  collectionSources: { carrier: 'old-store' }, supplyTargets: {} };
const dispatch = require('./work.dispatch').createWorkDispatch({
  Game: { time: 100, getObjectById: () => target }, RESOURCE_ENERGY: 'energy' });
vm.runInNewContext(recoveryBlock, {
  creep: recoveringCarrier, demandLane: 'collect', demandPlan: plan,
  recoverBlockedWork, isOutpostBuilder: () => false,
  isExpansionBuilder: () => false, isBuilder: () => false,
  RESOURCE_ENERGY: 'energy', getRefillTarget: () => target,
  deliverRefill: () => { recoveringCarrier.memory.taskTarget = target.id; return true; },
  workDispatch: dispatch, Game: { time: 100, getObjectById: () => target },
  lanePriority: () => 4
});
assert.strictEqual(recoveringCarrier.memory.task, 'refill');
assert.strictEqual(recoveringCarrier.memory.workJob.targetId, target.id);
assert.strictEqual(recoveringCarrier.memory.workJob.lane, 'refill');
assert.strictEqual(recoveringCarrier.memory.waitState, undefined);
assert.strictEqual(plan.assignments.carrier, 'refill');
assert.strictEqual(plan.collectionSources.carrier, undefined);
assert.strictEqual(recoveringCarrier.room.memory.demandPlan.lanes.collect, 0);
assert.strictEqual(recoveringCarrier.room.memory.demandPlan.lanes.refill, 1);
console.log('main-loop recovery transfers ownership and updates the saved assignment');

// Reproduce the live split between an abstract source-area proposal and the
// concrete store admitted by pickup.jobs. Exercise the installed main blocks,
// not just the dispatcher in isolation.
const stores = {
  old: { id: 'old', store: { energy: 800 },
    pos: { getRangeTo: () => 30 } },
  next: { id: 'next', store: { energy: 900 },
    pos: { getRangeTo: () => 30 } }
};
const pickupGame = { time: 200, getObjectById: id => stores[id] || null };
const pickupDispatch = require('./work.dispatch').createWorkDispatch({
  Game: pickupGame, RESOURCE_ENERGY: 'energy' });
const courier = { name: 'courier', room: { name: 'W1N1', memory: {} },
  memory: { role: 'refiller' },
  store: { energy: 0, getFreeCapacity: () => 300 } };
const courierPlan = { assignments: { courier: 'collect' },
  collectionSources: { courier: 'next' }, demand: {} };
courier.room.memory.demandPlan = { collectionSources: {}, jobs: {},
  commitments: {} };
pickupDispatch.reconcile([courier], { courier: {
  lane: 'collect', sourceId: 'old', priority: 6 } });
const tripId = courier.memory.workJob.id;
const proposalStart = main.indexOf('  for (const creep of creeps) {',
  main.indexOf('  const lanePriority ='));
const proposalBlock = main.slice(proposalStart,
  main.indexOf('  const ownedWorkJobs =', proposalStart));
const pickupBindingStart = main.indexOf('  for (const creep of pickupParticipants) {');
const pickupBindingBlock = main.slice(pickupBindingStart,
  main.indexOf('  for(const room of Object.values(Game.rooms)', pickupBindingStart));
assert(pickupBindingStart >= 0, 'the main loop must bind admitted pickups');
for (let tick = 201; tick <= 205; tick++) {
  pickupGame.time = tick;
  const proposals = {};
  vm.runInNewContext(proposalBlock, {
    creeps: [courier], roomDemandPlans: { W1N1: courierPlan },
    Game: pickupGame, RESOURCE_ENERGY: 'energy', workProposals: proposals,
    workDispatch: pickupDispatch, lanePriority: () => 6
  });
  assert.strictEqual(proposals.courier.cancelCurrent, false,
    'another source thirty tiles away must not cancel a useful pickup');
  pickupDispatch.reconcile([courier], proposals);
  assert.strictEqual(courier.memory.workJob.id, tripId);
  vm.runInNewContext(pickupBindingBlock, {
    pickupParticipants: [courier], workDispatch: pickupDispatch,
    pickupPlan: { jobs: { courier: { targetId: 'old', amount: 75 } } },
    roomDemandPlans: { W1N1: courierPlan }
  });
  assert.strictEqual(courier.memory.workJob.sourceId, 'old');
  assert.strictEqual(courier.memory.dispatchCommitment.targetId, 'old');
  assert.strictEqual(courier.memory.workJob.amount, 75);
  assert.strictEqual(courierPlan.collectionSources.courier, 'old');
  assert.strictEqual(courier.room.memory.demandPlan.jobs.courier.sourceId, 'old');
  courierPlan.collectionSources.courier = 'next';
}
assert.strictEqual(courier.memory.dispatchCommitment.since, 201);
stores.old.store.energy = 0;
pickupGame.time++;
pickupDispatch.reconcile([courier], { courier: {
  lane: 'collect', sourceId: 'next', priority: 6 } });
assert.notStrictEqual(courier.memory.workJob.id, tripId,
  'exhaustion releases the old trip without a timer');
assert.strictEqual(courier.memory.workJob.sourceId, 'next');
assert.strictEqual(pickupDispatch.bindPickup(courier, undefined), null,
  'no admission must not invent a pickup');

// The actual continuation must withdraw only the allocator's admitted amount
// and preserve cargo origin, including refiller pickups from a reserve buffer.
stores.old.store.energy = 800;
pickupDispatch.bindPickup(courier, { targetId: 'old', amount: 75 });
const withdrawals = [];
courier.withdraw = (...args) => { withdrawals.push(args); return 0; };
const continuationStart = main.indexOf('    const continueDispatchCommitment =');
const continuation = main.slice(continuationStart,
  main.indexOf('    const scavenge =', continuationStart));
const success = vm.runInNewContext(continuation + '\ncontinueDispatchCommitment()', {
  creep: courier, demandLane: 'collect', Game: pickupGame,
  RESOURCE_ENERGY: 'energy', getRoomSources: () => [],
  managedPickup: true, pickupJob: { targetId: 'old', amount: 75 },
  canWithdrawFrom: () => true, reserveEnergyFrom: () => 75,
  rememberDispatchCommitment: () => {}, OK: 0, ERR_NOT_IN_RANGE: -9
});
assert.strictEqual(success, true);
assert.deepStrictEqual(withdrawals[0], [stores.old, 'energy', 75]);
assert.deepStrictEqual(Array.from(courier.memory.energySources), ['old']);
console.log('collection ownership survives pressure changes and binds admitted quantities before execution');

