'use strict';
const assert=require('assert');
const {observeLabor,workRate,countForRate,settle,profileRate,planLabor,applyLaborPolicy,runBudgetedUpgrade,selectUpgradeBudget}=require('./labor.capacity');
const body=(name,role,work=4,carry=4)=>({name,memory:{home:'H',role,builderScope:'local'},
 body:[...Array(work).fill('work'),...Array(carry).fill('carry'),...Array(work).fill('move')],
 room:{name:'H'},store:{energy:100,getCapacity:()=>carry*50},
 getActiveBodyparts:p=>p==='work'?work:p==='carry'?carry:work});
assert.strictEqual(workRate(4,200,5,20),200/31);
assert.strictEqual(countForRate(10,[12],6),1);
assert.strictEqual(countForRate(10,[4,4,4],6),3);
let held=settle({desired:3},1,100,1);assert.strictEqual(held.desired,3);
held=settle(held,1,299,1);assert.strictEqual(held.desired,3);
held=settle(held,1,300,1);assert.strictEqual(held.desired,2);
assert.strictEqual(settle({desired:1},2,100,2).desired,2);
const stats={network:{0:{ticks:100,output:1000}},creeps:{b:{kind:'builder',bins:{0:{ticks:100,output:0,starved:60}}}}};
assert(profileRate(body('b','builder'),'builder',stats,8).rate>=6,'supply starvation does not masquerade as insufficient WORK');
const input={tick:100,stats,creeps:[body('b','builder'),body('u','upgrader',10,2),body('r','refiller',0,4)],
 buildRemaining:10000,income:30,storedEnergy:20000,deficit:500,clusters:1,
 newBuilder:body('newb','builder',6,6),newUpgrader:body('newu','upgrader',10,2),energyCapacity:1750};
const plan=planLabor(input);
assert.strictEqual(plan.refiller.desired,1,'one clump never creates overlapping owners');
assert.strictEqual(plan.refiller.carryParts,4);
assert(plan.builder.desired<=2);
assert(plan.upgrader.desired<=2);
const noBuild=planLabor({...input,buildRemaining:0});assert.strictEqual(noBuild.builder.desired,0);
const richer=planLabor({...input,income:100});assert(richer.upgradeBudget>=plan.upgradeBudget);
const worker=body('b','builder');worker.memory.task='build';worker.memory.demandLane='build';worker.memory.taskTarget='site';
const refiller=body('r','refiller',0,4);refiller.memory.task='refill';refiller.memory.taskTarget='spawn';
const room={name:'H',controller:{my:true},memory:{}};
let ready=100;const receiver={my:true,structureType:'spawn',store:{get energy(){return ready;},getFreeCapacity:()=>300-ready}};
const game={time:1,rooms:{H:room},creeps:{b:worker,r:refiller},getObjectById:id=>id==='spawn'?receiver:{}};
observeLabor({Game:game,getStructures:()=>[receiver]});
worker.store.energy=80;refiller.store.energy=50;ready=60;game.time=2;
observeLabor({Game:game,getStructures:()=>[receiver]});
assert.strictEqual(room.memory.laborStats.creeps.b.bins[0].output,20);
assert.strictEqual(room.memory.laborStats.network[0].output,90);
assert.strictEqual(room.memory.laborStats.creeps.r.bins[0].output,50);
worker.memory.energyBudgetHeld=true;worker.memory.role='upgrader';worker.memory.demandLane='upgrade';worker.memory.task='upgrade';
game.time=3;observeLabor({Game:game,getStructures:()=>[receiver]});
worker.store.energy=80;game.time=4;observeLabor({Game:game,getStructures:()=>[receiver]});
assert.strictEqual(room.memory.laborStats.creeps.b.bins[0].ticks,1);
let spent=0;const upgrader=body('u','upgrader',10,2);upgrader.pos={getRangeTo:()=>1};
upgrader.upgradeController=()=>{spent+=10;return 0;};const memory={};
for(let tick=1;tick<=100;tick++)runBudgetedUpgrade({creep:upgrader,target:{level:5},memory,tick,rate:3});
assert(spent<=300 && spent>=290,'a large upgrader obeys sustainable energy/tick instead of forcing extra income');
assert.strictEqual(selectUpgradeBudget({upgradeBudget:6.09},
 {upgradePush:true,upgradeWorkTotal:15}),15,
 'the funded operation owns the aggregate brigade upgrade budget');
assert.strictEqual(selectUpgradeBudget({upgradeBudget:6.09},
 {upgradePush:false,upgradeWorkTotal:15}),6.09,
 'ordinary labor budgeting resumes when the operation is inactive');
const policy={roles:{builder:{min:3,desired:5,max:6},upgrader:{min:1,desired:2,max:3},refiller:{min:1,desired:1,max:1}},
 remote:{minersMin:6,haulersMin:3,buildersMin:3,miners:6,haulers:7,builders:3},totals:{}};
applyLaborPolicy(policy,noBuild);
assert.strictEqual(policy.roles.builder.desired,3,
  'measured demand may not erase an independently protected minimum');
assert.strictEqual(policy.totals.desired,Object.values(policy.roles).reduce((sum,r)=>sum+r.desired,0)+16);
console.log('labor capacity, resolved output, supply limits, stable headcounts and upgrade energy budgets passed');
// A change from loading to building is attributed to the resolved build action.
const transitioning=body('transition','builder');transitioning.memory.task='withdraw';
transitioning.memory.demandLane='build';transitioning.memory.taskTarget='storage';
const otherRoom={name:'H',controller:{my:true},memory:{}};
const transitionGame={time:10,rooms:{H:otherRoom},creeps:{transition:transitioning},getObjectById:()=>({})};
observeLabor({Game:transitionGame,getStructures:()=>[]});
transitioning.memory.task='build';transitioning.memory.taskTarget='site';transitioning.store.energy=80;transitionGame.time=11;
observeLabor({Game:transitionGame,getStructures:()=>[]});
assert.strictEqual(otherRoom.memory.laborStats.creeps.transition.bins[0].output,20);
console.log('resolved output is attributed to the action that changed the store');
// Exercise the owning policy adapter, not just the arithmetic helpers.
const fs=require('fs'),vm=require('vm');
const situation=fs.readFileSync(require.resolve('./room.situation'),'utf8');
const begin=situation.indexOf('    if(buildBody && room.controller?.my)');
const end=situation.indexOf('    if (buildBody && room.controller?.my)',begin+1);
const adapter= situation.slice(begin,end);
const policy2={roles:{source:{min:1,desired:1,max:2},builder:{min:0,desired:3,max:6},
 upgrader:{min:1,desired:2,max:2},refiller:{min:1,desired:1,max:1}},
 remote:{minersMin:0,haulersMin:0,buildersMin:0,miners:0,haulers:0,builders:0},totals:{},
 budgets:{reserveFloor:3500},permissions:{optionalConstruction:true}};
const adaptedRoom={name:'H',memory:{},controller:{my:true,ticksToDowngrade:10000},energyCapacityAvailable:1750};
const sourceMiner=body('miner','harvester',6,2);sourceMiner.memory.preferredSource='S';
const factory=require('./body.factory').createBodyFactory({WORK:'work',CARRY:'carry',MOVE:'move',
 BODYPART_COST:{work:100,carry:50,move:50}});
vm.runInNewContext(adapter,{buildBody:factory.buildBody,room:adaptedRoom,
 Game:{time:100,creeps:{miner:sourceMiner,b:body('b','builder')}},
 hasLocalReplacementLife:()=>true,sources:[{id:'S',energyCapacity:3000}],
 ENERGY_REGEN_TIME:300,roadsPaused:()=>false,structures:[],STRUCTURE_SPAWN:'spawn',
 STRUCTURE_EXTENSION:'extension',STRUCTURE_CONTAINER:'container',RESOURCE_ENERGY:'energy',
 policy:policy2,buildRemaining:2000,repairRemaining:0,storedEnergy:20000,
 controllerWorkSpots:2,sites:[],sourceDistances:[10],planLabor,applyLaborPolicy,workRate,
 applyOperationPolicy:require('./colony.operations').applyOperationPolicy});
assert(adaptedRoom.memory.laborPlan);
assert.strictEqual(policy2.roles.builder.desired,1);
assert.strictEqual(policy2.roles.refiller.desired,1);
console.log('room policy consumes the math plan and publishes bounded staffing targets');
const {runBudgetedWork}=require('./labor.capacity');
let built=0;const builder=body('budgetb','builder');builder.pos={getRangeTo:()=>1};
const constructionMemory={};
for(let tick=1;tick<=100;tick++)runBudgetedWork({creep:builder,target:{},memory:constructionMemory,
 tick,rate:5,cost:20,action:()=>{built+=20;return 0;}});
assert.strictEqual(built,500);
assert.strictEqual(builder.memory.energyBudgetReason,'construction spending budget');
assert.strictEqual(policy2.roles.builder.min,0,
  'measured construction throughput remains desired work, not a survival floor');
console.log('construction spending sets desired capacity without inventing a minimum');
const burstPlan=planLabor({...input,tick:101,previous:plan,deficit:1500});
assert.strictEqual(burstPlan.refiller.carryParts,plan.refiller.carryParts,
 'one refill burst must not immediately replace a healthy specialist');
console.log('refiller body sizing is damped across transient demand bursts');
const {reconcileLaborBody}=require('./labor.capacity');
const repurposed=body('stationary','upgrader',6,2);repurposed.memory.bodyType='miner';
assert(reconcileLaborBody(repurposed));assert.strictEqual(repurposed.memory.bodyType,'controller');
const activeMiner=body('source','harvester',6,2);activeMiner.memory.bodyType='miner';
assert(!reconcileLaborBody(activeMiner));assert.strictEqual(activeMiner.memory.bodyType,'miner');
console.log('a capable repurposed upgrader can execute its assigned lane while miners retain source ownership');

const correctedSizing=planLabor({...input,tick:300,previous:{...plan,refiller:{...plan.refiller,carryParts:15,sizing:{desired:15}}}});
assert.strictEqual(correctedSizing.refiller.carryParts,4,'an unbuilt burst-based upsize must not replace an adequate active body');
console.log('sustained refill demand sizes the owner; burst deficits stay temporary');
const spawnSource=fs.readFileSync(require.resolve('./main'),'utf8')
 .replace(/\r\n/g,'\n');
const startStaff=spawnSource.indexOf('      if (staffingJob) {');
const staffingEndMarker='        assignment.minimumGap = assignment.emergencyDefense ||\n          assignment.emergencyPresence ||\n          staffingJob.coverageCount < staffingJob.min;\n      }';
const endStaff=spawnSource.indexOf(staffingEndMarker,startStaff)+staffingEndMarker.length;
const staffingBlock=spawnSource.slice(startStaff,endStaff);
const remoteAssignment={};
vm.runInNewContext(staffingBlock,{assignment:remoteAssignment,jobKey:'remoteBuilder',
 staffingJob:{count:5,coverageCount:3,min:3,desired:5}});
assert.strictEqual(remoteAssignment.staffingCurrent,5);
assert.strictEqual(remoteAssignment.staffingTarget,5);
const clusterAssignment={};
vm.runInNewContext(staffingBlock,{assignment:clusterAssignment,jobKey:'refiller',
 staffingJob:{count:2,coverageCount:1,min:1,desired:1}});
assert.strictEqual(clusterAssignment.staffingCurrent,1,'duplicate bodies do not invent another owned refill clump');
console.log('spawn sizing uses creep counts for remote rosters and coverage units for clump ownership');
const currentMain=fs.readFileSync(require.resolve('./main'),'utf8');
const localMinimumIndex=currentMain.indexOf(
 '    const minimumPlan = planMinimumSpawn({');
const remoteReplacementIndex=currentMain.indexOf(
 '    const expiringRemoteMiner =');
const remoteRecoveryIndex=currentMain.indexOf(
 '    const establishedHaulRequest =');
assert(localMinimumIndex>=0&&localMinimumIndex<remoteReplacementIndex,
 'all local minimums precede remote miner replacement');
assert(localMinimumIndex<remoteRecoveryIndex,
 'all local minimums precede remote hauling recovery');
console.log('one priority order protects every local minimum before remote staffing');
const lowerDemand=planLabor({...input,tick:301,buildRemaining:1000,
 previous:{...plan,builder:{desired:4,changed:100}},creeps:[body('one','builder',6,6),body('u','upgrader',10,2),body('r','refiller',0,4)]});
assert.strictEqual(lowerDemand.builder.desired,1,'damping may retain living workers, never spawn phantom capacity from an old target');
console.log('decreasing demand never spawns missing workers to preserve an obsolete target');
const single=planLabor({...input,controllerDanger:true,controllerSpots:8,previous:{upgrader:{desired:2,changed:1}},creeps:[body('a','upgrader',3,3),body('b','upgrader',3,3)]});
assert.strictEqual(single.upgrader.desired,1,'explicit one-upgrader policy takes effect immediately');
assert(single.upgrader.workParts>=plan.upgrader.workParts,'capacity grows in the body instead of extra headcount');
