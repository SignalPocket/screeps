'use strict';
const assert=require('assert');
const {createBodyFactory}=require('./body.factory');
const {createSpawnPolicy}=require('./spawn.policy');
const constants={WORK:'work',CARRY:'carry',MOVE:'move',ATTACK:'attack',
 RANGED_ATTACK:'ranged_attack',HEAL:'heal',CLAIM:'claim',TOUGH:'tough',
 BODYPART_COST:{work:100,carry:50,move:50,attack:80,ranged_attack:150,heal:250,claim:600,tough:10}};
const factory=createBodyFactory(constants);
const cost=b=>b.reduce((n,p)=>n+constants.BODYPART_COST[p],0);
for(const role of ['hauler','refiller','rebalancer','upgrader','builder','defender']){
 const routine=factory.buildBody(role,1750);
 const large=factory.buildBody(role,1750,{maximize:true});
 assert(cost(large)>=cost(routine),role+' may use its bounded full budget');
 assert(cost(large)<=700,role+' respects the colony body-energy ceiling');
 const max=factory.buildBody(role,12900,{maximize:true});
 assert(max.length<=50,role+' respects body part limit');
 if(['hauler','refiller','rebalancer'].includes(role))assert(!large.includes('work'));
 if(role==='builder')assert(large.filter(p=>p==='move').length*2>=large.filter(p=>p!=='move').length);
 if(role==='defender'){
  assert(large.includes('attack') && !large.includes('work'));
  assert(large.filter(part=>part==='carry').length>=2,
   'a funded defender retains a useful payload for post-war brigade work');
 }
}
for(const role of ['miner','harvester','remote-miner','controller-relay']){
 assert.deepStrictEqual(factory.buildBody(role,1750,{maximize:true}),factory.buildBody(role,1750));
}
const game={time:100};
const policy=createSpawnPolicy({Game:game,buildBody:factory.buildBody,...constants});
const miner={memory:{role:'harvester'},getActiveBodyparts:()=>1};
const request=(current,target,minimumGap=false)=>policy.prepareSpawnRequest({
 spawn:{room:{memory:{},energyAvailable:1750,energyCapacityAvailable:1750,
 controller:{ticksToDowngrade:10000}}},
 assignment:{role:'hauler',forceSpawn:true,staffingCurrent:current,
 staffingTarget:target,minimumGap},workers:[miner],workerLimit:10,hasWorkParts:()=>true});
assert.strictEqual(cost(request(1,2).body),700);
assert.strictEqual(cost(request(1,1).body),700);
assert(cost(request(1,7).body)<=700,'large rosters keep bounded recovery sizing');
assert(cost(request(0,1,true).body)<=700,'missing essential coverage remains prompt');
const fundedBelowRoomCapacity=policy.prepareSpawnRequest({
 spawn:{room:{memory:{},energyAvailable:1200,energyCapacityAvailable:1800,
 controller:{ticksToDowngrade:10000}}},
 assignment:{role:'builder',builderScope:'outpost',forceSpawn:true,
  staffingCurrent:8,staffingTarget:10,minimumGap:true},
 workers:[miner],workerLimit:10,hasWorkParts:()=>true});
assert(fundedBelowRoomCapacity.body,
 'a funded 700-energy body starts immediately without waiting for 1800');
assert.strictEqual(cost(fundedBelowRoomCapacity.body),600);
const emergencyDefender=policy.prepareSpawnRequest({
 spawn:{room:{memory:{},energyAvailable:300,energyCapacityAvailable:300,
  controller:{ticksToDowngrade:10000}}},
 assignment:{role:'defender',forceSpawn:true,emergencyDefense:true,
  minimumGap:true,staffingCurrent:0,staffingTarget:1},
 workers:[miner],workerLimit:1,hasWorkParts:()=>true});
assert(emergencyDefender.needsWorker,
 'an active-threat defender must exceed the normal population cap');
assert(emergencyDefender.body.includes('attack'),
 'a defender spawns as soon as its minimum combat body is funded');
assert.strictEqual(emergencyDefender.body.filter(part=>part==='carry').length,2,
 'the minimum emergency defender carries a brigade-sized payload');
const combatOnlyDefender=factory.buildBody('defender',150);
assert(combatOnlyDefender.includes('attack') &&
 !combatOnlyDefender.includes('carry'),
 'a low-energy emergency still gets a combat body when the relay payload is unaffordable');
const emergencyPresence=policy.prepareSpawnRequest({
 spawn:{room:{memory:{},energyAvailable:300,energyCapacityAvailable:300,
  controller:{ticksToDowngrade:10000}}},
 assignment:{role:'remote-miner',forceSpawn:true,emergencyPresence:true,
  minimumGap:true,staffingCurrent:0,staffingTarget:1},
 workers:[miner],workerLimit:1,hasWorkParts:()=>true});
assert(emergencyPresence.needsWorker && emergencyPresence.body,
 'an empty active outpost gets a worker even at the population cap');
console.log('small specialist rosters may use larger bodies; emergency and source limits preserved');
