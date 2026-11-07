'use strict';

const assert = require('assert');
const { planRemoteRecovery } = require('./remote.recovery');

const worker = (name, role = 'worker', work = 1, extra = {}) => ({
  name, work, carry: extra.carry || 0, viable: true,
  memory: { role, ...extra }
});
const plans = [{
  team: 'left', survey: {
    targetRoom: 'W2N1', remoteMinerTarget: 2,
    remoteHaulerTarget: 2,
    remoteBuilderTarget: 2,
    remoteWorkNeeds: [
      { slot: 0, minMiners: 1, requiredWork: 2 },
      { slot: 1, minMiners: 1, requiredWork: 2 }
    ]
  }
}];
const dependencies = {
  plans, workers: [],
  surplus: [worker('a'), worker('b'), worker('c'), worker('d')],
  getWork: candidate => candidate.work,
  isRemoteViable: candidate => candidate.viable,
  isOutpostBuilder: candidate =>
    candidate.memory.builderScope === 'outpost',
  getRemoteBuilderTarget: () => 2
};

const paused = planRemoteRecovery({
  ...dependencies, minerBudget: 0, builderBudget: 0
});
assert.strictEqual(paused.assignments.length, 0);
assert.strictEqual(paused.remainingSurplus.length, 4);

const minimums = planRemoteRecovery({
  ...dependencies, minerBudget: 2, builderBudget: 1
});
assert.deepStrictEqual(minimums.assignments.map(assignment => ({
  kind: assignment.kind,
  worker: assignment.worker.name,
  slot: assignment.kind === 'miner'
    ? assignment.need.slot : assignment.slot
})), [
  { kind: 'miner', worker: 'a', slot: 0 },
  { kind: 'miner', worker: 'b', slot: 1 },
  { kind: 'builder', worker: 'c', slot: 0 }
]);
assert.deepStrictEqual(minimums.remainingSurplus.map(item => item.name), ['d']);

const existing = [
  worker('miner', 'remote-miner', 2,
    { remoteRoom: 'W2N1', remoteSlot: 0 }),
  worker('builder', 'builder', 1,
    { builderScope: 'outpost', remoteRoom: 'W2N1', remoteBuilderSlot: 0 })
];
const bounded = planRemoteRecovery({
  ...dependencies, workers: existing,
  minerBudget: 2, builderBudget: 1
});
assert.deepStrictEqual(bounded.assignments.map(assignment => ({
  kind: assignment.kind,
  slot: assignment.kind === 'miner'
    ? assignment.need.slot : assignment.slot
})), [{ kind: 'miner', slot: 1 }]);
assert.strictEqual(bounded.remainingSurplus.length, 3);

const carrierRecovery = planRemoteRecovery({
  ...dependencies,
  workers: [worker('existing-hauler', 'remote-hauler', 0,
    { remoteRoom: 'W2N1', remoteHaulerSlot: 0, carry: 4 })],
  surplus: [worker('small', 'worker', 1, { carry: 1 }),
    worker('carrier', 'hauler', 0, { carry: 4 })],
  minerBudget: 0, haulerBudget: 2, builderBudget: 0,
  getCarry: candidate => candidate.carry
});
assert.deepStrictEqual(carrierRecovery.assignments.map(assignment => ({
  kind: assignment.kind, worker: assignment.worker.name,
  room: assignment.entry.survey.targetRoom, slot: assignment.slot
})), [{ kind: 'hauler', worker: 'carrier', room: 'W2N1', slot: 1 }]);
assert.deepStrictEqual(carrierRecovery.remainingSurplus.map(item => item.name),
  ['small']);

console.log('remote recovery scenarios passed');

const maintenancePlans=[{team:'left',survey:{targetRoom:'A',remoteBuilderTarget:2}},
 {team:'southwest',survey:{targetRoom:'B',remoteBuilderTarget:2}}];
const maintainers=[worker('extra-a','builder',2,{builderScope:'outpost',remoteRoom:'A',remoteBuilderSlot:0}),
 worker('extra-b','builder',2,{builderScope:'outpost',remoteRoom:'A',remoteBuilderSlot:1})];
const rebalanceOptions={...dependencies,plans:maintenancePlans,workers:maintainers,
 surplus:[],minerBudget:0,builderBudget:2};
const rebalance=planRemoteRecovery(rebalanceOptions);
assert.strictEqual(rebalance.assignments.length,1);
assert.strictEqual(rebalance.assignments[0].entry.survey.targetRoom,'B');
assert.strictEqual(rebalance.builderCount,2);
rebalance.assignments[0].worker.memory.remoteRoom='B';
rebalance.assignments[0].worker.memory.remoteBuilderSlot=0;
assert.strictEqual(planRemoteRecovery(rebalanceOptions).assignments.length,0);
assert.strictEqual(planRemoteRecovery({...rebalanceOptions,builderBudget:0}).assignments.length,0);
const spareCarrier=worker('real-spare-carrier','hauler',0,{carry:7});
const spareReuse=planRemoteRecovery({...dependencies,workers:[],surplus:[],
 haulerSurplus:[spareCarrier],minerBudget:4,haulerBudget:1,builderBudget:2,
 getCarry:c=>c.carry});
assert.strictEqual(spareReuse.assignments.length,1);
assert.strictEqual(spareReuse.assignments[0].kind,'hauler');
assert.strictEqual(spareReuse.assignments[0].worker,spareCarrier);
const noWrongRole=planRemoteRecovery({...dependencies,workers:[],surplus:[],
 haulerSurplus:[spareCarrier],minerBudget:4,haulerBudget:0,builderBudget:2,
 getCarry:c=>c.carry});
assert.strictEqual(noWrongRole.assignments.length,0,'a spare cargo body is never promoted into WORK');
console.log('compatible surplus carriers are reused without consuming builder/miner candidates');
