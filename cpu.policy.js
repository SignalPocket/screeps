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
    fairDeferralThreshold: 10
  };
};

const selectFairExecutionCreeps = ({ creeps, previous, tick, mode,
  limit = 1, interval = 5, threshold = 10 }) => {
  if (mode === 'recovery' || limit <= 0 || interval <= 0 ||
      tick % interval !== 0 || previous?.updated !== tick - 1) return [];
  const deferredAge = new Map((previous.deferredCreeps || [])
    .map(entry => [entry.name, entry.consecutiveTicks]));
  return creeps.filter(creep => {
    const memory = creep.memory || {};
    return memory.role === 'builder' && memory.builderScope !== 'outpost' &&
      memory.builderScope !== 'expansion' && !memory.remoteRoom &&
      (deferredAge.get(creep.name) || 0) >= threshold;
  }).sort((a, b) => (deferredAge.get(b.name) || 0) -
      (deferredAge.get(a.name) || 0) ||
    a.room.name.localeCompare(b.room.name) || a.name.localeCompare(b.name))
    .slice(0, limit);
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
      deferredCreeps.push({ name: creep.name, role, room: creep.room.name,
        consecutiveTicks: last ? last.consecutiveTicks + 1 : 1 });
    }
  });
  return { updated: tick, available: creeps.length, executed,
    deferred: creeps.length - executed, roles, deferredCreeps };
};

module.exports = { deriveCpuPolicy, selectFairExecutionCreeps,
  summarizeCreepExecution };
