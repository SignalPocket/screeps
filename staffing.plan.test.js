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
  make('builder', { work: 2, memory: { builderScope: 'local',
    builderMission: 'flexible' } }),
  make('remote-miner', { work: 2,
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

const blockedRoutePriority = planner({
  ...room,
  memory: {
    ...room.memory,
    southSurvey: {
      active: true, targetRoom: 'W1N3', remoteMinerTarget: 0,
      remoteHaulerTarget: 2, remoteBuilderTarget: 3,
      deliveryPolicy: { blocked: true }
    }
  }
}, creeps, {
  ...policy,
  remote: { ...policy.remote, minersMin: 1, miners: 1,
    haulersMin: 2, haulers: 7, buildersMin: 3, builders: 3 }
});
assert.strictEqual(blockedRoutePriority.minimumGap.role, 'remoteHauler',
  'a blocked outpost without a carrier makes hauling the central prerequisite');

console.log('staffing plan scenarios passed');
const coreGap=planner(room,creeps,{...policy,roles:{...policy.roles,rebalancer:role(1),upgrader:role(2)}});
assert.strictEqual(coreGap.minimumGap.role,'upgrader','an empty optional balancer slot cannot hide the second required upgrader');

const rebalancerBeforeRemote = planner(room, creeps, {
  ...policy,
  roles: { ...policy.roles, rebalancer: role(1) },
  remote: { ...policy.remote, haulersMin: 2, haulers: 5 }
});
assert.strictEqual(rebalancerBeforeRemote.minimumGap.role, 'rebalancer',
  'a required rebalancer is restored before a remote roster gap');

const remoteBuilderCreeps = [
  ...creeps,
  make('builder', { work: 2, memory: { builderScope: 'outpost',
    remoteRoom: 'W1N2', remoteBuilderSlot: 0 } }),
  make('builder', { work: 2, memory: { builderScope: 'outpost',
    remoteRoom: 'W1N2', remoteBuilderSlot: 1 } })
];
const remoteBuilderPlan = planner({
  ...room,
  memory: { leftSurvey: { ...room.memory.leftSurvey,
    remoteBuilderTarget: 3 } }
}, remoteBuilderCreeps, {
  ...policy,
  remote: { ...policy.remote, buildersMin: 3, builders: 3 }
});
assert.strictEqual(remoteBuilderPlan.jobs.remoteBuilder.count, 2);
assert.strictEqual(remoteBuilderPlan.jobs.remoteBuilder.coverageCount, 2,
  'remote builder minimum counts covered physical slots, not rooms');
assert.strictEqual(remoteBuilderPlan.minimumGap.role, 'remoteBuilder');

const bootstrapPolicy = {
  roles: {
    source: role(2), refiller: role(2), hauler: role(1),
    rebalancer: role(), upgrader: role(2), builder: role(),
    repairBuilder: role(), tunnelBuilder: role()
  },
  remote: {}
};
const minerOnly = [make('harvester', {
  work: 3, memory: { preferredSource: 's1' }
})];
const minerPlan = planner(room, minerOnly, bootstrapPolicy);
assert.strictEqual(minerPlan.baselineGap.key, 'upgrader');
assert.strictEqual(minerPlan.minimumGap.role, 'upgrader',
  'a second miner and filler minimum cannot preempt the baseline upgrader');

const throughFiller = [
  ...minerOnly,
  make('upgrader', { work: 1 }),
  make('refiller', { memory: { refillClusterId: 'spawn' } })
];
const builderFloor = planner(room, throughFiller, bootstrapPolicy);
assert.strictEqual(builderFloor.jobs.builder.min, 0);
assert.strictEqual(builderFloor.baselineGap.key, 'builderFixer');
assert.strictEqual(builderFloor.minimumGap.role, 'builder',
  'builder/fixer remains a baseline job even with no current queue');
