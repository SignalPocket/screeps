'use strict';

// Read-only evidence audit. Legacy trip samples infer unloading from empty
// cargo at home; they contain no recipient-confirmed delivery ledger.
const auditHauling = ({ tick, rooms = {}, creeps = [] }) => {
  if (!Number.isSafeInteger(tick) || tick < 0) throw Error('Authoritative tick required');
  const result = { tick, routes: [], omittedRoutes: 0,
    deliveredEnergy: null, measuredEnergyPerTick: null,
    staffingRecommendation: 'unknown: confirmed delivery and separated wait/travel evidence required',
    limits: 'Legacy averages describe inferred completed cycles, not confirmed delivery. Current capacity cannot reconstruct historical cargo. Outbound includes pickup/home waits; return includes delivery waits. Incomplete trips, CPU deferrals and estimates are not completed deliveries. Model rates are forecasts, not measured throughput.' };
  const haulers = creeps.filter(c => c.memory?.role === 'remote-hauler');
  const homes = new Set([...Object.keys(rooms), ...haulers
    .map(c => c.memory.remoteHome || c.memory.home).filter(h => typeof h === 'string')]);
  for (const home of [...homes].sort()) {
    const memory = rooms[home] || {};
    const remotes = new Set([...Object.keys(memory.remoteHaulRoutes || {}),
      ...Object.keys(memory.haulTripStats || {}), ...haulers.filter(c =>
        (c.memory.remoteHome || c.memory.home) === home)
        .map(c => c.memory.remoteRoom).filter(r => typeof r === 'string')]);
    for (const remote of [...remotes].sort()) {
      if (result.routes.length >= 16) { result.omittedRoutes++; continue; }
      const plan = memory.remoteHaulRoutes?.[remote];
      const stats = memory.haulTripStats?.[remote]?.slots || {};
      const assigned = creeps.filter(c => c.memory?.role === 'remote-hauler' &&
        (c.memory.remoteHome || c.memory.home) === home && c.memory.remoteRoom === remote);
      const slots = new Set([...Object.keys(stats), ...assigned.map(c => String(c.memory.remoteHaulerSlot))]);
      const route = { home, remote, planAge: Number.isFinite(plan?.planned) ? tick - plan.planned : null,
        slots: [], omittedSlots: 0, assignedCount: assigned.length,
        incompleteTrips: assigned.filter(c => c.memory.haulTrip).length,
        lanes: (plan?.lanes || []).slice(0, 8).map(l => ({ sourceId: l.sourceId,
          basis: l.basis, roundTripTicks: l.roundTripTicks,
          requiredRate: l.requiredRate, projectedRate: l.projectedRate,
          modeledAssignedRate: l.actualRate })),
        omittedLanes: Math.max(0, (plan?.lanes?.length || 0) - 8) };
      for (const slot of [...slots].sort()) {
        if (route.slots.length >= 32) { route.omittedSlots++; continue; }
        const observation = stats[slot];
        const members = assigned.filter(c => String(c.memory.remoteHaulerSlot) === slot);
        const capacities = members.map(c => (c.body || []).reduce((sum, p) =>
          sum + (p.type === 'carry' && p.hits > 0 ? 50 : 0), 0));
        const age = Number.isFinite(observation?.updated) ? tick - observation.updated : null;
        const index = plan?.slotSources?.[slot];
        const expectedSource = plan?.lanes?.[index]?.sourceId;
        let basis = !observation ? 'missing' : age === null || age < 0 ? 'invalid-time'
          : age > 1500 ? 'stale' : !Number.isInteger(observation.samples) || observation.samples <= 0 ||
            !Number.isFinite(observation.roundTripTicks) || observation.roundTripTicks <= 5 ||
            observation.roundTripTicks > 1500 || !Number.isFinite(observation.loadRatio) ||
            observation.loadRatio < 0 || observation.loadRatio > 1 ? 'invalid-sample'
          : !observation.sourceId || !expectedSource ? 'source-unverified'
          : observation.sourceId !== expectedSource ? 'source-mismatch' : 'fresh-inferred-cycle';
        route.slots.push({ slot, basis, age, expectedSource,
          assignedCount: members.length,
          // Replacement overlap is reported, never counted twice as throughput.
          assignedSlotCapacity: capacities.length ? Math.max(...capacities) : 0,
          spawningCount: members.filter(c => c.spawning).length,
          inferredCycle: basis === 'fresh-inferred-cycle' ? {
            samples: observation.samples, roundTripTicks: observation.roundTripTicks,
            loadRatio: observation.loadRatio,
            outboundIncludingWaits: observation.outboundTicks,
            returnIncludingWaits: observation.returnTicks } : null });
      }
      result.routes.push(route);
    }
  }
  return result;
};
module.exports = { auditHauling };
