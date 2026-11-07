'use strict';
const planRepairSupply=({structures,production=10,horizon=1500,repairPower=100})=>{
 const assets=structures.filter(s=>['container','road'].includes(s.structureType));
 const backlog=assets.reduce((n,s)=>n+Math.max(0,s.hitsMax*.8-s.hits)/repairPower,0);
 const decay=assets.reduce((n,s)=>n+(s.structureType==='container'?5000/100:100/1000)/repairPower,0);
 const rate=backlog>0?Math.min(Math.max(decay*1.25,production*.6),decay*1.25+backlog/horizon):0;
 const containers=assets.filter(s=>s.structureType==='container'&&s.store);
 const reservePerContainer=backlog>0?Math.ceil(rate*40/Math.max(1,containers.length)):0;
 return {rate,decay,backlog,horizon,reservePerContainer,containerIds:containers.map(s=>s.id)};
};
const exportableEnergy=(target,available,plan)=>Math.max(0,available-
 (plan?.containerIds.includes(target.id)?plan.reservePerContainer:0));
const runOutpostRepair=({creep,room,structures,stores,work,free,energy,available,reserve,withdraw,repair,move,claim,eligible})=>{
 const targets=structures.filter(s=>['container','road'].includes(s.structureType)&&s.hits<s.hitsMax*.8&&eligible(s))
  .sort((a,b)=>Math.floor(a.hits/(a.structureType==='container'?50:.1)/500)-Math.floor(b.hits/(b.structureType==='container'?50:.1)/500)||creep.pos.getRangeTo(a)-creep.pos.getRangeTo(b));
 if(!targets.length){delete creep.memory.repairLoading;delete creep.memory.repairSupplyTarget;return false;}
 const saved=targets.find(s=>s.id===creep.memory.repairWorkTarget);
 const life=s=>s.hits/(s.structureType==='container'?50:.1);
 const target=saved&&life(targets[0])>=Math.min(1000,life(saved)*.5)?saved:targets[0];
 creep.memory.repairWorkTarget=target.id;
 const threshold=Math.min(energy+free,Math.max(work*20,50));
 if(energy===0)creep.memory.repairLoading=true;
 if(energy>=threshold||free===0)delete creep.memory.repairLoading;
 if(creep.memory.repairLoading){
  const candidates=stores.filter(s=>s.store);
  let supply=candidates.find(s=>s.id===creep.memory.repairSupplyTarget);
  const alternative=candidates.filter(s=>available(s)>=Math.max(1,threshold-energy)).sort((a,b)=>creep.pos.getRangeTo(a)-creep.pos.getRangeTo(b))[0];
  if(supply&&alternative&&(available(supply)===0||creep.pos.getRangeTo(alternative)+5<creep.pos.getRangeTo(supply)))supply=alternative;
  if(!supply)supply=candidates.sort((a,b)=>Number(available(b)>0)-Number(available(a)>0)||creep.pos.getRangeTo(a)-creep.pos.getRangeTo(b))[0];
  if(!supply)return false;
  creep.memory.repairSupplyTarget=supply.id;creep.memory.taskTarget=supply.id;
  const amount=reserve(supply,free);
  if(amount>0)return withdraw(supply,amount);
  move(supply,1);creep.memory.repairSupplyWaiting=true;return true;
 }
 delete creep.memory.repairSupplyWaiting;
 if(creep.room.name!==room.name){move(target,3);creep.memory.taskTarget=target.id;return true;}
 claim(target);creep.memory.taskTarget=target.id;return repair(target);
};
module.exports={planRepairSupply,exportableEnergy,runOutpostRepair};
const protectRepairAssignments=({Game,getStructures})=>{
 for(const c of Object.values(Game.creeps)){
  const room=Game.rooms[c.memory.emergencyRepairRoom];if(!room||!getStructures(room).some(s=>['container','road'].includes(s.structureType)&&s.hits<s.hitsMax*.8))continue;
  if(c.memory.builderScope==='outpost'&&c.memory.remoteRoom===room.name)continue;
  const home=Game.rooms[c.memory.home];if(!home)continue;
  const used=new Set(Object.values(Game.creeps).filter(o=>o!==c&&o.memory.remoteRoom===room.name&&o.memory.role==='builder').map(o=>o.memory.remoteBuilderSlot));
  let slot=0;while(used.has(slot))slot++;
  Object.assign(c.memory,{role:'builder',bodyType:'worker',builderScope:'outpost',builderMission:'maintenance',assignmentBuilderMission:'maintenance',remoteHome:home.name,remoteRoom:room.name,remoteBuilderSlot:slot,remoteTeam:home.memory.southSurvey?.targetRoom===room.name?'south':home.memory.southwestSurvey?.targetRoom===room.name?'southwest':'left'});
 }
};
module.exports.protectRepairAssignments=protectRepairAssignments;
const planRepairRelief=({room,workers,rooms,viable})=>{
 const plans=[['left',room.memory.leftSurvey],['south',room.memory.southSurvey],['southwest',room.memory.southwestSurvey]];
 const missing=plans.filter(([,s])=>s?.active&&rooms[s.targetRoom]?.memory?.repairSupplyPlan?.backlog>0&&
  !workers.some(c=>c.memory.role==='builder'&&c.memory.builderScope==='outpost'&&c.memory.remoteRoom===s.targetRoom&&(c.spawning||viable(c))))
  .sort((a,b)=>rooms[b[1].targetRoom].memory.repairSupplyPlan.backlog-rooms[a[1].targetRoom].memory.repairSupplyPlan.backlog);
 const [team,survey]=missing[0]||[];
 return survey?{role:'builder',builderScope:'outpost',builderMission:'maintenance',remoteRoom:survey.targetRoom,remoteTeam:team,remoteBuilderSlot:0,forceSpawn:true,minimumEnergy:700,requiredWork:3}:null;
};
module.exports.planRepairRelief=planRepairRelief;
