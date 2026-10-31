'use strict';

const assert = require('assert');
const { planSourceAssignments } = require('./source.assignment');

const candidates = ['a', 'b', 'c', 'd'].map(name => ({
  name,
  preferredSource: 's2',
  work: 2
}));
const result = planSourceAssignments({
  needs: [{ sourceId: 's2', remaining: 1, workDeficit: 5 }],
  candidates,
  getWork: candidate => candidate.work
});
assert.deepStrictEqual(result.assignments.map(entry => entry.sourceId),
  ['s2', null, null, null]);

const balanced = planSourceAssignments({
  needs: [
    { sourceId: 's1', remaining: 1, workDeficit: 3 },
    { sourceId: 's2', remaining: 1, workDeficit: 5 }
  ],
  candidates: candidates.slice(0, 3),
  getWork: candidate => candidate.work
});
assert.deepStrictEqual(balanced.assignments.map(entry => entry.sourceId),
  ['s2', 's1', null]);

console.log('source assignment scenarios passed');
