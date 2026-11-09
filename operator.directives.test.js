'use strict';

const assert = require('assert');
const fs = require('fs');
const { DIRECTIVES_DEFINITION, DIRECTIVE_HISTORY_TICKS,
  createDirectivesCommand, reconcileDirectiveHistory, directiveStatus } =
  require('./operator.directives');

const room = (name, policyTick, spawnTick) => ({ name, memory: {
  populationPolicy: policyTick == null ? null : { updated: policyTick },
  spawnDecision: spawnTick == null ? null : { updated: spawnTick }
} });
const base = () => {
  const Game = { time: 200, rooms: {
    W7N4: room('W7N4', 200, 199),
    W8N4: room('W8N4', 190, 180)
  } };
  const Memory = { operatorDirectives: { version: 1, nextId: 7,
    defense: {
      active: { id: 'def-190-1', kind: 'defense', homeRoom: 'W7N4',
        targetRoom: 'W8N3', reason: 'active request', requestedCount: 1,
        createdTick: 190, expiresTick: 300,
        creatorCommand: 'ops.defend("W7N4")', decision: {
          updated: 200, authorized: true, phase: 'manual-defense',
          reason: 'authorized', admittedCount: 1, existingCoverage: 0,
          expectedSpawn: 'Spawn1' } },
      covered: { id: 'def-180-2', kind: 'defense', homeRoom: 'W8N4',
        targetRoom: 'W8N3', reason: 'covered request', requestedCount: 2,
        createdTick: 180, expiresTick: 250, decision: {
          updated: 195, authorized: true, phase: 'covered',
          reason: 'requested defender coverage already exists',
          admittedCount: 0, existingCoverage: 2 } },
      rejected: { id: 'def-170-3', kind: 'defense', homeRoom: 'W7N4',
        targetRoom: 'W7N3', reason: 'deferred request', requestedCount: 1,
        createdTick: 170, expiresTick: 230, decision: {
          updated: 198, authorized: false, phase: 'local-minimum',
          reason: 'local-minimum source precedes manual defense',
          admittedCount: 0, existingCoverage: 0 } },
      expired: { id: 'def-100-4', kind: 'defense', homeRoom: 'W7N4',
        targetRoom: 'W9N9', reason: 'old request', requestedCount: 1,
        createdTick: 100, expiresTick: 150 },
      cancelled: { id: 'def-160-5', kind: 'defense', homeRoom: 'W8N4',
        targetRoom: 'W8N3', reason: 'cancelled request', requestedCount: 1,
        createdTick: 160, expiresTick: 260, cancelledTick: 175,
        cancelReason: 'operator cancelled' }
    }
  } };
  return { Game, Memory };
};

assert.strictEqual(DIRECTIVES_DEFINITION.mode, 'read-only');
assert.strictEqual(DIRECTIVES_DEFINITION.writes, 'none');
assert.strictEqual(directiveStatus({ expiresTick: 201 }, 200), 'active');
assert.strictEqual(directiveStatus({ expiresTick: 200 }, 200), 'expired');
assert.strictEqual(directiveStatus({ expiresTick: 300,
  cancelledTick: 199 }, 200), 'cancelled');

{
  const { Game, Memory } = base();
  const command = createDirectivesCommand({ Game, Memory });
  const before = JSON.stringify(Memory);
  const result = command();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.directives.length, 5);
  assert.deepStrictEqual(result.counts, {
    active: 1, completed: 1, rejected: 1, cancelled: 1, expired: 1
  });
  assert.deepStrictEqual(result.directives.map(row => row.id), [
    'def-190-1', 'def-180-2', 'def-170-3', 'def-160-5', 'def-100-4'
  ]);
  const active = result.directives[0];
  assert.strictEqual(active.type, 'defense');
  assert.strictEqual(active.home, 'W7N4');
  assert.strictEqual(active.target, 'W8N3');
  assert.strictEqual(active.creatorCommand, 'ops.defend("W7N4")');
  assert.strictEqual(active.status, 'active');
  assert.strictEqual(active.activeAuthority, true);
  assert.strictEqual(active.changesFinalizedPlan, true);
  assert.strictEqual(active.admittedAction.count, 1);
  assert.strictEqual(active.admittedAction.expectedSpawn, 'Spawn1');
  assert.strictEqual(active.lastResult.reason, 'authorized');
  assert.strictEqual(active.observations.result.freshness, 'current tick');
  assert.strictEqual(active.observations.roomPlan.freshness, 'current tick');
  assert.strictEqual(active.visibility.target, false);
  assert.strictEqual(active.commands.inspect,
    'ops.directives("def-190-1")');
  assert.strictEqual(active.commands.cancel, 'ops.cancel("def-190-1")');

  const covered = result.directives[1];
  assert.strictEqual(covered.status, 'completed');
  assert.strictEqual(covered.changesFinalizedPlan, true,
    'covered active directives retain the requested garrison plan');
  assert.strictEqual(covered.observations.result.freshness,
    'stale by 5 ticks');
  assert.strictEqual(covered.observations.roomPlan.freshness,
    'stale by 10 ticks');
  assert.match(covered.creatorCommand, /^ops\.defend\("W8N4"/,
    'legacy directives receive an explicit reconstructed creator command');

  const rejected = result.directives[2];
  assert.strictEqual(rejected.status, 'rejected');
  assert.strictEqual(rejected.activeAuthority, true);
  assert.strictEqual(rejected.changesFinalizedPlan, false);
  const cancelled = result.directives[3];
  assert.strictEqual(cancelled.status, 'cancelled');
  assert.strictEqual(cancelled.activeAuthority, false);
  const expired = result.directives[4];
  assert.strictEqual(expired.status, 'expired');
  assert.strictEqual(expired.activeAuthority, false);
  assert.strictEqual(JSON.stringify(Memory), before,
    'listing every directive is read-only');

  const deep = command('def-170-3');
  assert.strictEqual(deep.directives.length, 1);
  assert.strictEqual(deep.directiveId, 'def-170-3');
  assert.strictEqual(deep.directives[0].home, 'W7N4',
    'deep inspection preserves the selected owned home with multiple rooms');
  assert.strictEqual(JSON.stringify(Memory), before,
    'deep inspection is read-only');
  assert.strictEqual(command('missing').ok, false);
  assert.strictEqual(command('').ok, false);
  assert.strictEqual(command(5).ok, false);
  assert.strictEqual(command('one', 'two').ok, false);
  assert.strictEqual(JSON.stringify(Memory), before,
    'invalid and missing lookups are read-only');
}

{
  const Game = { time: 50, rooms: {} };
  const Memory = {};
  const result = createDirectivesCommand({ Game, Memory })();
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.directives, []);
  assert.strictEqual(result.console, 'No retained manual operator directives.');
}

{
  const tick = 10000;
  const cutoff = tick - DIRECTIVE_HISTORY_TICKS;
  const Memory = { operatorDirectives: { version: 1, nextId: 5,
    defense: {
      oldExpired: { id: 'old-expired', kind: 'defense', createdTick: 1,
        expiresTick: cutoff },
      retainedExpired: { id: 'retained-expired', kind: 'defense',
        createdTick: 2, expiresTick: cutoff + 1 },
      oldCancelled: { id: 'old-cancelled', kind: 'defense', createdTick: 3,
        expiresTick: tick + 100, cancelledTick: cutoff },
      active: { id: 'active', kind: 'defense', createdTick: 4,
        expiresTick: tick + 100 },
      malformedOld: { id: 'malformed-old', kind: 'defense',
        createdTick: cutoff }
    }
  } };
  const removed = reconcileDirectiveHistory(Memory, tick);
  assert.deepStrictEqual(removed.map(row => row.id), [
    'malformed-old', 'old-cancelled', 'old-expired'
  ]);
  assert.deepStrictEqual(Object.keys(Memory.operatorDirectives.defense).sort(),
    ['active', 'retainedExpired']);
  assert.strictEqual(Memory.operatorDirectives.nextId, 5,
    'history reconciliation preserves directive sequence identity');
}

{
  const main = fs.readFileSync(require.resolve('./main'), 'utf8');
  assert(main.includes('reconcileDirectiveHistory(Memory, Game.time);'));
  assert(main.includes('definition: DIRECTIVES_DEFINITION'));
  assert(main.includes('createDirectivesCommand({ Game, Memory })'));
}

console.log('operator directive inventory is deterministic and read-only');
