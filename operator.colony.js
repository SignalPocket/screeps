'use strict';

const { createOperationalColonyScope } = typeof Game === 'undefined'
  ? require('./colony.scope') : require('colony.scope');

const COLONY_DEFINITION = Object.freeze({
  name: 'colony',
  signature: 'ops.colony()',
  purpose: 'Show one isolated health and action row for every operational room.',
  example: 'ops.colony()',
  mode: 'read-only',
  writes: 'none',
  expires: null,
  related: Object.freeze(['energy', 'remotes', 'room', 'spawn', 'work'])
});

const finite = value => Number.isFinite(value) ? value : null;
const integer = value => Number.isSafeInteger(value) ? value : null;
const latestRecord = history => history && Array.isArray(history.records)
  ? history.records[history.records.length - 1] || null : null;
const observation = (updated, tick) => {
  if (!Number.isSafeInteger(updated)) return { tick: null, age: null,
    freshness: 'unknown' };
  const age = Number.isSafeInteger(tick) ? Math.max(0, tick - updated) : null;
  return { tick: updated, age,
    freshness: age === 0 ? 'current tick' : age === null
      ? 'unknown' : `stale by ${age} ticks` };
};
const downgradeRisk = ticks => ticks == null ? 'unknown'
  : ticks < 5000 ? 'critical' : ticks < 10000 ? 'warning' : 'safe';

const formatValue = value => value == null ? '?' : String(value);
const roomSummary = row => `${row.roomName} ${row.scope.configuredRole}/` +
  `${row.scope.visibility.visible ? 'visible' :
    row.scope.visibility.observation.freshness} ` +
  `${row.health || 'unknown'}/${row.mode || 'unknown'} ` +
  `${row.scope.ownedHome ? `RCL${formatValue(row.controller.level)}`
    : row.controller.status} ` +
  `stored ${formatValue(row.energy.stored)} free ` +
  `${formatValue(row.energy.freeCapacity)} spawn ` +
  `${formatValue(row.energy.spawnAvailable)}/` +
  `${formatValue(row.energy.spawnCapacity)} | build ` +
  `${formatValue(row.work.buildRemaining)} repair ` +
  `${formatValue(row.work.repairEnergy)} upgrade ` +
  `${formatValue(row.work.upgraders.current)}/` +
  `${formatValue(row.work.upgraders.desired)} | ` +
  `staff -${formatValue(row.staffing.missingDesired)} threat ` +
  `${formatValue(row.threats.count)} remote ` +
  `${formatValue(row.remotes.trouble)} cpu ` +
  `${formatValue(row.cpu.deferred)} | ${row.spawn.action}`;

const createColonyCommand = ({ Game, Memory, findConstructionSites,
  resourceEnergy = 'energy' }) => (...args) => {
  const tick = integer(Game && Game.time);
  if (args.length) return {
    ok: false, tick, freshness: 'current tick',
    error: 'ops.colony() does not accept arguments',
    console: 'ops.colony() does not accept arguments'
  };
  if (!Game || !Game.rooms || !Game.creeps || !Game.spawns) return {
    ok: false, tick, freshness: 'unknown',
    error: 'Live game data is unavailable',
    console: 'Colony overview unavailable: live game data is unavailable'
  };

  const creeps = Object.values(Game.creeps);
  const spawns = Object.values(Game.spawns);
  const cpuExecution = Memory && Memory.cpuPolicy &&
    Memory.cpuPolicy.execution || null;
  const scope = createOperationalColonyScope({ Game, Memory });
  const memoryRooms = Memory && Memory.rooms && typeof Memory.rooms === 'object'
    ? Memory.rooms : {};
  const rows = scope.rows.map(scopeRoom => {
    const room = Game.rooms[scopeRoom.roomName] || null;
    const ownedHome = Boolean(room && room.controller && room.controller.my);
    const memory = room && room.memory || memoryRooms[scopeRoom.roomName] || {};
    const policy = memory.populationPolicy || null;
    const status = memory.roomStatus || null;
    const demand = memory.demandPlan || null;
    const trend = latestRecord(memory.roomTrendHistory);
    const operational = memory.operationalHealth &&
      memory.operationalHealth.current || null;
    const combat = memory.combatStatus || null;
    const spawnDecision = memory.spawnDecision || null;
    const spawnActivity = memory.spawnActivityStatus || null;
    const homeCreeps = ownedHome ? creeps.filter(creep => creep &&
      creep.memory && creep.memory.home === scopeRoom.roomName) : [];
    const roomSpawns = ownedHome ? spawns.filter(spawn => spawn &&
      spawn.room && spawn.room.name === scopeRoom.roomName)
      .sort((left, right) => left.name.localeCompare(right.name)) : [];
    const activeSpawns = roomSpawns.filter(spawn => spawn.spawning);
    let constructionSites = null;
    if (room && findConstructionSites != null &&
        typeof room.find === 'function') {
      try {
        const found = room.find(findConstructionSites);
        if (Array.isArray(found)) constructionSites = found.length;
      } catch (error) {
        constructionSites = null;
      }
    }
    const plannedPopulation = ownedHome && policy && policy.totals || null;
    const desiredPopulation = finite(plannedPopulation &&
      plannedPopulation.desired);
    const minimumPopulation = finite(plannedPopulation &&
      plannedPopulation.min);
    const upgraderPlan = ownedHome && policy && policy.roles &&
      policy.roles.upgrader || null;
    const activeUpgraders = homeCreeps.filter(creep => creep.memory &&
      creep.memory.role === 'upgrader').length;
    const deferred = cpuExecution &&
      Array.isArray(cpuExecution.deferredCreeps)
      ? cpuExecution.deferredCreeps.filter(entry =>
        entry.room === scopeRoom.roomName)
      : null;
    const remoteValues = ownedHome && operational
      ? [operational.remoteBacklog,
      operational.remoteBlockedRooms, operational.remoteRosterGap]
      .map(value => finite(value)) : [];
    const remoteTrouble = remoteValues.length &&
      remoteValues.every(value => value !== null)
      ? remoteValues.reduce((sum, value) => sum + value, 0) : null;
    const spawningNames = activeSpawns.map(spawn => spawn.spawning.name ||
      spawn.name);
    const spawnAction = !ownedHome ? 'not an owned spawn home'
      : spawningNames.length
      ? `spawning ${spawningNames.join(', ')}`
      : spawnDecision && spawnDecision.authorized && spawnDecision.role
        ? `planned ${spawnDecision.role}`
        : spawnActivity && spawnActivity.status
          ? spawnActivity.status
          : spawnDecision && spawnDecision.reason
            ? `idle: ${spawnDecision.reason}` : 'unknown';
    const storedEnergy = finite(trend && trend.stored);
    const freeCapacity = finite(demand && demand.storageFree);
    const row = {
      roomName: scopeRoom.roomName,
      tick,
      scope: {
        membership: scopeRoom.membership,
        configuredRole: scopeRoom.configuredRole,
        ownedHome,
        authorityHome: scopeRoom.authority.homeRoom,
        visibility: scopeRoom.visibility,
        transitionedToOwned: scopeRoom.transitionedToOwned
      },
      health: status && (status.label || status.health || status.key) ||
        policy && policy.health || null,
      healthReasons: status && Array.isArray(status.reasons)
        ? [...status.reasons] : [],
      mode: policy && policy.mode || null,
      observations: {
        roomStatus: observation(status && status.updated, tick),
        roomPlan: observation(policy && policy.updated, tick),
        demandPlan: observation(demand && demand.tick, tick),
        trend: observation(trend && trend.tick, tick),
        combat: observation(combat && combat.updated, tick),
        spawnDecision: observation(spawnDecision && spawnDecision.updated,
          tick),
        cpuExecution: observation(cpuExecution && cpuExecution.updated, tick)
      },
      controller: {
        status: scopeRoom.controller.status,
        owner: scopeRoom.controller.owner,
        reservation: scopeRoom.controller.reservation,
        observation: scopeRoom.controller.observation,
        level: ownedHome ? integer(room.controller.level) : null,
        ticksToDowngrade: ownedHome
          ? finite(room.controller.ticksToDowngrade) : null,
        downgradeRisk: ownedHome
          ? downgradeRisk(finite(room.controller.ticksToDowngrade)) : 'unknown',
        progress: ownedHome ? finite(room.controller.progress) : null,
        progressTotal: ownedHome
          ? finite(room.controller.progressTotal) : null
      },
      energy: {
        stored: storedEnergy,
        freeCapacity,
        spawnAvailable: ownedHome ? finite(room.energyAvailable) : null,
        spawnCapacity: ownedHome
          ? finite(room.energyCapacityAvailable) : null,
        resource: resourceEnergy
      },
      work: {
        constructionSites,
        buildRemaining: finite(demand && demand.buildRemaining) ??
          finite(trend && trend.build),
        repairEnergy: finite(demand && demand.repairEnergy) ??
          finite(trend && trend.repair),
        upgraders: {
          current: ownedHome ? activeUpgraders : null,
          minimum: finite(upgraderPlan && upgraderPlan.min),
          desired: finite(upgraderPlan && upgraderPlan.desired),
          missing: upgraderPlan ? Math.max(0,
            upgraderPlan.desired - activeUpgraders) : null
        }
      },
      staffing: {
        current: ownedHome ? homeCreeps.length : null,
        minimum: minimumPopulation,
        desired: desiredPopulation,
        missingMinimum: !ownedHome || minimumPopulation == null ? null :
          Math.max(0, minimumPopulation - homeCreeps.length),
        missingDesired: !ownedHome || desiredPopulation == null ? null :
          Math.max(0, desiredPopulation - homeCreeps.length)
      },
      logistics: {
        reserve: status && status.reserve || null,
        harvest: status && status.harvest || null,
        flow: status && status.logistics || null,
        sourceStored: finite(demand && demand.sourceStored),
        spawnFree: finite(demand && demand.spawnFree),
        bufferFree: finite(demand && demand.bufferFree),
        supplyFree: finite(demand && demand.supplyFree)
      },
      threats: {
        state: combat && combat.state || null,
        active: combat ? Boolean(combat.fighting) : null,
        count: finite(combat && combat.hostileCount),
        requiredDefenders: finite(combat && combat.requiredDefenders)
      },
      remotes: {
        activeRooms: ownedHome
          ? finite(policy && policy.remote && policy.remote.rooms) : null,
        backlog: ownedHome
          ? finite(operational && operational.remoteBacklog) : null,
        blockedRooms: ownedHome
          ? finite(operational && operational.remoteBlockedRooms) : null,
        rosterGap: ownedHome
          ? finite(operational && operational.remoteRosterGap) : null,
        trouble: remoteTrouble
      },
      cpu: {
        mode: Memory && Memory.cpuPolicy && Memory.cpuPolicy.mode || null,
        deferred: deferred ? deferred.length : null,
        longestDeferral: deferred && deferred.length
          ? Math.max(...deferred.map(entry => entry.consecutiveTicks || 0))
          : deferred ? 0 : null
      },
      spawn: {
        action: spawnAction,
        active: spawningNames,
        decisionRole: ownedHome && spawnDecision && spawnDecision.role || null,
        reason: ownedHome && spawnDecision && spawnDecision.reason || null
      }
    };
    row.console = roomSummary(row);
    return row;
  });
  return {
    ok: true,
    tick,
    freshness: 'current tick with per-source observation ages',
    roomCount: rows.length,
    ownedHomeCount: rows.filter(row => row.scope.ownedHome).length,
    rooms: rows,
    console: rows.length ? rows.map(row => row.console).join('\n')
      : 'No operational colony rooms are configured'
  };
};

module.exports = { COLONY_DEFINITION, createColonyCommand, observation,
  downgradeRisk };
