'use strict';

// Matches loaded carriers to spawn/extension/tower capacity as a room-wide job.
// Persistent valid trips are retained first; remaining carriers are matched by
// structure priority and distance while accounting for each carrier's load.
const planRefillTargets = ({ rooms, creeps, roomDemandPlans, Game,
  RESOURCE_ENERGY, FIND_MY_STRUCTURES, STRUCTURE_SPAWN,
  STRUCTURE_EXTENSION, STRUCTURE_TOWER, isRefillTargetFor,
  getRefillPriority }) => {
  const planned = {};
  for (const room of rooms) {
    const demandPlan = roomDemandPlans[room.name];
    if (!demandPlan) continue;
    const carriers = creeps.filter(creep =>
      creep.room.name === room.name &&
      demandPlan.assignments[creep.name] === 'refill' &&
      creep.store[RESOURCE_ENERGY] > 0);
    const targets = room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        (structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_EXTENSION ||
          structure.structureType === STRUCTURE_TOWER) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    const remaining = Object.fromEntries(targets.map(target => [target.id,
      target.store.getFreeCapacity(RESOURCE_ENERGY)]));
    const assigned = new Set();

    for (const carrier of carriers) {
      const target = Game.getObjectById(carrier.memory.refillTarget);
      const targetPriority = target
        ? getRefillPriority(room, target) : Infinity;
      const carrierHigherPriorityNeed = targets.some(candidate =>
        getRefillPriority(room, candidate) < targetPriority &&
        remaining[candidate.id] > 0 &&
        isRefillTargetFor(carrier, candidate));
      const isRefilling = carrier.memory.task === 'refill' ||
        carrier.memory.role === 'remote-hauler' &&
          carrier.memory.task === 'remote-haul';
      const validTarget = target && remaining[target.id] > 0 &&
        isRefillTargetFor(carrier, target) &&
        !carrierHigherPriorityNeed;
      if (!validTarget) delete carrier.memory.refillTarget;
      if (!isRefilling || !validTarget) continue;
      planned[carrier.name] = target.id;
      remaining[target.id] -= Math.min(carrier.store[RESOURCE_ENERGY],
        remaining[target.id]);
      assigned.add(carrier.name);
    }

    const pairs = [];
    for (const carrier of carriers) {
      if (assigned.has(carrier.name)) continue;
      for (const target of targets) {
        if (!isRefillTargetFor(carrier, target)) continue;
        pairs.push({
          carrier,
          target,
          priority: getRefillPriority(room, target),
          distance: carrier.pos.getRangeTo(target)
        });
      }
    }
    pairs.sort((a, b) => a.priority - b.priority ||
      a.distance - b.distance ||
      a.carrier.name.localeCompare(b.carrier.name));
    for (const pair of pairs) {
      if (assigned.has(pair.carrier.name) ||
          remaining[pair.target.id] <= 0) continue;
      planned[pair.carrier.name] = pair.target.id;
      remaining[pair.target.id] -= Math.min(
        pair.carrier.store[RESOURCE_ENERGY], remaining[pair.target.id]);
      assigned.add(pair.carrier.name);
    }
  }
  return planned;
};

module.exports = { planRefillTargets };
