'use strict';

const assert = require('assert');
const fs = require('fs');
const { ENERGY_DEFINITION, createEnergyCommand } = require('./operator.energy');
const { createOperatorConsole } = require('./operator.console');

const store = (energy, capacity) => ({
  energy,
  getCapacity: () => capacity,
  getFreeCapacity: () => capacity - energy
});
const pos = range => ({ getRangeTo: () => range });
const structure = (id, structureType, energy, capacity, range = 10) => ({
  id, structureType, store: store(energy, capacity), pos: pos(range)
});
const room = (name, data, memory = {}) => ({
  name,
  controller: { my: true },
  memory,
  find: type => data[type] || []
});
const canonicalRow = (roomName, overrides = {}) => ({
  roomName,
  health: 'Strained',
  mode: 'logistics-backup',
  energy: { stored: 990000, freeCapacity: 0,
    spawnAvailable: 900, spawnCapacity: 1800, resource: 'energy' },
  work: { buildRemaining: 500, repairEnergy: 100 },
  logistics: { flow: 'blocked', sourceStored: 1200 },
  remotes: { backlog: 700 },
  observations: {
    demandPlan: { tick: 1000, age: 0, freshness: 'current tick' },
    trend: { tick: 750, age: 250, freshness: 'stale by 250 ticks' }
  },
  ...overrides
});
const types = { sources: 1, dropped: 2, tombstones: 3, ruins: 4,
  structures: 5 };
const structureTypes = { container: 'container', link: 'link',
  storage: 'storage', terminal: 'terminal', spawn: 'spawn',
  extension: 'extension', tower: 'tower' };
const structures = [
  structure('container-source', 'container', 1200, 2000),
  structure('container-controller', 'container', 400, 2000, 2),
  structure('link-controller', 'link', 300, 800, 2),
  structure('storage', 'storage', 990000, 1000000),
  structure('terminal', 'terminal', 5000, 300000),
  structure('spawn', 'spawn', 200, 300),
  structure('extension', 'extension', 50, 50),
  structure('tower', 'tower', 800, 1000)
];
const memory = {
  demandPlan: { tick: 1000, sourceStored: 1200, spawnFree: 100,
    energyWorkPhase: 'refill', lanes: { collect: 2, refill: 1 },
    refillCarrier: 'hauler', refillCarriers: ['hauler'],
    commitments: { hauler: { lane: 'collect' } } },
  laborPlan: { updated: 995, income: 18, refillUse: 4,
    buildBudget: 5, repairBudget: 2, upgradeBudget: 7 },
  laborStats: { lastTick: 1000, creeps: {
    filler: { kind: 'refiller', bins: { 950: { ticks: 10, output: 30 } } },
    builder: { kind: 'builder', bins: { 950: { ticks: 10, output: 50 } } },
    fixer: { kind: 'repairBuilder', bins: { 950: { ticks: 10, output: 20 } } },
    upgrader: { kind: 'upgrader', bins: { 950: { ticks: 10, output: 40 } } }
  } },
  outpostEconomy: { W7N3: { exportBuckets: { 900: 200 } } },
  roomTrendHistory: { records: [
    { tick: 500, stored: 980000 }, { tick: 750, stored: 990000 }
  ] }
};
const Game = { time: 1000, rooms: {}, creeps: {} };
Game.rooms.W7N4 = room('W7N4', {
  1: [{ id: 'source', energy: 1500, energyCapacity: 3000,
    ticksToRegeneration: 100 }],
  2: [{ id: 'drop', resourceType: 'energy', amount: 50 },
    { id: 'mineral', resourceType: 'H', amount: 100 }],
  3: [{ id: 'tomb', store: store(25, 100) }],
  4: [{ id: 'ruin', store: store(10, 100) }],
  5: structures
}, memory);
Game.rooms.W8N4 = room('W8N4', { 1: [], 2: [], 3: [], 4: [], 5: [] }, {});
Game.rooms.W7N3 = { controller: { my: false }, memory: {}, find: () => [] };
Game.creeps.hauler = { id: 'creep', name: 'hauler',
  room: { name: 'W7N4' }, store: store(75, 100) };
Game.creeps.other = { id: 'other', name: 'other',
  room: { name: 'W8N4' }, store: store(40, 50) };
const colonyCommand = () => ({ ok: true, rooms: [
  canonicalRow('W7N4'), canonicalRow('W8N4', {
    health: null,
    energy: { stored: null, freeCapacity: null, spawnAvailable: 0,
      spawnCapacity: 300, resource: 'energy' },
    logistics: { flow: null, sourceStored: null },
    remotes: { backlog: null }
  })
] });
const run = createEnergyCommand({ Game, colonyCommand,
  findSources: types.sources,
  findDroppedResources: types.dropped,
  findTombstones: types.tombstones,
  findRuins: types.ruins,
  findStructures: types.structures,
  resourceEnergy: 'energy', structureTypes });
const before = JSON.stringify({ Game, memory });
const result = run('W7N4');
assert.strictEqual(result.ok, true);
assert.strictEqual(result.tick, 1000);
assert.strictEqual(result.inventory.source.energy, 1500);
assert.strictEqual(result.inventory.dropped.energy, 50);
assert.strictEqual(result.inventory.tombstone.energy, 25);
assert.strictEqual(result.inventory.ruin.energy, 10);
assert.strictEqual(result.inventory.container.energy, 1600);
assert.strictEqual(result.inventory.link.energy, 300);
assert.strictEqual(result.inventory.storage.energy, 990000);
assert.strictEqual(result.inventory.terminal.energy, 5000);
assert.strictEqual(result.inventory.creep.energy, 75);
assert.strictEqual(result.inventory.spawn.energy, 200);
assert.strictEqual(result.inventory.extension.energy, 50);
assert.strictEqual(result.inventory.tower.energy, 800);
assert.strictEqual(result.inventory.controller.energy, 700);
assert.strictEqual(result.backlog.local.total, 1285);
assert.strictEqual(result.backlog.remote.total, 700);
assert.strictEqual(result.backlog.combined, 1985);
assert.strictEqual(result.rates.observed.income, null);
assert.strictEqual(result.rates.observed.pickup, null);
assert.strictEqual(result.rates.observed.delivery, null);
assert.strictEqual(result.rates.observed.refill, 3);
assert.strictEqual(result.rates.observed.build, 5);
assert.strictEqual(result.rates.observed.repair, 2);
assert.strictEqual(result.rates.observed.upgrade, 4);
assert.strictEqual(result.rates.observed.overflow, null);
assert(Number.isFinite(result.rates.observed.remoteExport));
assert.strictEqual(result.rates.estimated.income, 18);
assert.strictEqual(result.rates.estimated.build, 5);
assert.strictEqual(result.explanation.storageDirection, 'rising');
assert.strictEqual(result.freshness.laborPlan.freshness, 'stale by 5 ticks');
assert(result.console.includes('Collection backlog: local 1285, remote 700'));
assert(result.console.includes('Plan estimates: income 18'));
assert.deepStrictEqual(run('W7N4'), result, 'output must be deterministic');
assert.strictEqual(JSON.stringify({ Game, memory }), before,
  'energy diagnosis must not mutate live objects or Memory');

const missing = run('W8N4');
assert.strictEqual(missing.ok, true);
assert.strictEqual(missing.backlog.local.total, null);
assert.strictEqual(missing.backlog.remote.total, null);
assert.strictEqual(missing.rates.estimated.income, null);
assert.strictEqual(missing.freshness.demandPlan.freshness, 'current tick');
assert.strictEqual(run().error,
  'ops.energy(roomName) requires one room name');
assert.strictEqual(run('W7N4', 'extra').ok, false);
assert.strictEqual(run('bad').error, 'Invalid Screeps room name: bad');
assert.strictEqual(run('W9N9').error,
  'Room W9N9 is not currently visible');
assert.strictEqual(run('W7N3').error, 'Room W7N3 is not an owned room');
assert.strictEqual(createEnergyCommand({ Game,
  colonyCommand: () => ({ ok: false }) })('W7N4').ok, false);

const ops = createOperatorConsole({ Game, commands: [{
  definition: ENERGY_DEFINITION, run
}] });
assert.strictEqual(ops.help('energy').commands[0].signature,
  'ops.energy(roomName)');
assert(ops.help('help').commands[0].related.includes('energy'));
assert.strictEqual(ops.energy('W7N4').ok, true);

const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.includes('definition: ENERGY_DEFINITION'));
assert(main.includes('run: createEnergyCommand({ Game, colonyCommand,'));
console.log('operator energy flow preserves evidence boundaries read-only');
