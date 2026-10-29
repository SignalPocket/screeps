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

const parts = {
  WORK: 'work', CARRY: 'carry', MOVE: 'move', ATTACK: 'attack',
  RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', CLAIM: 'claim', TOUGH: 'tough',
  BODYPART_COST: { work: 100, carry: 50, move: 50, attack: 80,
    ranged_attack: 150, heal: 250, claim: 600, tough: 10 }
};
const bodies = createBodyFactory(parts);
assert.strictEqual(bodies.workerCost, 200);
assert.deepStrictEqual(bodies.buildBody('harvester', 300),
  ['work', 'work', 'carry', 'move']);
assert.deepStrictEqual(bodies.buildBody('remote-hauler', 400),
  ['work', 'carry', 'move', 'carry', 'move', 'carry', 'move']);
assert.ok(bodies.buildBody('upgrader', 800)
  .filter(part => part === 'work').length >= 6);
assert.strictEqual(bodies.getBodyCode(['work', 'carry', 'move']), 'M-C-W');

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
  find: () => []
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

const lifecycle = createCreepLifecycle({
  Game: { map: { findRoute: () => [{ room: 'W1N2' }, { room: 'W1N3' }] } },
  WORK: 'work', CREEP_SPAWN_TIME: 3
});
const remoteCreep = {
  body: ['work', 'carry', 'move'],
  memory: { remoteHome: 'W1N1', remoteRoom: 'W1N3' },
  room: { name: 'W1N2' },
  ticksToLive: 310,
  spawning: false,
  getActiveBodyparts: part => part === 'work' ? 1 : 0
};
assert.strictEqual(lifecycle.hasWorkParts(remoteCreep), true);
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
assert.strictEqual(deathLog, '[42] EXPIRED 9 Ha/RHaul in W2N2');

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
const limitRoleNames = ['source', 'builder', 'fixer', 'upgrader', 'hauler',
  'refiller', 'rebalancer', 'digger'];
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
const roadRoom = {
  name: 'W8N8', memory: {}, controller: roadController,
  find: type => type === 'spawns' ? [roadSpawn] : [],
  findPath: () => [{ x: 6, y: 6 }, { x: 7, y: 7 }]
};
const roadPlanner = createRoadPlanner({
  Game: { time: 700 }, scheduledRoomTick: () => false,
  getRoomSources: () => [roadSource], getRoomCreeps: () => [],
  showTrafficHeatmap: false, FIND_MY_SPAWNS: 'spawns',
  FIND_STRUCTURES: 'structures', FIND_MY_CONSTRUCTION_SITES: 'sites',
  STRUCTURE_ROAD: 'road', LOOK_STRUCTURES: 'structures-at',
  LOOK_CONSTRUCTION_SITES: 'sites-at', TERRAIN_MASK_WALL: 1,
  TERRAIN_MASK_SWAMP: 2, OK: 0
});
const importantPaths = roadPlanner.getImportantRoadPaths(roadRoom);
assert.strictEqual(importantPaths.length, 3);
assert.strictEqual(roadPlanner.isSingleLaneRoadPosition(roadRoom,
  { pos: { x: 6, y: 6 } }), true);
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
  CONTROLLER_STRUCTURES: { extension: {}, container: {} },
  STRUCTURE_EXTENSION: 'extension', STRUCTURE_CONTAINER: 'container',
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

console.log('common module scenarios passed');
