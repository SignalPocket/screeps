'use strict';

// Owns per-tick task claims so every dispatcher path follows the same rules.
// Callers provide the few targets that intentionally allow shared work.
const createTaskReservations = ({ Game, isSharedTarget = () => false }) => {
  const createBuckets = names => Object.fromEntries(
    names.map(name => [name, {}]));

  const isAvailable = (bucket, target, creepName) => Boolean(target) &&
    (isSharedTarget(target) || !bucket[target.id] ||
      bucket[target.id] === creepName);

  const claim = (bucket, target, creepName) => {
    if (!isAvailable(bucket, target, creepName)) return false;
    if (!isSharedTarget(target)) bucket[target.id] = creepName;
    return true;
  };

  const release = (bucket, target, creepName) => {
    if (!target || isSharedTarget(target)) return;
    if (bucket[target.id] === creepName) delete bucket[target.id];
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
