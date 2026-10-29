'use strict';

const assert = require('assert');
const { createBodyFactory } = require('./body.factory');
const { createResourceReservations } = require('./resource.reservations');
const { createRoomIndex } = require('./room.index');
const { createMovementService } = require('./movement.service');

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

console.log('common module scenarios passed');
