'use strict';

const REMOTES_DEFINITION = Object.freeze({
  name: 'remotes',
  signature: 'ops.remotes(homeRoom)',
  purpose: 'Explain remote rooms, coverage, routes, flow, and finalized authority.',
  example: "ops.remotes('W7N4')",
  mode: 'read-only',
  writes: 'none',
  expires: null,
  related: Object.freeze(['colony', 'energy', 'room', 'spawn', 'work'])
});

const SURVEYS = Object.freeze([
  Object.freeze({ key: 'leftSurvey', lane: 'left',
    roadPlan: 'remoteRoadPlan' }),
  Object.freeze({ key: 'southSurvey', lane: 'south',
    roadPlan: 'southRemoteRoadPlan' }),
  Object.freeze({ key: 'southwestSurvey', lane: 'southwest',
    roadPlan: 'southwestRemoteRoadPlan' })
]);

const finite = value => Number.isFinite(value) ? value : null;
const integer = value => Number.isSafeInteger(value) ? value : null;
const observation = (updated, tick, current = false) => {
  if (current && Number.isSafeInteger(tick)) return {
    tick, age: 0, freshness: 'current tick'
  };
  if (!Number.isSafeInteger(updated)) return {
    tick: null, age: null, freshness: 'unknown'
  };
  const age = Number.isSafeInteger(tick) ? Math.max(0, tick - updated) : null;
  return { tick: updated, age, freshness: age === 0 ? 'current tick'
    : age === null ? 'unknown' : `stale by ${age} ticks` };
};
const errorResult = (tick, message, available = []) => ({
  ok: false,
  tick,
  freshness: 'current tick',
  error: message,
  available,
  console: available.length ? `${message}. Owned rooms: ${available.join(', ')}`
    : message
});
const safeFind = (room, type) => {
  if (!room || type == null || typeof room.find !== 'function') return null;
  try {
    const found = room.find(type);
    return Array.isArray(found) ? found : null;
  } catch (error) {
    return null;
  }
};
const energyInStore = (object, resource) => object && object.store
  ? finite(object.store[resource]) : null;
const capacityInStore = (object, resource) => object && object.store &&
  typeof object.store.getCapacity === 'function'
  ? finite(object.store.getCapacity(resource)) : null;
const sumKnown = values => values.every(value => value !== null)
  ? values.reduce((sum, value) => sum + value, 0) : null;
const average = values => values.length &&
  values.every(Number.isFinite)
  ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = value => Number.isFinite(value)
  ? Math.round(value * 1000) / 1000 : null;
const recentRate = (buckets, tick, window = 1500) => {
  if (!buckets || !Number.isSafeInteger(tick)) return null;
  const entries = Object.entries(buckets).map(([start, amount]) =>
    [Number(start), Number(amount)]).filter(([start, amount]) =>
    Number.isFinite(start) && Number.isFinite(amount) &&
    start >= tick - window && start <= tick);
  if (!entries.length) return null;
  const first = Math.min(...entries.map(entry => entry[0]));
  const elapsed = Math.max(100, tick - first + 1);
  return entries.reduce((sum, entry) => sum + entry[1], 0) / elapsed;
};
const roleFor = memory => {
  if (!memory) return null;
  if (memory.role === 'remote-miner') return 'miner';
  if (memory.role === 'remote-hauler') return 'hauler';
  if (memory.role === 'remote-reserver') return 'reserver';
  if (memory.role === 'remote-builder' || memory.role === 'builder' &&
      memory.builderScope === 'outpost') return 'builder';
  if (memory.role === 'defender') return 'defender';
  return null;
};
const homeFor = memory => memory && (memory.remoteHome || memory.home) || null;
const targetFor = memory => memory && (memory.remoteRoom ||
  memory.defenseTargetRoom) || null;

const buildCoverage = ({ creeps, survey, remoteMemory, populationPolicy,
  hasRemoteReplacementLife, getRemoteReplacementLead }) => {
  const reservationRooms = populationPolicy && populationPolicy.operations &&
    populationPolicy.operations.reservationRooms || [];
  const targets = {
    miner: integer(survey.remoteMinerTarget),
    hauler: integer(survey.remoteHaulerTarget),
    reserver: reservationRooms.includes(survey.targetRoom) ? 1
      : survey.active ? integer(populationPolicy && populationPolicy.remote &&
        populationPolicy.remote.reserversMin) === 0 ? 0 : 1 : 0,
    builder: integer(survey.remoteBuilderTarget),
    defender: integer(remoteMemory && remoteMemory.combatStatus &&
      remoteMemory.combatStatus.requiredDefenders) || 0
  };
  const result = {};
  for (const role of ['miner', 'hauler', 'reserver', 'builder', 'defender']) {
    const members = creeps.filter(creep => roleFor(creep.memory) === role)
      .sort((left, right) => left.name.localeCompare(right.name));
    const rows = members.map(creep => {
      const lead = typeof getRemoteReplacementLead === 'function'
        ? finite(getRemoteReplacementLead(creep)) : null;
      const viable = creep.spawning ||
        (typeof hasRemoteReplacementLife === 'function'
          ? Boolean(hasRemoteReplacementLife(creep))
          : lead === null || finite(creep.ticksToLive) === null
            ? null : creep.ticksToLive > lead);
      return {
        name: creep.name,
        room: creep.room && creep.room.name || null,
        spawning: Boolean(creep.spawning),
        ticksToLive: finite(creep.ticksToLive),
        replacementLead: lead,
        viable,
        replacementDue: viable === null ? null : !viable,
        retiring: Boolean(creep.memory.staffingRetire ||
          creep.memory.role === 'retire'),
        slot: integer(role === 'miner' ? creep.memory.remoteSlot
          : role === 'hauler' ? creep.memory.remoteHaulerSlot
            : role === 'builder' ? creep.memory.remoteBuilderSlot : null)
      };
    });
    const viable = rows.filter(row => row.viable === true &&
      !row.retiring).length;
    const target = targets[role];
    result[role] = {
      target,
      current: rows.filter(row => !row.retiring).length,
      viable,
      spawning: rows.filter(row => row.spawning).length,
      expiring: rows.filter(row => row.replacementDue === true).length,
      retiring: rows.filter(row => row.retiring).length,
      missing: target === null ? null : Math.max(0, target - viable),
      replacementCovered: target === null ? null : viable >= target,
      creeps: rows
    };
  }
  return result;
};

const liveInventory = ({ room, findSources, findStructures,
  findConstructionSites, findDroppedResources, findHostileCreeps,
  findHostileStructures, resourceEnergy, structureContainer,
  structureWall, structureRampart, repairPower }) => {
  if (!room) return {
    sources: null, buffers: null, drops: null, sites: null,
    repairs: null, threats: null
  };
  const sources = safeFind(room, findSources);
  const structures = safeFind(room, findStructures);
  const sites = safeFind(room, findConstructionSites);
  const drops = safeFind(room, findDroppedResources);
  const hostileCreeps = safeFind(room, findHostileCreeps);
  const hostileStructures = safeFind(room, findHostileStructures);
  const orderedSources = sources === null ? null : [...sources].sort((a, b) =>
    String(a.id).localeCompare(String(b.id)));
  const sourceRows = orderedSources === null ? null : orderedSources.map(source => ({
    id: source.id || null,
    energy: finite(source.energy),
    capacity: finite(source.energyCapacity),
    ticksToRegeneration: finite(source.ticksToRegeneration)
  }));
  const containers = structures === null || orderedSources === null ? null
    : structures.filter(structure => structure.structureType ===
      structureContainer && orderedSources.some(source => source.pos &&
        structure.pos && typeof source.pos.getRangeTo === 'function' &&
        source.pos.getRangeTo(structure) <= 2)).sort((a, b) =>
      String(a.id).localeCompare(String(b.id)));
  const bufferRows = containers === null ? null : containers.map(container => ({
    id: container.id || null,
    energy: energyInStore(container, resourceEnergy),
    capacity: capacityInStore(container, resourceEnergy),
    hits: finite(container.hits),
    hitsMax: finite(container.hitsMax)
  }));
  const energyDrops = drops === null ? null : drops.filter(drop =>
    drop.resourceType === resourceEnergy);
  const siteRows = sites === null ? null : [...sites].sort((a, b) =>
    String(a.id).localeCompare(String(b.id))).map(site => ({
    id: site.id || null,
    type: site.structureType || null,
    progress: finite(site.progress),
    progressTotal: finite(site.progressTotal),
    remaining: finite(site.progressTotal) === null || finite(site.progress) === null
      ? null : Math.max(0, site.progressTotal - site.progress)
  }));
  const repairRows = structures === null ? null : structures.filter(structure =>
    finite(structure.hits) !== null && finite(structure.hitsMax) !== null &&
    structure.hits < structure.hitsMax &&
    ![structureWall, structureRampart].includes(structure.structureType))
    .sort((a, b) => a.hits / Math.max(1, a.hitsMax) -
      b.hits / Math.max(1, b.hitsMax) ||
      String(a.id).localeCompare(String(b.id))).map(structure => ({
      id: structure.id || null,
      type: structure.structureType || null,
      hits: structure.hits,
      hitsMax: structure.hitsMax,
      missingHits: structure.hitsMax - structure.hits,
      energy: Number.isFinite(repairPower) && repairPower > 0
        ? Math.ceil((structure.hitsMax - structure.hits) / repairPower) : null
    }));
  return {
    sources: sourceRows === null ? null : {
      count: sourceRows.length,
      energy: sumKnown(sourceRows.map(row => row.energy)),
      capacity: sumKnown(sourceRows.map(row => row.capacity)),
      objects: sourceRows
    },
    buffers: bufferRows === null ? null : {
      count: bufferRows.length,
      energy: sumKnown(bufferRows.map(row => row.energy)),
      capacity: sumKnown(bufferRows.map(row => row.capacity)),
      objects: bufferRows
    },
    drops: energyDrops === null ? null : {
      count: energyDrops.length,
      energy: energyDrops.every(drop => finite(drop.amount) !== null)
        ? energyDrops.reduce((sum, drop) => sum + drop.amount, 0) : null
    },
    sites: siteRows === null ? null : {
      count: siteRows.length,
      remaining: sumKnown(siteRows.map(row => row.remaining)),
      objects: siteRows
    },
    repairs: repairRows === null ? null : {
      count: repairRows.length,
      energy: sumKnown(repairRows.map(row => row.energy)),
      objects: repairRows
    },
    threats: hostileCreeps === null || hostileStructures === null ? null : {
      creeps: hostileCreeps.length,
      structures: hostileStructures.length,
      total: hostileCreeps.length + hostileStructures.length
    }
  };
};

const routeStatus = ({ homeMemory, surveyEntry, target, assignedCreeps,
  tick }) => {
  const road = homeMemory[surveyEntry.roadPlan] || null;
  const haul = homeMemory.remoteHaulRoutes &&
    homeMemory.remoteHaulRoutes[target] || null;
  const paths = road && Array.isArray(road.paths) ? road.paths : [];
  const routeLengths = haul && Array.isArray(haul.routeLengths)
    ? haul.routeLengths.filter(Number.isFinite) : [];
  const roundTrips = haul && Array.isArray(haul.lanes)
    ? haul.lanes.map(lane => finite(lane.roundTripTicks))
      .filter(Number.isFinite) : [];
  const pathRooms = new Set(paths.flatMap(path =>
    Array.isArray(path.points) ? path.points.map(point => point.roomName) : []));
  pathRooms.add(target);
  const congestion = assignedCreeps.map(creep => creep.memory.navRecovery)
    .filter(recovery => recovery && Number.isSafeInteger(recovery.tick) &&
      recovery.tick <= tick && tick - recovery.tick <= 200 &&
      pathRooms.has(recovery.room) &&
      ['blocked', 'oscillation'].includes(recovery.reason))
    .map(recovery => ({
      tick: recovery.tick,
      age: tick - recovery.tick,
      reason: recovery.reason,
      room: recovery.room,
      x: integer(recovery.x),
      y: integer(recovery.y),
      stuck: integer(recovery.stuck),
      result: integer(recovery.result)
    })).sort((a, b) => b.tick - a.tick ||
      a.room.localeCompare(b.room) || (a.x || 0) - (b.x || 0));
  return {
    available: Boolean(road || haul),
    road: road ? {
      observation: observation(integer(road.created), tick),
      paths: paths.length,
      incomplete: paths.filter(path => path.incomplete).length,
      tiles: paths.reduce((sum, path) => sum +
        (Array.isArray(path.points) ? path.points.length : 0), 0)
    } : null,
    hauling: haul ? {
      observation: observation(integer(haul.planned || haul.updated), tick),
      target: integer(haul.target),
      saturated: typeof haul.saturated === 'boolean' ? haul.saturated : null,
      carryCapacity: finite(haul.carryCapacity),
      routeLengths: [...routeLengths],
      lanes: Array.isArray(haul.lanes) ? haul.lanes.map(lane => ({
        sourceId: lane.sourceId || null,
        roundTripTicks: finite(lane.roundTripTicks),
        basis: lane.basis || null,
        backlog: finite(lane.backlog),
        requiredRate: finite(lane.requiredRate),
        projectedRate: finite(lane.projectedRate),
        actualRate: finite(lane.actualRate)
      })) : null
    } : null,
    travelEstimate: {
      oneWayMin: routeLengths.length ? Math.min(...routeLengths) : null,
      oneWayMax: routeLengths.length ? Math.max(...routeLengths) : null,
      oneWayMean: round(average(routeLengths)),
      roundTripMean: round(average(roundTrips)),
      basis: roundTrips.length ? 'observed hauling lanes'
        : routeLengths.length ? 'cached path lengths' : 'unavailable'
    },
    congestion: {
      events: congestion,
      count: congestion.length,
      freshness: congestion.length ? observation(congestion[0].tick, tick)
        : observation(null, tick),
      evidenceLimit: 'Recent creep recovery records are sampled evidence, not a complete congestion log.'
    }
  };
};

const controllerStatus = ({ room, reservationStatus, tick }) => {
  if (room) {
    const controller = room.controller;
    if (!controller) return {
      observation: observation(tick, tick, true),
      ownership: 'no-controller', owner: null, reservation: null
    };
    return {
      observation: observation(tick, tick, true),
      ownership: controller.my ? 'owned-by-home-user'
        : controller.owner ? 'foreign-owned' : 'neutral',
      owner: controller.owner && controller.owner.username || null,
      reservation: controller.reservation ? {
        username: controller.reservation.username || null,
        ticksToEnd: finite(controller.reservation.ticksToEnd)
      } : null
    };
  }
  if (!reservationStatus) return {
    observation: observation(null, tick),
    ownership: 'unknown', owner: null, reservation: null
  };
  const saved = reservationStatus.observedReservation;
  return {
    observation: observation(integer(reservationStatus.tick), tick),
    ownership: reservationStatus.owner ? 'last-observed-owned'
      : saved ? 'last-observed-neutral-reserved' : 'last-observed-neutral',
    owner: reservationStatus.owner || null,
    reservation: saved ? {
      username: saved.username || null,
      ticksToEnd: finite(saved.ticksToEnd)
    } : reservationStatus.ticksToEnd == null ? null : {
      username: null, ticksToEnd: finite(reservationStatus.ticksToEnd)
    }
  };
};

const createRemotesCommand = ({ Game, Memory,
  findSources, findStructures, findConstructionSites,
  findDroppedResources, findHostileCreeps, findHostileStructures,
  resourceEnergy = 'energy', structureContainer = 'container',
  structureWall = 'constructedWall', structureRampart = 'rampart',
  repairPower = 100, hasRemoteReplacementLife,
  getRemoteReplacementLead }) => (...args) => {
  const tick = integer(Game && Game.time);
  if (args.length !== 1 || typeof args[0] !== 'string') {
    return errorResult(tick,
      'ops.remotes(homeRoom) requires one owned home room name');
  }
  const homeName = args[0];
  if (!/^[WE]\d+[NS]\d+$/.test(homeName)) {
    return errorResult(tick, `Invalid Screeps room name: ${homeName}`);
  }
  const owned = Object.values(Game && Game.rooms || {}).filter(room =>
    room && room.controller && room.controller.my).map(room => room.name).sort();
  const home = Game && Game.rooms && Game.rooms[homeName];
  if (!home) return errorResult(tick,
    `Home room ${homeName} is not currently visible`, owned);
  if (!home.controller || !home.controller.my) return errorResult(tick,
    `Room ${homeName} is not an owned home room`, owned);
  const homeMemory = home.memory || Memory && Memory.rooms &&
    Memory.rooms[homeName] || {};
  const populationPolicy = homeMemory.populationPolicy || null;
  const entries = SURVEYS.map(entry => ({
    ...entry, survey: homeMemory[entry.key]
  })).filter(entry => entry.survey &&
    typeof entry.survey.targetRoom === 'string');
  const allCreeps = Object.values(Game && Game.creeps || {});
  const remoteRows = entries.map(entry => {
    const survey = entry.survey;
    const target = survey.targetRoom;
    const remote = Game.rooms && Game.rooms[target] || null;
    const remoteMemory = remote && remote.memory || Memory && Memory.rooms &&
      Memory.rooms[target] || {};
    const lastVisibleTick = remote ? tick : Math.max(
      integer(remoteMemory.roomStatus && remoteMemory.roomStatus.updated) || 0,
      integer(remoteMemory.combatStatus && remoteMemory.combatStatus.updated) || 0
    ) || null;
    const assigned = allCreeps.filter(creep => creep && creep.memory &&
      homeFor(creep.memory) === homeName &&
      targetFor(creep.memory) === target);
    const inventory = liveInventory({ room: remote, findSources,
      findStructures, findConstructionSites, findDroppedResources,
      findHostileCreeps, findHostileStructures, resourceEnergy,
      structureContainer, structureWall, structureRampart, repairPower });
    const route = routeStatus({ homeMemory, surveyEntry: entry, target,
      assignedCreeps: assigned, tick });
    const economy = homeMemory.outpostEconomy &&
      homeMemory.outpostEconomy[target] || null;
    const deliveryPolicy = survey.deliveryPolicy || null;
    const support = survey.active ? 'active'
      : survey.status === 'owned-colony' || survey.ownedRoom
        ? 'owned-colony' : 'unsupported';
    const threats = inventory.threats;
    const blockedReasons = [];
    if (support === 'unsupported') blockedReasons.push(
      survey.status ? `survey unsupported: ${survey.status}`
        : 'survey is not active');
    if (!remote) blockedReasons.push('remote room is not currently visible');
    if (!route.available) blockedReasons.push('no cached remote route');
    if (route.road && route.road.incomplete > 0) {
      blockedReasons.push(`${route.road.incomplete} route path(s) incomplete`);
    }
    if (deliveryPolicy && deliveryPolicy.blocked) {
      blockedReasons.push(deliveryPolicy.reason || 'delivery policy blocked');
    } else if (deliveryPolicy && deliveryPolicy.degraded) {
      blockedReasons.push(deliveryPolicy.reason || 'delivery flow degraded');
    }
    if (threats && threats.total > 0) {
      blockedReasons.push(`${threats.total} live threat(s)`);
    }
    const controller = controllerStatus({ room: remote,
      reservationStatus: homeMemory.reservationStatus &&
        homeMemory.reservationStatus[target], tick });
    if (controller.ownership === 'foreign-owned') {
      blockedReasons.push(`foreign owner ${controller.owner}`);
    } else if (controller.reservation && controller.reservation.username &&
        home.controller.owner && controller.reservation.username !==
          home.controller.owner.username) {
      blockedReasons.push(`foreign reservation ${controller.reservation.username}`);
    }
    const permissions = populationPolicy && populationPolicy.permissions || null;
    const policyObservation = observation(integer(populationPolicy &&
      populationPolicy.updated), tick);
    const authority = {
      observation: policyObservation,
      mode: populationPolicy && populationPolicy.mode || null,
      health: populationPolicy && populationPolicy.health || null,
      recovery: permissions && typeof permissions.remoteHaulingRecovery ===
        'boolean' ? permissions.remoteHaulingRecovery : null,
      maintenance: permissions && typeof permissions.remoteMaintenance ===
        'boolean' ? permissions.remoteMaintenance : null,
      growth: permissions && typeof permissions.remoteGrowth === 'boolean'
        ? permissions.remoteGrowth : null,
      withdrawal: support !== 'active' ? true
        : permissions && typeof permissions.remoteMaintenance === 'boolean'
          ? !permissions.remoteMaintenance : null,
      basis: support !== 'active'
        ? 'finalized survey is inactive'
        : populationPolicy
          ? 'finalized home population policy permissions'
          : 'finalized home policy unavailable'
    };
    const coverage = buildCoverage({ creeps: assigned, survey,
      remoteMemory, populationPolicy, hasRemoteReplacementLife,
      getRemoteReplacementLead });
    return {
      roomName: target,
      lane: entry.lane,
      surveyKey: entry.key,
      support,
      active: Boolean(survey.active),
      surveyStarted: integer(survey.started),
      visibility: {
        visible: Boolean(remote),
        observation: observation(lastVisibleTick, tick, Boolean(remote))
      },
      controller,
      inventory,
      knownSourceNeeds: Array.isArray(survey.remoteWorkNeeds)
        ? survey.remoteWorkNeeds.map(need => ({
          slot: integer(need.slot), minMiners: integer(need.minMiners),
          requiredWork: finite(need.requiredWork)
        })).sort((a, b) => (a.slot || 0) - (b.slot || 0)) : null,
      coverage,
      route,
      delivery: {
        observation: observation(integer(deliveryPolicy &&
          deliveryPolicy.updated), tick),
        policy: deliveryPolicy ? {
          blocked: Boolean(deliveryPolicy.blocked),
          degraded: Boolean(deliveryPolicy.degraded),
          prioritizeHauling: Boolean(deliveryPolicy.prioritizeHauling),
          allowMining: typeof deliveryPolicy.allowMining === 'boolean'
            ? deliveryPolicy.allowMining : null,
          allowConstruction: typeof deliveryPolicy.allowConstruction ===
            'boolean' ? deliveryPolicy.allowConstruction : null,
          reason: deliveryPolicy.reason || null,
          backlog: finite(deliveryPolicy.backlog),
          drought: finite(deliveryPolicy.drought)
        } : null,
        throughput: economy ? {
          borderExportPerTick: round(recentRate(economy.exportBuckets, tick)),
          homeDeliveryPerTick: round(recentRate(economy.buckets, tick)),
          lastExport: integer(economy.lastExport),
          lastDelivery: integer(economy.lastDelivery),
          exportedTotal: finite(economy.exportedTotal),
          deliveredTotal: finite(economy.deliveredTotal),
          evidenceLimit: 'Border export and home delivery are separate observed ledgers; rates use retained recent buckets.'
        } : null
      },
      authority,
      blockedReasons: blockedReasons.sort()
    };
  }).sort((a, b) => a.roomName.localeCompare(b.roomName) ||
    a.lane.localeCompare(b.lane));
  const display = value => value == null ? '?' : String(value);
  const sign = value => value === true ? 'yes'
    : value === false ? 'no' : 'unknown';
  const lines = [`${homeName} remotes @${display(tick)} | ` +
    `${remoteRows.length} supported survey room(s) | finalized policy ` +
    `${observation(integer(populationPolicy && populationPolicy.updated), tick).freshness}`];
  for (const row of remoteRows) {
    const inventory = row.inventory;
    const route = row.route.travelEstimate;
    const coverage = row.coverage;
    lines.push(`${row.roomName} ${row.lane} ${row.support} | visibility ` +
      `${row.visibility.observation.freshness} | source ` +
      `${display(inventory.sources && inventory.sources.energy)}/` +
      `${display(inventory.sources && inventory.sources.capacity)}, buffer ` +
      `${display(inventory.buffers && inventory.buffers.energy)}, drops ` +
      `${display(inventory.drops && inventory.drops.energy)}`);
    lines.push(`  crew M ${coverage.miner.viable}/${display(coverage.miner.target)}, ` +
      `H ${coverage.hauler.viable}/${display(coverage.hauler.target)}, ` +
      `R ${coverage.reserver.viable}/${display(coverage.reserver.target)}, ` +
      `B ${coverage.builder.viable}/${display(coverage.builder.target)}, ` +
      `D ${coverage.defender.viable}/${display(coverage.defender.target)} | ` +
      `route ${route.basis} ${display(route.oneWayMean)} ticks | ` +
      `export ${display(row.delivery.throughput &&
        row.delivery.throughput.borderExportPerTick)}/tick`);
    lines.push(`  plan recover ${sign(row.authority.recovery)}, maintain ` +
      `${sign(row.authority.maintenance)}, grow ${sign(row.authority.growth)}, ` +
      `withdraw ${sign(row.authority.withdrawal)} | ` +
      `${row.blockedReasons.length ? row.blockedReasons.join('; ') : 'no blocked reason'}`);
  }
  if (!remoteRows.length) lines.push('No configured remote surveys for this home room.');
  return {
    ok: true,
    tick,
    freshness: 'current tick with per-source observation ages',
    homeRoom: homeName,
    finalizedPolicy: populationPolicy ? {
      observation: observation(integer(populationPolicy.updated), tick),
      mode: populationPolicy.mode || null,
      health: populationPolicy.health || null,
      permissions: populationPolicy.permissions
        ? { ...populationPolicy.permissions } : null,
      remote: populationPolicy.remote ? { ...populationPolicy.remote } : null
    } : null,
    remotes: remoteRows,
    limits: {
      unseen: 'Unseen live inventory remains null; last observations are labelled stale or unknown.',
      authority: 'The command reports saved finalized policy and survey authority and never recalculates targets.',
      congestion: 'Recovery records are sampled evidence, not a complete collision ledger.'
    },
    console: lines.join('\n')
  };
};

module.exports = { REMOTES_DEFINITION, createRemotesCommand, observation,
  recentRate };
