'use strict';

const assert = require('assert');
const fs = require('fs');
const { COLONY_DEFINITION, createColonyCommand, observation,
  downgradeRisk } = require('./operator.colony');
const { createOperatorConsole } = require('./operator.console');

const makeRoom = (name, values = {}) => ({
  name,
  controller: values.controller || { my: true, level: values.level || 5,
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
  deferredCreeps: [{ name: 'b', room: 'W7N4', consecutiveTicks: 2 }] } },
rooms: {} };
Memory.rooms.W7N4 = memory(500, { reservationStatus: {
  W7N3: { tick: 500, owner: null, observedReservation: {
    username: 'ginaria', ticksToEnd: 4500
  } },
  W8N3: { tick: 480, owner: null, observedReservation: {
    username: 'ginaria', ticksToEnd: 3200
  } }
} });
Memory.rooms.W8N4 = memory(499, 4);
Memory.rooms.W7N3 = memory(500, {
  demandPlan: { tick: 500, storageFree: 500,
    buildRemaining: 125, repairEnergy: 40 }
});
Memory.rooms.W8N3 = memory(490, {
  demandPlan: { tick: 490, storageFree: null,
    buildRemaining: 250, repairEnergy: 75 }
});
Game.rooms.W7N4 = makeRoom('W7N4', { memory: Memory.rooms.W7N4,
  sites: [{}, {}] });
Game.rooms.W8N4 = makeRoom('W8N4', { level: 2, downgrade: 4000,
  energy: 550, capacity: 550, memory: Memory.rooms.W8N4 });
Game.rooms.W7N3 = makeRoom('W7N3', {
  controller: { my: false, owner: null,
    reservation: { username: 'ginaria', ticksToEnd: 4499 } },
  memory: Memory.rooms.W7N3, sites: [{}]
});
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
assert.deepStrictEqual(result.rooms.map(row => row.roomName),
  ['W7N4', 'W8N4', 'W7N3', 'W8N3']);
assert.strictEqual(result.roomCount, 4);
assert.strictEqual(result.ownedHomeCount, 2);
const first = result.rooms[0];
assert.deepStrictEqual(first.scope, {
  membership: 'operational-colony', configuredRole: 'home', ownedHome: true,
  authorityHome: 'W7N4', visibility: {
    visible: true, observation: { tick: 500, age: 0,
      freshness: 'current tick', source: 'live room' }
  }, transitionedToOwned: false
});
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
const reserved = result.rooms[2];
assert.strictEqual(reserved.scope.configuredRole, 'reserved');
assert.strictEqual(reserved.scope.ownedHome, false);
assert.strictEqual(reserved.scope.authorityHome, 'W7N4');
assert.strictEqual(reserved.scope.visibility.visible, true);
assert.strictEqual(reserved.controller.status, 'reserved');
assert.strictEqual(reserved.controller.reservation.username, 'ginaria');
assert.strictEqual(reserved.controller.level, null);
assert.strictEqual(reserved.work.constructionSites, 1);
assert.strictEqual(reserved.work.buildRemaining, 125);
assert.strictEqual(reserved.work.repairEnergy, 40);
assert.deepStrictEqual(reserved.staffing, {
  current: null, minimum: null, desired: null,
  missingMinimum: null, missingDesired: null
});
assert.strictEqual(reserved.spawn.action, 'not an owned spawn home');
assert.strictEqual(reserved.spawn.decisionRole, null);
const unseen = result.rooms[3];
assert.strictEqual(unseen.scope.configuredRole, 'reserved');
assert.strictEqual(unseen.scope.ownedHome, false);
assert.strictEqual(unseen.scope.visibility.visible, false);
assert.strictEqual(unseen.scope.visibility.observation.freshness,
  'stale by 10 ticks');
assert.strictEqual(unseen.controller.status, 'last-observed-reserved');
assert.strictEqual(unseen.controller.observation.freshness,
  'stale by 20 ticks');
assert.strictEqual(unseen.work.buildRemaining, 250);
assert.strictEqual(unseen.work.repairEnergy, 75);
assert.strictEqual(unseen.work.constructionSites, null);
assert.strictEqual(unseen.spawn.action, 'not an owned spawn home');
assert.strictEqual(JSON.stringify({ Game, Memory }), before,
  'repeated colony reads must not mutate game or Memory state');
assert.deepStrictEqual(run(), result, 'output must be deterministic');

const transitionGame = {
  ...Game,
  rooms: { ...Game.rooms, W8N3: makeRoom('W8N3', {
    controller: { my: true, owner: { username: 'ginaria' }, level: 1,
      ticksToDowngrade: 20000, progress: 1, progressTotal: 200 },
    memory: Memory.rooms.W8N3
  }) },
  creeps: { ...Game.creeps, promotedWorker:
    creep('promotedWorker', 'W8N3', 'builder') },
  spawns: { ...Game.spawns }
};
const transition = createColonyCommand({ Game: transitionGame, Memory,
  findConstructionSites: 1, resourceEnergy: 'energy' })();
assert.strictEqual(transition.roomCount, 4);
assert.strictEqual(new Set(transition.rooms.map(row => row.roomName)).size, 4);
const promoted = transition.rooms.find(row => row.roomName === 'W8N3');
assert.strictEqual(promoted.scope.configuredRole, 'reserved');
assert.strictEqual(promoted.scope.ownedHome, true);
assert.strictEqual(promoted.scope.transitionedToOwned, true);
assert.strictEqual(promoted.controller.status, 'owned');
assert.strictEqual(promoted.controller.level, 1);
assert.strictEqual(promoted.staffing.current, 1);
assert.strictEqual(promoted.spawn.action, 'planned builder');

const missingRoom = makeRoom('W9N9', { memory: {} });
const missing = createColonyCommand({ Game: { time: 700,
  rooms: { W9N9: missingRoom }, creeps: {}, spawns: {} }, Memory: {} })();
const missingRow = missing.rooms[0];
assert.strictEqual(missing.roomCount, 4);
assert.strictEqual(missing.ownedHomeCount, 0);
assert.deepStrictEqual(missing.rooms.map(row => row.roomName),
  ['W7N4', 'W8N4', 'W7N3', 'W8N3']);
assert.strictEqual(missingRow.scope.visibility.observation.freshness,
  'unknown');
assert.strictEqual(missingRow.health, null);
assert.strictEqual(missingRow.energy.stored, null);
assert.strictEqual(missingRow.work.buildRemaining, null);
assert.strictEqual(missingRow.staffing.missingDesired, null);
assert.strictEqual(missingRow.cpu.deferred, null);
assert.strictEqual(missingRow.observations.roomPlan.freshness, 'unknown');
assert.strictEqual(missingRow.spawn.action, 'not an owned spawn home');
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
assert.strictEqual(ops.colony().roomCount, 4);
assert(ops.help('help').commands[0].related.includes('colony'));

const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.includes('definition: COLONY_DEFINITION'));
assert(main.includes('run: createColonyCommand({ Game, Memory,'));
const colonySource = fs.readFileSync(require.resolve('./operator.colony'),
  'utf8');
assert.match(colonySource,
  /typeof Game === 'undefined'[\s\S]{0,80}require\('\.\/colony\.scope'\)[\s\S]{0,40}require\('colony\.scope'\)/,
  'the live Screeps loader uses the server module name');
console.log('operator colony overview is deterministic, isolated and read-only');
