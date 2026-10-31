'use strict';

const assert = require('assert');
const { getPopulationLimit, selectRetirementCandidates } =
  require('./population.control');

assert.strictEqual(getPopulationLimit(30, {
  segments: Array.from({ length: 16 }, () => ({}))
}), 46);
assert.strictEqual(getPopulationLimit(30, {
  segments: Array.from({ length: 16 }, () => ({}))
}, false), 30);
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
