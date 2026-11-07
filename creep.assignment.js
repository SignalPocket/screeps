'use strict';

/**
 * Remove memory that is incompatible with a creep's current durable role.
 *
 * Reassignment changes more than `role`: old source slots, builder missions,
 * remote roster positions, task targets, and delivery commitments can all
 * continue driving behavior. This reconciler clears only fields owned by a
 * different role family and preserves fields that still describe the current
 * assignment. It does not select the new role; planners do that first.
 */
const transientFields = [
  'task', 'taskTarget', 'lastTask', 'workJob', 'demandLane',
  'demandLaneSince', 'dispatchCommitment', 'withdrawTarget', 'supplyTarget',
  'refillTarget', 'buildTarget', 'repairTarget', 'idleNow'
];
const sourceFields = [
  'preferredSource', 'harvestSource', 'harvestX', 'harvestY',
  'sourceReplacement', 'sourceReserve', 'minerSource', 'minerContainer',
  'minerX', 'minerY', 'sourceRecoveryPlanTick'
];
const builderFields = [
  'builderScope', 'builderMission', 'builderTarget', 'builderRosterRoom',
  'remoteRepairTarget', 'remoteRoadBuilding'
];
const remoteCommonFields = [
  'remoteHome', 'remoteRoom', 'remoteTeam', 'remoteDelivery', 'remoteRecall'
];
const remoteScoutFields = ['remoteSlot'];
const remoteHaulerFields = [
  'remoteHaulerSlot', 'remoteDispatchRoom', 'remotePickupTarget',
  'remoteHaulReturning', 'remoteCargoOrigin', 'remoteCargoRemaining',
  'remoteRosterSurplus'
];
const remoteBuilderFields = ['remoteBuilderSlot'];

const clear = (memory, fields) => {
  for (const field of fields) delete memory[field];
};

const reconcileCreepAssignment = creep => {
  if (!creep || !creep.memory) return false;
  const memory = creep.memory;
  // Pre-policy left-outpost identity is obsolete; remoteTeam + remoteSlot are
  // now the shared identity for every outpost.
  delete memory.leftScoutSlot;
  const role = memory.role;
  const changed = Boolean(memory.assignmentRole &&
    memory.assignmentRole !== role);
  if (changed) clear(memory, transientFields);

  const sourceRole = role === 'miner' || role === 'harvester' ||
    role === 'rebalancer';
  if (!sourceRole) clear(memory, sourceFields);

  const builderRole = role === 'builder';
  if (!builderRole) clear(memory, builderFields);
  if (!builderRole) {
    delete memory.assignmentBuilderMission;
  } else if (memory.assignmentBuilderMission) {
    // The durable staffing assignment owns the specialty. Dispatch may give a
    // repair builder fallback build/upgrade work, but that must not silently
    // turn it into a generic builder and reopen the same staffing slot.
    memory.builderMission = memory.assignmentBuilderMission;
  }

  const remoteScout = role === 'remote-miner';
  const remoteReserver = role === 'remote-reserver';
  const remoteHauler = role === 'remote-hauler';
  const remoteBuilder = builderRole && memory.builderScope === 'outpost';
  if (!remoteScout) clear(memory, remoteScoutFields);
  if (!remoteHauler) clear(memory, remoteHaulerFields);
  if (!remoteBuilder) clear(memory, remoteBuilderFields);
  if (!remoteScout && !remoteHauler && !remoteBuilder && !remoteReserver) {
    clear(memory, remoteCommonFields);
  }

  if (role !== 'retire') {
    delete memory.staffingRetire;
    delete memory.retiredRole;
  }
  memory.assignmentRole = role;
  return changed;
};

const reconcileCreepAssignments = creeps => {
  let changed = 0;
  for (const creep of creeps || []) {
    if (reconcileCreepAssignment(creep)) changed++;
  }
  return changed;
};

module.exports = { reconcileCreepAssignment, reconcileCreepAssignments };
