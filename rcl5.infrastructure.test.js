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
const containers = [
  { id: 'extension-container', structureType: 'container',
    pos: position(12, 10) },
  { id: 'controller-container', structureType: 'container',
    pos: position(30, 25) }
];
const sites = [];
const room = {
  name: 'W1N1', memory: {},
  energyAvailable: 550, energyCapacityAvailable: 550,
  controller: { my: true, level: 5, pos: position(25, 25) },
  storage: { my: true, pos: position(20, 20) },
  getTerrain: () => ({ get: () => 0 }),
  lookForAt: () => [],
  find(type, options) {
    const values = type === 'my-structures' ? structures
      : type === 'structures' ? containers
      : type === 'sites' ? sites
      : type === 'spawns' ? [{ id: 'spawn-1', pos: position(3, 3) }] : [];
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
  getContainerPurpose: (candidateRoom, pos) =>
    pos.x === 12 && pos.y === 10 ? 'extensions'
      : pos.x === 30 && pos.y === 25 ? 'controller' : null,
  CONTROLLER_STRUCTURES: { link: { 5: 2 }, tower: { 5: 2 } },
  STRUCTURE_LINK: 'link', STRUCTURE_TOWER: 'tower',
  STRUCTURE_CONTAINER: 'container',
  STRUCTURE_ROAD: 'road', STRUCTURE_RAMPART: 'rampart',
  FIND_STRUCTURES: 'structures', FIND_MY_STRUCTURES: 'my-structures',
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
assert.ok(linkSites.some(site =>
  containers[0].pos.getRangeTo(site) === 1));
assert.ok(linkSites.some(site =>
  containers[1].pos.getRangeTo(site) === 1));

const energyStore = (energy, capacity = 800) => ({
  energy,
  getCapacity: () => capacity,
  getFreeCapacity: () => capacity - energy
});
const controllerLink = { id: 'controller-link', structureType: 'link',
  pos: position(30, 24),
  store: energyStore(0) };
const extensionLink = { id: 'extension-link', structureType: 'link',
  pos: position(12, 11), store: energyStore(600), cooldown: 0,
  transferEnergy(target, amount) {
    this.transferred = { target: target.id, amount };
    return 0;
  }
};
containers[1].store = energyStore(0, 2000);
structures.push(controllerLink, extensionLink);
sites.splice(0, sites.length);
assert.strictEqual(network.runLinks(room).transfers, 1);
assert.deepStrictEqual(extensionLink.transferred,
  { target: 'controller-link', amount: 600 });
assert.strictEqual(room.memory.linkNetworkStatus.direction,
  'extension-link->controller-link',
  'charged extensions may send staged surplus up to an RC deficit');
assert.ok(room.memory.linkNetworkStatus.controllerDemand > 0);

controllerLink.store = energyStore(700);
controllerLink.cooldown = 0;
controllerLink.transferEnergy = extensionLink.transferEnergy;
extensionLink.store = energyStore(0);
delete extensionLink.transferred;
room.energyAvailable = 0;
assert.strictEqual(network.runLinks(room).transfers, 0,
  'controller reserve fills before surplus is beamed to extensions');
containers[1].store = energyStore(1500, 2000);
assert.strictEqual(network.runLinks(room).transfers, 1);
assert.deepStrictEqual(controllerLink.transferred,
  { target: 'extension-link', amount: 550 });

room.memory.linkNetworkPlan = {
  purpose: 'spawn', x: 40, y: 40, updated: 100
};
const legacyExtensionLink = { id: 'legacy-extension-link',
  structureType: 'link', pos: position(40, 40), store: energyStore(0) };
const legacyControllerLink = { id: 'legacy-controller-link',
  structureType: 'link', pos: position(33, 25), store: energyStore(200) };
assert.strictEqual(network.isExtensionLink(room, legacyExtensionLink), true);
assert.strictEqual(network.isControllerLink(room, legacyControllerLink), true);

let destroyedLegacyLink = false;
legacyControllerLink.destroy = () => {
  destroyedLegacyLink = true;
  return 0;
};
structures.splice(0, structures.length, legacyControllerLink);
assert.strictEqual(network.isAdjacentToPurposeContainer(room,
  legacyControllerLink, 'controller'), false);
assert.strictEqual(network.migrateMisplacedLink(room), false,
  'a misplaced link containing energy drains before removal');
assert.strictEqual(destroyedLegacyLink, false);
legacyControllerLink.store = energyStore(0);
assert.strictEqual(network.migrateMisplacedLink(room), true);
assert.strictEqual(destroyedLegacyLink, true);
legacyControllerLink.store = energyStore(200);

structures.splice(0, structures.length, legacyControllerLink);
containers[1].store = energyStore(200, 2000);
const handoff = network.selectControllerLinkHandoff(room);
assert.strictEqual(handoff.source.id, 'legacy-controller-link');
assert.strictEqual(handoff.target.id, 'controller-container');
containers[1].store = energyStore(1800, 2000);
assert.strictEqual(network.selectControllerLinkHandoff(room), null);

structures.splice(0, structures.length, legacyControllerLink,
  legacyExtensionLink);
legacyControllerLink.store = energyStore(0);
containers[1].store = energyStore(1800, 2000);
room.energyAvailable = 0;
const feed = network.selectControllerLinkFeed(room);
assert.strictEqual(feed.source.id, 'controller-container');
assert.strictEqual(feed.target.id, 'legacy-controller-link');
assert.strictEqual(feed.amount, 300);
containers[1].store = energyStore(500, 2000);
assert.strictEqual(network.selectControllerLinkFeed(room), null);
room.energyAvailable = room.energyCapacityAvailable;
containers[1].store = energyStore(1800, 2000);
assert.strictEqual(network.selectControllerLinkFeed(room), null);

console.log('RCL5 infrastructure scenarios passed');
