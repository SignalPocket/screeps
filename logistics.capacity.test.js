'use strict';
const assert = require('assert');
const { planHaulCapacity, observeHaulTrip } = require('./logistics.capacity');
const lane = (overrides = {}) => ({production:5,backlog:0,roundTripTicks:100,...overrides});
let p=planHaulCapacity({lanes:[lane()],carriers:[],newCapacity:550});
assert.strictEqual(p.target,2,'550 cargo at 100 ticks with delays cannot sustain 5/tick alone');
const full=planHaulCapacity({lanes:[lane(),lane()],carriers:[{slot:0,capacity:800},{slot:1,capacity:800}],newCapacity:800});
const weak=planHaulCapacity({lanes:[lane(),lane()],carriers:[{slot:0,capacity:800},{slot:1,capacity:150}],newCapacity:800});
assert.strictEqual(full.target,2);assert.strictEqual(weak.target,3);
assert.strictEqual(weak.slotSources[2],1,'extra capacity goes to the weak source lane');
assert.strictEqual(weak.lanes[1].actualRate,150*.85/100);
const slow=planHaulCapacity({lanes:[lane({roundTripTicks:200})],carriers:[],newCapacity:550});
assert(slow.target>p.target,'observed slower trips increase required capacity');
const backlog=planHaulCapacity({lanes:[lane({backlog:999999})],carriers:[],newCapacity:550});
assert.strictEqual(backlog.lanes[0].requiredRate,7.5,'drain surge is capped at half ongoing production');
assert(backlog.target<=6);
const overlap=planHaulCapacity({lanes:[lane()],carriers:[{slot:0,capacity:150},{slot:0,capacity:550}],newCapacity:550});
assert.strictEqual(overlap.lanes[0].actualRate,550*.85/100,'replacement overlap is not double capacity');
const memory={};
const creep={memory:{role:'remote-hauler',home:'HOME',remoteRoom:'REMOTE',remoteHaulerSlot:0},
 room:{name:'HOME'},store:{energy:0,getCapacity:()=>550}};
const observe=tick=>observeHaulTrip({creep,homeMemory:memory,tick});
observe(1);creep.room.name='REMOTE';observe(50);
creep.store.energy=400;creep.memory.remoteCargoOrigin='REMOTE';observe(60);
creep.room.name='HOME';observe(100);
assert.strictEqual(memory.haulTripStats,undefined,'arrival alone is not completed delivery');
creep.store.energy=0;observe(105);
assert.strictEqual(memory.haulTripStats.REMOTE.slots[0].roundTripTicks,104);
assert.strictEqual(memory.haulTripStats.REMOTE.slots[0].outboundTicks,59);
assert.strictEqual(memory.haulTripStats.REMOTE.slots[0].samples,1);
assert.strictEqual(creep.memory.haulTrip,undefined);
const incomplete={memory:{role:'remote-hauler',home:'HOME',remoteRoom:'REMOTE'},
 room:{name:'REMOTE'},store:{energy:400,getCapacity:()=>550}};
observeHaulTrip({creep:incomplete,homeMemory:{},tick:10});
assert.strictEqual(incomplete.memory.haulTrip,undefined,'startup cargo cannot invent a full trip');
console.log('capacity math, weak carriers, targeted drain, overlap and completed-trip measurements passed');
// Integration: incomplete searches are estimates; observed complete trips win.
const { createRemoteHauling }=require('./remote.hauling');
const source={id:'source',energyCapacity:1500,pos:{x:10,y:10,getRangeTo:()=>1}};
const store={id:'container',structureType:'container',store:{energy:1000,getCapacity:()=>2000}};
source.pos.findInRange=()=>[store];
const home={name:'HOME',memory:{},energyCapacityAvailable:1750,energyAvailable:1750,
 find:()=>[{pos:{x:20,y:20}}]};
const remote={memory:{},find:type=>type==='sources'?[source]:[store]};
const game={time:2000,rooms:{HOME:home,REMOTE:remote},creeps:{},
 map:{getRoomLinearDistance:()=>1,findRoute:()=>[{},{}]}};
const hauling=createRemoteHauling({Game:game,PathFinder:{search:()=>({path:Array(24),incomplete:true})},
 buildBody:()=>Array(11).fill('carry'),FIND_SOURCES:'sources',FIND_STRUCTURES:'structures',
 FIND_MY_SPAWNS:'spawns',STRUCTURE_CONTAINER:'container',RESOURCE_ENERGY:'energy',
 CARRY:'carry',CARRY_CAPACITY:50,ENERGY_REGEN_TIME:300});
hauling.getRemoteHaulerTarget('HOME','REMOTE');
assert.strictEqual(home.memory.remoteHaulRoutes.REMOTE.routeLengths[0],100);
assert.strictEqual(home.memory.remoteHaulRoutes.REMOTE.lanes[0].basis,'path estimate');
home.memory.haulTripStats={REMOTE:{slots:{0:{sourceId:'source',updated:2000,
 roundTripTicks:300,outboundTicks:150,loadRatio:.8,samples:1}}}};
hauling.getRemoteHaulerTarget('HOME','REMOTE');
assert.strictEqual(home.memory.remoteHaulRoutes.REMOTE.lanes[0].basis,'observed');
assert.strictEqual(home.memory.remoteHaulRoutes.REMOTE.lanes[0].roundTripTicks,300);
const {createCreepLifecycle}=require('./creep.lifecycle');
const lifecycleGame={...game,spawns:{busy:{room:{name:'HOME'},spawning:{remainingTime:60}}}};
const lifecycle=require('./creep.lifecycle').createCreepLifecycle({Game:lifecycleGame,WORK:'work',MOVE:'move',CREEP_SPAWN_TIME:3});
const miner={memory:{home:'HOME',remoteRoom:'REMOTE'},room:{name:'REMOTE'},body:Array(6),ticksToLive:400};
assert.strictEqual(lifecycle.getRemoteReplacementLead(miner),378);
home.memory.haulTripStats.REMOTE.slots[0].outboundTicks=250;
assert.strictEqual(lifecycle.getRemoteReplacementLead(miner),478);
assert(!lifecycle.hasRemoteReplacementLife(miner));
console.log('incomplete paths, observed timing and queued replacement deadlines passed');
const slowHomeMiner={memory:{role:'harvester',home:'HOME',preferredSource:'local'},
 room:{name:'HOME'},body:[...Array(11).fill('work'),'carry','move','move'],
 getActiveBodyparts:part=>part==='move'?2:11,ticksToLive:250};
home.memory.roadPlan={paths:[{targetId:'local',points:Array(40)}]};
assert.strictEqual(lifecycle.getLocalReplacementLead(slowHomeMiner),272,
 'home miners include spawn time, road speed, travel and the current queue');
assert(!lifecycle.hasLocalReplacementLife(slowHomeMiner));
console.log('home source replacement protects travel and spawn-queue time too');
