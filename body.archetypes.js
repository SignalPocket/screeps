'use strict';

const BODY_TYPES = Object.freeze({
  MINER: 'miner',
  HAULER: 'hauler',
  CONTROLLER: 'controller',
  WORKER: 'worker',
  FIELD: 'field',
  CLAIMER: 'claimer'
});

// Carrier was the old name for the pure transport family. Keep accepting it
// from living-creep memory while folding every transport body into HAULER.
const normalizeBodyType = bodyType => bodyType === 'carrier'
  ? BODY_TYPES.HAULER : bodyType;

const getBodyTypeForAssignment = assignment => {
  if (!assignment) return null;
  if (assignment.bodyType) return normalizeBodyType(assignment.bodyType);
  if (assignment.role === 'claimer') return BODY_TYPES.CLAIMER;
  if (assignment.role === 'remote-scout') return BODY_TYPES.FIELD;
  if (assignment.role === 'remote-hauler' ||
      assignment.role === 'refiller' ||
      assignment.role === 'controller-relay') return BODY_TYPES.HAULER;
  if (assignment.role === 'hauler' ||
      assignment.role === 'rebalancer') return BODY_TYPES.HAULER;
  if (assignment.role === 'miner' ||
      assignment.role === 'harvester') return BODY_TYPES.MINER;
  if (assignment.role === 'upgrader') return BODY_TYPES.CONTROLLER;
  if (assignment.role === 'builder' ||
      assignment.role === 'worker') return BODY_TYPES.WORKER;
  return null;
};

const inferBodyType = (creep, constants) => {
  if (!creep) return null;
  if (creep.memory && creep.memory.bodyType) {
    return normalizeBodyType(creep.memory.bodyType);
  }
  const memory = creep.memory || {};
  const fromIdentity = getBodyTypeForAssignment({
    role: memory.birthRole || memory.role,
    builderScope: memory.builderScope
  });
  if (fromIdentity) return fromIdentity;
  const count = type => typeof creep.getActiveBodyparts === 'function'
    ? creep.getActiveBodyparts(type)
    : (creep.body || []).filter(part =>
      (typeof part === 'string' ? part : part.type) === type).length;
  const work = count(constants.WORK);
  const carry = count(constants.CARRY);
  const claim = count(constants.CLAIM);
  if (claim > 0) return BODY_TYPES.CLAIMER;
  if (work === 0 && carry > 0) return BODY_TYPES.HAULER;
  if (carry >= Math.max(2, work * 2)) return BODY_TYPES.HAULER;
  return BODY_TYPES.WORKER;
};

const reconcileBodyTypes = (creeps, constants) => {
  for (const creep of creeps || []) {
    const bodyType = inferBodyType(creep, constants);
    if (bodyType && creep.memory.bodyType !== bodyType) {
      creep.memory.bodyType = bodyType;
    }
  }
};

const deriveBodyTargets = demand => {
  const target = (min, desired, max = desired) => ({
    min: Math.max(0, min || 0),
    desired: Math.max(min || 0, desired || 0),
    max: Math.max(desired || 0, max || 0)
  });
  return {
    [BODY_TYPES.MINER]: target(demand.localMinerMin,
      demand.localMinerDesired),
    [BODY_TYPES.HAULER]: target(
      (demand.refillerMin || 0) + (demand.remoteCarrierMin || 0) +
        (demand.haulerMin || 0) + (demand.rebalancerMin || 0),
      (demand.refillerDesired || 0) +
        (demand.remoteCarrierDesired || 0) +
        (demand.haulerDesired || 0) + (demand.rebalancerDesired || 0)),
    [BODY_TYPES.CONTROLLER]: target(demand.upgraderMin,
      demand.upgraderDesired),
    [BODY_TYPES.WORKER]: target(
      (demand.builderMin || 0) + (demand.repairMin || 0) +
        (demand.tunnelMin || 0) + (demand.remoteBuilderMin || 0),
      (demand.builderDesired || 0) + (demand.repairDesired || 0) +
        (demand.tunnelDesired || 0) +
        (demand.remoteBuilderDesired || 0)),
    [BODY_TYPES.FIELD]: target(demand.remoteMinerMin,
      demand.remoteMinerDesired),
    [BODY_TYPES.CLAIMER]: target(demand.claimerMin,
      demand.claimerDesired)
  };
};

const buildBodyRoster = (creeps, targets, constants, isViable = () => true) => {
  const counts = {};
  const viable = {};
  for (const type of Object.values(BODY_TYPES)) {
    counts[type] = 0;
    viable[type] = 0;
  }
  for (const creep of creeps || []) {
    const type = inferBodyType(creep, constants);
    if (!type) continue;
    counts[type] = (counts[type] || 0) + 1;
    if (isViable(creep)) viable[type] = (viable[type] || 0) + 1;
  }
  const shortages = Object.entries(targets || {}).map(([type, staffing]) => ({
    type,
    count: viable[type] || 0,
    min: staffing.min,
    desired: staffing.desired,
    max: staffing.max,
    minimumCoverage: staffing.min > 0
      ? (viable[type] || 0) / staffing.min : 1,
    desiredCoverage: staffing.desired > 0
      ? (viable[type] || 0) / staffing.desired : 1
  })).sort((a, b) =>
    Number(a.count >= a.min) - Number(b.count >= b.min) ||
    a.minimumCoverage - b.minimumCoverage ||
    (b.min - b.count) - (a.min - a.count) ||
    a.desiredCoverage - b.desiredCoverage || a.type.localeCompare(b.type));
  return { counts, viable, targets, shortages };
};

const canBodyTypeRunLane = (bodyType, lane) => {
  if (['build', 'repair'].includes(lane)) {
    return bodyType === BODY_TYPES.WORKER;
  }
  if (lane === 'upgrade') {
    return bodyType === BODY_TYPES.CONTROLLER ||
      bodyType === BODY_TYPES.WORKER;
  }
  if (['collect', 'refill', 'refill-buffer', 'buffer', 'storage',
    'supply'].includes(lane)) {
    return normalizeBodyType(bodyType) === BODY_TYPES.HAULER;
  }
  return true;
};

module.exports = {
  BODY_TYPES,
  getBodyTypeForAssignment,
  inferBodyType,
  reconcileBodyTypes,
  deriveBodyTargets,
  buildBodyRoster,
  canBodyTypeRunLane
};
