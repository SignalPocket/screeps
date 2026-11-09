'use strict';

const assert = require('assert');
const { DEFEND_DEFINITION, MAX_COUNT, MAX_DURATION, createDefendCommand,
  activeDefenseDirectives, planManualDefense, recordManualDefenseAuthority,
  getManualDefenseRequirement } = require('./operator.defend');

const costs = { tough: 10, attack: 80, move: 50, carry: 50 };
const buildBody = (role, energy) => role === 'defender' && energy >= 390
  ? ['tough', 'attack', 'move', 'move', 'carry', 'carry', 'move', 'move']
  : role === 'defender' && energy >= 140
    ? ['tough', 'attack', 'move'] : null;
const room = (name, owned = true, policyTick = 100) => ({
  name, controller: owned ? { my: true } : { my: false },
  energyAvailable: 550, energyCapacityAvailable: 550,
  memory: { populationPolicy: { updated: policyTick },
    combatStatus: { updated: policyTick, fighting: false,
      requiredDefenders: 0 } },
  find: type => type === 1 ? [{ id: 'hostile' }] : []
});
const spawn = (name, targetRoom) => ({ name, room: { name: targetRoom } });
const creep = (name, home, target, role = 'defender') => ({ name,
  memory: { home, role, defenseTargetRoom: target } });
const environment = () => {
  const Game = { time: 100, rooms: {
    W7N4: room('W7N4'), W8N4: room('W8N4'), W9N9: room('W9N9', false)
  }, creeps: {}, spawns: { Spawn1: spawn('Spawn1', 'W7N4') } };
  const Memory = {};
  const command = createDefendCommand({ Game, Memory, buildBody,
    getBodyType: assignment => assignment.role,
    bodyPartCost: costs, findHostileCreeps: 1, findHostileStructures: 2 });
  return { Game, Memory, command };
};

assert.strictEqual(DEFEND_DEFINITION.mode, 'bounded-write');
assert.strictEqual(DEFEND_DEFINITION.expires, MAX_DURATION);

{
  const { Memory, command } = environment();
  const before = JSON.stringify(Memory);
  assert.strictEqual(command('bad').ok, false);
  assert.strictEqual(command('W7N4', { count: MAX_COUNT + 1 }).ok, false);
  assert.strictEqual(command('W7N4', { expires: MAX_DURATION + 1 }).ok, false);
  assert.strictEqual(command('W7N4', { target: 'W8N3', nope: true }).ok,
    false);
  assert.strictEqual(command('W9N9', { target: 'W8N3' }).ok, false);
  assert.strictEqual(command('W6N6', { target: 'W8N3' }).ok, false);
  assert.strictEqual(JSON.stringify(Memory), before,
    'invalid requests do not create directive memory');
}

{
  const { Game, Memory, command } = environment();
  Memory.rooms = { W8N3: { combatStatus: { updated: 95,
    fighting: true, requiredDefenders: 2 } } };
  const result = command('W7N4', { target: 'W8N3', count: 2,
    expires: 300, reason: 'manual emergency' });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.idempotent, false);
  assert.strictEqual(result.directive.id, 'def-100-1');
  assert.strictEqual(result.directive.expirationTick, 400);
  assert.strictEqual(result.directive.requestedCount, 2);
  assert.strictEqual(result.directive.existingCoverage, 0);
  assert.strictEqual(result.directive.bodyArchetype, 'defender');
  assert.strictEqual(result.directive.sizeTier, 'standard');
  assert.strictEqual(result.directive.cost, 390);
  assert.strictEqual(result.directive.expectedSpawn, 'Spawn1');
  assert.strictEqual(result.threat.visible, false);
  assert.strictEqual(result.threat.hostileCreeps, null);
  assert.strictEqual(result.threat.fighting, true);
  assert.strictEqual(result.threat.requiredDefenders, 2);
  assert.strictEqual(result.threat.observation.freshness, 'stale by 5 ticks');
  assert.strictEqual(result.policy.phase, 'manual-directive-pending-plan');
  assert.strictEqual(result.policy.roomPlan.freshness, 'current tick');
  assert.strictEqual(result.commands.inspect, "ops.directives('def-100-1')");
  assert.strictEqual(result.commands.cancel, "ops.cancel('def-100-1')");
  assert.strictEqual(Object.keys(Memory.operatorDirectives.defense).length, 1);

  Game.time = 101;
  const beforeRepeat = JSON.stringify(Memory.operatorDirectives);
  const repeated = command('W7N4', { target: 'W8N3', count: 2,
    expires: 300, reason: 'manual emergency' });
  assert.strictEqual(repeated.idempotent, true);
  assert.strictEqual(repeated.directive.id, 'def-100-1');
  assert.strictEqual(repeated.directive.expirationTick, 400);
  assert.strictEqual(Memory.operatorDirectives.nextId, 2);
  assert.strictEqual(Object.keys(Memory.operatorDirectives.defense).length, 1);
  assert.strictEqual(JSON.stringify(Memory.operatorDirectives), beforeRepeat,
    'an idempotent repeat does not extend, replace, or mutate the directive');

  Memory.operatorDirectives.defense['def-100-1'].decision = {
    updated: 96, authorized: false, phase: 'local-minimum',
    reason: 'local minimum source precedes manual defense', admittedCount: 0
  };
  const stale = command('W7N4', { target: 'W8N3', reason: 'manual emergency' });
  assert.strictEqual(stale.policy.observation.age, 5);
  assert.strictEqual(stale.policy.observation.freshness, 'stale by 5 ticks');

  Game.time = 400;
  const renewed = command('W7N4', { target: 'W8N3', reason: 'manual emergency' });
  assert.strictEqual(renewed.directive.id, 'def-400-2');
  assert.strictEqual(activeDefenseDirectives(Memory, 400).length, 1);
}

{
  const { Game, Memory, command } = environment();
  Game.creeps.guard = creep('guard', 'W7N4', 'W8N3');
  const result = command('W7N4', { target: 'W8N3' });
  assert.strictEqual(result.directive.existingCoverage, 1);
  assert.strictEqual(result.threat.visible, false);
  assert.strictEqual(command('W8N4', { target: 'W8N3' }).ok, true,
    'the selected owned home remains authoritative with multiple owned rooms');
}

{
  const { Memory, command } = environment();
  command('W7N4', { target: 'W8N3', count: 2 });
  const home = room('W7N4');
  const baseline = { baselineGap: { role: 'source' },
    ordinaryMinimumGap: { role: 'source' } };
  assert.strictEqual(planManualDefense({ Memory, room: home, workers: [],
    staffingPlan: baseline, tick: 100 }), null);
  const directive = Memory.operatorDirectives.defense['def-100-1'];
  assert.strictEqual(directive.decision.phase, 'baseline');
  assert.strictEqual(directive.decision.authorized, false);

  const local = { baselineGap: null,
    ordinaryMinimumGap: { role: 'refiller' } };
  assert.strictEqual(planManualDefense({ Memory, room: home, workers: [],
    staffingPlan: local, tick: 101 }), null);
  assert.strictEqual(directive.decision.phase, 'local-minimum');

  const remote = { baselineGap: null,
    ordinaryMinimumGap: { role: 'remoteMiner' } };
  const assignment = planManualDefense({ Memory, room: home, workers: [],
    staffingPlan: remote, tick: 102 });
  assert.strictEqual(assignment.role, 'defender');
  assert.strictEqual(assignment.manualDefense, true);
  assert.strictEqual(assignment.staffingTarget, 2);
  assert.strictEqual(assignment.defenseTargetRoom, 'W8N3');
  assert.strictEqual(directive.decision.phase,
    'manual-defense-pending-authority');

  recordManualDefenseAuthority({ Memory, assignment,
    authority: { authorized: true, phase: 'manual-defense',
      reason: 'bounded manual defense authorized after local survival minima' },
    spawn: { name: 'Spawn1' }, tick: 102 });
  assert.strictEqual(directive.decision.admittedCount, 1);
  assert.strictEqual(directive.decision.expectedSpawn, 'Spawn1');
  assert.strictEqual(directive.decision.phase, 'manual-defense');

  const coveredWorkers = [creep('guard-a', 'W7N4', 'W8N3'),
    creep('guard-b', 'W7N4', 'W8N3')];
  assert.strictEqual(planManualDefense({ Memory, room: home,
    workers: coveredWorkers, staffingPlan: remote, tick: 103 }), null);
  assert.strictEqual(directive.decision.phase, 'covered');
  assert.strictEqual(directive.decision.existingCoverage, 2);
}

{
  const Memory = { operatorDirectives: { defense: {
    one: { id: 'one', kind: 'defense', homeRoom: 'W7N4',
      targetRoom: 'W8N3', requestedCount: 1, createdTick: 1,
      expiresTick: 200 },
    two: { id: 'two', kind: 'defense', homeRoom: 'W8N4',
      targetRoom: 'W8N3', requestedCount: 3, createdTick: 2,
      expiresTick: 200 },
    expired: { id: 'expired', kind: 'defense', homeRoom: 'W7N4',
      targetRoom: 'W8N3', requestedCount: 3, createdTick: 0,
      expiresTick: 99 }
  } } };
  assert.strictEqual(getManualDefenseRequirement(Memory, 'W8N3', 100), 3);
  assert.strictEqual(getManualDefenseRequirement(Memory, 'W9N9', 100), 0);
}

{
  const fs = require('fs');
  const main = fs.readFileSync(require.resolve('./main'), 'utf8');
  const moduleSource = fs.readFileSync(require.resolve('./operator.defend'),
    'utf8');
  assert(main.includes('definition: DEFEND_DEFINITION'));
  assert(main.includes('planManualDefense({ Memory, room, workers,'));
  assert(main.includes('recordManualDefenseAuthority({ Memory,'));
  assert(main.includes('getManualDefenseRequirement(Memory, targetRoomName'));
  assert(main.indexOf('if (target && needsEmergencyDefender') <
    main.indexOf('const manualDefense = planManualDefense'),
  'observed threats retain precedence over a manual directive');
  assert(!moduleSource.includes('.spawnCreep('),
    'the operator command cannot bypass the spawn planner');
}

console.log('operator.defend bounded directive tests passed');
