'use strict';

const assert = require('assert');
const { createConstructionPriority } = require('./construction.priority');

const policy = createConstructionPriority({
  STRUCTURE_CONTAINER: 'container', STRUCTURE_LINK: 'link',
  STRUCTURE_EXTENSION: 'extension', STRUCTURE_ROAD: 'road'
});
const sites = ['extension', 'road', 'link', 'container', 'tower']
  .map((structureType, index) => ({ structureType, index }));
assert.deepStrictEqual(sites.slice().sort((a, b) =>
  policy.priority(a) - policy.priority(b)).map(site => site.structureType),
['container', 'link', 'extension', 'tower', 'road']);
assert.strictEqual(policy.isDeferred({ structureType: 'extension' }, true),
  true);
assert.strictEqual(policy.isDeferred({ structureType: 'link' }, true), false);
assert.strictEqual(policy.isDeferred({ structureType: 'extension' }, false),
  false);
assert.strictEqual(policy.desiredCrew({
  structureType: 'link', progress: 0, progressTotal: 5000
}), 5);
assert.strictEqual(policy.desiredCrew({
  structureType: 'extension', progress: 0, progressTotal: 3000
}), 3);
assert.strictEqual(policy.desiredCrewTotal([
  { structureType: 'link', progress: 0, progressTotal: 5000 },
  { structureType: 'extension', progress: 0, progressTotal: 3000 }
], true), 5);

console.log('construction priority scenarios passed');
