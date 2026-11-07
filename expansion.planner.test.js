'use strict';

const assert = require('assert');
const { createExpansionPlanner } = require('./expansion.planner');
const { planBootstrapSpawn } = require('./bootstrap.workforce');

// Exercise the real planner across ticks, retaining the room memory that the
// spawn authority and bootstrap workforce consume. Site mocks persist writes,
// so a second planner pass can expose accidental duplicate construction.
const setup = () => {
  const calls = [];
  const permissions = { expansion: true, expansionMaintenance: true };
  const pos = (x, y) => ({ x, y, getRangeTo: (a, b) =>
    Math.max(Math.abs(x - (typeof a === 'object' ? a.x : a)),
      Math.abs(y - (typeof a === 'object' ? a.y : b))) });
  const room = (name, my = false) => ({ name, memory: {},
    controller: { my, owner: my ? { username: 'colony' } : null,
      level: my ? 5 : 0, pos: pos(10, 10) },
    energyCapacityAvailable: 1800, sources: [], structures: [], sites: [], spawns: [],
    find(kind, options) {
      const values = { structures: this.structures, sites: this.sites,
        sources: this.sources, spawns: this.spawns }[kind] || [];
      return options?.filter ? values.filter(options.filter) : values;
    },
    getTerrain: () => ({ get: (x, y) => y === 20 && [20, 21].includes(x) ? 0 : 1 }),
    lookForAt(kind, x, y) {
      return (kind === 'structures' ? this.structures : this.sites)
        .filter(value => value.pos.x === x && value.pos.y === y);
    },
    createConstructionSite(x, y, structureType) {
      calls.push({ room: name, x, y, structureType });
      if (this.rejectSite) return -7;
      this.sites.push({ id: 'new-site', structureType, pos: pos(x, y) });
      return 0;
    }
  });
  const home = room('W7N4', true);
  const target = room('W8N4');
  target.sources = [{ pos: pos(30, 30) }, { pos: pos(35, 35) }];
  home.memory.leftSurvey = { targetRoom: target.name };
  home.memory.unrelated = { preserved: true };
  const Game = { time: 100, gcl: { level: 1 },
    rooms: { [home.name]: home, [target.name]: target },
    spawns: { Spawn1: { name: 'Spawn1', room: home } },
    map: { findRoute: () => [{}] } };
  const planner = createExpansionPlanner({ Game,
    getRoomSources: r => r.sources,
    getRoomSituation: () => ({ policy: { permissions, health: 'healthy' } }),
    FIND_STRUCTURES: 'structures', FIND_MY_SPAWNS: 'spawns',
    FIND_MY_CONSTRUCTION_SITES: 'sites', FIND_SOURCES: 'sources',
    STRUCTURE_CONTAINER: 'container', STRUCTURE_ROAD: 'road', STRUCTURE_SPAWN: 'spawn',
    TERRAIN_MASK_WALL: 1, LOOK_STRUCTURES: 'structures', LOOK_CONSTRUCTION_SITES: 'sites',
    BODYPART_COST: { claim: 600, move: 50 }, CLAIM: 'claim', MOVE: 'move', OK: 0 });
  const update = () => { Game.time++; return planner.updateExpansionPlan(); };
  const requestWorker = () => planBootstrapSpawn({ room: home, workers: [], Game,
    permitted: permissions.expansionMaintenance, hasSpawn: r => r.spawns.length > 0 });
  return { Game, home, target, permissions, calls, planner, update, requestWorker, room, pos };
};

{
  const f = setup();
  const plan = f.update();
  assert.strictEqual(plan.status, 'waiting-gcl');
  assert.strictEqual(plan.ownedRooms, 1);
  assert.strictEqual(plan.canClaim, false);
  f.Game.gcl.level = 2;
  f.permissions.expansion = false;
  assert.strictEqual(f.update(), plan, 'existing plan must retain its identity');
  assert.strictEqual(plan.status, 'waiting-home-policy');
  f.permissions.expansion = true;
  f.home.energyCapacityAvailable = 649;
  assert.strictEqual(f.update().status, 'waiting-energy-capacity');
  f.home.energyCapacityAvailable = 650;
  assert.strictEqual(f.update().status, 'claim-ready', 'exact CLAIM + MOVE capacity is sufficient');
  assert.strictEqual(f.calls.length, 0, 'an unowned target must never receive a spawn site');

  f.target.controller.my = true;
  f.target.controller.owner = { username: 'colony' };
  f.target.controller.level = 1;
  // Claim capacity is exhausted by this room, but maintenance must continue.
  f.permissions.expansion = false;
  assert.strictEqual(f.update().status, 'bootstrap');
  assert.strictEqual(plan.canClaim, false);
  assert.strictEqual(plan.ownedRooms, 2);
  assert.strictEqual(f.calls.length, 1);
  assert.deepStrictEqual(f.calls[0], { room: 'W8N4', x: 20, y: 20, structureType: 'spawn' });
  assert.ok(f.requestWorker(), 'maintenance permission sustains a claimed room independently of growth');
  f.target.controller.level = 2;
  f.update();
  assert.strictEqual(plan.spawnSiteId, 'new-site');
  assert.strictEqual(f.calls.length, 1, 'RCL transition must reuse the existing spawn site');
  f.permissions.expansionMaintenance = false;
  assert.strictEqual(f.update().status, 'bootstrap-paused');
  assert.strictEqual(f.requestWorker(), null);
  assert.strictEqual(f.target.sites.length, 1, 'pause must preserve existing construction');
  f.permissions.expansionMaintenance = true;
  assert.strictEqual(f.update().status, 'bootstrap');
  assert.strictEqual(f.calls.length, 1, 'resume must not create a duplicate site');

  const spawn = { id: 'spawn2', name: 'Spawn2', room: f.target };
  f.target.sites = [];
  f.target.spawns = [spawn];
  f.Game.spawns.Spawn2 = spawn;
  f.permissions.expansionMaintenance = false;
  assert.strictEqual(f.update().status, 'established', 'completed infrastructure outranks a maintenance pause');
  assert.strictEqual(plan.spawnId, spawn.id);
  f.permissions.expansionMaintenance = true;
  assert.strictEqual(f.requestWorker(), null, 'a completed spawn ends pioneer staffing');
  f.update();
  assert.strictEqual(f.calls.length, 1, 'multiple owned spawns must not restart site creation');
  assert.strictEqual(f.home.memory.expansionPlan, plan);
  assert.deepStrictEqual(f.home.memory.unrelated, { preserved: true });
}

{
  const f = setup();
  f.target.controller.my = true;
  f.home.memory.expansionPlan = { targetRoom: f.target.name, selected: 50 };
  f.permissions.expansionMaintenance = false;
  assert.strictEqual(f.update().status, 'bootstrap-paused');
  assert.strictEqual(f.calls.length, 0, 'paused maintenance must not place a missing site');
  f.permissions.expansionMaintenance = true;
  f.target.rejectSite = true;
  f.update();
  assert.strictEqual(f.calls.length, 2, 'failed placement must exhaust only the legal candidates');
  assert.strictEqual(f.target.sites.length, 0);
  assert.strictEqual(f.home.memory.expansionPlan.spawnX, undefined, 'failure must not be recorded as a placement');
  f.target.rejectSite = false;
  f.update();
  assert.strictEqual(f.target.sites.length, 1, 'a later successful pass can recover failed placement');
  f.update();
  assert.strictEqual(f.calls.length, 3, 'successful placement is observed before another attempt');
}

{
  const f = setup();
  const plan = f.update();
  delete f.Game.rooms[f.target.name];
  assert.strictEqual(f.update(), plan, 'loss of vision preserves the selected target');
  assert.strictEqual(f.calls.length, 0);
  f.Game.spawns = {};
  assert.strictEqual(f.update(), null, 'zero spawns must be safe during recovery');
  assert.strictEqual(f.home.memory.expansionPlan, plan);
}

{
  const f = setup();
  const other = f.room('W7N3');
  other.sources = [{}, {}, {}];
  f.Game.rooms[other.name] = other;
  f.home.memory.southSurvey = { targetRoom: other.name };
  assert.strictEqual(f.planner.selectExpansionTarget(f.home).room, other);
  other.controller.owner = { username: 'someone-else' };
  assert.strictEqual(f.planner.selectExpansionTarget(f.home).room, f.target,
    'higher scoring owned rooms are ineligible for selection');
  f.target.controller.owner = { username: 'someone-else' };
  assert.strictEqual(f.update(), null, 'no eligible visible target means no new plan');
  assert.strictEqual(f.home.memory.expansionPlan, undefined);
}

console.log('expansion lifecycle preserves policy gates, unique construction and established-spawn handoff');
