'use strict';

const transientFields = [
  'task', 'taskTarget', 'lastTask', 'workJob', 'demandLane',
  'demandLaneSince', 'dispatchCommitment', 'withdrawTarget', 'supplyTarget',
  'refillTarget', 'buildTarget', 'repairTarget', 'idleNow'
];
const sourceFields = [
  'preferredSource', 'harvestSource', 'harvestX', 'harvestY',
  'sourceReplacement', 'sourceReserve', 'minerSource', 'minerContainer',
  'minerX', 'minerY'
];
const builderFields = [
  'builderScope', 'builderMission', 'builderTarget', 'builderRosterRoom',
  'remoteRepairTarget', 'remoteRoadBuilding'
];
const remoteCommonFields = [
  'remoteHome', 'remoteRoom', 'remoteTeam', 'remoteDelivery', 'remoteRecall'
];
const remoteScoutFields = ['remoteSlot', 'leftScoutSlot'];
const remoteHaulerFields = [
  'remoteHaulerSlot', 'remoteDispatchRoom', 'remotePickupTarget',
  'remoteHaulReturning', 'remoteCargoOrigin', 'remoteRosterSurplus'
];
const remoteBuilderFields = ['remoteBuilderSlot'];

const clear = (memory, fields) => {
  for (const field of fields) delete memory[field];
};

const reconcileCreepAssignment = creep => {
  if (!creep || !creep.memory) return false;
  const memory = creep.memory;
  const role = memory.role;
  const changed = Boolean(memory.assignmentRole &&
    memory.assignmentRole !== role);
  if (changed) clear(memory, transientFields);

  const sourceRole = role === 'miner' || role === 'harvester' ||
    role === 'rebalancer';
  if (!sourceRole) clear(memory, sourceFields);

  const builderRole = role === 'builder';
  if (!builderRole) clear(memory, builderFields);

  const remoteScout = role === 'remote-scout';
  const remoteHauler = role === 'remote-hauler';
  const remoteBuilder = builderRole && memory.builderScope === 'outpost';
  if (!remoteScout) clear(memory, remoteScoutFields);
  if (!remoteHauler) clear(memory, remoteHaulerFields);
  if (!remoteBuilder) clear(memory, remoteBuilderFields);
  if (!remoteScout && !remoteHauler && !remoteBuilder) {
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
