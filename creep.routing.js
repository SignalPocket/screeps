'use strict';

const selectRebalancerSurplus = (creeps, target, hasReplacementLife,
  RESOURCE_ENERGY) => {
  const ranked = creeps.slice().sort((a, b) =>
    Number(hasReplacementLife(b)) - Number(hasReplacementLife(a)) ||
    b.store.getCapacity(RESOURCE_ENERGY) -
      a.store.getCapacity(RESOURCE_ENERGY) ||
    b.ticksToLive - a.ticksToLive || a.name.localeCompare(b.name));
  return {
    keepers: ranked.slice(0, target),
    surplus: ranked.slice(target)
  };
};

const getWithdrawalApproachTarget = (creep, container, controllerStation) => {
  const usesControllerStation = creep.memory.role === 'upgrader' &&
    controllerStation && controllerStation.buffer && container &&
    controllerStation.buffer.id === container.id;
  return usesControllerStation ? controllerStation.position : container;
};

const selectRebalanceTarget = (structures, getTargetRatio, getDistance) =>
  structures.filter(structure => {
    if (!structure || !structure.store ||
        typeof structure.store.getCapacity !== 'function') return false;
    const targetRatio = getTargetRatio(structure);
    if (targetRatio <= 0) return false;
    const capacity = structure.store.getCapacity() || 0;
    return capacity > 0 &&
      structure.store.energy < capacity * targetRatio;
  }).sort((a, b) => {
    const aCapacity = a.store.getCapacity() || 1;
    const bCapacity = b.store.getCapacity() || 1;
    const aTargetRatio = getTargetRatio(a);
    const bTargetRatio = getTargetRatio(b);
    const aProgress = a.store.energy / (aCapacity * aTargetRatio);
    const bProgress = b.store.energy / (bCapacity * bTargetRatio);
    return aProgress - bProgress || bTargetRatio - aTargetRatio ||
      getDistance(a) - getDistance(b);
  })[0];

const isRebalanceReviewDue = (target, lastReviewed, gameTime,
  stillNeedsTarget, interval = 25) => !stillNeedsTarget(target) ||
    !Number.isInteger(lastReviewed) || gameTime - lastReviewed >= interval;

// A loaded carrier already beside a store should use real capacity instead of
// being starved forever by reservations held by more distant carriers.
const deliverStagedEnergy = ({
  creep, target, resourceType, moveCreep, OK, ERR_NOT_IN_RANGE
}) => {
  if (!creep || !target || !target.store ||
      creep.store[resourceType] <= 0) return false;
  const amount = Math.min(creep.store[resourceType],
    target.store.getFreeCapacity(resourceType));
  if (amount <= 0) return false;
  const result = creep.transfer(target, resourceType, amount);
  if (result === ERR_NOT_IN_RANGE) moveCreep(creep, target, 1);
  return result === OK || result === ERR_NOT_IN_RANGE;
};

module.exports = {
  selectRebalancerSurplus,
  getWithdrawalApproachTarget,
  selectRebalanceTarget,
  isRebalanceReviewDue,
  deliverStagedEnergy
};
