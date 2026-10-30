'use strict';

const assert = require('assert');
const { createMinimumSpawnPlanner } = require('./minimum.spawn');
const { createStaffingPlanner } = require('./staffing.plan');

const source = { id: 's1' };
const creep = (role, options = {}) => ({
  spawning: false,
  memory: { role, ...options.memory },
  getActiveBodyparts: part => part === 'work' ? options.work || 0 : 0
});
const predicates = {
  hasLocalReplacementLife: () => true,
  hasRemoteReplacementLife: () => true,
  hasWorkParts: candidate => candidate.getActiveBodyparts('work') > 0,
  isBuilder: (candidate, scope, mission) =>
    candidate.memory.role === 'builder' &&
    candidate.memory.builderScope === scope &&
    candidate.memory.builderMission === mission,
  isLocalBuilder: candidate => candidate.memory.role === 'builder' &&
    candidate.memory.builderScope === 'local'
};
const buildPlan = createStaffingPlanner(predicates).buildRoomStaffingPlan;
const planner = createMinimumSpawnPlanner({
  getRoomSources: () => [source],
  getSource2TunnelSite: () => ({ id: 'tunnel' }),
  hasBuilderBody: candidate => candidate.builderBody === true,
  workerCost: 200
}).planMinimumSpawn;
const room = { name: 'W1N1', memory: {}, energyCapacityAvailable: 800 };
const roles = {
  source: { min: 1 }, refiller: { min: 1 }, upgrader: { min: 1 },
  repairBuilder: { min: 1 }, builder: { min: 0 }, hauler: { min: 0 },
  tunnelBuilder: { min: 0 }, rebalancer: { min: 0 }
};
const covered = new Set(['extensions']);
const baseWorkers = [
  creep('upgrader', { work: 4, memory: { home: 'W1N1' } }),
  creep('harvester', { work: 3,
    memory: { home: 'W1N1', preferredSource: 's1' } }),
  creep('refiller', { memory: {
    home: 'W1N1', refillClusterId: 'extensions'
  } })
];
const repair = planner({
  room, workers: baseWorkers,
  staffingPlan: buildPlan(room, baseWorkers, { roles, remote: {} }),
  replacementCluster: null, recoveryEnergy: 700,
  refillerMinimumEnergy: 700
});
assert.strictEqual(repair.handled, true);
assert.strictEqual(repair.gap.role, 'repairBuilder');
assert.strictEqual(repair.request.builderMission, 'repair');

const missingSource = planner({
  room, workers: [baseWorkers[0], baseWorkers[2]],
  staffingPlan: buildPlan(room, [baseWorkers[0], baseWorkers[2]], {
    roles: { ...roles, repairBuilder: { min: 0 } }, remote: {}
  }),
  replacementCluster: null,
  recoveryEnergy: 500, refillerMinimumEnergy: 700
});
assert.strictEqual(missingSource.gap.role, 'source');
assert.strictEqual(missingSource.request.role, 'harvester');
assert.strictEqual(missingSource.request.preferredSource, source);

const convertible = creep('hauler', { work: 1 });
convertible.builderBody = true;
const builderGap = planner({
  room, workers: [...baseWorkers, convertible],
  staffingPlan: buildPlan(room, [...baseWorkers, convertible], {
    roles: { ...roles, repairBuilder: { min: 0 }, builder: { min: 1 } },
    remote: {}
  }),
  replacementCluster: null,
  recoveryEnergy: 500, refillerMinimumEnergy: 700
});
assert.strictEqual(builderGap.handled, true);
assert.strictEqual(builderGap.gap.role, 'builder');
assert.strictEqual(builderGap.request, null);

console.log('minimum spawn scenarios passed');
