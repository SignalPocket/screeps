'use strict';

const assert = require('assert');
const { runReservation } = require('./remote.reservation');

// A fresh non-reserving outcome must replace an old successful observation.
const home = { name: 'home', memory: { unrelated: 'preserved',
  reservationStatus: { other: { tick: 1 }, target: { tick: 1, result: 0,
    ticksToEnd: 4000 } } } };
const target = { name: 'target', controller: { id: 'controller',
  reservation: { username: 'us', ticksToEnd: 123 } }, find: () => [] };
const Game = { time: 10, rooms: { home, target } };
let reserves = 0;
let moves = 0;
let result = 0;
const creep = { name: 'reserver', memory: { home: 'home', remoteRoom: 'target' },
  owner: { username: 'us' }, room: target,
  reserveController: () => { reserves++; return result; } };
const args = { creep, Game, move: () => moves++, OK: 0,
  ERR_NOT_IN_RANGE: -9, FIND_HOSTILE_CREEPS: 1,
  RoomPosition: class { constructor(x, y, roomName) {
    Object.assign(this, { x, y, roomName });
  } } };
const status = () => home.memory.reservationStatus.target;
assert(runReservation(args));
assert.strictEqual(status().state, 'reserving');
assert.strictEqual(status().ticksToEnd, 123);
for (const [code, state, handled] of [[-9, 'approach', true],
  [-7, 'failed', false]]) {
  result = code;
  Game.time++;
  assert.strictEqual(runReservation(args), handled);
  assert.strictEqual(status().state, state);
  assert.strictEqual(status().result, code);
  assert.strictEqual(status().tick, Game.time);
}
const attempts = reserves;
target.controller.owner = { username: 'us' };
delete target.controller.reservation;
Game.time++;
assert(runReservation(args));
assert.strictEqual(status().state, 'unavailable');
assert.strictEqual(status().reason, 'owned controller');
assert.strictEqual(status().owner, 'us');
assert.strictEqual(status().result, null);
assert.strictEqual(status().ticksToEnd, null);
delete target.controller.owner;
target.controller.reservation = { username: 'other', ticksToEnd: 20 };
assert(runReservation(args));
assert.strictEqual(status().reason, 'foreign reservation');
delete target.controller;
assert(runReservation(args));
assert.strictEqual(status().reason, 'no controller');
assert.strictEqual(status().controllerId, null);
creep.room = home;
delete Game.rooms.target;
assert(runReservation(args));
assert.strictEqual(status().state, 'travel');
assert.strictEqual(status().room, 'home');
assert.strictEqual(status().observedReservation, null);
Game.rooms.target = target;
target.find = () => [{}];
assert(runReservation(args));
assert.strictEqual(status().state, 'retreat');
target.find = () => [];
Game.time++;
assert(runReservation(args));
assert.strictEqual(status().state, 'retreat');
assert.strictEqual(status().tick, Game.time);
assert.strictEqual(reserves, attempts, 'non-reserving paths issue no reserve');
assert(moves > 0);
assert.strictEqual(home.memory.unrelated, 'preserved');
assert.deepStrictEqual(home.memory.reservationStatus.other, { tick: 1 });
delete Game.rooms.home;
assert.doesNotThrow(() => runReservation(args));
console.log('reservation outcome freshness tests passed');
