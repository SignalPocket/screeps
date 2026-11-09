'use strict';
const assert=require('assert');
const {dispatchEmergencyRepairs}=require('./outpost.rescue');
const donor=(name,e)=>({name,room:{name:'H'},memory:{home:'H',role:'hauler',birthRole:'builder'},
 ticksToLive:1000,store:{energy:e},getActiveBodyparts:p=>p==='work'||p==='carry'?3:3});
const a=donor('a',150),b=donor('b',100),miners={name:'miner',room:{name:'H'},memory:{home:'H',role:'harvester'},
 ticksToLive:1000,store:{energy:50},getActiveBodyparts:()=>6};
const home={name:'H',controller:{my:true},memory:{southSurvey:{active:true,targetRoom:'R'}}};
const remote={name:'R',memory:{builderCapacityPlan:{desired:1}}};
const game={rooms:{H:home,R:remote},creeps:{a,b,miners}};
const targets=[{structureType:'container',hits:20000,hitsMax:250000}];
const rescueRoster=[a,b,miners],rescueRooms=[home,remote];
const rescueOrder=rescueRoster.map(creep=>creep.name);
let assigned=dispatchEmergencyRepairs({Game:{rooms:game.rooms,creeps:{}},creeps:rescueRoster,rooms:rescueRooms,getStructures:()=>targets,isRoadMobile:()=>true});
assert.strictEqual(assigned.length,2);assert.strictEqual(a.memory.role,'builder');
assert.strictEqual(a.memory.emergencyRepairRoom,'R');assert.strictEqual(home.memory.southSurvey.remoteBuilderTarget,2);
assert.strictEqual(miners.memory.role,'harvester');
assert.strictEqual(dispatchEmergencyRepairs({Game:{rooms:game.rooms,creeps:{}},creeps:rescueRoster,rooms:rescueRooms,getStructures:()=>targets,isRoadMobile:()=>true}).length,0);
assert.deepStrictEqual(rescueRoster.map(creep=>creep.name),rescueOrder,
 'emergency repair dispatch does not mutate supplied roster order');
const {createCreepLifecycle}=require('./creep.lifecycle');
const life=createCreepLifecycle({Game:{},WORK:'work',MOVE:'move',CREEP_SPAWN_TIME:3});
const worker={body:['work','work','work','carry','carry','carry','move','move','move'],getActiveBodyparts:p=>3};
assert(life.hasBuilderBody(worker),'the spawned recovery builder stays eligible for its roster');
console.log('emergency repair assignments are protected, bounded, repeat-safe and preserve source miners');
