'use strict';

const assert = require('assert');
const { createCreepLifecycle } = require('./creep.lifecycle');

// Replacement coverage must include travel and the current spawn queue. These
// cases cover the timing boundaries used by staffing, hauling and reservations.
const home = { name: 'W7N4', memory: { haulTripStats: {
  W8N3: { slots: {
    fresh: { updated: 9000, outboundTicks: 240 },
    stale: { updated: 8499, outboundTicks: 900 },
    other: { updated: 9999, outboundTicks: 180 }
  } },
  W7N3: { slots: { otherRoom: { updated: 9999, outboundTicks: 800 } } }
} } };
const Game = {
  time: 10000,
  rooms: { W7N4: home },
  map: { findRoute: () => [{ room: 'W8N4' }, { room: 'W8N3' }] },
  spawns: {
    first: { room: home, spawning: { remainingTime: 18 } },
    second: { room: home, spawning: { remainingTime: 36 } },
    idle: { room: home, spawning: null },
    elsewhere: { room: { name: 'W9N9' }, spawning: { remainingTime: 500 } }
  }
};
const life = createCreepLifecycle({ Game, WORK: 'work', MOVE: 'move',
  CREEP_SPAWN_TIME: 3 });
const worker = (types, memory = {}) => ({
  body: types.map(type => ({ type, hits: 100 })),
  memory, room: home, ticksToLive: 1500, spawning: false,
  getActiveBodyparts(type) {
    return this.body.filter(part => part.type === type && part.hits > 0).length;
  }
});
const remote = worker(['work', 'work', 'work', 'carry', 'move', 'move'], {
  home: 'W9N9', remoteHome: 'W7N4', remoteRoom: 'W8N3'
});
const before = JSON.stringify({ memory: home.memory, creep: remote.memory });
assert.strictEqual(life.getRemoteReplacementLead(remote), 444,
  'use target-room fresh travel and the longest home queue, not their sum');
home.memory.haulTripStats.W8N3.slots.fresh.updated = 8500;
assert.strictEqual(life.getRemoteReplacementLead(remote), 444,
  'an observation exactly 1500 ticks old remains eligible');
Game.time++;
assert.strictEqual(life.getRemoteReplacementLead(remote), 384,
  'aging past the observation window removes that travel sample');
Game.time = 10000;
home.memory.haulTripStats.W8N3.slots.fresh.updated = 9000;
assert.strictEqual(JSON.stringify({ memory: home.memory, creep: remote.memory }),
  before, 'replacement queries preserve assignments and observed travel');

for (const [ttl, expected] of [[443, false], [444, false], [445, true]]) {
  remote.ticksToLive = ttl;
  assert.strictEqual(life.hasRemoteReplacementLife(remote), expected,
    `remote replacement boundary at TTL ${ttl}`);
}
remote.spawning = true;
delete remote.ticksToLive;
assert.strictEqual(life.hasRemoteReplacementLife(remote), true,
  'a spawning replacement counts before it has a TTL');
assert.strictEqual(life.hasRemoteReplacementLife(null), false);
assert.strictEqual(life.getRemoteReplacementLead(null), Infinity);

delete home.memory.haulTripStats;
assert.strictEqual(life.getRemoteReplacementLead(remote), 354,
  'without measured travel use two route transitions');
Game.map.findRoute = () => -2;
assert.strictEqual(life.getRemoteReplacementLead(remote), 279,
  'an unavailable route uses the existing conservative one-room fallback');

home.memory.roadPlan = { paths: [{ targetId: 'source',
  points: Array.from({ length: 40 }, () => ({ x: 1, y: 1 })) }] };
const miner = worker(['work', 'work', 'work', 'work', 'carry', 'move'], {
  role: 'miner', home: 'W7N4', minerSource: 'source'
});
assert.strictEqual(life.getLocalReplacementLead(miner), 224,
  'slow miners include road weight, source path and queued spawning');
for (const [ttl, expected] of [[223, false], [224, false], [225, true]]) {
  miner.ticksToLive = ttl;
  assert.strictEqual(life.hasLocalReplacementLife(miner), expected,
    `local replacement boundary at TTL ${ttl}`);
}
miner.spawning = true;
delete miner.ticksToLive;
assert.strictEqual(life.hasLocalReplacementLife(miner), true);
assert.strictEqual(life.hasLocalReplacementLife(null), false);
miner.memory.minerSource = 'unknown';
assert.strictEqual(life.getLocalReplacementLead(miner), 179,
  'an unmapped source uses the existing 25-step fallback');
miner.memory.role = 'upgrader';
assert.strictEqual(life.getLocalReplacementLead(miner), 68,
  'stationary non-miners retain their separate local replacement rule');

console.log('creep lifecycle replacement-window tests passed');
