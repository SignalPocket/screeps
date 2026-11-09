'use strict';

const { retainedDirectives } = typeof Game === 'undefined'
  ? require('./operator.directives') : require('operator.directives');

const CANCEL_DEFINITION = Object.freeze({
  name: 'cancel',
  signature: 'ops.cancel(directiveId)',
  purpose: 'Cancel one exact manual directive without interrupting live creeps.',
  example: "ops.cancel('def-282276-1')",
  mode: 'bounded-write',
  writes: 'named directive cancellation fields only',
  expires: 1,
  related: Object.freeze(['defend', 'directives', 'spawn'])
});

const integer = value => Number.isSafeInteger(value) ? value : null;
const finite = value => Number.isFinite(value) ? value : null;
const errorResult = (tick, message) => ({
  ok: false, tick, freshness: 'current tick', error: message, console: message
});
const directiveIdValid = value => Boolean(typeof value === 'string' &&
  value.trim() && value.length <= 120 && !/[\u0000-\u001f*?]/.test(value));

const matchingCreeps = (Game, directiveId) => Object.values(
  Game && Game.creeps || {}).filter(creep => creep && creep.memory &&
    creep.memory.manualDirectiveId === directiveId).sort((left, right) =>
    left.name.localeCompare(right.name));

const spawnEvidence = (Game, directiveId, directive) => {
  const creeps = matchingCreeps(Game, directiveId);
  const names = new Set(creeps.map(creep => creep.name));
  const spawns = Object.values(Game && Game.spawns || {}).filter(spawn =>
    spawn && spawn.spawning && names.has(spawn.spawning.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const decision = directive && directive.decision;
  const admitted = finite(decision && decision.admittedCount);
  const started = creeps.length > 0 ? true
    : admitted === 0 || decision && decision.authorized === false ? false
      : admitted > 0 ? null : null;
  return {
    started,
    evidence: started === true
      ? 'live creep memory retains this directive ID'
      : started === false
        ? 'saved planner result admitted no creep'
        : 'a saved admission exists but no live creep with this directive ID remains',
    expectedSpawn: decision && decision.expectedSpawn || null,
    creeps: creeps.map(creep => ({ name: creep.name,
      spawning: Boolean(creep.spawning), role: creep.memory.role || null,
      currentRoom: creep.room && creep.room.name || null,
      targetRoom: creep.memory.defenseTargetRoom || null })),
    activeSpawns: spawns.map(spawn => ({ spawn: spawn.name,
      creep: spawn.spawning.name,
      remainingTime: finite(spawn.spawning.remainingTime) }))
  };
};

const createCancelCommand = ({ Game, Memory, listDirectives }) => (...args) => {
  const tick = integer(Game && Game.time);
  if (args.length !== 1 || !directiveIdValid(args[0])) return errorResult(tick,
    'ops.cancel(directiveId) requires one exact directive ID without wildcards');
  if (!Memory || typeof Memory !== 'object') return errorResult(tick,
    'Directive memory is unavailable');
  if (typeof listDirectives !== 'function') return errorResult(tick,
    'Directive inventory is unavailable');
  const directiveId = args[0];
  const matches = retainedDirectives(Memory).filter(entry =>
    (entry.directive.id || `${entry.collection}:${entry.key}`) === directiveId);
  if (matches.length === 0) return errorResult(tick,
    `Unknown operator directive: ${directiveId}`);
  if (matches.length > 1) return errorResult(tick,
    `Ambiguous operator directive ID: ${directiveId}`);
  const entry = matches[0];
  const directive = entry.directive;
  const priorInventory = listDirectives(directiveId);
  if (!priorInventory || !priorInventory.ok ||
      priorInventory.directives.length !== 1) return errorResult(tick,
    `Directive ${directiveId} cannot be inspected safely`);
  const prior = priorInventory.directives[0];
  const idempotent = Number.isSafeInteger(directive.cancelledTick);
  if (!idempotent) {
    directive.cancelledTick = tick;
    directive.cancellationPriorStatus = prior.status;
    directive.cancelCommand = `ops.cancel(${JSON.stringify(directiveId)})`;
  }
  const afterInventory = listDirectives(directiveId);
  const after = afterInventory && afterInventory.ok &&
    afterInventory.directives[0];
  if (!after) return errorResult(tick,
    `Directive ${directiveId} cancellation could not be read back`);
  const live = spawnEvidence(Game, directiveId, directive);
  const all = listDirectives();
  const active = all && all.ok ? all.directives.filter(row =>
    row.activeAuthority).map(row => ({ id: row.id, type: row.type,
    home: row.home, target: row.target, status: row.status,
    changesFinalizedPlan: row.changesFinalizedPlan })) : null;
  const home = directive.homeRoom && Game && Game.rooms &&
    Game.rooms[directive.homeRoom];
  const plan = home && home.memory && home.memory.populationPolicy;
  const spawnDecision = home && home.memory && home.memory.spawnDecision;
  const result = {
    ok: true, tick, freshness: 'current tick with per-source observation ages',
    idempotent,
    directive: {
      id: after.id, type: after.type, home: after.home,
      target: after.target, reason: after.reason,
      priorStatus: directive.cancellationPriorStatus || prior.status,
      status: after.status, cancellationTick: directive.cancelledTick,
      createdTick: after.createdTick, expirationTick: after.expirationTick
    },
    admittedSpawn: live,
    remainingImpact: {
      futurePlanAuthorityStopped: true,
      inProgressSpawnMustFinish: live.activeSpawns.length > 0,
      liveCreepsMustFinishOrReassign: live.creeps.filter(creep =>
        !creep.spawning).map(creep => creep.name),
      safeResolution: live.activeSpawns.length > 0
        ? 'The spawn continues; the resulting creep is handled by normal assignment and retirement policy.'
        : live.creeps.length > 0
          ? 'Living creeps are not killed; normal assignment and retirement policy handles them.'
          : 'No live creep action remains; only future directive authority was removed.'
    },
    activeDirectives: active,
    roomPlan: {
      home: directive.homeRoom || null,
      visible: directive.homeRoom ? Boolean(home) : null,
      populationPolicy: after.observations.roomPlan,
      spawnDecision: after.observations.spawnDecision,
      health: plan && plan.health || null,
      mode: plan && plan.mode || null,
      lastSpawnPhase: spawnDecision && spawnDecision.phase || null,
      lastSpawnReason: spawnDecision && spawnDecision.reason || null
    },
    commands: { inspect: `ops.directives(${JSON.stringify(directiveId)})` },
    limits: {
      exactOnly: 'Wildcards and cancel-all are not supported.',
      liveActions: 'Cancellation never kills a creep or cancels an in-progress spawn.',
      history: 'The named directive remains in bounded audit history.'
    }
  };
  result.console = `${directiveId} ${idempotent ? 'already ' : ''}cancelled ` +
    `at ${directive.cancelledTick} | prior ${result.directive.priorStatus} -> ` +
    `${after.status} | spawn started ${live.started == null ? 'unknown'
      : live.started ? 'yes' : 'no'} | ${result.remainingImpact.safeResolution}\n` +
    `${active == null ? '?' : active.length} active directives remain | ` +
    `${result.commands.inspect}`;
  return result;
};

module.exports = { CANCEL_DEFINITION, createCancelCommand, directiveIdValid,
  spawnEvidence };
