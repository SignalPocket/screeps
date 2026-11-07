'use strict';

const assert = require('assert');
const { getPopulationLimit, getCapabilityTransitionAllowance,
  getRequiredPopulationTransitionAllowance, selectRetirementCandidates } =
  require('./population.control');

assert.strictEqual(getPopulationLimit(30, {
  segments: Array.from({ length: 16 }, () => ({}))
}), 46);
assert.strictEqual(getPopulationLimit(30, {
  segments: Array.from({ length: 16 }, () => ({}))
}, false), 30);
assert.strictEqual(getPopulationLimit(30, {
  segments: Array.from({ length: 16 }, () => ({}))
}, false, 12), 42);
assert.strictEqual(getPopulationLimit(30, {
  segments: Array.from({ length: 16 }, () => ({}))
}, true, 20), 50);
assert.strictEqual(getPopulationLimit(30, null, false, 0, 5), 35);
assert.strictEqual(getCapabilityTransitionAllowance({
  source: { min: 2, coverageCount: 1, count: 1 },
  remoteHauler: { min: 3, coverageCount: 3, count: 2 }
}, { remoteHauler: 7 }), 4);
assert.strictEqual(getCapabilityTransitionAllowance({
  source: { min: 2, coverageCount: 2, count: 2 }
}), 0);
assert.strictEqual(getRequiredPopulationTransitionAllowance(26, 30, 3), 7,
  'existing wrong-role bodies do not consume missing-capability slots');
assert.strictEqual(getRequiredPopulationTransitionAllowance(26, 24, 3, 2),
  5, 'explicit retained assignments remain budgeted beside capability gaps');
const candidates = Array.from({ length: 8 }, (_, index) => ({
  name: `worker-${index}`, score: index
}));
assert.strictEqual(selectRetirementCandidates({
  population: 100, populationLimit: 46, retiringCount: 0,
  candidates, score: candidate => candidate.score
}).length, 4);
assert.strictEqual(selectRetirementCandidates({
  population: 100, populationLimit: 46, retiringCount: 3,
  candidates, score: candidate => candidate.score
}).length, 1);
assert.strictEqual(selectRetirementCandidates({
  population: 46, populationLimit: 46, retiringCount: 0,
  candidates, score: candidate => candidate.score
}).length, 0);

console.log('population control scenarios passed');
