'use strict';

const blend = (old, value) => Number.isFinite(old) ? old * 0.75 + value * 0.25 : value;

// Observe complete home -> pickup -> home-unloaded cycles. Never count a
// border crossing as a delivery, or a journey already underway at startup.
const observeHaulTrip = ({ creep, homeMemory, tick, resource = 'energy' }) => {
  const m = creep.memory, home = m.remoteHome || m.home;
  const origin = m.remoteCargoOrigin;
  if (m.role !== 'remote-hauler' || creep.spawning || !homeMemory) return;
  const energy = creep.store[resource] || 0;
  let trip = m.haulTrip;
  if (trip && (trip.room !== m.remoteRoom || tick - trip.started > 1500)) {
    delete m.haulTrip; trip = null;
  }
  if (!trip && creep.room.name === home && energy === 0) {
    const plan = homeMemory.remoteHaulRoutes && homeMemory.remoteHaulRoutes[m.remoteRoom];
    const sourceId = plan && plan.lanes && plan.lanes[plan.slotSources?.[m.remoteHaulerSlot || 0]]?.sourceId;
    m.haulTrip = { sourceId, room: m.remoteRoom, slot: m.remoteHaulerSlot || 0,
      started: tick, capacity: creep.store.getCapacity(resource) };
    return;
  }
  if (!trip) return;
  if (!trip.departed && creep.room.name !== home) trip.departed = tick;
  // Keep home-side travel and pickup/delivery waiting in the measured cycle.
  if (creep.room.name === trip.room && !trip.arrived) trip.arrived = tick;
  if (origin === trip.room && energy > 0) {
    if (!trip.loaded) trip.loaded = tick;
    trip.cargo = Math.max(trip.cargo || 0, energy);
  }
  if (!trip.loaded || creep.room.name !== home || energy !== 0) return;
  const cycle = tick - trip.started;
  if (cycle > 5 && cycle <= 1500 && trip.cargo > 0) {
    if (!homeMemory.haulTripStats) homeMemory.haulTripStats = {};
    const roomStats = homeMemory.haulTripStats[trip.room] || { slots: {} };
    const key = String(trip.slot);
    const saved = roomStats.slots[key] || { samples: 0 };
    saved.sourceId = trip.sourceId;
    saved.roundTripTicks = blend(saved.roundTripTicks, cycle);
    saved.outboundTicks = blend(saved.outboundTicks, trip.loaded - trip.started);
    saved.returnTicks = blend(saved.returnTicks, tick - trip.loaded);
    saved.loadRatio = blend(saved.loadRatio, Math.min(1, trip.cargo / trip.capacity));
    saved.samples++; saved.updated = tick;
    roomStats.slots[key] = saved;
    homeMemory.haulTripStats[trip.room] = roomStats;
  }
  delete m.haulTrip;
};

// Build a bounded, concrete slot roster from energy/tick rather than names.
// Existing undersized carriers contribute only their actual usable capacity.
const planHaulCapacity = ({ lanes, carriers, newCapacity, previousSlots = [],
  maxPerSource = 6, clearanceTicks = 600, utilization = 0.85 }) => {
  const maxSlots = lanes.length * maxPerSource;
  const slotSources = previousSlots.slice(0, maxSlots);
  const current = new Map();
  for (const c of carriers) {
    if (!Number.isInteger(c.slot) || c.slot < 0 || c.slot >= maxSlots) continue;
    if (!slotSources[c.slot] && slotSources[c.slot] !== 0) slotSources[c.slot] = c.slot % lanes.length;
    // Replacement overlap is one roster slot, not double throughput.
    current.set(c.slot, Math.max(current.get(c.slot) || 0, c.capacity));
  }
  const requested = lanes.map(lane => lane.production +
    Math.min(lane.production * 0.5, Math.max(0, lane.backlog) / clearanceTicks));
  const rates = lanes.map(() => 0);
  let target = 0;
  while (target < maxSlots && (target < lanes.length ||
      rates.some((rate, index) => rate < requested[index]))) {
    let source = slotSources[target];
    if (!Number.isInteger(source) || source >= lanes.length) {
      source = target < lanes.length ? target : requested.reduce((best, need, i) =>
        (need - rates[i]) / Math.max(need, 0.001) >
        (requested[best] - rates[best]) / Math.max(requested[best], 0.001) ? i : best, 0);
      slotSources[target] = source;
    }
    const lane = lanes[source];
    const capacity = current.get(target) || newCapacity;
    rates[source] += capacity * Math.max(0.4, Math.min(1, lane.utilization || utilization)) /
      Math.max(20, lane.roundTripTicks);
    target++;
  }
  return { target, slotSources, lanes: lanes.map((lane, i) => ({ ...lane,
    requiredRate: requested[i], projectedRate: rates[i],
    actualRate: [...current.entries()].filter(([slot]) => (slotSources[slot] ?? slot % lanes.length) === i)
      .reduce((sum, [, capacity]) => sum + capacity * (lane.utilization || utilization) /
        Math.max(20, lane.roundTripTicks), 0) })),
    saturated: rates.some((rate, i) => rate < requested[i]) };
};

module.exports = { observeHaulTrip, planHaulCapacity };
