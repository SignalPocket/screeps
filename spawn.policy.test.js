'use strict';

const assert = require('assert');
const { createSpawnPolicy } = require('./spawn.policy');

const Game = { time: 100 };
const buildBody = (role, energy) => role === 'defender' && energy >= 140
  ? ['tough', 'attack', 'move'] : null;
const { prepareSpawnRequest } = createSpawnPolicy({ Game, buildBody,
  CARRY: 'carry', WORK: 'work', MOVE: 'move' });
const spawn = { name: 'Spawn1', room: {
  energyAvailable: 300, energyCapacityAvailable: 550,
  controller: { ticksToDowngrade: 10000 }, memory: {}
} };
const workers = Array.from({ length: 10 }, (_, index) => ({
  name: `worker-${index}`, spawning: false,
  memory: { role: 'hauler', idleNow: false },
  getActiveBodyparts: part => part === 'work' ? 1 : 0
}));

const ordinary = prepareSpawnRequest({ spawn,
  assignment: { role: 'defender', forceSpawn: true,
    staffingCurrent: 0, staffingTarget: 1 },
  workers, workerLimit: workers.length, hasWorkParts: () => true });
assert.strictEqual(ordinary.needsWorker, false,
  'an ordinary desired defender cannot exceed the population budget');

const manual = prepareSpawnRequest({ spawn,
  assignment: { role: 'defender', forceSpawn: true, manualDefense: true,
    staffingCurrent: 0, staffingTarget: 1 },
  workers, workerLimit: workers.length, hasWorkParts: () => true });
assert.strictEqual(manual.needsWorker, true,
  'an authority-approved bounded directive may use one population exception');
assert.deepStrictEqual(manual.body, ['tough', 'attack', 'move']);

console.log('spawn policy manual-defense population boundary passed');
