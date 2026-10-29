'use strict';

// Per-tick reservation ledgers prevent multiple creeps from claiming the same
// stored energy or destination capacity. The book owns all mutation so roles
// share one consistent accounting implementation.
const createResourceReservations = resourceType => {
  const reservedEnergy = {};
  const reservedCapacity = {};
  const getUnreservedEnergy = target => target && target.store
    ? Math.max(0, target.store[resourceType] -
      (reservedEnergy[target.id] || 0))
    : 0;
  const getUnreservedCapacity = target => target && target.store
    ? Math.max(0, target.store.getFreeCapacity(resourceType) -
      (reservedCapacity[target.id] || 0))
    : 0;
  const reserveAmount = (ledger, target, available, requested) => {
    if (!target || requested <= 0) return 0;
    const amount = Math.max(0, Math.min(requested, available));
    if (amount > 0) ledger[target.id] = (ledger[target.id] || 0) + amount;
    return amount;
  };
  const releaseAmount = (ledger, target, amount) => {
    if (!target || amount <= 0) return;
    ledger[target.id] = Math.max(0, (ledger[target.id] || 0) - amount);
    if (ledger[target.id] === 0) delete ledger[target.id];
  };
  const reserveEnergyFrom = (target, requested) =>
    reserveAmount(reservedEnergy, target, getUnreservedEnergy(target), requested);
  const reserveCapacityIn = (target, requested) =>
    reserveAmount(reservedCapacity, target,
      getUnreservedCapacity(target), requested);

  return { reservedEnergy, reservedCapacity, getUnreservedEnergy,
    getUnreservedCapacity, reserveAmount, releaseAmount, reserveEnergyFrom,
    reserveCapacityIn };
};

module.exports = { createResourceReservations };
