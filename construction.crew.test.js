'use strict';

const assert = require('assert');
const { createConstructionPriority } = require('./construction.priority');
const policy = createConstructionPriority({
  STRUCTURE_CONTAINER: 'container', STRUCTURE_LINK: 'link',
  STRUCTURE_EXTENSION: 'extension', STRUCTURE_ROAD: 'road'
});
const site = (structureType, remaining) => ({
  structureType, progressTotal: 20000, progress: 20000 - remaining
});

// Staffing and per-target assignment must release the same completed work.
for (const type of ['container', 'link', 'extension', 'road', 'spawn']) {
  const cap = { container: 4, link: 6, extension: 3, road: 1, spawn: 1 }[type];
  for (const [remaining, expected] of [
    [-1, 0], [0, 0], [1, 1], [999, 1], [1000, 1],
    [1001, Math.min(2, cap)], [2000, Math.min(2, cap)],
    [2001, Math.min(3, cap)], [20000, cap]
  ]) {
    const target = Object.freeze(site(type, remaining));
    assert.strictEqual(policy.desiredCrew(target), expected, `${type}: ${remaining}`);
    assert.strictEqual(policy.desiredCrewTotal([target], false), expected);
  }
}
assert.strictEqual(policy.desiredCrew(null), 0);
for (const progressTotal of [undefined, NaN, Infinity, '5000']) {
  assert.strictEqual(policy.desiredCrew({ structureType: 'link', progressTotal }), 0);
}
assert.strictEqual(policy.desiredCrew({ structureType: 'link', progressTotal: 1001 }), 2);
assert.strictEqual(policy.desiredCrewTotal([], true), 0);

// A link migration temporarily suppresses extensions, not other infrastructure.
// Frozen records also catch accidental writes to the shared site inventory.
const sites = Object.freeze([
  site('link', 6001), site('extension', 3000), site('container', 4001),
  site('road', 1), site('spawn', 15000), site('link', 0)
].map(Object.freeze));
const before = JSON.stringify(sites);
assert.strictEqual(policy.desiredCrewTotal(sites, true), 12);
assert.strictEqual(policy.desiredCrewTotal(sites, false), 15);
assert.strictEqual(policy.desiredCrewTotal(sites, true), 12);
assert.strictEqual(JSON.stringify(sites), before);

// Follow a link through completion while extension work remains unchanged.
const extensions = Object.freeze([Object.freeze(site('extension', 3000))]);
for (const [remaining, expected] of [[6001, 6], [1001, 2], [1000, 1], [1, 1]]) {
  assert.strictEqual(policy.desiredCrewTotal([site('link', remaining), ...extensions], true), expected);
}
assert.strictEqual(policy.desiredCrewTotal([site('link', 0), ...extensions], false), 3);
assert.strictEqual(policy.desiredCrewTotal([site('link', 0), site('extension', 0)], false), 0);

console.log('construction crew completion, caps and deferral boundaries passed');
