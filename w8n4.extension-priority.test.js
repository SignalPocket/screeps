'use strict';

const assert = require('assert');
const fs = require('fs');
const { createConstructionPriority } = require('./construction.priority');

const policy = createConstructionPriority({
  STRUCTURE_CONTAINER: 'container', STRUCTURE_LINK: 'link',
  STRUCTURE_EXTENSION: 'extension', STRUCTURE_ROAD: 'road'
});
const extension = { id: 'extension-site', structureType: 'extension' };
const container = { id: 'controller-container', structureType: 'container' };
const road = { id: 'road-site', structureType: 'road' };
const sites = [container, road, extension];
const before = JSON.stringify(sites);

for (let tick = 0; tick < 3; tick++) {
  assert.strictEqual(policy.requiresExtensionFirst('W8N4', sites), true);
  assert.deepStrictEqual(sites.filter(site =>
    policy.allowsSite('W8N4', sites, site)), [extension],
  'retained and controller-container targets yield to the pending extension');
}
assert.strictEqual(JSON.stringify(sites), before,
  'repeated extension-first checks do not mutate construction sites');
assert.deepStrictEqual(sites.filter(site =>
  policy.allowsSite('W7N4', sites, site)), sites,
'other rooms preserve their normal construction candidates');
assert.deepStrictEqual([container, road].filter(site =>
  policy.allowsSite('W8N4', [container, road], site)), [container, road],
'normal W8N4 ordering resumes when the final extension completes');
assert.deepStrictEqual([road, container].sort((a, b) =>
  policy.priority(a) - policy.priority(b)), [container, road],
'after extensions finish, containers precede retained road targets');
assert.deepStrictEqual([road].sort((a, b) =>
  policy.priority(a) - policy.priority(b)), [road],
'roads resume after the container tier finishes');

const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.includes('const extensionFirst = constructionPriority.requiresExtensionFirst('));
assert(main.includes('constructionPriority.allowsSite(creep.room.name, roomSites, site)'));
assert(main.includes('if (!extraFilter && !extensionFirst && creep.room.controller)'));
assert(main.includes('if (!extraFilter && !extensionFirst && !linksPending'));
assert(main.includes('target.structureType !== STRUCTURE_EXTENSION'));

console.log('W8N4 extension-first retention, override, completion and room isolation passed');
