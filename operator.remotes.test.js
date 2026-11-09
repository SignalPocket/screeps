'use strict';

const assert = require('assert');
const fs = require('fs');
const { REMOTES_DEFINITION, createRemotesCommand, observation, recentRate } =
  require('./operator.remotes');
const { createOperatorConsole } = require('./operator.console');

const FIND = {
  sources: 1,
  structures: 2,
  sites: 3,
  drops: 4,
  hostileCreeps: 5,
  hostileStructures: 6
};
const store = (energy, capacity) => ({
  energy,
  getCapacity: () => capacity
});
const source = (id, energy, capacity = 3000) => ({
  id, energy, energyCapacity: capacity, ticksToRegeneration: 50,
  pos: { getRangeTo: () => 1 }
});
const structure = (id, structureType, energy, capacity, hits, hitsMax) => ({
  id, structureType, store: store(energy, capacity), hits, hitsMax,
  pos: {}
});
const room = (name, controller, memory, finds = {}) => ({
  name, controller, memory,
  find: type => finds[type] || []
});
const creep = (name, role, remoteHome, remoteRoom, options = {}) => ({
  name,
  memory: { role, remoteHome, remoteRoom, ...(options.memory || {}) },
  room: { name: options.roomName || remoteRoom },
  ticksToLive: options.ticksToLive == null ? 500 : options.ticksToLive,
  spawning: Boolean(options.spawning)
});

const homePolicy = {
  updated: 1000,
  mode: 'logistics-backup',
  health: 'strained',
  permissions: {
    remoteHaulingRecovery: true,
    remoteMaintenance: true,
    remoteGrowth: false
  },
  remote: {
    minersMin: 4, miners: 4,
    haulersMin: 2, haulers: 7,
    buildersMin: 2, builders: 2,
    reserversMin: 2, reservers: 2
  }
};
const activeSurvey = (targetRoom, overrides = {}) => ({
  active: true,
  started: 100,
  targetRoom,
  remoteMinerTarget: 2,
  remoteHaulerTarget: 3,
  remoteBuilderTarget: 1,
  remoteWorkNeeds: [
    { slot: 0, minMiners: 1, requiredWork: 5 },
    { slot: 1, minMiners: 1, requiredWork: 5 }
  ],
  deliveryPolicy: {
    updated: 1000,
    blocked: false,
    degraded: false,
    prioritizeHauling: true,
    allowMining: true,
    allowConstruction: true,
    backlog: 600,
    drought: 3,
    reason: 'recovery hauling authorized'
  },
  ...overrides
});
const homeMemory = {
  populationPolicy: homePolicy,
  leftSurvey: {
    targetRoom: 'W8N4', active: false, status: 'owned-colony',
    ownedRoom: true, started: 80, remoteMinerTarget: 0,
    remoteHaulerTarget: 0, remoteBuilderTarget: 0,
    remoteWorkNeeds: []
  },
  southSurvey: activeSurvey('W7N3'),
  southwestSurvey: activeSurvey('W8N3'),
  remoteRoadPlan: { created: 900, paths: [] },
  southRemoteRoadPlan: {
    created: 995,
    paths: [{ slot: 0, incomplete: false, points: [
      { roomName: 'W7N4' }, { roomName: 'W7N3' }
    ] }]
  },
  southwestRemoteRoadPlan: {
    created: 990,
    paths: [{ slot: 0, incomplete: true, points: [
      { roomName: 'W7N4' }, { roomName: 'W8N3' }
    ] }]
  },
  remoteHaulRoutes: {
    W7N3: {
      updated: 998, planned: 999, target: 3, saturated: false,
      carryCapacity: 300, routeLengths: [20, 40],
      lanes: [{ sourceId: 'source-a', roundTripTicks: 80,
        basis: 'observed', backlog: 100, requiredRate: 10,
        projectedRate: 9, actualRate: 8 }]
    }
  },
  outpostEconomy: {
    W7N3: {
      exportBuckets: { 900: 300, 1000: 100 },
      buckets: { 900: 200, 1000: 50 },
      lastExport: 1000, lastDelivery: 1000,
      exportedTotal: 10000, deliveredTotal: 8000
    }
  },
  reservationStatus: {
    W8N3: {
      tick: 980, owner: null, ticksToEnd: 4500,
      observedReservation: { username: 'ginaria', ticksToEnd: 4500 }
    }
  }
};
const secondHomeMemory = {
  populationPolicy: { ...homePolicy, updated: 999 },
  southSurvey: activeSurvey('W7N3', {
    remoteMinerTarget: 1, remoteHaulerTarget: 1,
    remoteBuilderTarget: 0
  }),
  southRemoteRoadPlan: {
    created: 980,
    paths: [{ slot: 0, incomplete: false,
      points: [{ roomName: 'W8N4' }, { roomName: 'W7N3' }] }]
  }
};
const remoteMemory = {
  combatStatus: { updated: 1000, requiredDefenders: 1 },
  roomStatus: { updated: 1000 }
};
const unseenMemory = {
  combatStatus: { updated: 970, requiredDefenders: 0 },
  roomStatus: { updated: 975 }
};

const visibleSources = [source('source-a', 1200), source('source-b', 2500)];
const sourceContainer = structure('container-a', 'container', 900, 2000,
  150000, 250000);
const damagedRoad = structure('road-a', 'road', 0, 0, 500, 1000);
const Game = { time: 1000, rooms: {}, creeps: {} };
Game.rooms.W7N4 = room('W7N4', {
  my: true, owner: { username: 'ginaria' }
}, homeMemory);
Game.rooms.W8N4 = room('W8N4', {
  my: true, owner: { username: 'ginaria' }
}, secondHomeMemory);
Game.rooms.W7N3 = room('W7N3', {
  my: false, owner: null,
  reservation: { username: 'ginaria', ticksToEnd: 4999 }
}, remoteMemory, {
  [FIND.sources]: visibleSources,
  [FIND.structures]: [sourceContainer, damagedRoad],
  [FIND.sites]: [{ id: 'site-a', structureType: 'road',
    progress: 25, progressTotal: 300 }],
  [FIND.drops]: [{ resourceType: 'energy', amount: 75 },
    { resourceType: 'H', amount: 20 }],
  [FIND.hostileCreeps]: [{ id: 'hostile-creep' }],
  [FIND.hostileStructures]: [{ id: 'hostile-structure' }]
});
const Memory = { rooms: {
  W7N4: homeMemory,
  W8N4: secondHomeMemory,
  W7N3: remoteMemory,
  W8N3: unseenMemory
} };

Game.creeps.minerA = creep('minerA', 'remote-miner', 'W7N4', 'W7N3', {
  memory: { remoteSlot: 0, navRecovery: {
    tick: 995, reason: 'blocked', room: 'W7N3', x: 10, y: 11,
    stuck: 2, result: -2
  } }
});
Game.creeps.minerOld = creep('minerOld', 'remote-miner', 'W7N4', 'W7N3', {
  ticksToLive: 50, memory: { remoteSlot: 1 }
});
Game.creeps.hauler = creep('hauler', 'remote-hauler', 'W7N4', 'W7N3', {
  memory: { remoteHaulerSlot: 2 }
});
Game.creeps.reserver = creep('reserver', 'remote-reserver', 'W7N4', 'W7N3');
Game.creeps.builder = creep('builder', 'builder', 'W7N4', 'W7N3', {
  memory: { builderScope: 'outpost', remoteBuilderSlot: 0 }
});
Game.creeps.defender = creep('defender', 'defender', 'W7N4', 'W7N3');
Game.creeps.otherHome = creep('otherHome', 'remote-miner', 'W8N4', 'W7N3', {
  memory: { remoteSlot: 0 }
});

const run = createRemotesCommand({ Game, Memory,
  findSources: FIND.sources,
  findStructures: FIND.structures,
  findConstructionSites: FIND.sites,
  findDroppedResources: FIND.drops,
  findHostileCreeps: FIND.hostileCreeps,
  findHostileStructures: FIND.hostileStructures,
  resourceEnergy: 'energy', structureContainer: 'container',
  structureWall: 'constructedWall', structureRampart: 'rampart',
  repairPower: 100,
  hasRemoteReplacementLife: c => c.spawning || c.ticksToLive > 100,
  getRemoteReplacementLead: () => 100
});
const before = JSON.stringify({ Game, Memory });
const result = run('W7N4');
assert.strictEqual(result.ok, true);
assert.strictEqual(result.tick, 1000);
assert.deepStrictEqual(result.remotes.map(row => row.roomName),
  ['W7N3', 'W8N3', 'W8N4']);
const visible = result.remotes.find(row => row.roomName === 'W7N3');
assert.strictEqual(visible.support, 'active');
assert.strictEqual(visible.visibility.observation.freshness, 'current tick');
assert.strictEqual(visible.controller.ownership, 'neutral');
assert.strictEqual(visible.controller.reservation.ticksToEnd, 4999);
assert.strictEqual(visible.inventory.sources.energy, 3700);
assert.strictEqual(visible.inventory.buffers.energy, 900);
assert.strictEqual(visible.inventory.drops.energy, 75);
assert.strictEqual(visible.inventory.sites.remaining, 275);
assert.strictEqual(visible.inventory.repairs.energy, 1005);
assert.strictEqual(visible.inventory.threats.total, 2);
assert.strictEqual(visible.coverage.miner.target, 2);
assert.strictEqual(visible.coverage.miner.current, 2);
assert.strictEqual(visible.coverage.miner.viable, 1);
assert.strictEqual(visible.coverage.miner.missing, 1);
assert.strictEqual(visible.coverage.hauler.target, 3);
assert.strictEqual(visible.coverage.reserver.target, 1);
assert.strictEqual(visible.coverage.builder.target, 1);
assert.strictEqual(visible.coverage.defender.target, 1);
assert.strictEqual(visible.route.available, true);
assert.strictEqual(visible.route.travelEstimate.oneWayMean, 30);
assert.strictEqual(visible.route.travelEstimate.roundTripMean, 80);
assert.strictEqual(visible.route.congestion.count, 1);
assert(Number.isFinite(visible.delivery.throughput.borderExportPerTick));
assert(Number.isFinite(visible.delivery.throughput.homeDeliveryPerTick));
assert.strictEqual(visible.authority.recovery, true);
assert.strictEqual(visible.authority.maintenance, true);
assert.strictEqual(visible.authority.growth, false);
assert(visible.blockedReasons.includes('2 live threat(s)'));

const unseen = result.remotes.find(row => row.roomName === 'W8N3');
assert.strictEqual(unseen.visibility.visible, false);
assert.strictEqual(unseen.visibility.observation.freshness,
  'stale by 25 ticks');
assert.strictEqual(unseen.inventory.sources, null);
assert.strictEqual(unseen.controller.ownership,
  'last-observed-neutral-reserved');
assert.strictEqual(unseen.route.road.incomplete, 1);
assert(unseen.blockedReasons.includes('remote room is not currently visible'));

const ownedTransition = result.remotes.find(row => row.roomName === 'W8N4');
assert.strictEqual(ownedTransition.support, 'owned-colony');
assert.strictEqual(ownedTransition.controller.ownership, 'owned-by-home-user');
assert.strictEqual(ownedTransition.authority.withdrawal, true);
assert.strictEqual(ownedTransition.coverage.miner.target, 0);
assert(result.console.includes('W7N3 south active'));
assert(result.console.includes('W8N4 left owned-colony'));
assert.deepStrictEqual(run('W7N4'), result,
  'remote status output is deterministic');
assert.strictEqual(JSON.stringify({ Game, Memory }), before,
  'remote status must not mutate Game, Memory, routes, surveys, or assignments');

const second = run('W8N4');
assert.deepStrictEqual(second.remotes.map(row => row.roomName), ['W7N3']);
assert.strictEqual(second.remotes[0].inventory.sources.energy, 3700,
  'shared visible inventory is reusable across home reports');
assert.strictEqual(second.remotes[0].coverage.miner.current, 1,
  'crew coverage remains isolated by remote home');
assert.strictEqual(second.remotes[0].coverage.miner.creeps[0].name,
  'otherHome');

assert.strictEqual(run().ok, false);
assert.strictEqual(run('W7N4', 'extra').ok, false);
assert.strictEqual(run('bad').error, 'Invalid Screeps room name: bad');
assert.strictEqual(run('W9N9').error,
  'Home room W9N9 is not currently visible');
Game.rooms.W6N6 = room('W6N6', { my: false }, {});
assert.strictEqual(run('W6N6').error,
  'Room W6N6 is not an owned home room');
assert.deepStrictEqual(observation(null, 1000), {
  tick: null, age: null, freshness: 'unknown'
});
assert.strictEqual(recentRate(null, 1000), null);

const ops = createOperatorConsole({ Game, commands: [{
  definition: REMOTES_DEFINITION, run
}] });
assert.strictEqual(ops.help('remotes').commands[0].signature,
  'ops.remotes(homeRoom)');
assert.strictEqual(ops.remotes('W7N4').ok, true);

const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.includes("require('operator.remotes')"));
assert(main.includes('definition: REMOTES_DEFINITION'));
assert(main.includes('run: createRemotesCommand({ Game, Memory,'));

console.log('operator remote status is deterministic, isolated and read-only');
