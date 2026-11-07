'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { updateRoomCombat, isActiveDefenseAssignment, withCombatStatus } =
  require('./room.combat');
const { selectDefenderGarrison, selectUndefendedThreat,
  needsEmergencyDefender } = require('./defense.control');
const room = { name: 'W7N3', memory: { unrelated: 'keep' } };
const core = { id: 'core', structureType: 'invaderCore' };
const first = updateRoomCombat(room, 10, [core]);
assert.strictEqual(first.state, 'Fighting');
assert.strictEqual(first.requiredDefenders, 2);
assert.strictEqual(updateRoomCombat(room, 11, [core]).since, 10);
const fighter = { name: 'defender', room: { name: 'W7N3' },
  memory: { role: 'defender', birthRole: 'defender', defenseTargetRoom: 'W7N3' },
  ticksToLive: 1000 };
const reinforcement = { ...fighter, name: 'reinforcement',
  room: { name: 'W7N4' }, spawning: true, ticksToLive: 1500 };
const third = { ...reinforcement, name: 'third', ticksToLive: 1400 };
assert(isActiveDefenseAssignment(fighter, { W7N3: room }));
assert.strictEqual(isActiveDefenseAssignment({ memory: { role: 'builder' } },
  { W7N3: room }), false);
assert(needsEmergencyDefender(1, 1, false, first.requiredDefenders));
const threats = [{ creep: core, roomName: 'W7N3', requiredDefenders: 2 }];
assert(selectUndefendedThreat(threats, [fighter], {}));
assert.strictEqual(selectUndefendedThreat(threats, [fighter, reinforcement], {}), null,
  'a spawning second defender covers the second slot; no third is requested');
assert.deepStrictEqual(selectDefenderGarrison([fighter, reinforcement, third],
  { W7N3: first.requiredDefenders }).get('W7N3'), [fighter, reinforcement],
  'both combat slots survive the garrison retirement pass');
const economy = { key: 'building', label: 'Building', reasons: ['spawn unfinished'] };
const fighting = withCombatStatus(economy, first);
assert.strictEqual(fighting.label, 'Fighting');
assert.strictEqual(fighting.economyLabel, 'Building');
assert.deepStrictEqual(fighting.reasons, economy.reasons);
const cleared = updateRoomCombat(room, 12, []);
assert.strictEqual(cleared.state, 'Peace');
assert.strictEqual(cleared.requiredDefenders, 0);
assert.strictEqual(cleared.lastThreat, 11);
assert.strictEqual(isActiveDefenseAssignment(fighter, { W7N3: room }), false);
assert.strictEqual(withCombatStatus(economy, cleared).label, 'Building');
assert.strictEqual(room.memory.unrelated, 'keep');

// Execute the installed fallback that caused the live defender->builder churn.
const main = fs.readFileSync(require.resolve('./main'), 'utf8');
const marker = main.indexOf('    if (!creep.room.controller || !creep.room.controller.my) {');
const start = main.lastIndexOf('  for (const creep of creeps) {', marker);
const end = main.indexOf('  // Role allocation above', marker);
assert(start >= 0 && end > start);
vm.runInNewContext(main.slice(start, end), { creeps: [fighter],
  isOutpostBuilder: () => false, isExpansionBuilder: () => false });
assert.strictEqual(fighter.memory.role, 'defender',
  'ordinary non-owned-room fallback cannot change the combat assignment');
assert.strictEqual(fighter.memory.builderScope, undefined);
console.log('per-room combat state protects assignments and bounds reinforcements');
