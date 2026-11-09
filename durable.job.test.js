'use strict';

const assert = require('assert');
const { validateWorkJob, readDurableJob, evaluateDurableJob } =
  require('./durable.job');

const canonical = {
  roomName: 'W7N4', lane: 'repair', sourceId: 'storage',
  targetId: 'road', amount: 150, priority: 4,
  reason: 'retained repair assignment'
};
const memory = { workJob: { ...canonical } };
const before = JSON.stringify(memory);
const read = readDurableJob(memory);
assert.deepStrictEqual(read, { job: {
  authority: 'workJob', lane: 'repair', roomName: 'W7N4',
  sourceId: 'storage', targetId: 'road', amount: 150, priority: 4,
  reason: 'retained repair assignment', place: 'road',
  releaseKeys: ['workJob']
}, invalidReason: null });
assert.strictEqual(JSON.stringify(memory), before,
  'reading the contract never mutates canonical memory');

const specialistMemory = {
  role: 'builder', builderScope: 'outpost', remoteRoom: 'W7N3',
  repairWorkTarget: 'remote-road', repairSupplyTarget: 'remote-container'
};
const specialist = readDurableJob(specialistMemory);
assert.strictEqual(specialist.job.authority, 'repairWorkTarget');
assert.strictEqual(specialist.job.roomName, 'W7N3');
assert.strictEqual(specialist.job.targetId, 'remote-road');
assert.strictEqual(specialist.job.sourceId, 'remote-container');
assert.deepStrictEqual(specialist.job.releaseKeys, ['repairWorkTarget']);

const conflict = readDurableJob({ workJob: { lane: 'repair' },
  remoteRoom: 'W8N3', repairWorkTarget: 'specialist-road' });
assert.strictEqual(conflict.invalidReason, 'workJob roomName is missing');
assert.strictEqual(conflict.job.authority, 'workJob',
  'a malformed canonical job cannot silently fall through to another owner');

for (const invalid of [
  null,
  { roomName: 'W7N4' },
  { lane: 'build' },
  { lane: 'build', roomName: 'W7N4', sourceId: 4 },
  { lane: 'build', roomName: 'W7N4', targetId: {} },
  { lane: 'build', roomName: 'W7N4', amount: -1 },
  { lane: 'build', roomName: 'W7N4', priority: NaN },
  { lane: 'build', roomName: 'W7N4', reason: false }
]) assert(validateWorkJob(invalid), 'invalid job shape is rejected');
assert.strictEqual(validateWorkJob({ lane: 'scout', roomName: 'W8N3',
  targetId: null, sourceId: null, amount: 0, priority: 10, reason: '' }), null);

for (const phase of ['traveling', 'loading', 'executing']) {
  const decision = evaluateDurableJob({ memory, observation: { phase,
    priorityChanged: true } });
  assert.strictEqual(decision.status, phase);
  assert.strictEqual(decision.retain, true);
  assert.strictEqual(decision.shouldRelease, false);
  assert.deepStrictEqual(decision.consumers, {
    protectFromRecycle: true, coversSpawnDemand: true,
    availableForPlanning: false
  });
}
const deferred = evaluateDurableJob({ memory,
  observation: { cpuDeferred: true, targetState: 'valid' } });
assert.strictEqual(deferred.status, 'cpu-deferred');
assert.strictEqual(deferred.telemetry.place, 'road');
assert.strictEqual(deferred.retain, true,
  'CPU deferral never revokes valid ownership');
const parked = evaluateDurableJob({ memory,
  observation: { policyParked: true } });
assert.strictEqual(parked.status, 'policy-parked');
assert.strictEqual(parked.consumers.protectFromRecycle, true,
  'parking alone is not an implicit release boundary');

const releases = [
  [{ complete: true }, 'complete', 'complete'],
  [{ targetState: 'missing' }, 'invalid', 'target-missing'],
  [{ targetState: 'invalid' }, 'invalid', 'target-invalid'],
  [{ routeState: 'unreachable', unreachableTicks: 5 },
    'invalid', 'unreachable'],
  [{ preempted: true }, 'released', 'survival-preempted'],
  [{ released: true }, 'released', 'policy-release']
];
for (const [observation, status, reason] of releases) {
  const decision = evaluateDurableJob({ memory, observation,
    unreachableLimit: 5 });
  assert.strictEqual(decision.status, status);
  assert.strictEqual(decision.releaseReason, reason);
  assert.strictEqual(decision.shouldRelease, true);
  assert.strictEqual(decision.consumers.protectFromRecycle, false);
  assert.strictEqual(decision.consumers.coversSpawnDemand, false);
  assert.strictEqual(decision.consumers.availableForPlanning, true);
}
assert.strictEqual(evaluateDurableJob({ memory, observation: {
  routeState: 'unreachable', unreachableTicks: 4
}, unreachableLimit: 5 }).retain, true,
'a transient route failure cannot release durable ownership');
const releasedOnce = evaluateDurableJob({ memory,
  observation: { complete: true } });
assert.strictEqual(releasedOnce.shouldRelease, true);
const afterClear = evaluateDurableJob({ memory: {} });
assert.strictEqual(afterClear.shouldRelease, false,
  'after the caller clears the named authority there is no second release');

const laneRooms = [
  ['build', 'W8N4'], ['supply', 'W7N4'], ['upgrade', 'W7N4'],
  ['haul', 'W7N3'], ['defend', 'W8N3'], ['claim', 'W8N4'],
  ['reserve', 'W7N3'], ['scout', 'W8N3']
];
for (const [lane, roomName] of laneRooms) {
  const decision = evaluateDurableJob({ memory: { workJob: {
    lane, roomName, targetId: null, sourceId: null, amount: 0,
    priority: 10, reason: 'contract boundary fixture'
  } }, observation: { atTarget: false } });
  assert.strictEqual(decision.status, 'traveling');
  assert.strictEqual(decision.job.place, roomName,
    `${lane} uses its room as the target place when no object is assigned`);
}

assert.deepStrictEqual(evaluateDurableJob().telemetry, {
  authority: null, lane: null, roomName: null, sourceId: null,
  targetId: null, place: null, state: 'unassigned'
});
console.log('canonical durable job validation, retention, release and consumer states passed');
