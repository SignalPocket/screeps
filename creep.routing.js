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

// Time passing is not a reassignment reason. Keep the exact buffer until it
// is gone or reaches its policy target; only then may the group choose another
// destination.
const isRebalanceReviewDue = (target, lastReviewed, gameTime,
  stillNeedsTarget, interval = 25) => !stillNeedsTarget(target);

const selectLogisticsReliefWorkers = (workers, demand, coveredCapacity,
  getCapacity) => {
  let remaining = Math.max(0, demand - coveredCapacity);
  const selected = [];
  for (const worker of (workers || []).slice().sort((a, b) =>
    getCapacity(b) - getCapacity(a) || a.name.localeCompare(b.name))) {
    if (remaining <= 0) break;
    selected.push(worker);
    remaining -= Math.max(0, getCapacity(worker));
  }
  return selected;
};

const selectBufferLane = (extensionDemand, extensionCapacity,
  controllerDemand, controllerTarget) => {
  if (extensionDemand <= 0) return controllerDemand > 0 ? 'buffer' : null;
  if (controllerDemand <= 0) return 'refill-buffer';
  // Restore the extension handoff's first quarter before routine RC supply.
  if (extensionDemand > extensionCapacity * 0.75) return 'refill-buffer';
  const extensionDeficit = extensionDemand / Math.max(1, extensionCapacity);
  const controllerDeficit = controllerDemand / Math.max(1, controllerTarget);
  return controllerDeficit >= extensionDeficit
    ? 'buffer' : 'refill-buffer';
};

const getBrigadeIntakeDemand = ({ plan, activeRelayCount, storageEnergy,
  controllerReserveTarget, storageCapacity }) => {
  if (!plan || !Array.isArray(plan.segments) || !plan.segments.length ||
      activeRelayCount <= 0 ||
      controllerReserveTarget <= 0 || storageCapacity <= 0) return 0;
  const intakeTarget = Math.min(storageCapacity, controllerReserveTarget);
  return Math.max(0, intakeTarget - Math.max(0, storageEnergy));
};

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
  selectLogisticsReliefWorkers,
  selectBufferLane,
  getBrigadeIntakeDemand,
  deliverStagedEnergy
};
