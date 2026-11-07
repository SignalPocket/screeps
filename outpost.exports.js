"use strict";

// Observe confirmed room transitions before policy and action execution.
const observeOutpostExport = ({ tick, roomName, energy, memory, homeMemory }) => {
  const previousRoom = memory.exportObservedRoom;
  memory.exportObservedRoom = roomName;
  const origin = memory.remoteCargoOrigin;
  if (!origin || energy <= 0) {
    delete memory.remoteCargoExported;
    return 0;
  }
  if (!homeMemory || memory.remoteCargoExported ||
      previousRoom !== origin || roomName === origin) return 0;
  const amount = Math.min(energy, Number.isFinite(memory.remoteCargoRemaining)
    ? memory.remoteCargoRemaining : energy);
  if (amount <= 0) return 0;
  if (!homeMemory.outpostEconomy) homeMemory.outpostEconomy = {};
  const stats = homeMemory.outpostEconomy[origin] || { deliveredTotal: 0, buckets: {} };
  if (!stats.exportBuckets) stats.exportBuckets = {};
  const bucket = Math.floor(tick / 100) * 100;
  stats.exportedTotal = (stats.exportedTotal || 0) + amount;
  stats.firstExport = stats.firstExport || tick;
  stats.lastExport = tick;
  stats.exportBuckets[bucket] = (stats.exportBuckets[bucket] || 0) + amount;
  for (const key of Object.keys(stats.exportBuckets)) {
    if (Number(key) < tick - 1500) delete stats.exportBuckets[key];
  }
  homeMemory.outpostEconomy[origin] = stats;
  memory.remoteCargoExported = true;
  return amount;
};
module.exports = { observeOutpostExport };
