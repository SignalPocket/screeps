'use strict';

const assert = require('assert');
const { placeRemoteContainerSite } = require('./remote.container-placement');
const constants = { TERRAIN_MASK_WALL: 1, LOOK_STRUCTURES: 'structures',
  LOOK_CONSTRUCTION_SITES: 'sites', STRUCTURE_ROAD: 'road',
  STRUCTURE_CONTAINER: 'container', OK: 0 };
const key = (x, y) => `${x}:${y}`;
const makeRoom = ({ structures = {}, sites = {}, walls = [], failures = [] } = {}) => {
  const placed = [];
  const room = {
    getTerrain: () => ({ get: (x, y) => walls.includes(key(x, y)) ? 1 : 0 }),
    lookForAt: (kind, x, y) => kind === 'structures'
      ? structures[key(x, y)] || [] : sites[key(x, y)] || [],
    createConstructionSite: (x, y, type) => {
      placed.push({ x, y, type });
      if (failures.includes(key(x, y))) return -7;
      sites[key(x, y)] = [{ id: `site-${x}-${y}`, structureType: type }];
      return 0;
    }
  };
  return { room, placed, sites };
};
const source = { pos: { x: 38, y: 6 } };
const creep = { pos: { getRangeTo: (x, y) =>
  Math.max(Math.abs(x - 37), Math.abs(y - 7)) } };

const roadOnly = makeRoom({
  structures: {
    '37:7': [{ id: 'left-road', structureType: 'road' }],
    '39:7': [{ id: 'right-road', structureType: 'road' }]
  },
  walls: ['37:5', '38:5', '39:5', '37:6', '39:6']
});
const roadPlacement = placeRemoteContainerSite({ room: roadOnly.room,
  source, creep, ...constants });
assert.deepStrictEqual([roadPlacement.x, roadPlacement.y], [37, 7]);
assert.strictEqual(roadPlacement.site.structureType, 'container');
assert.strictEqual(roadOnly.room.lookForAt('structures', 37, 7)[0].id,
  'left-road', 'placing a container preserves the existing road');

const mixed = makeRoom({ structures: {
  '39:7': [{ structureType: 'road' }],
  '37:6': [{ structureType: 'spawn' }]
}, walls: ['37:5', '38:5', '39:5', '39:6'] });
const mixedPlacement = placeRemoteContainerSite({ room: mixed.room,
  source, creep: { pos: { getRangeTo: () => 1 } }, ...constants });
assert.deepStrictEqual([mixedPlacement.x, mixedPlacement.y], [39, 7],
  'a compatible road wins a deterministic tie over an empty tile');

const occupied = makeRoom({ structures: {
  '37:7': [{ structureType: 'road' }]
}, sites: { '37:7': [{ structureType: 'road' }] },
walls: ['37:5', '38:5', '39:5', '37:6', '39:6', '38:7', '39:7'] });
assert.strictEqual(placeRemoteContainerSite({ room: occupied.room,
  source, creep, ...constants }), null,
  'an existing construction site prevents duplicate overlap');

const retry = makeRoom({ structures: {
  '37:7': [{ structureType: 'road' }],
  '39:7': [{ structureType: 'road' }]
}, walls: ['37:5', '38:5', '39:5', '37:6', '39:6', '38:7'],
failures: ['37:7'] });
const retried = placeRemoteContainerSite({ room: retry.room,
  source, creep, ...constants });
assert.deepStrictEqual([retried.x, retried.y], [39, 7],
  'placement failure advances to the next legal candidate');
assert.strictEqual(retry.placed.length, 2);

const edge = makeRoom();
assert(placeRemoteContainerSite({ room: edge.room,
  source: { pos: { x: 0, y: 1 } }, creep, ...constants }));
assert(edge.placed.every(candidate => candidate.x > 0 && candidate.y > 0),
  'border positions are never attempted');
console.log('remote source containers share roads and preserve legal placement boundaries');
