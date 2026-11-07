'use strict';

const assert = require('assert');
const { createRoomIndex } = require('./room.index');

const calls = {};
const room = {
  name: 'W1N1', memory: {},
  find: type => {
    calls[type] = (calls[type] || 0) + 1;
    if (type === 'sources') return [{ id: 'source' }];
    if (type === 'structures') return [
      { id: 'container', structureType: 'container' },
      { id: 'road', structureType: 'road' }
    ];
    if (type === 'sites') return [
      { id: 'extension-site', structureType: 'extension' }
    ];
    return [{ id: 'creep' }];
  }
};
const objects = {
  container: { id: 'container', structureType: 'container' },
  road: { id: 'road', structureType: 'road' },
  'extension-site': { id: 'extension-site', structureType: 'extension' }
};
const index = createRoomIndex({
  Game: { time: 10, getObjectById: id => objects[id] },
  FIND_SOURCES: 'sources', FIND_STRUCTURES: 'structures',
  FIND_MY_CONSTRUCTION_SITES: 'sites', FIND_MY_CREEPS: 'creeps'
});
assert.strictEqual(index.getRoomStructuresByType(room, 'container').length, 1);
assert.strictEqual(index.getRoomStructures(room).length, 2);
assert.strictEqual(index.getRoomSitesByType(room, 'extension').length, 1);
assert.strictEqual(index.getRoomSites(room).length, 1);
assert.strictEqual(calls.structures, 1);
assert.strictEqual(calls.sites, 1);

console.log('room index scenarios passed');
