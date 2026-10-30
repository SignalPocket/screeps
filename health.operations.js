'use strict';

const DEFAULT_INTERVAL = 250;
const FLIP_WINDOW = 25;

const blankWindow = bucket => ({
  bucket, samples: 0, taskChanges: 0, laneChanges: 0, roleChanges: 0,
  taskFlips: 0, idleTransitions: 0, idleTicks: 0,
  rebalancerIdleTicks: 0, foreignDispatchTicks: 0,
  staleReturnTicks: 0, cargoMisrouteTicks: 0,
  sourceRecoveryTicks: 0, sourceCoverageGap: 0,
  stuckTicks: 0, remoteRosterGap: 0,
  remoteBacklog: 0, remoteBlockedRooms: 0, remoteDelivered: 0
});

const usedEnergy = creep => creep && creep.store
  ? creep.store.energy || 0 : 0;

const harmfulTaskFlip = (middle, returned) => {
  const pair = new Set([middle, returned]);
  if (pair.has('standby') || pair.has('idle')) return true;
  const stockSpawn = task => task === 'stock-refill' ||
    task === 'stock-refill-pass' || task === 'committed-refill-buffer';
  return pair.has('upgrade') && [...pair].some(stockSpawn) ||
    pair.has('rebalance') && (pair.has('standby') || pair.has('idle'));
};

const updateOperationalHealth = (memory, tick, creeps, remote = {},
  options = {}) => {
  const interval = options.interval || DEFAULT_INTERVAL;
  const bucket = Math.floor(tick / interval) * interval;
  let health = memory.operationalHealth;
  if (!health || health.version !== 3) health = { version: 3, states: {} };
  if (!health.current || health.current.bucket !== bucket) {
    if (health.current) health.previous = health.current;
    health.current = blankWindow(bucket);
  }
  if (!health.states || typeof health.states !== 'object') health.states = {};
  const current = health.current;
  const liveNames = new Set();
  for (const creep of creeps || []) {
    if (!creep || !creep.name || !creep.memory) continue;
    liveNames.add(creep.name);
    const state = health.states[creep.name] || {};
    const next = {
      role: creep.memory.role || 'worker',
      task: creep.memory.task || 'idle',
      lane: creep.memory.demandLane || 'none',
      idle: Boolean(creep.memory.idleNow)
    };
    if (state.tick !== undefined) {
      if (state.role !== next.role) current.roleChanges++;
      if (state.lane !== next.lane) current.laneChanges++;
      if (state.task !== next.task) {
        current.taskChanges++;
        if (state.previousTask === next.task &&
            harmfulTaskFlip(state.task, next.task) &&
            tick - (state.taskChanged || tick) <= FLIP_WINDOW) {
          current.taskFlips++;
        }
        next.previousTask = state.task;
        next.taskChanged = tick;
      } else {
        next.previousTask = state.previousTask;
        next.taskChanged = state.taskChanged;
      }
      if (!state.idle && next.idle) current.idleTransitions++;
    }
    if (next.idle) current.idleTicks++;
    if (next.idle && next.role === 'rebalancer') {
      current.rebalancerIdleTicks++;
    }
    if ((remote.sourceCoverageGap || 0) > 0 &&
        creep.memory.sourceReserve) current.sourceRecoveryTicks++;
    if ((creep.memory.navStuck || 0) >= 2 &&
        (creep.memory.navLastTick || 0) >= tick - 1) current.stuckTicks++;
    if (next.role === 'remote-hauler') {
      const home = creep.memory.remoteHome || creep.memory.home;
      const roster = creep.memory.remoteRoom;
      const dispatch = creep.memory.remoteDispatchRoom;
      if (!creep.memory.remoteRosterSurplus && dispatch && roster &&
          dispatch !== roster) current.foreignDispatchTicks++;
      if (creep.memory.remoteHaulReturning && usedEnergy(creep) === 0 &&
          creep.room && creep.room.name === home) current.staleReturnTicks++;
      if (creep.memory.remoteCargoOrigin && usedEnergy(creep) > 0 &&
          !creep.memory.remoteHaulReturning) current.cargoMisrouteTicks++;
    }
    health.states[creep.name] = { ...next, tick };
  }
  for (const name of Object.keys(health.states)) {
    if (!liveNames.has(name)) delete health.states[name];
  }
  current.samples++;
  current.remoteBacklog = Math.max(current.remoteBacklog,
    Math.round(remote.backlog || 0));
  current.remoteBlockedRooms = Math.max(current.remoteBlockedRooms,
    Math.round(remote.blockedRooms || 0));
  current.remoteRosterGap = Math.max(current.remoteRosterGap,
    Math.round(remote.rosterGap || 0));
  current.sourceCoverageGap = Math.max(current.sourceCoverageGap,
    Math.round(remote.sourceCoverageGap || 0));
  current.remoteDelivered = Math.max(current.remoteDelivered,
    Math.round(remote.delivered || 0));
  health.updated = tick;
  memory.operationalHealth = health;
  return current;
};

const getOperationalMetrics = memory => {
  const health = memory && memory.operationalHealth;
  return health && health.current || blankWindow(0);
};

module.exports = {
  DEFAULT_INTERVAL, FLIP_WINDOW, blankWindow, harmfulTaskFlip,
  updateOperationalHealth, getOperationalMetrics
};
