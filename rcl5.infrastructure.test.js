'use strict';

const assert = require('assert');
const { createRcl5Infrastructure } = require('./rcl5.infrastructure');

const position = (x, y) => ({
  x, y,
  getRangeTo(targetOrX, maybeY) {
    const target = typeof targetOrX === 'number'
      ? { x: targetOrX, y: maybeY }
      : targetOrX.pos || targetOrX;
    return Math.max(Math.abs(x - target.x), Math.abs(y - target.y));
  }
});
const source = { id: 'source', pos: position(5, 5) };
const structures = [{ id: 'tower-1', structureType: 'tower',
  pos: position(18, 20) }];
const sites = [];
const room = {
  name: 'W1N1', memory: {},
  controller: { my: true, level: 5, pos: position(25, 25) },
  storage: { my: true, pos: position(20, 20) },
  getTerrain: () => ({ get: () => 0 }),
  lookForAt: () => [],
  find(type, options) {
    const values = type === 'my-structures' ? structures
      : type === 'sites' ? sites
      : type === 'spawns' ? [{ id: 'spawn-1', pos: position(10, 10) }] : [];
    return options && options.filter ? values.filter(options.filter) : values;
  },
  createConstructionSite(x, y, structureType) {
    sites.push({ id: `site-${sites.length}`, structureType,
      pos: position(x, y) });
    return 0;
  }
};
const network = createRcl5Infrastructure({
  Game: { time: 500 }, getRoomSources: () => [source],
  CONTROLLER_STRUCTURES: { link: { 5: 2 }, tower: { 5: 2 } },
  STRUCTURE_LINK: 'link', STRUCTURE_TOWER: 'tower',
  STRUCTURE_ROAD: 'road', STRUCTURE_RAMPART: 'rampart',
  FIND_MY_STRUCTURES: 'my-structures',
  FIND_MY_CONSTRUCTION_SITES: 'sites', FIND_MY_SPAWNS: 'spawns',
  TERRAIN_MASK_WALL: 1, TERRAIN_MASK_SWAMP: 2,
  LOOK_STRUCTURES: 'structures-at', LOOK_CONSTRUCTION_SITES: 'sites-at',
  RESOURCE_ENERGY: 'energy', OK: 0
});

assert.strictEqual(network.placeTowerSite(room), true);
assert.strictEqual(sites.filter(site => site.structureType === 'tower').length,
  1);
assert.strictEqual(network.placeTowerSite(room), false);
assert.strictEqual(network.placeLinkSite(room), true);
assert.strictEqual(network.placeLinkSite(room), true);
assert.strictEqual(network.placeLinkSite(room), false);
const linkSites = sites.filter(site => site.structureType === 'link');
assert.strictEqual(linkSites.length, 2);
assert.ok(linkSites.some(site => room.controller.pos.getRangeTo(site) <= 3));
assert.ok(linkSites.some(site => position(10, 10).getRangeTo(site) <= 2));

const energyStore = (energy, capacity = 800) => ({
  energy,
  getFreeCapacity: () => capacity - energy
});
const controllerLink = { id: 'controller-link', structureType: 'link',
  pos: position(24, 24),
  store: energyStore(0) };
const spawnLink = { id: 'spawn-link', structureType: 'link',
  pos: position(11, 10), store: energyStore(600), cooldown: 0,
  transferEnergy(target, amount) {
    this.transferred = { target: target.id, amount };
    return 0;
  }
};
structures.push(controllerLink, spawnLink);
sites.splice(0, sites.length);
assert.strictEqual(network.runLinks(room).transfers, 1);
assert.deepStrictEqual(spawnLink.transferred,
  { target: 'controller-link', amount: 600 });

controllerLink.store = energyStore(700);
controllerLink.cooldown = 0;
controllerLink.transferEnergy = spawnLink.transferEnergy;
spawnLink.store = energyStore(0);
delete spawnLink.transferred;
assert.strictEqual(network.runLinks(room).transfers, 0);
assert.strictEqual(controllerLink.transferred, undefined);

console.log('RCL5 infrastructure scenarios passed');
