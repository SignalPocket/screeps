'use strict';

const DEFAULT_DURATION = 300;
const MAX_DURATION = 1500;
const MAX_COUNT = 3;
const MAX_REASON_LENGTH = 80;
const MANUAL_DEFENSE_BLOCKING_JOBS = new Set([
  'defender', 'source', 'upgrader', 'refiller', 'hauler', 'rebalancer',
  'builder', 'repairBuilder', 'tunnelBuilder'
]);

const DEFEND_DEFINITION = Object.freeze({
  name: 'defend',
  signature: 'ops.defend(homeRoom, options)',
  purpose: 'Request bounded expiring defender coverage through spawn policy.',
  example: "ops.defend('W7N4', { target: 'W8N3', count: 1, expires: 300, reason: 'manual emergency' })",
  mode: 'bounded-write',
  writes: 'Memory.operatorDirectives.defense',
  expires: MAX_DURATION,
  related: Object.freeze(['cancel', 'creep', 'directives', 'room', 'spawn'])
});

const integer = value => Number.isSafeInteger(value) ? value : null;
const finite = value => Number.isFinite(value) ? value : null;
const roomNameValid = roomName => typeof roomName === 'string' &&
  /^[WE]\d+[NS]\d+$/.test(roomName);
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
const partType = part => typeof part === 'string' ? part : part && part.type;
const bodyCost = (body, costs) => Array.isArray(body)
  ? body.reduce((total, part) => total + (costs[partType(part)] || 0), 0)
  : null;
const bodyCounts = body => Array.isArray(body)
  ? body.reduce((counts, part) => {
    const type = partType(part);
    if (type) counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {}) : null;
const sizeTier = body => !Array.isArray(body) ? null
  : body.length <= 5 ? 'small' : body.length <= 15 ? 'standard'
    : body.length <= 30 ? 'large' : 'maximum';

const directiveStore = Memory => Memory && Memory.operatorDirectives &&
  Memory.operatorDirectives.defense &&
  typeof Memory.operatorDirectives.defense === 'object'
  ? Memory.operatorDirectives.defense : {};
const activeDirective = (directive, tick) => Boolean(directive &&
  directive.kind === 'defense' && directive.cancelledTick == null &&
  Number.isSafeInteger(directive.expiresTick) && directive.expiresTick > tick);
const activeDefenseDirectives = (Memory, tick, homeRoom = null,
  targetRoom = null) => Object.values(directiveStore(Memory))
  .filter(directive => activeDirective(directive, tick) &&
    (!homeRoom || directive.homeRoom === homeRoom) &&
    (!targetRoom || directive.targetRoom === targetRoom))
  .sort((left, right) => left.createdTick - right.createdTick ||
    left.id.localeCompare(right.id));
const defenderCoverage = (workers, homeRoom, targetRoom) => (workers || [])
  .filter(creep => creep && creep.memory &&
    creep.memory.home === homeRoom && creep.memory.role === 'defender' &&
    !creep.memory.staffingRetire &&
    (creep.memory.defenseTargetRoom || homeRoom) === targetRoom).length;

const threatSnapshot = ({ Game, Memory, targetRoom, findHostileCreeps,
  findHostileStructures }) => {
  const room = Game && Game.rooms && Game.rooms[targetRoom];
  const remembered = room && room.memory && room.memory.combatStatus ||
    Memory && Memory.rooms && Memory.rooms[targetRoom] &&
      Memory.rooms[targetRoom].combatStatus;
  if (!room) return {
    visible: false, hostileCreeps: null, hostileStructures: null,
    fighting: remembered ? Boolean(remembered.fighting) : null,
    requiredDefenders: remembered && finite(remembered.requiredDefenders),
    observation: observation(remembered && remembered.updated,
      integer(Game && Game.time))
  };
  const creeps = findHostileCreeps == null || typeof room.find !== 'function'
    ? null : room.find(findHostileCreeps);
  const structures = findHostileStructures == null ||
    typeof room.find !== 'function' ? null : room.find(findHostileStructures);
  return {
    visible: true,
    hostileCreeps: Array.isArray(creeps) ? creeps.length : null,
    hostileStructures: Array.isArray(structures) ? structures.length : null,
    fighting: remembered ? Boolean(remembered.fighting) : null,
    requiredDefenders: remembered && finite(remembered.requiredDefenders),
    observation: observation(remembered && remembered.updated,
      integer(Game && Game.time))
  };
};

const ensureDirectiveStore = Memory => {
  if (!Memory.operatorDirectives ||
      typeof Memory.operatorDirectives !== 'object') {
    Memory.operatorDirectives = {};
  }
  if (!Memory.operatorDirectives.defense ||
      typeof Memory.operatorDirectives.defense !== 'object') {
    Memory.operatorDirectives.defense = {};
  }
  if (!Number.isSafeInteger(Memory.operatorDirectives.nextId) ||
      Memory.operatorDirectives.nextId < 1) {
    Memory.operatorDirectives.nextId = 1;
  }
  Memory.operatorDirectives.version = 1;
  return Memory.operatorDirectives;
};

const bodyPlan = ({ room, buildBody, getBodyType, bodyPartCost }) => {
  const capacity = finite(room && room.energyCapacityAvailable);
  const available = finite(room && room.energyAvailable);
  const budget = capacity == null ? null : Math.min(capacity, 700);
  const body = typeof buildBody === 'function' && budget != null
    ? buildBody('defender', budget, {}) : null;
  const cost = bodyCost(body, bodyPartCost || {});
  return {
    task: 'defend',
    archetype: typeof getBodyType === 'function'
      ? getBodyType({ role: 'defender' }) : 'defender',
    sizeTier: sizeTier(body), bodyLength: body && body.length || null,
    body: bodyCounts(body), cost, budget, available, capacity,
    affordableNow: cost == null || available == null ? null : available >= cost
  };
};

const formatDirectiveResult = ({ directive, Game, Memory, room, workers,
  buildBody,
  getBodyType, bodyPartCost, findHostileCreeps, findHostileStructures,
  idempotent }) => {
  const tick = integer(Game && Game.time);
  const coverage = defenderCoverage(workers, directive.homeRoom,
    directive.targetRoom);
  const decision = directive.decision || null;
  const selected = bodyPlan({ room, buildBody, getBodyType, bodyPartCost });
  const threat = threatSnapshot({ Game, Memory,
    targetRoom: directive.targetRoom,
    findHostileCreeps, findHostileStructures });
  const result = {
    ok: true, tick, freshness: 'current tick with per-source observation ages',
    idempotent: Boolean(idempotent),
    directive: {
      id: directive.id, kind: directive.kind,
      homeRoom: directive.homeRoom, targetRoom: directive.targetRoom,
      reason: directive.reason, createdTick: directive.createdTick,
      expirationTick: directive.expiresTick,
      remainingTicks: Math.max(0, directive.expiresTick - tick),
      requestedCount: directive.requestedCount,
      admittedCount: decision && finite(decision.admittedCount),
      existingCoverage: coverage,
      selectedTask: selected.task, bodyArchetype: selected.archetype,
      sizeTier: selected.sizeTier, bodyLength: selected.bodyLength,
      body: selected.body, cost: selected.cost,
      expectedSpawn: decision && decision.expectedSpawn ||
        Object.values(Game && Game.spawns || {}).filter(spawn => spawn &&
          spawn.room && spawn.room.name === directive.homeRoom)
          .sort((a, b) => a.name.localeCompare(b.name))[0]?.name || null
    },
    threat,
    policy: {
      phase: decision && decision.phase || 'manual-directive-pending-plan',
      admitted: decision && typeof decision.authorized === 'boolean'
        ? decision.authorized : null,
      reason: decision && decision.reason ||
        'awaiting finalized room spawn plan',
      observation: observation(decision && decision.updated, tick),
      roomPlan: observation(room && room.memory &&
        room.memory.populationPolicy && room.memory.populationPolicy.updated,
      tick)
    },
    affordability: {
      available: selected.available, capacity: selected.capacity,
      bodyBudget: selected.budget, selectedCost: selected.cost,
      affordableNow: selected.affordableNow
    },
    commands: {
      inspect: `ops.directives('${directive.id}')`,
      cancel: `ops.cancel('${directive.id}')`
    },
    limits: { maximumCount: MAX_COUNT, maximumDuration: MAX_DURATION }
  };
  result.console = `${directive.id} ${directive.homeRoom} -> ` +
    `${directive.targetRoom} | requested ${directive.requestedCount}, ` +
    `existing ${coverage}, admitted ${result.directive.admittedCount == null
      ? '?' : result.directive.admittedCount} | ${result.policy.phase}: ` +
    `${result.policy.reason} | ${selected.archetype || '?'} ` +
    `${selected.sizeTier || '?'} ${selected.cost == null ? '?' : selected.cost}` +
    ` energy | expires ${directive.expiresTick}\n` +
    `${result.commands.inspect} | ${result.commands.cancel}`;
  return result;
};

const createDefendCommand = ({ Game, Memory, buildBody, getBodyType,
  bodyPartCost = {}, findHostileCreeps, findHostileStructures }) =>
  (...args) => {
    const tick = integer(Game && Game.time);
    if (args.length < 1 || args.length > 2 ||
        typeof args[0] !== 'string') {
      return errorResult(tick,
        'ops.defend(homeRoom, options) requires a home room and one options object');
    }
    const homeRoom = args[0];
    if (!roomNameValid(homeRoom)) return errorResult(tick,
      `Invalid Screeps room name: ${homeRoom}`);
    const options = args.length === 1 ? {} : args[1];
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      return errorResult(tick, 'ops.defend options must be an object');
    }
    const unknown = Object.keys(options).filter(key =>
      !['target', 'count', 'expires', 'reason'].includes(key));
    if (unknown.length) return errorResult(tick,
      `Unknown ops.defend option: ${unknown.sort()[0]}`);
    const targetRoom = options.target == null ? homeRoom : options.target;
    if (!roomNameValid(targetRoom)) return errorResult(tick,
      `Invalid Screeps target room name: ${String(targetRoom)}`);
    const requestedCount = options.count == null ? 1 : options.count;
    if (!Number.isSafeInteger(requestedCount) || requestedCount < 1 ||
        requestedCount > MAX_COUNT) return errorResult(tick,
      `Defender count must be an integer from 1 to ${MAX_COUNT}`);
    const duration = options.expires == null ? DEFAULT_DURATION : options.expires;
    if (!Number.isSafeInteger(duration) || duration < 1 ||
        duration > MAX_DURATION) return errorResult(tick,
      `Defender duration must be an integer from 1 to ${MAX_DURATION} ticks`);
    const reason = options.reason == null ? 'manual emergency' : options.reason;
    if (typeof reason !== 'string' || !reason.trim() ||
        reason.length > MAX_REASON_LENGTH || /[\u0000-\u001f]/.test(reason)) {
      return errorResult(tick,
        `Defender reason must be 1-${MAX_REASON_LENGTH} printable characters`);
    }
    const room = Game && Game.rooms && Game.rooms[homeRoom];
    if (!room) return errorResult(tick,
      `Home room ${homeRoom} is not currently visible`);
    if (!room.controller || !room.controller.my) return errorResult(tick,
      `Home room ${homeRoom} is not owned`);
    if (!Memory || typeof Memory !== 'object') return errorResult(tick,
      'Directive memory is unavailable');
    const workers = Object.values(Game.creeps || {}).filter(creep => creep &&
      creep.memory && creep.memory.home === homeRoom);
    const existing = activeDefenseDirectives(Memory, tick, homeRoom,
      targetRoom).find(directive => directive.reason === reason.trim());
    if (existing) return formatDirectiveResult({ directive: existing, Game,
      Memory,
      room, workers, buildBody, getBodyType, bodyPartCost,
      findHostileCreeps, findHostileStructures, idempotent: true });

    const root = ensureDirectiveStore(Memory);
    const sequence = root.nextId++;
    const id = `def-${tick}-${sequence}`;
    const directive = {
      id, kind: 'defense', version: 1, homeRoom, targetRoom,
      reason: reason.trim(), requestedCount,
      createdTick: tick, expiresTick: tick + duration,
      creatorCommand: `ops.defend(${JSON.stringify(homeRoom)}, { target: ` +
        `${JSON.stringify(targetRoom)}, count: ${requestedCount}, expires: ` +
        `${duration}, reason: ${JSON.stringify(reason.trim())} })`
    };
    root.defense[id] = directive;
    return formatDirectiveResult({ directive, Game, Memory, room, workers,
      buildBody,
      getBodyType, bodyPartCost, findHostileCreeps, findHostileStructures,
      idempotent: false });
  };

const setDecision = (directive, decision, tick) => {
  directive.decision = { updated: tick, ...decision };
  return directive.decision;
};

const planManualDefense = ({ Memory, room, workers, staffingPlan, tick }) => {
  const directives = activeDefenseDirectives(Memory, tick, room.name);
  for (const directive of directives) {
    const existingCoverage = defenderCoverage(workers, room.name,
      directive.targetRoom);
    if (existingCoverage >= directive.requestedCount) {
      setDecision(directive, { authorized: true, phase: 'covered',
        reason: 'requested defender coverage already exists',
        admittedCount: 0, existingCoverage, expectedSpawn: null }, tick);
      continue;
    }
    const gap = staffingPlan && (staffingPlan.baselineGap ||
      staffingPlan.ordinaryMinimumGap);
    const blocksManualDefense = gap && (staffingPlan.baselineGap ||
      MANUAL_DEFENSE_BLOCKING_JOBS.has(gap.role || gap.key));
    if (blocksManualDefense) {
      const phase = staffingPlan.baselineGap ? 'baseline' : 'local-minimum';
      const key = gap.role || gap.key || 'unknown';
      setDecision(directive, { authorized: false, phase,
        reason: `${phase} ${key} precedes manual defense`,
        admittedCount: 0, existingCoverage, expectedSpawn: null }, tick);
      return null;
    }
    setDecision(directive, { authorized: null,
      phase: 'manual-defense-pending-authority',
      reason: 'manual defense reached final spawn authority',
      admittedCount: 0, existingCoverage, expectedSpawn: null }, tick);
    return {
      role: 'defender', forceSpawn: true, manualDefense: true,
      manualDirectiveId: directive.id,
      minimumEnergy: Math.min(room.energyCapacityAvailable || 300, 300),
      staffingCurrent: existingCoverage,
      staffingTarget: directive.requestedCount,
      manualExistingCoverage: existingCoverage,
      manualRequestedCount: directive.requestedCount,
      minimumGap: false,
      healerSupport: existingCoverage % 2 === 1,
      defenseTargetRoom: directive.targetRoom
    };
  }
  return null;
};

const recordManualDefenseAuthority = ({ Memory, assignment, authority,
  spawn, tick }) => {
  if (!assignment || !assignment.manualDefense ||
      !assignment.manualDirectiveId) return null;
  const directive = directiveStore(Memory)[assignment.manualDirectiveId];
  if (!directive || !activeDirective(directive, tick)) return null;
  return setDecision(directive, {
    authorized: Boolean(authority && authority.authorized),
    phase: authority && authority.phase || 'unknown',
    reason: authority && authority.reason || 'spawn authority unavailable',
    admittedCount: authority && authority.authorized ? 1 : 0,
    existingCoverage: assignment.staffingCurrent,
    expectedSpawn: spawn && spawn.name || null
  }, tick);
};

const getManualDefenseRequirement = (Memory, targetRoom, tick) =>
  activeDefenseDirectives(Memory, tick, null, targetRoom)
    .reduce((maximum, directive) => Math.max(maximum,
      directive.requestedCount || 0), 0);

module.exports = {
  DEFEND_DEFINITION, DEFAULT_DURATION, MAX_DURATION, MAX_COUNT,
  createDefendCommand, activeDefenseDirectives, defenderCoverage,
  planManualDefense, recordManualDefenseAuthority,
  getManualDefenseRequirement, roomNameValid, sizeTier
};
