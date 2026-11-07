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

const selectSupplyRecipient = ({ carrier, recipients, remaining,
  assignments }) => recipients.filter(worker => remaining[worker.name] > 0)
  .sort((a, b) => {
    const priority = worker => assignments[worker.name] === 'build' ? 0
      : assignments[worker.name] === 'repair' ? 1
      : worker.memory.role === 'worker' ? 2
      : worker.memory.role === 'upgrader' ? 3 : 4;
    return priority(a) - priority(b) ||
      carrier.pos.getRangeTo(a) - carrier.pos.getRangeTo(b) ||
      a.name.localeCompare(b.name);
  })[0] || null;

const selectParkingCandidates = ({ terrain, sources, protectedRoads,
  occupied, plannedExtensions, spawn, storage, controller, wallMask }) => {
  const anchors = [spawn?.pos, storage?.pos].filter(Boolean);
  const near = [];
  const fallback = [];
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      const key = `${x}:${y}`;
      if (terrain.get(x, y) === wallMask ||
          controller && controller.pos.getRangeTo(x, y) <= 6 ||
          sources.some(source => source.pos.getRangeTo(x, y) <= 4) ||
          protectedRoads.has(key) || occupied.has(key) ||
          plannedExtensions.has(key) ||
          spawn && spawn.pos.getRangeTo(x, y) <= 2 ||
          storage && storage.pos.getRangeTo(x, y) <= 2) continue;
      const candidate = { x, y };
      if (anchors.some(anchor => anchor.getRangeTo(x, y) <= 7)) {
        near.push(candidate);
      } else {
        fallback.push(candidate);
      }
    }
  }
  return near.concat(fallback);
};

module.exports = { refillRetentionSituation, recoverSpawnFiller,
  selectSupplyRecipient, selectParkingCandidates };
