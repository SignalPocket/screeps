'use strict';

const assert = require('assert');
const { createSpawnPolicy } = require('./spawn.policy');
const { createBodyFactory } = require('./body.factory');

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

const parts = {
  WORK: 'work', CARRY: 'carry', MOVE: 'move', ATTACK: 'attack',
  RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', CLAIM: 'claim',
  TOUGH: 'tough',
  BODYPART_COST: {
    work: 100, carry: 50, move: 50, attack: 80,
    ranged_attack: 150, heal: 250, claim: 600, tough: 10
  }
};
const bodyFactory = createBodyFactory(parts);
const recoveryGame = { time: 200 };
const recoveryPolicy = createSpawnPolicy({
  Game: recoveryGame, buildBody: bodyFactory.buildBody,
  CARRY: parts.CARRY, WORK: parts.WORK, MOVE: parts.MOVE
});
const bodyCost = body => body.reduce((total, part) =>
  total + parts.BODYPART_COST[part], 0);
const sourceWorker = index => ({
  name: `source-${index}`, spawning: false,
  memory: { role: 'harvester', idleNow: false },
  getActiveBodyparts: part => part === parts.WORK ? 2 : 0
});
const sourceRequest = ({ capacity, available = capacity, current = 0,
  target = 4, role = 'harvester', waited = false }) => {
  const roomMemory = waited
    ? { spawnWaitRole: role, spawnWaitSince: 0 } : {};
  const recoverySpawn = { name: 'RecoverySpawn', room: {
    energyAvailable: available, energyCapacityAvailable: capacity,
    controller: { ticksToDowngrade: 10000 }, memory: roomMemory
  } };
  const sourceWorkers = Array.from({ length: current }, (_, index) =>
    sourceWorker(index));
  return recoveryPolicy.prepareSpawnRequest({
    spawn: recoverySpawn,
    assignment: {
      role, forceSpawn: true, staffingCurrent: current,
      staffingTarget: target, requiredWork: role === 'remote-miner' ? 3 : 4,
      miningProduction: role === 'remote-miner' ? undefined : 10
    },
    workers: sourceWorkers, workerLimit: 10,
    hasWorkParts: creep => creep.getActiveBodyparts(parts.WORK) > 0
  });
};

for (const capacity of [300, 550, 800]) {
  const request = sourceRequest({ capacity });
  assert(request.body,
    `zero-staff recovery has a functional body at ${capacity} capacity`);
  assert(request.body.includes(parts.WORK) &&
    request.body.includes(parts.CARRY) && request.body.includes(parts.MOVE),
  `zero-staff recovery preserves WORK, CARRY and MOVE at ${capacity}`);
  assert(bodyCost(request.body) <= capacity,
    `zero-staff recovery remains affordable at ${capacity}`);
}

const partialRecovery = sourceRequest({ capacity: 550, current: 2 });
assert(partialRecovery.body,
  'partial source recovery may use a functional sub-ideal body');
assert(partialRecovery.body.filter(part => part === parts.WORK).length < 4,
  'partial recovery remains breadth-first below the threshold');

const thresholdRequest = sourceRequest({ capacity: 550, current: 3 });
assert(thresholdRequest.body,
  'threshold staffing retries against currently funded mature capacity');
assert(thresholdRequest.body.filter(part => part === parts.WORK).length >= 4,
  'threshold staffing restores the mature WORK requirement');
assert(bodyCost(thresholdRequest.body) <= 550,
  'the mature threshold retry remains affordable');

const underfundedMature = sourceRequest({ capacity: 550, available: 300,
  current: 4, waited: true });
assert.strictEqual(underfundedMature.body, null,
  'mature replacement does not dilute the WORK requirement');
const fundedMature = sourceRequest({ capacity: 550, current: 4 });
assert(fundedMature.body &&
  fundedMature.body.filter(part => part === parts.WORK).length >= 4,
  'a funded mature replacement retains the ideal capability');

const remoteRecovery = sourceRequest({ capacity: 550, available: 300,
  role: 'remote-miner' });
assert.strictEqual(remoteRecovery.body, null,
  'the local recovery exception does not weaken remote-miner capability');

console.log('spawn policy manual-defense and source-recovery boundaries passed');
