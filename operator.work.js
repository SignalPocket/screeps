'use strict';

const WORK_DEFINITION = Object.freeze({
  name: 'work',
  signature: "ops.work(roomName)",
  purpose: 'Explain funded build, repair, and controller work for one room.',
  example: "ops.work('W7N4')",
  mode: 'read-only',
  writes: 'none',
  expires: null,
  related: Object.freeze(['colony', 'energy', 'room', 'spawn'])
});

const finite = value => Number.isFinite(value) ? value : null;
const integer = value => Number.isSafeInteger(value) ? value : null;
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
const activeParts = (creep, part) => {
  if (creep && typeof creep.getActiveBodyparts === 'function') {
    return finite(creep.getActiveBodyparts(part));
  }
  if (!creep || !Array.isArray(creep.body)) return null;
  return creep.body.filter(item =>
    (typeof item === 'string' ? item : item.type) === part &&
    (typeof item === 'string' || item.hits > 0)).length;
};
const urgency = ratio => ratio < 0.25 ? 'critical'
  : ratio < 0.5 ? 'urgent' : 'routine';
const sum = (rows, field) => rows.reduce((total, row) =>
  total + (finite(row[field]) || 0), 0);
const completion = (energy, rate) => energy == null || rate == null
  ? null : rate > 0 ? Math.ceil(energy / rate) : energy === 0 ? 0 : null;
const groupRows = (rows, keys) => {
  const groups = new Map();
  for (const row of rows) {
    const key = keys.map(field => String(row[field])).join(':');
    if (!groups.has(key)) groups.set(key, {
      ...Object.fromEntries(keys.map(field => [field, row[field]])),
      count: 0, progressRemaining: 0, energyRemaining: 0,
      hitDeficit: 0, fundedEnergy: 0
    });
    const group = groups.get(key);
    group.count++;
    group.progressRemaining += finite(row.progressRemaining) || 0;
    group.energyRemaining += finite(row.energyRemaining) || 0;
    group.hitDeficit += finite(row.hitDeficit) || 0;
    group.fundedEnergy += finite(row.fundedEnergy) || 0;
  }
  return [...groups.values()].sort((left, right) =>
    String(keys.map(field => left[field])).localeCompare(
      String(keys.map(field => right[field]))));
};
const workerLane = creep => {
  const memory = creep.memory || {};
  const lane = memory.workJob && memory.workJob.lane || memory.demandLane;
  if (['build', 'repair', 'upgrade'].includes(lane)) return lane;
  if (['build', 'dig-road'].includes(memory.task)) return 'build';
  if (String(memory.task || '').includes('repair')) return 'repair';
  if (['upgrade', 'urgent-upgrade'].includes(memory.task) ||
      memory.role === 'upgrader') return 'upgrade';
  return null;
};
const workerState = creep => {
  const task = String(creep.memory && creep.memory.task || '');
  if (task.includes('blocked') || ['wait-job', 'await-supply']
    .includes(task)) return 'blocked';
  if (task.includes('park') || task.includes('stage') ||
      task === 'standby') return 'parked';
  if (creep.memory && creep.memory.home && creep.room &&
      creep.room.name !== creep.memory.home ||
      /(load|get|seek|travel|return)/.test(task)) return 'traveling';
  return workerLane(creep) ? 'assigned' : 'parked';
};

const createWorkCommand = ({ Game, colonyCommand, constructionPriority,
  findConstructionSites, findStructures, workPart = 'work',
  structureWall = 'constructedWall', structureRampart = 'rampart',
  structureRoad = 'road', structureContainer = 'container',
  repairPower = 100, buildPower = 5 }) => (...args) => {
  const tick = integer(Game && Game.time);
  if (args.length !== 1 || typeof args[0] !== 'string') return errorResult(
    tick, 'ops.work(roomName) requires one room name');
  const roomName = args[0];
  if (!/^[WE]\d+[NS]\d+$/.test(roomName)) return errorResult(tick,
    `Invalid Screeps room name: ${roomName}`);
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
  const sites = safeFind(findConstructionSites);
  const structures = safeFind(findStructures);
  const demand = room.memory && room.memory.demandPlan || null;
  const labor = room.memory && room.memory.laborPlan || null;
  let buildFunding = finite(demand && demand.buildRemaining);
  buildFunding = buildFunding === null ? null : Math.ceil(buildFunding /
    Math.max(1, buildPower));
  const orderedSites = sites === null ? null : [...sites].sort((left, right) => {
    const leftPriority = constructionPriority &&
      typeof constructionPriority.priority === 'function'
      ? constructionPriority.priority(left) : null;
    const rightPriority = constructionPriority &&
      typeof constructionPriority.priority === 'function'
      ? constructionPriority.priority(right) : null;
    return (leftPriority ?? 999) - (rightPriority ?? 999) ||
      String(left.structureType).localeCompare(String(right.structureType)) ||
      String(left.id).localeCompare(String(right.id));
  });
  let remainingBuildFunding = buildFunding;
  const constructionRows = orderedSites === null ? null : orderedSites.map(
    site => {
      const progressRemaining = Number.isFinite(site.progressTotal) &&
        Number.isFinite(site.progress)
        ? Math.max(0, site.progressTotal - site.progress) : null;
      const energyRemaining = progressRemaining === null ? null
        : Math.ceil(progressRemaining / Math.max(1, buildPower));
      const priority = constructionPriority &&
        typeof constructionPriority.priority === 'function'
        ? constructionPriority.priority(site) : null;
      const allowed = constructionPriority &&
        typeof constructionPriority.allowsSite === 'function'
        ? constructionPriority.allowsSite(roomName, orderedSites, site) : null;
      const fundedEnergy = remainingBuildFunding === null ||
        energyRemaining === null || allowed === false ? null
        : Math.min(energyRemaining, remainingBuildFunding);
      if (fundedEnergy !== null) {
        remainingBuildFunding = Math.max(0,
          remainingBuildFunding - fundedEnergy);
      }
      return { id: site.id || null, type: site.structureType || null,
        priority, allowedByPriority: allowed,
        progress: finite(site.progress), progressTotal: finite(site.progressTotal),
        progressRemaining, energyRemaining, fundedEnergy };
    });

  let repairFunding = finite(demand && demand.repairEnergy);
  const repairCandidates = structures === null ? null : structures.filter(
    structure => structure && Number.isFinite(structure.hits) &&
      Number.isFinite(structure.hitsMax) && structure.hitsMax > 0)
    .sort((left, right) => left.hits / left.hitsMax -
      right.hits / right.hitsMax || String(left.structureType).localeCompare(
        String(right.structureType)) || String(left.id).localeCompare(
          String(right.id)));
  let remainingRepairFunding = repairFunding;
  const repairRows = repairCandidates === null ? null : repairCandidates.map(
    structure => {
      const barrier = [structureWall, structureRampart]
        .includes(structure.structureType);
      const eligible = !barrier && (structure.my === true ||
        [structureRoad, structureContainer].includes(
          structure.structureType));
      const ratio = structure.hits / structure.hitsMax;
      const fundedTargetHits = !eligible ? structure.hits
        : Math.max(structure.hits, Math.floor(structure.hitsMax * 0.75));
      const fundedNeed = Math.ceil(Math.max(0,
        fundedTargetHits - structure.hits) / Math.max(1, repairPower));
      const fundedEnergy = remainingRepairFunding === null ? null
        : Math.min(fundedNeed, remainingRepairFunding);
      if (fundedEnergy !== null) remainingRepairFunding = Math.max(0,
        remainingRepairFunding - fundedEnergy);
      return {
        id: structure.id || null,
        type: structure.structureType || null,
        urgency: urgency(ratio),
        hits: structure.hits,
        hitsMax: structure.hitsMax,
        hitDeficit: Math.max(0, structure.hitsMax - structure.hits),
        fundedTargetHits,
        fundedEnergy,
        theoreticalEnergy: Math.ceil(Math.max(0,
          structure.hitsMax - structure.hits) / Math.max(1, repairPower)),
        barrier,
        eligible,
        funding: barrier ? 'excluded from finalized repair plan'
          : !eligible ? 'not an owned or maintainable room asset'
          : 'bounded at 75% hits and capped by finalized repair energy'
      };
    }).filter(row => row.hitDeficit > 0);

  const homeCreeps = Game && Game.creeps ? Object.values(Game.creeps)
    .filter(creep => creep && creep.memory && creep.memory.home === roomName)
    .sort((left, right) => String(left.name).localeCompare(String(right.name)))
    : null;
  const workerRows = homeCreeps === null ? null : homeCreeps.map(creep => ({
    name: creep.name || null,
    role: creep.memory.role || null,
    bodyType: creep.memory.bodyType || null,
    lane: workerLane(creep),
    state: workerState(creep),
    task: creep.memory.task || null,
    workParts: activeParts(creep, workPart),
    energy: creep.store ? finite(creep.store.energy) : null,
    roomName: creep.room && creep.room.name || null
  })).filter(row => row.lane || ['builder', 'worker', 'upgrader']
    .includes(row.role));
  const count = (lane, state) => workerRows === null ? null
    : workerRows.filter(row => (!lane || row.lane === lane) &&
      (!state || row.state === state)).length;
  const workParts = lane => workerRows === null ? null
    : workerRows.filter(row => row.lane === lane).reduce((total, row) =>
      total + (row.workParts || 0), 0);
  const desired = kind => finite(labor && labor[kind] &&
    labor[kind].desired);
  const current = kind => workerRows === null ? null : workerRows.filter(row =>
    kind === 'builder' ? row.lane === 'build'
      : kind === 'repairBuilder' ? row.lane === 'repair'
        : row.lane === 'upgrade').length;
  const missing = kind => desired(kind) === null || current(kind) === null
    ? null : Math.max(0, desired(kind) - current(kind));
  const buildEnergy = constructionRows === null || buildFunding === null ? null
    : sum(constructionRows, 'fundedEnergy');
  const repairEnergy = repairRows === null || repairFunding === null ? null
    : sum(repairRows, 'fundedEnergy');
  const controllerRemaining = finite(room.controller.progressTotal) === null ||
    finite(room.controller.progress) === null ? null
    : Math.max(0, room.controller.progressTotal - room.controller.progress);
  const budgets = {
    units: 'energy per tick',
    build: finite(labor && labor.buildBudget),
    repair: finite(labor && labor.repairBudget),
    upgrade: finite(labor && labor.upgradeBudget),
    basis: labor ? 'finalized labor plan' : 'unavailable'
  };
  const lanes = {
    build: { fundedEnergy: buildEnergy, theoreticalEnergy:
      constructionRows === null ? null : sum(constructionRows,
        'energyRemaining'), appliedWork: workParts('build'),
      expectedCompletionTicks: completion(buildEnergy, budgets.build) },
    repair: { fundedEnergy: repairEnergy, theoreticalEnergy:
      repairRows === null ? null : sum(repairRows, 'theoreticalEnergy'),
      appliedWork: workParts('repair'),
      expectedCompletionTicks: completion(repairEnergy, budgets.repair) },
    upgrade: { fundedEnergy: controllerRemaining,
      theoreticalEnergy: controllerRemaining,
      appliedWork: workParts('upgrade'),
      expectedCompletionTicks: completion(controllerRemaining,
        budgets.upgrade) }
  };
  const workerSummary = {
    assigned: count(null, 'assigned'),
    traveling: count(null, 'traveling'),
    blocked: count(null, 'blocked'),
    parked: count(null, 'parked'),
    missing: { build: missing('builder'), repair: missing('repairBuilder'),
      upgrade: missing('upgrader') }
  };
  const barriers = repairRows === null ? null : {
    wall: repairRows.filter(row => row.type === structureWall),
    rampart: repairRows.filter(row => row.type === structureRampart),
    policy: 'current hits are the funded bound; finalized room repair excludes walls and ramparts'
  };
  const freshness = {
    liveInventory: observation(tick, tick),
    demandPlan: canonical.observations && canonical.observations.demandPlan
      || observation(demand && demand.tick, tick),
    laborPlan: observation(labor && labor.updated, tick)
  };
  const display = value => value == null ? 'unknown'
    : typeof value === 'number' && !Number.isInteger(value)
      ? String(Math.round(value * 1000) / 1000) : String(value);
  const consoleLines = [
    `${roomName} work @${display(tick)} | funded build ` +
      `${display(lanes.build.fundedEnergy)}, repair ` +
      `${display(lanes.repair.fundedEnergy)}, upgrade budget ` +
      `${display(budgets.upgrade)}/tick`,
    `Construction: ${display(constructionRows && constructionRows.length)} ` +
      `sites, ${display(lanes.build.theoreticalEnergy)} theoretical energy, ` +
      `${display(lanes.build.expectedCompletionTicks)} funded ticks`,
    `Repair: ${display(repairRows && repairRows.length)} targets, ` +
      `${display(lanes.repair.theoreticalEnergy)} theoretical energy, ` +
      `${display(lanes.repair.expectedCompletionTicks)} funded ticks`,
    `Upgrade: ${display(lanes.upgrade.appliedWork)} WORK, ` +
      `${display(lanes.upgrade.fundedEnergy)} progress remaining, ` +
      `${display(lanes.upgrade.expectedCompletionTicks)} funded ticks`,
    `Workers: assigned ${display(workerSummary.assigned)}, traveling ` +
      `${display(workerSummary.traveling)}, blocked ` +
      `${display(workerSummary.blocked)}, parked ` +
      `${display(workerSummary.parked)}; missing B/R/U ` +
      `${display(workerSummary.missing.build)}/` +
      `${display(workerSummary.missing.repair)}/` +
      `${display(workerSummary.missing.upgrade)}`,
    'Walls/ramparts: excluded from finalized repair funding; theoretical deficits remain visible'
  ];
  return {
    ok: true, tick, freshness, roomName,
    canonical: { health: canonical.health, mode: canonical.mode,
      work: { ...canonical.work } },
    construction: constructionRows === null ? null : {
      sites: constructionRows,
      byTypeAndPriority: groupRows(constructionRows, ['priority', 'type'])
    },
    repairs: repairRows === null ? null : {
      targets: repairRows,
      byUrgencyAndClass: groupRows(repairRows, ['urgency', 'type'])
    },
    barriers,
    budgets,
    lanes,
    workers: workerRows === null ? null : {
      summary: workerSummary, creeps: workerRows
    },
    evidenceLimit: 'Completion times divide currently funded energy by finalized energy-per-tick budgets; they are estimates, not promises. Theoretical hitsMax and construction totals are not funded work.',
    console: consoleLines.join('\n')
  };
};

module.exports = { WORK_DEFINITION, createWorkCommand, observation };
