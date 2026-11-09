'use strict';

const assert = require('assert');
const fs = require('fs');
const { createDirectivesCommand } = require('./operator.directives');
const { CANCEL_DEFINITION, createCancelCommand, directiveIdValid,
  spawnEvidence } = require('./operator.cancel');

const room = (name, policyTick, spawnTick) => ({ name, memory: {
  populationPolicy: { updated: policyTick, health: 'healthy', mode: 'steady' },
  spawnDecision: { updated: spawnTick, phase: 'manual-defense',
    reason: 'authorized' }
} });
const base = () => {
  const target = { id: 'def-190-1', kind: 'defense', homeRoom: 'W7N4',
    targetRoom: 'W8N3', reason: 'cancel me', requestedCount: 1,
    createdTick: 190, expiresTick: 300, decision: {
      updated: 199, authorized: true, phase: 'manual-defense',
      reason: 'authorized', admittedCount: 1, existingCoverage: 0,
      expectedSpawn: 'Spawn1' } };
  const unrelated = { id: 'def-180-2', kind: 'defense', homeRoom: 'W8N4',
    targetRoom: 'W8N3', reason: 'leave me', requestedCount: 1,
    createdTick: 180, expiresTick: 280, decision: {
      updated: 195, authorized: false, phase: 'local-minimum',
      reason: 'source precedes manual defense', admittedCount: 0,
      existingCoverage: 0 } };
  const Game = { time: 200, rooms: {
    W7N4: room('W7N4', 198, 197), W8N4: room('W8N4', 200, 200)
  }, creeps: {
    Guard1: { name: 'Guard1', spawning: true,
      room: { name: 'W7N4' }, memory: { role: 'defender', home: 'W7N4',
        defenseTargetRoom: 'W8N3', manualDirectiveId: 'def-190-1' } }
  }, spawns: {
    Spawn1: { name: 'Spawn1', room: { name: 'W7N4' }, spawning: {
      name: 'Guard1', remainingTime: 12 } }
  } };
  const Memory = { operatorDirectives: { version: 1, nextId: 3,
    defense: { target, unrelated } } };
  const listDirectives = createDirectivesCommand({ Game, Memory });
  const cancel = createCancelCommand({ Game, Memory, listDirectives });
  return { Game, Memory, target, unrelated, listDirectives, cancel };
};

assert.strictEqual(CANCEL_DEFINITION.mode, 'bounded-write');
assert.strictEqual(CANCEL_DEFINITION.expires, 1);
assert.strictEqual(directiveIdValid('def-1-1'), true);
assert.strictEqual(directiveIdValid('*'), false);
assert.strictEqual(directiveIdValid(''), false);

{
  const { Game, Memory, target, unrelated, cancel } = base();
  const unrelatedBefore = JSON.stringify(unrelated);
  const roomsBefore = JSON.stringify(Game.rooms);
  const result = cancel('def-190-1');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.idempotent, false);
  assert.deepStrictEqual(result.directive, {
    id: 'def-190-1', type: 'defense', home: 'W7N4', target: 'W8N3',
    reason: 'cancel me', priorStatus: 'active', status: 'cancelled',
    cancellationTick: 200, createdTick: 190, expirationTick: 300
  });
  assert.strictEqual(target.cancelledTick, 200);
  assert.strictEqual(target.cancellationPriorStatus, 'active');
  assert.strictEqual(target.cancelCommand, 'ops.cancel("def-190-1")');
  assert.strictEqual(result.admittedSpawn.started, true);
  assert.strictEqual(result.admittedSpawn.evidence,
    'live creep memory retains this directive ID');
  assert.deepStrictEqual(result.admittedSpawn.activeSpawns, [{
    spawn: 'Spawn1', creep: 'Guard1', remainingTime: 12
  }]);
  assert.strictEqual(result.remainingImpact.futurePlanAuthorityStopped, true);
  assert.strictEqual(result.remainingImpact.inProgressSpawnMustFinish, true);
  assert.deepStrictEqual(result.remainingImpact.liveCreepsMustFinishOrReassign,
    []);
  assert.match(result.remainingImpact.safeResolution, /spawn continues/);
  assert.deepStrictEqual(result.activeDirectives, [{
    id: 'def-180-2', type: 'defense', home: 'W8N4', target: 'W8N3',
    status: 'rejected', changesFinalizedPlan: false
  }]);
  assert.strictEqual(result.roomPlan.home, 'W7N4');
  assert.strictEqual(result.roomPlan.visible, true);
  assert.strictEqual(result.roomPlan.health, 'healthy');
  assert.strictEqual(result.roomPlan.populationPolicy.freshness,
    'stale by 2 ticks');
  assert.strictEqual(result.roomPlan.spawnDecision.freshness,
    'stale by 3 ticks');
  assert.strictEqual(result.commands.inspect,
    'ops.directives("def-190-1")');
  assert.strictEqual(JSON.stringify(unrelated), unrelatedBefore,
    'cancelling one directive preserves every unrelated directive');
  assert.strictEqual(JSON.stringify(Game.rooms), roomsBefore,
    'cancellation does not erase or rewrite room policy');
  assert.strictEqual(Game.creeps.Guard1.memory.role, 'defender');
  assert.strictEqual(Game.spawns.Spawn1.spawning.name, 'Guard1');

  Game.time = 201;
  const memoryBeforeRepeat = JSON.stringify(Memory);
  const repeated = cancel('def-190-1');
  assert.strictEqual(repeated.ok, true);
  assert.strictEqual(repeated.idempotent, true);
  assert.strictEqual(repeated.directive.cancellationTick, 200);
  assert.strictEqual(repeated.directive.priorStatus, 'active');
  assert.strictEqual(JSON.stringify(Memory), memoryBeforeRepeat,
    'repeated cancellation does not mutate the named or unrelated state');
}

{
  const { Game, Memory, cancel } = base();
  const before = JSON.stringify(Memory);
  assert.strictEqual(cancel().ok, false);
  assert.strictEqual(cancel('*').ok, false);
  assert.strictEqual(cancel('missing').ok, false);
  assert.strictEqual(cancel('one', 'two').ok, false);
  assert.strictEqual(JSON.stringify(Memory), before,
    'invalid, wildcard and missing cancellation attempts are nonmutating');

  Memory.operatorDirectives.other = {
    duplicate: { id: 'def-190-1', kind: 'other', createdTick: 190,
      expiresTick: 300 }
  };
  const ambiguousBefore = JSON.stringify(Memory);
  assert.match(createCancelCommand({ Game, Memory,
    listDirectives: createDirectivesCommand({ Game, Memory }) })('def-190-1')
    .error, /Ambiguous/);
  assert.strictEqual(JSON.stringify(Memory), ambiguousBefore,
    'ambiguous stable IDs cannot cancel either record');
}

{
  const Game = { time: 300, rooms: { W8N4: room('W8N4', 250, 240) },
    creeps: {}, spawns: {} };
  const expired = { id: 'def-expired', kind: 'defense', homeRoom: 'W8N4',
    targetRoom: 'W8N3', reason: 'expired request', requestedCount: 1,
    createdTick: 100, expiresTick: 200, decision: {
      updated: 150, authorized: true, phase: 'covered',
      admittedCount: 1, expectedSpawn: 'Spawn2' } };
  const Memory = { operatorDirectives: { defense: { expired } } };
  const listDirectives = createDirectivesCommand({ Game, Memory });
  const result = createCancelCommand({ Game, Memory, listDirectives })(
    'def-expired');
  assert.strictEqual(result.directive.priorStatus, 'expired');
  assert.strictEqual(result.directive.status, 'cancelled');
  assert.strictEqual(result.admittedSpawn.started, null,
    'a historical admission without a live tagged creep remains unknown');
  assert.strictEqual(result.roomPlan.home, 'W8N4',
    'the exact directive home remains authoritative with multiple-room data');
  assert.strictEqual(result.remainingImpact.inProgressSpawnMustFinish, false);
}

{
  const Game = { time: 50, creeps: {}, spawns: {} };
  const directive = { decision: { authorized: false, admittedCount: 0 } };
  assert.strictEqual(spawnEvidence(Game, 'def-none', directive).started, false);
}

{
  const main = fs.readFileSync(require.resolve('./main'), 'utf8');
  const source = fs.readFileSync(require.resolve('./operator.cancel'), 'utf8');
  assert(main.includes('definition: CANCEL_DEFINITION'));
  assert(main.includes('listDirectives: directivesCommand'));
  assert(!source.includes('.suicide('));
  assert(!source.includes('.cancelSpawn('));
  assert(!source.includes('delete directive'));
}

console.log('operator directive cancellation is exact and repeat-safe');
