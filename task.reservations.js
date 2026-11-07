'use strict';

// Owns per-tick task claims so every dispatcher path follows the same rules.
// Callers provide the few targets that intentionally allow shared work.
const createTaskReservations = ({ Game, isSharedTarget = () => false,
  getSharedTargetLimit = () => Infinity }) => {
  const createBuckets = names => Object.fromEntries(
    names.map(name => [name, {}]));

  const sharedOwners = (bucket, target) => Array.isArray(bucket[target.id])
    ? bucket[target.id] : [];
  const isAvailable = (bucket, target, creepName) => Boolean(target) &&
    (isSharedTarget(target)
      ? sharedOwners(bucket, target).includes(creepName) ||
        sharedOwners(bucket, target).length <
          Math.max(1, getSharedTargetLimit(target) || 1)
      : !bucket[target.id] || bucket[target.id] === creepName);

  const claim = (bucket, target, creepName) => {
    if (!isAvailable(bucket, target, creepName)) return false;
    if (isSharedTarget(target)) {
      const owners = sharedOwners(bucket, target);
      if (!owners.includes(creepName)) owners.push(creepName);
      bucket[target.id] = owners;
    } else bucket[target.id] = creepName;
    return true;
  };

  const release = (bucket, target, creepName) => {
    if (!target) return;
    if (isSharedTarget(target)) {
      const owners = sharedOwners(bucket, target)
        .filter(owner => owner !== creepName);
      if (owners.length) bucket[target.id] = owners;
      else delete bucket[target.id];
    } else if (bucket[target.id] === creepName) delete bucket[target.id];
  };

  const retain = (creep, taskNames, memoryKey, valid) => {
    const allowedTasks = Array.isArray(taskNames) ? taskNames : [taskNames];
    const target = Game.getObjectById(creep.memory[memoryKey]);
    if (!allowedTasks.includes(creep.memory.task) || !valid(target)) {
      delete creep.memory[memoryKey];
      return null;
    }
    return target;
  };

  const retainExclusive = (creep, taskNames, memoryKey, bucket, valid) => {
    const target = retain(creep, taskNames, memoryKey, valid);
    if (!claim(bucket, target, creep.name)) {
      delete creep.memory[memoryKey];
      return null;
    }
    return target;
  };

  return { createBuckets, isAvailable, claim, release, retain,
    retainExclusive };
};

module.exports = { createTaskReservations };
