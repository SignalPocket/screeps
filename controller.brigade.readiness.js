'use strict';

const MAX_BUILD_REMAINING = 5000;
const MAX_REPAIR_REMAINING = 10000;
const ESSENTIAL_JOBS = [
  'source', 'refiller', 'hauler', 'upgrader', 'rebalancer',
  'builder', 'repairBuilder', 'tunnelBuilder',
  'remoteMiner', 'remoteHauler', 'remoteBuilder'
];
// An established stationary brigade is one atomic energy line: a partial
// roster cannot carry storage energy to the controller end. During recovery,
// protect the jobs that keep the owned room alive, then allow the line to
// rebuild without waiting for optional construction or remote growth.
const MAINTENANCE_JOBS = ['source', 'refiller', 'hauler', 'upgrader'];

const staffingBlockers = (jobs, keys) => keys.reduce((blockers, key) => {
  const job = jobs[key];
  if (job && job.min > 0 && job.coverageCount < job.min) {
    blockers.push(`${key} staffing ${job.coverageCount}/${job.min}`);
  }
  return blockers;
}, []);

const maintenanceStaffingBlockers = jobs => MAINTENANCE_JOBS.reduce(
  (blockers, key) => {
    const job = jobs[key];
    if (!job || job.min <= 0) return blockers;
    // Mining keeps its complete protected floor. The other energy lanes need
    // one viable owner so demand-driven desired counts cannot permanently
    // prevent an already-built atomic brigade from recovering.
    const required = key === 'source' ? job.min : 1;
    if (job.coverageCount < required) {
      blockers.push(`${key} staffing ${job.coverageCount}/${required}`);
    }
    return blockers;
  }, []);

// Starting a brigade is optional and follows the current colony-health
// permission. Maintaining an already-seated stationary line is different: a
// partial line consumes its whole roster but cannot move energy end to end.
// Once the core energy jobs are covered, repair that atomic line even if a
// temporary health downgrade has paused creation of a brand-new brigade.
const selectControllerBrigadeReplacementMode = ({
  permitted, ready, maintenanceReady, established, activeCount,
  operationActive = false, rcl
}) => permitted && ready
  ? 'full'
  : established && (activeCount > 0 || operationActive) &&
      rcl >= 5 && maintenanceReady
    ? 'maintenance' : 'paused';

const shouldRestoreBrigadeBeforeRemoteDefense = ({
  homeRoom, threatRoom, activeCount, targetCount, maintenanceReady,
  exposedFriendly = false
}) => Boolean(threatRoom && threatRoom !== homeRoom && maintenanceReady &&
  !exposedFriendly && activeCount > 0 && activeCount < targetCount);

const shouldDeferRemoteDefenseForHomeRecovery = ({
  homeRoom, threatRoom, maintenanceReady, exposedFriendly = false
}) => Boolean(threatRoom && threatRoom !== homeRoom && !maintenanceReady &&
  !exposedFriendly);

const getEmergencyDefenderRequirement = (hostileCount,
  existingRequirement = 1, maximum = 5) => Math.max(existingRequirement,
  Math.min(maximum, Math.max(0, hostileCount)));

const evaluateControllerBrigadeReadiness = (situation, staffingPlan) => {
  const signals = situation && situation.signals || {};
  const jobs = staffingPlan && staffingPlan.jobs || {};
  const buildRemaining = Math.max(0, signals.buildRemaining || 0);
  const repairRemaining = Math.max(0, signals.repairRemaining || 0);
  const blockers = [];

  if (signals.repairCritical) blockers.push('critical repairs');
  if (buildRemaining > MAX_BUILD_REMAINING) {
    blockers.push(`build backlog ${Math.round(buildRemaining)}`);
  }
  if (repairRemaining > MAX_REPAIR_REMAINING) {
    blockers.push(`repair backlog ${Math.round(repairRemaining)}`);
  }
  blockers.push(...staffingBlockers(jobs, ESSENTIAL_JOBS));
  const maintenanceBlockers = [];
  maintenanceBlockers.push(...maintenanceStaffingBlockers(jobs));

  return {
    version: 1,
    ready: blockers.length === 0,
    maintenanceReady: maintenanceBlockers.length === 0,
    maintenanceBlockers,
    buildRemaining,
    repairRemaining,
    repairCritical: Boolean(signals.repairCritical),
    blockers
  };
};

module.exports = {
  MAX_BUILD_REMAINING,
  MAX_REPAIR_REMAINING,
  ESSENTIAL_JOBS,
  MAINTENANCE_JOBS,
  selectControllerBrigadeReplacementMode,
  shouldRestoreBrigadeBeforeRemoteDefense,
  shouldDeferRemoteDefenseForHomeRecovery,
  getEmergencyDefenderRequirement,
  evaluateControllerBrigadeReadiness
};
