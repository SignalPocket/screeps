'use strict';
const assert = require('assert');
const fs = require('fs');
const { getDefenseTargets, selectCombatTarget, selectUndefendedThreat } =
  require('./defense.control');
const core = { id: 'core', structureType: 'invaderCore', hits: 100000 };
const room = { find: type => type === 'creeps' ? [] : [core,
  { id: 'wall', structureType: 'constructedWall', hits: 1000 },
  { id: 'dead', structureType: 'invaderCore', hits: 0 }] };
const targets = getDefenseTargets(room, 'creeps', 'structures');
assert.deepStrictEqual(targets, [core],
  'an Invader core remains a defense target with no hostile creep present');
const threat = selectUndefendedThreat(targets.map(creep => ({
  creep, roomName: 'W7N3' })), [], {});
assert.strictEqual(threat.creep, core);
assert.strictEqual(selectCombatTarget({ pos: { getRangeTo: () => 1 } },
  targets, {}), core, 'structures need no body-part API to be attacked');
const hostile = { id: 'attacker', hits: 100,
  getActiveBodyparts: part => part === 'attack' ? 1 : 0 };
assert.strictEqual(selectCombatTarget({ pos: { getRangeTo: () => 1 } },
  [core, hostile], { ATTACK: 'attack' }), hostile,
  'an armed creep still outranks a non-attacking core');
const main = fs.readFileSync(require.resolve('./main'), 'utf8');
for (const target of ['room', 'targetRoom', 'defendedRoom']) {
  assert(main.includes(`getDefenseTargets(${target}, FIND_HOSTILE_CREEPS,`),
    `${target}: deployment and combat must share structural threat detection`);
}
assert(main.includes('target.creep.structureType === STRUCTURE_INVADER_CORE ||'),
  'a core reserving an established outpost cannot wait behind brigade recovery');
console.log('Invader cores trigger defense and remain combat targets');
