'use strict';

const assert = require('assert');
const { getActiveCombatObjectives, reconcileCombatObjectives,
  getObjectiveDefenderRequirements } = require('./combat.objectives');

const home = { name: 'W7N4', memory: { combatObjectives: {
  W6N3: { active: true, kind: 'invader-core', requiredDefenders: 2 }
} } };
const Game = { time: 100, rooms: {} };
assert.deepStrictEqual(getActiveCombatObjectives(home.memory), [{
  roomName: 'W6N3', active: true, kind: 'invader-core',
  requiredDefenders: 2
}]);
let threats = reconcileCombatObjectives({ homeRoom: home, Game,
  getTargets: () => [], invaderCoreType: 'invaderCore' });
assert.strictEqual(threats.length, 1);
assert.strictEqual(threats[0].roomName, 'W6N3');
assert.strictEqual(threats[0].requiredDefenders, 2);
assert.strictEqual(home.memory.combatObjectives.W6N3.status,
  'seeking-vision');
assert.deepStrictEqual(getObjectiveDefenderRequirements([home]), { W6N3: 2 });

const core = { id: 'core', structureType: 'invaderCore', hits: 100000 };
Game.rooms.W6N3 = { name: 'W6N3' };
Game.time = 101;
threats = reconcileCombatObjectives({ homeRoom: home, Game,
  getTargets: () => [core], invaderCoreType: 'invaderCore' });
assert.strictEqual(threats[0].creep, core);
assert.strictEqual(home.memory.combatObjectives.W6N3.status, 'engaged');
assert.strictEqual(home.memory.combatObjectives.W6N3.lastSeen, 101);

Game.time = 102;
threats = reconcileCombatObjectives({ homeRoom: home, Game,
  getTargets: () => [], invaderCoreType: 'invaderCore' });
assert.deepStrictEqual(threats, []);
assert.strictEqual(home.memory.combatObjectives.W6N3.active, false);
assert.strictEqual(home.memory.combatObjectives.W6N3.status, 'complete');
assert.strictEqual(home.memory.combatObjectives.W6N3.completed, 102);

console.log('combat objective scenarios passed');
