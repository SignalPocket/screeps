'use strict';

// Reuse genuine local surplus to reopen remote minimum lanes. Survey details
// choose the lane, while policy budgets bound the number of assignments.
const planRemoteRecovery = ({
  plans, workers, surplus, haulerSurplus = [], minerBudget, haulerBudget = 0, builderBudget,
  getWork, getCarry = () => 0, minimumHaulerCarry = 2,
  isRemoteViable, isOutpostBuilder, getRemoteBuilderTarget
}) => {
  const available = surplus.slice();
  const assignments = [];
  const spareCarriers = haulerSurplus.slice();
  let minerCount = workers.filter(worker =>
    worker.memory.role === 'remote-miner' && isRemoteViable(worker)).length;
  let builderCount = workers.filter(worker =>
    isOutpostBuilder(worker) && isRemoteViable(worker)).length;
  let haulerCount = workers.filter(worker =>
    worker.memory.role === 'remote-hauler' && isRemoteViable(worker)).length;

  const usedHaulerSlots = new Set(workers.filter(worker =>
    worker.memory.role === 'remote-hauler' && isRemoteViable(worker))
    .map(worker => `${worker.memory.remoteRoom}:` +
      `${worker.memory.remoteHaulerSlot}`));
  const largestHaulerTarget = plans.reduce((maximum, entry) => Math.max(
    maximum, entry.survey.remoteHaulerTarget || 0), 0);
  for (let slot = 0; slot < largestHaulerTarget &&
      haulerCount < haulerBudget; slot++) {
    for (const entry of plans) {
      if (slot >= (entry.survey.remoteHaulerTarget || 0) ||
          haulerCount >= haulerBudget) continue;
      const key = `${entry.survey.targetRoom}:${slot}`;
      if (usedHaulerSlots.has(key)) continue;
      const pool = spareCarriers.some(worker => getWork(worker) === 0 &&
        getCarry(worker) >= minimumHaulerCarry) ? spareCarriers : available;
      const candidateIndex = pool.findIndex(worker =>
        getWork(worker) === 0 && getCarry(worker) >= minimumHaulerCarry);
      if (candidateIndex === -1) break;
      const worker = pool.splice(candidateIndex, 1)[0];
      assignments.push({ kind: 'hauler', worker, entry, slot });
      usedHaulerSlots.add(key);
      haulerCount++;
    }
  }

  const lanes = plans.flatMap(entry => {
    const survey = entry.survey;
    const needs = Array.isArray(survey.remoteWorkNeeds) &&
      survey.remoteWorkNeeds.length ? survey.remoteWorkNeeds :
      [...Array(survey.remoteMinerTarget || 1).keys()].map(slot => ({
        slot, minMiners: 1, requiredWork: 1
      }));
    return needs.map(need => {
      const assigned = workers.filter(worker =>
        worker.memory.role === 'remote-miner' &&
        worker.memory.remoteRoom === survey.targetRoom &&
        worker.memory.remoteSlot === need.slot && isRemoteViable(worker));
      return {
        entry, need,
        count: assigned.length,
        work: assigned.reduce((total, worker) =>
          total + getWork(worker), 0)
      };
    });
  });
  const assignMiner = lane => {
    const worker = available.shift();
    assignments.push({ kind: 'miner', worker,
      entry: lane.entry, need: lane.need });
    lane.count++;
    lane.work += getWork(worker);
    minerCount++;
  };
  // Cover every physical source lane before stacking extra weak bodies onto
  // one source to close its WORK deficit.
  for (const lane of lanes) {
    while (minerCount < minerBudget && available.length > 0 &&
        lane.count < Math.max(1, lane.need.minMiners || 0)) {
      assignMiner(lane);
    }
  }
  for (const lane of lanes) {
    while (minerCount < minerBudget && available.length > 0 &&
        lane.work < Math.max(1, lane.need.requiredWork || 0)) {
      assignMiner(lane);
    }
  }

  // Minimum maintenance means room coverage, not several builders in one
  // outpost while another has none. Reuse an extra maintainer before spawning.
  const builderRoster = new Map(workers.filter(w=>isOutpostBuilder(w)&&
    (w.spawning||w.ticksToLive===undefined||w.ticksToLive>50))
    .map(w=>[w.name,{worker:w,room:w.memory.remoteRoom,slot:w.memory.remoteBuilderSlot}]));
  const builderPlans=plans.map(entry=>({entry,target:Math.max(
    entry.survey.remoteBuilderTarget||0,getRemoteBuilderTarget(entry.survey.targetRoom))}))
    .filter(p=>p.target>0);
  if(builderBudget>0)for(const {entry} of builderPlans){
    const room=entry.survey.targetRoom;
    if([...builderRoster.values()].some(r=>r.room===room))continue;
    const counts={};for(const r of builderRoster.values())counts[r.room]=(counts[r.room]||0)+1;
    const donor=[...builderRoster.values()].filter(r=>counts[r.room]>1&&!r.worker.memory.emergencyRepairRoom)
      .sort((a,b)=>(b.worker.ticksToLive||0)-(a.worker.ticksToLive||0)||
        (b.worker.store?.energy||0)-(a.worker.store?.energy||0)||
        a.worker.name.localeCompare(b.worker.name))[0];
    if(!donor)continue;
    assignments.push({kind:'builder',worker:donor.worker,entry,slot:0});
    donor.room=room;donor.slot=0;
  }
  for(const {entry,target} of builderPlans){
    const assigned=[...builderRoster.values()].filter(r=>r.room===entry.survey.targetRoom);
    const usedSlots=new Set(assigned.map(r=>r.slot));
    for(let slot=0;slot<target&&available.length>0&&builderCount<builderBudget;slot++){
      if(usedSlots.has(slot))continue;
      const worker=available.shift();
      assignments.push({kind:'builder',worker,entry,slot});
      builderRoster.set(worker.name,{worker,room:entry.survey.targetRoom,slot});
      usedSlots.add(slot);builderCount++;
    }
  }
  return { assignments, remainingSurplus: available,
    minerCount, haulerCount, builderCount };
};

module.exports = { planRemoteRecovery };
