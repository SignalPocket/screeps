'use strict';

const BASELINE_SLOTS = Object.freeze([
  Object.freeze({ key: 'miner', role: 'source', order: 1 }),
  Object.freeze({ key: 'upgrader', role: 'upgrader', order: 2 }),
  Object.freeze({ key: 'spawnFiller', role: 'refiller', order: 3 }),
  Object.freeze({ key: 'builderFixer', role: 'builder', order: 4 })
]);

/**
 * Select the first uncovered invariant colony job.
 *
 * This pass intentionally ignores ordinary policy minimums. A second source,
 * extra refill lane, or construction surge may be important, but none may be
 * selected until one viable creep owns each baseline capability.
 */
const selectBaselineStaffingGap = coverage => {
  for (const slot of BASELINE_SLOTS) {
    const count = Math.max(0, Number(coverage && coverage[slot.key]) || 0);
    if (count < 1) {
      return {
        ...slot,
        minimum: 1,
        count,
        coverage: count,
        baseline: true
      };
    }
  }
  return null;
};

module.exports = { BASELINE_SLOTS, selectBaselineStaffingGap };
