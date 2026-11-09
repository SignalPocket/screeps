'use strict';

const assert = require('assert');
const fs = require('fs');
const { COLONY_DEFINITION, createColonyCommand, observation,
  downgradeRisk } = require('./operator.colony');
const { createOperatorConsole } = require('./operator.console');

const makeRoom = (name, values = {}) => ({
  name,
  controller: { my: true, level: values.level || 5,
    ticksToDowngrade: values.downgrade ?? 120000,
    progress: 50, progressTotal: 100 },
  energyAvailable: values.energy ?? 900,
  energyCapacityAvailable: values.capacity ?? 1800,
  memory: values.memory || {},
  find: () => values.sites || []
});
const plan = (updated, desired = 5) => ({ updated, mode: 'construction',
  health: 'healthy', totals: { min: 3, desired, max: desired + 1 },
  roles: { upgrader: { min: 1, desired: 2, max: 3 } },
  remote: { rooms: 2 } });
const memory = (tick, overrides = {}) => ({
  populationPolicy: plan(tick),
  roomStatus: { updated: tick, label: 'Healthy · Building' },
  demandPlan: { tick, storageFree: 25000, buildRemaining: 300,
    repairEnergy: 25 },
  roomTrendHistory: { records: [{ tick: tick - 5, stored: 1000000,
    build: 400, repair: 30 }] },
  combatStatus: { updated: tick, state: 'Peace', fighting: false,
    hostileCount: 0, requiredDefenders: 0 },
  operationalHealth: { current: { remoteBacklog: 2,
    remoteBlockedRooms: 1, remoteRosterGap: 3 } },
  spawnDecision: { updated: tick, authorized: true, role: 'builder',
    reason: 'construction backlog' },
  spawnActivityStatus: { updated: tick, status: 'spawn ready' },
  ...overrides
});
const creep = (name, room, role) => ({ name, room: { name: room },
  memory: { home: room, role } });

const Game = { time: 500, rooms: {}, creeps: {}, spawns: {} };
const Memory = { cpuPolicy: { mode: 'normal', execution: { updated: 500,
  deferredCreeps: [{ name: 'b', room: 'W7N4', consecutiveTicks: 2 }] } } };
Game.rooms.W7N4 = makeRoom('W7N4', { memory: memory(500), sites: [{}, {}] });
Game.rooms.W8N4 = makeRoom('W8N4', { level: 2, downgrade: 4000,
  energy: 550, capacity: 550, memory: memory(499, 4) });
Game.creeps.a = creep('a', 'W7N4', 'upgrader');
Game.creeps.b = creep('b', 'W7N4', 'builder');
Game.creeps.c = creep('c', 'W8N4', 'builder');
Game.spawns.Spawn1 = { name: 'Spawn1', room: { name: 'W7N4' },
  spawning: { name: 'new-builder' } };

const run = createColonyCommand({ Game, Memory,
  findConstructionSites: 1, resourceEnergy: 'energy' });
const before = JSON.stringify({ Game, Memory });
const result = run();
assert.strictEqual(result.ok, true);
assert.strictEqual(result.tick, 500);
assert.deepStrictEqual(result.rooms.map(row => row.roomName), ['W7N4', 'W8N4']);
const first = result.rooms[0];
assert.strictEqual(first.health, 'Healthy · Building');
assert.strictEqual(first.mode, 'construction');
assert.deepStrictEqual(first.energy, { stored: 1000000, freeCapacity: 25000,
  spawnAvailable: 900, spawnCapacity: 1800, resource: 'energy' });
assert.strictEqual(first.work.constructionSites, 2);
assert.strictEqual(first.work.buildRemaining, 300);
assert.strictEqual(first.work.repairEnergy, 25);
assert.deepStrictEqual(first.work.upgraders,
  { current: 1, minimum: 1, desired: 2, missing: 1 });
assert.deepStrictEqual(first.staffing,
  { current: 2, minimum: 3, desired: 5, missingMinimum: 1,
    missingDesired: 3 });
assert.strictEqual(first.remotes.trouble, 6);
assert.strictEqual(first.cpu.deferred, 1);
assert.strictEqual(first.cpu.longestDeferral, 2);
assert.strictEqual(first.spawn.action, 'spawning new-builder');
assert.strictEqual(result.rooms[1].controller.downgradeRisk, 'critical');
assert.strictEqual(result.rooms[1].observations.roomPlan.freshness,
  'stale by 1 ticks');
assert.strictEqual(JSON.stringify({ Game, Memory }), before,
  'repeated colony reads must not mutate game or Memory state');
assert.deepStrictEqual(run(), result, 'output must be deterministic');

const missingRoom = makeRoom('W9N9', { memory: {} });
const missing = createColonyCommand({ Game: { time: 700,
  rooms: { W9N9: missingRoom }, creeps: {}, spawns: {} }, Memory: {} })();
const missingRow = missing.rooms[0];
assert.strictEqual(missingRow.health, null);
assert.strictEqual(missingRow.energy.stored, null);
assert.strictEqual(missingRow.work.buildRemaining, null);
assert.strictEqual(missingRow.staffing.missingDesired, null);
assert.strictEqual(missingRow.cpu.deferred, null);
assert.strictEqual(missingRow.observations.roomPlan.freshness, 'unknown');
assert.strictEqual(missingRow.spawn.action, 'unknown');
assert.strictEqual(createColonyCommand({ Game, Memory })('W7N4').ok, false);
assert.strictEqual(createColonyCommand({ Game: {}, Memory: {} })().ok, false);
assert.deepStrictEqual(observation(95, 100),
  { tick: 95, age: 5, freshness: 'stale by 5 ticks' });
assert.strictEqual(downgradeRisk(null), 'unknown');
assert.strictEqual(downgradeRisk(9000), 'warning');

const ops = createOperatorConsole({ Game, commands: [{
  definition: COLONY_DEFINITION, run
}] });
assert.strictEqual(ops.help('colony').commands[0].signature, 'ops.colony()');
assert.strictEqual(ops.help().commands.map(command => command.name).join(','),
  'colony,help');
assert.strictEqual(ops.colony().roomCount, 2);
assert(ops.help('help').commands[0].related.includes('colony'));

const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.includes('definition: COLONY_DEFINITION'));
assert(main.includes('run: createColonyCommand({ Game, Memory,'));
console.log('operator colony overview is deterministic, isolated and read-only');
