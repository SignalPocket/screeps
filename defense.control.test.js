'use strict';

const assert = require('assert');
const { selectCombatTarget, needsEmergencyDefender,
  collectFriendlyDamageEvents, updateWarState, getDefenseRoomNames,
  getOutpostPresenceGap,
  holdMeleeEngagement,
  selectDefenderGarrison, selectUndefendedThreat,
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
  memory: { defenseTargetRoom: 'W1N2' } }], constants), uncoveredThreat,
'a garrison in one outpost does not suppress a defender for another');

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

const searched = {};
class CostMatrix {
  constructor() { this.values = {}; }
  set(x, y, value) { this.values[`${x}:${y}`] = value; }
}
const room = {
  name: 'W1N1',
  find: kind => kind === 'structures'
    ? [{ structureType: 'spawn', pos: { x: 8, y: 10 } }]
    : [{ name: 'civilian', pos: { x: 10, y: 10 } }]
};
const fleeingCreep = {
  pos: { getRangeTo: target => Math.abs(target.pos.x - 10) },
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

console.log('defenders prioritize dangerous hostiles and workers can flee safely');
