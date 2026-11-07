'use strict';
const sum = values => values.reduce((a,b)=>a+b,0);
const parts = (creep,type) => creep.getActiveBodyparts ? creep.getActiveBodyparts(type) :
  (creep.body||[]).filter(p=>(typeof p==='string'?p:p.type)===type && (typeof p==='string'||p.hits>0)).length;
const localKind = creep => {
  const m=creep.memory;
  if(m.role==='builder' && m.builderScope==='outpost')return 'remoteBuilder:'+m.remoteRoom;
  if(m.role==='refiller')return 'refiller';
  if(m.role==='upgrader')return 'upgrader';
  if(['builder','worker'].includes(m.role) && !['outpost','expansion'].includes(m.builderScope) &&
      !['repair','tunnel'].includes(m.builderMission))return 'builder';
  return null;
};
const prune = (bins,tick) => {for(const key of Object.keys(bins))if(Number(key)<tick-400)delete bins[key];};
const aggregate = bins => Object.values(bins||{}).reduce((a,b)=>({ticks:a.ticks+b.ticks,
 output:a.output+b.output,starved:a.starved+(b.starved||0)}),{ticks:0,output:0,starved:0});

// Observe resolved store changes on the following tick, never attempted intents.
const observeLabor = ({Game,getStructures,resource='energy'}) => {
 const delivered={};
 for(const creep of Object.values(Game.creeps)){
  const m=creep.memory,home=Game.rooms[m.home],kind=localKind(creep),old=m.laborPrevious;
  const current={tick:Game.time,energy:creep.store[resource]||0,task:m.task,lane:m.demandLane,
    target:m.taskTarget,held:m.energyBudgetHeld,kind,room:creep.room.name,work:parts(creep,'work')};
  m.laborPrevious=current;
  if(!home?.controller?.my || creep.spawning || !old || old.tick!==Game.time-1)continue;
  const spent=Math.max(0,old.energy-current.energy);
  const target=Game.getObjectById(String(current.target||'').split(' ')[0]);
  if(current.room===home.name && ['refill','committed-refill','emergency-refill'].includes(current.task) &&
      ['spawn','extension','tower'].includes(target?.structureType))delivered[home.name]=(delivered[home.name]||0)+spent;
  if(!kind || kind!==old.kind || current.held ||
    !kind.startsWith('remoteBuilder:') && creep.room.name!==home.name)continue;
  const opportunity=kind.startsWith('remoteBuilder:') ? ['remote-road','remote-container','emergency-repair','repair-load'].includes(current.task) : kind==='refiller' ? (home.memory.laborStats?.lastDeficit||0)>0 :
    current.lane===(kind==='builder'?'build':'upgrade');
  if(!opportunity)continue;
  const stats=home.memory.laborStats ||= {creeps:{},network:{}};
  const profile=stats.creeps[creep.name] ||= {kind,bins:{}};
  if(profile.kind!==kind){profile.kind=kind;profile.bins={};}
  profile.lastSeen=Game.time;
  const key=Math.floor(Game.time/50)*50;
  const bin=profile.bins[key] ||= {ticks:0,output:0,starved:0};
  const productive=kind.startsWith('remoteBuilder:')?['remote-road','remote-container','emergency-repair','repair-load'].includes(old.task):kind==='builder'?['build','dig-road'].includes(current.task):kind==='upgrader'?
    ['upgrade','urgent-upgrade'].includes(current.task):['refill','committed-refill'].includes(current.task);
  const maximum=current.task==='emergency-repair'?current.work:kind==='refiller'?spent:current.work*(kind==='builder'||kind.startsWith('remoteBuilder:')?5:1);
  bin.ticks++;bin.output+=productive?Math.min(spent,maximum):0;
  if(['wait-job','await-supply'].includes(current.task))bin.starved++;
  prune(profile.bins,Game.time);
 }
 for(const room of Object.values(Game.rooms).filter(r=>r.controller?.my)){
  const stats=room.memory.laborStats ||= {creeps:{},network:{}};
  const receivers=getStructures(room).filter(s=>s.my&&['spawn','extension','tower'].includes(s.structureType));
  const ready=sum(receivers.map(s=>s.store[resource]||0));
  const deficit=sum(receivers.map(s=>s.store.getFreeCapacity(resource)||0));
  if(stats.lastTick===Game.time-1){
   const key=Math.floor(Game.time/50)*50,bin=stats.network[key] ||= {ticks:0,output:0};
   bin.ticks++;bin.output+=Math.max(0,stats.lastReady+(delivered[room.name]||0)-ready);
  }
  stats.lastTick=Game.time;stats.lastReady=ready;stats.lastDeficit=deficit;
  prune(stats.network,Game.time);
  for(const [name,p]of Object.entries(stats.creeps))if(Game.time-p.lastSeen>1500)delete stats.creeps[name];
 }
};
const workRate = (work,carry,power,travel=0) => {
 const active=Math.max(1,Math.floor(carry/Math.max(1,work*power)));
 return work*power*active/(active+travel+1);
};
const countForRate = (required,rates,future,maximum=6) => {
 if(required<=0)return 0;
 let supplied=0;
 const sorted=rates.filter(r=>r>0).sort((a,b)=>b-a);
 for(let i=0;i<sorted.length;i++){
  supplied+=sorted[i];if(supplied>=required)return Math.min(maximum,i+1);
 }
 return Math.min(maximum,Math.max(1,sorted.length+Math.ceil((required-supplied)/Math.max(.1,future))));
};
const settle = (old,wanted,tick,floor=0) => {
 if(!old)return {desired:Math.max(floor,wanted),changed:tick};
 wanted=Math.max(floor,wanted);
 if(old.desired<floor)return {desired:floor,changed:tick};
 if(wanted===old.desired)return {...old,candidate:undefined,since:undefined};
 const same=old.candidate===wanted,since=same?old.since:tick;
 const delay=wanted>old.desired?50:200;
 if(tick-since<delay)return {...old,candidate:wanted,since};
 return {desired:Math.max(floor,old.desired+Math.sign(wanted-old.desired)),changed:tick};
};
const profileRate = (creep,kind,stats,estimate) => {
 const p=stats?.creeps?.[creep.name],a=p?.kind===kind?aggregate(p.bins):null;
 if(!a || a.ticks<60)return {rate:estimate,basis:'cycle estimate'};
 const measured=a.output/a.ticks;
 if(a.starved/a.ticks>.25)return {rate:Math.max(estimate*.75,measured),basis:'supply limited'};
 return {rate:Math.max(estimate*.35,measured),basis:'observed'};
};

const planLabor = ({tick,previous,stats,creeps,buildRemaining,repairEnergy=0,
 income,storedEnergy,reserveFloor=3500,deficit,clusters=1,controllerSpots=2,
 controllerDanger=false,canBuild=true,travel=20,refillTravel=10,newBuilder,newUpgrader,energyCapacity=1750}) => {
 const counts=body=>({work:parts(body,'work'),carry:parts(body,'carry')*50});
 const futureB=counts(newBuilder),futureU=counts(newUpgrader);
 const bRate=workRate(futureB.work,futureB.carry,5,travel);
 const uRate=workRate(futureU.work,futureU.carry,1,0);
 const network=aggregate(stats?.network);
 const refillUse=network.ticks>=60?network.output/network.ticks:energyCapacity/120;
 const buildBudget=canBuild?Math.min(buildRemaining/2000,Math.max(0,income-refillUse-1)*.5):0;
 const repairBudget=repairEnergy/1500;
 const reserveDraw=Math.min(5,Math.max(0,storedEnergy-reserveFloor)/3000);
 const upgradeBudget=Math.max(1,Math.min(15,income-refillUse-buildBudget-repairBudget+reserveDraw));
 const rates={};
 for(const kind of ['builder','upgrader','refiller'])rates[kind]=creeps.filter(c=>localKind(c)===kind).map(c=>{
  const body=counts(c);
  const estimated=kind==='refiller'?body.carry/(refillTravel+1+Math.ceil(body.carry/50)):
   workRate(body.work,body.carry,kind==='builder'?5:1,kind==='builder'?travel:0);
  return {name:c.name,...profileRate(c,kind,stats,estimated)};
 });
 const bFloor=canBuild&&buildRemaining>0?1:0;
 const builderWanted=countForRate(buildBudget,rates.builder.map(p=>p.rate),bRate,6);
 const builder=buildRemaining>0&&canBuild?settle(previous?.builder,builderWanted,tick,bFloor):{desired:0,changed:tick};
 if(rates.builder.length<builder.desired && builderWanted<builder.desired)
   builder.desired=Math.max(bFloor,builderWanted);
 const upgrader={desired:1,changed:previous?.upgrader?.desired===1?previous.upgrader.changed:tick};
 const perOwner=refillUse*1.2/Math.max(1,clusters);
 const rawCarryParts=Math.max(2,Math.min(Math.floor(energyCapacity/100),25,
  Math.ceil(perOwner*(refillTravel+1)/Math.max(1,50-perOwner))));
 const activeCarry=creeps.filter(c=>localKind(c)==='refiller').map(c=>parts(c,'carry'));
 const initialCarry=network.ticks<60&&activeCarry.length?Math.max(2,...activeCarry):rawCarryParts;
 let previousSizing=previous?.refiller?.sizing;
 const activeCapacity=activeCarry.length?Math.max(...activeCarry):0;
 if(previousSizing && previousSizing.desired>rawCarryParts && activeCapacity<previousSizing.desired){
   previousSizing={desired:Math.max(2,activeCapacity,rawCarryParts),changed:tick};
 }
 const sizing=settle(previousSizing,initialCarry,tick,2);
 const carryParts=sizing.desired;
 const upgradeWork=Math.max(1,Math.min(15,Math.ceil(upgradeBudget/Math.max(1,upgrader.desired)/.9)));
 return {updated:tick,horizon:2000,income,refillUse,buildBudget,upgradeBudget,
  builder:{...builder,requiredRate:buildBudget,futureRate:bRate,rates:rates.builder},
  upgrader:{...upgrader,requiredRate:upgradeBudget,futureRate:uRate,workParts:upgradeWork,rates:rates.upgrader},
  refiller:{desired:clusters,carryParts,sizing,requiredRate:refillUse+deficit/100,rates:rates.refiller},
  budgetUnits:'energy per tick'};
};
const applyLaborPolicy = (policy,plan) => {
  const set=(key,count,min=policy.roles[key]?.min||0)=>{policy.roles[key]={...policy.roles[key],min,desired:Math.max(count,min),max:Math.max(count,min),
  reason:'measured capacity and energy budget'};};
 set('builder',plan.builder.desired);
 plan.upgrader.desired=1;
 plan.upgrader.workParts=Math.max(1,Math.min(15,Math.ceil(plan.upgradeBudget/.9)));
 set('upgrader',1);
 // One owner per physical extension clump; capacity, not duplicate owners, scales.
 set('refiller',plan.refiller.desired);
 for(const key of ['min','desired','max'])policy.totals[key]=sum(Object.values(policy.roles).map(r=>r[key]||0))+
  (key==='min'?policy.remote.minersMin+policy.remote.haulersMin+policy.remote.buildersMin:
   policy.remote.miners+policy.remote.haulers+policy.remote.builders);
 policy.labor=plan;
};
const runBudgetedUpgrade = ({creep,target,memory,tick,rate,emergency=false,OK=0}) => {
 if(emergency || !Number.isFinite(rate) || creep.pos.getRangeTo(target)>3)return creep.upgradeController(target);
 const bucket=memory.upgradeEnergyBucket ||= {tick:tick-1,tokens:0};
 const elapsed=Math.max(0,Math.min(10,tick-bucket.tick));
 const amount=Math.min(parts(creep,'work'),creep.store.energy||0,target.level===8?15:Infinity);
 bucket.tokens=Math.min(Math.max(50,rate*5,amount*2),bucket.tokens+elapsed*rate);bucket.tick=tick;
 if(bucket.tokens<amount){creep.memory.energyBudgetHeld=true;return OK;}
 const result=creep.upgradeController(target);
 if(result===OK)bucket.tokens-=amount;
 return result;
};
const selectUpgradeBudget = (laborPlan, operation) =>
 operation?.upgradePush && Number.isFinite(operation.upgradeWorkTotal)
  ? operation.upgradeWorkTotal : laborPlan?.upgradeBudget;
const runBudgetedWork = ({creep,target,memory,tick,rate,cost,action,range=3,reason='construction spending budget',OK=0}) => {
 if(!Number.isFinite(rate)||creep.pos.getRangeTo(target)>range)return action();
 const bucket=memory.buildEnergyBucket ||= {tick:tick-1,tokens:0};
 const elapsed=Math.max(0,Math.min(10,tick-bucket.tick));
 bucket.tokens=Math.min(Math.max(50,rate*5,cost*2),bucket.tokens+elapsed*Math.max(0,rate));bucket.tick=tick;
 if(bucket.tokens<cost){creep.memory.energyBudgetHeld=true;creep.memory.energyBudgetReason=reason;return OK;}
 const result=action();if(result===OK)bucket.tokens-=cost;return result;
};
const reconcileLaborBody = creep => {
 if(creep.memory.role==='upgrader' && creep.memory.bodyType==='miner' &&
    parts(creep,'work')>0 && parts(creep,'carry')>0){
  creep.memory.bodyType='controller';return true;
 }
 return false;
};
module.exports={reconcileLaborBody,runBudgetedWork,runBudgetedUpgrade,selectUpgradeBudget,observeLabor,workRate,countForRate,settle,profileRate,planLabor,applyLaborPolicy};
