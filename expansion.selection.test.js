'use strict';

const assert = require('assert');
const { createExpansionPlanner } = require('./expansion.planner');

// Selection happens before claiming or construction. Keep those side effects
// unavailable so the tests enforce a read-only choice from surveyed rooms.
const room = (name, sources = 2, containers = 0, roads = 0) => ({
  name,
  controller: { owner: null },
  sources: Array.from({ length: sources }, () => ({})),
  structures: [
    ...Array.from({ length: containers }, () => ({ structureType: 'container' })),
    ...Array.from({ length: roads }, () => ({ structureType: 'road' })),
    { structureType: 'tower' }
  ],
  find(kind, { filter }) {
    assert.strictEqual(kind, 'structures');
    return this.structures.filter(filter);
  }
});

const setup = (left, south) => {
  const Game = { rooms: {} };
  for (const candidate of [left, south]) {
    if (candidate) Game.rooms[candidate.name] = candidate;
  }
  const home = { memory: {
    leftSurvey: { targetRoom: left?.name, active: true },
    southSurvey: { targetRoom: south?.name, active: true },
    unrelated: { preserved: true }
  } };
  const planner = createExpansionPlanner({ Game,
    getRoomSources: candidate => candidate.sources,
    FIND_STRUCTURES: 'structures', STRUCTURE_CONTAINER: 'container',
    STRUCTURE_ROAD: 'road' });
  return { Game, home, planner, select: () => planner.selectExpansionTarget(home) };
};

{
  const f = setup(room('W8N4', 1, 3, 4), room('W7N3', 2));
  assert.strictEqual(f.planner.scoreCandidate(f.Game.rooms.W8N4), 179);
  assert.strictEqual(f.select().room, f.Game.rooms.W7N3,
    'two sources beat one source plus three containers and four roads');
  f.Game.rooms.W8N4.structures.push({ structureType: 'container' });
  assert.strictEqual(f.select().score, 204);
  assert.strictEqual(f.select().room, f.Game.rooms.W8N4,
    'container infrastructure contributes to the shared ranking');
}

{
  const a = room('W8N4', 2, 1, 0);
  const b = room('W7N3', 2, 1, 1);
  for (const [left, south] of [[a, b], [b, a]]) {
    const f = setup(left, south);
    assert.strictEqual(f.select().room, b, 'a road breaks the infrastructure tie');
  }
  b.structures = b.structures.filter(s => s.structureType !== 'road');
  for (const [left, south] of [[a, b], [b, a]]) {
    const f = setup(left, south);
    const before = JSON.stringify({ rooms: f.Game.rooms, memory: f.home.memory });
    assert.strictEqual(f.select().room, b, 'equal scores use room name, not survey order');
    assert.strictEqual(f.select().room, b, 'repeated selection remains stable');
    assert.strictEqual(JSON.stringify({ rooms: f.Game.rooms, memory: f.home.memory }), before,
      'selection must preserve all room and survey records');
  }
}

{
  const a = room('W8N4');
  const b = room('W7N3', 4);
  const f = setup(a, b);
  b.controller.owner = { username: 'other' };
  assert.strictEqual(f.select().room, a, 'foreign ownership excludes the higher score');
  b.controller.owner = { username: 'colony' };
  b.controller.my = true;
  assert.strictEqual(f.select().room, a, 'already owned rooms are not new targets');
  delete b.controller;
  assert.strictEqual(f.select().room, a, 'controllerless rooms are ineligible');
  delete f.Game.rooms[a.name];
  assert.strictEqual(f.select(), null, 'invisible rooms cannot be scored');
  f.home.memory.leftSurvey = null;
  delete f.home.memory.southSurvey;
  assert.strictEqual(f.select(), null, 'missing surveys are safe');
  f.Game.rooms[a.name] = a;
  f.home.memory.leftSurvey = { targetRoom: a.name };
  f.home.memory.southSurvey = { targetRoom: a.name };
  assert.strictEqual(f.select().room, a, 'duplicate survey references retain the same room');
}

console.log('expansion selection preserves scoring, deterministic ties and eligibility without mutation');
