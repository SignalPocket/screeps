'use strict';

const inferAssignmentKind = memory => {
  if (!memory) return null;
  if (memory.assignmentKind) return memory.assignmentKind;
  const originalRole = memory.birthRole || memory.assignmentRole || memory.role;
  if (memory.expansionTarget && originalRole === 'claimer') {
    return 'expansion-claim';
  }
  if (memory.expansionTarget && originalRole === 'builder' &&
      memory.builderScope === 'expansion') return 'expansion-bootstrap';
  if (Number.isInteger(memory.controllerRelaySlot)) return 'controller-relay';
  if (memory.remoteRoom &&
      ['remote-miner', 'remote-hauler', 'remote-reserver'].includes(
        originalRole)) return originalRole;
  if (memory.remoteRoom && originalRole === 'builder' &&
      memory.builderScope === 'outpost') return 'outpost-builder';
  return null;
};

const protectedRoleFor = memory => {
  const kind = inferAssignmentKind(memory);
  if (kind === 'expansion-claim') return 'claimer';
  if (kind === 'expansion-bootstrap' || kind === 'outpost-builder') {
    return 'builder';
  }
  if (kind === 'controller-relay') return 'controller-relay';
  if (['remote-miner', 'remote-hauler', 'remote-reserver'].includes(kind)) {
    return kind;
  }
  return null;
};

const isProtectedAssignment = memory => Boolean(protectedRoleFor(memory));

const enforceAssignmentContract = creep => {
  if (!creep || !creep.memory) return false;
  const memory = creep.memory;
  const kind = inferAssignmentKind(memory);
  const role = protectedRoleFor(memory);
  if (!kind || !role) return false;
  const changed = memory.role !== role || memory.assignmentRole !== role ||
    memory.assignmentKind !== kind;
  memory.role = role;
  memory.assignmentRole = role;
  memory.assignmentKind = kind;
  if (kind === 'expansion-bootstrap') {
    memory.builderScope = 'expansion';
    memory.builderMission = 'bootstrap';
  } else if (kind === 'outpost-builder') {
    memory.builderScope = 'outpost';
  }
  return changed;
};

const contractForSpawnAssignment = assignment => {
  if (!assignment) return {};
  const memory = { ...assignment, assignmentRole: assignment.role,
    birthRole: assignment.role };
  const assignmentKind = inferAssignmentKind(memory);
  return {
    assignmentRole: assignment.role,
    assignmentKind: assignmentKind || undefined
  };
};

module.exports = { inferAssignmentKind, protectedRoleFor,
  isProtectedAssignment, enforceAssignmentContract,
  contractForSpawnAssignment };
