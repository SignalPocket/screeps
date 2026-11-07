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
game.time = 110;
walker.pos.x++;
service.moveCreep(walker, destination);
game.time = 111;
walker.pos.x--;
service.moveCreep(walker, destination);
assert.strictEqual(calls.at(-1).reusePath, 0, 'real oscillation still replans');
game.time = 112;
service.moveCreep(walker, {id: 'other', pos: destination.pos});
assert.strictEqual(walker.memory.navStuck, 0, 'a new goal resets congestion');
walker.fatigue = 10;
walker.pos.x = 30;
walker.pos.y = 20;
assert.strictEqual(service.moveCreep(walker, destination), 0,
  'an already reached destination needs no move even when fatigued');
console.log('fatigue preserves routes; recovered collisions and oscillation still replan');
