'use strict';

const assert = require('assert');
const { createEnergyStoreRegistry } = require('./energy.store-registry');

const range = (a, b) => Math.max(Math.abs(a.x - b.pos.x),
  Math.abs(a.y - b.pos.y));
const source = { id: 'source', pos: { x: 10, y: 10 } };
source.pos.getRangeTo = target => range(source.pos, target);
const stores = [
  { id: 'source-container', structureType: 'container',
    pos: { x: 11, y: 10 } },
  { id: 'handoff-container', structureType: 'container',
    pos: { x: 20, y: 20 } },
  { id: 'storage', structureType: 'storage', pos: { x: 25, y: 25 } }
];
const objects = Object.fromEntries(stores.map(store => [store.id, store]));
const room = { name: 'W1N1', memory: {} };
const Game = { time: 100, getObjectById: id => objects[id] || null };
const registry = createEnergyStoreRegistry({
  Game,
  getRoomSources: () => [source],
  getRoomStructures: () => stores,
  getContainerPurpose: (targetRoom, position) => position.x === 20
    ? 'relay:W2N1' : `source:${source.id}`,
  STRUCTURE_CONTAINER: 'container',
  STRUCTURE_STORAGE: 'storage'
});

const saved = registry.getRegistry(room);
assert.strictEqual(saved.entries.length, 3);
assert.strictEqual(saved.entries.find(entry =>
  entry.id === 'source-container').remoteDeliveryEligible, false);
assert.strictEqual(saved.entries.find(entry =>
  entry.id === 'handoff-container').purpose, 'relay:W2N1');
assert.deepStrictEqual(registry.getRemoteDeliveryStores(room)
  .map(store => store.id).sort(), ['handoff-container', 'storage']);
assert.strictEqual(registry.getRegistry(room), saved);

console.log('energy store registry scenarios passed');
