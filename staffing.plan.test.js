'use strict';

const assert = require('assert');
const { createStaffingPlanner } = require('./staffing.plan');

const viable = () => true;
const planner = createStaffingPlanner({
  isBuilder: (creep, scope, mission) => creep.memory.role === 'builder' &&
    creep.memory.builderScope === scope &&
    (!mission || creep.memory.builderMission === mission),
  isLocalBuilder: creep => creep.memory.role === 'builder' &&
    creep.memory.builderScope === 'local',
  hasWorkParts: creep => creep.work > 0,
  hasLocalReplacementLife: viable,
  hasRemoteReplacementLife: viable,
  getRoomSources: () => [{ id: 's1' }]
}).buildRoomStaffingPlan;
const role = (min = 0, desired = min, max = desired) =>
  ({ min, desired, max });
const policy = {
  roles: {
    source: role(1), refiller: role(1), hauler: role(1, 2, 3),
    rebalancer: role(), upgrader: role(1), builder: role(),
    repairBuilder: role(), tunnelBuilder: role()
  },
  remote: {
    minersMin: 1, miners: 1,
    haulersMin: 1, haulers: 5,
    buildersMin: 0, builders: 0
  }
};
const room = {
  name: 'W1N1',
  memory: {
    leftSurvey: {
      active: true, targetRoom: 'W1N2', remoteMinerTarget: 1,
      remoteHaulerTarget: 5, remoteBuilderTarget: 0
    }
  }
};
const make = (roleName, extra = {}) => ({
  work: extra.work || 0,
  memory: { home: 'W1N1', role: roleName, ...extra.memory }
});
const creeps = [
  make('harvester', { work: 3, memory: { preferredSource: 's1' } }),
  make('refiller', { memory: { refillClusterId: 'spawn' } }),
  make('hauler'),
  make('upgrader', { work: 4 }),
  make('remote-scout', { work: 2,
    memory: { remoteRoom: 'W1N2', remoteSlot: 0 } }),
  ...Array.from({ length: 8 }, (_, index) => make('remote-hauler', {
    memory: { remoteRoom: 'W1N2', remoteHaulerSlot: index }
  }))
];
const plan = planner(room, creeps, policy);
assert.strictEqual(plan.jobs.remoteHauler.count, 8);
assert.strictEqual(plan.jobs.remoteHauler.coverageCount, 1);
assert.strictEqual(plan.jobs.remoteHauler.min, 1);
assert.strictEqual(plan.jobs.remoteHauler.desired, 5);
assert.notStrictEqual(plan.minimumGap && plan.minimumGap.role,
  'remoteHauler');
assert.strictEqual(plan.minimumGap, null);
assert.deepStrictEqual(plan.emergency.missing, []);

const missingOutpostCoverage = planner({
  ...room,
  memory: {
    ...room.memory,
    southSurvey: {
      active: true, targetRoom: 'W1N3', remoteMinerTarget: 0,
      remoteHaulerTarget: 2, remoteBuilderTarget: 0
    }
  }
}, creeps, {
  ...policy,
  remote: { ...policy.remote, minersMin: 2, miners: 2,
    haulersMin: 2, haulers: 7 }
});
assert.strictEqual(missingOutpostCoverage.jobs.remoteHauler.count, 8);
assert.strictEqual(missingOutpostCoverage.jobs.remoteHauler.coverageCount, 1);
assert.strictEqual(missingOutpostCoverage.minimumGap.role, 'remoteHauler');

console.log('staffing plan scenarios passed');
