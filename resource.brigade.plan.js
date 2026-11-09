'use strict';

const { accountDemand, planResourceBrigades, prioritizeDemands } =
  require('./resource.demand');

const finiteNonnegative = value => Number.isFinite(value) && value >= 0;
const positionOf = target => target && target.pos &&
  typeof target.pos.roomName === 'string' && Number.isInteger(target.pos.x) &&
  Number.isInteger(target.pos.y)
  ? { kind: 'position', roomName: target.pos.roomName,
    x: target.pos.x, y: target.pos.y, id: target.id || null }
  : null;
const stored = (store, resourceType) => store && finiteNonnegative(store[resourceType])
  ? store[resourceType] : null;
const freeCapacity = (creep, resourceType) => {
  if (finiteNonnegative(creep.freeCapacity)) return creep.freeCapacity;
  if (creep.store && typeof creep.store.getFreeCapacity === 'function') {
    const free = creep.store.getFreeCapacity(resourceType);
    return finiteNonnegative(free) ? free : null;
  }
  return null;
};
const jobForTarget = (creeps, roomName, lane, targetId) => (creeps || [])
  .filter(creep => creep && creep.roomName === roomName && creep.memory?.workJob &&
    creep.memory.workJob.roomName === roomName && creep.memory.workJob.lane === lane &&
    creep.memory.workJob.targetId === targetId)
  .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))[0];

const roomInventory = (room, resourceType) => {
  const stores = room.stores || [];
  let total = 0;
  for (const target of stores) {
    const amount = stored(target && target.store, resourceType);
    if (amount === null) return null;
    total += amount;
  }
  return stores.length > 0 ? total : null;
};
const uniqueTargets = targets => [...new Map(targets.map(target => [
  target.id || `${target.pos?.roomName}:${target.pos?.x}:${target.pos?.y}`,
  target
])).values()];

const demandTiming = room => {
  const supply = room.supply || {};
  return {
    mode: supply.mode || 'direct',
    sourceId: supply.sourceId || null,
    roundTripTicks: supply.roundTripTicks,
    travelTicks: supply.travelTicks,
    legTicks: supply.legTicks,
    loadingTicks: supply.loadingTicks,
    unloadingTicks: supply.unloadingTicks,
    cadenceTicks: supply.cadenceTicks,
    replacementLead: supply.replacementLead
  };
};

const demandForTarget = ({ room, target, creeps, resourceType, purpose,
  requested, deliveryRange }) => {
  const lane = purpose === 'repair' ? 'repair' : 'build';
  const retained = jobForTarget(creeps, room.name, lane, target.id);
  const retainedJob = retained && retained.memory.workJob;
  const targetPlace = positionOf(target) ||
    (target.id ? { kind: 'structure', roomName: room.name, id: target.id } : null);
  const consumer = retained
    ? { kind: 'creep', roomName: room.name, id: retained.id || retained.name }
    : targetPlace;
  const inventory = roomInventory(room, resourceType);
  const batch = retained ? freeCapacity(retained, resourceType) : null;
  return {
    id: `${room.name}:${resourceType}:${purpose}:${target.id ||
      `${targetPlace?.x}:${targetPlace?.y}`}`,
    roomName: room.name,
    resourceType,
    consumer,
    requested,
    purpose,
    urgency: finiteNonnegative(target.urgency) ? target.urgency : 0,
    deadline: finiteNonnegative(target.deadline) ? target.deadline : null,
    sustainRate: finiteNonnegative(target.sustainRate) ? target.sustainRate : 0,
    availableInventory: inventory === null ? undefined : inventory,
    deliveryBatch: batch,
    deliveryRange,
    consumerWorkJob: retainedJob ? { ...retainedJob } : null,
    targetPlace: targetPlace && { ...targetPlace, range: deliveryRange },
    ...demandTiming(room)
  };
};

const collectResourceBrigadeDemands = ({ rooms = [], creeps = [],
  resourceType = 'energy', repairPower = 100, buildPower = 5, tick = 0,
  maxAge = 25 } = {}) => {
  const demands = [], evidence = [];
  for (const room of [...rooms].sort((a, b) => a.name.localeCompare(b.name))) {
    const unknowns = [];
    if (room.visible === false) unknowns.push('visibility');
    if (finiteNonnegative(room.observedAt) && finiteNonnegative(tick) &&
        tick - room.observedAt > maxAge) unknowns.push('stale');
    if (!Array.isArray(room.repairTargets)) unknowns.push('repairTargets');
    if (!Array.isArray(room.constructionSites)) unknowns.push('constructionSites');
    if (roomInventory(room, resourceType) === null) unknowns.push('inventory');
    if (unknowns.length > 0) {
      evidence.push({ roomName: room.name, known: false, unknowns });
      continue;
    }
    let repairEnergy = 0, constructionEnergy = 0;
    for (const target of uniqueTargets(room.repairTargets)
      .filter(target => target.valid !== false)) {
      const targetHits = finiteNonnegative(target.targetHits)
        ? target.targetHits : target.hitsMax;
      if (!finiteNonnegative(target.hits) || !finiteNonnegative(targetHits)) continue;
      const requested = Math.ceil(Math.max(0, targetHits - target.hits) / repairPower);
      if (requested === 0) continue;
      repairEnergy += requested;
      demands.push(demandForTarget({ room, target, creeps, resourceType,
        purpose: 'repair', requested, deliveryRange: 1 }));
    }
    for (const target of uniqueTargets(room.constructionSites)
      .filter(target => target.valid !== false)) {
      if (!finiteNonnegative(target.progress) || !finiteNonnegative(target.progressTotal)) continue;
      const requested = Math.ceil(Math.max(0,
        target.progressTotal - target.progress) / buildPower);
      if (requested === 0) continue;
      constructionEnergy += requested;
      demands.push(demandForTarget({ room, target, creeps, resourceType,
        purpose: 'construction', requested, deliveryRange: 1 }));
    }
    evidence.push({ roomName: room.name, known: true, unknowns: [],
      repairEnergy, constructionEnergy,
      availableInventory: roomInventory(room, resourceType) });
  }
  return { demands, evidence };
};

const makeWorkJob = ({ demand, plan, tick, previous }) => {
  const targetId = demand.consumer?.kind === 'creep' ? demand.consumer.id :
    demand.targetPlace?.id || null;
  const stable = previous && previous.demandId === demand.id &&
    previous.workJob?.targetId === targetId;
  return {
    id: stable ? previous.workJob.id : `brigade:${demand.id}`,
    roomName: demand.roomName,
    lane: 'supply',
    sourceId: demand.sourceId || null,
    targetId,
    amount: Math.max(0, Math.min(demand.deliveryBatch ?? plan.deliverable ?? 0,
      plan.deliverable ?? 0)),
    priority: plan.demand.purpose === 'repair' ? 2 : 3,
    reason: `resource brigade for retained ${plan.demand.purpose} target`,
    created: stable ? previous.workJob.created : tick,
    updated: tick
  };
};

const planDurableResourceBrigades = ({ rooms = [], creeps = [], commitments = [],
  workers = [], tick = 0, newWorkers = {}, previousRequests = [],
  resourceType = 'energy', repairPower = 100, buildPower = 5,
  clearanceTicks = null } = {}) => {
  const collected = collectResourceBrigadeDemands({ rooms, creeps, resourceType,
    repairPower, buildPower, tick });
  const accounted = prioritizeDemands(collected.demands
    .map(demand => accountDemand(demand, commitments)));
  const inventoryByRoom = new Map(collected.evidence.filter(room => room.known)
    .map(room => [room.roomName, room.availableInventory]));
  for (const demand of accounted) {
    const available = inventoryByRoom.get(demand.roomName);
    if (!finiteNonnegative(available) || demand.remaining === null) continue;
    demand.availableInventory = Math.min(available, demand.remaining);
    inventoryByRoom.set(demand.roomName,
      Math.max(0, available - demand.availableInventory));
  }
  const unknownRoom = collected.evidence.find(room => !room.known);
  const repairDemandBlocker = accounted.find(demand => demand.purpose === 'repair' &&
    (demand.remaining === null || demand.remaining > 0));
  const repairBlocker = unknownRoom
    ? `unknown:${unknownRoom.roomName}` : repairDemandBlocker?.id || null;
  const admitted = repairBlocker
    ? accounted.filter(demand => demand.purpose === 'repair') : accounted;
  const planned = planResourceBrigades({ demands: admitted, workers, tick,
    newWorkers, clearanceTicks });
  const previous = new Map(previousRequests.map(request => [request.demandId, request]));
  const requests = planned.plans.filter(plan => plan.demand.remaining === null ||
    plan.demand.remaining > 0 || plan.demand.sustainRate > 0).map(plan => {
    const demand = plan.demand;
    const workJob = makeWorkJob({ demand, plan, tick,
      previous: previous.get(demand.id) });
    return { id: `brigade-request:${demand.id}`, demandId: demand.id,
      roomName: demand.roomName, resourceType: demand.resourceType,
      mode: plan.mode, desired: plan.targetCrew, assigned: [...plan.reused],
      spawnNeeded: plan.spawnNeeded, remaining: demand.remaining,
      workJob, consumerWorkJob: demand.consumerWorkJob,
      targetPlace: demand.targetPlace, blockers: [...plan.unknowns] };
  });
  const deferred = repairBlocker ? accounted.filter(demand =>
    demand.purpose === 'construction').map(demand => ({ demandId: demand.id,
    roomName: demand.roomName, reason: 'four-room repair demand remains',
    blockedBy: repairBlocker })) : [];
  return { ...collected, requests, deferred, released: planned.released,
    repairBlocker };
};

module.exports = { collectResourceBrigadeDemands,
  planDurableResourceBrigades };
