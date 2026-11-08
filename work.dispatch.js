'use strict';

/**
 * Durable ownership for colony work.
 *
 * Inputs are group-planner proposals keyed by creep name. Output jobs bind one
 * creep to one lane and, when known, exact source/target object IDs. Re-running
 * the group planner is not by itself a reassignment reason: a useful existing
 * job wins until it completes, its object becomes invalid, or a strictly
 * higher-priority emergency preempts it.
 *
 * This module decides whether ownership persists. It does not choose staffing,
 * find replacement targets, move creeps, or perform Screeps actions.
 */
const createWorkDispatch = ({ Game, RESOURCE_ENERGY }) => {
  const durableLanes = new Set([
    'collect', 'refill', 'refill-buffer', 'buffer', 'storage', 'supply',
    'build', 'repair', 'upgrade'
  ]);
  const deliveryLanes = new Set([
    'refill', 'refill-buffer', 'buffer', 'storage', 'supply'
  ]);
  const paidWorkLanes = new Set(['build', 'repair', 'upgrade']);
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
      return creep.store[RESOURCE_ENERGY] > 0 && target &&
        target.progressTotal !== undefined &&
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
    reason: proposal.reason || 'previous assignment completed or invalid',
    created: Game.time,
    updated: Game.time
  });

  /** Reconcile the whole group before any creep begins execution this tick. */
  const reconcile = (creeps, proposals) => {
    const jobs = {};
    for (const creep of creeps) {
      const proposal = proposals[creep.name];
      let job = creep.memory.workJob;
      if (proposal && proposal.cancelCurrent) job = null;
      const higherPriority = proposal && job &&
        Number.isFinite(proposal.priority) &&
        proposal.priority < (Number.isFinite(job.priority)
          ? job.priority : 100);
      // A loaded delivery owns its exact destination for the current load.
      // Routine Store/StockRC/StockSp priority changes wait for completion;
      // only priority zero (the room cannot fund a worker body) may preempt.
      const preempt = higherPriority &&
        (!deliveryLanes.has(job.lane) && !paidWorkLanes.has(job.lane) ||
          proposal.priority === 0);
      const previousLane = job && job.lane;
      if (!isUseful(creep, job) || preempt) job = null;
      if (!job && previousLane === 'build') delete creep.memory.buildTarget;
      const emptyBuild = proposal && proposal.lane === 'build' &&
        !(creep.store[RESOURCE_ENERGY] > 0);
      if (!job && proposal && durableLanes.has(proposal.lane) &&
          !emptyBuild) {
        job = makeJob(creep, {
          ...proposal,
          reason: preempt
            ? 'priority-zero room-energy emergency'
            : proposal.reason
        });
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

  // The quantity allocator chooses the concrete store, while room planning
  // may propose only a source area. Publish that admitted pickup everywhere
  // before execution so the job and its commitment cannot send different moves.
  const bindPickup = (creep, pickup) => {
    const job = creep.memory.workJob;
    const source = pickup && getTarget(pickup.targetId);
    if (!job || job.lane !== 'collect' || !source ||
        !source.store || pickup.amount <= 0) return null;
    job.sourceId = source.id;
    job.amount = pickup.amount;
    job.updated = Game.time;
    const previous = creep.memory.dispatchCommitment;
    creep.memory.dispatchCommitment = {
      lane: 'collect', targetId: source.id, roomName: creep.room.name,
      amount: pickup.amount,
      since: previous && previous.lane === 'collect' &&
        previous.targetId === source.id ? previous.since : Game.time,
      updated: Game.time
    };
    return job;
  };

  const complete = creep => {
    delete creep.memory.workJob;
    delete creep.memory.dispatchCommitment;
  };

  return { reconcile, bindTarget, bindPickup, complete, isUseful };
};

// Execute the bookkeeping shared by reservation-aware withdrawals. Callers
// retain ownership of eligibility, approach selection, success cleanup and
// whether a failed intent counts as handled work.
const executeReservedWithdrawal = ({ creep, target, resource, capacity,
  reserve, release, remember, forget, move, OK, ERR_NOT_IN_RANGE,
  rememberBeforeIntent = true, supplyAmount = true, movementTarget = target,
  movementRange = 1, recordSource = true, recordTaskTarget = true,
  taskTarget = target && target.id }) => {
  const amount = reserve(target, capacity);
  if (!(amount > 0)) return { state: 'unreserved', amount: 0 };
  if (rememberBeforeIntent) remember(target, amount);
  const result = supplyAmount
    ? creep.withdraw(target, resource, amount)
    : creep.withdraw(target, resource);
  if (result !== OK && result !== ERR_NOT_IN_RANGE) {
    release(target, amount);
    forget(target);
    return { state: 'failed', amount, result };
  }
  if (!rememberBeforeIntent) remember(target, amount);
  if (result === ERR_NOT_IN_RANGE) {
    move(creep, movementTarget, movementRange);
  }
  if (result === OK && recordSource) {
    const sources = creep.memory.energySources || [];
    if (!sources.includes(target.id)) sources.push(target.id);
    creep.memory.energySources = sources;
  }
  if (recordTaskTarget && taskTarget !== undefined) {
    creep.memory.taskTarget = taskTarget;
  }
  return { state: 'accepted', amount, result };
};

// Execute a partial carrier's reserved pickup before the loaded-task queue.
// Use the pickup allocator's target and quantity; never bypass its admission cap.
const collectPartialHauler = ({ creep, lane, target, resource, canWithdraw,
  reserve, release, remember, forget, move, OK, ERR_NOT_IN_RANGE }) => {
  if (creep.memory.role !== 'hauler' || lane !== 'collect' ||
      !(creep.store[resource] > 0) ||
      creep.store.getFreeCapacity(resource) <= 0 ||
      !target || !canWithdraw(creep, target)) return false;
  return executeReservedWithdrawal({ creep, target, resource,
    capacity: creep.store.getFreeCapacity(resource), reserve, release,
    remember, forget, move, OK, ERR_NOT_IN_RANGE,
    rememberBeforeIntent: false }).state === 'accepted';
};

// Retry only failed assignments, preserving intentional reserve parking.
// Callers supply capability checks and reservation-aware concrete actions.
const recoverBlockedWork = ({ creep, lane, actions }) => {
  if (lane === 'standby' || creep.memory.task &&
      creep.memory.task !== 'wait-job') return null;
  for (const action of actions) {
    if (action.eligible() && action.run()) return action;
  }
  return null;
};

module.exports = { createWorkDispatch, executeReservedWithdrawal,
  collectPartialHauler, recoverBlockedWork };
