'use strict';

const SAMPLE_INTERVAL = 250;
const MAX_RECORDS = 32;

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));
const average = values => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const ratio = value => Math.round(clamp(Number(value) || 0, 0, 1) * 1000) /
  1000;

const compactRecord = (tick, metrics) => ({
  tick,
  repair: Math.max(0, Math.round(metrics.repair || 0)),
  build: Math.max(0, Math.round(metrics.build || 0)),
  source: ratio(metrics.sourceRatio),
  sourceLow: ratio(metrics.lowestSourceRatio),
  work: ratio(metrics.workBufferRatio),
  extensions: metrics.extensionBufferRatio == null
    ? null : ratio(metrics.extensionBufferRatio),
  ready: ratio(metrics.readyRatio),
  capacity: Math.max(0, Math.round(metrics.energyCapacity || 0)),
  stored: Math.max(0, Math.round(metrics.storedEnergy || 0)),
  dropped: Math.max(0, Math.round(metrics.dropped || 0)),
  population: Math.max(0, Math.round(metrics.population || 0)),
  desired: Math.max(0, Math.round(metrics.desiredPopulation || 0)),
  controllerTicks: Math.max(0, Math.round(metrics.controllerTicks || 0)),
  controllerProgress: ratio(metrics.controllerProgress),
  outposts: Math.max(0, Math.round(metrics.activeOutposts || 0)),
  taskFlips: Math.max(0, Math.round(metrics.taskFlips || 0)),
  laneChanges: Math.max(0, Math.round(metrics.laneChanges || 0)),
  roleChanges: Math.max(0, Math.round(metrics.roleChanges || 0)),
  idleTransitions: Math.max(0, Math.round(metrics.idleTransitions || 0)),
  rebalancerIdle: Math.max(0,
    Math.round(metrics.rebalancerIdleTicks || 0)),
  foreignDispatch: Math.max(0,
    Math.round(metrics.foreignDispatchTicks || 0)),
  staleReturns: Math.max(0, Math.round(metrics.staleReturnTicks || 0)),
  cargoMisroutes: Math.max(0,
    Math.round(metrics.cargoMisrouteTicks || 0)),
  sourceRecovery: Math.max(0,
    Math.round(metrics.sourceRecoveryTicks || 0)),
  sourceCoverageGap: Math.max(0,
    Math.round(metrics.sourceCoverageGap || 0)),
  stuck: Math.max(0, Math.round(metrics.stuckTicks || 0)),
  remoteRosterGap: Math.max(0, Math.round(metrics.remoteRosterGap || 0)),
  remoteBacklog: Math.max(0, Math.round(metrics.remoteBacklog || 0)),
  remoteBlocked: Math.max(0,
    Math.round(metrics.remoteBlockedRooms || 0)),
  remoteDelivered: Math.max(0, Math.round(metrics.remoteDelivered || 0))
});

const deriveRecoveryDirective = (records, adjustment = {}) => {
  const latest = records && records[records.length - 1];
  const previous = records && records[records.length - 2];
  if (!latest) return {
    key: 'baseline', label: 'BASELINE', action: 'collect health snapshots'
  };
  if (latest.controllerTicks > 0 && latest.controllerTicks < 3000) {
    return { key: 'controller', label: 'SAVE RC',
      action: 'reserve one upgrader and controller energy' };
  }
  if (latest.ready < 0.25) return {
    key: 'spawn', label: 'RESTORE SPAWN',
    action: 'protect filler, extensions, and a spawnable body'
  };
  if (latest.taskFlips >= 4 || latest.roleChanges >= 3) return {
    key: 'assignments', label: 'HOLD JOBS',
    action: 'retain useful reservations until completion'
  };
  if (latest.stuck >= 10) return {
    key: 'movement', label: 'CLEAR TRAFFIC',
    action: 'invalidate stuck paths and preserve destination ownership'
  };
  if (latest.sourceCoverageGap > 0 && latest.sourceRecovery >= 5) return {
    key: 'source-recovery', label: 'RESTORE SOURCES',
    action: 'hold recovery reservations until WORK coverage is complete'
  };
  if (latest.foreignDispatch > 0 || latest.staleReturns > 0 ||
      latest.cargoMisroutes > 0) return {
    key: 'remote-ownership', label: 'RESET ROUTES',
    action: 'restore roster room, return cargo, clear stale flags'
  };
  const deliveredDelta = previous
    ? latest.remoteDelivered - previous.remoteDelivered : 0;
  if (latest.remoteRosterGap > 0 ||
      latest.remoteBlocked > 0 && latest.remoteBacklog >= 1000 &&
      deliveredDelta <= 0) return {
    key: 'remote-flow', label: 'DRAIN OUTPOSTS',
    action: 'keep roster carriers on blocked outposts'
  };
  if ((adjustment.haulerBonus || 0) > 0) return {
    key: 'local-flow', label: 'DRAIN SOURCES',
    action: 'raise local haul staffing until work buffers recover'
  };
  if ((adjustment.repairBonus || 0) > 0) return {
    key: 'repair', label: 'FIX DAMAGE',
    action: 'raise fixer staffing until repair backlog falls'
  };
  if (latest.build > 0) return {
    key: 'construction', label: 'BUILD',
    action: 'staff priority construction after survival lanes'
  };
  return { key: 'stable', label: 'STABLE',
    action: 'use desired staffing and preserve assignments' };
};

const analyzeRecords = (records, previous = {}) => {
  const recent = records.slice(-6);
  if (recent.length < 3) {
    return {
      repairBonus: previous.repairBonus || 0,
      haulerBonus: previous.haulerBonus || 0,
      repairTrend: 0,
      logisticsGap: 0,
      reason: 'collecting baseline'
    };
  }
  const latest = recent[recent.length - 1];
  const energyCapacity = latest.capacity || 1300;
  // Compare checkpoint windows instead of only their endpoints. Repair work
  // is noisy because several fixers can finish targets just before a sample;
  // window averages retain a sustained rise without treating one spike as a
  // reason to grow the roster.
  const midpoint = Math.max(1, Math.floor(recent.length / 2));
  const earlierRepairs = recent.slice(0, midpoint)
    .map(record => record.repair || 0);
  const laterRepairs = recent.slice(midpoint)
    .map(record => record.repair || 0);
  const earlierRepair = average(earlierRepairs);
  const laterRepair = average(laterRepairs);
  const repairTrend = laterRepair - earlierRepair;
  const risingSteps = recent.slice(1).filter((record, index) =>
    (record.repair || 0) > (recent[index].repair || 0)).length;
  const repairBaseline = Math.max(2500, energyCapacity * 2);
  const repairRiseThreshold = Math.max(1000, energyCapacity * 1.5,
    earlierRepair * 0.15);
  const repairRising = latest.repair >= repairBaseline &&
    repairTrend >= repairRiseThreshold &&
    risingSteps >= Math.ceil((recent.length - 1) * 0.6);
  let repairBonus = previous.repairBonus || 0;
  if (repairRising) {
    repairBonus = clamp(Math.ceil(repairTrend /
      Math.max(10000, energyCapacity * 20)), 1, 2);
  } else if (laterRepair < earlierRepair ||
      latest.repair < repairBaseline) {
    repairBonus = Math.max(0, repairBonus - 1);
  }

  const tail = recent.slice(-3);
  const sourceRatio = average(tail.map(record => record.source));
  const workRatio = average(tail.map(record => record.work));
  const dropped = average(tail.map(record => record.dropped));
  const logisticsGap = sourceRatio - workRatio;
  const haulingBlocked = sourceRatio >= 0.45 && workRatio <= 0.25 &&
    logisticsGap >= 0.3;
  let haulerBonus = previous.haulerBonus || 0;
  if (haulingBlocked) {
    haulerBonus = clamp(Math.ceil(logisticsGap * 3) +
      (dropped >= Math.max(100, energyCapacity * 0.4) ? 1 : 0), 1, 3);
  } else if (workRatio >= 0.5 || sourceRatio < 0.25) {
    haulerBonus = Math.max(0, haulerBonus - 1);
  }

  const reasons = [];
  if (repairBonus) reasons.push(`repair +${repairBonus}`);
  if (haulerBonus) reasons.push(`haul +${haulerBonus}`);
  return {
    repairBonus,
    haulerBonus,
    repairTrend,
    logisticsGap,
    sourceRatio,
    workBufferRatio: workRatio,
    reason: reasons.join(', ') || 'no staffing adjustment'
  };
};

const updateRoomTrends = (memory, tick, metrics, options = {}) => {
  const interval = options.interval || SAMPLE_INTERVAL;
  const maxRecords = options.maxRecords || MAX_RECORDS;
  const bucket = Math.floor(tick / interval) * interval;
  const database = memory.roomTrendHistory || {
    version: 4, interval, maxRecords, records: [], adjustment: {}
  };
  if (!Array.isArray(database.records)) database.records = [];
  if (database.version !== 4) {
    // Operational fields were introduced during version 3 calibration. Clear
    // those provisional values so healthy collect/deliver cycles recorded by
    // the first draft cannot remain as historical assignment churn.
    const operationalFields = ['taskFlips', 'laneChanges', 'roleChanges',
      'idleTransitions', 'rebalancerIdle', 'foreignDispatch', 'staleReturns',
      'cargoMisroutes', 'sourceRecovery', 'stuck', 'remoteRosterGap'];
    for (const historical of database.records) {
      for (const field of operationalFields) historical[field] = 0;
    }
  }
  const record = compactRecord(bucket, metrics);
  const last = database.records[database.records.length - 1];
  database.interval = interval;
  database.maxRecords = maxRecords;
  database.version = 4;
  database.recovery = deriveRecoveryDirective(database.records,
    database.adjustment);
  if (last && (last.tick === bucket || tick - last.tick < interval)) {
    memory.roomTrendHistory = database;
    return database;
  }
  database.records.push(record);
  if (database.records.length > maxRecords) {
    database.records.splice(0, database.records.length - maxRecords);
  }
  database.updated = tick;
  database.adjustment = analyzeRecords(database.records,
    database.adjustment);
  database.recovery = deriveRecoveryDirective(database.records,
    database.adjustment);
  memory.roomTrendHistory = database;
  return database;
};

const applyTrendAdjustments = (policy, database) => {
  if (!policy || !policy.roles || !database || !database.adjustment) {
    return policy;
  }
  const adjustment = database.adjustment;
  const add = (roleName, bonus, label) => {
    const staffing = policy.roles[roleName];
    if (!staffing || !bonus) return;
    staffing.desired += bonus;
    staffing.max = Math.max(staffing.max, staffing.desired);
    staffing.reason += `; ${label} trend +${bonus}`;
  };
  add('repairBuilder', adjustment.repairBonus, 'rising repair backlog');
  add('hauler', adjustment.haulerBonus, 'source-to-work buffer gap');
  for (const key of ['min', 'desired', 'max']) {
    policy.totals[key] = Object.values(policy.roles).reduce((sum, role) =>
      sum + role[key], 0) + policy.remote.miners + policy.remote.haulers +
      policy.remote.builders;
  }
  return policy;
};

module.exports = {
  SAMPLE_INTERVAL,
  MAX_RECORDS,
  compactRecord,
  deriveRecoveryDirective,
  analyzeRecords,
  updateRoomTrends,
  applyTrendAdjustments
};
