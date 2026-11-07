'use strict';

const assert = require('assert');
const { createRcl5Infrastructure } = require('./rcl5.infrastructure');
const position = (x, y, purpose) => ({ x, y, purpose,
  getRangeTo(target) {
    const p = target.pos || target;
    return Math.max(Math.abs(x - p.x), Math.abs(y - p.y));
  }
});
const store = (energy, capacity = 800) => Object.freeze({ energy,
  getCapacity: () => capacity, getFreeCapacity: () => capacity - energy });
const game = { time: 100 };
const calls = [];
const fixture = name => {
  const controller = { id: `${name}-controller`, structureType: 'link',
    pos: position(30, 24), store: store(600), cooldown: 0 };
  const extensions = { id: `${name}-extensions`, structureType: 'link',
    pos: position(10, 11), store: store(0), cooldown: 0 };
  for (const link of [controller, extensions]) {
    link.transferEnergy = (target, amount) => {
      calls.push({ source: link.id, receiver: target.id, amount });
      return link.result ?? 0;
    };
  }
  const buffer = { id: `${name}-buffer`, structureType: 'container',
    pos: position(30, 25, 'controller'), store: store(1500, 2000) };
  const extensionBuffer = { structureType: 'container',
    pos: position(10, 10, 'extensions') };
  const room = { name, memory: { unrelated: { retained: true } },
    energyCapacityAvailable: 800, energyAvailable: 300,
    structures: [controller, extensions, buffer, extensionBuffer] };
  return { room, controller, extensions, buffer };
};
const network = createRcl5Infrastructure({ Game: game,
  getRoomSources: () => [],
  getRoomStructuresByType: (room, type) => room.structures.filter(s =>
    s.structureType === type),
  getContainerPurpose: (room, p) => p.purpose,
  STRUCTURE_LINK: 'link', STRUCTURE_CONTAINER: 'container',
  RESOURCE_ENERGY: 'energy', OK: 0 });
const run = fixture => {
  calls.length = 0;
  const result = network.runLinks(fixture.room);
  const status = fixture.room.memory.linkNetworkStatus;
  assert.strictEqual(status.updated, game.time);
  assert.strictEqual(status.decisions.length, 2);
  assert.strictEqual(status.transferEvidence, 'intent-results-only');
  assert.strictEqual(result.transfers, status.transfers);
  assert.deepStrictEqual(fixture.room.memory.unrelated, { retained: true });
  return status;
};
const forward = status => status.decisions[0];
const reverse = status => status.decisions[1];

// Real authority calls: accepted intent is reported without claiming energy
// arrived. Source/receiver stores deliberately remain unchanged in this mock.
const a = fixture('A');
let status = run(a);
assert.deepStrictEqual(calls, [{ source: 'A-controller',
  receiver: 'A-extensions', amount: 500 }]);
assert.strictEqual(forward(status).outcome, 'intent-accepted');
assert.strictEqual(forward(status).attemptedAmount, 500);
assert.strictEqual(forward(status).sourceEnergy, 600);
assert.strictEqual(a.controller.store.energy, 600);
assert.ok(reverse(status).blockers.includes('competing-spawn-demand'));
assert.strictEqual(reverse(status).chosen, false);

// Exact reserve boundary, competing demands, and exhausted source energy.
a.buffer.store = store(1499, 2000);
status = run(a);
assert.strictEqual(status.transfers, 0);
assert.ok(forward(status).blockers.includes('controller-reserve'));
assert.ok(reverse(status).blockers.includes('competing-spawn-demand'));
assert.strictEqual(calls.length, 0);
a.buffer.store = store(1500, 2000);
a.controller.store = store(0);
assert.ok(forward(run(a)).blockers.includes('no-source-energy'));
a.controller.store = store(600);

// Selected direction can still be blocked at execution; no phantom intent.
a.controller.cooldown = 1;
status = run(a);
assert.strictEqual(forward(status).chosen, true);
assert.ok(forward(status).blockers.includes('cooldown'));
assert.strictEqual(forward(status).result, null);
assert.strictEqual(calls.length, 0);
a.controller.cooldown = 0;
a.extensions.store = store(800);
status = run(a);
assert.ok(forward(status).blockers.includes('no-receiver-capacity'));
assert.strictEqual(calls.length, 0);
a.extensions.store = store(799);
status = run(a);
assert.strictEqual(forward(status).attemptedAmount, 1);
a.extensions.store = store(0);
a.controller.result = -6;
status = run(a);
assert.strictEqual(forward(status).outcome, 'intent-rejected');
assert.strictEqual(forward(status).result, -6);
assert.strictEqual(status.transfers, 0);
delete a.controller.result;

// Reverse threshold and receiver reserve at the exact energy boundary.
a.room.energyAvailable = 800;
a.buffer.store = store(1499, 2000);
a.extensions.store = store(199);
status = run(a);
assert.ok(reverse(status).blockers.includes('below-send-threshold'));
assert.strictEqual(calls.length, 0);
a.extensions.store = store(200);
a.controller.store = store(0);
status = run(a);
assert.deepStrictEqual(calls, [{ source: 'A-extensions',
  receiver: 'A-controller', amount: 1 }]);
assert.strictEqual(reverse(status).outcome, 'intent-accepted');
a.buffer.store = store(1500, 2000);
status = run(a);
assert.ok(reverse(status).blockers.includes('no-controller-demand'));
assert.strictEqual(calls.length, 0);

// Draining endpoints cannot be refilled, in either direction.
a.buffer.store = store(0, 2000);
a.room.memory.linkMigration = { status: 'draining', linkId: a.controller.id };
status = run(a);
assert.ok(reverse(status).blockers.includes('receiver-retiring'));
assert.strictEqual(calls.length, 0);
a.room.memory.linkMigration = { status: 'draining', linkId: a.extensions.id };
a.room.energyAvailable = 300;
a.buffer.store = store(1500, 2000);
a.controller.store = store(600);
assert.ok(forward(run(a)).blockers.includes('receiver-retiring'));
assert.strictEqual(calls.length, 0);

// A retiring sender may drain; diagnostics must not introduce a new veto.
const draining = fixture('draining');
draining.room.memory.linkMigration = {
  status: 'draining', linkId: draining.controller.id };
assert.strictEqual(forward(run(draining)).outcome, 'intent-accepted');
assert.strictEqual(calls.length, 1);

// Legacy layout classification can select one physical endpoint for both
// purposes. Preserve the authority's rejected self-intent, on the right route.
const legacy = fixture('legacy');
legacy.room.energyAvailable = 800;
legacy.buffer.store = store(0, 2000);
legacy.room.structures.find(s => s.pos.purpose === 'extensions').pos =
  position(30, 25, 'extensions');
legacy.controller.result = -7;
status = run(legacy);
assert.strictEqual(forward(status).chosen, false);
assert.strictEqual(reverse(status).chosen, true);
assert.strictEqual(reverse(status).result, -7);
assert.strictEqual(reverse(status).outcome, 'intent-rejected');
assert.strictEqual(status.transfers, 0);
assert.strictEqual(calls.length, 1);

// Missing endpoint, empty network, independent rooms and bounded replacement.
const b = fixture('B');
const savedA = JSON.stringify(a.room.memory.linkNetworkStatus);
const bStatus = run(b);
assert.strictEqual(JSON.stringify(a.room.memory.linkNetworkStatus), savedA);
b.room.structures = b.room.structures.filter(s => s !== b.extensions);
status = run(b);
assert.ok(forward(status).blockers.includes('missing-receiver-endpoint'));
assert.ok(reverse(status).blockers.includes('missing-source-endpoint'));
assert.strictEqual(status.direction, null);
b.room.structures = [];
for (let tick = 101; tick < 401; tick++) {
  game.time = tick;
  status = run(b);
  assert.strictEqual(status.linkCount, 0);
  assert.strictEqual(Object.keys(b.room.memory).length, 2);
  assert.ok(JSON.stringify(status).length < 1600);
}
assert.strictEqual(bStatus.updated, 100, 'older receipt is not mutated');
assert.strictEqual(bStatus.decisions[0].outcome, 'intent-accepted');
console.log('link decision authority regressions passed');
