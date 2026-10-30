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
  stored: Math.max(0, Math.round(metrics.storedEnergy || 0)),
  dropped: Math.max(0, Math.round(metrics.dropped || 0)),
  population: Math.max(0, Math.round(metrics.population || 0)),
  desired: Math.max(0, Math.round(metrics.desiredPopulation || 0)),
  controllerTicks: Math.max(0, Math.round(metrics.controllerTicks || 0)),
  controllerProgress: ratio(metrics.controllerProgress),
  outposts: Math.max(0, Math.round(metrics.activeOutposts || 0))
});

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
  const oldest = recent[0];
  const repairTrend = latest.repair - oldest.repair;
  const repairRising = latest.repair >= 10000 &&
    repairTrend >= Math.max(5000, oldest.repair * 0.2);
  let repairBonus = previous.repairBonus || 0;
  if (repairRising) {
    repairBonus = clamp(Math.ceil(repairTrend / 75000), 1, 2);
  } else if (latest.repair < oldest.repair || latest.repair < 5000) {
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
      (dropped >= 500 ? 1 : 0), 1, 3);
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
    version: 2, interval, maxRecords, records: [], adjustment: {}
  };
  if (!Array.isArray(database.records)) database.records = [];
  const record = compactRecord(bucket, metrics);
  const last = database.records[database.records.length - 1];
  database.interval = interval;
  database.maxRecords = maxRecords;
  database.version = 2;
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
  analyzeRecords,
  updateRoomTrends,
  applyTrendAdjustments
};
