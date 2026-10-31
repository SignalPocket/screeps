'use strict';

const getAssignedSource = memory => memory.rebalancerSource ||
  memory.minerSource || memory.sourceReserve || memory.sourceReplacement ||
  memory.preferredSource || memory.harvestSource;

const planSourceRecovery = ({
  sources, workers, surplus, requiredWork, maxWorkers = () => Infinity,
  getWork, isViable
}) => {
  const available = surplus.slice();
  const plans = [];
  for (const source of sources) {
    const required = requiredWork(source);
    const workerLimit = Math.max(0, maxWorkers(source));
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
      if (assignedWork < required && assignedCount < workerLimit) {
        retained.push(worker);
        assignedWork += getWork(worker);
        assignedCount++;
      } else released.push(worker);
    }
    const promoted = [];
    while (assignedWork < required && assignedCount < workerLimit &&
        available.length > 0) {
      const worker = available.shift();
      promoted.push(worker);
      assignedWork += getWork(worker);
      assignedCount++;
    }
    plans.push({ source, requiredWork: required, assignedWork,
      retained, released, promoted });
  }
  return { plans, remainingSurplus: available };
};

module.exports = { getAssignedSource, planSourceRecovery };
