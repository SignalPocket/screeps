'use strict';
const assert = require('assert');
const { inferAssignmentKind, isProtectedAssignment,
  enforceAssignmentContract, contractForSpawnAssignment } =
  require('./assignment.contract');

const contract = contractForSpawnAssignment({
  role: 'claimer', expansionTarget: 'W8N4'
});
assert.deepStrictEqual(contract, {
  assignmentRole: 'claimer', assignmentKind: 'expansion-claim'
});
const relabeled = { memory: {
  role: 'builder', birthRole: 'claimer', assignmentRole: 'builder',
  expansionTarget: 'W8N4', builderScope: 'local'
} };
assert.strictEqual(inferAssignmentKind(relabeled.memory), 'expansion-claim');
assert.strictEqual(isProtectedAssignment(relabeled.memory), true);
assert.strictEqual(enforceAssignmentContract(relabeled), true);
assert.strictEqual(relabeled.memory.role, 'claimer');
assert.strictEqual(relabeled.memory.assignmentRole, 'claimer');
assert.strictEqual(relabeled.memory.assignmentKind, 'expansion-claim');

const flexible = { memory: { role: 'worker', birthRole: 'worker' } };
assert.strictEqual(isProtectedAssignment(flexible.memory), false);
assert.strictEqual(enforceAssignmentContract(flexible), false);

assert.deepStrictEqual(contractForSpawnAssignment({
  role: 'remote-hauler', remoteRoom: 'W7N3'
}), { assignmentRole: 'remote-hauler', assignmentKind: 'remote-hauler' });

const released = { memory: { role: 'retire', birthRole: 'claimer',
  assignmentRole: 'retire', staffingRetire: true } };
assert.strictEqual(enforceAssignmentContract(released), false,
  'a spent claimer without an expansion target is released from the contract');

console.log('durable spawn and workforce assignment contract passed');

// Exercise the real completion path followed by the same reconciler used by
// main. The old test stopped before reconciliation resurrected every relay.
const { retireCompletedPush } = require('./colony.operations');
const { reconcileCreepAssignment } = require('./creep.assignment');
const relay = { memory: { home: 'W7N4', role: 'controller-relay',
  birthRole: 'controller-relay', assignmentRole: 'controller-relay',
  assignmentKind: 'controller-relay', controllerRelaySlot: 0 } };
const game = { time: 100, gcl: { level: 2 },
  rooms: { W7N4: { name: 'W7N4', memory: {},
    controller: { my: true } } }, creeps: { relay } };
for (let tick = 100; tick < 103; tick++) {
  game.time = tick;
  retireCompletedPush(game);
  reconcileCreepAssignment(relay);
  assert.strictEqual(relay.memory.role, 'retire');
  assert.strictEqual(relay.memory.assignmentRole, 'retire');
  assert.strictEqual(relay.memory.assignmentKind, undefined);
  assert.strictEqual(relay.memory.staffingRetire, true);
  assert.strictEqual(relay.memory.birthRole, 'controller-relay');
}
const surplus = { memory: { role: 'hauler', birthRole: 'controller-relay',
  assignmentRole: 'controller-relay', assignmentKind: 'controller-relay' } };
reconcileCreepAssignment(surplus);
assert.strictEqual(surplus.memory.role, 'hauler');
assert.strictEqual(surplus.memory.assignmentKind, undefined);
const active = { memory: { role: 'hauler', birthRole: 'controller-relay',
  assignmentKind: 'controller-relay', controllerRelaySlot: 0 } };
reconcileCreepAssignment(active);
assert.strictEqual(active.memory.role, 'controller-relay',
  'slot zero remains a protected live assignment');
console.log('released relay contracts stay released across completion and reconciliation');
