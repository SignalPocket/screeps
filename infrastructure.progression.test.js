'use strict';
const assert = require('assert');
const { ownedInfrastructureRooms, assessInfrastructureProgression: assess } =
  require('./infrastructure.progression');
const { createExtensionGrowthPlanner } = require('./extension.layout');
const limits = { extension: { 1: 0, 2: 5, 3: 10, 4: 20 },
  spawn: { 1: 1, 2: 1, 3: 1, 7: 2 }, container: { 2: 5 } };
const pos = (x, y) => ({ x, y });
const room = { name: 'new-room', controller: { id: 'controller', my: true,
  level: 2, pos: pos(40, 40) }, memory: {} };
const spawn = { id: 'spawn', pos: pos(25, 25), my: true,
  structureType: 'spawn' };
const input = { room, spawns: [], structures: [], sites: [], limits,
  tick: 10, allowSlowPlanning: true, globalSiteCount: 0 };
assert.deepStrictEqual(ownedInfrastructureRooms({ room,
  reserved: { controller: { reservation: {} } },
  enemy: { controller: { my: false } }, highway: {} }), [room]);
let result = assess(input);
assert.strictEqual(result.eligible, true);
assert.strictEqual(result.spawnCapability, 'awaiting-first-spawn');
assert.strictEqual(result.inventory.extension.missing, 5);
const previous = { signature: result.signature, checked: 10 };
assert.strictEqual(assess({ ...input, previous, tick: 11 }).gate,
  'periodic-retry-not-due');
assert.strictEqual(assess({ ...input, previous, tick: 30 }).eligible, true);
assert.strictEqual(assess({ ...input, previous, spawns: [spawn],
  tick: 11 }).eligible, true, 'first spawn completion bypasses periodic delay');
assert.strictEqual(assess({ ...input, previous, spawns: [spawn,
  { id: 'second' }], tick: 11 }).changed, true);
const spawnSignature = assess({ ...input, spawns: [spawn, { id: 'second' }] });
assert.strictEqual(assess({ ...input, spawns: [{ id: 'second' }, spawn],
  previous: { signature: spawnSignature.signature, checked: 10 },
  tick: 11 }).changed, false, 'spawn enumeration order is irrelevant');
room.controller.level = 3;
assert.strictEqual(assess({ ...input, previous, tick: 11 }).eligible, true);
room.controller.level = 2;
assert.strictEqual(assess({ ...input, previous: undefined,
  allowSlowPlanning: false }).gate, 'cpu-slow-planning-disabled');
assert.strictEqual(assess({ ...input, globalSiteCount: 100 }).gate,
  'global-construction-cap');
assert.strictEqual(assess({ ...input, globalSiteCount: 99 }).eligible, true);
assert.strictEqual(assess({ ...input, sites: Array.from({ length: 5 },
  () => ({ structureType: 'extension' })) }).inventory.extension.missing, 0);
assert.strictEqual(assess({ ...input, structures: [{ my: false,
  structureType: 'extension' }] }).inventory.extension.built, 0);
// Exercise the actual placement authority with live-style mutable inventories.
let structures = [spawn], sites = [], calls = [], spawns = [spawn];
let terrain = () => 0, placementResult = 0;
const Game = { time: 10 };
Object.assign(room, {
  find(type) { return type === 'structures' ? structures :
    type === 'sites' ? sites : spawns; },
  getTerrain() { return { get: terrain }; },
  createConstructionSite(x, y, structureType) {
    calls.push({ x, y, structureType });
    if (placementResult === 0) sites.push({ id: `site-${calls.length}`,
      pos: pos(x, y), structureType, remove() { throw Error('manual removal'); } });
    return placementResult;
  }
});
const run = createExtensionGrowthPlanner({ Game, FIND_STRUCTURES: 'structures',
  FIND_MY_CONSTRUCTION_SITES: 'sites', FIND_MY_SPAWNS: 'spawns',
  CONTROLLER_STRUCTURES: limits, getRoomSources: () => [], OK: 0 });
// An invalid old sixty-extension layout must not gate current RCL capacity.
room.memory.singleExtensionLayout = { valid: false, reason: 'RCL8 capacity' };
result = run(room);
assert.strictEqual(result.reason, 'site-placed');
assert.strictEqual(calls.length, 1, 'bounded to one successful site per pass');
run(room);
assert.strictEqual(calls.length, 1, 'pending site is counted on repeated calls');
for (let i = 0; i < 5; i++) {
  if (!sites.length) run(room);
  const site = sites.shift();
  structures.push({ ...site, my: true,
    destroy() { throw Error('existing extension demolition'); } });
}
assert.strictEqual(run(room).reason, 'capacity-covered');
assert.strictEqual(structures.filter(s => s.structureType === 'extension').length, 5);
const before = calls.length;
room.controller.level = 3;
assert.strictEqual(run(room).reason, 'site-placed', 'RCL advance unlocks growth');
assert.strictEqual(calls.length, before + 1);
const manual = [[21,29], [20,30], [20,28], [19,29], [18,28]].map(([x,y]) =>
  ({ pos: pos(x,y), structureType: 'extension',
    remove() { throw Error('manual extension removal'); } }));
structures = [spawn]; sites = manual.slice(); room.controller.level = 2;
assert.strictEqual(run(room).reason, 'capacity-covered');
assert.deepStrictEqual(sites, manual);
room.controller.level = 3;
assert.strictEqual(run(room).reason, 'extensions-under-construction');
assert.deepStrictEqual(sites, manual);
sites = []; spawns = [];
assert.strictEqual(run(room).reason, 'awaiting-first-spawn');
spawns = [spawn, { id: 'second', pos: pos(20,20) }];
placementResult = -8;
assert.strictEqual(run(room).reason, 'placement-rejected');
assert.strictEqual(room.memory.extensionGrowth.result, -8);
terrain = () => 1;
assert.strictEqual(run(room).reason, 'no-connected-layout');
assert.strictEqual(room.memory.singleExtensionLayout.valid, false,
  'growth preserves historical migration state');
// A constrained bootstrap room can fit its current capacity while the
// historical 60-extension plan cannot. No wall/road/occupied tile is replaced.
structures = [spawn]; sites = []; placementResult = 0;
room.controller.level = 2;
terrain = (x,y) => x >= 22 && x <= 28 && y >= 22 && y <= 28 ? 0 : 1;
assert.strictEqual(run(room).reason, 'site-placed');
const firstTarget = { ...sites[0].pos };
sites = [];
structures.push({ structureType: 'road', pos: firstTarget,
  destroy() { throw Error('road demolition'); } });
assert.strictEqual(run(room).reason, 'site-placed');
assert.notDeepStrictEqual(sites[0].pos, firstTarget);
assert.strictEqual(terrain(sites[0].pos.x, sites[0].pos.y), 0);
structures = [spawn, ...manual.map(s => ({ ...s, my: true,
  destroy() { throw Error('completed manual extension demolition'); } }))];
sites = [];
assert.strictEqual(run(room).reason, 'capacity-covered');
// Multiple owned rooms retain independent progression receipts and inventories.
const other = { ...room, name: 'other', memory: {},
  controller: { id: 'other-controller', my: true, level: 1 } };
assert.strictEqual(run(other).reason, 'controller-level');
assert.strictEqual(room.memory.extensionGrowth.reason, 'capacity-covered');
console.log('owned-room infrastructure transitions and non-destructive growth passed');
