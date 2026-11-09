'use strict';

// CPU pressure never suppresses spawning, towers, or the home survival roles.
// It defers optional planning and, only when a tick reaches its ceiling,
// rotates the remaining creep executor until the bucket recovers.
const deriveCpuPolicy = bucket => {
  const knownBucket = Number.isFinite(bucket) ? bucket : null;
  const mode = knownBucket !== null && knownBucket < 1000
    ? 'recovery' : knownBucket !== null && knownBucket < 3000
      ? 'constrained' : 'normal';
  return {
    bucket: knownBucket,
    mode,
    allowSlowPlanning: mode !== 'recovery',
    // Every mode keeps a hard reserve for end-of-tick defense, reporting and
    // engine overhead. Normal mode still executes the complete pass while it
    // fits below the ceiling; once a larger roster or scheduled planner pushes
    // past it, survival roles run and optional executors rotate to later ticks.
    executionCpuRatio: mode === 'recovery' ? 0.65
      : mode === 'constrained' ? 0.75 : 0.8,
    minimumExecutionCreeps: mode === 'recovery' ? 8
      : mode === 'constrained' ? 16 : null,
    fairExecutionLimit: mode === 'recovery' ? 0 : 1,
    fairExecutionInterval: 5,
    fairDeferralThreshold: 10,
    // Funded repair assignments get a separate bounded lane in normal mode.
    // Two visits per tick clear the observed four-room fixer set before a
    // fifth consecutive deferral, without admitting the whole optional tail.
    repairFairExecutionLimit: mode === 'recovery' ? 0
      : mode === 'constrained' ? 1 : 2,
    repairFairExecutionInterval: mode === 'normal' ? 1 : 5,
    repairFairDeferralThreshold: mode === 'normal' ? 1 : 10
  };
};

// Planning visuals are observational and may be expensive in rooms with a
// mature road network. Keep their layers synchronized while leaving gameplay
// planning and construction on their existing schedules.
const shouldRenderPlanningVisuals = ({ tick, allowSlowPlanning,
  interval = 10 }) => Boolean(allowSlowPlanning) &&
  Number.isSafeInteger(tick) && Number.isSafeInteger(interval) &&
  interval > 0 && tick % interval === 0;

const shouldPrepareRoadPlan = ({ renderPlanningVisuals,
  roadPlacementDue }) => Boolean(renderPlanningVisuals || roadPlacementDue);

// Once planning has already consumed the execution ceiling, the executor can
// only guarantee its protected/minimum prefix. Do not prepare pickup work for
// the rotating suffix that is certain to be deferred on this tick.
const selectDispatchPlanningCreeps = ({ creeps, guaranteedCount, used,
  ceiling }) => {
  if (!Array.isArray(creeps)) return [];
  const candidates = creeps.slice();
  if (!Number.isFinite(used) || !Number.isFinite(ceiling) || used < ceiling) {
    return candidates;
  }
  const count = Number.isSafeInteger(guaranteedCount)
    ? Math.max(0, Math.min(candidates.length, guaranteedCount)) : 0;
  return candidates.slice(0, count);
};

const selectFairExecutionCreeps = ({ creeps, previous, tick, mode,
  limit = 1, interval = 5, threshold = 10,
  repairLimit = 0, repairInterval = 1, repairThreshold = 1,
  isActiveRepair = () => false }) => {
  if (mode === 'recovery' || previous?.updated !== tick - 1) return [];
  const deferredAge = new Map((previous.deferredCreeps || [])
    .filter(entry => entry.reason !== 'parked')
    .map(entry => [entry.name, entry.consecutiveTicks]));
  const available = creeps.filter(creep => {
    const memory = creep.memory || {};
    return memory.role === 'builder' &&
      memory.builderScope !== 'expansion' &&
      !memory.energyBudgetHeld;
  });
  const byAge = (a, b) => (deferredAge.get(b.name) || 0) -
      (deferredAge.get(a.name) || 0) ||
    a.room.name.localeCompare(b.room.name) || a.name.localeCompare(b.name);
  if (repairLimit > 0 && repairInterval > 0 &&
      tick % repairInterval === 0) {
    const repairs = available.filter(creep => isActiveRepair(creep) &&
      (deferredAge.get(creep.name) || 0) >= repairThreshold)
      .sort(byAge).slice(0, repairLimit);
    if (repairs.length) return repairs;
  }
  if (limit <= 0 || interval <= 0 || tick % interval !== 0) return [];
  return available.filter(creep => {
    const memory = creep.memory || {};
    return memory.builderScope !== 'outpost' && !memory.remoteRoom &&
      memory.waitState !== 'parked' &&
      (deferredAge.get(creep.name) || 0) >= threshold;
  }).sort(byAge).slice(0, limit);
};

// The executor visits a prefix of its final, rotated queue. These are visits,
// not successful game actions: a visited creep may still wait or fail an action.
// Retain only current deferred creeps, so telemetry stays bounded by the roster.
const summarizeCreepExecution = ({ creeps, executedCount, tick, previous }) => {
  const executed = Math.max(0, Math.min(creeps.length, executedCount));
  const prior = new Map(previous && previous.updated === tick - 1
    ? (previous.deferredCreeps || []).map(entry => [entry.name, entry]) : []);
  const roles = {};
  const deferredCreeps = [];
  creeps.forEach((creep, index) => {
    const role = creep.memory.role || 'unknown';
    if (!Object.prototype.hasOwnProperty.call(roles, role)) {
      Object.defineProperty(roles, role, { enumerable: true, value:
        { available: 0, executed: 0, deferred: 0 } });
    }
    roles[role].available++;
    if (index < executed) {
      roles[role].executed++;
    } else {
      roles[role].deferred++;
      const last = prior.get(creep.name);
      const memory = creep.memory || {};
      const durableRepair = memory.role === 'builder' &&
        (memory.workJob && memory.workJob.lane === 'repair' &&
          memory.workJob.targetId || memory.builderScope === 'outpost' &&
          memory.remoteRepairTarget);
      const reason = memory.energyBudgetHeld ||
        memory.waitState === 'parked' && !durableRepair
        ? 'parked' : 'cpu-deferred';
      deferredCreeps.push({ name: creep.name, role, room: creep.room.name,
        reason, consecutiveTicks: last &&
          (!last.reason || last.reason === reason)
          ? last.consecutiveTicks + 1 : 1 });
    }
  });
  return { updated: tick, available: creeps.length, executed,
    deferred: creeps.length - executed, roles, deferredCreeps };
};

module.exports = { deriveCpuPolicy, shouldRenderPlanningVisuals,
  shouldPrepareRoadPlan, selectDispatchPlanningCreeps,
  selectFairExecutionCreeps,
  summarizeCreepExecution };
