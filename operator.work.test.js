'use strict';

const assert = require('assert');
const fs = require('fs');
const { WORK_DEFINITION, createWorkCommand } = require('./operator.work');
const { createConstructionPriority } = require('./construction.priority');
const { createOperatorConsole } = require('./operator.console');

const FIND_SITES = 1;
const FIND_STRUCTURES = 2;
const makeRoom = (name, data, memory = {}) => ({
  name,
  controller: { my: true, progress: 200, progressTotal: 1000 },
  memory,
  find: type => data[type] || []
});
const site = (id, type, progress, total) => ({ id, structureType: type,
  progress, progressTotal: total });
const asset = (id, type, hits, hitsMax) => ({ id, structureType: type,
  hits, hitsMax, my: true });
const worker = (name, role, lane, task, parts = 3, roomName = 'W7N4') => ({
  name, room: { name: roomName }, store: { energy: 50 },
  memory: { home: 'W7N4', role, bodyType: role === 'upgrader'
    ? 'controller' : 'worker', demandLane: lane, task },
  getActiveBodyparts: type => type === 'work' ? parts : 0
});
const memory = {
  demandPlan: { tick: 1000, buildRemaining: 750,
    repairEnergy: 225, lanes: { build: 1, repair: 1, upgrade: 1 } },
  laborPlan: { updated: 995, buildBudget: 5, repairBudget: 2,
    upgradeBudget: 4, builder: { desired: 2 },
    repairBuilder: { desired: 1 }, upgrader: { desired: 2 } }
};
const Game = { time: 1000, rooms: {}, creeps: {} };
Game.rooms.W7N4 = makeRoom('W7N4', {
  1: [site('container-site', 'container', 250, 500),
    site('road-site', 'road', 0, 500)],
  2: [asset('road', 'road', 100, 1000),
    asset('container', 'container', 1000, 2000),
    asset('wall', 'wall', 100, 100000),
    asset('rampart', 'rampart', 200, 200000)]
}, memory);
Game.rooms.W8N4 = makeRoom('W8N4', { 1: [], 2: [] }, {});
Game.rooms.W7N3 = { controller: { my: false }, memory: {}, find: () => [] };
Game.creeps.builder = worker('builder', 'builder', 'build', 'build');
Game.creeps.fixer = worker('fixer', 'builder', 'repair', 'repair-load');
Game.creeps.upgrader = worker('upgrader', 'upgrader', 'upgrade', 'blocked');
Game.creeps.parked = worker('parked', 'builder', null, 'standby');
Game.creeps.remote = worker('remote', 'builder', 'build', 'return-home', 2,
  'W7N3');
const row = (roomName, overrides = {}) => ({
  roomName, health: 'Strained', mode: 'construction',
  work: { constructionSites: 2, buildRemaining: 750, repairEnergy: 225,
    upgraders: { current: 1, desired: 2 } },
  observations: { demandPlan: { tick: 1000, age: 0,
    freshness: 'current tick' } }, ...overrides
});
const colonyCommand = () => ({ ok: true, rooms: [row('W7N4'),
  row('W8N4', { health: null, work: { constructionSites: null,
    buildRemaining: null, repairEnergy: null, upgraders: {} },
    observations: { demandPlan: { tick: null, age: null,
      freshness: 'unknown' } } })] });
const constructionPriority = createConstructionPriority({
  STRUCTURE_CONTAINER: 'container', STRUCTURE_LINK: 'link',
  STRUCTURE_EXTENSION: 'extension', STRUCTURE_ROAD: 'road'
});
const run = createWorkCommand({ Game, colonyCommand, constructionPriority,
  findConstructionSites: FIND_SITES, findStructures: FIND_STRUCTURES,
  workPart: 'work', structureWall: 'wall', structureRampart: 'rampart',
  repairPower: 100, buildPower: 5 });
const before = JSON.stringify({ Game, memory });
const result = run('W7N4');
assert.strictEqual(result.ok, true);
assert.strictEqual(result.tick, 1000);
assert.strictEqual(result.construction.sites.length, 2);
assert.strictEqual(result.construction.sites[0].type, 'container');
assert.strictEqual(result.construction.sites[0].priority, 0);
assert.strictEqual(result.lanes.build.fundedEnergy, 150);
assert.strictEqual(result.lanes.build.theoreticalEnergy, 150);
assert.strictEqual(result.lanes.build.expectedCompletionTicks, 30);
assert.strictEqual(result.repairs.targets.length, 4);
assert.strictEqual(result.lanes.repair.fundedEnergy, 12);
assert.strictEqual(result.lanes.repair.theoreticalEnergy, 3016);
assert.strictEqual(result.barriers.wall[0].fundedEnergy, 0);
assert.strictEqual(result.barriers.wall[0].fundedTargetHits, 100);
assert.strictEqual(result.barriers.rampart[0].fundedEnergy, 0);
assert.strictEqual(result.lanes.upgrade.appliedWork, 3);
assert.strictEqual(result.lanes.upgrade.fundedEnergy, 800);
assert.strictEqual(result.lanes.upgrade.expectedCompletionTicks, 200);
assert.strictEqual(result.workers.summary.assigned, 1);
assert.strictEqual(result.workers.summary.traveling, 2);
assert.strictEqual(result.workers.summary.blocked, 1);
assert.strictEqual(result.workers.summary.parked, 1);
assert.deepStrictEqual(result.workers.summary.missing,
  { build: 0, repair: 0, upgrade: 1 });
assert.strictEqual(result.freshness.laborPlan.freshness, 'stale by 5 ticks');
assert(result.console.includes('Walls/ramparts: excluded'));
assert.deepStrictEqual(run('W7N4'), result);
assert.strictEqual(JSON.stringify({ Game, memory }), before,
  'work diagnosis must not mutate live objects or Memory');

const missing = run('W8N4');
assert.strictEqual(missing.ok, true);
assert.strictEqual(missing.lanes.build.fundedEnergy, null);
assert.strictEqual(missing.budgets.build, null);
assert.strictEqual(missing.freshness.demandPlan.freshness, 'unknown');
assert.strictEqual(run().error, 'ops.work(roomName) requires one room name');
assert.strictEqual(run('W7N4', 'extra').ok, false);
assert.strictEqual(run('bad').error, 'Invalid Screeps room name: bad');
assert.strictEqual(run('W9N9').error,
  'Room W9N9 is not currently visible');
assert.strictEqual(run('W7N3').error, 'Room W7N3 is not an owned room');
assert.strictEqual(createWorkCommand({ Game,
  colonyCommand: () => ({ ok: false }) })('W7N4').ok, false);

const ops = createOperatorConsole({ Game, commands: [{
  definition: WORK_DEFINITION, run
}] });
assert.strictEqual(ops.help('work').commands[0].signature,
  'ops.work(roomName)');
assert(ops.help('help').commands[0].related.includes('work'));
assert.strictEqual(ops.work('W7N4').ok, true);

const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.includes('definition: WORK_DEFINITION'));
assert(main.includes('run: createWorkCommand({ Game, colonyCommand,'));
console.log('operator work backlog separates funded and theoretical work');
