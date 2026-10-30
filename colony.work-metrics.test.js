'use strict';

const assert = require('assert');
const { collectColonyWorkMetrics } = require('./colony.work-metrics');

const owned = { name: 'W1N1', controller: { my: true } };
const outpost = { name: 'W1N2', controller: null };
const sites = [{ progress: 25, progressTotal: 100 }];
const structures = [
  { repair: true, hits: 500, hitsMax: 1000 },
  { repair: false, hits: 0, hitsMax: 1000 }
];
const creeps = [
  { memory: { workJob: { lane: 'build' }, task: 'build' } },
  { memory: { builderScope: 'outpost', task: 'remote-road' } },
  { memory: { builderScope: 'local', builderMission: 'repair',
    task: 'repair' } }
];
const metrics = collectColonyWorkMetrics({
  Game: { rooms: { W1N1: owned, W1N2: outpost } },
  creeps,
  roomDemandPlans: {
    W1N1: { demand: { buildTargets: 2, fixTargets: 3,
      buildRemaining: 400, repairEnergy: 50 } }
  },
  getRoomSites: room => room === outpost ? sites : [],
  getRoomStructures: room => room === outpost ? structures : [],
  isOutpostRepairTarget: structure => structure.repair,
  isOutpostBuilder: creep => creep.memory.builderScope === 'outpost',
  isExpansionBuilder: () => false,
  isBuilder: (creep, scope, mission) =>
    creep.memory.builderScope === scope &&
    creep.memory.builderMission === mission,
  REPAIR_POWER: 100
});

assert.deepStrictEqual(metrics, {
  localBuildTargets: 2,
  outpostBuildTargets: 1,
  localFixTargets: 3,
  outpostFixTargets: 1,
  localBuildRemaining: 400,
  outpostBuildRemaining: 75,
  localRepairEnergy: 50,
  outpostRepairEnergy: 5,
  buildAssigned: 2,
  buildActive: 2,
  repairAssigned: 1,
  repairActive: 1
});

console.log('colony work metric scenarios passed');
