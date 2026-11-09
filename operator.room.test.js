'use strict';

const assert = require('assert');
const fs = require('fs');
const { ROOM_DEFINITION, createRoomCommand } = require('./operator.room');
const { createOperatorConsole } = require('./operator.console');

const row = (roomName, overrides = {}) => ({
  roomName, tick: 800, health: 'Strained · Logistics blocked',
  healthReasons: ['2000 source energy waiting', 'spawn network 44%'],
  mode: 'logistics-backup',
  observations: { roomStatus: { tick: 800, age: 0,
    freshness: 'current tick' }, trend: { tick: 750, age: 50,
    freshness: 'stale by 50 ticks' } },
  controller: { level: 5, ticksToDowngrade: 120000,
    downgradeRisk: 'safe', progress: 12, progressTotal: 100 },
  energy: { stored: 1000000, freeCapacity: 0, spawnAvailable: 800,
    spawnCapacity: 1800, resource: 'energy' },
  work: { constructionSites: 1, buildRemaining: 300, repairEnergy: 100,
    upgraders: { current: 3, minimum: 1, desired: 2, missing: 0 } },
  staffing: { current: 41, minimum: 19, desired: 36,
    missingMinimum: 0, missingDesired: 0 },
  logistics: { reserve: 'surplus', harvest: 'underused', flow: 'blocked',
    sourceStored: 2000, spawnFree: 1000, bufferFree: 500,
    supplyFree: 1500 },
  remotes: { activeRooms: 2, backlog: 3500, blockedRooms: 1,
    rosterGap: 1, trouble: 3502 },
  threats: { state: 'Peace', active: false, count: 0,
    requiredDefenders: 0 },
  cpu: { mode: 'normal', deferred: 1, longestDeferral: 2 },
  spawn: { action: 'spawning upgrader', active: ['new-upgrader'],
    decisionRole: 'upgrader', reason: 'controller work' },
  ...overrides
});
const Game = { time: 800, rooms: {
  W7N4: { controller: { my: true } },
  W8N4: { controller: { my: true } },
  W7N3: { controller: { my: false } }
} };
const inventory = { ok: true, tick: 800,
  freshness: 'current tick with per-source observation ages',
  rooms: [row('W7N4'), row('W8N4', { health: null, healthReasons: [],
    energy: { stored: null, freeCapacity: null, spawnAvailable: 550,
      spawnCapacity: 550, resource: 'energy' } })] };
const colonyCommand = () => inventory;
const run = createRoomCommand({ Game, colonyCommand });
const before = JSON.stringify({ Game, inventory });
const result = run('W7N4');
assert.strictEqual(result.ok, true);
assert.strictEqual(result.roomName, 'W7N4');
assert.deepStrictEqual(result.reasons,
  ['2000 source energy waiting', 'spawn network 44%']);
assert.strictEqual(result.sections.storage.energy, 1000000);
assert.strictEqual(result.sections.storage.units.energy, 'energy');
assert.strictEqual(result.sections.work.units.buildRemaining, 'build progress');
assert.strictEqual(result.sections.logistics.flow, 'blocked');
assert.strictEqual(result.sections.remotes.units.backlog, 'energy');
assert.strictEqual(result.observations.trend.freshness, 'stale by 50 ticks');
assert(result.console.includes('Reasons: 2000 source energy waiting'));
assert(result.console.includes('Storage: 1000000 energy, free 0 capacity'));
assert(result.console.includes('CPU: normal, deferred 1 creeps'));
assert.deepStrictEqual(run('W7N4'), result);
assert.strictEqual(JSON.stringify({ Game, inventory }), before,
  'room diagnosis must not mutate the canonical inventory or live game');

const missingData = run('W8N4');
assert.strictEqual(missingData.ok, true);
assert.strictEqual(missingData.sections.storage.energy, null);
assert.deepStrictEqual(missingData.reasons,
  ['no unhealthy or constrained reason recorded']);
assert(missingData.console.includes('Storage: unknown, free unknown'));
assert.strictEqual(run().error,
  'ops.room(roomName) requires one room name');
assert.strictEqual(run('W7N4', 'extra').ok, false);
assert.strictEqual(run('bad').error, 'Invalid Screeps room name: bad');
assert.strictEqual(run('W9N9').error,
  'Room W9N9 is not currently visible');
assert.strictEqual(run('W7N3').error, 'Room W7N3 is not an owned room');
assert.strictEqual(createRoomCommand({ Game,
  colonyCommand: () => ({ ok: false }) })('W7N4').ok, false);

const ops = createOperatorConsole({ Game, commands: [{
  definition: ROOM_DEFINITION, run
}] });
assert.strictEqual(ops.help('room').commands[0].signature,
  'ops.room(roomName)');
assert(ops.help('help').commands[0].related.includes('room'));
assert.strictEqual(ops.room('W7N4').ok, true);

const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.includes('definition: ROOM_DEFINITION'));
assert(main.includes('run: createRoomCommand({ Game, colonyCommand })'));
console.log('operator room health reuses the canonical inventory read-only');
