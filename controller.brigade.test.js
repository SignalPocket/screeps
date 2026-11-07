'use strict';

const assert = require('assert');
const { CONTROLLER_BRIGADE_ROLE, CONTROLLER_BRIGADE_SIZE,
  createControllerBrigade } = require('./controller.brigade');

class Position {
  constructor(x, y, roomName = 'W1N1') {
    this.x = x;
    this.y = y;
    this.roomName = roomName;
  }
  getRangeTo(target) {
    const point = target.pos || target;
    return Math.max(Math.abs(this.x - point.x), Math.abs(this.y - point.y));
  }
}

const routePoints = [
  { x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 9 },
  { x: 14, y: 9 }, { x: 15, y: 8 }, { x: 16, y: 8 },
  { x: 17, y: 7 }, { x: 18, y: 7 }, { x: 19, y: 6 },
  { x: 20, y: 6 }, { x: 21, y: 6 }, { x: 22, y: 6 },
  { x: 23, y: 6 }, { x: 24, y: 6 }, { x: 25, y: 6 },
  { x: 26, y: 6 }
];
const storage = {
  id: 'storage', pos: new Position(10, 10), store: { energy: 1000 }
};
const buffer = {
  id: 'buffer', structureType: 'container', pos: new Position(27, 6),
  store: { energy: 0, getFreeCapacity: () => 2000 }
};
const roadStructures = routePoints.map((point, index) => ({
  id: `road-${index}`, structureType: 'road', pos: new Position(point.x,
    point.y)
}));
const room = {
  name: 'W1N1', storage,
  controller: { pos: new Position(28, 6) },
  memory: { travelPathPlan: { paths: [{
    kinds: ['controller', 'storage'], points: routePoints.slice().reverse()
  }] } },
  getTerrain: () => ({ get: () => 0 }),
  lookForAt: () => []
};
const objects = { storage, buffer };
const Game = { time: 100, creeps: {}, getObjectById: id => objects[id] };
const moves = [];
const brigade = createControllerBrigade({
  Game, RoomPosition: Position, RESOURCE_ENERGY: 'energy', OK: 0,
  ERR_NOT_IN_RANGE: -9, LOOK_STRUCTURES: 'structures',
  LOOK_CONSTRUCTION_SITES: 'constructionSites',
  OBSTACLE_OBJECT_TYPES: ['spawn'], STRUCTURE_CONTAINER: 'container',
  STRUCTURE_ROAD: 'road', TERRAIN_MASK_WALL: 1,
  getRoomStructures: () => [buffer, ...roadStructures],
  getContainerPurpose: () => 'controller',
  moveCreep: (creep, target, moveRange, options) =>
    moves.push({ creep, target, range: moveRange, options })
});

const plan = brigade.buildPlan(room);
assert.ok(plan);
assert.strictEqual(plan.version, 12);
assert.strictEqual(plan.targetSize, CONTROLLER_BRIGADE_SIZE);
assert.strictEqual(plan.segments.length, 8);
assert.ok(plan.maxSegmentDistance <= 3);
assert.ok(plan.segments.every(segment => segment.distance === 1));
const secondaryBuffer = {
  id: 'buffer-secondary', structureType: 'container',
  pos: new Position(24, 7),
  store: { energy: 0, getFreeCapacity: () => 2000 }
};
const controllerLink = {
  id: 'controller-link', structureType: 'link',
  pos: new Position(26, 4),
  store: { energy: 0, getFreeCapacity: () => 800 }
};
const dualRoom = {
  ...room,
  memory: {
    travelPathPlan: room.memory.travelPathPlan,
    controllerContainerPlan: { containerId: buffer.id },
    controllerContainerPairPlan: {
      version: 2, secondaryX: 24, secondaryY: 7,
      branchX: 23, branchY: 6
    }
  },
  findPath: (origin, destination) => destination.x === 23
    ? routePoints.slice(0, 13) : [
      { x: 24, y: 6 }, { x: 25, y: 7 }, { x: 26, y: 6 }
    ]
};
const dualMoves = [];
const dualBrigade = createControllerBrigade({
  Game, RoomPosition: Position, RESOURCE_ENERGY: 'energy', OK: 0,
  ERR_NOT_IN_RANGE: -9, LOOK_STRUCTURES: 'structures',
  LOOK_CONSTRUCTION_SITES: 'constructionSites',
  OBSTACLE_OBJECT_TYPES: ['spawn', 'container', 'link'],
  STRUCTURE_CONTAINER: 'container', STRUCTURE_LINK: 'link',
  STRUCTURE_ROAD: 'road', TERRAIN_MASK_WALL: 1,
  getRoomStructures: () => [buffer, secondaryBuffer, controllerLink,
    ...roadStructures],
  getContainerPurpose: () => 'controller',
  moveCreep: (creep, target, moveRange, options) =>
    dualMoves.push({ creep, target, range: moveRange, options })
});
const dualPlan = dualBrigade.buildPlan(dualRoom);
assert.strictEqual(dualPlan.stationary, true);
assert.strictEqual(dualPlan.activeSize, CONTROLLER_BRIGADE_SIZE);
assert.strictEqual(dualPlan.pipelines.length, 1);
assert.strictEqual(dualPlan.segments[0].intake, true);
assert.deepStrictEqual(dualPlan.segments[12].destinationIds,
  [secondaryBuffer.id]);
assert.deepStrictEqual(dualPlan.segments[15].destinationIds, [buffer.id]);
assert.deepStrictEqual(dualPlan.segments[16].destinationIds,
  [controllerLink.id]);
assert.strictEqual(dualPlan.linkSlot, 16);
assert.ok(dualPlan.segments.every(segment => segment.distance === 0 &&
  segment.pickup.x === segment.delivery.x &&
  segment.pickup.y === segment.delivery.y));
objects[secondaryBuffer.id] = secondaryBuffer;
const branchSegment = dualPlan.segments[dualPlan.branchSlot];
const downstreamSegment = dualPlan.segments[branchSegment.downstreamSlot];
const stationaryReceiver = {
  name: `BRIG${branchSegment.downstreamSlot + 1}`,
  room: dualRoom,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: branchSegment.downstreamSlot },
  pos: new Position(downstreamSegment.pickup.x,
    downstreamSegment.pickup.y),
  store: { energy: 0, getFreeCapacity: () => 100 }
};
Game.creeps[stationaryReceiver.name] = stationaryReceiver;
let stationaryTarget;
let stationaryAmount;
const stationaryBranch = {
  name: `BRIG${dualPlan.branchSlot + 1}`,
  room: dualRoom,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: dualPlan.branchSlot },
  pos: new Position(branchSegment.pickup.x, branchSegment.pickup.y),
  store: { energy: 1, getFreeCapacity: () => 99 },
  transfer: (target, resource, amount) => {
    stationaryTarget = target;
    stationaryAmount = amount;
    return 0;
  }
};
assert.strictEqual(dualBrigade.run(stationaryBranch, dualPlan), true);
assert.strictEqual(stationaryTarget, secondaryBuffer);
assert.strictEqual(stationaryAmount, 1,
  'a stationary relay gives a partial load immediately');
stationaryBranch.store.energy = 100;
assert.strictEqual(dualBrigade.run(stationaryBranch, dualPlan), true);
assert.strictEqual(stationaryTarget, stationaryReceiver);
delete Game.creeps[stationaryReceiver.name];
delete objects[secondaryBuffer.id];
room.memory.controllerContainerPlan = { retireContainerId: buffer.id };
assert.strictEqual(brigade.buildPlan(room), null);
delete room.memory.controllerContainerPlan;

const replacementSite = {
  id: 'controller-site', structureType: 'container',
  pos: new Position(27, 6)
};
const originalLookForAt = room.lookForAt;
room.memory.controllerContainerPlan = { desiredX: 27, desiredY: 6 };
room.lookForAt = (look, x, y) =>
  look === 'constructionSites' && x === 27 && y === 6
    ? [replacementSite] : [];
const provisionalBrigade = createControllerBrigade({
  Game, RoomPosition: Position, RESOURCE_ENERGY: 'energy', OK: 0,
  ERR_NOT_IN_RANGE: -9, LOOK_STRUCTURES: 'structures',
  LOOK_CONSTRUCTION_SITES: 'constructionSites',
  OBSTACLE_OBJECT_TYPES: ['spawn'], STRUCTURE_CONTAINER: 'container',
  STRUCTURE_ROAD: 'road', TERRAIN_MASK_WALL: 1,
  getRoomStructures: () => roadStructures, getContainerPurpose: () => null,
  moveCreep: () => {}
});
const provisionalPlan = provisionalBrigade.buildPlan(room);
assert.ok(provisionalPlan.provisional);
assert.strictEqual(provisionalPlan.controllerBufferId, replacementSite.id);
objects[replacementSite.id] = replacementSite;
const finalSlot = plan.segments.length - 1;
const provisionalDelivery = provisionalPlan.segments[finalSlot].delivery;
const siteBuilder = {
  name: 'SITE-BUILDER', room,
  memory: { home: 'W1N1', role: 'builder', task: 'build',
    taskTarget: replacementSite.id },
  pos: new Position(provisionalDelivery.x, provisionalDelivery.y),
  store: { energy: 0, getFreeCapacity: () => 50 }
};
Game.creeps[siteBuilder.name] = siteBuilder;
const provisionalRelay = {
  name: 'BRIG8', room,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: finalSlot, controllerRelayState: 'delivery' },
  pos: new Position(provisionalDelivery.x, provisionalDelivery.y),
  store: { energy: 50, getFreeCapacity: () => 50 },
  transfer: target => {
    assert.strictEqual(target, siteBuilder);
    return 0;
  }
};
assert.strictEqual(provisionalBrigade.run(provisionalRelay,
  provisionalPlan), true);
assert.strictEqual(room.memory.controllerBrigadeStats.constructionFeedTotal, 50);
delete Game.creeps[siteBuilder.name];
delete objects[replacementSite.id];
room.lookForAt = originalLookForAt;
delete room.memory.controllerContainerPlan;
const routeKeys = new Set([
  '10,10', ...routePoints.map(point => `${point.x},${point.y}`), '27,6'
]);
for (const segment of plan.segments) {
  assert.ok(segment.distance <= 3);
  assert.ok(segment.distance >= 1);
  assert.strictEqual(segment.pickupOffRoad, false);
  assert.strictEqual(segment.deliveryOffRoad, false);
  assert.ok(routeKeys.has(`${segment.pickup.x},${segment.pickup.y}`));
  assert.ok(routeKeys.has(`${segment.delivery.x},${segment.delivery.y}`));
}
assert.deepStrictEqual(plan.rightOfWay, routePoints);
for (let slot = 0; slot < plan.segments.length - 1; slot++) {
  const sender = plan.segments[slot].delivery;
  const receiver = plan.segments[slot + 1].pickup;
  assert.ok(Math.max(Math.abs(sender.x - receiver.x),
    Math.abs(sender.y - receiver.y)) <= 1);
}

const roster = [0, 1, 3, 4, 5, 6, 7].map(slot => ({ memory: {
  home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE, controllerRelaySlot: slot
} }));
assert.strictEqual(brigade.getMissingSlot(roster, 'W1N1',
  plan.segments.length), 2);
const completeRoster = Array.from({ length: plan.segments.length },
  (_, slot) => ({ name: `BRIG${slot + 1}`, ticksToLive: slot === 2 ? 60 : 500,
    spawning: false, memory: { home: 'W1N1',
      role: CONTROLLER_BRIGADE_ROLE, controllerRelaySlot: slot } }));
assert.strictEqual(brigade.getMissingSlot(completeRoster, 'W1N1',
  plan.segments.length, 60), 2);
completeRoster.push({ name: 'BRIG3-R100', ticksToLive: 1500,
  spawning: false, memory: { home: 'W1N1',
    role: CONTROLLER_BRIGADE_ROLE, controllerRelaySlot: 2 } });
assert.strictEqual(brigade.getMissingSlot(completeRoster, 'W1N1',
  plan.segments.length, 60), null);
const rosterWithOverlapAndHole = completeRoster.filter(creep =>
  creep.memory.controllerRelaySlot !== 6);
assert.strictEqual(brigade.getMissingSlot(rosterWithOverlapAndHole, 'W1N1',
  plan.segments.length, 60), 6,
  'a real empty slot outranks an existing preventive overlap');

const substitute = {
  name: 'TEMP-H1', room, ticksToLive: 1000,
  memory: { home: 'W1N1', role: 'hauler' },
  pos: new Position(10, 10),
  store: { energy: 0, getFreeCapacity: () => 100 }
};
const secondSubstitute = {
  name: 'TEMP-H2', room, ticksToLive: 1000,
  memory: { home: 'W1N1', role: 'hauler' },
  pos: new Position(11, 10),
  store: { energy: 0, getFreeCapacity: () => 100 }
};
const replacement = {
  name: 'BRIG3-NEW', room, spawning: true, ticksToLive: undefined,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: 2 },
  pos: new Position(10, 10),
  store: { energy: 0, getFreeCapacity: () => 100 }
};
let substituteAssignments = brigade.reconcileSubstitutes({
  creeps: [replacement, substitute, secondSubstitute], roomName: 'W1N1', plan,
  candidates: [substitute, secondSubstitute]
});
assert.strictEqual(substitute.memory.controllerRelaySubstituteSlot, 0);
assert.strictEqual(secondSubstitute.memory.controllerRelaySubstituteSlot,
  undefined, 'one missing brigade must not create a shadow brigade');
assert.strictEqual(substituteAssignments.length, 1);
assert.strictEqual(substituteAssignments[0].creep, substitute.name);
assert.strictEqual(brigade.getMissingSlot([substitute], 'W1N1', 1), 0);
// Cover every other test-plan slot with real relays so the original candidate
// is not reused and the test can focus on release behavior for slot zero.
const coveringRelays = plan.segments.slice(1).map((segment, index) => ({
  name: `COVER${index + 2}`, room, spawning: false, ticksToLive: 1000,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: index + 1 },
  pos: new Position(segment.pickup.x, segment.pickup.y),
  store: { energy: 0, getFreeCapacity: () => 100 }
}));
replacement.memory.controllerRelaySlot = 0;
replacement.spawning = false;
replacement.pos = new Position(plan.segments[0].pickup.x - 2,
  plan.segments[0].pickup.y);
substituteAssignments = brigade.reconcileSubstitutes({
  creeps: [replacement, substitute, ...coveringRelays],
  roomName: 'W1N1', plan, candidates: []
});
assert.strictEqual(substitute.memory.controllerRelaySubstituteSlot, 0);
replacement.pos = new Position(plan.segments[0].pickup.x - 1,
  plan.segments[0].pickup.y);
substituteAssignments = brigade.reconcileSubstitutes({
  creeps: [replacement, substitute, ...coveringRelays],
  roomName: 'W1N1', plan, candidates: []
});
assert.strictEqual(substitute.memory.controllerRelaySubstituteSlot, undefined);
assert.strictEqual(substituteAssignments.some(entry => entry.slot === 0), false);

const overlapRelays = [...plan.segments.map(segment => segment.slot), 0, 1]
  .map((slot, index) => ({
  name: `OVERLAP-${index}`, room, spawning: false,
  ticksToLive: index < plan.segments.length ? 40 : 1500,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    birthRole: CONTROLLER_BRIGADE_ROLE, controllerRelaySlot: slot },
  pos: new Position(plan.segments[slot].pickup.x,
    plan.segments[slot].pickup.y),
  store: { energy: 0, getFreeCapacity: () => 100 }
}));
Game.creeps = Object.fromEntries(overlapRelays.map(creep =>
  [creep.name, creep]));
const overlapChanges = brigade.reconcileRealOverlaps('W1N1', plan);
assert.strictEqual(overlapChanges.reassigned.length, 0);
assert.strictEqual(overlapChanges.released.length, 1,
  'only one preventive real-relay overlap may remain');
const releasedRelay = overlapRelays.find(creep =>
  overlapChanges.released.includes(creep.name));
assert.strictEqual(releasedRelay.memory.role, 'hauler');
assert.strictEqual(releasedRelay.memory.controllerRelaySlot, undefined);

const holeRelays = plan.segments.filter(segment => segment.slot !== 4)
  .map(segment => ({
    name: `HOLE-${segment.slot}`, room, spawning: false, ticksToLive: 500,
    memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
      birthRole: CONTROLLER_BRIGADE_ROLE,
      controllerRelaySlot: segment.slot },
    pos: new Position(segment.pickup.x, segment.pickup.y),
    store: { energy: 0, getFreeCapacity: () => 100 }
  }));
const waitingRealRelay = {
  name: 'BRIG2-WAITING', room, spawning: false, ticksToLive: 1400,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    birthRole: CONTROLLER_BRIGADE_ROLE, controllerRelaySlot: 1,
    controllerRelayStandby: true, controllerRelaySeated: true,
    controllerRelaySeatingKey: 'stale', taskTarget: 'old seat' },
  pos: new Position(plan.segments[1].pickup.x + 1,
    plan.segments[1].pickup.y),
  store: { energy: 0, getFreeCapacity: () => 100 }
};
holeRelays.push(waitingRealRelay);
Game.creeps = Object.fromEntries(holeRelays.map(creep =>
  [creep.name, creep]));
const holeChanges = brigade.reconcileRealOverlaps('W1N1', plan);
assert.deepStrictEqual(holeChanges.reassigned,
  [{ creep: waitingRealRelay.name, from: 1, to: 4 }]);
assert.strictEqual(holeChanges.released.length, 0);
assert.strictEqual(waitingRealRelay.memory.controllerRelaySlot, 4);
assert.strictEqual(waitingRealRelay.memory.controllerRelayStandby, undefined);
assert.strictEqual(waitingRealRelay.memory.controllerRelaySeatingKey,
  undefined);
const unnecessarySub = {
  name: 'UNNECESSARY-SUB', room, ticksToLive: 1000,
  memory: { home: 'W1N1', role: 'hauler' },
  pos: new Position(10, 10),
  store: { energy: 0, getFreeCapacity: () => 100 }
};
assert.deepStrictEqual(brigade.reconcileSubstitutes({
  creeps: [...holeRelays, unnecessarySub], roomName: 'W1N1', plan,
  candidates: [unnecessarySub]
}), []);
assert.strictEqual(unnecessarySub.memory.controllerRelaySubstituteSlot,
  undefined, 'a duplicate real BRIG fills the hole before borrowing a SUB');
Game.creeps = {};

const reliefSegment = dualPlan.segments[1];
const incumbent = {
  name: 'BRIG2', ticksToLive: 20, room: dualRoom,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: 1 },
  pos: new Position(reliefSegment.pickup.x, reliefSegment.pickup.y),
  store: { energy: 0, getFreeCapacity: () => 100 }
};
const relief = {
  name: 'BRIG2-R100', ticksToLive: 1500, room: dualRoom,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: 1 },
  pos: new Position(reliefSegment.pickup.x + 1,
    reliefSegment.pickup.y + 1),
  store: { energy: 0, getFreeCapacity: () => 100 }
};
Game.creeps[incumbent.name] = incumbent;
Game.creeps[relief.name] = relief;
assert.strictEqual(dualBrigade.run(relief, dualPlan), true);
assert.strictEqual(relief.memory.controllerRelayStandby, true);
assert.strictEqual(relief.memory.taskTarget, 'BRIG2 relief waiting');
assert.strictEqual(dualMoves[dualMoves.length - 1].range, 1);
delete Game.creeps[incumbent.name];
assert.strictEqual(dualBrigade.run(relief, dualPlan), true);
assert.strictEqual(relief.memory.controllerRelayStandby, undefined);
assert.strictEqual(dualMoves[dualMoves.length - 1].range, 0);
delete Game.creeps[relief.name];

const lastSegment = plan.segments[finalSlot];
const relay = {
  name: 'BRIG8', room, memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: finalSlot, controllerRelayState: 'delivery' },
  pos: new Position(lastSegment.delivery.x, lastSegment.delivery.y),
  store: { energy: 100, getFreeCapacity: () => 0 },
  say: message => assert.strictEqual(message, 'BRIG8'),
  transfer: (target, resource, amount) => {
    assert.strictEqual(target, buffer);
    assert.strictEqual(resource, 'energy');
    assert.strictEqual(amount, 100);
    return 0;
  }
};
assert.strictEqual(brigade.run(relay, plan), true);
assert.strictEqual(relay.memory.controllerRelayState, 'pickup');

const loadedPickup = {
  name: 'BRIG2', room,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: 1, controllerRelayState: 'pickup' },
  pos: new Position(plan.segments[1].pickup.x,
    plan.segments[1].pickup.y),
  store: { energy: 100, getFreeCapacity: () => 0 },
  say: message => assert.strictEqual(message, 'BRIG2')
};
assert.strictEqual(brigade.run(loadedPickup, plan), true);
assert.strictEqual(loadedPickup.memory.controllerRelayState, 'delivery');
assert.strictEqual(moves[moves.length - 1].target.x,
  plan.segments[1].delivery.x);
assert.strictEqual(moves[moves.length - 1].options.roadOnly, true);

const unseatedRelay = {
  name: 'BRIG8', room,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: finalSlot },
  pos: new Position(11, 11),
  store: { energy: 0, getFreeCapacity: () => 100 }
};
assert.strictEqual(brigade.run(unseatedRelay, plan), true);
assert.strictEqual(unseatedRelay.memory.controllerRelaySeated, false);
assert.strictEqual(moves[moves.length - 1].options.roadOnly, false);

buffer.store.getFreeCapacity = () => 0;
const movesBeforeFullBuffer = moves.length;
const directRelay = {
  name: 'BRIG8', room,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: finalSlot, controllerRelayState: 'delivery' },
  pos: new Position(lastSegment.delivery.x, lastSegment.delivery.y),
  store: { energy: 50, getFreeCapacity: () => 50 },
  transfer: () => assert.fail('BRIG8 must wait when its give stop is full')
};
assert.strictEqual(brigade.run(directRelay, plan), true);
assert.strictEqual(directRelay.memory.taskTarget, 'controller buffer full');
assert.strictEqual(moves.length, movesBeforeFullBuffer);

const incomingRelay = {
  name: 'BRIG3', room,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: 2, controllerRelayState: 'pickup',
    controllerRelayIncoming: 100 },
  pos: new Position(plan.segments[2].pickup.x,
    plan.segments[2].pickup.y),
  store: { energy: 0, getFreeCapacity: () => 100 }
};
assert.strictEqual(brigade.run(incomingRelay, plan), true);
assert.strictEqual(incomingRelay.memory.controllerRelayState, 'delivery');
assert.strictEqual(incomingRelay.memory.taskTarget, 'BRIG3 incoming launch');
assert.strictEqual(moves[moves.length - 1].target.x,
  plan.segments[2].delivery.x);

const waitingReceiver = {
  name: 'BRIG3', room,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: 2, controllerRelayState: 'pickup' },
  pos: new Position(plan.segments[2].pickup.x + 3,
    plan.segments[2].pickup.y),
  store: { energy: 0, getFreeCapacity: () => 100 }
};
Game.creeps.BRIG3 = waitingReceiver;
const waitingSender = {
  name: 'BRIG2', room,
  memory: { home: 'W1N1', role: CONTROLLER_BRIGADE_ROLE,
    controllerRelaySlot: 1, controllerRelayState: 'delivery' },
  pos: new Position(plan.segments[1].delivery.x,
    plan.segments[1].delivery.y),
  store: { energy: 100, getFreeCapacity: () => 0 },
  transfer: () => assert.fail('sender must wait at its rendezvous')
};
assert.strictEqual(brigade.run(waitingSender, plan), true);
assert.strictEqual(waitingSender.memory.taskTarget, 'BRIG3 rendezvous waiting');

const priorSteps = room.memory.controllerBrigadeStats.stepsBySlot[2];
Game.time++;
incomingRelay.pos = new Position(plan.segments[2].delivery.x,
  plan.segments[2].delivery.y);
incomingRelay.memory.controllerRelayIncoming = 100;
assert.strictEqual(brigade.run(incomingRelay, plan), true);
assert.strictEqual(room.memory.controllerBrigadeStats.stepsBySlot[2],
  priorSteps + 1);

const stopKeys = new Set(plan.segments.flatMap(segment => [
  `${segment.pickup.x},${segment.pickup.y}`,
  `${segment.delivery.x},${segment.delivery.y}`
]));
for (const move of moves) {
  assert.ok(stopKeys.has(`${move.target.x},${move.target.y}`));
}

console.log('controller brigade scenarios passed');
