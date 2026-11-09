'use strict';

const assert = require('assert');
const { collectResourceBrigadeDemands, planDurableResourceBrigades } =
  require('./resource.brigade.plan');

const roomNames = ['W7N4', 'W8N4', 'W7N3', 'W8N3'];
const position = (roomName, x, y) => ({ roomName, x, y });
const makeRoom = (name, index) => ({
  name,
  visible: true,
  stores: [{ id: `${name}-store`, store: { energy: 1000 + index * 100 } }],
  supply: { mode: index % 2 ? 'staged' : 'direct',
    sourceId: `${name}-store`, roundTripTicks: 40 + index * 10,
    loadingTicks: 2, unloadingTicks: 2, cadenceTicks: 1,
    replacementLead: 100 },
  repairTargets: [{ id: `${name}-road`, structureType: 'road',
    pos: position(name, 10 + index, 20), hits: 1000,
    hitsMax: 5000, targetHits: 3000 }],
  constructionSites: [{ id: `${name}-site`, structureType: 'extension',
    pos: position(name, 30, 30 + index), progress: 100,
    progressTotal: 1100 }]
});
const rooms = roomNames.map(makeRoom);
const retainedJob = { id: 'W7N4:fixer:100', roomName: 'W7N4', lane: 'repair',
  sourceId: 'old-source', targetId: 'W7N4-road', amount: 50, priority: 2,
  reason: 'previous assignment completed or invalid', created: 100, updated: 120 };
const creeps = [{ id: 'fixer-id', name: 'fixer', roomName: 'W7N4',
  store: { getFreeCapacity: resource => resource === 'energy' ? 150 : 0 },
  memory: { workJob: retainedJob } }];

// The producer consumes the supplied operational scope instead of a hardcoded
// room list. Repair and construction energy use Screeps power units.
const snapshot = JSON.stringify({ rooms, creeps });
const collected = collectResourceBrigadeDemands({ rooms, creeps });
assert.strictEqual(collected.evidence.length, 4);
assert.deepStrictEqual(collected.evidence.map(room => room.roomName),
  [...roomNames].sort());
assert.strictEqual(collected.demands.length, 8);
for (const room of collected.evidence) {
  assert.strictEqual(room.repairEnergy, 20);
  assert.strictEqual(room.constructionEnergy, 200);
}
assert.strictEqual(JSON.stringify({ rooms, creeps }), snapshot,
  'pure collection preserves room, target, store and creep inputs');

// A retained fixer becomes the delivery consumer without losing its exact
// repair job or target place. The generated carrier job uses the existing
// durable workJob schema and points at the creep that can receive energy.
const fixerDemand = collected.demands.find(demand => demand.id ===
  'W7N4:energy:repair:W7N4-road');
assert.deepStrictEqual(fixerDemand.consumer,
  { kind: 'creep', roomName: 'W7N4', id: 'fixer-id' });
assert.deepStrictEqual(fixerDemand.consumerWorkJob, retainedJob);
assert.deepStrictEqual(fixerDemand.targetPlace,
  { kind: 'position', roomName: 'W7N4', x: 10, y: 20,
    id: 'W7N4-road', range: 1 });
assert.strictEqual(fixerDemand.deliveryBatch, 150);

const newWorkers = { default: { cargo: 200, cycleTicks: 50,
  replacementLead: 100 } };
let planned = planDurableResourceBrigades({ rooms, creeps, tick: 200,
  newWorkers });
assert.strictEqual(planned.requests.length, 4,
  'four-room repair backlog is admitted before construction');
assert.strictEqual(planned.deferred.length, 4);
assert(planned.requests.every(request => request.demandId.includes(':repair:')));
const fixerRequest = planned.requests.find(request => request.roomName === 'W7N4');
assert.strictEqual(fixerRequest.workJob.lane, 'supply');
assert.strictEqual(fixerRequest.workJob.roomName, 'W7N4');
assert.strictEqual(fixerRequest.workJob.sourceId, 'W7N4-store');
assert.strictEqual(fixerRequest.workJob.targetId, 'fixer-id');
assert.strictEqual(fixerRequest.workJob.amount, 20);
assert.strictEqual(fixerRequest.consumerWorkJob.targetId, 'W7N4-road');
assert.strictEqual(fixerRequest.targetPlace.id, 'W7N4-road');

// Covering three rooms is not enough: any remaining repair contract across the
// operational scope keeps every construction request deferred.
const repairCommitments = roomNames.map(name => ({ id: `repair-${name}`,
  demandId: `${name}:energy:repair:${name}-road`, amount: 20 }));
planned = planDurableResourceBrigades({ rooms, creeps, tick: 201,
  commitments: repairCommitments.slice(0, 3), newWorkers });
assert.strictEqual(planned.requests.length, 1,
  'covered repair requests disappear instead of retaining zero-amount jobs');
assert.strictEqual(planned.deferred.length, 4);
assert.strictEqual(planned.repairBlocker, 'W8N3:energy:repair:W8N3-road');

// Once every repair is committed, the same planner transitions to construction
// and emits exact construction-site places instead of a disconnected system.
planned = planDurableResourceBrigades({ rooms, creeps, tick: 202,
  commitments: repairCommitments, newWorkers });
const constructionRequests = planned.requests.filter(request =>
  request.demandId.includes(':construction:'));
assert.strictEqual(constructionRequests.length, 4);
assert.strictEqual(planned.deferred.length, 0);
assert.strictEqual(planned.repairBlocker, null);
for (const request of constructionRequests) {
  assert.strictEqual(request.workJob.targetId, `${request.roomName}-site`);
  assert.strictEqual(request.targetPlace.kind, 'position');
  assert.strictEqual(request.targetPlace.id, `${request.roomName}-site`);
}

// Inventory is allocated once within each room. Two targets cannot each claim
// the same 30 energy, and duplicate target observations do not multiply work.
const scarce = makeRoom('W1N1', 0);
scarce.stores[0].store.energy = 30;
scarce.repairTargets = [
  { id: 'road-a', pos: position('W1N1', 1, 1), hits: 0,
    hitsMax: 5000, targetHits: 2000 },
  { id: 'road-b', pos: position('W1N1', 2, 2), hits: 0,
    hitsMax: 5000, targetHits: 2000 }
];
scarce.repairTargets.push({ ...scarce.repairTargets[0] });
scarce.constructionSites = [];
const scarcePlan = planDurableResourceBrigades({ rooms: [scarce], tick: 10,
  newWorkers });
assert.strictEqual(scarcePlan.demands.length, 2);
assert.strictEqual(scarcePlan.evidence[0].repairEnergy, 40);
assert.strictEqual(scarcePlan.requests.reduce((sum, request) =>
  sum + request.workJob.amount, 0), 30);

// Replanning preserves the durable job identity and creation tick while
// refreshing amount and update time.
const first = scarcePlan.requests[0];
const retained = planDurableResourceBrigades({ rooms: [scarce], tick: 11,
  newWorkers, previousRequests: [first] }).requests[0];
assert.strictEqual(retained.workJob.id, first.workJob.id);
assert.strictEqual(retained.workJob.created, first.workJob.created);
assert.strictEqual(retained.workJob.updated, 11);

// Missing visibility or target/inventory collections remain explicit and do
// not invent zero backlog or a spawn request.
const unknown = collectResourceBrigadeDemands({ rooms: [{ name: 'W9N9',
  visible: false }] });
assert.deepStrictEqual(unknown.demands, []);
assert.deepStrictEqual(unknown.evidence, [{ roomName: 'W9N9', known: false,
  unknowns: ['visibility', 'repairTargets', 'constructionSites', 'inventory'] }]);
const staleRoom = makeRoom('W9N8', 0);
staleRoom.observedAt = 10;
const stale = collectResourceBrigadeDemands({ rooms: [staleRoom], tick: 100,
  maxAge: 25 });
assert.deepStrictEqual(stale.demands, []);
assert.deepStrictEqual(stale.evidence[0].unknowns, ['stale']);
const buildReady = makeRoom('W9N7', 0);
buildReady.repairTargets = [];
const unknownScope = planDurableResourceBrigades({ rooms: [buildReady,
  { name: 'W9N9', visible: false }], tick: 100, newWorkers });
assert.strictEqual(unknownScope.requests.length, 0,
  'unknown room repair evidence cannot be treated as an empty repair queue');
assert.strictEqual(unknownScope.deferred.length, 1);
assert.strictEqual(unknownScope.repairBlocker, 'unknown:W9N9');

console.log('four-room repair/build demand, retained jobs, places, inventory and transition passed');
