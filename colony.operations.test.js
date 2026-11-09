'use strict';
const assert = require('assert');
const { applyOperationPolicy, finalizeOperationPolicy, retireCompletedPush,
  isBrigadePlanActive, adoptBalancers, adoptDefenders, reactivateDefenders,
  adoptSurplusHaulerForLink } =
  require('./colony.operations');
const { applyScenarioPolicy } = require('./scenario.policy');
const { applySpawnCapacityBudget } = require('./spawn.capacity');
const { calculatePopulationTotals } = require('./population.totals');
const { getReservationCoverage, planReservationSpawn, runReservation } = require('./remote.reservation');
const { reconcileCreepAssignment } = require('./creep.assignment');
const { authorizeSpawnAssignment } = require('./spawn.authority');
const { createBodyFactory } = require('./body.factory');
const { createSpawnPolicy } = require('./spawn.policy');
const { planControllerRelief, enforceSingleUpgrader, reconcileControllerRelief } = require('./role.capacity');
const constants={WORK:'work',CARRY:'carry',MOVE:'move',CLAIM:'claim',BODYPART_COST:{work:100,carry:50,move:50,claim:600}};
const {buildBody}=createBodyFactory(constants);
const makeRoom=()=>({name:'W7N4',memory:{leftSurvey:{active:true,targetRoom:'W8N4'},southSurvey:{active:true,targetRoom:'W7N3'},southwestSurvey:{active:true,targetRoom:'W8N3'},controllerBrigadePlan:{segments:Array(16).fill({})},laborPlan:{upgrader:{desired:1,workParts:15}}},controller:{my:true,level:5,owner:{username:'ginaria'}},storage:{store:{energy:350000}},energyCapacityAvailable:1800});
const makePolicy=()=>({health:'healthy',roles:{source:{min:2,desired:2,max:2},upgrader:{min:1,desired:1,max:2,reason:'base'}},permissions:{remoteMaintenance:true,controllerBrigade:false},budgets:{reserveFloor:3600},remote:{minersMin:6,miners:6,haulersMin:3,haulers:20,buildersMin:3,builders:3}});
const defenderRoom={name:'W1N1',memory:{}};
const makeDefender=(name,carry,move,extra={})=>({name,spawning:false,ticksToLive:200,
 memory:{home:'W1N1',role:'defender',defenseTargetRoom:'W1N2',
  task:'defend',taskTarget:'hostile',...extra},
 getActiveBodyparts:part=>part==='carry'?carry:part==='move'?move:1});
const recoveredDefender=makeDefender('recovered',2,2);
const partialDefender=makeDefender('partial',1,1);
const combatOnlyDefender=makeDefender('combat-only',0,2);
const stillNeededDefender=makeDefender('still-needed',2,2);
const defenderGame={time:120,creeps:{recovered:recoveredDefender,
 partial:partialDefender,'combat-only':combatOnlyDefender,
 'still-needed':stillNeededDefender}};
const defenderPlan={segments:[{},{}]};
assert.deepStrictEqual(adoptDefenders(defenderRoom,defenderGame,
 defenderPlan,true),[],'active war keeps the temporary defenders in combat role');
const defenderAdoptions=adoptDefenders(defenderRoom,defenderGame,
 defenderPlan,false,creep=>creep.name!=='still-needed');
assert.deepStrictEqual(defenderAdoptions,[
 {creep:'recovered',slot:0},{creep:'partial',slot:1}
],'post-war conversion uses only eligible survivors and fills open relay slots');
assert.strictEqual(recoveredDefender.memory.role,'controller-relay');
assert.strictEqual(recoveredDefender.memory.birthRole,'controller-relay');
assert.strictEqual(recoveredDefender.memory.defenseTargetRoom,undefined);
assert.strictEqual(combatOnlyDefender.memory.role,'defender',
 'attackers without a surviving carry part cannot join the brigade');
assert.strictEqual(stillNeededDefender.memory.role,'defender',
 'a defender whose target remains hostile is not adopted');
const reassignedDefender = {
  name: 'former-defender', spawning: false, ticksToLive: 300,
  room: { name: 'W1N2' },
  memory: { home: 'W1N1', role: 'hauler', birthRole: 'defender',
    bodyType: 'defender', defenseTargetRoom: 'W1N2',
    controllerRelaySlot: 4 }
};
const defenderRecovery = reactivateDefenders({ time: 121, creeps: {
  former: reassignedDefender
}}, ['W1N2']);
assert.deepStrictEqual(defenderRecovery, [{ creep: 'former-defender',
  targetRoom: 'W1N2', from: 'hauler' }],
'an attacked outpost reactivates one reassigned combat body immediately');
assert.strictEqual(reassignedDefender.memory.role, 'defender');
assert.strictEqual(reassignedDefender.memory.controllerRelaySlot, undefined,
  'a reactivated defender cannot be forced back into brigade work next tick');
let room=makeRoom(), policy=makePolicy();
const Game={time:100,gcl:{level:1},cpu:{bucket:9000},creeps:{},rooms:{},spawns:{},map:{findRoute:()=>[{}]}};Game.rooms.W7N4=room;
applyOperationPolicy(policy,room,Game);
assert.strictEqual(policy.operations.upgradePush,true);assert.strictEqual(policy.remote.reserversMin,3);
applySpawnCapacityBudget(policy,{source:24,remoteMiner:18,remoteHauler:36,remoteBuilder:27,remoteReserver:12},{auxiliaryLoad:144});
assert.strictEqual(policy.spawnCapacity.auxiliaryLoad,144);
assert(policy.spawnCapacity.minimumLoad>=144+135,'short-lived reservation replacement is charged');
applyScenarioPolicy(policy,[{key:'active-attack'}]);finalizeOperationPolicy(policy,room,Game);
assert.strictEqual(isBrigadePlanActive(room),false);assert.strictEqual(policy.remote.reserversMin,0,'no new reservations during home attack');
room=makeRoom();policy=makePolicy();Game.rooms.W7N4=room;applyOperationPolicy(policy,room,Game);
applyScenarioPolicy(policy,[{key:'assignment-instability'}]);finalizeOperationPolicy(policy,room,Game);
assert.strictEqual(policy.permissions.controllerBrigade,false,'assignment instability pauses brigade replacement');
assert.strictEqual(policy.operations.upgradePush,true,'assignment instability does not dismantle the funded upgrade situation');
assert.strictEqual(policy.roles.upgrader.desired,3,'the selected situation retains its upgrader count');
room=makeRoom();room.memory.controllerBrigadePlan.segments=[];
policy=makePolicy();policy.roles.upgrader={min:1,desired:2,max:2,reason:'base'};
policy.remote.haulers=policy.remote.haulersMin;
Game.rooms.W7N4=room;Game.cpu.bucket=9000;
applyOperationPolicy(policy,room,Game);
assert.strictEqual(policy.operations.upgradePush,false,
  'an unavailable brigade preserves the ordinary upgrader target');
assert.strictEqual(policy.remote.reserversMin,3,
  'the ordinary policy still augments the remote schema with reservers');
applySpawnCapacityBudget(policy,{source:24,upgrader:300,remoteMiner:18,
 remoteHauler:36,remoteBuilder:27,remoteReserver:12},
{lifetime:1600,utilization:0.5});
assert.strictEqual(policy.roles.upgrader.desired,1,
  'spawn capacity contracts the optional upgrader before finalization');
applyScenarioPolicy(policy,[{key:'active-attack'}]);
assert.deepStrictEqual(policy.totals,calculatePopulationTotals(policy),
  'scenario totals match the contracted role and augmented remotes');
finalizeOperationPolicy(policy,room,Game);
assert.strictEqual(policy.roles.upgrader.desired,2,
  'hard-stop finalization restores the ordinary role without changing policy');
assert.strictEqual(policy.remote.reserversMin,0,
  'hard-stop finalization suspends reservation staffing');
assert.deepStrictEqual(policy.totals,{min:15,desired:16,max:16});
assert.deepStrictEqual(policy.totals,calculatePopulationTotals(policy),
  'final totals refresh after both role restoration and reserver suspension');
room=makeRoom();policy=makePolicy();Game.rooms.W7N4=room;Game.cpu.bucket=500;
applyOperationPolicy(policy,room,Game);assert.strictEqual(policy.operations.upgradePush,false);assert.strictEqual(policy.remote.reservers,0);
Game.cpu.bucket=9000;room.storage.store.energy=4000;applyOperationPolicy(policy,room,Game);assert.strictEqual(policy.operations.upgradePush,false);
room.storage.store.energy=350000;applyOperationPolicy(policy,room,Game);
room=makeRoom();delete room.memory.leftSurvey;delete room.memory.southSurvey;delete room.memory.southwestSurvey;policy=makePolicy();Game.rooms.W7N4=room;
applyOperationPolicy(policy,room,Game);assert.strictEqual(policy.remote.reservers,3,
  'temporary survey loss does not dismantle established reservation coverage');
room=makeRoom();policy=makePolicy();Game.rooms.W7N4=room;applyOperationPolicy(policy,room,Game);
const staffingPlan={jobs:{remoteReserver:{key:'remoteReserver',min:3,coverageCount:0}},minimumGap:{role:'remoteReserver'}};
let request=planReservationSpawn({room,workers:[],policy,staffingPlan,Game});assert.strictEqual(request.remoteRoom,'W8N4');
request=planReservationSpawn({room,workers:[],policy,
  staffingPlan:{jobs:staffingPlan.jobs,minimumGap:null},Game});
assert.strictEqual(request.remoteRoom,'W8N4',
  'an uncovered reservation lane is refilled when local staffing is complete');
Game.rooms.W8N4={controller:{reservation:{username:'ginaria',ticksToEnd:900}}};
Game.rooms.W8N3={controller:{reservation:{username:'ginaria',ticksToEnd:40}}};
request=planReservationSpawn({room,workers:[],policy,staffingPlan,Game,urgentOnly:true});
assert.strictEqual(request.remoteRoom,'W8N3','an expiring reservation is selected before healthy coverage');
assert.strictEqual(request.reservationDeadline,40);
Game.rooms.W8N3.controller.reservation.ticksToEnd=250;
request=planReservationSpawn({room,workers:[],policy,staffingPlan,Game,urgentOnly:true});
assert.strictEqual(request.remoteRoom,'W8N3',
  'reservation recovery starts before the observed short route estimate can lapse');
Game.rooms.W8N3.controller.reservation.ticksToEnd=40;
policy.remote.reserversMin=0;
request=planReservationSpawn({room,workers:[],policy,staffingPlan,Game,
  urgentOnly:true});
assert.strictEqual(request.remoteRoom,'W8N3',
  'an expiring established reservation survives a recovering roster pause');
assert.strictEqual(request.staffingTarget,3);
policy.health='critical';
request=planReservationSpawn({room,workers:[],policy,staffingPlan,Game,
  urgentOnly:true});
assert.strictEqual(request.remoteRoom,'W8N3',
  'an established reservation is still planned until home baseline authority rejects it');
policy.health='healthy';
policy.remote.reserversMin=3;
request=planReservationSpawn({room,workers:[],policy,
  staffingPlan:{...staffingPlan,baselineGap:{role:'source'}},Game,urgentOnly:true});
assert.strictEqual(request.remoteRoom,'W8N3','an expiring reservation is planned despite a recoverable baseline gap');
delete Game.rooms.W8N4;delete Game.rooms.W8N3;
request=planReservationSpawn({room,workers:[],policy,staffingPlan,
  Game,urgentOnly:true});
assert.strictEqual(request.remoteRoom,'W8N4',
  'an uncovered active outpost without vision remains an urgent reservation lane');
assert.strictEqual(request.reservationDeadline,0);
assert(authorizeSpawnAssignment({assignment:request,staffingPlan}).authorized);
assert(!authorizeSpawnAssignment({assignment:{role:'controller-relay'},staffingPlan}).authorized);
assert(!authorizeSpawnAssignment({assignment:request,
  staffingPlan:{...staffingPlan,baselineGap:{role:'source'}}}).authorized,
  'remote reservation recovery cannot outrank a collapsed home baseline');
const reserved={name:'reserve1',spawning:false,ticksToLive:500,body:[],memory:{home:'W7N4',role:'remote-reserver',assignmentRole:'remote-reserver',remoteHome:'W7N4',remoteRoom:'W8N4'},getActiveBodyparts:p=>p==='claim'?2:2};
reconcileCreepAssignment(reserved);assert.strictEqual(reserved.memory.remoteRoom,'W8N4');
assert.strictEqual(getReservationCoverage(room,[reserved],policy,Game).count,1);
request=planReservationSpawn({room,workers:[reserved],policy,staffingPlan,Game});assert.strictEqual(request.remoteRoom,'W7N3');
reserved.ticksToLive=20;const relief={...reserved,name:'relief',spawning:true};
request=planReservationSpawn({room,workers:[reserved,relief],policy,staffingPlan,Game});assert.strictEqual(request.remoteRoom,'W7N3','no third replacement for the first room');
assert.strictEqual(buildBody('remote-reserver',1299),null);assert.deepStrictEqual(buildBody('remote-reserver',1300),['claim','claim','move','move']);
assert.strictEqual(buildBody('upgrader',1799,{operationWork:15}),null);assert.strictEqual(buildBody('upgrader',1800,{operationWork:15}).filter(p=>p==='work').length,15);
const spawnPolicy=createSpawnPolicy({Game,buildBody,...constants});
const spawn={room:{memory:{},energyAvailable:1300,energyCapacityAvailable:1800,controller:{ticksToDowngrade:70000}}};
const spawnResult=spawnPolicy.prepareSpawnRequest({spawn,assignment:{role:'remote-reserver',spawnBodyRole:'remote-reserver',forceSpawn:true,minimumEnergy:1300},workers:[{memory:{role:'harvester'},getActiveBodyparts:()=>5}],workerLimit:10,hasWorkParts:()=>true});
assert.deepStrictEqual(spawnResult.body,['claim','claim','move','move'],'functional reservation body bypasses only its own routine cap');
const old={name:'old',memory:{home:'W7N4',role:'upgrader'},room:{name:'W7N4',controller:room.controller},pos:{getRangeTo:()=>1},getActiveBodyparts:p=>p==='work'?4:2};
const consumer=planControllerRelief({room,workers:[old],operationWork:15});assert.strictEqual(consumer.qualityFor,'old');
const newer={...old,name:'new',memory:{home:'W7N4',role:'upgrader',qualityFor:'old'},pos:{getRangeTo:()=>20},getActiveBodyparts:p=>p==='work'?15:2};
Game.creeps={old,new:newer};enforceSingleUpgrader({Game,isRoadMobile:()=>true});assert.strictEqual(old.memory.role,'upgrader');assert.strictEqual(newer.memory.qualityFor,'old');
newer.pos.getRangeTo=()=>3;reconcileControllerRelief({Game,isRoadMobile:()=>true});enforceSingleUpgrader({Game,isRoadMobile:()=>true});assert.strictEqual(old.memory.role,'builder');assert.strictEqual(newer.memory.role,'upgrader');
let claimed=0,attacked=0,reserves=0,moves=0;
const controller={id:'neutral',reservation:{username:'ginaria',ticksToEnd:123}};const targetRoom={name:'W8N4',controller,find:()=>[]};Game.rooms.W8N4=targetRoom;
const creep={...reserved,memory:{home:'W7N4',role:'remote-reserver',remoteRoom:'W8N4'},room:targetRoom,owner:{username:'ginaria'},reserveController:()=>{reserves++;return 0;},claimController:()=>claimed++,attackController:()=>attacked++};
const args={creep,Game,move:()=>moves++,RoomPosition:class{constructor(x,y,roomName){Object.assign(this,{x,y,roomName});}},OK:0,ERR_NOT_IN_RANGE:-9,FIND_HOSTILE_CREEPS:1};
assert(runReservation(args));assert.strictEqual(reserves,1);assert.strictEqual(room.memory.reservationStatus.W8N4.ticksToEnd,123,'reservation status records the live expiry window');controller.owner={username:'other'};assert(runReservation(args));assert.strictEqual(reserves,1);assert.strictEqual(claimed,0);assert.strictEqual(attacked,0);
delete controller.owner;targetRoom.find=()=>[{}];assert(runReservation(args));targetRoom.find=()=>[];assert(runReservation(args));assert.strictEqual(reserves,1,'retreat has a release interval, not one-tick oscillation');
Game.gcl.level=2;const relay={memory:{home:'W7N4',role:'controller-relay',birthRole:'controller-relay',controllerRelaySlot:0}};Game.creeps={relay};
retireCompletedPush(Game);assert.strictEqual(relay.memory.role,'retire');assert.strictEqual(relay.memory.controllerRelaySlot,undefined);assert.strictEqual(isBrigadePlanActive(room),false);
applyOperationPolicy(policy,room,Game);assert.strictEqual(policy.operations.upgradePush,false);assert.strictEqual(policy.remote.reservers,3,'reservations continue after the GCL push');
Game.gcl.level=1;room=makeRoom();Game.rooms.W7N4=room;policy=makePolicy();policy.roles.rebalancer={min:1,desired:1,max:2};applyOperationPolicy(policy,room,Game);
const bal={name:'BAL',memory:{home:'W7N4',role:'rebalancer',sourceReserve:'protected-source'},getActiveBodyparts:()=>7};
const surplusBal={name:'BAL2',memory:{home:'W7N4',role:'rebalancer',sourceReserve:'old-source',dispatchCommitment:{},workJob:{},controllerRelaySubstituteSlot:0},getActiveBodyparts:()=>7};
const real={name:'BRIG1',spawning:true,memory:{home:'W7N4',role:'controller-relay',controllerRelaySlot:0}};
Game.creeps={bal,surplusBal,real};const adopted=adoptBalancers(room,Game,policy);assert.strictEqual(adopted.length,1);assert.strictEqual(bal.memory.role,'rebalancer','one dedicated link feeder remains protected');assert.strictEqual(surplusBal.memory.controllerRelaySlot,1,'a spawning real relay owns its slot');assert.strictEqual(surplusBal.memory.role,'controller-relay');assert.strictEqual(surplusBal.memory.sourceReserve,undefined);assert.strictEqual(surplusBal.memory.dispatchCommitment,undefined);assert.strictEqual(surplusBal.memory.workJob,undefined);assert.strictEqual(surplusBal.memory.controllerRelaySubstituteSlot,undefined);assert.strictEqual(policy.roles.rebalancer.desired,1,'the controller-link feeder remains funded');assert.strictEqual(adoptBalancers(room,Game,policy).length,0,'conversion is repeat-safe');
room.memory.controllerBrigadePlan={segments:[{},{}],linkSlot:1};policy.roles.hauler={min:1,desired:1,max:3};
const coreHauler={name:'LC1',ticksToLive:1200,memory:{home:'W7N4',role:'hauler'},getActiveBodyparts:part=>part==='carry'?4:part==='move'?2:0};
const surplusHauler={name:'LC2',ticksToLive:1100,memory:{home:'W7N4',role:'hauler',defenseTargetRoom:'W8N4',dispatchCommitment:{},workJob:{},task:'refill'},getActiveBodyparts:part=>part==='carry'?3:part==='move'?2:0};
Game.creeps={real,coreHauler,surplusHauler};const linkAdoption=adoptSurplusHaulerForLink(room,Game,policy);assert.deepStrictEqual(linkAdoption,[{creep:'LC2',slot:1}]);assert.strictEqual(coreHauler.memory.role,'hauler','protected home hauling remains staffed');assert.strictEqual(surplusHauler.memory.role,'controller-relay');assert.strictEqual(surplusHauler.memory.controllerRelaySlot,1);assert.strictEqual(surplusHauler.memory.dispatchCommitment,undefined);assert.strictEqual(surplusHauler.memory.workJob,undefined);assert.strictEqual(surplusHauler.memory.defenseTargetRoom,undefined);assert.strictEqual(adoptSurplusHaulerForLink(room,Game,policy).length,0,'link adoption is repeat-safe');
console.log('bounded GCL push, reservation budgets, shared authority, consumer handoff, reserve-only execution, completion and repeat-safe balancer adoption passed');
