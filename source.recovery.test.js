'use strict';

const assert = require('assert');
const { planSourceRecovery } = require('./source.recovery');

const source = { id: 'source-1' };
const worker = (name, work, memory = {}) => ({
  name, work, ticksToLive: 1000, memory
});
const stable = worker('stable', 2,
  { role: 'harvester', preferredSource: source.id });
const rebalancer = worker('balancer', 1,
  { role: 'rebalancer', rebalancerSource: source.id });
const retained = worker('recovery', 1,
  { role: 'harvester', sourceReserve: source.id });
const firstSurplus = worker('builder-a', 1, { role: 'builder' });
const secondSurplus = worker('builder-b', 1, { role: 'builder' });
const options = {
  sources: [source],
  workers: [stable, rebalancer, retained],
  surplus: [firstSurplus, secondSurplus],
  requiredWork: () => 5,
  getWork: candidate => candidate.work,
  isViable: () => true
};
const firstPlan = planSourceRecovery(options);
assert.deepStrictEqual(firstPlan.plans[0].retained.map(item => item.name),
  ['recovery']);
assert.deepStrictEqual(firstPlan.plans[0].promoted.map(item => item.name),
  ['builder-a']);
assert.deepStrictEqual(firstPlan.remainingSurplus.map(item => item.name),
  ['builder-b']);
assert.strictEqual(firstPlan.plans[0].assignedWork, 5);

firstSurplus.memory = { role: 'harvester', sourceReserve: source.id };
const stablePlan = planSourceRecovery({
  ...options,
  workers: [stable, rebalancer, retained, firstSurplus],
  surplus: [secondSurplus]
});
assert.strictEqual(stablePlan.plans[0].promoted.length, 0);
assert.strictEqual(stablePlan.remainingSurplus[0].name, 'builder-b');

const releasePlan = planSourceRecovery({
  ...options,
  workers: [worker('strong', 5,
    { role: 'harvester', preferredSource: source.id }), retained],
  surplus: []
});
assert.deepStrictEqual(releasePlan.plans[0].released.map(item => item.name),
  ['recovery']);

const sourceTwo = { id: 'source-2' };
const groupPlan = planSourceRecovery({
  sources: [source, sourceTwo], workers: [],
  surplus: [firstSurplus, secondSurplus],
  requiredWork: () => 1,
  getWork: candidate => candidate.work,
  isViable: () => true
});
assert.deepStrictEqual(groupPlan.plans.map(plan => ({
  source: plan.source.id,
  promoted: plan.promoted.map(candidate => candidate.name)
})), [
  { source: 'source-1', promoted: ['builder-a'] },
  { source: 'source-2', promoted: ['builder-b'] }
]);
assert.strictEqual(groupPlan.remainingSurplus.length, 0);

const stationLimited = planSourceRecovery({
  ...options,
  workers: [stable],
  surplus: [firstSurplus, secondSurplus],
  maxWorkers: () => 1
});
assert.strictEqual(stationLimited.plans[0].promoted.length, 0);
assert.strictEqual(stationLimited.remainingSurplus.length, 2);

console.log('source recovery scenarios passed');
