'use strict';

const assert = require('assert');
const { MODES, normalizeConsumer, normalizeDemand, accountDemand,
  prioritizeDemands, dedupeDemands, sizeResourceBrigade,
  planResourceBrigades } = require('./resource.demand');

const baseDemand = (overrides = {}) => ({
  id: 'repair-wall',
  roomName: 'W7N4',
  resourceType: 'energy',
  consumer: { kind: 'structure', id: 'wall-1' },
  requested: 1000,
  purpose: 'repair',
  mode: 'direct',
  roundTripTicks: 40,
  loadingTicks: 5,
  unloadingTicks: 5,
  ...overrides
});
const worker = (id, overrides = {}) => ({ id, roomName: 'W7N4',
  resourceType: 'energy', cargo: 500, ticksToLive: 1000, ...overrides });

// Consumer identity is stable across creep, structure and exact-position sinks.
assert.deepStrictEqual(normalizeConsumer({ kind: 'creep', name: 'builder', roomName: 'W7N4' }),
  { kind: 'creep', roomName: 'W7N4', id: 'builder', key: 'creep:builder' });
assert.strictEqual(normalizeConsumer({ kind: 'structure', id: 'tower' }, 'W8N4').key,
  'structure:tower');
assert.strictEqual(normalizeConsumer({ kind: 'position', pos: { roomName: 'W7N3', x: 12, y: 34 } }).key,
  'position:W7N3:12:34');
assert.strictEqual(normalizeConsumer({ kind: 'position', roomName: 'W7N3', x: 50, y: 1 }), null);
const normalized = normalizeDemand(baseDemand());
assert.strictEqual(normalized.key, 'W7N4|energy|structure:wall-1');
assert.strictEqual(normalized.known, true);

// Commitments are identity-deduplicated and clamped, so retries and overlap
// cannot create a negative remainder or an oversized delivery contract.
const accounted = accountDemand(baseDemand(), [
  { id: 'trip-a', demandId: 'repair-wall', amount: 600 },
  { id: 'trip-a', demandId: 'repair-wall', amount: 600 },
  { id: 'trip-b', roomName: 'W7N4', resourceType: 'energy',
    consumerKey: 'structure:wall-1', amount: 700 },
  { id: 'other-room', roomName: 'W8N4', resourceType: 'energy',
    consumerKey: 'structure:wall-1', amount: 999 }
]);
assert.strictEqual(accounted.committed, 1000);
assert.strictEqual(accounted.excessCommitted, 300);
assert.strictEqual(accounted.remaining, 0);
assert.deepStrictEqual(accounted.commitmentIds, ['trip-a', 'trip-b']);

// Priority is policy-generic but explicitly preserves survival and repair
// before construction. Urgency and deadline break ties deterministically.
const priority = prioritizeDemands([
  normalizeDemand(baseDemand({ id: 'build', purpose: 'construction', urgency: 100 })),
  normalizeDemand(baseDemand({ id: 'repair-late', urgency: 1, deadline: 500 })),
  normalizeDemand(baseDemand({ id: 'repair-now', urgency: 2, deadline: 600 })),
  normalizeDemand(baseDemand({ id: 'spawn', purpose: 'survival', urgency: 0 }))
]);
assert.deepStrictEqual(priority.map(demand => demand.id),
  ['spawn', 'repair-now', 'repair-late', 'build']);

// Duplicate producers describing the same contract collapse to the strongest
// observation instead of multiplying requested work.
const deduped = dedupeDemands([
  baseDemand({ requested: 100, urgency: 1, deadline: 500 }),
  baseDemand({ requested: 250, urgency: 3, deadline: 400 })
]);
assert.strictEqual(deduped.length, 1);
assert.strictEqual(deduped[0].requested, 250);
assert.strictEqual(deduped[0].urgency, 3);
assert.strictEqual(deduped[0].deadline, 400);

// Crew size is throughput math, not raw backlog or current headcount. Existing
// compatible capacity is reused first; only the uncovered rate requests spawn.
const sized = sizeResourceBrigade({
  demand: baseDemand({ deadline: 200, sustainRate: 2, replacementLead: 100 }),
  tick: 100,
  workers: [worker('fast', { cycleTicks: 50 }), worker('wrong-room', { roomName: 'W8N4' })],
  newWorker: { cargo: 500, cycleTicks: 50 }
});
assert.strictEqual(sized.cycleTicks, 50);
assert.strictEqual(sized.requiredRate, 12);
assert.strictEqual(sized.coveredRate, 10);
assert.deepStrictEqual(sized.reused, ['fast']);
assert.strictEqual(sized.spawnNeeded, 1);
assert.strictEqual(sized.targetCrew, 2);

// Inventory, accepted commitments, route cadence and worker replacement life
// all affect the same sizing result without role-specific branches.
const constrained = sizeResourceBrigade({
  demand: baseDemand({ requested: 1000, availableInventory: 200,
    travelTicks: 20, roundTripTicks: undefined, loadingTicks: 3,
    unloadingTicks: 2, cadenceTicks: 5, clearanceTicks: 100,
    replacementLead: 150 }),
  commitments: [{ id: 'reserved', demandId: 'repair-wall', amount: 100 }],
  workers: [worker('expiring', { ticksToLive: 150 }), worker('viable', { cargo: 100, cycleTicks: 50 })],
  newWorker: { cargo: 100, cycleTicks: 50 }
});
assert.strictEqual(constrained.demand.remaining, 900);
assert.strictEqual(constrained.deliverable, 200);
assert.strictEqual(constrained.inventoryLimited, true);
assert.strictEqual(constrained.cycleTicks, 50);
assert.deepStrictEqual(constrained.reused, ['viable']);
assert.strictEqual(constrained.spawnNeeded, 0);

// Every transport topology uses the same contract while retaining its explicit
// timing evidence.
for (const mode of MODES) {
  const timing = mode === 'relay' ? { legTicks: 12 } : { travelTicks: 12 };
  const plan = sizeResourceBrigade({ demand: baseDemand({ mode, roundTripTicks: undefined,
    loadingTicks: 1, unloadingTicks: 2, cadenceTicks: 3, ...timing }),
  newWorker: { cargo: 250 } });
  assert.strictEqual(plan.cycleTicks, 30, `${mode} cycle`);
  assert.strictEqual(plan.spawnNeeded, 4, `${mode} crew`);
}

// Missing evidence remains explicit. Unknown replacement life suppresses a
// duplicate spawn decision instead of pretending the current worker is absent.
const unknown = sizeResourceBrigade({ demand: baseDemand({ requested: undefined,
  roundTripTicks: undefined, replacementLead: 100 }),
workers: [worker('unknown-life', { ticksToLive: undefined })], newWorker: {} });
assert.strictEqual(unknown.known, false);
assert.strictEqual(unknown.spawnNeeded, null);
assert(unknown.unknowns.includes('requested'));
assert(unknown.unknowns.includes('cycleTicks'));
assert(unknown.unknowns.includes('worker.ticksToLive:unknown-life'));

// Outstanding repair gates construction in the same room/resource lane. Once
// repair is fully committed, or absent, construction becomes an active plan.
const construction = baseDemand({ id: 'site', consumer: { kind: 'position',
  roomName: 'W7N4', x: 20, y: 20 }, requested: 500, purpose: 'construction' });
let colony = planResourceBrigades({ demands: [construction, baseDemand()],
  workers: [worker('carrier')], newWorkers: { default: { cargo: 500, cycleTicks: 50 } } });
assert.deepStrictEqual(colony.plans.map(plan => plan.demand.id), ['repair-wall', 'site']);
assert.strictEqual(colony.plans[1].deferredBy, 'repair-wall');
assert.strictEqual(colony.plans[1].spawnNeeded, 0);
const unknownRepair = planResourceBrigades({ demands: [construction,
  baseDemand({ requested: undefined })], workers: [worker('carrier')],
newWorkers: { default: { cargo: 500, cycleTicks: 50 } } });
assert.strictEqual(unknownRepair.plans[0].demand.remaining, null);
assert(unknownRepair.plans[0].unknowns.includes('requested'));
assert.strictEqual(unknownRepair.plans[1].deferredBy, 'repair-wall');
colony = planResourceBrigades({ demands: [construction, baseDemand()],
  commitments: [{ id: 'repair-covered', demandId: 'repair-wall', amount: 1000 }],
  workers: [worker('carrier')], newWorkers: { default: { cargo: 500, cycleTicks: 50 } } });
assert.strictEqual(colony.plans[0].demand.remaining, 0);
assert.strictEqual(colony.plans[1].deferredBy, undefined);
assert.deepStrictEqual(colony.plans[1].reused, ['carrier']);
const constructionOnly = planResourceBrigades({ demands: [construction],
  workers: [worker('carrier')], newWorkers: { default: { cargo: 500 } } });
assert.deepStrictEqual(constructionOnly.plans[0].reused, ['carrier']);

// Workers, contracts and commitments remain isolated by room and resource.
const isolated = planResourceBrigades({ demands: [baseDemand({ requested: 100 })],
  workers: [worker('home'), worker('other-room', { roomName: 'W8N4' }),
    worker('other-resource', { resourceType: 'H' })],
  newWorkers: { default: { cargo: 500 } } });
assert.deepStrictEqual(isolated.plans[0].reused, ['home']);
assert.deepStrictEqual(isolated.released, []);
const noDemand = planResourceBrigades({ demands: [], workers: [worker('surplus-a'),
  worker('surplus-b')] });
assert.deepStrictEqual(noDemand.released, ['surplus-a', 'surplus-b']);

console.log('resource demand identity, accounting, priority, sizing, modes, isolation and release passed');
