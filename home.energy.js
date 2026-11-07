'use strict';
const networkRecoveryNeeded=({energy,capacity,previous=false})=>capacity>0&&energy<capacity*(previous?1:.9);
const homePickupCandidates=({creep,candidates,planned,isSpawnReserve,isSourceBuffer})=>{
 if(creep.memory.role!=='hauler'||creep.memory.refillSpecialist)return candidates;
 const available=candidates.filter(s=>!isSpawnReserve(s));
 if(!planned)return available;
 const assigned=planned.store?available.filter(s=>s.id===planned.id):available.filter(s=>isSourceBuffer(s,planned));
 return assigned.length?assigned:available;
};
module.exports={networkRecoveryNeeded,homePickupCandidates};
