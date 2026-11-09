'use strict';
const dispatchEmergencyRepairs=({Game,getStructures,isRoadMobile,resource='energy',creeps,rooms})=>{
 const result=[];
 const roster=Array.isArray(creeps)?creeps:Object.values(Game.creeps);
 const visibleRooms=Array.isArray(rooms)?rooms:Object.values(Game.rooms);
 for(const home of visibleRooms.filter(r=>r.controller?.my)){
  const plans=[home.memory.leftSurvey,home.memory.southSurvey,home.memory.southwestSurvey].filter(p=>p?.active);
  for(const survey of plans){
   const room=Game.rooms[survey.targetRoom];if(!room)continue;
   const targets=getStructures(room).filter(s=>s.structureType==='container'&&s.hits<s.hitsMax*.25);
   if(!targets.length)continue;
   const workers=roster;
   const assigned=workers.filter(c=>c.memory.home===home.name&&c.memory.emergencyRepairRoom===room.name&&
    (c.spawning||c.ticksToLive>100));
   for(let i=assigned.length;i<2;i++){
    const donor=workers.filter(c=>!c.spawning&&c.room.name===home.name&&c.memory.home===home.name&&
      !c.memory.emergencyRepairRoom&&!c.memory.staffingRetire&&
      (['worker','builder'].includes(c.memory.role)&&c.memory.builderScope!=='outpost'||
       c.memory.role==='hauler'&&c.getActiveBodyparts('work')>0)&&
      c.getActiveBodyparts('work')>=2&&c.getActiveBodyparts('carry')>0&&isRoadMobile(c)&&c.ticksToLive>250)
      .sort((a,b)=>Number(b.memory.role==='hauler')-Number(a.memory.role==='hauler')||
        (b.store[resource]||0)-(a.store[resource]||0)||b.ticksToLive-a.ticksToLive)[0];
    if(!donor)break;
    const m=donor.memory;
    for(const key of ['workJob','dispatchCommitment','withdrawTarget','pickupReservation','preferredSource',
      'harvestSource','sourceReserve','sourceReplacement','task','taskTarget','demandLane','_move','navGoal'])delete m[key];
    Object.assign(m,{role:'builder',bodyType:'worker',builderScope:'outpost',builderMission:'maintenance',
      assignmentBuilderMission:'maintenance',remoteHome:home.name,remoteRoom:room.name,
      remoteTeam:survey===home.memory.southSurvey?'south':survey===home.memory.southwestSurvey?'southwest':'left',
      remoteBuilderSlot:i,emergencyRepairRoom:room.name});
    result.push({name:donor.name,room:room.name});
   }
   survey.remoteBuilderTarget=Math.max(2,survey.remoteBuilderTarget||0);
   if(room.memory.builderCapacityPlan)room.memory.builderCapacityPlan.desired=Math.max(2,room.memory.builderCapacityPlan.desired);
  }
 }
 return result;
};
module.exports={dispatchEmergencyRepairs};
