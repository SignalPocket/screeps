'use strict';

const assert = require('assert');
const fs = require('fs');
const { countCurrentUpgraders } = require('./room.situation');

const creep = (name, home, role, { spawning = false, viable = true } = {}) => ({
  name, spawning, viable, memory: { home, role }
});
const roster = [
  creep('w1-viable', 'W1N1', 'upgrader'),
  creep('w1-expiring', 'W1N1', 'upgrader', { viable: false }),
  creep('w1-spawning', 'W1N1', 'upgrader', {
    spawning: true, viable: false
  }),
  creep('w1-builder', 'W1N1', 'builder'),
  creep('w2-viable', 'W2N2', 'upgrader')
];
const before = roster.map(candidate => candidate.name);
assert.strictEqual(countCurrentUpgraders(roster, 'W1N1',
  candidate => candidate.viable), 2);
assert.strictEqual(countCurrentUpgraders(roster, 'W2N2',
  candidate => candidate.viable), 1);
assert.deepStrictEqual(roster.map(candidate => candidate.name), before,
  'upgrader measurement does not mutate the supplied roster');

const source = fs.readFileSync(require.resolve('./room.situation'), 'utf8');
assert.match(source,
  /Array\.isArray\(dependencies\.creeps\)[\s\S]{0,100}Object\.values\(Game\.creeps\)/,
  'independent callers retain the Game roster fallback');
const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert.match(main,
  /createRoomSituation\(\{\s+Game, creeps: tickCreeps,/,
  'the main loop supplies its stable tick roster');

console.log('room situation reuses one isolated tick roster for upgrader policy');
