'use strict';

const assert = require('assert');
const { createControllerBrigadeRuntime } =
  require('./controller.brigade.runtime');

class Position {
  constructor(x, y, roomName = 'W1N1') {
    this.x = x;
    this.y = y;
    this.roomName = roomName;
  }
}

const room = { name: 'W1N1', memory: {} };
const relayMemory = { home: 'W1N1', role: 'controller-relay',
  controllerRelaySlot: 0 };
const relay = {
  name: 'BRIG1', room, pos: new Position(10, 10), memory: relayMemory,
  store: { energy: 0, getFreeCapacity: () => 100 },
  withdraw: () => 0
};
let observedMemoryReads = 0;
const observed = {
  name: 'BRIG-observed',
  get memory() {
    observedMemoryReads++;
    return { home: 'W1N1', role: 'controller-relay',
      controllerRelaySlot: 0 };
  },
  store: { energy: 50 }
};
const storage = { id: 'storage', store: { energy: 1000 } };
const buffer = { id: 'buffer', store: { getFreeCapacity: () => 200 } };
const runtime = createControllerBrigadeRuntime({
  Game: {
    time: 100, creeps: { BRIG1: relay, observed },
    getObjectById: id => id === 'storage' ? storage
      : id === 'buffer' ? buffer : null
  },
  RoomPosition: Position,
  RESOURCE_ENERGY: 'energy', OK: 0, ERR_NOT_IN_RANGE: -9,
  moveCreep: () => 0,
  getSlotOwner: () => relay
});
const plan = {
  version: 1, roomName: 'W1N1', stationary: true,
  storageId: 'storage', controllerBufferIds: ['buffer'],
  segments: [{ pipeline: 0, intake: true, terminal: true,
    pickup: { x: 10, y: 10 }, delivery: { x: 10, y: 10 },
    destinationIds: ['buffer'] }]
};

assert.strictEqual(runtime.run(relay, plan), true);
const readsAfterFirstRun = observedMemoryReads;
assert(readsAfterFirstRun > 0,
  'the first intake computes pipeline inventory from the live roster');
assert.strictEqual(runtime.run(relay, plan), true);
assert.strictEqual(observedMemoryReads, readsAfterFirstRun,
  'later relays reuse the stable per-tick pipeline inventory');

console.log('controller brigade runtime caches stable per-tick pipeline scans');
