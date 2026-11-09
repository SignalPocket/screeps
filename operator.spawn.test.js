'use strict';

const assert = require('assert');
const { createOperatorConsole } = require('./operator.console');
const { SPAWN_DEFINITION, createSpawnCommand, laneFor, sizeTier } =
  require('./operator.spawn');

const room = (name, memory = {}, mine = true) => ({
  name, controller: { my: mine }, memory,
  energyAvailable: 450, energyCapacityAvailable: 800
});
const creep = (name, role, options = {}) => ({
  name, memory: { home: 'W7N4', role, ...(options.memory || {}) },
  room: { name: options.roomName || 'W7N4' },
  body: options.body || ['work', 'carry', 'move'],
  ticksToLive: options.ticksToLive == null ? 500 : options.ticksToLive,
  spawning: Boolean(options.spawning)
});

const policy = {
  updated: 1000,
  roles: {
    source: { min: 2, desired: 2, max: 2 },
    refiller: { min: 1, desired: 1, max: 1 },
    builder: { min: 0, desired: 1, max: 1 }
  },
  remote: { minersMin: 1, miners: 1, haulersMin: 0, haulers: 1,
    buildersMin: 0, builders: 0, reserversMin: 0, reservers: 0 }
};
const memory = {
  populationPolicy: policy,
  spawnDecision: { updated: 1000, authorized: false,
    phase: 'local-minimum', jobKey: 'builder', role: 'builder',
    reason: 'local minimum refiller precedes builder', population: 4,
    populationLimit: 6, workerLimit: 5, populationTransitionAllowance: 1 },
  spawnDenials: { updated: 1000, records: {
    Spawn2: { spawn: 'Spawn2', status: 'busy', lastTick: 1000 },
    Spawn1: { spawn: 'Spawn1', status: 'denied', role: 'builder',
      target: '["builder"]', authority: 'spawn.authority',
      gate: 'local-minimum', reason: 'local minimum refiller precedes builder',
      recovery: 'restore refiller', firstTick: 998, lastTick: 1000,
      age: 2, observations: 3 }
  } },
  spawnWaitSince: 997, spawnWaitLimit: 10, spawnWaitRole: 'builder'
};
const Game = { time: 1000, rooms: {}, creeps: {}, spawns: {} };
Game.rooms.W7N4 = room('W7N4', memory);
Game.rooms.W8N4 = room('W8N4', {});
Game.rooms.W7N3 = room('W7N3', {}, false);
Game.creeps.miner = creep('miner', 'miner');
Game.creeps.oldMiner = creep('oldMiner', 'harvester', { ticksToLive: 20 });
Game.creeps.remoteMiner = creep('remoteMiner', 'remote-miner', {
  roomName: 'W7N3', ticksToLive: 400 });
Game.creeps.building = creep('building', 'builder', {
  spawning: true, body: ['work', 'work', 'carry', 'move', 'move'],
  memory: { bodyType: 'worker', task: 'build' } });
Game.creeps.retiring = creep('retiring', 'builder', {
  memory: { staffingRetire: true } });
Game.creeps.otherRoom = { ...creep('otherRoom', 'refiller'),
  memory: { home: 'W8N4', role: 'refiller' } };
Game.spawns.Spawn1 = { name: 'Spawn1', room: Game.rooms.W7N4,
  spawning: { name: 'building', remainingTime: 12 } };
Game.spawns.Spawn2 = { name: 'Spawn2', room: Game.rooms.W7N4,
  spawning: null };

const colonyCommand = () => ({ ok: true, rooms: [
  { roomName: 'W7N4' }, { roomName: 'W8N4' }
] });
const run = createSpawnCommand({ Game, colonyCommand,
  bodyPartCost: { work: 100, carry: 50, move: 50 },
  getBodyType: assignment => assignment.role === 'builder' ? 'worker' : null,
  hasLocalReplacementLife: c => c.spawning || c.ticksToLive > 100,
  hasRemoteReplacementLife: c => c.spawning || c.ticksToLive > 300,
  getLocalReplacementLead: () => 100,
  getRemoteReplacementLead: () => 300
});
const before = JSON.stringify({ Game, memory });
const result = run('W7N4');
assert.strictEqual(result.ok, true);
assert.strictEqual(result.tick, 1000);
assert.strictEqual(result.active.length, 1);
assert.deepStrictEqual(result.active[0], {
  spawn: 'Spawn1', name: 'building', remainingTime: 12, cost: 350,
  body: { work: 2, carry: 1, move: 2 }, bodyLength: 5,
  task: 'build', lane: 'builder', archetype: 'worker', sizeTier: 'small'
});
const source = result.lanes.find(lane => lane.lane === 'source');
assert.strictEqual(source.count, 2);
assert.strictEqual(source.viable, 1);
assert.strictEqual(source.expiring, 1);
assert.strictEqual(source.missingMinimum, 1);
assert.strictEqual(source.replacementDeadlines[0].replacementDeadline, 1400);
const builder = result.lanes.find(lane => lane.lane === 'builder');
assert.strictEqual(builder.spawning, 1);
assert.strictEqual(builder.retiring, 1);
assert.strictEqual(builder.surplus, 1);
const remoteMiner = result.lanes.find(lane => lane.lane === 'remoteMiner');
assert.strictEqual(remoteMiner.traveling, 1);
assert.strictEqual(remoteMiner.viable, 1);
assert.strictEqual(result.candidates[0].spawn, 'Spawn1');
assert.strictEqual(result.candidates[0].policyPhase, 'local-minimum');
assert.strictEqual(result.decision.transitionAllowance, 1);
assert.strictEqual(result.affordability.waited, 3);
assert(result.limits.candidateEvidence.includes('not persisted'));
assert(result.console.includes('local minimum refiller precedes builder'));
assert.deepStrictEqual(run('W7N4'), result);
assert.strictEqual(JSON.stringify({ Game, memory }), before,
  'spawn diagnosis must not mutate live objects or Memory');

const missing = run('W8N4');
assert.strictEqual(missing.ok, true);
assert.strictEqual(missing.decision, null);
assert.deepStrictEqual(missing.lanes, []);
assert.strictEqual(missing.observations.spawnDecision.freshness, 'unknown');
assert.strictEqual(run().error, 'ops.spawn(roomName) requires one room name');
assert.strictEqual(run('W7N4', 'extra').ok, false);
assert.strictEqual(run('bad').error, 'Invalid Screeps room name: bad');
assert.strictEqual(run('W9N9').error, 'Room W9N9 is not currently visible');
assert.strictEqual(run('W7N3').error, 'Room W7N3 is not an owned room');
assert.strictEqual(createSpawnCommand({ Game,
  colonyCommand: () => ({ ok: false }) })('W7N4').ok, false);
assert.strictEqual(laneFor({ role: 'builder', builderMission: 'repair' }),
  'repairBuilder');
assert.strictEqual(laneFor({ role: 'remote-hauler' }), 'remoteHauler');
assert.strictEqual(sizeTier(new Array(31).fill('move')), 'maximum');

const ops = createOperatorConsole({ Game, commands: [{
  definition: SPAWN_DEFINITION, run
}] });
assert.strictEqual(ops.help('spawn').commands[0].signature,
  'ops.spawn(roomName)');

console.log('operator.spawn tests passed');
