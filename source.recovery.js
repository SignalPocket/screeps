'use strict';

const getAssignedSource = memory => memory.rebalancerSource ||
  memory.minerSource || memory.sourceReserve || memory.sourceReplacement ||
  memory.preferredSource || memory.harvestSource;

const planSourceRecovery = ({
  sources, workers, surplus, requiredWork, minWorkers = () => 0, maxWorkers = () => Infinity,
  getWork, isViable
}) => {
  const available = surplus.slice();
  const plans = [];
  for (const source of sources) {
    const required = requiredWork(source);
    const workerLimit = Math.max(0, maxWorkers(source));
    const workerMinimum = Math.min(workerLimit, Math.max(0, minWorkers(source)));
    const assigned = workers.filter(worker =>
      isViable(worker) && getAssignedSource(worker.memory) === source.id);
    const stable = assigned.filter(worker =>
      worker.memory.sourceReserve !== source.id &&
      worker.memory.sourceReplacement !== source.id);
    const recovery = assigned.filter(worker =>
      worker.memory.sourceReserve === source.id ||
      worker.memory.sourceReplacement === source.id)
      .sort((a, b) => getWork(b) - getWork(a) ||
        (b.ticksToLive || 0) - (a.ticksToLive || 0) ||
        a.name.localeCompare(b.name));
    let assignedCount = stable.length;
    let assignedWork = stable.reduce((total, worker) =>
      total + getWork(worker), 0);
    const retained = [];
    const released = [];
    for (const worker of recovery) {
      if ((assignedWork < required || assignedCount < workerMinimum) && assignedCount < workerLimit) {
        retained.push(worker);
        assignedWork += getWork(worker);
        assignedCount++;
      } else released.push(worker);
    }
    const promoted = [];
    while ((assignedWork < required || assignedCount < workerMinimum) && assignedCount < workerLimit &&
        available.length > 0) {
      const deficit = required - assignedWork;
      let index = available.findIndex(worker => getWork(worker) >= deficit);
      if (index < 0) index = available.reduce((best, worker, i) =>
        getWork(worker) > getWork(available[best]) ? i : best, 0);
      const worker = available.splice(index, 1)[0];
      promoted.push(worker);
      assignedWork += getWork(worker);
      assignedCount++;
    }
    // A full one-tile source cannot accept another miner. Upgrade that
    // occupied WORK budget using a stronger existing surplus body instead.
    if (assignedWork < required && assignedCount >= workerLimit && workerLimit > 0) {
      const weakest = [...stable.filter(w=>w.memory.role==='harvester'), ...retained]
        .sort((a,b)=>getWork(a)-getWork(b))[0];
      const index = available.reduce((best,w,i)=>best<0||
        getWork(w)>getWork(available[best])?i:best,-1);
      if (weakest && index>=0 && getWork(available[index])>getWork(weakest)) {
        const replacement=available.splice(index,1)[0];
        const retainedIndex=retained.indexOf(weakest);
        if(retainedIndex>=0)retained.splice(retainedIndex,1);
        released.push(weakest);promoted.push(replacement);
        assignedWork+=getWork(replacement)-getWork(weakest);
      }
    }
    plans.push({ source, requiredWork: required, assignedWork,
      retained, released, promoted });
  }
  return { plans, remainingSurplus: available };
};

module.exports = { getAssignedSource, planSourceRecovery };
