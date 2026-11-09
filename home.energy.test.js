'use strict';

const assert = require('assert');
const fs = require('fs');
const {
  collectOperationalRoomHealth,
  homePickupCandidates,
  networkRecoveryNeeded
} = require('./home.energy');

const link = { id: 'spawn-link', store: {} };
const buffer = { id: 'spawn-buffer', store: {} };
const sourceStore = { id: 's2-container', store: {} };
const storage = { id: 'storage', store: {} };
const creep = { memory: { role: 'hauler' } };
const args = {
  creep,
  candidates: [link, buffer, sourceStore, storage],
  planned: { id: 's2' },
  isSpawnReserve: structure => [link, buffer].includes(structure),
  isSourceBuffer: (structure, planned) =>
    structure === sourceStore && planned.id === 's2'
};
assert.deepStrictEqual(homePickupCandidates(args), [sourceStore],
  'source assignment survives pickup reservation matching');
assert.deepStrictEqual(homePickupCandidates({ ...args, planned: storage }),
  [storage]);
assert.deepStrictEqual(homePickupCandidates({ ...args, planned: null }),
  [sourceStore, storage], 'haulers cannot siphon reserved spawn fuel');
assert.strictEqual(homePickupCandidates({ ...args,
  creep: { memory: { role: 'refiller' } } }).length, 4);
assert(networkRecoveryNeeded({ energy: 800, capacity: 1750 }));
assert(networkRecoveryNeeded({ energy: 1700, capacity: 1750,
  previous: true }));
assert(!networkRecoveryNeeded({ energy: 1750, capacity: 1750,
  previous: true }));
assert(!networkRecoveryNeeded({ energy: 1700, capacity: 1750 }));

const FIND = { sources: 1, drops: 2, structures: 3, sites: 4 };
const makeRoom = (name, controller, memory, finds) => ({
  name,
  controller,
  memory,
  energyAvailable: controller && controller.my ? 300 : undefined,
  energyCapacityAvailable: controller && controller.my ? 550 : undefined,
  find: type => finds[type] || []
});
const source = energy => ({ energy });
const drop = amount => ({ resourceType: 'energy', amount });
const structure = (structureType, energy, hits = 1000,
  hitsMax = 1000) => ({ structureType, store: { energy }, hits, hitsMax });
const site = (progress, progressTotal) => ({ progress, progressTotal });
const trend = (tick, overrides = {}) => ({ records: [{
  tick, stored: 1000, build: 350, repair: 11,
  population: 3, desired: 4, ...overrides
}] });
const demand = (tick, overrides = {}) => ({
  tick, sourceStored: 70, storageFree: 200,
  buildRemaining: 300, repairEnergy: 9,
  energyWorkPhase: 'repair', ...overrides
});

const Memory = { rooms: {
  W7N4: {
    roomStatus: { updated: 100, label: 'Healthy', reasons: [] },
    demandPlan: demand(100),
    roomTrendHistory: trend(95),
    reservationStatus: {
      W7N3: { tick: 100, owner: null, observedReservation: {
        username: 'ginaria', ticksToEnd: 4500
      } },
      W8N3: { tick: 90, owner: null, observedReservation: {
        username: 'ginaria', ticksToEnd: 3200
      } }
    }
  },
  W8N4: {
    roomStatus: { updated: 100, label: 'Stable', reasons: [] },
    demandPlan: demand(100, { sourceStored: 0, buildRemaining: 0,
      repairEnergy: 0 }),
    roomTrendHistory: trend(100, { stored: 0, build: 0, repair: 0 })
  },
  W7N3: {
    roomStatus: { updated: 100, label: 'Remote active', reasons: [] },
    combatStatus: { updated: 100, state: 'Peace', fighting: false,
      hostileCount: 0 }
  },
  W8N3: {
    roomStatus: { updated: 90, label: 'Remote stale', reasons: ['unseen'] },
    demandPlan: demand(90),
    roomTrendHistory: trend(85)
  }
} };
const Game = { time: 100, rooms: {} };
Game.rooms.W7N4 = makeRoom('W7N4', {
  my: true, owner: { username: 'ginaria' }
}, Memory.rooms.W7N4, {
  [FIND.sources]: [source(100)],
  [FIND.drops]: [drop(10), { resourceType: 'H', amount: 500 }],
  [FIND.structures]: [
    structure('container', 50),
    structure('spawn', 30),
    structure('road', 0, 500, 1000),
    structure('rampart', 0, 1, 10000)
  ],
  [FIND.sites]: [site(25, 100)]
});
Game.rooms.W8N4 = makeRoom('W8N4', {
  my: true, owner: { username: 'ginaria' }
}, Memory.rooms.W8N4, {});
Game.rooms.W7N3 = makeRoom('W7N3', {
  my: false, owner: null,
  reservation: { username: 'ginaria', ticksToEnd: 4499 }
}, Memory.rooms.W7N3, {
  [FIND.sources]: [source(200)],
  [FIND.drops]: [],
  [FIND.structures]: [structure('container', 80, 900, 1000)],
  [FIND.sites]: [site(10, 60)]
});

const before = JSON.stringify({ Game, Memory });
const report = collectOperationalRoomHealth({
  Game,
  Memory,
  findSources: FIND.sources,
  findDroppedResources: FIND.drops,
  findStructures: FIND.structures,
  findConstructionSites: FIND.sites,
  resourceEnergy: 'energy',
  repairPower: 100
});
assert.deepStrictEqual(report.roomNames, ['W7N4', 'W8N4', 'W7N3', 'W8N3']);
assert.strictEqual(report.rows.length, 4);
assert.strictEqual(new Set(report.roomNames).size, 4);
const home = report.rows[0];
assert.strictEqual(home.scope.configuredRole, 'home');
assert.strictEqual(home.scope.ownedHome, true);
assert.strictEqual(home.energy.available, 190);
assert.strictEqual(home.energy.collectable, 160);
assert.strictEqual(home.energy.harvestable, 100);
assert.strictEqual(home.energy.dropped, 10);
assert.strictEqual(home.energy.stored, 80);
assert.strictEqual(home.energy.withdrawable, 50);
assert.strictEqual(home.energy.spawnAvailable, 300);
assert(home.energy.evidenceLimit.includes('before task reservations'));
assert.strictEqual(home.energy.observations.available.freshness,
  'current tick');
assert.strictEqual(home.work.repairTargets, 1,
  'barriers are excluded from routine repair health');
assert.strictEqual(home.work.repairEnergy, 5);
assert.strictEqual(home.work.constructionTargets, 1);
assert.strictEqual(home.work.constructionRemaining, 75);
assert(home.work.evidenceLimit.includes('excludes walls and ramparts'));

const emptyHome = report.rows[1];
assert.strictEqual(emptyHome.energy.available, 0);
assert.strictEqual(emptyHome.energy.collectable, 0);
assert.strictEqual(emptyHome.work.repairEnergy, 0);
assert.strictEqual(emptyHome.work.constructionRemaining, 0);

const remote = report.rows[2];
assert.strictEqual(remote.scope.configuredRole, 'reserved');
assert.strictEqual(remote.scope.ownedHome, false);
assert.strictEqual(remote.scope.controllerStatus, 'reserved');
assert.strictEqual(remote.energy.available, 280);
assert.strictEqual(remote.energy.collectable, 280);
assert.strictEqual(remote.energy.spawnAvailable, null);
assert.strictEqual(remote.energy.spawnCapacity, null);
assert.strictEqual(remote.work.repairEnergy, 1);
assert.strictEqual(remote.work.constructionRemaining, 50);

const unseen = report.rows[3];
assert.strictEqual(unseen.scope.visibility.visible, false);
assert.strictEqual(unseen.scope.visibility.observation.freshness,
  'stale by 10 ticks');
assert.strictEqual(unseen.energy.available, 1000);
assert.strictEqual(unseen.energy.basis.available,
  'remembered stored energy only');
assert.strictEqual(unseen.energy.observations.available.freshness,
  'stale by 15 ticks');
assert.strictEqual(unseen.energy.collectable, 70);
assert.strictEqual(unseen.energy.basis.collectable,
  'remembered source-buffer energy only');
assert.strictEqual(unseen.energy.observations.collectable.freshness,
  'stale by 10 ticks');
assert.strictEqual(unseen.work.repairEnergy, 9);
assert.strictEqual(unseen.work.constructionRemaining, 300);
assert.strictEqual(unseen.work.repairTargets, null);
assert.strictEqual(unseen.work.constructionTargets, null);
assert.strictEqual(unseen.work.observation.freshness, 'stale by 10 ticks');
assert(unseen.work.evidenceLimit.includes('may have changed'));
assert.strictEqual(JSON.stringify({ Game, Memory }), before,
  'room health reporting does not mutate Game or Memory');
assert.deepStrictEqual(collectOperationalRoomHealth({
  Game, Memory, findSources: FIND.sources,
  findDroppedResources: FIND.drops, findStructures: FIND.structures,
  findConstructionSites: FIND.sites
}), report, 'room health output is deterministic');
assert(Object.isFrozen(report));
assert(Object.isFrozen(report.rows));
assert(Object.isFrozen(unseen.energy.observations));

const unknown = collectOperationalRoomHealth({
  Game: { time: 100, rooms: {} }, Memory: { rooms: {} }
});
assert.deepStrictEqual(unknown.roomNames,
  ['W7N4', 'W8N4', 'W7N3', 'W8N3']);
assert(unknown.rows.every(row => row.energy.available === null));
assert(unknown.rows.every(row =>
  row.energy.observations.available.freshness === 'unknown'));
assert(unknown.rows.every(row => row.work.repairEnergy === null));

const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.includes('restoreExtensionReserve || restoreSpawnNetwork'),
  'refill recovery can cancel a lower-priority loaded delivery');
assert(main.includes('getCandidates:c=>homePickupCandidates'));
const sourceText = fs.readFileSync(require.resolve('./home.energy'), 'utf8');
assert.match(sourceText,
  /typeof Game === 'undefined'[\s\S]{0,100}require\('\.\/colony\.scope'\)[\s\S]{0,50}require\('colony\.scope'\)/,
  'the live Screeps loader uses the server colony.scope module name');

console.log('four-room energy health preserves live, stale and unknown evidence');
