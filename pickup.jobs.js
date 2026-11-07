"use strict";
// Reserve concrete pickup quantities and admission slots before anybody moves.
const planPickupJobs=({creeps,tick,getCandidates,getPreferredTarget,getJobPriority=null,maxCollectors=2})=>{
 const jobs={},remaining={},counts={};
 const priority=c=>getJobPriority?getJobPriority(c):c.memory.role==='refiller'?0:c.memory.role==='upgrader'?1:
   ['hauler','remote-hauler','rebalancer'].includes(c.memory.role)?2:3;
 const sorted=creeps.slice().sort((a,b)=>{
   const held=c=>c.memory.pickupReservation&&c.memory.pickupReservation.expires>=tick&&
     (c.memory.navStuck||0)<3;
   return Number(held(b))-Number(held(a))||priority(a)-priority(b)||a.name.localeCompare(b.name);
 });
 for(const creep of sorted){
   const candidates=getCandidates(creep);
   const preferred=getPreferredTarget(creep);
   const old=creep.memory.pickupReservation;
   const held=old&&old.expires>=tick&&(creep.memory.navStuck||0)<3;
   for(const s of candidates){if(!(s.id in remaining))remaining[s.id]=Math.max(0,s.store.energy||0);}
   const usable=candidates.filter(s=>remaining[s.id]>0&&(counts[s.id]||0)<maxCollectors)
     .sort((a,b)=>{
       const score=s=>creep.pos.getRangeTo(s)+(counts[s.id]||0)*6-
         (held&&old.targetId===s.id?100:s.id===preferred?4:0);
       return score(a)-score(b)||a.id.localeCompare(b.id);
     });
   const target=usable[0];
   if(!target){delete creep.memory.pickupReservation;continue;}
   const amount=Math.min(creep.store.getFreeCapacity('energy'),remaining[target.id]);
   const job={targetId:target.id,amount,
     assigned:held&&old.targetId===target.id?old.assigned:tick,
     expires:held&&old.targetId===target.id?old.expires:
       tick+Math.max(20,creep.pos.getRangeTo(target)*3+10)};
   jobs[creep.name]=job;creep.memory.pickupReservation=job;
   remaining[target.id]-=amount;counts[target.id]=(counts[target.id]||0)+1;
 }
 return {jobs,remaining,counts};
};
module.exports={planPickupJobs};
