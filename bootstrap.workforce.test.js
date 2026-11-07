'use strict';

const assert = require('assert');
const fs = require('fs');
const { planBootstrapSpawn, selectBootstrapWork } = require('./bootstrap.workforce');
const { authorizeSpawnAssignment } = require('./spawn.authority');
const { enforceAssignmentContract } = require('./assignment.contract');

const home = { name: 'home', energyCapacityAvailable: 1800,
  memory: { expansionPlan: { targetRoom: 'new', status: 'bootstrap' } } };
const room = { name: 'new', controller: { my: true, level: 1,
  ticksToDowngrade: 10000 } };
const worker = (name, energy = 49) => ({ name, room,
  memory: { role: 'builder', builderScope: 'expansion', expansionTarget: 'new',
    assignmentKind: 'expansion-bootstrap' }, body: Array(6).fill('work'),
  ticksToLive: 1000, store: { energy, getFreeCapacity: () => 50 - energy } });
const Game = { rooms: { new: room }, map: { findRoute: () => [{}] },
  spawns: { home: { room: home, spawning: { remainingTime: 20 } } } };
const args = { room: home, workers: [], Game, permitted: true, hasSpawn: () => false };
const request = planBootstrapSpawn(args);
assert.strictEqual(request.bootstrapMaintenance, true);
assert.strictEqual(planBootstrapSpawn({ ...args, permitted: false }), null);
assert.strictEqual(planBootstrapSpawn({ ...args, hasSpawn: () => true }), null);
assert.strictEqual(planBootstrapSpawn({ ...args, Game: { ...Game,
  rooms: { new: { controller: { my: false } } } } }), null);
const crew = ['a', 'b', 'c'].map(name => worker(name));
assert.strictEqual(planBootstrapSpawn({ ...args, workers: crew }), null);
crew[0].ticksToLive = 163; // 18 spawn + 75 travel + 20 queue + 50 margin.
assert(planBootstrapSpawn({ ...args, workers: crew }), 'replace at exact lead boundary');
crew[0].spawning = true;
assert.strictEqual(planBootstrapSpawn({ ...args, workers: crew }), null,
  'in-flight spawn counts even without a live TTL');
const remoteGap = { baselineGap: null, jobs: {
  remoteMiner: { key: 'remoteMiner', coverageCount: 0, min: 2 } } };
assert.strictEqual(authorizeSpawnAssignment({ assignment: request,
  staffingPlan: remoteGap }).phase, 'owned-bootstrap');
for (const staffingPlan of [
  { ...remoteGap, baselineGap: { role: 'hauler' } },
  { ...remoteGap, jobs: { ...remoteGap.jobs,
    hauler: { key: 'hauler', coverageCount: 0, min: 2 } } }
]) assert.strictEqual(authorizeSpawnAssignment({ assignment: request,
  staffingPlan }).authorized, false, 'bootstrap preserves home survival floors');
assert.strictEqual(authorizeSpawnAssignment({ assignment: { ...request,
  bootstrapMaintenance: false }, staffingPlan: remoteGap }).authorized, false);

const source = { id: 'source', energy: 3000 };
const spawnSite = { id: 'site', structureType: 'spawn' };
const options = creep => ({ creep, controller: room.controller, crew: [creep],
  sources: [source], stores: [], sites: [spawnSite], structures: [],
  closest: list => list[0] || null,
  harvestFits: () => creep.store.getFreeCapacity() >= 6 });
let creep = worker('a');
let work = selectBootstrapWork(options(creep));
assert.strictEqual(work.action, 'upgrade', '49/50 energy must leave gather mode');
assert.strictEqual(work.target, room.controller);
assert.strictEqual(creep.memory.expansionBuilding, true);
creep = worker('a', 0);
assert.strictEqual(selectBootstrapWork(options(creep)).action, 'harvest');
const buffer = { id: 'buffer', store: { energy: 100 } };
assert.strictEqual(selectBootstrapWork({ ...options(creep), stores: [buffer] }).action,
  'withdraw', 'use existing energy before mining more');
creep = worker('a', 48);
selectBootstrapWork(options(creep));
creep.store.energy = 0;
selectBootstrapWork(options(creep));
selectBootstrapWork(options(creep));
assert.strictEqual(creep.memory.bootstrapLoad, 1, 'one load transition, not one per idle tick');
room.controller.level = 2;
creep = worker('a');
creep.memory.bootstrapLoad = 1;
assert.strictEqual(selectBootstrapWork(options(creep)).action, 'build');
creep.memory.bootstrapLoad = 4;
assert.strictEqual(selectBootstrapWork(options(creep)).action, 'upgrade');
const activeCrew = ['a', 'b', 'c'].map(name => worker(name));
for (const [index, expected] of [[0, 'upgrade'], [1, 'build'], [2, 'repair']]) {
  const repair = { id: 'road', structureType: 'road', hits: 3000, hitsMax: 5000 };
  assert.strictEqual(selectBootstrapWork({ ...options(activeCrew[index]),
    crew: activeCrew, structures: [repair] }).action, expected);
}
const dyingBuffer = { id: 'damaged', structureType: 'container', hits: 1000,
  hitsMax: 250000 };
assert.strictEqual(selectBootstrapWork({ ...options(activeCrew[1]),
  crew: activeCrew, structures: [dyingBuffer] }).action, 'repair');
room.controller.ticksToDowngrade = 100;
assert.strictEqual(selectBootstrapWork({ ...options(activeCrew[1]),
  structures: [dyingBuffer] }).action, 'upgrade', 'controller loss precedes repair');
room.controller.ticksToDowngrade = 10000;
assert.strictEqual(selectBootstrapWork({ ...options(creep), sites: [] }).action,
  'upgrade', 'no construction target must not strand a loaded worker');
assert.strictEqual(selectBootstrapWork({ ...options(worker('a', 0)), sources: [] }).action,
  'wait', 'no available energy is an explicit wait');

// Execute the installed task, including the spawn handoff, rather than only
// testing a duplicate of its caller wiring.
const main = fs.readFileSync(require.resolve('./main'), 'utf8').replace(/\r\n/g, '\n');
const start = main.indexOf("      tasks = [{\n        name: 'expansion-build'");
const end = main.indexOf("\n    } else if (creep.memory.role === 'remote-miner')", start);
assert(start > 0 && end > start);
const block = main.slice(start, end);
creep = worker('a');
let upgraded = 0;
let established = false;
const env = { creep, creeps: [creep], selectBootstrapWork,
  STRUCTURE_SPAWN: 'spawn', STRUCTURE_CONTAINER: 'container', RESOURCE_ENERGY: 'energy',
  getRoomStructuresByType: (room, type) => established && type === 'spawn'
    ? [{ my: true, name: 'Spawn2' }] : [],
  getRoomSources: () => [source], getRoomSites: () => [spawnSite],
  getRoomStructures: () => [], getUnreservedEnergy: () => 0,
  harvestFits: () => false, reserveEnergyFrom: () => {},
  budgetedBuild: () => 0, budgetedRepair: () => 0,
  harvestWithoutSpill: () => 0, perform: (target, action) => (action(target), true) };
creep.pos = { findClosestByPath: list => list[0] || null };
creep.upgradeController = () => { upgraded++; return 0; };
const installed = new Function(...Object.keys(env), 'let tasks;\n' + block + '\nreturn tasks;')
  (...Object.values(env));
assert(installed[0].run());
assert.strictEqual(upgraded, 1);
assert.strictEqual(creep.memory.bootstrapAction, 'upgrade');
established = true;
assert(installed[0].run());
enforceAssignmentContract(creep);
assert.strictEqual(creep.memory.home, 'new');
assert.strictEqual(creep.memory.builderScope, 'local');
assert.strictEqual(creep.memory.assignmentKind, undefined);
assert(main.indexOf('const bootstrapRequest = planBootstrapSpawn') <
  main.indexOf('const remoteMinimumRequest = planMinimumRemoteSpawn'));
assert.match(main, /demandLane === 'standby' && !isExpansionBuilder\(creep\)/);
assert.match(main, /pickupParticipants=executionCreeps\.filter\(c=>!c\.spawning&&\s*!isExpansionBuilder\(c\)/);

console.log('claimed room bootstrap workforce tests passed');
