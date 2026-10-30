'use strict';

// Durable ownership for colony work. A room may recalculate demand every tick,
// but a creep keeps a useful job until it completes, becomes invalid, or a
// strictly higher-priority emergency preempts it.
const createWorkDispatch = ({ Game, RESOURCE_ENERGY }) => {
  const durableLanes = new Set([
    'collect', 'refill', 'refill-buffer', 'buffer', 'storage', 'supply',
    'build', 'repair', 'upgrade'
  ]);
  const deliveryLanes = new Set([
    'refill', 'refill-buffer', 'buffer', 'storage', 'supply'
  ]);
  const getTarget = id => id && Game.getObjectById(id);
  const stored = target => target && target.store
    ? target.store[RESOURCE_ENERGY] || 0 : 0;
  const free = target => target && target.store &&
    typeof target.store.getFreeCapacity === 'function'
    ? target.store.getFreeCapacity(RESOURCE_ENERGY) : 0;

  const isUseful = (creep, job) => {
    if (!job || !durableLanes.has(job.lane) ||
        job.roomName !== creep.room.name) return false;
    const source = getTarget(job.sourceId);
    const target = getTarget(job.targetId);
    if (job.lane === 'collect') {
      return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && source &&
        stored(source) > 0;
    }
    if (deliveryLanes.has(job.lane)) {
      return creep.store[RESOURCE_ENERGY] > 0 && target && free(target) > 0;
    }
    if (job.lane === 'build') {
      return target && target.progressTotal !== undefined &&
        target.progress < target.progressTotal;
    }
    if (job.lane === 'repair') {
      return target && target.hits !== undefined && target.hits < target.hitsMax;
    }
    return job.lane === 'upgrade' && target && target.my !== false;
  };

  const makeJob = (creep, proposal) => ({
    id: `${creep.room.name}:${creep.name}:${Game.time}`,
    roomName: creep.room.name,
    lane: proposal.lane,
    sourceId: proposal.sourceId || null,
    targetId: proposal.targetId || null,
    amount: Math.max(0, proposal.amount || 0),
    priority: Number.isFinite(proposal.priority) ? proposal.priority : 100,
    created: Game.time,
    updated: Game.time
  });

  const reconcile = (creeps, proposals) => {
    const jobs = {};
    for (const creep of creeps) {
      const proposal = proposals[creep.name];
      let job = creep.memory.workJob;
      if (proposal && proposal.cancelCurrent) job = null;
      const preempt = proposal && job &&
        Number.isFinite(proposal.priority) &&
        proposal.priority < (Number.isFinite(job.priority)
          ? job.priority : 100);
      if (!isUseful(creep, job) || preempt) job = null;
      if (!job && proposal && durableLanes.has(proposal.lane)) {
        job = makeJob(creep, proposal);
      }
      if (job) {
        job.updated = Game.time;
        creep.memory.workJob = job;
        jobs[creep.name] = job;
      } else {
        delete creep.memory.workJob;
      }
    }
    return jobs;
  };

  const bindTarget = (creep, target, amount, source) => {
    const job = creep.memory.workJob;
    if (!job || !target || !target.id) return null;
    job.targetId = target.id;
    if (source && source.id) job.sourceId = source.id;
    job.amount = Math.max(0, amount || job.amount || 0);
    job.updated = Game.time;
    return job;
  };

  const complete = creep => {
    delete creep.memory.workJob;
    delete creep.memory.dispatchCommitment;
  };

  return { reconcile, bindTarget, complete, isUseful };
};

module.exports = { createWorkDispatch };
