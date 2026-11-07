'use strict';
const assert = require('assert');
const { updateRoomCombat, isActiveDefenseAssignment, withCombatStatus } =
  require('./room.combat');

const economy = Object.freeze({ key: 'building', label: 'Building',
  reasons: Object.freeze(['spawn unfinished']), unrelated: 42 });
const room = { memory: { roomStatus: economy, unrelated: 'keep' } };
const other = { memory: { combatStatus: { fighting: true, since: 3 } } };
const targets = Object.freeze([
  Object.freeze({ id: 'core', structureType: 'invaderCore' }),
  Object.freeze({ id: 'creep', body: [] })
]);
const observe = (tick, threats) => updateRoomCombat(room, tick, threats);
assert.strictEqual(observe(10, []).since, 10);
assert.strictEqual(observe(11, []).since, 10);
assert.strictEqual(room.memory.combatStatus.lastThreat, null);
const first = observe(12, targets);
assert.deepStrictEqual(first.threatIds, ['core', 'creep']);
assert.strictEqual(first.hostileCount, 2);
assert.strictEqual(first.invaderCores, 1);
assert.strictEqual(first.requiredDefenders, 2);
assert.strictEqual(first.since, 12);
const repeated = observe(13, targets);
assert.strictEqual(repeated.since, 12);
assert.strictEqual(repeated.lastThreat, 13);
assert.strictEqual(room.memory.roomStatus.economyKey, 'building');
assert.strictEqual(room.memory.roomStatus.economyLabel, 'Building');
assert.strictEqual(room.memory.roomStatus.key, 'fighting');
assert.deepStrictEqual(first.threatIds, ['core', 'creep']);
assert.strictEqual(first.updated, 12, 'new observations preserve old snapshots');
const ordinary = observe(14, [targets[1]]);
assert.strictEqual(ordinary.since, 12, 'threat mix changes keep the combat episode');
assert.strictEqual(ordinary.requiredDefenders, 1);
assert.strictEqual(ordinary.invaderCores, 0);
const peace = observe(15, []);
assert.strictEqual(peace.since, 15);
assert.strictEqual(peace.lastThreat, 14);
assert.strictEqual(peace.requiredDefenders, 0);
assert.deepStrictEqual(peace.threatIds, []);
assert.strictEqual(room.memory.roomStatus.key, 'building');
assert.strictEqual(room.memory.roomStatus.label, 'Building');
assert.strictEqual(room.memory.roomStatus.fighting, false);
assert.strictEqual(observe(16, []).since, 15);
assert.strictEqual(observe(17, targets).since, 17);
assert.strictEqual(room.memory.unrelated, 'keep');
assert.deepStrictEqual(other.memory.combatStatus, { fighting: true, since: 3 });

// Missing visibility cannot establish an active assignment. A persisted room
// record with an observed fight can; role history preserves retiring defenders.
const rooms = { target: room, other, peaceful: { memory: {
  combatStatus: { fighting: false } } }, unknown: { memory: {} } };
for (const identity of ['role', 'birthRole', 'retiredRole']) {
  const memory = Object.freeze({ [identity]: 'defender',
    defenseTargetRoom: 'target', unrelated: 'keep' });
  const creep = Object.freeze({ memory });
  assert.strictEqual(isActiveDefenseAssignment(creep, rooms), true, identity);
  for (const destination of ['peaceful', 'unknown', 'missing', undefined]) {
    assert.strictEqual(isActiveDefenseAssignment({ memory: {
      ...memory, defenseTargetRoom: destination } }, rooms), false,
    `${identity}: ${destination}`);
  }
}
for (const memory of [{}, { role: 'builder', defenseTargetRoom: 'target' },
  { role: 'defender' }]) {
  assert.strictEqual(isActiveDefenseAssignment({ memory }, rooms), false);
}
assert.strictEqual(isActiveDefenseAssignment({}, rooms), false);

for (const combat of [undefined, Object.freeze({ state: 'Peace', fighting: false }),
  Object.freeze({ state: 'Fighting', fighting: true })]) {
  const presented = withCombatStatus(economy, combat);
  assert.notStrictEqual(presented, economy);
  assert.strictEqual(presented.unrelated, 42);
  assert.strictEqual(presented.reasons, economy.reasons);
  assert.strictEqual(presented.combat, combat ? combat.state : 'Unknown');
  assert.strictEqual(presented.key, combat && combat.fighting ? 'fighting' : 'building');
}
assert.strictEqual(economy.key, 'building');
assert.strictEqual(economy.economyKey, undefined);
console.log('combat transition and assignment retention boundaries passed');
