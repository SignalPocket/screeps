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
      : mode === 'constrained' ? 16 : null
  };
};

module.exports = { deriveCpuPolicy };
