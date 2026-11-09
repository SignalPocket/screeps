'use strict';

const assert = require('assert');
const {
  CANONICAL_OPERATIONAL_ROOM_CONFIGURATION,
  createOperationalColonyScope,
  validateConfiguration
} = require('./colony.scope');

const configuration = CANONICAL_OPERATIONAL_ROOM_CONFIGURATION.map(entry =>
  ({ ...entry }));
const Memory = { rooms: {
  W7N4: {
    roomStatus: { updated: 100 },
    reservationStatus: {
      W7N3: { tick: 95, owner: null, observedReservation: {
        username: 'ginaria', ticksToEnd: 4200
      } },
      W8N3: { tick: 80, owner: null, observedReservation: {
        username: 'ginaria', ticksToEnd: 3100
      } }
    }
  },
  W8N4: {
    roomStatus: { updated: 99 },
    reservationStatus: {
      W7N3: { tick: 100, owner: 'wrong-home' }
    }
  },
  W7N3: { roomStatus: { updated: 94 } },
  W8N3: { combatStatus: { updated: 82 } }
} };
const Game = { time: 100, rooms: {
  W7N4: { name: 'W7N4', controller: {
    my: true, owner: { username: 'ginaria' }
  } },
  W8N4: { name: 'W8N4', controller: {
    my: true, owner: { username: 'ginaria' }
  } },
  W7N3: { name: 'W7N3', controller: {
    my: false, owner: null,
    reservation: { username: 'ginaria', ticksToEnd: 4199 }
  } }
} };

const before = JSON.stringify({ Game, Memory, configuration });
const scope = createOperationalColonyScope({ Game, Memory, configuration });
assert.deepStrictEqual(scope.roomNames, ['W7N4', 'W8N4', 'W7N3', 'W8N3']);
assert.strictEqual(scope.rows.length, 4);
assert.strictEqual(new Set(scope.roomNames).size, 4);
assert.strictEqual(scope.rows[0].configuredRole, 'home');
assert.strictEqual(scope.rows[0].controller.status, 'owned');
assert.strictEqual(scope.rows[2].configuredRole, 'reserved');
assert.strictEqual(scope.rows[2].controller.status, 'reserved');
assert.strictEqual(scope.rows[2].controller.reservation.ticksToEnd, 4199);
assert.strictEqual(scope.rows[2].authority.homeRoom, 'W7N4');
assert.strictEqual(scope.rows[2].authority.reservationStatus.owner, null,
  'authority metadata comes only from the configured home');
assert.strictEqual(scope.rows[2].visibility.observation.freshness,
  'current tick');
const unseen = scope.rows[3];
assert.strictEqual(unseen.visibility.visible, false);
assert.strictEqual(unseen.visibility.observation.tick, 82);
assert.strictEqual(unseen.visibility.observation.freshness,
  'stale by 18 ticks');
assert.strictEqual(unseen.controller.status, 'last-observed-reserved');
assert.strictEqual(unseen.controller.observation.tick, 80);
assert.strictEqual(unseen.controller.observation.freshness,
  'stale by 20 ticks');
assert.strictEqual(JSON.stringify({ Game, Memory, configuration }), before,
  'scope construction does not mutate runtime or caller inputs');
assert(Object.isFrozen(scope));
assert(Object.isFrozen(scope.roomNames));
assert(Object.isFrozen(scope.rows));
assert(Object.isFrozen(scope.rows[2]));
assert(Object.isFrozen(scope.rows[2].authority));
assert(Object.isFrozen(scope.rows[2].controller.reservation));
assert.throws(() => scope.roomNames.push('W9N9'), TypeError);

const reordered = [...configuration].reverse();
const deterministic = createOperationalColonyScope({ Game, Memory,
  configuration: reordered });
assert.deepStrictEqual(deterministic, scope,
  'configuration order does not affect canonical output');

const transitionGame = { time: 101, rooms: {
  ...Game.rooms,
  W7N3: { name: 'W7N3', controller: {
    my: true, owner: { username: 'ginaria' }, reservation: null
  } },
  W8N3: { name: 'W8N3', controller: null }
} };
const transitioned = createOperationalColonyScope({
  Game: transitionGame, Memory, configuration
});
assert.strictEqual(transitioned.rows.length, 4);
assert.strictEqual(new Set(transitioned.roomNames).size, 4,
  'a newly owned configured remote is not added a second time');
const promoted = transitioned.rows.find(row => row.roomName === 'W7N3');
assert.strictEqual(promoted.controller.status, 'owned');
assert.strictEqual(promoted.configuredRole, 'reserved');
assert.strictEqual(promoted.transitionedToOwned, true);
assert.strictEqual(transitioned.rows.find(row => row.roomName === 'W8N3')
  .controller.status, 'no-controller');

const unknown = createOperationalColonyScope({
  Game: { time: 100, rooms: {} }, Memory: { rooms: {} }
});
assert.deepStrictEqual(unknown.roomNames,
  ['W7N4', 'W8N4', 'W7N3', 'W8N3']);
assert(unknown.rows.every(row => !row.visibility.visible));
assert(unknown.rows.every(row =>
  row.visibility.observation.freshness === 'unknown'));
assert(unknown.rows.every(row => row.controller.status === 'unknown'));

assert.throws(() => validateConfiguration(null), /must be an array/);
assert.throws(() => validateConfiguration(configuration.slice(0, 3)),
  /exactly four rooms/);
assert.throws(() => validateConfiguration([
  configuration[0], configuration[0], configuration[2], configuration[3]
]), /duplicates W7N4/);
assert.throws(() => validateConfiguration([
  ...configuration.slice(0, 3),
  { roomName: 'invalid', configuredRole: 'reserved', authorityHome: 'W7N4' }
]), /invalid roomName/);
assert.throws(() => validateConfiguration(configuration.map(entry =>
  entry.roomName === 'W8N3' ? { ...entry, configuredRole: 'home' } : entry)),
/W8N3 must be configured as reserved/);
assert.throws(() => validateConfiguration(configuration.map(entry =>
  entry.roomName === 'W7N3' ? { ...entry, authorityHome: 'W8N4' } : entry)),
/W7N3 must use authority home W7N4/);

console.log('canonical four-room operational scope preserves ownership, freshness and isolation');
