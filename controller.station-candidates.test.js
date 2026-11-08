'use strict';

const assert = require('assert');
const { getControllerStationCandidates } =
  require('./controller.station-candidates');

const rangePosition = (x, y) => ({ x, y,
  getRangeTo: (targetX, targetY) => Math.max(Math.abs(x - targetX),
    Math.abs(y - targetY)) });
const buffers = [
  { id: 'a', pos: { x: 2, y: 2 } },
  { id: 'b', pos: { x: 3, y: 2 } }
];
const structures = new Map([
  ['1:2', [{ structureType: 'spawn' }]],
  ['2:3', [{ structureType: 'rampart', my: true }]],
  ['3:3', [{ structureType: 'rampart', isPublic: true }]],
  ['4:2', [{ structureType: 'rampart' }]]
]);
const room = {
  name: 'W1N1', controller: { pos: rangePosition(2, 2) },
  getTerrain: () => ({ get: (x, y) => x === 1 && y === 1 ? 1 : 0 }),
  lookForAt: (type, x, y) => structures.get(`${x}:${y}`) || []
};
const dependencies = { room, buffers, STRUCTURE_RAMPART: 'rampart',
  TERRAIN_MASK_WALL: 1, LOOK_STRUCTURES: 'structures',
  OBSTACLE_OBJECT_TYPES: ['spawn', 'rampart'] };
const candidates = getControllerStationCandidates(dependencies);
assert(!candidates.some(candidate => candidate.x === 0 || candidate.y === 0));
assert(!candidates.some(candidate => candidate.x === 1 && candidate.y === 1));
assert(!candidates.some(candidate => candidate.x === 1 && candidate.y === 2));
assert(!candidates.some(candidate => candidate.x === 4 && candidate.y === 2));
assert(candidates.some(candidate => candidate.x === 2 && candidate.y === 3));
assert(candidates.some(candidate => candidate.x === 3 && candidate.y === 3));
const overlap = candidates.filter(candidate =>
  candidate.x === 2 && candidate.y === 1);
assert.strictEqual(overlap.length, 2,
  'overlapping neighborhoods remain buffer-relative capacity');
const excluded = getControllerStationCandidates({ ...dependencies,
  excluded: new Set(['2:1']) });
assert(!excluded.some(candidate => candidate.x === 2 && candidate.y === 1));
const rangeRoom = { ...room,
  controller: { pos: rangePosition(10, 10) },
  getTerrain: () => ({ get: () => 0 }), lookForAt: () => [] };
const rangeCandidates = getControllerStationCandidates({ ...dependencies,
  room: rangeRoom, buffers: [{ id: 'range', pos: { x: 13, y: 10 } }] });
assert(rangeCandidates.some(candidate => candidate.x === 13 &&
  candidate.y === 11), 'controller range three remains legal');
assert(!rangeCandidates.some(candidate => candidate.x === 14),
  'controller range four remains excluded');
const borderCandidates = getControllerStationCandidates({ ...dependencies,
  room: { ...rangeRoom, controller: { pos: rangePosition(2, 2) } },
  buffers: [{ id: 'border', pos: { x: 1, y: 1 } }] });
assert(borderCandidates.every(candidate => candidate.x >= 1 &&
  candidate.y >= 1), 'room-edge coordinates remain excluded');
assert.strictEqual(getControllerStationCandidates({ ...dependencies,
  room: { ...room, controller: null } }).length, 0);

console.log('controller station candidates preserve geometry and exclusions');
