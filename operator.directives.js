'use strict';

const DIRECTIVE_HISTORY_TICKS = 5000;

const DIRECTIVES_DEFINITION = Object.freeze({
  name: 'directives',
  signature: 'ops.directives([directiveId])',
  purpose: 'List or inspect retained manual operator directives and authority.',
  example: 'ops.directives()',
  mode: 'read-only',
  writes: 'none',
  expires: null,
  related: Object.freeze(['cancel', 'defend', 'spawn'])
});

const integer = value => Number.isSafeInteger(value) ? value : null;
const finite = value => Number.isFinite(value) ? value : null;
const observation = (updated, tick) => {
  if (!Number.isSafeInteger(updated)) return {
    tick: null, age: null, freshness: 'unknown'
  };
  const age = Number.isSafeInteger(tick) ? Math.max(0, tick - updated) : null;
  return { tick: updated, age, freshness: age === 0 ? 'current tick'
    : age === null ? 'unknown' : `stale by ${age} ticks` };
};
const errorResult = (tick, message) => ({
  ok: false, tick, freshness: 'current tick', error: message, console: message
});

const directiveCollections = Memory => Object.entries(
  Memory && Memory.operatorDirectives || {})
  .filter(([key, value]) => !['version', 'nextId'].includes(key) && value &&
    typeof value === 'object' && !Array.isArray(value))
  .sort(([left], [right]) => left.localeCompare(right));

const retainedDirectives = Memory => directiveCollections(Memory)
  .flatMap(([collection, records]) => Object.entries(records)
    .filter(([, directive]) => directive && typeof directive === 'object')
    .map(([key, directive]) => ({ collection, key, directive })))
  .sort((left, right) => (integer(right.directive.createdTick) || -1) -
    (integer(left.directive.createdTick) || -1) ||
    String(left.directive.id || left.key).localeCompare(
      String(right.directive.id || right.key)));

const isActive = (directive, tick) => Boolean(directive &&
  directive.cancelledTick == null &&
  Number.isSafeInteger(directive.expiresTick) && directive.expiresTick > tick);

const directiveStatus = (directive, tick) => {
  if (Number.isSafeInteger(directive && directive.cancelledTick)) {
    return 'cancelled';
  }
  if (Number.isSafeInteger(directive && directive.expiresTick) &&
      directive.expiresTick <= tick) return 'expired';
  if (!isActive(directive, tick)) return 'unknown';
  const decision = directive.decision;
  if (decision && decision.phase === 'covered') return 'completed';
  if (decision && decision.authorized === false) return 'rejected';
  return 'active';
};

const creatorCommand = directive => directive.creatorCommand ||
  (directive.kind === 'defense' && directive.homeRoom &&
    directive.targetRoom ? `ops.defend(${JSON.stringify(directive.homeRoom)}, ` +
      `{ target: ${JSON.stringify(directive.targetRoom)}, count: ` +
      `${directive.requestedCount || 1}, expires: ` +
      `${Number.isSafeInteger(directive.expiresTick) &&
        Number.isSafeInteger(directive.createdTick)
        ? Math.max(1, directive.expiresTick - directive.createdTick) : '?'}, ` +
      `reason: ${JSON.stringify(directive.reason || 'manual emergency')} })`
    : null);

const directiveRow = ({ collection, key, directive }, Game) => {
  const tick = integer(Game && Game.time);
  const id = directive.id || `${collection}:${key}`;
  const status = directiveStatus(directive, tick);
  const active = isActive(directive, tick);
  const decision = directive.decision || null;
  const home = directive.homeRoom && Game && Game.rooms &&
    Game.rooms[directive.homeRoom];
  const target = directive.targetRoom && Game && Game.rooms &&
    Game.rooms[directive.targetRoom];
  const roomPlan = home && home.memory && home.memory.populationPolicy;
  const spawnDecision = home && home.memory && home.memory.spawnDecision;
  const changesFinalizedPlan = active && (!decision ||
    decision.authorized !== false) && ['active', 'completed'].includes(status);
  return {
    id, type: directive.kind || collection,
    home: directive.homeRoom || null, target: directive.targetRoom || null,
    reason: directive.reason || null,
    creatorCommand: creatorCommand(directive),
    createdTick: integer(directive.createdTick),
    expirationTick: integer(directive.expiresTick),
    remainingTicks: Number.isSafeInteger(directive.expiresTick) && tick != null
      ? Math.max(0, directive.expiresTick - tick) : null,
    cancelledTick: integer(directive.cancelledTick),
    status, activeAuthority: active, changesFinalizedPlan,
    request: {
      count: finite(directive.requestedCount),
      task: directive.kind === 'defense' ? 'defend' : null
    },
    admittedAction: decision ? {
      authorized: typeof decision.authorized === 'boolean'
        ? decision.authorized : null,
      count: finite(decision.admittedCount),
      phase: decision.phase || null,
      expectedSpawn: decision.expectedSpawn || null
    } : null,
    lastResult: decision ? {
      tick: integer(decision.updated), phase: decision.phase || null,
      authorized: typeof decision.authorized === 'boolean'
        ? decision.authorized : null,
      reason: decision.reason || null,
      existingCoverage: finite(decision.existingCoverage),
      admittedCount: finite(decision.admittedCount),
      expectedSpawn: decision.expectedSpawn || null
    } : null,
    observations: {
      directive: observation(directive.createdTick, tick),
      result: observation(decision && decision.updated, tick),
      roomPlan: observation(roomPlan && roomPlan.updated, tick),
      spawnDecision: observation(spawnDecision && spawnDecision.updated, tick)
    },
    visibility: {
      home: directive.homeRoom ? Boolean(home) : null,
      target: directive.targetRoom ? Boolean(target) : null
    },
    commands: {
      inspect: `ops.directives(${JSON.stringify(id)})`,
      cancel: `ops.cancel(${JSON.stringify(id)})`
    },
    unknowns: {
      finalizedPlan: home ? roomPlan ? null : 'population policy unavailable'
        : directive.homeRoom ? 'home room not visible' : 'home room unknown',
      lastResult: decision ? null : 'directive has no saved planner result'
    }
  };
};

const createDirectivesCommand = ({ Game, Memory }) => (...args) => {
  const tick = integer(Game && Game.time);
  if (args.length > 1 || args.length === 1 &&
      (typeof args[0] !== 'string' || !args[0].trim() ||
       args[0].length > 120 || /[\u0000-\u001f]/.test(args[0]))) {
    return errorResult(tick,
      'ops.directives([directiveId]) accepts zero arguments or one directive ID');
  }
  if (!Memory || typeof Memory !== 'object') return errorResult(tick,
    'Directive memory is unavailable');
  const rows = retainedDirectives(Memory).map(entry =>
    directiveRow(entry, Game));
  const selected = args.length === 1
    ? rows.filter(row => row.id === args[0]) : rows;
  if (args.length === 1 && selected.length === 0) return errorResult(tick,
    `Unknown operator directive: ${args[0]}`);
  const counts = selected.reduce((result, row) => {
    result[row.status] = (result[row.status] || 0) + 1;
    return result;
  }, {});
  const result = {
    ok: true, tick,
    freshness: 'current tick with per-source observation ages',
    directiveId: args.length === 1 ? args[0] : null,
    historyTicks: DIRECTIVE_HISTORY_TICKS,
    counts, directives: selected,
    limits: {
      retention: `Expired, cancelled, and malformed inactive directives are retained for at most ${DIRECTIVE_HISTORY_TICKS} ticks.`,
      authority: 'Only unexpired, uncancelled directives can affect planning.'
    }
  };
  result.console = selected.length === 0
    ? 'No retained manual operator directives.'
    : selected.map(row => `${row.id} ${row.type} ${row.status} | ` +
      `${row.home || '?'} -> ${row.target || '?'} | ` +
      `${row.changesFinalizedPlan ? 'changes plan' : 'no plan authority'} | ` +
      `${row.lastResult && row.lastResult.phase || 'result unknown'}: ` +
      `${row.lastResult && row.lastResult.reason || 'no saved result'} | ` +
      `expires ${row.expirationTick == null ? '?' : row.expirationTick}\n` +
      `${row.commands.inspect} | ${row.commands.cancel}`).join('\n');
  return result;
};

const reconcileDirectiveHistory = (Memory, tick,
  historyTicks = DIRECTIVE_HISTORY_TICKS) => {
  if (!Memory || !Memory.operatorDirectives ||
      !Number.isSafeInteger(tick)) return [];
  const removed = [];
  for (const [collection, records] of directiveCollections(Memory)) {
    for (const [key, directive] of Object.entries(records)) {
      if (!directive || typeof directive !== 'object') continue;
      const inactiveTick = Number.isSafeInteger(directive.cancelledTick)
        ? directive.cancelledTick : Number.isSafeInteger(directive.expiresTick)
          ? directive.expiresTick : integer(directive.createdTick);
      if (!Number.isSafeInteger(inactiveTick) ||
          inactiveTick > tick - historyTicks) continue;
      delete records[key];
      removed.push({ collection, id: directive.id || key });
    }
  }
  return removed.sort((left, right) => left.collection.localeCompare(
    right.collection) || left.id.localeCompare(right.id));
};

module.exports = {
  DIRECTIVES_DEFINITION, DIRECTIVE_HISTORY_TICKS,
  createDirectivesCommand, reconcileDirectiveHistory, retainedDirectives,
  directiveStatus, isActive
};
