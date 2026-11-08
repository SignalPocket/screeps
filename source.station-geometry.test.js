'use strict';

const assert = require('assert');
const { isSourceStationAvailable, getSourceStationCandidates } =
  require('./source.station-geometry');

const position = (x, y) => ({ x, y,
  getRangeTo: (targetX, targetY) => Math.max(Math.abs(x - targetX),
    Math.abs(y - targetY)) });
const source = { pos: position(1, 1) };
const contents = new Map();
const room = {
  getTerrain: () => ({ get: (x, y) => x === 0 && y === 1 ? 1 : 0 }),
  lookForAt: (type, x, y) => (contents.get(`${type}:${x}:${y}`) || [])
};
const base = { room, source, LOOK_STRUCTURES: 'structures',
  LOOK_CONSTRUCTION_SITES: 'sites', LOOK_CREEPS: 'creeps',
  OBSTACLE_OBJECT_TYPES: ['spawn', 'rampart'], STRUCTURE_ROAD: 'road',
  STRUCTURE_RAMPART: 'rampart', TERRAIN_MASK_WALL: 1 };
const edgeCandidates = getSourceStationCandidates(base);
assert.strictEqual(edgeCandidates.length, 7,
  'an edge source keeps in-room adjacent tiles except the wall');
assert(edgeCandidates.some(tile => tile.x === 0 && tile.y === 0));
contents.set('structures:0:1', [{ structureType: 'road' }]);
assert(getSourceStationCandidates(base).some(tile => tile.x === 0 && tile.y === 1),
  'a completed road opens a wall tunnel');
contents.set('structures:1:0', [{ structureType: 'rampart', my: true }]);
assert(!isSourceStationAvailable({ ...base, x: 1, y: 0 }),
  'staffing retains its conservative rampart rule');
assert(isSourceStationAvailable({ ...base, x: 1, y: 0,
  allowWalkableRamparts: true }), 'friendly ramparts are optionally walkable');
contents.set('structures:2:0', [{ structureType: 'rampart', isPublic: true }]);
assert(isSourceStationAvailable({ ...base, x: 2, y: 0,
  allowWalkableRamparts: true }), 'public ramparts are optionally walkable');
contents.set('structures:2:1', [{ structureType: 'rampart' }]);
assert(!isSourceStationAvailable({ ...base, x: 2, y: 1,
  allowWalkableRamparts: true }), 'hostile ramparts remain blocked');
contents.set('sites:0:0', [{ structureType: 'spawn' }]);
assert(!isSourceStationAvailable({ ...base, x: 0, y: 0,
  blockConstructionSites: true }), 'planning may block obstacle sites');
assert(isSourceStationAvailable({ ...base, x: 0, y: 0 }),
  'execution ignores future obstacle sites');
contents.set('creeps:0:2', [{ name: 'other' }]);
assert(!isSourceStationAvailable({ ...base, x: 0, y: 2,
  avoidCreeps: true, ignoreCreep: 'self' }));
assert(isSourceStationAvailable({ ...base, x: 0, y: 2,
  avoidCreeps: true, ignoreCreep: 'other' }));
assert(!isSourceStationAvailable({ ...base, x: 2, y: 2,
  reserved: { '2:2': true } }));
assert(!isSourceStationAvailable({ ...base, x: 2, y: 2,
  container: { pos: position(4, 4) } }), 'container range remains enforced');

const { createWorkerLimits } = require('./worker.limits');
const sharedSources = [
  { id: 'left', pos: position(10, 10) },
  { id: 'right', pos: position(12, 10) }
];
let ownedCounts;
const sharedRoom = { name: 'W2N2', memory: {}, controller: null,
  getTerrain: () => ({ get: () => 0 }), lookForAt: () => [] };
const emptyRoles = Object.fromEntries(['source', 'builder', 'repairBuilder',
  'upgrader', 'hauler', 'refiller', 'rebalancer', 'tunnelBuilder']
  .map(role => [role, { min: 0, desired: 0 }]));
const sharedLimits = createWorkerLimits({ Game: { time: 1 },
  getRoomSources: () => sharedSources, getRoomCreeps: () => [],
  getSourceWorkerTargets: (targetRoom, counts) => {
    ownedCounts = counts; return { left: 0, right: 0 };
  },
  getRoomSituation: () => ({ targets: { builder: 0, repairBuilder: 0,
    upgrader: 0, hauler: 0, refiller: 0, rebalancer: 0,
    tunnelBuilder: 0 }, policy: { roles: emptyRoles, permissions: {},
    remote: {} } }),
  LOOK_STRUCTURES: 'structures', LOOK_CONSTRUCTION_SITES: 'sites',
  OBSTACLE_OBJECT_TYPES: ['spawn'], STRUCTURE_ROAD: 'road',
  STRUCTURE_RAMPART: 'rampart', TERRAIN_MASK_WALL: 1
}).getWorkerLimits(sharedRoom);
assert.strictEqual(sharedLimits.sourceSpotTotal, 13,
  'shared adjacent tiles count once');
assert.deepStrictEqual(ownedCounts, { left: 8, right: 5 },
  'stable source order owns equal-distance shared tiles');

console.log('source station geometry preserves caller-specific walkability');
