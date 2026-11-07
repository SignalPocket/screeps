'use strict';

const assert = require('assert');
const { deactivateOwnedSurvey, reconcileOwnedRoomTransitions } =
  require('./owned.room.transition');

const Game = { time: 700, rooms: {
  W1N1: { controller: { my: true } },
  W2N1: { controller: { my: true } },
  W1N2: { controller: { my: false } }
} };
const ownedSurvey = { active: true, targetRoom: 'W2N1',
  remoteMinerTarget: 2, remoteHaulerTarget: 3, remoteBuilderTarget: 1,
  remoteWorkNeeds: [{ slot: 0 }] };
assert.strictEqual(deactivateOwnedSurvey(ownedSurvey, Game), true);
assert.deepStrictEqual({ active: ownedSurvey.active, status: ownedSurvey.status,
  exportEnabled: ownedSurvey.exportEnabled,
  miners: ownedSurvey.remoteMinerTarget,
  haulers: ownedSurvey.remoteHaulerTarget,
  builders: ownedSurvey.remoteBuilderTarget,
  needs: ownedSurvey.remoteWorkNeeds }, {
  active: false, status: 'owned-colony', exportEnabled: false,
  miners: 0, haulers: 0, builders: 0, needs: []
});
const remoteSurvey = { active: true, targetRoom: 'W1N2' };
assert.strictEqual(deactivateOwnedSurvey(remoteSurvey, Game), false);
assert.strictEqual(remoteSurvey.active, true);

const miner = { name: 'miner', memory: { role: 'remote-miner',
  assignmentRole: 'remote-miner', assignmentKind: 'remote-miner',
  home: 'W1N1', remoteHome: 'W1N1', remoteRoom: 'W2N1',
  remoteSlot: 0, task: 'harvest' }, work: 2, carry: 1 };
const hauler = { name: 'hauler', memory: { role: 'remote-hauler',
  home: 'W1N1', remoteHome: 'W1N1', remoteRoom: 'W2N1',
  remoteHaulerSlot: 0 }, room: { name: 'W1N1' }, energy: 0,
  work: 0, carry: 4 };
const reserver = { name: 'reserver', memory: { role: 'remote-reserver',
  assignmentRole: 'remote-reserver', assignmentKind: 'remote-reserver',
  home: 'W1N1', remoteRoom: 'W2N1' }, work: 0, carry: 0 };
const home = { memory: { leftSurvey: { active: true,
  targetRoom: 'W2N1', remoteMinerTarget: 1, remoteHaulerTarget: 1,
  remoteBuilderTarget: 1 } } };
const result = reconcileOwnedRoomTransitions({ Game, rooms: [home],
  creeps: [miner, hauler, reserver], getWork: creep => creep.work,
  getCarry: creep => creep.carry, getEnergy: creep => creep.energy });
assert.deepStrictEqual(result.rooms, ['W2N1']);
assert.deepStrictEqual(result.converted, ['miner']);
assert.strictEqual(miner.memory.role, 'builder');
assert.strictEqual(miner.memory.assignmentKind, 'expansion-bootstrap');
assert.strictEqual(miner.memory.expansionTarget, 'W2N1');
assert.strictEqual(miner.memory.remoteRoom, undefined);
assert.strictEqual(hauler.memory.role, 'remote-hauler',
  'carrier bodies remain available for another remote roster lane');
assert.strictEqual(reserver.memory.role, 'retire');
assert.strictEqual(reserver.memory.staffingRetire, true);

const loadedHauler = { name: 'loaded-hauler', memory: {
  role: 'remote-hauler', assignmentRole: 'remote-hauler',
  assignmentKind: 'remote-hauler', home: 'W1N1', remoteHome: 'W1N1',
  remoteRoom: 'W2N1', remoteHaulerSlot: 0 }, room: { name: 'W2N1' },
energy: 100, work: 0, carry: 2 };
reconcileOwnedRoomTransitions({ Game, rooms: [], creeps: [loadedHauler],
  getWork: creep => creep.work, getCarry: creep => creep.carry,
  getEnergy: creep => creep.energy });
assert.strictEqual(loadedHauler.memory.role, 'hauler');
assert.strictEqual(loadedHauler.memory.home, 'W2N1');
assert.strictEqual(loadedHauler.memory.remoteRoom, undefined);
assert.strictEqual(loadedHauler.memory.assignmentKind, undefined);

console.log('owned room transition scenarios passed');
