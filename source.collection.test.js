'use strict';

const assert = require('assert');
const { buildSourceGroups, selectSourceGroup } =
  require('./source.collection');

const source1 = { id: 's1' };
const source2 = { id: 's2' };
const buffer = (id, sourceId, stored, capacity) => ({
  id,
  sourceId,
  pos: { sourceId },
  store: { energy: stored, getCapacity: () => capacity }
});
const buffers = [
  buffer('s1a', 's1', 1100, 2000),
  buffer('s1b', 's1', 1100, 2000),
  buffer('s2a', 's2', 1050, 2000)
];
const groups = buildSourceGroups({
  room: {},
  sources: [source1, source2],
  buffers,
  getContainerPurpose: (room, position) => `source:${position.sourceId}`,
  getUnreservedEnergy: candidate => candidate.store.energy
});

assert.deepStrictEqual(groups.map(group => ({
  id: group.source.id, stored: group.stored, capacity: group.capacity
})), [
  { id: 's1', stored: 2200, capacity: 4000 },
  { id: 's2', stored: 1050, capacity: 2000 }
]);
assert.strictEqual(selectSourceGroup(groups, 's1').source.id, 's1');

// Projecting the first carrier's 600-capacity pickup from S1 should send the
// next carrier to S2 instead of preserving two stale S1 preferences.
groups[0].stored -= 600;
assert.strictEqual(selectSourceGroup(groups, 's1').source.id, 's2');

groups[1].stored = 1900;
assert.strictEqual(selectSourceGroup(groups, 's1').source.id, 's2');
assert.strictEqual(selectSourceGroup(groups, null).source.id, 's2');
assert.strictEqual(selectSourceGroup([], 's1'), null);

console.log('source collection scenarios passed');
