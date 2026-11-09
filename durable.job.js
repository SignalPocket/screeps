'use strict';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const text = value => typeof value === 'string' && value.length > 0;
const optionalText = value => value == null || text(value);

const validateWorkJob = job => {
  if (!job || typeof job !== 'object' || Array.isArray(job)) {
    return 'workJob must be an object';
  }
  if (!text(job.lane)) return 'workJob lane is missing';
  if (!text(job.roomName)) return 'workJob roomName is missing';
  if (!optionalText(job.sourceId)) return 'workJob sourceId is invalid';
  if (!optionalText(job.targetId)) return 'workJob targetId is invalid';
  if (own(job, 'amount') &&
      (!Number.isFinite(job.amount) || job.amount < 0)) {
    return 'workJob amount is invalid';
  }
  if (own(job, 'priority') && !Number.isFinite(job.priority)) {
    return 'workJob priority is invalid';
  }
  if (own(job, 'reason') && typeof job.reason !== 'string') {
    return 'workJob reason is invalid';
  }
  return null;
};

const workJobView = job => ({
  authority: 'workJob',
  lane: job.lane,
  roomName: job.roomName,
  sourceId: job.sourceId || null,
  targetId: job.targetId || null,
  amount: Number.isFinite(job.amount) ? job.amount : 0,
  priority: Number.isFinite(job.priority) ? job.priority : null,
  reason: typeof job.reason === 'string' ? job.reason : null,
  place: job.targetId || job.roomName,
  releaseKeys: ['workJob']
});

const specialistRepairView = memory => {
  const roomName = memory.remoteRoom || memory.emergencyRepairRoom || null;
  const invalidReason = !text(memory.repairWorkTarget)
    ? 'repairWorkTarget is invalid'
    : !text(roomName) ? 'specialist repair room is missing' : null;
  return {
    job: {
      authority: 'repairWorkTarget',
      lane: 'repair',
      roomName,
      sourceId: text(memory.repairSupplyTarget)
        ? memory.repairSupplyTarget : null,
      targetId: text(memory.repairWorkTarget)
        ? memory.repairWorkTarget : null,
      amount: 0,
      priority: null,
      reason: 'live specialist repair continuation',
      place: text(memory.repairWorkTarget)
        ? memory.repairWorkTarget : roomName,
      releaseKeys: ['repairWorkTarget']
    },
    invalidReason
  };
};

/** Read existing memory without creating or mutating another job schema. */
const readDurableJob = memory => {
  const source = memory && typeof memory === 'object' ? memory : {};
  // A present canonical workJob remains authoritative even when malformed.
  // Silently falling through to a specialist field would create two owners.
  if (source.workJob != null) {
    return {
      job: source.workJob && typeof source.workJob === 'object'
        ? workJobView(source.workJob) : null,
      invalidReason: validateWorkJob(source.workJob)
    };
  }
  if (source.repairWorkTarget != null) return specialistRepairView(source);
  return { job: null, invalidReason: null };
};

const result = ({ job, status, retain, releaseReason = null,
  invalidReason = null }) => ({
  job,
  status,
  retain,
  shouldRelease: Boolean(job) && !retain,
  releaseReason,
  invalidReason,
  consumers: {
    protectFromRecycle: retain,
    coversSpawnDemand: retain,
    availableForPlanning: !retain
  },
  telemetry: {
    authority: job && job.authority || null,
    lane: job && job.lane || null,
    roomName: job && job.roomName || null,
    sourceId: job && job.sourceId || null,
    targetId: job && job.targetId || null,
    place: job && job.place || null,
    state: status
  }
});

/**
 * Decide whether existing durable ownership continues. Observations describe
 * the world; this function never clears memory or authorizes a replacement.
 */
const evaluateDurableJob = ({ memory, observation = {},
  unreachableLimit = 5 } = {}) => {
  const { job, invalidReason } = readDurableJob(memory);
  if (invalidReason) return result({ job, status: 'invalid', retain: false,
    releaseReason: 'invalid-job', invalidReason });
  if (!job) return result({ job: null, status: 'unassigned', retain: false });

  const targetState = observation.targetState || 'valid';
  if (observation.complete || targetState === 'complete') {
    return result({ job, status: 'complete', retain: false,
      releaseReason: 'complete' });
  }
  if (targetState === 'missing' || targetState === 'invalid') {
    return result({ job, status: 'invalid', retain: false,
      releaseReason: `target-${targetState}` });
  }
  const unreachableTicks = Number.isFinite(observation.unreachableTicks)
    ? Math.max(0, observation.unreachableTicks) : 0;
  const limit = Number.isFinite(unreachableLimit)
    ? Math.max(1, unreachableLimit) : 5;
  if (observation.routeState === 'unreachable' &&
      unreachableTicks >= limit) {
    return result({ job, status: 'invalid', retain: false,
      releaseReason: 'unreachable' });
  }
  if (observation.preempted) {
    return result({ job, status: 'released', retain: false,
      releaseReason: 'survival-preempted' });
  }
  if (observation.released) {
    return result({ job, status: 'released', retain: false,
      releaseReason: 'policy-release' });
  }
  if (observation.cpuDeferred) {
    return result({ job, status: 'cpu-deferred', retain: true });
  }
  if (observation.policyParked) {
    return result({ job, status: 'policy-parked', retain: true });
  }
  const phase = ['traveling', 'loading', 'executing']
    .includes(observation.phase) ? observation.phase
      : observation.needsLoad ? 'loading'
        : observation.atTarget === false ? 'traveling' : 'executing';
  return result({ job, status: phase, retain: true });
};

module.exports = { validateWorkJob, readDurableJob, evaluateDurableJob };
