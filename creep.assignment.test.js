'use strict';

const assert = require('assert');
const { reconcileCreepAssignment } = require('./creep.assignment');

const promoted = { memory: {
  role: 'upgrader', assignmentRole: 'builder', bodyType: 'controller',
  builderScope: 'local', builderMission: 'flexible',
  preferredSource: 's1', sourceReplacement: 's1', sourceReserve: 's1',
  task: 'build', taskTarget: 'site', workJob: { lane: 'build' },
  remoteRoom: 'W1N2', remoteSlot: 0, leftScoutSlot: 0
} };
assert.strictEqual(reconcileCreepAssignment(promoted), true);
assert.strictEqual(promoted.memory.assignmentRole, 'upgrader');
assert.strictEqual(promoted.memory.sourceReserve, undefined);
assert.strictEqual(promoted.memory.builderScope, undefined);
assert.strictEqual(promoted.memory.remoteRoom, undefined);
assert.strictEqual(promoted.memory.task, undefined);

const remoteMiner = { memory: {
  role: 'remote-scout', assignmentRole: 'remote-scout',
  remoteHome: 'W1N1', remoteRoom: 'W1N2', remoteTeam: 'left',
  remoteSlot: 1, remoteHaulerSlot: 1, remoteBuilderSlot: 1
} };
assert.strictEqual(reconcileCreepAssignment(remoteMiner), false);
assert.strictEqual(remoteMiner.memory.remoteRoom, 'W1N2');
assert.strictEqual(remoteMiner.memory.remoteSlot, 1);
assert.strictEqual(remoteMiner.memory.remoteHaulerSlot, undefined);
assert.strictEqual(remoteMiner.memory.remoteBuilderSlot, undefined);

const sourceWorker = { memory: {
  role: 'harvester', assignmentRole: 'harvester',
  sourceReserve: 's1', preferredSource: 's1', sourceRecoveryPlanTick: 42
} };
reconcileCreepAssignment(sourceWorker);
assert.strictEqual(sourceWorker.memory.sourceReserve, 's1');
assert.strictEqual(sourceWorker.memory.sourceRecoveryPlanTick, 42);

sourceWorker.memory.role = 'builder';
reconcileCreepAssignment(sourceWorker);
assert.strictEqual(sourceWorker.memory.sourceRecoveryPlanTick, undefined);

console.log('creep assignment scenarios passed');
