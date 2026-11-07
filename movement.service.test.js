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
