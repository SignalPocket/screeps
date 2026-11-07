'use strict';

/**
 * Select one post-survival recovery lane without letting a large deficit
 * monopolize every spawn. Absolute survival minimums are handled before this
 * selector. Here, the least-covered capability wins; ties go to the lane that
 * has waited longest since a successful spawn.
 */
const selectBalancedRecoveryRequest = (candidates, lastServed = {}) => {
  const viable = (candidates || []).filter(candidate =>
    candidate && candidate.request && candidate.target > 0 &&
    candidate.current < candidate.target).map(candidate => ({
    ...candidate,
    coverage: Math.max(0, candidate.current) / candidate.target,
    lastServed: Number.isFinite(lastServed[candidate.key])
      ? lastServed[candidate.key] : -1
  })).sort((a, b) =>
    a.coverage - b.coverage ||
    a.lastServed - b.lastServed ||
    (a.priority || 0) - (b.priority || 0) ||
    a.key.localeCompare(b.key));
  if (!viable.length) return null;
  const selected = viable[0];
  return {
    ...selected.request,
    recoveryLane: selected.key,
    recoveryCoverage: selected.coverage,
    recoveryCurrent: selected.current,
    recoveryTarget: selected.target
  };
};

module.exports = { selectBalancedRecoveryRequest };
