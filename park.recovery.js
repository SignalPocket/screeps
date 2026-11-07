'use strict';

// The baseline staffing authority always requires a spawn filler. A physical
// extension-clump target of zero must not release that owner every spawn tick.
const refillRetentionSituation = situation => ({
  ...situation,
  targets: { ...situation.targets,
    refiller: Math.max(1, situation.targets.refiller || 0) }
});

const recoverSpawnFiller = ({ room, workers, viable, energy = 'energy' }) => {
  const local = creep => creep.memory.home === room.name &&
    creep.room?.name === room.name && !creep.memory.staffingRetire;
  if (workers.some(creep => local(creep) &&
      creep.memory.role === 'refiller' && (creep.spawning || viable(creep)))) {
    return null;
  }
  // Reuse local flexible capacity before buying another body. Remote trips,
  // numbered relays, retirees and WORK bodies keep their separate authorities.
  const candidate = workers.filter(creep => local(creep) && !creep.spawning &&
    creep.memory.role === 'hauler' && !creep.memory.assignmentKind &&
    !creep.memory.remoteRoom && !creep.memory.remoteHome &&
    !Number.isInteger(creep.memory.controllerRelaySlot) &&
    !Number.isInteger(creep.memory.controllerRelaySubstituteSlot) &&
    creep.getActiveBodyparts('work') === 0 &&
    creep.getActiveBodyparts('carry') > 0 &&
    creep.getActiveBodyparts('move') > 0 && viable(creep))
    .sort((a, b) => (b.store[energy] || 0) - (a.store[energy] || 0) ||
      b.store.getCapacity(energy) - a.store.getCapacity(energy) ||
      b.ticksToLive - a.ticksToLive || a.name.localeCompare(b.name))[0];
  if (!candidate) return null;
  candidate.memory.role = 'refiller';
  // Reconciliation clears incompatible jobs; birth identity remains historical.
  for (const key of ['workJob', 'dispatchCommitment', 'demandLane',
    'collectionSourceTarget', 'task', 'taskTarget', 'waitState', 'waitReason',
    'waitAge', 'idleNow', 'conservationX', 'conservationY']) {
    delete candidate.memory[key];
  }
  return candidate.name;
};

module.exports = { refillRetentionSituation, recoverSpawnFiller };
