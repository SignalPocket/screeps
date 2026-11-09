'use strict';
const assert=require('assert');const {createMovementService,
  applyBrigadeBypassCost,BRIGADE_BYPASS_COST}=require('./movement.service');
let options;const creep={name:'miner',pos:{x:18,y:48},room:{name:'W8N4'},memory:{},store:{getUsedCapacity:()=>0},moveTo:(target,o)=>{options=o;return 0;}};
const movement=createMovementService({Game:{time:10,rooms:{},creeps:{}},Room:{},OK:0,ERR_INVALID_TARGET:-7});
movement.moveCreep(creep,{id:'source',pos:{roomName:'W8N3',x:34,y:20}},1,{direct:true,maxOps:12000});
assert.strictEqual(options.range,1,'cross-room mining must reach an adjacent tile, not the unwalkable source');
assert.strictEqual(options.maxOps,12000);assert.strictEqual(creep.memory.navGoal,'source');

const costs={values:{'10:10':2,'11:10':255},get(x,y){return this.values[`${x}:${y}`]||0;},
  set(x,y,value){this.values[`${x}:${y}`]=value;}};
applyBrigadeBypassCost(costs,10,10);
applyBrigadeBypassCost(costs,11,10);
assert.strictEqual(costs.get(10,10),BRIGADE_BYPASS_COST,
  'brigade lanes should strongly prefer a bypass without dividing the room');
assert.strictEqual(costs.get(11,10),255,
  'real obstacles on the brigade route must remain impassable');
console.log('cross-room movement preserves action range and a stable source destination');

// Loaded builders can spend several ticks shedding swamp fatigue. Their saved
// route must survive that wait, while real collisions still force a replan.
const game = {time: 100, rooms: {}, creeps: {}};
let calls = [];
const walker = {name: 'builder', room: {name: 'W7N3'}, fatigue: 0,
  pos: {x: 18, y: 14, getRangeTo: p => Math.max(Math.abs(p.x - walker.pos.x),
    Math.abs(p.y - walker.pos.y))},
  memory: {navCostVersion: 'brigade-bypass-v10'},
  store: {getUsedCapacity: () => 150},
  moveTo: (target, opts) => {calls.push(opts); return 0;}};
const service = createMovementService({Game: game,
  Room: {deserializePath: () => []}, OK: 0, ERR_INVALID_TARGET: -7, ERR_TIRED: -11});
const destination = {id: 'repair', pos: {roomName: 'W7N3', x: 30, y: 20}};
service.moveCreep(walker, destination);
walker.memory._move = {path: 'cached-route'};
const cachedRoute = walker.memory._move;
walker.memory.navStuck = 2; // Clear historical false congestion on deployment.
for (let tick = 101; tick <= 106; tick++) {
  game.time = tick;
  walker.fatigue = (107 - tick) * 6;
  assert.strictEqual(service.moveCreep(walker, destination), -11);
  assert.strictEqual(walker.memory.navStuck, 0);
  assert.strictEqual(walker.memory.navLastTick, undefined);
  assert.strictEqual(walker.memory._move, cachedRoute);
}
assert.strictEqual(calls.length, 1, 'fatigue waits should not invoke pathfinding');
game.time = 107;
walker.fatigue = 0;
service.moveCreep(walker, destination);
assert.strictEqual(walker.memory.navStuck, 0, 'recovery is a fresh move attempt');
assert.strictEqual(calls.at(-1).reusePath, 50);
assert.strictEqual(walker.memory._move, cachedRoute);
game.time = 108;
service.moveCreep(walker, destination);
assert.strictEqual(walker.memory.navStuck, 1);
game.time = 109;
service.moveCreep(walker, destination);
assert.strictEqual(walker.memory.navStuck, 2);
assert.strictEqual(calls.at(-1).reusePath, 0, 'two real blocked attempts replan');
assert.strictEqual(calls.at(-1).ignoreCreeps, false);
assert.strictEqual(walker.memory._move, undefined);
assert.deepStrictEqual(walker.memory.navRecovery, {
  tick: 109, reason: 'blocked', result: 0, stuck: 2,
  goal: 'repair', room: 'W7N3', x: 18, y: 14
}, 'an accepted recovery intent is evidence, not proof of displacement');
game.time = 110;
walker.pos.x++;
service.moveCreep(walker, destination);
game.time = 111;
walker.pos.x--;
service.moveCreep(walker, destination);
assert.strictEqual(calls.at(-1).reusePath, 0, 'real oscillation still replans');
assert.strictEqual(walker.memory.navRecovery.reason, 'oscillation');
assert.strictEqual(walker.memory.navRecovery.tick, 111);
game.time = 112;
service.moveCreep(walker, {id: 'other', pos: destination.pos});
assert.strictEqual(walker.memory.navStuck, 0, 'a new goal resets congestion');
walker.fatigue = 10;
walker.pos.x = 30;
walker.pos.y = 20;
assert.strictEqual(service.moveCreep(walker, destination), 0,
  'an already reached destination needs no move even when fatigued');
console.log('fatigue preserves routes; recovered collisions and oscillation still replan');

// Failed searches must retain their error code, replacing one bounded record.
walker.pos.x = 18;
walker.pos.y = 14;
walker.fatigue = 0;
walker.memory.navStuck = 2;
walker.memory.navGoal = 'repair';
walker.memory.navLastX = 18;
walker.memory.navLastY = 14;
walker.memory.navLastRoom = 'W7N3';
walker.memory.navLastTick = 112;
walker.moveTo = () => -2;
game.time = 113;
assert.strictEqual(service.moveCreep(walker, destination), -2);
assert.deepStrictEqual(walker.memory.navRecovery, {
  tick: 113, reason: 'blocked', result: -2, stuck: 3,
  goal: 'repair', room: 'W7N3', x: 18, y: 14
});
const recovery = walker.memory.navRecovery;
game.time = 114;
walker.fatigue = 4;
assert.strictEqual(service.moveCreep(walker, destination), -11);
assert.strictEqual(walker.memory.navRecovery, recovery,
  'forced waits preserve the timestamped attempt rather than invent a search');
game.time = 116; // Includes a CPU-deferred tick with no movement call.
walker.fatigue = 0;
walker.moveTo = () => 0;
service.moveCreep(walker, {id: 'new-goal', pos: destination.pos});
assert.strictEqual(walker.memory.navRecovery, recovery,
  'normal movement retains historical evidence with its original goal and tick');
assert.strictEqual(walker.memory.navStuck, 0);
console.log('bounded recovery evidence separates rejected searches and accepted intents');

// A combat route must not wait for generic stuck detection when a friendly is
// visibly occupying one of its next few cached steps.
const combatGame = {time: 200, creeps: {}, rooms: {}};
const blocker = {name: 'hauler', pos: {x: 11, y: 10}, memory: {role: 'hauler'},
  store: {getUsedCapacity: () => 100}};
const defender = {name: 'defender', room: {name: 'W8N3'}, fatigue: 0,
  pos: {x: 10, y: 10, getRangeTo: p => Math.max(Math.abs(p.x - 10),
    Math.abs(p.y - 10))}, memory: {
    role: 'defender', navCostVersion: 'brigade-bypass-v10',
    _move: {path: 'combat-route'}
  }, store: {getUsedCapacity: () => 0}};
defender.room.memory = {};
defender.room.find = type => type === 'my-creeps' ? [defender, blocker] : [];
combatGame.rooms.W8N3 = defender.room;
let combatOptions;
defender.moveTo = (target, opts) => { combatOptions = opts; return 0; };
const combatService = createMovementService({Game: combatGame,
  Room: {deserializePath: () => [{x: 11, y: 10}, {x: 12, y: 10},
    {x: 13, y: 10}, {x: 14, y: 10}]}, FIND_STRUCTURES: 'structures',
  FIND_MY_CONSTRUCTION_SITES: 'sites', FIND_MY_CREEPS: 'my-creeps',
  STRUCTURE_ROAD: 'road', STRUCTURE_EXTENSION: 'extension',
  OK: 0, ERR_INVALID_TARGET: -7, ERR_TIRED: -11});
combatService.moveCreep(defender,
  {id: 'invader', pos: {roomName: 'W8N3', x: 20, y: 10}}, 1,
  {avoidFriendlyBlockers: true});
assert.strictEqual(combatOptions.reusePath, 0,
  'combat pursuit must immediately discard the obstructed cached path');
assert.strictEqual(combatOptions.ignoreCreeps, false,
  'combat replanning must route around current friendly positions');
assert.strictEqual(defender.memory._move, undefined);
assert.strictEqual(defender.memory.navRecovery.reason, 'friendly-blocker');
assert.strictEqual(defender.memory.navRecovery.stuck, 0,
  'visible obstruction does not need fabricated stuck ticks');

combatGame.time++;
defender.memory._move = {path: 'combat-route'};
delete defender.memory.navLastTick;
combatService.getMovementRoomCache('W8N3').creeps = [{
  name: defender.name, x: defender.pos.x, y: defender.pos.y,
  loaded: false, stationary: false
}];
combatService.moveCreep(defender,
  {id: 'invader', pos: {roomName: 'W8N3', x: 20, y: 10}});
assert.strictEqual(combatOptions.reusePath, 25,
  'ordinary movement must retain normal cached-route reuse');
assert.strictEqual(combatOptions.ignoreCreeps, true);
console.log('combat pursuit immediately replans around friendly cached-route blockers');

// Ordinary traffic commits to a bounded corridor. A moving occupant gets one
// observation to clear it; persistence on the next tick replans before impact.
const corridorGame = {time: 300, creeps: {}, rooms: {}};
const corridorBlocker = {name: 'carrier', pos: {x: 13, y: 10},
  memory: {role: 'hauler'}, store: {getUsedCapacity: () => 100}};
const corridorWalker = {name: 'worker', room: {name: 'W7N4'}, fatigue: 0,
  pos: {x: 10, y: 10, getRangeTo: p => Math.max(Math.abs(p.x - 10),
    Math.abs(p.y - 10))}, memory: {
    role: 'builder', navCostVersion: 'brigade-bypass-v10',
    _move: {path: 'retained-corridor'}
  }, store: {getUsedCapacity: () => 50}};
corridorWalker.room.memory = {};
corridorWalker.room.find = type => type === 'my-creeps'
  ? [corridorWalker, corridorBlocker] : [];
corridorGame.rooms.W7N4 = corridorWalker.room;
let corridorOptions;
corridorWalker.moveTo = (target, opts) => { corridorOptions = opts; return 0; };
let corridorDeserializeCalls = 0;
const corridorService = createMovementService({Game: corridorGame,
  Room: {deserializePath: () => {
    corridorDeserializeCalls++;
    return [{x: 11, y: 10}, {x: 12, y: 10}, {x: 13, y: 10},
      {x: 14, y: 10}, {x: 15, y: 10}, {x: 16, y: 10}];
  }},
  FIND_STRUCTURES: 'structures', FIND_MY_CONSTRUCTION_SITES: 'sites',
  FIND_MY_CREEPS: 'my-creeps', STRUCTURE_ROAD: 'road',
  STRUCTURE_EXTENSION: 'extension', OK: 0, ERR_INVALID_TARGET: -7,
  ERR_TIRED: -11});
const corridorGoal = {id: 'build-site',
  pos: {roomName: 'W7N4', x: 20, y: 10}};
corridorService.moveCreep(corridorWalker, corridorGoal);
assert.strictEqual(corridorDeserializeCalls, 1,
  'one move should decode its shared blocker, safety and retained corridor once');
assert.strictEqual(corridorOptions.reusePath, 50,
  'one moving-creep observation retains the chosen route');
assert.deepStrictEqual(corridorWalker.memory.navCorridor, {
  goal: 'build-site', room: 'W7N4', tick: 300,
  steps: [{x: 11, y: 10}, {x: 12, y: 10}, {x: 13, y: 10},
    {x: 14, y: 10}, {x: 15, y: 10}]
});
assert.strictEqual(corridorWalker.memory.navBlocker.count, 1);

corridorGame.time = 301;
corridorService.moveCreep(corridorWalker, corridorGoal);
assert.strictEqual(corridorDeserializeCalls, 2,
  'the next tick must refresh the decoded route');
assert.strictEqual(corridorOptions.reusePath, 0,
  'a persistent look-ahead obstruction replans before collision');
assert.strictEqual(corridorOptions.ignoreCreeps, false);
assert.strictEqual(corridorWalker.memory.navRecovery.reason,
  'persistent-friendly-blocker');

corridorGame.time = 302;
corridorWalker.memory._move = {path: 'new-goal-route'};
delete corridorWalker.memory.navLastTick;
corridorService.moveCreep(corridorWalker,
  {id: 'repair-site', pos: corridorGoal.pos});
assert.strictEqual(corridorOptions.reusePath, 50,
  'a goal change clears prior blocker persistence evidence');
assert.strictEqual(corridorWalker.memory.navBlocker.count, 1);
assert.strictEqual(corridorWalker.memory.navCorridor.goal, 'repair-site');
assert.strictEqual(corridorDeserializeCalls, 3,
  'a changed path must invalidate the cached decode');

corridorWalker.memory._move = {path: 'same-tick-replacement'};
corridorService.reserveUpcomingRoute(corridorWalker);
assert.strictEqual(corridorDeserializeCalls, 4,
  'a same-tick path replacement must be decoded independently');
corridorWalker.pos.x = 11;
corridorService.reserveUpcomingRoute(corridorWalker);
assert.strictEqual(corridorDeserializeCalls, 5,
  'same-tick displacement must realign and refresh the decoded route');
corridorWalker.pos.x = 10;

const cached = corridorService.getMovementRoomCache('W7N4');
cached.creeps.find(other => other.name === 'carrier').stationary = true;
corridorGame.time = 303;
corridorWalker.memory._move = {path: 'stationary-route'};
delete corridorWalker.memory.navLastTick;
corridorService.moveCreep(corridorWalker,
  {id: 'stationary-test', pos: corridorGoal.pos});
assert.strictEqual(corridorOptions.reusePath, 0,
  'a predictably stationary occupant invalidates the corridor immediately');
console.log('durable route corridors distinguish transient and persistent blockers');

const safetyScenario = ({role = 'builder', obstacle = false, wall = false,
  hostile = false}) => {
  const game = {time: 400, creeps: {}, rooms: {}};
  const actor = {name: `${role}-safety`, room: {name: 'W6N6'}, fatigue: 0,
    pos: {x: 10, y: 10, getRangeTo: p => Math.max(Math.abs(p.x - 10),
      Math.abs(p.y - 10))}, memory: {
      role, navCostVersion: 'brigade-bypass-v10',
      _move: {path: 'safety-corridor'}
    }, store: {getUsedCapacity: () => 0}};
  const hostileCreep = {id: 'hostile', pos: {x: 14, y: 10},
    getActiveBodyparts: part => part === 'ranged_attack' ? 1 : 0};
  actor.room.memory = {};
  actor.room.getTerrain = () => ({get: (x, y) =>
    wall && x === 12 && y === 10 ? 1 : 0});
  actor.room.find = type => {
    if (type === 'structures') return obstacle
      ? [{structureType: 'spawn', pos: {x: 12, y: 10}}] : [];
    if (type === 'my-creeps') return [actor];
    if (type === 'hostiles') return hostile ? [hostileCreep] : [];
    return [];
  };
  game.rooms.W6N6 = actor.room;
  let moveOptions;
  const costValues = {};
  actor.moveTo = (target, opts) => {
    moveOptions = opts;
    const costs = {get: (x, y) => costValues[`${x}:${y}`] || 0,
      set: (x, y, value) => { costValues[`${x}:${y}`] = value; }};
    opts.costCallback('W6N6', costs);
    return 0;
  };
  const service = createMovementService({Game: game,
    Room: {deserializePath: () => [{x: 11, y: 10}, {x: 12, y: 10},
      {x: 13, y: 10}, {x: 14, y: 10}, {x: 15, y: 10}]},
    FIND_STRUCTURES: 'structures', FIND_MY_CONSTRUCTION_SITES: 'sites',
    FIND_MY_CREEPS: 'my-creeps', FIND_HOSTILE_CREEPS: 'hostiles',
    STRUCTURE_ROAD: 'road', STRUCTURE_EXTENSION: 'extension',
    OBSTACLE_OBJECT_TYPES: ['spawn'], TERRAIN_MASK_WALL: 1,
    ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack',
    OK: 0, ERR_INVALID_TARGET: -7, ERR_TIRED: -11});
  service.moveCreep(actor,
    {id: 'destination', pos: {roomName: 'W6N6', x: 20, y: 10}});
  return {actor, moveOptions, costValues};
};

const structureSafety = safetyScenario({obstacle: true});
assert.strictEqual(structureSafety.moveOptions.reusePath, 0);
assert.strictEqual(structureSafety.actor.memory.navRecovery.reason,
  'corridor-structure');
const wallSafety = safetyScenario({wall: true});
assert.strictEqual(wallSafety.moveOptions.reusePath, 0);
assert.strictEqual(wallSafety.actor.memory.navRecovery.reason,
  'corridor-wall');
const hostileSafety = safetyScenario({hostile: true});
assert.strictEqual(hostileSafety.moveOptions.reusePath, 0);
assert.strictEqual(hostileSafety.actor.memory.navRecovery.reason,
  'corridor-hostile');
assert.strictEqual(hostileSafety.costValues['14:10'], 255,
  'the hostile tile must be impassable to civilian replanning');
assert.strictEqual(hostileSafety.costValues['11:10'], 80,
  'a ranged threat radius must be strongly avoided');
const defenderSafety = safetyScenario({role: 'defender', hostile: true});
assert.strictEqual(defenderSafety.moveOptions.reusePath, 25,
  'a defender must retain authority to approach its combat target');
assert.strictEqual(defenderSafety.costValues['14:10'], undefined,
  'civilian threat costs must not fence defenders away from combat');
console.log('retained corridors invalidate walls, structures and civilian hostile exposure');
