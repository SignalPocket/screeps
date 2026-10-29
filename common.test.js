'use strict';

const assert = require('assert');
const { createBodyFactory } = require('./body.factory');
const { createResourceReservations } = require('./resource.reservations');
const { createRoomIndex } = require('./room.index');
const { createMovementService } = require('./movement.service');
const { createCreepLifecycle } = require('./creep.lifecycle');
const { createCreepReporting, shortCreepName } = require('./creep.reporting');
const { createSourceStaffing } = require('./source.staffing');
const { createRoomStrategy } = require('./room.strategy');
const { createSourcePositions } = require('./source.positions');
const { deriveRoomStatus } = require('./room.status');
const { createOutpostStatus } = require('./outpost.status');
const { createRoomSituation } = require('./room.situation');
const { createWorkerLimits } = require('./worker.limits');
const { ROOM_STAGE_PLANS, getRoomStagePlan } = require('./room.stages');
const { createRemoteHauling } = require('./remote.hauling');
const { createEnergyPhase } = require('./energy.phase');
const { createRoadPlanner } = require('./road.planner');
const { createInfrastructurePlanner } = require('./infrastructure.planner');
const { createOutpostMaintenance } = require('./outpost.maintenance');
const { createMemoryMaintenance } = require('./memory.maintenance');
const { createCreepNaming } = require('./creep.naming');
const { createColonyDashboard } = require('./colony.dashboard');
const { createRefillManagement } = require('./refill.management');
const { createSpawnPolicy } = require('./spawn.policy');
const { normalizeBuilderMemory, isBuilder, isLocalBuilder,
  isOutpostBuilder, isExpansionBuilder } = require('./builder.roles');
const { selectRebalancerSurplus, getWithdrawalApproachTarget } =
  require('./creep.routing');

const parts = {
  WORK: 'work', CARRY: 'carry', MOVE: 'move', ATTACK: 'attack',
  RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', CLAIM: 'claim', TOUGH: 'tough',
  BODYPART_COST: { work: 100, carry: 50, move: 50, attack: 80,
    ranged_attack: 150, heal: 250, claim: 600, tough: 10 }
};
const bodies = createBodyFactory(parts);

const legacyFixer = { memory: { role: 'fixer', birthRole: 'fixer' } };
assert.strictEqual(normalizeBuilderMemory(legacyFixer.memory), true);
assert.deepStrictEqual(legacyFixer.memory, {
  role: 'builder', birthRole: 'builder', builderScope: 'local',
  builderMission: 'repair'
});
assert.strictEqual(isBuilder(legacyFixer), true);
assert.strictEqual(isLocalBuilder(legacyFixer), true);
const outpostBuilder = { memory: { role: 'remote-builder' } };
normalizeBuilderMemory(outpostBuilder.memory);
assert.strictEqual(isOutpostBuilder(outpostBuilder), true);
const expansionBuilder = { memory: { role: 'expansion-builder' } };
normalizeBuilderMemory(expansionBuilder.memory);
assert.strictEqual(isExpansionBuilder(expansionBuilder), true);

const spawnPolicyGame = { time: 100 };
const spawnPolicy = createSpawnPolicy({
  Game: spawnPolicyGame,
  buildBody: bodies.buildBody,
  CARRY: parts.CARRY,
  WORK: parts.WORK,
  MOVE: parts.MOVE
});
assert.strictEqual(spawnPolicy.getSpawnChargeWaitLimit(0, 10), 5);
assert.strictEqual(spawnPolicy.getSpawnChargeWaitLimit(5, 10), 15);
assert.strictEqual(spawnPolicy.getSpawnChargeWaitLimit(10, 10), 60);
const spawnPolicyCreep = (role, idleNow = false) => ({
  spawning: false,
  memory: { role, idleNow },
  getActiveBodyparts: part => part === parts.WORK || part === parts.CARRY
    ? 1 : 0
});
const idleRoom = {
  memory: { spawnWaitSince: 1, spawnWaitRole: 'worker', spawnWaitLimit: 60 },
  energyAvailable: 300,
  energyCapacityAvailable: 300,
  controller: { ticksToDowngrade: 10000 }
};
const idleRequest = spawnPolicy.prepareSpawnRequest({
  spawn: { room: idleRoom },
  assignment: { role: 'builder' },
  workers: [spawnPolicyCreep('harvester', true)],
  workerLimit: 2,
  hasWorkParts: creep => creep.getActiveBodyparts(parts.WORK) > 0
});
assert.strictEqual(idleRequest.needsWorker, false);
assert.strictEqual(idleRoom.memory.spawnWaitSince, undefined);
const refillerRoom = {
  memory: { spawnWaitSince: 75, spawnWaitRole: 'refiller' },
  energyAvailable: 100,
  energyCapacityAvailable: 1300,
  controller: { ticksToDowngrade: 10000 }
};
const refillerRequest = spawnPolicy.prepareSpawnRequest({
  spawn: { room: refillerRoom },
  assignment: { role: 'refiller', refillerFallbackAllowed: true },
  workers: [spawnPolicyCreep('harvester')],
  workerLimit: 2,
  hasWorkParts: creep => creep.getActiveBodyparts(parts.WORK) > 0
});
assert.deepStrictEqual(refillerRequest.body, ['carry', 'move']);
const builderRoom = {
  memory: {},
  energyAvailable: 300,
  energyCapacityAvailable: 300,
  controller: { ticksToDowngrade: 10000 }
};
const builderRequest = spawnPolicy.prepareSpawnRequest({
  spawn: { room: builderRoom },
  assignment: { role: 'builder' },
  workers: [spawnPolicyCreep('harvester')],
  workerLimit: 2,
  hasWorkParts: creep => creep.getActiveBodyparts(parts.WORK) > 0
});
assert.strictEqual(builderRequest.needsWorker, true);
assert.strictEqual(builderRequest.body, null);

const rosterStaffing = createSourceStaffing({
  Game: { time: 1 },
  getRoomSources: () => [],
  TERRAIN_MASK_WALL: 1,
  LOOK_STRUCTURES: 'structures',
  LOOK_CONSTRUCTION_SITES: 'sites',
  OBSTACLE_OBJECT_TYPES: [],
  BODYPART_COST: parts.BODYPART_COST,
  CARRY: parts.CARRY,
  MOVE: parts.MOVE,
  WORK: parts.WORK,
  ENERGY_REGEN_TIME: 300,
  HARVEST_POWER: 2
});
const roleCandidate = (name, work, carry, memory = {}) => ({
  name,
  memory: { ...memory },
  getActiveBodyparts: part => part === parts.WORK ? work :
    part === parts.CARRY ? carry : 0
});
const travellingReplacement = roleCandidate('replacement', 5, 1,
  { sourceReplacement: 'source-1' });
const surplusCarrier = roleCandidate('01-RB-61946', 1, 12,
  { role: 'hauler' });
const allocated = rosterStaffing.assignUnallocatedRoles({
  candidates: [travellingReplacement, surplusCarrier],
  sourceWorkerCount: 4,
  sourceWorkerLimit: 5,
  haulerCount: 2,
  haulerTarget: 2
});
assert.strictEqual(allocated.sourceWorkerCount, 5);
assert.strictEqual(travellingReplacement.memory.role, 'harvester');
assert.strictEqual(surplusCarrier.memory.role, 'hauler');

const refillRoom = {
  memory: {
    extensionCluster: { x: 12, y: 10 },
    extensionOverflowCluster: { x: 30, y: 30 }
  },
  energyCapacityAvailable: 1300,
  find: () => [{ pos: { getRangeTo: (x, y) =>
    Math.max(Math.abs(10 - x), Math.abs(10 - y)) } }]
};
const refillStructures = [
  { my: true, structureType: 'extension', pos: { x: 12, y: 10 } },
  { my: true, structureType: 'extension', pos: { x: 30, y: 30 } }
];
const refillManagement = createRefillManagement({
  Game: { time: 10 },
  getRoomStructures: () => refillStructures,
  isExtensionClusterTile: (anchor, x, y) =>
    Math.max(Math.abs(anchor.x - x), Math.abs(anchor.y - y)) <= 3,
  getRoomSituation: () => ({ targets: { refiller: 1 } }),
  FIND_MY_SPAWNS: 'spawns',
  STRUCTURE_SPAWN: 'spawn',
  STRUCTURE_EXTENSION: 'extension',
  RESOURCE_ENERGY: 'energy',
  BODYPART_COST: parts.BODYPART_COST,
  CARRY: parts.CARRY,
  MOVE: parts.MOVE,
  CARRY_CAPACITY: 50
});
const refillClusters = refillManagement.getRefillClusters(refillRoom);
assert.deepStrictEqual(refillClusters.map(cluster =>
  [cluster.id, cluster.fillsSpawn]), [
  ['primary', true], ['overflow', false]
]);
assert.strictEqual(refillManagement.getRefillerCarryFloor(refillRoom), 400);
const refiller = (name, capacity, x, y, memory = {}) => ({
  name,
  spawning: false,
  ticksToLive: 1000,
  memory: { role: 'refiller', ...memory },
  store: { getCapacity: () => capacity },
  pos: { getRangeTo: (targetX, targetY) =>
    Math.max(Math.abs(x - targetX), Math.abs(y - targetY)) }
});
const primaryRefiller = refiller('large', 400, 12, 10,
  { refillClusterId: 'primary' });
const overflowRefiller = refiller('small', 100, 30, 30);
refillManagement.reconcileRefillerClusters(refillRoom,
  [overflowRefiller, primaryRefiller]);
assert.strictEqual(primaryRefiller.memory.refillSpawnOwner, true);
assert.strictEqual(overflowRefiller.memory.refillClusterId, 'overflow');
refillManagement.releaseUndersizedRefillers(refillRoom,
  [overflowRefiller, primaryRefiller]);
assert.strictEqual(primaryRefiller.memory.role, 'refiller');
assert.strictEqual(overflowRefiller.memory.role, 'hauler');
assert.strictEqual(refillManagement.isRefillTargetFor(primaryRefiller,
  { structureType: 'spawn' }), true);

const namingMemory = { creeps: {}, roomOrdinals: {} };
const namingRoom = {
  name: 'W7N4',
  memory: {
    leftSurvey: { targetRoom: 'W8N4', started: 10 },
    southSurvey: { targetRoom: 'W7N3', started: 20 }
  }
};
const namingGame = {
  time: 500,
  creeps: {},
  spawns: { Spawn1: { room: namingRoom } }
};
const naming = createCreepNaming({
  Game: namingGame,
  Memory: namingMemory,
  getRoomSources: () => [{ id: 'source-1' }, { id: 'source-2' }]
});
naming.refreshRoomOrdinals();
assert.deepStrictEqual(namingMemory.roomOrdinals,
  { W7N4: 1, W8N4: 2, W7N3: 3 });
assert.strictEqual(naming.getBirthName(namingGame.spawns.Spawn1, {
  role: 'remote-scout', remoteRoom: 'W8N4', remoteSlot: 0
}), '02-OP-S1-500');
assert.strictEqual(naming.getBirthName(namingGame.spawns.Spawn1, {
  role: 'builder', builderScope: 'outpost', builderMission: 'maintenance',
  remoteRoom: 'W8N4', remoteBuilderSlot: 0
}), '02-BU-M1-500');
namingMemory.creeps['01-RF-P-500'] = {};
assert.strictEqual(naming.getBirthName(namingGame.spawns.Spawn1, {
  role: 'refiller', refillClusterId: 'primary'
}), '01-RF-P-500-2');

const dashboardDraws = [];
const dashboardRoom = {
  name: 'W1N1',
  controller: { my: true },
  memory: {
    spawnWaitRole: 'hauler', spawnWaitSince: 6, spawnWaitLimit: 15
  },
  energyAvailable: 100,
  energyCapacityAvailable: 300,
  visual: {
    rect: (...args) => dashboardDraws.push(['rect', ...args]),
    text: (...args) => dashboardDraws.push(['text', ...args])
  },
  find: () => [{ resourceType: 'energy', amount: 25 }]
};
const dashboardMemory = {};
const dashboardGame = {
  time: 10,
  rooms: { W1N1: dashboardRoom },
  spawns: { Spawn1: { spawning: { name: 'new' } } }
};
const dashboard = createColonyDashboard({
  Game: dashboardGame,
  Memory: dashboardMemory,
  getWorkerLimits: () => ({ workerLimit: 3 }),
  getRoomStructures: () => [
    { my: true, structureType: 'spawn', store: { energy: 100 } },
    { my: true, structureType: 'container', store: { energy: 500 } }
  ],
  shortRoles: { hauler: 'LC', harvester: 'LM' },
  maxSpawnWait: 60,
  RESOURCE_ENERGY: 'energy',
  STRUCTURE_SPAWN: 'spawn',
  STRUCTURE_EXTENSION: 'extension',
  FIND_DROPPED_RESOURCES: 'drops'
});
const dashboardCreeps = [
  { memory: { home: 'W1N1', role: 'hauler' }, store: { energy: 50 } },
  { memory: { home: 'W1N1', role: 'harvester' }, store: { energy: 0 } }
];
const dashboardSnapshot = dashboard.updateDashboard(dashboardCreeps, {
  localBuildTargets: 5,
  outpostBuildTargets: 2,
  localFixTargets: 1,
  outpostFixTargets: 2
});
assert.strictEqual(dashboardSnapshot.creeps, 2);
assert.strictEqual(dashboardSnapshot.spawning, 1);
assert.strictEqual(dashboardSnapshot.needed, 1);
assert.deepStrictEqual(dashboardSnapshot.waits, ['LC 4/15t']);
assert.strictEqual(dashboardSnapshot.totalEnergy, 675);
assert.deepStrictEqual(dashboardSnapshot.roleCounts, { LC: 1, LM: 1 });
assert.strictEqual(dashboardSnapshot.buildTargets, 7);
assert.strictEqual(dashboardSnapshot.fixTargets, 3);
assert.strictEqual(dashboardSnapshot.localBuildTargets, 5);
assert.strictEqual(dashboardSnapshot.outpostBuildTargets, 2);
assert.strictEqual(dashboardSnapshot.localFixTargets, 1);
assert.strictEqual(dashboardSnapshot.outpostFixTargets, 2);
dashboard.drawDashboard();
assert.ok(dashboardDraws.some(call => call[0] === 'text' &&
  call[1] === 'COLONY'));
assert.ok(dashboardDraws.some(call => call[0] === 'text' &&
  call[1] === 'Targets build L5/O2 | fix L1/O2'));
assert.ok(dashboardDraws.some(call => call[0] === 'text' &&
  call[1] === 'Types LM 1 | LC 1'));

const maintenanceMemory = {
  creeps: {
    dead: { role: 'hauler' },
    active: {
      navGoal: 'old', navLastTick: 800, navLastX: 1,
      dispatchCommitment: {
        roomName: 'W1N1', targetId: 'missing', lane: 'collect'
      }
    }
  },
  rooms: {
    W1N1: {
      leftSurvey: { targetRoom: 'W2N1', started: 10 },
      salvageScan: { updated: 800 },
      demandPlan: { tick: 800 },
      refillCarrier: 'dead', refillCarriers: ['dead'],
      spawnWaitSince: 700, spawnWaitLimit: 60,
      roadPlan: { signature: 'keep-me' }
    }
  },
  roomOrdinals: { W1N1: 1, W2N1: 2 },
  colonyDashboard: { updated: 800 }
};
const maintenance = createMemoryMaintenance({
  Game: {
    time: 1000,
    creeps: { active: {} },
    rooms: { W1N1: {} },
    getObjectById: () => null
  }
});
const maintenanceStats = maintenance.runMemoryMaintenance(maintenanceMemory);
assert.strictEqual(maintenanceStats.deadCreeps, 1);
assert.strictEqual(maintenanceStats.staleNavigation, 1);
assert.strictEqual(maintenanceStats.staleCommitments, 1);
assert.strictEqual(maintenanceStats.staleRoomState, 2);
assert.strictEqual(maintenanceMemory.creeps.dead, undefined);
assert.strictEqual(maintenanceMemory.creeps.active.navGoal, undefined);
assert.strictEqual(maintenanceMemory.creeps.active.dispatchCommitment,
  undefined);
assert.deepStrictEqual(maintenanceMemory.roomOrdinals,
  { W1N1: 1, W2N1: 2 });
assert.deepStrictEqual(maintenanceMemory.rooms.W1N1.leftSurvey,
  { targetRoom: 'W2N1', started: 10 });
assert.deepStrictEqual(maintenanceMemory.rooms.W1N1.roadPlan,
  { signature: 'keep-me' });

assert.strictEqual(bodies.workerCost, 200);
assert.deepStrictEqual(bodies.buildBody('harvester', 300),
  ['work', 'work', 'carry', 'move']);
assert.deepStrictEqual(bodies.buildBody('remote-hauler', 400),
  ['carry', 'carry', 'carry', 'carry', 'move', 'move', 'move', 'move']);
assert.deepStrictEqual(bodies.buildBody('remote-scout', 1000),
  ['work', 'work', 'work', 'carry', 'move', 'move']);
assert.strictEqual(bodies.buildBody('refiller', 800)
  .filter(part => part === 'carry').length, 8);
assert.deepStrictEqual(bodies.buildBody('refiller', 100), ['carry', 'move']);
assert.strictEqual(bodies.buildBody('refiller', 99), null);
assert.ok(bodies.buildBody('upgrader', 800)
  .filter(part => part === 'work').length >= 6);
const fullBuilderBody = bodies.buildBody('builder', 1300);
assert.strictEqual(fullBuilderBody.filter(part => part === 'work').length, 6);
assert.strictEqual(fullBuilderBody.filter(part => part === 'carry').length, 6);
assert.strictEqual(fullBuilderBody.filter(part => part === 'move').length, 6);
assert.strictEqual(bodies.getBodyCode(['work', 'carry', 'move']), 'M-C-W');

const outpostMaintenance = createOutpostMaintenance({
  STRUCTURE_CONTAINER: 'container', STRUCTURE_ROAD: 'road'
});
const maintenancePosition = { getRangeTo: target => target.range };
const damagedRoad = {
  id: 'road', structureType: 'road', hits: 1500, hitsMax: 5000, range: 1
};
const damagedContainer = {
  id: 'container', structureType: 'container', hits: 100000,
  hitsMax: 250000, range: 10
};
assert.strictEqual(outpostMaintenance.needsMaintenance(
  [damagedRoad, damagedContainer]), true);
assert.strictEqual(outpostMaintenance.selectRepairTarget(
  [damagedRoad, damagedContainer], maintenancePosition).id, 'container');
damagedContainer.hits = 225000;
assert.strictEqual(outpostMaintenance.isRepairTarget(damagedContainer), false);

const target = {
  id: 'buffer',
  store: {
    energy: 500,
    getFreeCapacity: () => 300
  }
};
const reservations = createResourceReservations('energy');
assert.strictEqual(reservations.reserveEnergyFrom(target, 200), 200);
assert.strictEqual(reservations.getUnreservedEnergy(target), 300);
assert.strictEqual(reservations.reserveCapacityIn(target, 100), 100);
assert.strictEqual(reservations.getUnreservedCapacity(target), 200);
reservations.releaseAmount(reservations.reservedEnergy, target, 50);
assert.strictEqual(reservations.getUnreservedEnergy(target), 350);

const indexedObjects = {
  sources: [{ id: 'source' }],
  structures: [{ id: 'structure' }],
  sites: [{ id: 'site' }],
  creeps: [{ id: 'creep' }]
};
const findCalls = {};
const room = {
  name: 'W1N1',
  memory: {},
  find: type => {
    findCalls[type] = (findCalls[type] || 0) + 1;
    return indexedObjects[type];
  }
};
const objectsById = Object.fromEntries(Object.values(indexedObjects)
  .flat().map(object => [object.id, object]));
const roomIndex = createRoomIndex({
  Game: { time: 10, getObjectById: id => objectsById[id] },
  FIND_SOURCES: 'sources', FIND_STRUCTURES: 'structures',
  FIND_MY_CONSTRUCTION_SITES: 'sites', FIND_MY_CREEPS: 'creeps'
});
assert.strictEqual(roomIndex.getRoomSources(room)[0].id, 'source');
assert.strictEqual(roomIndex.getRoomStructures(room)[0].id, 'structure');
roomIndex.getRoomSources(room);
assert.strictEqual(findCalls.sources, 1);
assert.strictEqual(roomIndex.getSlowWorkInventory(room).sites[0].id, 'site');

let moveOptions;
const movementGame = { time: 20, rooms: { W1N1: {
  memory: { travelPathPlan: { paths: [
    { points: [{ x: 2, y: 2 }, { x: 4, y: 4 }] },
    { points: [{ x: 2, y: 2 }, { x: 4, y: 4 }] }
  ] } },
  find: type => type === 'structures'
    ? [
      { structureType: 'road', pos: { x: 2, y: 2 } },
      { structureType: 'road', pos: { x: 3, y: 3 } }
    ]
    : []
} } };
const movement = createMovementService({
  Game: movementGame,
  Room: { deserializePath: () => [] },
  FIND_STRUCTURES: 'structures', FIND_MY_CREEPS: 'creeps',
  STRUCTURE_ROAD: 'road', OK: 0, ERR_INVALID_TARGET: -7
});
const movingCreep = {
  name: 'carrier',
  room: { name: 'W1N1' },
  pos: { x: 1, y: 1, getRangeTo: position =>
    Math.max(Math.abs(1 - position.x), Math.abs(1 - position.y)) },
  memory: {},
  store: { getUsedCapacity: () => 0 },
  moveTo: (destination, options) => {
    moveOptions = options;
    return 0;
  }
};
assert.strictEqual(movement.moveCreep(movingCreep,
  { id: 'target', pos: { x: 5, y: 5, roomName: 'W1N1' } }, 1), 0);
assert.strictEqual(moveOptions.reusePath, 25);
assert.strictEqual(moveOptions.range, 1);
assert.strictEqual(moveOptions.plainCost, 3);
assert.strictEqual(moveOptions.swampCost, 12);
const movementCosts = {
  values: {},
  set(x, y, value) { this.values[`${x}:${y}`] = value; },
  get(x, y) { return this.values[`${x}:${y}`] || 0; }
};
moveOptions.costCallback('W1N1', movementCosts);
assert.strictEqual(movementCosts.get(2, 2), 1);
assert.strictEqual(movementCosts.get(3, 3), 2);
assert.strictEqual(movementCosts.get(4, 4), 2);
assert.strictEqual(movingCreep.memory.navCostVersion, 'planned-roads-v5');

const lifecycle = createCreepLifecycle({
  Game: { map: { findRoute: () => [{ room: 'W1N2' }, { room: 'W1N3' }] } },
  WORK: 'work', MOVE: 'move', CREEP_SPAWN_TIME: 3
});
const remoteCreep = {
  body: ['work', 'carry', 'move'],
  memory: { remoteHome: 'W1N1', remoteRoom: 'W1N3' },
  room: { name: 'W1N2' },
  ticksToLive: 310,
  spawning: false,
  getActiveBodyparts: part => part === 'work' || part === 'move' ? 1 : 0
};
assert.strictEqual(lifecycle.hasWorkParts(remoteCreep), true);
assert.strictEqual(lifecycle.hasRoadMobility(remoteCreep), true);
assert.strictEqual(lifecycle.hasBuilderBody(remoteCreep), false);
const balancedBuilder = {
  body: ['work', 'work', 'work', 'work', 'carry', 'carry', 'move', 'move',
    'move'],
  getActiveBodyparts: part => part === 'work' ? 4 : part === 'move' ? 3 : 0
};
const fatiguedUpgrader = {
  body: [...Array(11).fill('work'), 'carry', 'carry', 'move', 'move'],
  getActiveBodyparts: part => part === 'work' ? 11 : part === 'move' ? 2 : 0
};
assert.strictEqual(lifecycle.hasBuilderBody(balancedBuilder), true);
assert.strictEqual(lifecycle.hasRoadMobility(fatiguedUpgrader), false);
assert.strictEqual(lifecycle.hasBuilderBody(fatiguedUpgrader), false);
assert.strictEqual(lifecycle.getRemoteReplacementLead(remoteCreep), 309);
assert.strictEqual(lifecycle.hasRemoteReplacementLife(remoteCreep), true);
remoteCreep.ticksToLive = 309;
assert.strictEqual(lifecycle.hasRemoteReplacementLife(remoteCreep), false);
remoteCreep.ticksToLive = 60;
assert.strictEqual(lifecycle.hasLocalReplacementLife(remoteCreep), true);
remoteCreep.ticksToLive = 59;
assert.strictEqual(lifecycle.hasLocalReplacementLife(remoteCreep), false);
remoteCreep.spawning = true;
assert.strictEqual(lifecycle.hasLocalReplacementLife(remoteCreep), true);
assert.strictEqual(lifecycle.hasRemoteReplacementLife(remoteCreep), true);
assert.strictEqual(lifecycle.hasWorkParts(null), false);

const reportObjects = {
  source1: { id: 'source1', energyCapacity: 3000, ticksToRegeneration: 20 },
  controller: { id: 'controller' }
};
const reportRoom = { name: 'W2N2', controller: reportObjects.controller };
reportObjects.source1.room = reportRoom;
const reportingGame = {
  time: 42,
  creeps: {},
  getObjectById: id => reportObjects[id]
};
const reporting = createCreepReporting({
  Game: reportingGame,
  getRoomSources: () => [reportObjects.source1],
  STRUCTURE_CONTAINER: 'container'
});
assert.strictEqual(shortCreepName('worker-12'), '12');
assert.strictEqual(reporting.formatTaskTarget('source1 @ W2N2'),
  'Source 1 @ W2N2');
const deadMemory = { 'worker-9': {
  role: 'hauler', lastTask: 'remote-haul', lastRoom: 'W2N2', lastTtl: 0
} };
const originalLog = console.log;
let deathLog;
console.log = message => { deathLog = message; };
reporting.logDeadCreeps(deadMemory);
console.log = originalLog;
assert.deepStrictEqual(deadMemory, {});
assert.strictEqual(deathLog, '[42] EXPIRED 9 LC/RHaul in W2N2');

const staffingGame = { time: 100 };
const staffingSource = {
  id: 'staff-source',
  pos: { x: 10, y: 10 },
  energy: 3000,
  energyCapacity: 3000,
  ticksToRegeneration: 0
};
const staffingRoom = {
  name: 'W3N3',
  memory: {},
  energyCapacityAvailable: 550,
  getTerrain: () => ({ get: (x, y) => x === 9 && y === 9 ? 1 : 0 }),
  lookForAt: (type, x, y) => type === 'structures' && x === 11 && y === 11
    ? [{ structureType: 'spawn' }] : []
};
const staffing = createSourceStaffing({
  Game: staffingGame,
  getRoomSources: () => [staffingSource],
  TERRAIN_MASK_WALL: 1,
  LOOK_STRUCTURES: 'structures',
  LOOK_CONSTRUCTION_SITES: 'sites',
  OBSTACLE_OBJECT_TYPES: ['spawn'],
  BODYPART_COST: { carry: 50, move: 50, work: 100 },
  CARRY: 'carry', MOVE: 'move', WORK: 'work',
  ENERGY_REGEN_TIME: 300, HARVEST_POWER: 2
});
assert.strictEqual(staffing.getSourceSpotCount(staffingRoom, staffingSource), 6);
assert.strictEqual(staffing.getSourceBodyWorkCapacity(staffingRoom), 4);
assert.deepStrictEqual(staffing.getSourceWorkerTargets(staffingRoom,
  { 'staff-source': 3 }), { 'staff-source': 2 });

const strategyGame = {
  time: 125,
  spawns: { Spawn1: { room: { name: 'W3N3' } } },
  gcl: { level: 2 }
};
const strategyRoom = {
  name: 'W3N3',
  controller: { level: 4, pos: { getRangeTo: () => 0 } },
  memory: {},
  find: () => []
};
const roomStrategy = createRoomStrategy({
  Game: strategyGame,
  getRoomSources: () => [],
  getRoomStagePlan,
  FIND_STRUCTURES: 'structures', FIND_MY_SPAWNS: 'spawns',
  FIND_MY_STRUCTURES: 'my-structures', STRUCTURE_ROAD: 'road',
  STRUCTURE_TOWER: 'tower'
});
assert.strictEqual(roomStrategy.getRoomStrategy(strategyRoom).mode,
  'development');
assert.strictEqual(strategyRoom.memory.strategy.updated, 125);
assert.strictEqual(strategyRoom.memory.stagePlan.key, 'reserves');
assert.strictEqual(Object.keys(ROOM_STAGE_PLANS).length, 9);
assert.strictEqual(getRoomStagePlan(2).construction[0], 'source containers');
assert.strictEqual(getRoomStagePlan(8).key, 'mature');

const rangeTo = (origin, targetOrX, maybeY) => {
  const target = typeof targetOrX === 'number'
    ? { x: targetOrX, y: maybeY }
    : (targetOrX.pos || targetOrX);
  return Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y));
};
const positionSource1 = { id: 'position-source-1', pos: { x: 4, y: 4 } };
const positionSource2 = { id: 'position-source-2', pos: { x: 10, y: 10 } };
for (const source of [positionSource1, positionSource2]) {
  source.pos.getRangeTo = (targetOrX, maybeY) =>
    rangeTo(source.pos, targetOrX, maybeY);
}
const tunnelSite = {
  id: 'tunnel', structureType: 'road', progressTotal: 500,
  pos: { x: 11, y: 10 }
};
const sourcePositions = createSourcePositions({
  getRoomSources: () => [positionSource1, positionSource2],
  getRoomSites: () => [tunnelSite],
  LOOK_STRUCTURES: 'structures', LOOK_CREEPS: 'creeps',
  OBSTACLE_OBJECT_TYPES: ['spawn'], STRUCTURE_ROAD: 'road',
  STRUCTURE_RAMPART: 'rampart', TERRAIN_MASK_WALL: 1
});
const positionRoom = {
  getTerrain: () => ({ get: () => 0 }),
  lookForAt: () => []
};
const stationContainer = {
  pos: { x: 9, y: 10, getRangeTo: (targetOrX, maybeY) =>
    rangeTo({ x: 9, y: 10 }, targetOrX, maybeY) }
};
assert.deepStrictEqual(sourcePositions.findMinerStation(positionRoom,
  positionSource2, stationContainer, {}, null, { x: 9, y: 10 }),
{ x: 9, y: 10 });
assert.strictEqual(sourcePositions.getSource2TunnelSite(positionRoom).id,
  'tunnel');

const starvedStatus = deriveRoomStatus({
  sourceCount: 2, energyRatio: 0.2, energyCapacity: 550,
  storedEnergy: 200, storedSourceEnergy: 0, sourceEnergyRatio: 0.1,
  emptySourceCount: 2, controllerTicks: 10000
});
assert.strictEqual(starvedStatus.key, 'energy-starved');
assert.strictEqual(starvedStatus.harvest, 'fully-used');
assert.strictEqual(starvedStatus.reserve, 'critical');

const miningGapStatus = deriveRoomStatus({
  sourceCount: 2, energyRatio: 0.8, energyCapacity: 550,
  storedEnergy: 600, storedSourceEnergy: 100, sourceEnergyRatio: 0.9,
  sourceHighEnergyRate: 0.4, controllerTicks: 10000
});
assert.strictEqual(miningGapStatus.key, 'mining-gap');
assert.strictEqual(miningGapStatus.harvest, 'underused');

const blockedStatus = deriveRoomStatus({
  sourceCount: 2, energyRatio: 0.4, energyCapacity: 550,
  storedEnergy: 1800, storedSourceEnergy: 1600, sourceEnergyRatio: 0.3,
  bufferRatio: 0.8, controllerTicks: 10000
});
assert.strictEqual(blockedStatus.key, 'logistics-blocked');
assert.strictEqual(blockedStatus.logistics, 'blocked');

const surplusStatus = deriveRoomStatus({
  sourceCount: 2, energyRatio: 1, energyCapacity: 550,
  storedEnergy: 5000, storedSourceEnergy: 500, sourceEnergyRatio: 0.4,
  controllerTicks: 10000
});
assert.strictEqual(surplusStatus.key, 'energy-surplus');
assert.strictEqual(surplusStatus.score, 100);

const outpostRoom = {
  name: 'W3N4', memory: {},
  find: () => []
};
const outpostSource = {
  energy: 0, energyCapacity: 3000,
  pos: { getRangeTo: () => 1 }
};
const outpostContainer = {
  structureType: 'container', hits: 250000, hitsMax: 250000,
  store: { energy: 1800, getCapacity: () => 2000 }
};
const outpostStatusService = createOutpostStatus({
  Game: { time: 200 }, deriveRoomStatus,
  getRoomSources: () => [outpostSource],
  getRoomStructures: () => [outpostContainer],
  STRUCTURE_CONTAINER: 'container', RESOURCE_ENERGY: 'energy',
  FIND_DROPPED_RESOURCES: 'drops', FIND_MY_CONSTRUCTION_SITES: 'sites'
});
assert.strictEqual(outpostStatusService.updateOutpostStatus(outpostRoom).key,
  'haul-backlog');
assert.strictEqual(outpostRoom.memory.roomStatus.kind, 'outpost');

let capturedPolicyState;
let capturedHealthState;
const situationSource = {
  id: 'situation-source', energy: 1500, energyCapacity: 3000,
  pos: { getRangeTo: () => 1 }
};
const situationContainer = {
  structureType: 'container', my: true,
  pos: { x: 10, y: 10, getRangeTo: () => 10 },
  store: { energy: 800, getCapacity: () => 2000 },
  hits: 200000, hitsMax: 250000
};
const situationSpawn = {
  structureType: 'spawn', my: true,
  room: { name: 'W4N4' },
  pos: { getRangeTo: () => 8 },
  store: { energy: 100, getCapacity: () => 300 },
  hits: 5000, hitsMax: 5000
};
const situationRoom = {
  name: 'W4N4', memory: {}, energyAvailable: 150,
  energyCapacityAvailable: 300,
  controller: {
    level: 3, my: true, ticksToDowngrade: 9000,
    pos: { getRangeTo: () => 2 }
  },
  getTerrain: () => ({ get: () => 0 }),
  lookForAt: () => [],
  find: type => type === 'spawns' ? [situationSpawn] : []
};
const roomSituation = createRoomSituation({
  Game: { time: 300, creeps: {}, rooms: {} },
  derivePopulationPolicy: state => {
    capturedPolicyState = state;
    return {
      mode: 'developing',
      roles: {
        source: { min: 1, desired: 1, max: 2 },
        hauler: { min: 1, desired: 1, max: 2 }
      },
      remote: {}, totals: { min: 2, desired: 2, max: 4 }
    };
  },
  deriveRoomStatus: state => {
    capturedHealthState = state;
    return { key: 'stable', label: 'Stable', score: 90,
      reserve: 'healthy', harvest: 'working', logistics: 'flowing',
      reasons: ['test'], metrics: {} };
  },
  getRoomSources: () => [situationSource],
  getRoomStructures: () => [situationContainer, situationSpawn],
  getSlowWorkInventory: () => ({ sites: [],
    structures: [situationContainer, situationSpawn] }),
  getSourceBodyWorkCapacity: () => 5,
  getSourceSpotCount: () => 2,
  getSource2TunnelSite: () => null,
  hasLocalReplacementLife: () => true,
  roadsPaused: () => false,
  STRUCTURE_CONTAINER: 'container', STRUCTURE_ROAD: 'road',
  STRUCTURE_WALL: 'wall', STRUCTURE_RAMPART: 'rampart',
  STRUCTURE_EXTENSION: 'extension', STRUCTURE_SPAWN: 'spawn',
  RESOURCE_ENERGY: 'energy', TERRAIN_MASK_WALL: 1,
  LOOK_STRUCTURES: 'structures', OBSTACLE_OBJECT_TYPES: ['spawn'],
  FIND_DROPPED_RESOURCES: 'drops', FIND_MY_CONSTRUCTION_SITES: 'sites',
  FIND_SOURCES: 'sources', FIND_MY_SPAWNS: 'spawns',
  ENERGY_REGEN_TIME: 300, HARVEST_POWER: 2
});
const situationResult = roomSituation.getRoomSituation(situationRoom);
assert.strictEqual(capturedPolicyState.energyRatio, 0.5);
assert.strictEqual(capturedPolicyState.storedSourceEnergy, 800);
assert.strictEqual(capturedPolicyState.sourceCount, 1);
assert.strictEqual(capturedHealthState.sourceEnergyRatio, 0.5);
assert.strictEqual(situationResult.targets.hauler, 1);
assert.strictEqual(situationRoom.memory.populationPolicy.updated, 300);
assert.strictEqual(situationRoom.memory.roomStatus.key, 'stable');

const limitSource = {
  id: 'limit-source', pos: { x: 20, y: 20,
    getRangeTo: (x, y) => Math.max(Math.abs(20 - x), Math.abs(20 - y)) }
};
const limitRoom = {
  name: 'W5N5',
  memory: { outpostPlan: {
    active: true, targetRoom: 'W5N6',
    remoteWorkNeeds: [{ minMiners: 2 }],
    remoteHaulerTarget: 2, remoteBuilderTarget: 1
  } },
  getTerrain: () => ({ get: () => 0 }),
  lookForAt: () => []
};
const limitRoleNames = ['source', 'builder', 'repairBuilder', 'upgrader',
  'hauler', 'refiller', 'rebalancer', 'tunnelBuilder'];
const limitRoles = Object.fromEntries(limitRoleNames.map(name =>
  [name, { min: 1, desired: 1, max: 2 }]));
const limitTargets = Object.fromEntries(limitRoleNames.map(name =>
  [name, 1]));
const workerLimits = createWorkerLimits({
  Game: { time: 400 },
  getRoomSources: () => [limitSource],
  getRoomCreeps: () => [{ memory: { navStuck: 2, navLastTick: 400 } }],
  getSourceWorkerTargets: () => ({ 'limit-source': 2 }),
  getRoomSituation: () => ({ targets: limitTargets,
    policy: { roles: limitRoles } }),
  LOOK_STRUCTURES: 'structures', LOOK_CONSTRUCTION_SITES: 'sites',
  OBSTACLE_OBJECT_TYPES: ['spawn'], STRUCTURE_ROAD: 'road',
  STRUCTURE_RAMPART: 'rampart', TERRAIN_MASK_WALL: 1
}).getWorkerLimits(limitRoom);
assert.strictEqual(workerLimits.sourceSpotTotal, 8);
assert.strictEqual(workerLimits.remoteWorkerMinimum, 4);
assert.strictEqual(workerLimits.minimumWorkerLimit, 12);
assert.strictEqual(workerLimits.workerLimit, 14);
assert.strictEqual(limitRoom.memory.congestionCount, 1);

const remoteContainer = {
  id: 'remote-container',
  structureType: 'container',
  store: { energy: 1600, getCapacity: () => 2000 }
};
const remoteSource = {
  id: 'remote-source', energyCapacity: 3000,
  pos: {
    x: 10, y: 10,
    getRangeTo: () => 1,
    findInRange: () => [remoteContainer]
  }
};
const remoteSpawn = { pos: { x: 25, y: 25 } };
const richContainers = [
  { id: 'rich-1', structureType: 'container',
    store: { energy: 2000, getCapacity: () => 2000 } },
  { id: 'rich-2', structureType: 'container',
    store: { energy: 1000, getCapacity: () => 2000 } }
];
const richSource = {
  id: 'rich-source', energyCapacity: 3000,
  pos: {
    x: 20, y: 20,
    getRangeTo: () => 1,
    findInRange: () => richContainers
  }
};
const haulingGame = {
  time: 500,
  map: { getRoomLinearDistance: () => 1 },
  rooms: {
    W6N6: {
      energyAvailable: 300, energyCapacityAvailable: 300, memory: {},
      find: type => type === 'spawns' ? [remoteSpawn] : []
    },
    W6N7: {
      find: type => type === 'sources' ? [remoteSource] :
        type === 'structures' ? [remoteContainer] : []
    },
    W6N8: {
      find: type => type === 'sources' ? [richSource] :
        type === 'structures' ? richContainers : []
    }
  }
};
const remoteHauling = createRemoteHauling({
  Game: haulingGame,
  PathFinder: { search: () => ({ path: Array(30).fill({}) }) },
  buildBody: () => ['carry', 'carry', 'move'],
  FIND_SOURCES: 'sources', FIND_STRUCTURES: 'structures',
  FIND_MY_SPAWNS: 'spawns', STRUCTURE_CONTAINER: 'container',
  RESOURCE_ENERGY: 'energy', CARRY: 'carry', CARRY_CAPACITY: 50,
  ENERGY_REGEN_TIME: 300
});
assert.strictEqual(remoteHauling.getRemoteHaulReadiness('W6N7', 0).ready,
  true);
assert.strictEqual(remoteHauling.getRemoteResourceSummary('W6N8').storedEnergy,
  3000);
assert.strictEqual(remoteHauling.rankRemoteDispatchRooms(
  ['W6N7', 'W6N8'], { W6N8: 1000 })[0].roomName, 'W6N8');
assert.strictEqual(remoteHauling.rankRemoteDispatchRooms(
  ['W6N7', 'W6N8'], { W6N8: 2500 })[0].roomName, 'W6N7');
const savedLog = console.log;
console.log = () => {};
assert.strictEqual(remoteHauling.getRemoteHaulerTarget('W6N6', 'W6N7'), 6);
console.log = savedLog;

const phaseGame = { time: 600 };
const phaseRoom = {
  name: 'W7N7', energyAvailable: 300, energyCapacityAvailable: 300,
  memory: {}
};
const energyPhase = createEnergyPhase({ Game: phaseGame, workerCost: 200 });
assert.strictEqual(energyPhase.updateEnergyWorkPhase(phaseRoom), 'work');
phaseGame.time = 601;
phaseRoom.energyAvailable = 100;
console.log = () => {};
assert.strictEqual(energyPhase.updateEnergyWorkPhase(phaseRoom), 'refill');
console.log = savedLog;

const roadSpawn = { id: 'road-spawn', pos: { x: 5, y: 5 } };
const roadSource = { id: 'road-source', pos: { x: 15, y: 15 } };
const roadController = { id: 'road-controller', pos: { x: 25, y: 25 } };
for (const object of [roadSpawn, roadSource, roadController]) {
  object.pos.getRangeTo = target => rangeTo(object.pos, target);
}
const roadRoom = {
  name: 'W8N8', memory: {
    extensionCluster: { x: 8, y: 12 },
    remoteRoadPlan: { paths: [{ slot: 0, points: [
      { x: 47, y: 20, roomName: 'W8N8' },
      { x: 48, y: 20, roomName: 'W8N8' },
      { x: 0, y: 20, roomName: 'W9N8' },
      { x: 1, y: 20, roomName: 'W9N8' }
    ] }] }
  }, controller: roadController,
  find: type => type === 'spawns' ? [roadSpawn] : [],
  getPositionAt: (x, y) => ({ x, y }),
  findPath: () => [{ x: 6, y: 6 }, { x: 7, y: 7 }]
};
const roadPlanner = createRoadPlanner({
  Game: { time: 700 }, scheduledRoomTick: () => false,
  getRoomSources: () => [roadSource], getRoomCreeps: () => [],
  showTrafficHeatmap: false, FIND_MY_SPAWNS: 'spawns',
  FIND_STRUCTURES: 'structures', FIND_MY_CONSTRUCTION_SITES: 'sites',
  STRUCTURE_ROAD: 'road', STRUCTURE_CONTAINER: 'container',
  LOOK_STRUCTURES: 'structures-at',
  LOOK_CONSTRUCTION_SITES: 'sites-at', TERRAIN_MASK_WALL: 1,
  TERRAIN_MASK_SWAMP: 2, OK: 0
});
const importantPaths = roadPlanner.getImportantRoadPaths(roadRoom);
assert.strictEqual(importantPaths.length, 2);
const travelPaths = roadPlanner.getImportantTravelPaths(roadRoom);
assert.strictEqual(travelPaths.length, 6);
assert.ok(roadRoom.memory.travelPathPlan.signature
  .startsWith('v2-converging-important-pairs'));
assert.ok(travelPaths.every(path => path.points.length === 2));
assert.ok(travelPaths.some(path =>
  path.kinds.includes('extensions') && path.kinds.includes('controller')));
const interRoomPaths = roadPlanner.getInterRoomTravelPaths(roadRoom);
assert.strictEqual(interRoomPaths.W8N8.length, 1);
assert.strictEqual(interRoomPaths.W9N8.length, 1);
assert.deepStrictEqual(interRoomPaths.W9N8[0].points,
  [{ x: 0, y: 20 }, { x: 1, y: 20 }]);
const convergedPaths = roadPlanner.getConvergedTravelPaths([
  { label: 'a', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
  { label: 'b', points: [{ x: 2, y: 2 }, { x: 3, y: 3 }] }
]);
assert.deepStrictEqual(convergedPaths.map(path => path.points),
  [[{ x: 2, y: 2 }], [{ x: 2, y: 2 }]]);
assert.strictEqual(roadPlanner.isSingleLaneRoadPosition(roadRoom,
  { pos: { x: 6, y: 6 } }), true);
assert.strictEqual(roadPlanner.isHeatmapRoadPosition(roadRoom,
  { pos: { x: 6, y: 6 } }), true);
assert.strictEqual(roadPlanner.isHeatmapRoadPosition(roadRoom,
  { pos: { x: 8, y: 8 } }), false);
assert.strictEqual(roadPlanner.getRoadBudget(roadRoom, importantPaths, 3), 50);

const infrastructureSource = {
  id: 'infra-source',
  pos: { x: 10, y: 10, getRangeTo: target => {
    const position = target.pos || target;
    return Math.max(Math.abs(10 - position.x), Math.abs(10 - position.y));
  } }
};
const infrastructurePlanner = createInfrastructurePlanner({
  Game: { time: 800, creeps: {}, getObjectById: () => null },
  RoomPosition: function (x, y, roomName) { return { x, y, roomName }; },
  getRoomSources: () => [infrastructureSource],
  isSingleLaneRoadPosition: () => false,
  CONTROLLER_STRUCTURES: {
    extension: { 4: 20 }, container: {}, storage: { 4: 1 }
  },
  STRUCTURE_EXTENSION: 'extension', STRUCTURE_CONTAINER: 'container',
  STRUCTURE_STORAGE: 'storage',
  STRUCTURE_ROAD: 'road', STRUCTURE_RAMPART: 'rampart',
  FIND_MY_STRUCTURES: 'my-structures',
  FIND_MY_CONSTRUCTION_SITES: 'sites', FIND_MY_SPAWNS: 'spawns',
  FIND_STRUCTURES: 'structures', TERRAIN_MASK_WALL: 1,
  TERRAIN_MASK_SWAMP: 2, LOOK_STRUCTURES: 'structures-at',
  LOOK_CONSTRUCTION_SITES: 'sites-at', LOOK_CREEPS: 'creeps-at',
  RESOURCE_ENERGY: 'energy', OK: 0
});
assert.strictEqual(infrastructurePlanner.isExtensionClusterTile(
  { x: 20, y: 20 }, 20, 20), true);
assert.strictEqual(infrastructurePlanner.isExtensionClusterTile(
  { x: 20, y: 20 }, 19, 20), false);
const infrastructureRoom = {
  memory: { extensionCluster: { x: 20, y: 20 } },
  controller: { pos: { getRangeTo: () => 10 } }
};
assert.strictEqual(infrastructurePlanner.getContainerPurpose(
  infrastructureRoom, { x: 11, y: 10 }), 'source:infra-source');
const extensionBuffer = {
  structureType: 'container',
  pos: { x: 20, y: 21, getRangeTo: targetOrX =>
    typeof targetOrX === 'number' ? 1 : 10 }
};
assert.strictEqual(infrastructurePlanner.isExtensionRefillBuffer(
  infrastructureRoom, extensionBuffer), true);

const overflowSites = [];
const saturatedCluster = { x: 10, y: 10, version: 'low-traffic-v1' };
const overflowSpawn = {
  pos: { x: 25, y: 25, getRangeTo: (x, y) =>
    Math.max(Math.abs(25 - x), Math.abs(25 - y)) }
};
const overflowRoom = {
  name: 'W8N7',
  memory: { extensionCluster: saturatedCluster, traffic: { tiles: {} } },
  controller: { my: true, level: 4, pos: { getRangeTo: () => 10 } },
  find: (type, options) => {
    if (type === 'spawns') return [overflowSpawn];
    if (type === 'sites') return [];
    if (type === 'my-structures') {
      return Array.from({ length: 14 }, () => ({
        structureType: 'extension'
      })).filter(options && options.filter || (() => true));
    }
    return [];
  },
  findPath: () => Array(7).fill({}),
  getTerrain: () => ({ get: () => 0 }),
  lookForAt: (type, x, y) => type === 'structures-at' &&
    infrastructurePlanner.isExtensionClusterTile(saturatedCluster, x, y)
    ? [{ structureType: 'road' }] : [],
  createConstructionSite: (x, y, structureType) => {
    overflowSites.push({ x, y, structureType });
    return 0;
  }
};
assert.strictEqual(infrastructurePlanner.placeExtensionSite(overflowRoom), true);
assert.strictEqual(overflowSites.length, 3);
assert.ok(overflowRoom.memory.extensionOverflowCluster);
assert.ok(overflowSites.every(site => site.structureType === 'extension'));

let storageSite;
let builtExtensionCount = 19;
const storageSpawn = {
  pos: { x: 5, y: 5, getRangeTo: (x, y) =>
    Math.max(Math.abs(5 - x), Math.abs(5 - y)) }
};
const storageRoom = {
  name: 'W8N8', storage: null,
  memory: { extensionCluster: { x: 20, y: 20 }, traffic: { tiles: {} } },
  controller: {
    my: true, level: 4,
    pos: { getRangeTo: (x, y) =>
      Math.max(Math.abs(30 - x), Math.abs(30 - y)) }
  },
  find: (type, options) => {
    if (type === 'spawns') return [storageSpawn];
    if (type === 'sites') return [];
    if (type === 'my-structures') {
      return Array.from({ length: builtExtensionCount }, () => ({
        structureType: 'extension'
      })).filter(options && options.filter || (() => true));
    }
    return [];
  },
  getTerrain: () => ({ get: () => 0 }),
  lookForAt: () => [],
  createConstructionSite: (x, y, structureType) => {
    storageSite = { x, y, structureType };
    return 0;
  }
};
assert.strictEqual(infrastructurePlanner.placeStorageSite(storageRoom), false);
assert.strictEqual(storageSite, undefined);
builtExtensionCount = 20;
assert.strictEqual(infrastructurePlanner.placeStorageSite(storageRoom), true);
assert.strictEqual(storageSite.structureType, 'storage');

const expiringBalancer = {
  name: 'old-balancer', ticksToLive: 20, viable: false,
  store: { getCapacity: () => 200 }, memory: { role: 'rebalancer' }
};
const viableBalancer = {
  name: 'new-balancer', ticksToLive: 1000, viable: true,
  store: { getCapacity: () => 100 }, memory: { role: 'rebalancer' }
};
const rebalancerSelection = selectRebalancerSurplus(
  [expiringBalancer, viableBalancer], 1, creep => creep.viable, 'energy');
assert.strictEqual(rebalancerSelection.keepers[0].name, 'new-balancer');
assert.strictEqual(rebalancerSelection.surplus[0].name, 'old-balancer');

const routingUpgrader = { memory: { role: 'upgrader' } };
const controllerBuffer = { id: 'controller-buffer' };
const sourceBuffer = { id: 'source-buffer' };
const controllerPosition = { x: 30, y: 30 };
const routingStation = {
  buffer: controllerBuffer,
  position: controllerPosition
};
assert.strictEqual(getWithdrawalApproachTarget(routingUpgrader,
  controllerBuffer, routingStation), controllerPosition);
assert.strictEqual(getWithdrawalApproachTarget(routingUpgrader,
  sourceBuffer, routingStation), sourceBuffer);

console.log('common module scenarios passed');
