'use strict';

const LOCAL_MINIMUM_JOBS = Object.freeze([
  'defender', 'source', 'upgrader', 'refiller', 'hauler', 'rebalancer',
  'builder', 'repairBuilder', 'tunnelBuilder'
]);
const REMOTE_MINIMUM_JOBS = Object.freeze([
  'remoteMiner', 'remoteHauler', 'remoteBuilder', 'remoteReserver'
]);
const BASELINE_JOB_FAMILIES = Object.freeze({
  builder: Object.freeze(['builder', 'repairBuilder', 'tunnelBuilder'])
});

const assignmentJobKey = assignment => {
  if (!assignment) return null;
  if (assignment.role === 'harvester' || assignment.role === 'miner') {
    return 'source';
  }
  if (assignment.role === 'remote-miner') return 'remoteMiner';
  if (assignment.role === 'remote-hauler') return 'remoteHauler';
  if (assignment.role === 'remote-reserver') return 'remoteReserver';
  if (assignment.role === 'builder') {
    if (assignment.builderScope === 'outpost') return 'remoteBuilder';
    if (assignment.builderMission === 'repair') return 'repairBuilder';
    if (assignment.builderMission === 'tunnel') return 'tunnelBuilder';
    return 'builder';
  }
  return assignment.role;
};

const firstGap = (staffingPlan, keys) => keys.map(key =>
  staffingPlan && staffingPlan.jobs && staffingPlan.jobs[key])
  .filter(job => job && job.coverageCount < job.min)
  .sort((a, b) => a.coverageCount / Math.max(1, a.min) -
    b.coverageCount / Math.max(1, b.min) || a.key.localeCompare(b.key))[0] ||
  null;

const selectedGap = (staffingPlan, keys) => {
  const selected = staffingPlan &&
    (staffingPlan.minimumGap || staffingPlan.ordinaryMinimumGap);
  if (selected && keys.includes(selected.role)) {
    return staffingPlan.jobs && staffingPlan.jobs[selected.role] ||
      { key: selected.role, coverageCount: selected.count || 0,
        min: selected.minimum || 1 };
  }
  return firstGap(staffingPlan, keys);
};

const classifyPhase = (assignment, staffingPlan) => {
  if (!assignment) return 'idle';
  const key = assignmentJobKey(assignment);
  if (staffingPlan && staffingPlan.baselineGap) return 'baseline';
  if (selectedGap(staffingPlan, LOCAL_MINIMUM_JOBS)) return 'local-minimum';
  if (selectedGap(staffingPlan, REMOTE_MINIMUM_JOBS)) return 'remote-minimum';
  if (assignment.role === 'controller-relay' ||
      assignment.builderMission === 'tunnel') return 'stage-capability';
  if (assignment.expansionTarget) return 'expansion';
  if (REMOTE_MINIMUM_JOBS.includes(key)) return 'remote-desired';
  return 'local-desired';
};

/**
 * Final invariant gate for every spawn request.
 *
 * Planners may propose work, but no proposal can bypass an earlier uncovered
 * staffing tier. This is intentionally independent of branch order in the
 * caller so future feature code cannot silently reintroduce priority leaks.
 */
const authorizeSpawnAssignment = ({ assignment, staffingPlan }) => {
  if (!assignment) {
    return { authorized: true, phase: 'idle', jobKey: null,
      reason: 'no authorized uncovered slot', assignment: null };
  }
  const jobKey = assignmentJobKey(assignment);
  const defenderGap = staffingPlan && staffingPlan.jobs &&
    staffingPlan.jobs.defender;
  if (jobKey === 'defender' && assignment.emergencyDefense) {
    return { authorized: true, phase: 'emergency-defense', jobKey,
      reason: 'active threat defender bypasses all staffing gates',
      assignment };
  }
  if (jobKey === 'defender' && defenderGap &&
      defenderGap.coverageCount < defenderGap.min) {
    return { authorized: true, phase: 'emergency-defense', jobKey,
      reason: 'active threat defender precedes every staffing gap',
      assignment };
  }
  const baselineGap = staffingPlan && staffingPlan.baselineGap;
  const localGap = selectedGap(staffingPlan, LOCAL_MINIMUM_JOBS);
  const localGapIsOptionalBuild = Boolean(localGap &&
    BASELINE_JOB_FAMILIES.builder.includes(localGap.key));
  if (assignment.emergencyPresence && !baselineGap && !localGap) {
    return { authorized: true, phase: 'room-presence', jobKey,
      reason: 'unoccupied claimed room presence precedes remote staffing gaps',
      assignment };
  }
  if (jobKey === 'remoteReserver' && !baselineGap &&
      (!localGap || localGapIsOptionalBuild) &&
      assignment.reservationDeadline !== undefined) {
    return { authorized: true, phase: 'reservation-emergency', jobKey,
      reason: 'expiring established reservation precedes non-baseline staffing gaps',
      assignment };
  }
  const baselineJobs = baselineGap &&
    (BASELINE_JOB_FAMILIES[baselineGap.role] || [baselineGap.role]);
  if (baselineGap && !baselineJobs.includes(jobKey)) {
    return { authorized: false, phase: 'baseline', jobKey,
      reason: `baseline ${baselineGap.role} precedes ${jobKey}`,
      assignment: null };
  }
  if (!baselineGap && jobKey === 'controller-relay' &&
      assignment.brigadeMaintenance &&
      (!localGap || localGapIsOptionalBuild)) {
    return { authorized: true, phase: 'stage-capability', jobKey,
      reason: 'authorized active brigade maintenance before optional work',
      assignment };
  }
  if (!baselineGap && localGap && jobKey !== localGap.key) {
    return { authorized: false, phase: 'local-minimum', jobKey,
      reason: `local minimum ${localGap.key} precedes ${jobKey}`,
      assignment: null };
  }
  if (!baselineGap && !localGap && jobKey === 'defender' &&
      assignment.manualDefense) {
    return { authorized: true, phase: 'manual-defense', jobKey,
      reason: 'bounded manual defense authorized after local survival minima',
      assignment };
  }
  if (!baselineGap && !localGap && assignment.bootstrapMaintenance &&
      assignment.role === 'builder' && assignment.builderScope === 'expansion' &&
      assignment.expansionTarget) {
    return { authorized: true, phase: 'owned-bootstrap', jobKey,
      reason: 'claimed room workforce precedes remote staffing and growth',
      assignment };
  }
  // A funded stationary line is an atomic capability: a partial roster moves
  // no energy to the controller. Once every local minimum is covered, finish
  // its active maintenance pass before ordinary remote roster gaps. The
  // caller must opt in explicitly; a generic controller-relay request retains
  // the normal remote-minimum ordering below.
  if (!baselineGap && !localGap && jobKey === 'controller-relay' &&
      assignment.brigadeMaintenance) {
    return { authorized: true, phase: 'stage-capability', jobKey,
      reason: 'authorized active brigade maintenance before remote minimum',
      assignment };
  }
  const remoteGap = selectedGap(staffingPlan, REMOTE_MINIMUM_JOBS);
  if (!baselineGap && !localGap && remoteGap &&
      jobKey !== remoteGap.key) {
    // A due replacement in an already-funded remote production lane protects
    // existing income. It may run within the remote-minimum tier even when a
    // different remote job has the lowest aggregate coverage ratio.
    if (jobKey === 'remoteMiner' && remoteGap.coverageCount > 0 &&
        assignment.replacementDeadline !== undefined) {
      return { authorized: true, phase: 'remote-minimum', jobKey,
        reason: `authorized due remoteMiner replacement before ${remoteGap.key}`,
        assignment };
    }
    return { authorized: false, phase: 'remote-minimum', jobKey,
      reason: `remote minimum ${remoteGap.key} precedes ${jobKey}`,
      assignment: null };
  }
  return { authorized: true, phase: classifyPhase(assignment, staffingPlan),
    jobKey, reason: `authorized ${jobKey}`, assignment };
};

module.exports = { LOCAL_MINIMUM_JOBS, REMOTE_MINIMUM_JOBS,
  assignmentJobKey, classifyPhase, authorizeSpawnAssignment };
