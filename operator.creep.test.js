'use strict';

const assert = require('assert');
const { createOperatorConsole } = require('./operator.console');
const { CREEP_DEFINITION, createCreepCommand, activeBody,
  sizeTier, remoteAssignment } = require('./operator.creep');

const makeStore = (values, capacity) => ({ ...values,
  getCapacity: () => capacity,
  getUsedCapacity: () => Object.values(values).reduce((sum, value) =>
    sum + value, 0),
  getFreeCapacity: () => capacity - Object.values(values)
    .reduce((sum, value) => sum + value, 0)
});
const target = { id: 'abc123', structureType: 'storage',
  room: { name: 'W7N4' }, pos: { x: 20, y: 21, roomName: 'W7N4' } };
const homeMemory = {
  demandPlan: { tick: 1998, assignments: { hauler: 'storage' },
    jobs: { hauler: { lane: 'storage', targetId: 'abc123', amount: 50,
      created: 1990 } }, commitments: {} },
  pickupReservations: { tick: 2000, jobs: {} }
};
const Game = { time: 2000, rooms: {
  W7N4: { name: 'W7N4', controller: { my: true }, memory: homeMemory },
  W8N4: { name: 'W8N4', controller: { my: true }, memory: {} }
}, creeps: {}, getObjectById: id => id === target.id ? target : null };
Game.creeps.hauler = {
  name: 'hauler', ticksToLive: 400, fatigue: 0, spawning: false,
  room: Game.rooms.W7N4,
  pos: { x: 10, y: 11, roomName: 'W7N4' },
  body: [{ type: 'carry', hits: 100 }, { type: 'carry', hits: 100 },
    { type: 'move', hits: 100 }, { type: 'move', hits: 0 }],
  store: makeStore({ energy: 75, power: 0 }, 100),
  memory: {
    home: 'W7N4', role: 'hauler', birthRole: 'hauler',
    assignmentRole: 'hauler', bodyType: 'hauler', task: 'store',
    lastTask: 'withdraw', taskTarget: 'abc123 storage', demandLane: 'storage',
    workJob: { id: 'job-1', roomName: 'W7N4', lane: 'storage',
      targetId: 'abc123', sourceId: null, amount: 75, priority: 20,
      reason: 'stored energy', created: 1990, updated: 2000 },
    dispatchCommitment: { lane: 'storage', targetId: 'abc123', amount: 75,
      updated: 2000 },
    waitState: 'blocked', waitReason: 'destination temporarily full',
    waitAge: { state: 'blocked', authority: 'assignment',
      reason: 'destination temporarily full', target: 'abc123 storage',
      since: 1990, updated: 1999, age: 9, prolonged: false },
    navGoal: 'W7N4:20:21:1', navStuck: 2, navLastTick: 1999,
    navBlocker: { name: 'other', count: 2, updated: 1999 },
    navRecovery: { tick: 1999, reason: 'friendly-blocker', stuck: 2 },
    navCorridor: { goal: 'W7N4:20:21:1', room: 'W7N4', tick: 1997,
      steps: [{ x: 11, y: 11 }, { x: 12, y: 11 }] },
    _move: { path: '334455' }
  }
};
Game.creeps.remote = {
  name: 'remote', ticksToLive: 500, fatigue: 2, spawning: false,
  room: { name: 'W7N3' }, pos: { x: 25, y: 0, roomName: 'W7N3' },
  body: ['work', 'carry', 'move'], store: makeStore({}, 50),
  memory: { home: 'W8N4', role: 'remote-miner', remoteRoom: 'W7N3' }
};
Game.creeps.retiring = {
  name: 'retiring', ticksToLive: 200, fatigue: 0, spawning: false,
  room: Game.rooms.W7N4, pos: { x: 5, y: 6, roomName: 'W7N4' },
  body: ['carry', 'move'], store: makeStore({}, 50),
  memory: { home: 'W7N4', role: 'retire', staffingRetire: true,
    retiredRole: 'refiller', retirementReason: 'surplus above policy maximum' }
};
const colonyCommand = () => ({ ok: true, rooms: [
  { roomName: 'W7N4', observations: { roomPlan: { tick: 2000 } } },
  { roomName: 'W8N4', observations: { roomPlan: { tick: 2000 } } }
] });
const run = createCreepCommand({ Game, colonyCommand,
  inferAssignmentKind: memory => memory.assignmentKind || null,
  getBodyType: memory => memory.role === 'hauler' ? 'hauler' : 'field',
  getTaskLabel: task => ({ store: 'Store', withdraw: 'Get' }[task] || task),
  canBodyTypeRunLane: (bodyType, lane) => bodyType === 'hauler'
    ? ['collect', 'refill', 'buffer', 'storage', 'supply'].includes(lane)
    : true,
  getLocalReplacementLead: () => 100,
  getRemoteReplacementLead: () => 300
});
const before = JSON.stringify({ Game, homeMemory });
const result = run('hauler');
assert.strictEqual(result.ok, true);
assert.strictEqual(result.tick, 2000);
assert.strictEqual(result.identity.archetype, 'hauler');
assert.strictEqual(result.identity.sizeTier, 'small');
assert.deepStrictEqual(result.body, {
  length: 4, active: { carry: 2, move: 1 }, damaged: 1
});
assert.deepStrictEqual(result.carried.resources, { energy: 75 });
assert.strictEqual(result.lifecycle.replacementDeadline, 2300);
assert.strictEqual(result.location.home, 'W7N4');
assert.strictEqual(result.task.target.id, 'abc123');
assert.strictEqual(result.movement.state, 'stuck-or-oscillating');
assert.strictEqual(result.movement.cachedRoute.encodedLength, 6);
assert.strictEqual(result.ownership.reservedAmount, 75);
assert.strictEqual(result.ownership.finalizedJob.lane, 'storage');
assert.strictEqual(result.wait.age, 9);
assert.strictEqual(result.observations.wait.freshness, 'stale by 1 ticks');
assert.strictEqual(result.observations.demandPlan.freshness,
  'stale by 2 ticks');
assert(result.fallbacks.compatible.includes('storage'));
assert(result.fallbacks.rejected.some(row => row.lane === 'upgrade'));
assert.strictEqual(result.task.lastSuccessfulAction, null);
assert.strictEqual(result.fallbacks.policyRejections, null);
assert(result.console.includes('destination temporarily full'));
assert.deepStrictEqual(run('hauler'), result);
assert.strictEqual(JSON.stringify({ Game, homeMemory }), before,
  'creep inspection must not mutate live objects or Memory');

const remote = run('remote');
assert.strictEqual(remote.ok, true);
assert.strictEqual(remote.location.home, 'W8N4');
assert.strictEqual(remote.location.currentRoom, 'W7N3');
assert.strictEqual(remote.location.targetRoom, 'W7N3');
assert.strictEqual(remote.lifecycle.replacementLead, 300);
assert.strictEqual(remote.lifecycle.replacementDeadline, 2200);
assert.strictEqual(remote.observations.demandPlan.freshness, 'unknown');
const retiring = run('retiring');
assert.strictEqual(retiring.lifecycle.retirement.active, true);
assert.strictEqual(retiring.lifecycle.retirement.retiredRole, 'refiller');
assert.strictEqual(retiring.lifecycle.retirement.reason,
  'surplus above policy maximum');
assert.strictEqual(run().error, 'ops.creep(creepName) requires one creep name');
assert.strictEqual(run('hauler', 'extra').ok, false);
assert.strictEqual(run('').error, 'Invalid Screeps creep name: ');
assert.strictEqual(run('missing').error,
  'Creep missing is not alive or visible');
assert.strictEqual(createCreepCommand({ Game: { time: 1 } })('x').error,
  'Live creep data is unavailable');
assert.strictEqual(remoteAssignment({ role: 'builder',
  builderScope: 'outpost' }), true);
assert.strictEqual(sizeTier(new Array(31).fill('move')), 'maximum');
assert.deepStrictEqual(activeBody(null), {
  length: null, active: null, damaged: null
});

const ops = createOperatorConsole({ Game, commands: [{
  definition: CREEP_DEFINITION, run
}] });
assert.strictEqual(ops.help('creep').commands[0].signature,
  'ops.creep(creepName)');

console.log('operator.creep tests passed');
