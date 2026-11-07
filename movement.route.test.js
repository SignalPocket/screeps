'use strict';
const assert = require('assert');
const { selectRoomExitWaypoint } = require('./movement.route');
const { createMovementService } = require('./movement.service');
const graph = { W8N4: { 3: 'W7N4' }, W7N4: { 7: 'W8N4', 5: 'W7N3' },
  W7N3: { 1: 'W7N4', 7: 'W8N3' }, W8N3: { 3: 'W7N3' } };
const route = from => from === 'W8N4' ? [{ exit: 3, room: 'W7N4' }]
  : from === 'W7N4' ? [{ exit: 5, room: 'W7N3' }]
    : [{ exit: 7, room: 'W8N3' }];
const tiles = { W8N4: [{ x: 49, y: 40, roomName: 'W8N4' }],
  W7N4: [{ x: 39, y: 49, roomName: 'W7N4' }],
  W7N3: [{ x: 0, y: 18, roomName: 'W7N3' }] };
const rooms = Object.fromEntries(Object.keys(graph).map(name => [name, {
  name, memory: {}, find: exit => {
    assert(graph[name][exit], 'never ask for a nonexistent southern exit');
    return tiles[name] || [];
  }, getTerrain: () => ({ get: (x, y) =>
    name === 'W8N4' && y === 49 || name === 'W8N3' && y === 0 ? 1 : 0 })
}]));
let routeCalls = 0;
const Game = { time: 10, rooms, creeps: {}, map: {
  describeExits: name => graph[name], findRoute: from => { routeCalls++; return route(from); }
} };
let moved;
const creep = { name: 'trapped-hauler', room: rooms.W8N4,
  memory: { _move: { path: 'stale-southern-wall-path' } }, fatigue: 0,
  store: { getUsedCapacity: () => 0 }, pos: { x: 18, y: 48,
    getRangeTo: () => 40, findClosestByPath: choices => choices[0] },
  moveTo: (target, options) => { moved = { target, options }; return 0; } };
const first = selectRoomExitWaypoint({ Game, creep, targetRoom: 'W8N3' });
assert.strictEqual(first.position.x, 49);
assert.strictEqual(first.position.roomName, 'W8N4');
assert.strictEqual(creep.memory.navRoomWaypoint.nextRoom, 'W7N4');
assert.strictEqual(creep.memory._move, undefined, 'discard the old partial wall path');
selectRoomExitWaypoint({ Game, creep, targetRoom: 'W8N3' });
assert.strictEqual(routeCalls, 1, 'retain a valid route leg instead of rerouting every tick');
creep.memory._move = { path: 'first-destination' };
selectRoomExitWaypoint({ Game, creep, targetRoom: 'W7N3' });
assert.strictEqual(creep.memory.navRoomWaypoint.targetRoom, 'W7N3');
assert.strictEqual(creep.memory._move, undefined, 'destination changes invalidate the prior leg path');
const savedNeighborTerrain = rooms.W7N4.getTerrain;
rooms.W7N4.getTerrain = () => ({ get: () => 1 });
assert.strictEqual(selectRoomExitWaypoint({ Game, creep, targetRoom: 'W8N3' }), null,
  'a border is unusable when the neighboring entry tile is a wall');
rooms.W7N4.getTerrain = savedNeighborTerrain;
const service = createMovementService({ Game, Room: { deserializePath: () => [] },
  OK: 0, ERR_INVALID_TARGET: -7, ERR_NO_PATH: -2, ERR_TIRED: -11 });
for (const name of ['W8N4', 'W7N4', 'W7N3']) {
  creep.room = rooms[name];
  Game.time++;
  assert.strictEqual(service.moveCreep(creep, { roomName: 'W8N3', x: 25, y: 25 }, 20), 0);
  assert.strictEqual(moved.target.roomName, name);
  assert.strictEqual(moved.options.range, 0, 'cross the exit, rather than stopping short');
  assert.strictEqual(moved.options.maxRooms, 1);
  assert.strictEqual(creep.memory.navGoal, 'W8N3:25:25:20', 'keep the final task goal');
}
creep.room = rooms.W8N3;
service.moveCreep(creep, { roomName: 'W8N3', x: 25, y: 25 }, 20);
assert.strictEqual(moved.options.range, 20, 'restore the requested action range after arrival');
assert.strictEqual(moved.options.maxRooms, undefined);
assert.strictEqual(creep.memory.navRoomWaypoint, undefined);
creep.memory.navRoomWaypoint = { fromRoom: 'W7N3', targetRoom: 'W8N3' };
creep.memory._move = { path: 'last-leg' };
creep.pos.getRangeTo = () => 10;
assert.strictEqual(service.moveCreep(creep, { roomName: 'W8N3', x: 25, y: 25 }, 20), 0);
assert.strictEqual(creep.memory.navRoomWaypoint, undefined,
  'being within the arrival range also clears the completed leg');
creep.pos.getRangeTo = () => 40;
creep.room = rooms.W8N4;
creep.fatigue = 5;
creep.memory._move = { path: 'retain-during-fatigue' };
const routeCallsBeforeFatigue = routeCalls;
assert.strictEqual(service.moveCreep(creep, { roomName: 'W8N3', x: 25, y: 25 }, 20), -11);
assert.strictEqual(routeCalls, routeCallsBeforeFatigue, 'fatigue cannot initiate a new room route');
assert.strictEqual(creep.memory._move.path, 'retain-during-fatigue');
creep.fatigue = 0;
Game.map.findRoute = () => -2;
const before = moved;
assert.strictEqual(service.moveCreep(creep, { roomName: 'W8N3', x: 25, y: 25 }, 20), -2);
assert.strictEqual(moved, before, 'a missing route cannot reuse an invalid movement intent');
console.log('room routing follows real exits, crosses each leg and restores action range');
