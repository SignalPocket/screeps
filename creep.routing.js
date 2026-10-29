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

module.exports = {
  selectRebalancerSurplus,
  getWithdrawalApproachTarget
};
