'use strict';

const assert = require('assert');
const { createRemoteSpawnPlanner } = require('./remote.spawn');

const planner = createRemoteSpawnPlanner({
  isOutpostBuilder: creep => creep.memory.builderScope === 'outpost',
  hasRemoteReplacementLife: creep => creep.viable !== false,
  getRemoteHaulReadiness: (roomName, slot) => ({
    ready: roomName !== 'W2N2' || slot !== 0
  }),
  getRemoteReplacementLead: () => 100,
  BODYPART_COST: { work: 100, carry: 50, move: 50 },
  WORK: 'work', CARRY: 'carry', MOVE: 'move'
});

const ownershipAwarePlanner = createRemoteSpawnPlanner({
  isOutpostBuilder: creep => creep.memory.builderScope === 'outpost',
  hasRemoteReplacementLife: creep => creep.viable !== false,
  getRemoteHaulReadiness: () => ({ ready: true }),
  getRemoteReplacementLead: () => 100,
  isOwnedRoom: roomName => roomName === 'W2N1',
  BODYPART_COST: { work: 100, carry: 50, move: 50 },
  WORK: 'work', CARRY: 'carry', MOVE: 'move'
});

const room = {
  energyCapacityAvailable: 650,
  memory: {
    leftSurvey: { active: true, targetRoom: 'W2N1',
      remoteMinerTarget: 1, remoteHaulerTarget: 2,
      remoteBuilderTarget: 1,
      remoteWorkNeeds: [{ slot: 0, minMiners: 1, requiredWork: 3 }] },
    southSurvey: { active: true, targetRoom: 'W2N2',
      remoteMinerTarget: 1, remoteHaulerTarget: 1,
      remoteBuilderTarget: 0,
      remoteWorkNeeds: [{ slot: 0, minMiners: 1, requiredWork: 2 }] }
  }
};
const job = (count, minimum, desired, coverageCount = count) => ({
  count, min: minimum, desired, coverageCount
});
const staffing = (remoteBuilder, remoteHauler, remoteMiner,
  selectedRole = null) => {
  const jobs = { remoteBuilder: { key: 'remoteBuilder', ...remoteBuilder },
    remoteHauler: { key: 'remoteHauler', ...remoteHauler },
    remoteMiner: { key: 'remoteMiner', ...remoteMiner } };
  const selected = selectedRole && jobs[selectedRole] ||
    Object.values(jobs).filter(entry => entry.coverageCount < entry.min)
      .sort((a, b) => a.coverageCount / Math.max(1, a.min) -
        b.coverageCount / Math.max(1, b.min) ||
        a.key.localeCompare(b.key))[0] || null;
  return { jobs, minimumGap: selected && {
    role: selected.key, count: selected.coverageCount,
    minimum: selected.min
  } };
};

assert.deepStrictEqual(ownershipAwarePlanner.getPlans(room)
  .map(entry => entry.survey.targetRoom), ['W2N2'],
'an owned neighbor is no longer a remote staffing or export plan');

assert.strictEqual(planner.planMinimumRemoteSpawn({
  room, workers: [], staffingPlan: staffing(job(0, 1, 1),
    job(0, 2, 3), job(0, 2, 2)), maintainRemotes: false
}), null);

let request = planner.planMinimumRemoteSpawn({
  room, workers: [], staffingPlan: staffing(job(0, 1, 1),
    job(0, 2, 3), job(0, 2, 2)), maintainRemotes: true
});
assert.strictEqual(request.role, 'builder');
assert.strictEqual(request.remoteRoom, 'W2N1');

const twoBuilderRoom = {
  ...room,
  memory: { ...room.memory, leftSurvey: {
    ...room.memory.leftSurvey, remoteBuilderTarget: 2
  } }
};
request = planner.planMinimumRemoteSpawn({
  room: twoBuilderRoom,
  workers: [{ memory: { role: 'builder', builderScope: 'outpost',
    remoteRoom: 'W2N1', remoteBuilderSlot: 0 }, viable: true }],
  staffingPlan: staffing(job(1, 2, 2), job(2, 2, 3), job(2, 2, 2)),
  maintainRemotes: true
});
assert.strictEqual(request.role, 'builder');
assert.strictEqual(request.builderScope, 'outpost');
assert.strictEqual(request.remoteRoom, 'W2N1');
assert.strictEqual(request.remoteBuilderSlot, 1,
  'minimum planning fills every physical builder slot, not one per room');

request = planner.planMinimumRemoteSpawn({
  room, workers: [], staffingPlan: staffing(job(1, 1, 1),
    job(0, 2, 3), job(0, 2, 2)), maintainRemotes: true
});
assert.strictEqual(request.role, 'remote-hauler');
assert.strictEqual(request.remoteRoom, 'W2N1');

request = planner.planMinimumRemoteSpawn({
  room,
  workers: [{ memory: { role: 'remote-hauler', remoteRoom: 'W2N1',
    remoteHaulerSlot: 0 }, viable: true }],
  staffingPlan: staffing(job(1, 1, 1), job(1, 2, 3, 1),
    job(2, 2, 2)), maintainRemotes: true
});
assert.strictEqual(request, null,
  'an unready uncovered room must not create a carrier request');

request = planner.planMinimumRemoteSpawn({
  room, workers: [], staffingPlan: staffing(job(1, 1, 1),
    job(2, 2, 3, 2), job(0, 2, 2)), maintainRemotes: true
});
assert.strictEqual(request.role, 'remote-miner');
assert.strictEqual(request.minimumEnergy, 450);

assert.strictEqual(planner.planRemoteGrowthSpawn({
  room, workers: [], staffingPlan: staffing(job(0, 0, 0),
    job(3, 2, 3), job(2, 2, 2)), allowRemoteGrowth: true
}), null, 'aggregate desired coverage must stop survey-based growth');

request = planner.planRemoteGrowthSpawn({
  room,
  workers: [{ memory: { role: 'remote-hauler', remoteRoom: 'W2N1',
    remoteHaulerSlot: 0 }, viable: true }],
  staffingPlan: staffing(job(0, 0, 1), job(1, 2, 3), job(2, 2, 2)),
  allowRemoteGrowth: true
});
assert.strictEqual(request.role, 'remote-hauler');
assert.strictEqual(request.remoteRoom, 'W2N1');
assert.strictEqual(request.remoteHaulerSlot, 1);
assert.strictEqual(request.minimumEnergy, 300);

request = planner.planRemoteGrowthSpawn({
  room,
  workers: [{ memory: { role: 'remote-hauler', remoteRoom: 'W2N1',
    remoteHaulerSlot: 0 }, viable: true }],
  staffingPlan: staffing(job(0, 0, 1), job(1, 2, 3), job(2, 2, 2)),
  allowRemoteGrowth: false,
  allowRemoteHaulingRecovery: true
});
assert.strictEqual(request.role, 'remote-hauler');
assert.strictEqual(request.remoteHaulerSlot, 1);
assert.strictEqual(request.minimumEnergy, 300);

assert.strictEqual(planner.planRemoteGrowthSpawn({
  room,
  workers: [
    { memory: { role: 'remote-hauler', remoteRoom: 'W2N1',
      remoteHaulerSlot: 0 }, viable: true },
    { memory: { role: 'remote-hauler', remoteRoom: 'W2N1',
      remoteHaulerSlot: 1 }, viable: true },
    { memory: { role: 'remote-hauler', remoteRoom: 'W2N2',
      remoteHaulerSlot: 0 }, viable: true }
  ],
  staffingPlan: staffing(job(0, 0, 1), job(3, 2, 3), job(2, 2, 2)),
  allowRemoteGrowth: false,
  allowRemoteHaulingRecovery: true
}), null, 'haul recovery must not reopen remote builder growth');

request = planner.planRemoteGrowthSpawn({
  room,
  workers: [
    { memory: { role: 'remote-hauler', remoteRoom: 'W2N1',
      remoteHaulerSlot: 0 }, viable: true },
    { memory: { role: 'remote-hauler', remoteRoom: 'W2N1',
      remoteHaulerSlot: 1 }, viable: true },
    { memory: { role: 'remote-hauler', remoteRoom: 'W2N2',
      remoteHaulerSlot: 0 }, viable: true }
  ],
  staffingPlan: staffing(job(0, 0, 1), job(3, 2, 3), job(2, 2, 2)),
  allowRemoteGrowth: true
});
assert.strictEqual(request.role, 'builder');
assert.strictEqual(request.remoteRoom, 'W2N1');

console.log('remote spawn scenarios passed');

room.memory.leftSurvey.deliveryPolicy = { blocked: true };
room.memory.southSurvey.deliveryPolicy = { blocked: true };
request = planner.planMinimumRemoteSpawn({ room, workers: [],
  staffingPlan: staffing(job(0, 1, 1), job(0, 2, 3), job(0, 2, 2)),
  maintainRemotes: true });
assert.strictEqual(request, null,
  'a blocked builder gap cannot silently change the selected job');
request = planner.planMinimumRemoteSpawn({ room, workers: [],
  staffingPlan: staffing(job(0, 1, 1), job(0, 2, 3),
    job(0, 2, 2), 'remoteHauler'),
  maintainRemotes: true });
assert.strictEqual(request.role, 'remote-hauler');
request = planner.planMinimumRemoteSpawn({ room, workers: [],
  staffingPlan: staffing(job(0, 0, 0), job(3, 2, 3), job(0, 2, 2)),
  maintainRemotes: true });
assert.strictEqual(request, null, 'blocked outposts cannot replace miners');

delete room.memory.leftSurvey.deliveryPolicy;
delete room.memory.southSurvey.deliveryPolicy;
const weakCoveredMiner = {
  memory: { role: 'remote-miner', remoteRoom: 'W2N1', remoteSlot: 0 },
  ticksToLive: 1000, body: [{ type: 'work', hits: 100 }]
};
const uncoveredRequest = planner.planMinimumRemoteSpawn({
  room, workers: [weakCoveredMiner],
  staffingPlan: staffing(job(1, 1, 1), job(2, 2, 3, 2), job(1, 2, 2)),
  maintainRemotes: true
});
assert.strictEqual(uncoveredRequest.remoteRoom, 'W2N2',
  'empty source lanes precede extra WORK on an already occupied lane');
const expiringCarrier = { viable: false, memory: {
  role: 'remote-hauler', remoteRoom: 'W2N1', remoteHaulerSlot: 0 } };
const replacementExport = planner.planRemoteGrowthSpawn({ room,
  workers: [expiringCarrier],
  staffingPlan: staffing(job(0, 0, 0), job(3, 2, 3, 2), job(2, 2, 2)),
  allowRemoteGrowth: false, allowRemoteHaulingRecovery: true });
assert(replacementExport, 'expiring carrier headcount must not hide missing route capacity');
assert.strictEqual(replacementExport.role, 'remote-hauler');
console.log('established route replacement uses viable coverage instead of raw headcount');
const fs = require('fs');
const source = fs.readFileSync(require.resolve('./main'), 'utf8');
const minimumIndex = source.indexOf(
  '    const minimumPlan = planMinimumSpawn({');
const remoteMinerIndex = source.indexOf(
  '    const expiringRemoteMiner =');
const remoteHaulIndex = source.indexOf(
  '    const establishedHaulRequest =');
assert(minimumIndex >= 0 && minimumIndex < remoteMinerIndex);
assert(minimumIndex < remoteHaulIndex);
console.log('local minimum staffing precedes remote replacement and recovery');
// Source deadlines override aggregate headcount and ignore duplicate spawns.
const dueMiner = {memory:{role:'remote-miner',remoteRoom:'W2N1',remoteSlot:0},
 viable:false,ticksToLive:50,body:[{type:'work',hits:100}]};
const urgent = planner.planRemoteMinerReplacement({room,workers:[dueMiner],maintainRemotes:true});
assert(urgent);assert.strictEqual(urgent.remoteRoom,'W2N2',
 'an empty source is more urgent than a source still working during its replacement window');
const coveredOther = {memory:{role:'remote-miner',remoteRoom:'W2N2',remoteSlot:0},
 viable:true,ticksToLive:1000};
const targeted = planner.planRemoteMinerReplacement({room,workers:[dueMiner,coveredOther],maintainRemotes:true});
assert.strictEqual(targeted.remoteRoom,'W2N1');
assert.strictEqual(targeted.requiredWork,3);
const spawningReplacement = {...dueMiner,spawning:true,viable:true};
assert.strictEqual(planner.planRemoteMinerReplacement({room,
 workers:[dueMiner,spawningReplacement,coveredOther],maintainRemotes:true}),null);
console.log('per-source deadlines replace miners before expiry without duplicate replacements');

const selectedHauler = planner.planMinimumRemoteSpawn({
  room,
  workers: [],
  staffingPlan: staffing(job(8, 10, 10, 8),
    job(11, 3, 28, 2), job(9, 6, 6, 9), 'remoteHauler'),
  maintainRemotes: true
});
assert.strictEqual(selectedHauler.role, 'remote-hauler');
assert.strictEqual(selectedHauler.builderScope, undefined,
  'the selected staffing gap is the only job the mapper may return');
