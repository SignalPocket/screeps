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
