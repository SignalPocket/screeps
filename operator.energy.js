'use strict';

const ENERGY_DEFINITION = Object.freeze({
  name: 'energy',
  signature: "ops.energy(roomName)",
  purpose: 'Explain where room energy is, how it flows, and what blocks it.',
  example: "ops.energy('W7N4')",
  mode: 'read-only',
  writes: 'none',
  expires: null,
  related: Object.freeze(['colony', 'remotes', 'room', 'spawn', 'work'])
});

const finite = item => Number.isFinite(item) ? item : null;
const integer = item => Number.isSafeInteger(item) ? item : null;
const sumKnown = values => values.every(value => value !== null)
  ? values.reduce((sum, value) => sum + value, 0) : null;
const storeEnergy = (object, resource) => object && object.store
  ? finite(object.store[resource]) : null;
const storeCapacity = (object, resource) => object && object.store &&
  typeof object.store.getCapacity === 'function'
  ? finite(object.store.getCapacity(resource)) : null;
const storeFree = (object, resource) => object && object.store &&
  typeof object.store.getFreeCapacity === 'function'
  ? finite(object.store.getFreeCapacity(resource)) : null;
const observation = (updated, tick) => {
  if (!Number.isSafeInteger(updated)) return {
    tick: null, age: null, freshness: 'unknown'
  };
  const age = Number.isSafeInteger(tick) ? Math.max(0, tick - updated) : null;
  return { tick: updated, age, freshness: age === 0 ? 'current tick'
    : age === null ? 'unknown' : `stale by ${age} ticks` };
};
const errorResult = (tick, message) => ({
  ok: false, tick, freshness: 'current tick', error: message, console: message
});
const aggregate = (objects, resource, energy = storeEnergy) => {
  const ordered = [...objects].sort((left, right) =>
    String(left.id || left.name || '').localeCompare(
      String(right.id || right.name || '')));
  const rows = ordered.map(object => ({
    id: object.id || null,
    name: object.name || null,
    energy: energy(object, resource),
    capacity: storeCapacity(object, resource),
    freeCapacity: storeFree(object, resource)
  }));
  return {
    count: rows.length,
    energy: rows.length ? sumKnown(rows.map(row => row.energy)) : 0,
    capacity: rows.length ? sumKnown(rows.map(row => row.capacity)) : 0,
    freeCapacity: rows.length ? sumKnown(rows.map(row => row.freeCapacity)) : 0,
    objects: rows
  };
};
const aggregateBins = bins => {
  const rows = Object.values(bins || {}).filter(bin => bin &&
    Number.isFinite(bin.ticks) && Number.isFinite(bin.output));
  if (!rows.length) return null;
  const ticks = rows.reduce((sum, bin) => sum + bin.ticks, 0);
  const output = rows.reduce((sum, bin) => sum + bin.output, 0);
  return ticks > 0 ? output / ticks : null;
};
const laborRate = (stats, kind) => {
  const rates = Object.values(stats && stats.creeps || {}).filter(profile =>
    profile && profile.kind === kind).map(profile => aggregateBins(profile.bins))
    .filter(Number.isFinite);
  return rates.length ? rates.reduce((sum, rate) => sum + rate, 0) : null;
};
const storedTrend = history => {
  const records = history && Array.isArray(history.records)
    ? history.records : [];
  const current = records[records.length - 1];
  const previous = records[records.length - 2];
  if (!current || !previous || !Number.isFinite(current.stored) ||
      !Number.isFinite(previous.stored) || !Number.isSafeInteger(current.tick) ||
      !Number.isSafeInteger(previous.tick) || current.tick <= previous.tick) {
    return null;
  }
  return (current.stored - previous.stored) / (current.tick - previous.tick);
};
const remoteExportRate = (economy, tick) => {
  const buckets = Object.values(economy || {}).flatMap(stats =>
    Object.entries(stats && stats.exportBuckets || {}));
  const recent = buckets.filter(([bucket, amount]) =>
    Number.isFinite(Number(bucket)) && Number(bucket) >= tick - 1500 &&
    Number.isFinite(amount));
  if (!recent.length) return null;
  const first = Math.min(...recent.map(([bucket]) => Number(bucket)));
  const elapsed = Math.max(100, tick - first + 1);
  return recent.reduce((sum, entry) => sum + entry[1], 0) / elapsed;
};

const createEnergyCommand = ({ Game, colonyCommand,
  findSources, findDroppedResources, findTombstones, findRuins,
  findStructures, resourceEnergy = 'energy', structureTypes = {} }) =>
  (...args) => {
    const tick = integer(Game && Game.time);
    if (args.length !== 1 || typeof args[0] !== 'string') {
      return errorResult(tick,
        'ops.energy(roomName) requires one room name');
    }
    const roomName = args[0];
    if (!/^[WE]\d+[NS]\d+$/.test(roomName)) {
      return errorResult(tick, `Invalid Screeps room name: ${roomName}`);
    }
    const room = Game && Game.rooms && Game.rooms[roomName];
    if (!room) return errorResult(tick,
      `Room ${roomName} is not currently visible`);
    if (!room.controller || !room.controller.my) return errorResult(tick,
      `Room ${roomName} is not an owned room`);
    if (typeof colonyCommand !== 'function') return errorResult(tick,
      'Canonical colony health inventory is unavailable');
    const colony = colonyCommand();
    const canonical = colony && colony.ok && Array.isArray(colony.rooms)
      ? colony.rooms.find(candidate => candidate.roomName === roomName) : null;
    if (!canonical) return errorResult(tick,
      `Owned room ${roomName} is missing from the canonical health inventory`);

    const safeFind = type => {
      if (type == null || typeof room.find !== 'function') return null;
      try {
        const found = room.find(type);
        return Array.isArray(found) ? found : null;
      } catch (error) {
        return null;
      }
    };
    const sources = safeFind(findSources);
    const dropped = safeFind(findDroppedResources);
    const tombstones = safeFind(findTombstones);
    const ruins = safeFind(findRuins);
    const structures = safeFind(findStructures);
    const creeps = Game && Game.creeps ? Object.values(Game.creeps).filter(
      creep => creep && creep.room && creep.room.name === roomName) : null;
    const typed = type => structures === null ? null
      : structures.filter(structure => structure.structureType === type);
    const energyDrops = dropped === null ? null : dropped.filter(resource =>
      resource.resourceType === resourceEnergy);
    const dropInventory = energyDrops === null ? null : {
      count: energyDrops.length,
      energy: energyDrops.reduce((sum, resource) =>
        sum + (finite(resource.amount) || 0), 0),
      objects: [...energyDrops].sort((left, right) =>
        String(left.id).localeCompare(String(right.id))).map(resource => ({
        id: resource.id || null, energy: finite(resource.amount)
      }))
    };
    const sourceInventory = sources === null ? null : {
      count: sources.length,
      energy: sources.reduce((sum, source) =>
        sum + (finite(source.energy) || 0), 0),
      capacity: sources.every(source => finite(source.energyCapacity) !== null)
        ? sources.reduce((sum, source) => sum + source.energyCapacity, 0) : null,
      objects: [...sources].sort((left, right) =>
        String(left.id).localeCompare(String(right.id))).map(source => ({
        id: source.id || null, energy: finite(source.energy),
        capacity: finite(source.energyCapacity),
        ticksToRegeneration: finite(source.ticksToRegeneration)
      }))
    };
    const inventoryFor = objects => objects === null ? null
      : aggregate(objects, resourceEnergy);
    const container = inventoryFor(typed(structureTypes.container));
    const link = inventoryFor(typed(structureTypes.link));
    const storage = inventoryFor(typed(structureTypes.storage));
    const terminal = inventoryFor(typed(structureTypes.terminal));
    const spawn = inventoryFor(typed(structureTypes.spawn));
    const extension = inventoryFor(typed(structureTypes.extension));
    const tower = inventoryFor(typed(structureTypes.tower));
    const controllerObjects = structures === null ? null
      : structures.filter(structure =>
        [structureTypes.container, structureTypes.link]
          .includes(structure.structureType) && structure.pos &&
        typeof structure.pos.getRangeTo === 'function' &&
        structure.pos.getRangeTo(room.controller) <= 3);
    const inventory = {
      source: sourceInventory,
      dropped: dropInventory,
      tombstone: inventoryFor(tombstones),
      ruin: inventoryFor(ruins),
      container,
      link,
      storage,
      terminal,
      creep: inventoryFor(creeps),
      spawn,
      extension,
      tower,
      controller: inventoryFor(controllerObjects)
    };

    const demand = room.memory && room.memory.demandPlan || null;
    const scavenging = sumKnown(['dropped', 'tombstone', 'ruin'].map(key =>
      inventory[key] && inventory[key].energy));
    const sourceStored = finite(demand && demand.sourceStored);
    const localTotal = sourceStored === null || scavenging === null ? null
      : sourceStored + scavenging;
    const remoteTotal = finite(canonical.remotes && canonical.remotes.backlog);
    const backlog = {
      local: {
        total: localTotal,
        components: { sourceBuffers: sourceStored, scavenging },
        basis: 'finalized demand-plan source buffers plus dropped, tombstone, and ruin energy; general containers and links are excluded'
      },
      remote: {
        total: remoteTotal,
        basis: 'canonical remote backlog; not added to any local inventory'
      },
      combined: localTotal === null || remoteTotal === null ? null
        : localTotal + remoteTotal
    };

    const laborPlan = room.memory && room.memory.laborPlan || null;
    const laborStats = room.memory && room.memory.laborStats || null;
    const observed = {
      income: null,
      pickup: null,
      delivery: null,
      refill: laborRate(laborStats, 'refiller'),
      build: laborRate(laborStats, 'builder'),
      repair: laborRate(laborStats, 'repairBuilder'),
      upgrade: laborRate(laborStats, 'upgrader'),
      overflow: null,
      remoteExport: remoteExportRate(
        room.memory && room.memory.outpostEconomy, tick),
      storageNet: storedTrend(room.memory && room.memory.roomTrendHistory),
      units: 'energy per tick',
      limits: 'Null means no confirmed ledger. RemoteExport is observed cargo crossing out of an origin room, not confirmed home delivery or overflow. StorageNet is endpoint change and combines all causes.'
    };
    const estimated = {
      income: finite(laborPlan && laborPlan.income),
      pickup: null,
      delivery: null,
      refill: finite(laborPlan && laborPlan.refillUse),
      build: finite(laborPlan && laborPlan.buildBudget),
      repair: finite(laborPlan && laborPlan.repairBudget),
      upgrade: finite(laborPlan && laborPlan.upgradeBudget),
      overflow: null,
      units: 'energy per tick',
      basis: laborPlan ? 'finalized labor plan' : 'unavailable'
    };

    const sourcePressure = sourceStored !== null && container &&
      container.capacity > 0 ? sourceStored / container.capacity : null;
    let bottleneck = 'no dominant energy bottleneck identified';
    let nextAction = 'preserve current finalized assignments and observe';
    if (canonical.logistics && canonical.logistics.flow === 'blocked' ||
        sourcePressure !== null && sourcePressure >= 0.75) {
      bottleneck = 'source collection is behind available source-buffer energy';
      nextAction = 'keep finalized collect lanes draining source buffers';
    } else if (finite(demand && demand.spawnFree) > 0 &&
        (sourceStored > 0 || inventory.storage && inventory.storage.energy > 0)) {
      bottleneck = 'spawn, extension, or tower refill is behind available energy';
      nextAction = 'keep finalized refill lanes supplied before discretionary work';
    } else if (remoteTotal !== null && remoteTotal >= 1000) {
      bottleneck = 'remote collection backlog is elevated';
      nextAction = 'preserve remote haul ownership and drain blocked outposts';
    } else if (canonical.energy && canonical.energy.freeCapacity === 0 &&
        ((canonical.work && canonical.work.buildRemaining > 0) ||
        (canonical.work && canonical.work.repairEnergy > 0))) {
      bottleneck = 'storage is full while paid work remains';
      nextAction = 'spend the finalized build, repair, and upgrade budgets';
    }
    const explanation = {
      bottleneck,
      nextAction,
      storageDirection: observed.storageNet === null ? 'unknown'
        : observed.storageNet > 0 ? 'rising'
          : observed.storageNet < 0 ? 'falling' : 'flat',
      storageRate: observed.storageNet,
      storageRateLimit: 'endpoint trend only; it does not attribute transfers'
    };
    const freshness = {
      liveInventory: observation(tick, tick),
      demandPlan: canonical.observations && canonical.observations.demandPlan
        || observation(demand && demand.tick, tick),
      laborPlan: observation(laborPlan && laborPlan.updated, tick),
      laborStats: observation(laborStats && laborStats.lastTick, tick),
      trend: canonical.observations && canonical.observations.trend
        || observation(null, tick)
    };
    const display = value => value == null ? 'unknown' : String(value);
    const consoleLines = [
      `${roomName} energy @${display(tick)} | ${bottleneck}`,
      `Stored ${display(canonical.energy && canonical.energy.stored)}; ` +
        `spawn ${display(canonical.energy && canonical.energy.spawnAvailable)}/` +
        `${display(canonical.energy && canonical.energy.spawnCapacity)}; ` +
        `storage ${explanation.storageDirection} ` +
        `${display(explanation.storageRate)} energy/tick`,
      `Collection backlog: local ${display(localTotal)}, remote ` +
        `${display(remoteTotal)}, combined ${display(backlog.combined)}`,
      `Observed rates: refill ${display(observed.refill)}, build ` +
        `${display(observed.build)}, repair ${display(observed.repair)}, ` +
        `upgrade ${display(observed.upgrade)}, remote export ` +
        `${display(observed.remoteExport)}`,
      `Plan estimates: income ${display(estimated.income)}, refill ` +
        `${display(estimated.refill)}, build ${display(estimated.build)}, ` +
        `repair ${display(estimated.repair)}, upgrade ` +
        `${display(estimated.upgrade)}`,
      `Next: ${nextAction}`
    ];
    return {
      ok: true,
      tick,
      freshness,
      roomName,
      canonical: {
        health: canonical.health,
        mode: canonical.mode,
        energy: { ...canonical.energy },
        logistics: { ...canonical.logistics }
      },
      inventory,
      inventoryNote: 'Controller energy is a diagnostic view of nearby container and link energy and overlaps those inventory categories.',
      backlog,
      rates: { observed, estimated },
      plan: demand ? {
        tick: integer(demand.tick),
        phase: demand.energyWorkPhase || null,
        lanes: demand.lanes ? { ...demand.lanes } : null,
        refillCarrier: demand.refillCarrier || null,
        refillCarriers: Array.isArray(demand.refillCarriers)
          ? [...demand.refillCarriers].sort() : null,
        commitments: demand.commitments
          ? Object.keys(demand.commitments).sort() : null
      } : null,
      explanation,
      console: consoleLines.join('\n')
    };
  };

module.exports = { ENERGY_DEFINITION, createEnergyCommand, observation };
