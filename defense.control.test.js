'use strict';

const assert = require('assert');
const { selectCombatTarget, needsEmergencyDefender,
  collectFriendlyDamageEvents, updateWarState, getDefenseRoomNames,
  getOutpostPresenceGap,
  holdMeleeEngagement, evaluateDefenderEngagement,
  selectDefenderGarrison, selectUndefendedThreat, hasActiveDamageParts,
  createDefenseController } =
  require('./defense.control');

assert.strictEqual(needsEmergencyDefender(1, 0), true,
  'a visible hostile requests one defender even before policy refresh');
assert.strictEqual(needsEmergencyDefender(1, 1), false,
  'an existing defender covers the hostile room');
assert.strictEqual(needsEmergencyDefender(0, 0), false,
  'a stale war flag does not request defenders without a visible hostile');
assert.strictEqual(needsEmergencyDefender(1, 0, true), false,
  'multiple spawns cannot queue defenders for one room in the same tick');
const defenderA = { name: 'a', room: { name: 'W1N1' },
  memory: { defenseTargetRoom: 'W1N2' }, ticksToLive: 100 };
const defenderB = { name: 'b', room: { name: 'W1N2' },
  memory: { defenseTargetRoom: 'W1N2' }, ticksToLive: 50 };
const defenderC = { name: 'c', room: { name: 'W1N1' },
  memory: { defenseTargetRoom: 'W1N2' }, ticksToLive: 200 };
assert.strictEqual(selectDefenderGarrison([
  defenderA, defenderB, defenderC
]).get('W1N2')[0], defenderB,
'keep only one defender per target room and prefer a defender already there');
const warMemory = {};
const damagedCreep = {
  hits: 80,
  room: { name: 'W1N2' },
  memory: { home: 'W1N1', warPreviousHits: 100 }
};
const unharmedCreep = {
  hits: 100,
  room: { name: 'W1N1' },
  memory: { home: 'W1N1', warPreviousHits: 100 }
};
assert.deepStrictEqual(collectFriendlyDamageEvents([
  damagedCreep, unharmedCreep
]), [{ damaged: true, roomName: 'W1N2', homeRoomName: 'W1N1' }]);
assert.strictEqual(damagedCreep.memory.warPreviousHits, 80,
  'damage observation saves the current hits for the next tick');
assert.strictEqual(updateWarState(warMemory, 10, [{
  damaged: true, roomName: 'W1N2', homeRoomName: 'W1N1'
}]), true);
assert.strictEqual(warMemory.war, true);
assert.strictEqual(warMemory.warHome, 'W1N1');
assert.strictEqual(updateWarState(warMemory, 109, []), true,
  'war stays active through its response window');
assert.strictEqual(updateWarState(warMemory, 111, []), false,
  'war expires after the response window without further attacks');

assert.deepStrictEqual([...getDefenseRoomNames('W1N1', {
  leftSurvey: { active: true, targetRoom: 'W1N2' },
  southSurvey: { active: false, targetRoom: 'W2N1' }
}, [
  { memory: { home: 'W1N1', remoteRoom: 'W1N2' } },
  { memory: { home: 'W3N3', remoteRoom: 'W3N4' } }
])].sort(), ['W1N1', 'W1N2'],
'defense searches active outposts belonging to the spawning home');
assert.strictEqual(getOutpostPresenceGap('W1N1', {
  leftSurvey: { active: true, targetRoom: 'W1N2' }
}, []).survey.targetRoom, 'W1N2');
assert.strictEqual(getOutpostPresenceGap('W1N1', {
  leftSurvey: { active: true, targetRoom: 'W1N2' }
}, [{ room: { name: 'W1N2' }, memory: {} }]), null,
'any creep physically present covers an active outpost');
assert.strictEqual(getOutpostPresenceGap('W1N1', {
  leftSurvey: { active: true, targetRoom: 'W1N2' }
}, [{ room: { name: 'W1N1' }, memory: {
  home: 'W1N1', remoteRoom: 'W1N2', role: 'remote-miner'
} }]), null,
'an assigned outpost creep in transit prevents duplicate spawning');

const constants = {
  HEAL: 'heal', RANGED_ATTACK: 'ranged_attack', ATTACK: 'attack',
  WORK: 'work', CLAIM: 'claim'
};
const makeHostile = (id, x, parts) => ({
  id,
  pos: { x, y: 10 },
  hits: 100,
  getActiveBodyparts: part => parts[part] || 0
});
const creep = {
  pos: { getRangeTo: target => Math.abs(target.pos.x - 10) }
};
const target = selectCombatTarget(creep, [
  makeHostile('nearby', 11, {}),
  makeHostile('attacker', 14, { ranged_attack: 1 })
], constants);
assert.strictEqual(target.id, 'attacker',
  'combat targets prioritize hostile damage over proximity');
const defendedThreat = { roomName: 'W1N2', creep: makeHostile('guarded', 12,
  { attack: 1 }) };
const uncoveredThreat = { roomName: 'W1N3', creep: makeHostile('uncovered', 13,
  { heal: 1 }) };
assert.strictEqual(selectUndefendedThreat([
  defendedThreat, uncoveredThreat
], [{ spawning: false, room: { name: 'W1N2' },
  memory: { defenseTargetRoom: 'W1N2' },
  getActiveBodyparts: part => part === 'attack' ? 1 : 0 }], constants), uncoveredThreat,
'a garrison in one outpost does not suppress a defender for another');

const activeCore = { id: 'db8c1705b3380dc', structureType: 'invaderCore',
  hits: 56710, pos: { x: 42, y: 4 } };
const coreThreat = { roomName: 'W7N3', creep: activeCore,
  requiredDefenders: 2 };
const assignedDefender = (name, parts, spawning = false) => ({ name, spawning,
  room: { name: 'W7N3' }, memory: { role: 'defender',
    defenseTargetRoom: 'W7N3' },
  getActiveBodyparts: part => parts[part] || 0 });
const healers = [
  assignedDefender('01-WK-286140', { heal: 5 }),
  assignedDefender('01-WK-286146', { heal: 5 })
];
assert(healers.every(defender => !hasActiveDamageParts(defender, constants)));
assert.strictEqual(selectUndefendedThreat([coreThreat], healers, constants),
  coreThreat, 'two HEAL-only assignments leave an active core uncovered');
assert.strictEqual(needsEmergencyDefender(1, 0, false, 2), true,
  'zero damage coverage requests an attack-capable defender');
const attacker = assignedDefender('attacker', { attack: 1 });
assert.strictEqual(hasActiveDamageParts(attacker, constants), true);
assert.strictEqual(selectUndefendedThreat([coreThreat], [...healers, attacker],
  constants), coreThreat, 'healer support cannot fill the second damage slot');
assert.strictEqual(selectUndefendedThreat([coreThreat], [...healers, attacker,
  assignedDefender('ranger', { ranged_attack: 1 })], constants), null,
  'active melee and ranged parts satisfy the two required damage slots');
const selectedCoreGarrison = selectDefenderGarrison([...healers, attacker],
  { W7N3: 2 }, constants).get('W7N3');
assert(selectedCoreGarrison.includes(attacker),
  'garrison retention cannot discard the only damage-capable defender');
assert.strictEqual(selectedCoreGarrison.filter(defender =>
  !hasActiveDamageParts(defender, constants)).length, 1,
  'one healer remains supplemental without occupying a damage slot');
assert.strictEqual(hasActiveDamageParts(assignedDefender('spawning-healer',
  { heal: 1 }, true), constants), false,
  'a spawning HEAL-only body still cannot reserve a damage slot');
assert.strictEqual(hasActiveDamageParts(assignedDefender('spawning-attacker',
  { attack: 1 }, true), constants), true,
  'an attack-capable body already spawning prevents a duplicate third attacker');

const mainSource = require('fs').readFileSync(require.resolve('./main'), 'utf8');
assert.match(mainSource,
  /defenderCoverage = target \? workers\.filter[\s\S]*hasActiveDamageParts/,
  'spawn coverage uses active attack capability rather than defender labels');
assert.match(mainSource, /healerSupport: false/,
  'an uncovered damage slot always requests an attacker, never HEAL-only support');
assert.doesNotMatch(mainSource, /healerSupport: defenderCoverage % 2/,
  'alternation cannot repeatedly spawn healers while damage coverage is absent');

const cancelled = [];
const adjacentDefender = {
  pos: { getRangeTo: () => 1 },
  cancelOrder: order => cancelled.push(order)
};
assert.strictEqual(holdMeleeEngagement(adjacentDefender, {}, 0), true);
assert.deepStrictEqual(cancelled, ['move'],
  'a successful adjacent strike cancels stale same-tick movement');
assert.strictEqual(holdMeleeEngagement({
  pos: { getRangeTo: () => 2 },
  cancelOrder: order => cancelled.push(order)
}, {}, -9), false,
  'an out-of-range defender keeps its later approach movement');
assert.deepStrictEqual(cancelled, ['move']);

const combatPosition = (x, y = 10) => ({ x, y, roomName: 'W1N1',
  getRangeTo: other => Math.max(Math.abs(x - other.pos.x),
    Math.abs(y - other.pos.y)) });
const combatCreep = (id, x, parts, hits = 100) => ({ id, hits,
  hitsMax: 100, pos: combatPosition(x), room: { name: 'W1N1' },
  getActiveBodyparts: part => parts[part] || 0 });
const meleeDefender = combatCreep('defender', 10, { attack: 1 });
const rangedInvader = combatCreep('ranged', 14, { ranged_attack: 5 });
const invaderHealer = combatCreep('healer', 15, { heal: 5 });
assert.strictEqual(evaluateDefenderEngagement(meleeDefender, rangedInvader,
  [rangedInvader, invaderHealer], [meleeDefender], constants).action, 'hold',
  'a lone melee defender holds outside an overwhelming healer squad');
meleeDefender.pos = combatPosition(12);
assert.strictEqual(evaluateDefenderEngagement(meleeDefender, rangedInvader,
  [rangedInvader, invaderHealer], [meleeDefender], constants).action,
  'retreat', 'an exposed defender retreats before repeated ranged hits');
const isolatedRanged = combatCreep('isolated', 14, { ranged_attack: 5 });
assert.strictEqual(evaluateDefenderEngagement(meleeDefender, isolatedRanged,
  [isolatedRanged], [meleeDefender], constants).action, 'engage',
  'an isolated hostile remains a valid pursuit target');
const support = combatCreep('support', 11, { ranged_attack: 15 });
assert.strictEqual(evaluateDefenderEngagement(meleeDefender, rangedInvader,
  [rangedInvader, invaderHealer], [meleeDefender, support], constants).action,
  'engage', 'sufficient friendly damage permits a supported engagement');
const woundedDefender = combatCreep('wounded', 12, { attack: 1 }, 40);
assert.strictEqual(evaluateDefenderEngagement(woundedDefender, rangedInvader,
  [rangedInvader, invaderHealer], [woundedDefender], constants).action,
  'retreat', 'a damaged overmatched defender retreats');

const searched = {};
class CostMatrix {
  constructor() { this.values = {}; }
  set(x, y, value) { this.values[`${x}:${y}`] = value; }
  get(x, y) { return this.values[`${x}:${y}`] || 0; }
}
const room = {
  name: 'W1N1',
  getTerrain: () => ({ get: () => 0 }),
  find: kind => kind === 'structures'
    ? [{ structureType: 'spawn', pos: { x: 8, y: 10 } }]
    : [{ name: 'civilian', pos: { x: 10, y: 10 } }]
};
const fleeingCreep = {
  pos: { x: 10, y: 10, getRangeTo: target => Math.abs(target.pos.x - 10) },
  room
};
const defense = createDefenseController({
  PathFinder: {
    CostMatrix,
    search: (origin, goals, options) => {
      searched.goals = goals;
      searched.options = options;
      searched.costs = options.roomCallback(room.name);
      return { path: [{ x: 9, y: 11, roomName: room.name }] };
    }
  },
  FIND_STRUCTURES: 'structures',
  FIND_CREEPS: 'creeps',
  OBSTACLE_OBJECT_TYPES: ['spawn'],
  STRUCTURE_ROAD: 'road',
  STRUCTURE_RAMPART: 'rampart'
});
const step = defense.findFleeStep(fleeingCreep, [
  makeHostile('threat', 13, {})
]);
assert.deepStrictEqual(step, { x: 9, y: 11, roomName: 'W1N1' });
assert.strictEqual(searched.options.flee, true);
assert.strictEqual(searched.options.maxRooms, 1);
assert.strictEqual(searched.costs.values['8:10'], 255,
  'flee paths avoid blocking structures');
assert.strictEqual(searched.costs.values['10:10'], 255,
  'flee paths avoid occupied creep positions');
assert.strictEqual(defense.findFleeStep(fleeingCreep, [
  makeHostile('far', 20, {})
]), null, 'creeps keep their normal assignments outside threat range');

const protector = { id: 'guard', name: 'guard', hits: 100, hitsMax: 100,
 spawning: false, room, pos: { x: 7, y: 10 },
 memory: { role: 'defender', defenseTargetRoom: room.name } };
const protectedStep = defense.findFleeStep(fleeingCreep, [
  makeHostile('threat', 13, {})
], 5, [protector]);
const gridRange = (a, b) => Math.max(Math.abs(a.x - b.x),
  Math.abs(a.y - b.y));
assert(gridRange(protectedStep, protector.pos) <
  gridRange(fleeingCreep.pos, protector.pos),
  'a safe retreat step closes distance to the assigned in-room defender');
assert(gridRange(protectedStep, { x: 13, y: 10 }) >
  gridRange(fleeingCreep.pos, { x: 13, y: 10 }),
  'defender attraction never reduces hostile separation');
const unsafeProtector = { ...protector, id: 'unsafe', pos: { x: 14, y: 10 } };
assert.deepStrictEqual(defense.findFleeStep(fleeingCreep, [
  makeHostile('threat', 13, {})
], 5, [unsafeProtector]), { x: 9, y: 11, roomName: room.name },
  'a defender behind the hostile cannot override the ordinary flee route');

console.log('defenders prioritize dangerous hostiles and workers can flee safely');
