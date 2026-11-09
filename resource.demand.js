'use strict';

const MODES = Object.freeze(['direct', 'staged', 'relay', 'feeder']);
const PURPOSE_RANK = Object.freeze({ survival: 0, emergency: 0, defense: 10,
  repair: 20, construction: 30, build: 30, upgrade: 40, other: 50 });
const finiteNonnegative = value => Number.isFinite(value) && value >= 0;
const workerId = worker => worker && (worker.id || worker.name);

const normalizeConsumer = (consumer, fallbackRoom) => {
  if (!consumer || !['creep', 'structure', 'position'].includes(consumer.kind)) return null;
  const roomName = consumer.roomName || consumer.pos?.roomName || fallbackRoom;
  if (typeof roomName !== 'string' || !roomName) return null;
  if (consumer.kind === 'position') {
    const x = consumer.x ?? consumer.pos?.x, y = consumer.y ?? consumer.pos?.y;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 49 || y < 0 || y > 49) return null;
    return { kind: 'position', roomName, x, y, key: `position:${roomName}:${x}:${y}` };
  }
  const id = consumer.id || consumer.name;
  if (typeof id !== 'string' || !id) return null;
  return { kind: consumer.kind, roomName, id, key: `${consumer.kind}:${id}` };
};

const normalizeDemand = (input = {}) => {
  const unknowns = [];
  const consumer = normalizeConsumer(input.consumer, input.roomName);
  if (!consumer) unknowns.push('consumer');
  const roomName = consumer?.roomName || (typeof input.roomName === 'string' ? input.roomName : null);
  if (!roomName) unknowns.push('roomName');
  const resourceType = typeof input.resourceType === 'string' && input.resourceType ? input.resourceType : null;
  if (!resourceType) unknowns.push('resourceType');
  const requested = finiteNonnegative(input.requested) ? input.requested : null;
  if (requested === null) unknowns.push('requested');
  const sustainRate = input.sustainRate === undefined ? 0 :
    (finiteNonnegative(input.sustainRate) ? input.sustainRate : null);
  if (sustainRate === null) unknowns.push('sustainRate');
  const mode = MODES.includes(input.mode) ? input.mode : (input.mode === undefined ? 'direct' : null);
  if (!mode) unknowns.push('mode');
  const purpose = typeof input.purpose === 'string' ? input.purpose : 'other';
  const key = roomName && resourceType && consumer
    ? `${roomName}|${resourceType}|${consumer.key}` : null;
  return { ...input, id: typeof input.id === 'string' && input.id ? input.id : key,
    key, consumer, roomName, resourceType, requested, sustainRate, mode, purpose,
    urgency: finiteNonnegative(input.urgency) ? input.urgency : 0,
    deadline: finiteNonnegative(input.deadline) ? input.deadline : null,
    unknowns: [...new Set(unknowns)], known: unknowns.length === 0 };
};

const commitmentMatches = (commitment, demand) => {
  if (commitment.demandId) return commitment.demandId === demand.id || commitment.demandId === demand.key;
  const consumerKey = commitment.consumerKey ||
    normalizeConsumer(commitment.consumer, commitment.roomName)?.key;
  return commitment.roomName === demand.roomName && commitment.resourceType === demand.resourceType &&
    consumerKey === demand.consumer?.key;
};

const accountDemand = (input, commitments = []) => {
  if (input && Object.hasOwn(input, 'remaining') && (!commitments || commitments.length === 0))
    return input;
  const demand = input && Array.isArray(input.unknowns) ? input : normalizeDemand(input);
  const seen = new Set(), commitmentIds = [], unknowns = [...demand.unknowns];
  let committed = 0;
  for (const commitment of commitments || []) {
    if (!commitment || commitment.active === false || !commitmentMatches(commitment, demand)) continue;
    const id = commitment.id;
    if (typeof id !== 'string' || !id) { unknowns.push('commitment.id'); continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    if (!finiteNonnegative(commitment.amount)) {
      unknowns.push(`commitment.amount:${id}`); continue;
    }
    committed += commitment.amount;
    commitmentIds.push(id);
  }
  const requested = demand.requested;
  const acceptedCommitted = requested === null ? committed : Math.min(requested, committed);
  return { ...demand, committed: acceptedCommitted,
    excessCommitted: requested === null ? 0 : Math.max(0, committed - requested),
    remaining: requested === null ? null : Math.max(0, requested - acceptedCommitted),
    commitmentIds, unknowns: [...new Set(unknowns)],
    known: demand.known && !unknowns.some(value => value.startsWith('commitment.')) };
};

const priorityOf = demand => [PURPOSE_RANK[demand.purpose] ?? PURPOSE_RANK.other,
  -demand.urgency, demand.deadline === null ? Number.MAX_SAFE_INTEGER : demand.deadline,
  demand.key || demand.id || ''];
const compareTuple = (a, b) => {
  for (let index = 0; index < a.length; index++) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
};
const prioritizeDemands = demands => [...demands].sort((a, b) =>
  compareTuple(priorityOf(a), priorityOf(b)));

const dedupeDemands = demands => {
  const unique = new Map();
  for (const input of demands) {
    const demand = input && Array.isArray(input.unknowns) ? input : normalizeDemand(input);
    const identity = demand.id || demand.key;
    if (!identity || !unique.has(identity)) { unique.set(identity || Symbol(), demand); continue; }
    const prior = unique.get(identity);
    unique.set(identity, { ...prior,
      requested: prior.requested === null ? demand.requested :
        (demand.requested === null ? prior.requested : Math.max(prior.requested, demand.requested)),
      sustainRate: prior.sustainRate === null ? demand.sustainRate :
        (demand.sustainRate === null ? prior.sustainRate : Math.max(prior.sustainRate, demand.sustainRate)),
      urgency: Math.max(prior.urgency, demand.urgency),
      deadline: prior.deadline === null ? demand.deadline :
        (demand.deadline === null ? prior.deadline : Math.min(prior.deadline, demand.deadline)),
      unknowns: [...new Set([...prior.unknowns, ...demand.unknowns])],
      known: prior.known && demand.known } );
  }
  return [...unique.values()];
};

const cycleTicksFor = demand => {
  if (finiteNonnegative(demand.cycleTicks) && demand.cycleTicks > 0) return demand.cycleTicks;
  let travel = null;
  if (finiteNonnegative(demand.roundTripTicks)) travel = demand.roundTripTicks;
  else if (demand.mode === 'relay' && finiteNonnegative(demand.legTicks)) travel = demand.legTicks * 2;
  else if (finiteNonnegative(demand.travelTicks)) travel = demand.travelTicks * 2;
  if (travel === null) return null;
  const loading = finiteNonnegative(demand.loadingTicks) ? demand.loadingTicks : 0;
  const unloading = finiteNonnegative(demand.unloadingTicks) ? demand.unloadingTicks : 0;
  const cadence = finiteNonnegative(demand.cadenceTicks) ? demand.cadenceTicks : 0;
  return Math.max(1, travel + loading + unloading + cadence);
};

const compatible = (worker, demand) => {
  if (!worker || !workerId(worker) || worker.roomName !== demand.roomName ||
      worker.resourceType !== demand.resourceType) return false;
  const modes = worker.modes || (worker.mode ? [worker.mode] : MODES);
  return modes.includes(demand.mode) && finiteNonnegative(worker.cargo) && worker.cargo > 0;
};

const sizeResourceBrigade = ({ demand: input, commitments = [], workers = [], tick = 0,
  newWorker = {}, clearanceTicks = null } = {}) => {
  const demand = accountDemand(input, commitments);
  const unknowns = [...demand.unknowns];
  const cycleTicks = cycleTicksFor(demand);
  if (cycleTicks === null) unknowns.push('cycleTicks');
  const replacementLead = finiteNonnegative(demand.replacementLead) ? demand.replacementLead :
    (finiteNonnegative(newWorker.replacementLead) ? newWorker.replacementLead : 0);
  const candidates = [], seenWorkers = new Set();
  let uncertainCoverage = false;
  for (const worker of workers || []) {
    const id = workerId(worker);
    if (!compatible(worker, demand) || seenWorkers.has(id)) continue;
    seenWorkers.add(id);
    if (replacementLead > 0 && !finiteNonnegative(worker.ticksToLive)) {
      unknowns.push(`worker.ticksToLive:${id}`);
      uncertainCoverage = true;
      continue;
    }
    if (finiteNonnegative(worker.ticksToLive) && worker.ticksToLive <= replacementLead) continue;
    const workerCycle = finiteNonnegative(worker.cycleTicks) && worker.cycleTicks > 0
      ? worker.cycleTicks : cycleTicks;
    if (workerCycle !== null) candidates.push({ id, rate: worker.cargo / workerCycle });
  }
  candidates.sort((a, b) => b.rate - a.rate || a.id.localeCompare(b.id));
  const remaining = demand.remaining;
  let deliverable = remaining;
  if (remaining !== null && finiteNonnegative(demand.availableInventory))
    deliverable = Math.min(remaining, demand.availableInventory);
  let requiredRate = null;
  if (remaining !== null && demand.sustainRate !== null && cycleTicks !== null) {
    let window = clearanceTicks || demand.clearanceTicks;
    if (demand.deadline !== null) window = Math.max(1, demand.deadline - tick);
    if (!finiteNonnegative(window) || window === 0) window = cycleTicks;
    requiredRate = demand.sustainRate + deliverable / window;
  }
  const reused = [];
  let coveredRate = 0;
  if (requiredRate !== null) {
    for (const worker of candidates) {
      if (coveredRate >= requiredRate) break;
      reused.push(worker.id);
      coveredRate += worker.rate;
    }
  }
  const released = candidates.filter(worker => !reused.includes(worker.id)).map(worker => worker.id);
  const newCargo = finiteNonnegative(newWorker.cargo) && newWorker.cargo > 0 ? newWorker.cargo : null;
  if (requiredRate !== null && coveredRate < requiredRate && newCargo === null)
    unknowns.push('newWorker.cargo');
  const newCycle = finiteNonnegative(newWorker.cycleTicks) && newWorker.cycleTicks > 0
    ? newWorker.cycleTicks : cycleTicks;
  const newRate = newCargo !== null && newCycle !== null ? newCargo / newCycle : null;
  const gap = requiredRate === null ? null : Math.max(0, requiredRate - coveredRate);
  const spawnNeeded = gap === null || newRate === null || uncertainCoverage
    ? (gap === 0 ? 0 : null) : Math.ceil(gap / newRate);
  return { demand, mode: demand.mode, cycleTicks, deliverable, requiredRate, coveredRate,
    reused, released, spawnNeeded,
    targetCrew: spawnNeeded === null ? null : reused.length + spawnNeeded,
    replacementLead, inventoryLimited: remaining !== null && deliverable < remaining,
    unknowns: [...new Set(unknowns)], known: unknowns.length === 0 };
};

const planResourceBrigades = ({ demands = [], commitments = [], workers = [], tick = 0,
  newWorkers = {}, clearanceTicks = null } = {}) => {
  const normalized = prioritizeDemands(dedupeDemands(demands)
    .map(demand => accountDemand(demand, commitments)));
  const available = [...workers], plans = [];
  for (const demand of normalized) {
    const blockingRepair = demand.purpose === 'construction' || demand.purpose === 'build'
      ? plans.find(plan => plan.demand.roomName === demand.roomName &&
        plan.demand.resourceType === demand.resourceType && plan.demand.purpose === 'repair' &&
        (plan.demand.remaining === null || plan.demand.remaining > 0))
      : null;
    if (blockingRepair) {
      plans.push({ demand, mode: demand.mode, deferredBy: blockingRepair.demand.id,
        cycleTicks: cycleTicksFor(demand), deliverable: demand.remaining, requiredRate: 0,
        coveredRate: 0, reused: [], released: [], spawnNeeded: 0, targetCrew: 0,
        replacementLead: 0, inventoryLimited: false, unknowns: [...demand.unknowns],
        known: demand.known });
      continue;
    }
    const key = `${demand.roomName}|${demand.resourceType}|${demand.mode}`;
    const newWorker = newWorkers[key] || newWorkers[demand.mode] || newWorkers.default || {};
    const plan = sizeResourceBrigade({ demand, workers: available, tick, newWorker, clearanceTicks });
    plans.push(plan);
    const used = new Set(plan.reused);
    for (let index = available.length - 1; index >= 0; index--)
      if (used.has(workerId(available[index]))) available.splice(index, 1);
  }
  const assigned = new Set(plans.flatMap(plan => plan.reused));
  const released = [], seen = new Set();
  for (const worker of workers) {
    const id = workerId(worker);
    const inScope = normalized.length === 0 || normalized.some(demand => compatible(worker, demand));
    if (id && inScope && !assigned.has(id) && !seen.has(id)) {
      seen.add(id); released.push(id);
    }
  }
  return { plans, released };
};

module.exports = { MODES, PURPOSE_RANK, normalizeConsumer, normalizeDemand,
  accountDemand, prioritizeDemands, dedupeDemands, sizeResourceBrigade,
  planResourceBrigades };
