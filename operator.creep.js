'use strict';

const CREEP_DEFINITION = Object.freeze({
  name: 'creep',
  signature: 'ops.creep(creepName)',
  purpose: 'Explain one creep task, assignment, movement, wait, and lifecycle.',
  example: "ops.creep('01-UP-278053')",
  mode: 'read-only',
  writes: 'none',
  expires: null,
  related: Object.freeze(['colony', 'room', 'spawn', 'work'])
});

const finite = value => Number.isFinite(value) ? value : null;
const integer = value => Number.isSafeInteger(value) ? value : null;
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
const activeBody = body => {
  if (!Array.isArray(body)) return { length: null, active: null, damaged: null };
  const active = {};
  let damaged = 0;
  for (const part of body) {
    if (typeof part !== 'string' && !(part && part.hits > 0)) {
      damaged++;
      continue;
    }
    const type = partType(part);
    if (type) active[type] = (active[type] || 0) + 1;
  }
  return { length: body.length, active, damaged };
};
const sizeTier = body => !Array.isArray(body) ? null
  : body.length <= 5 ? 'small' : body.length <= 15 ? 'standard'
    : body.length <= 30 ? 'large' : 'maximum';
const remoteAssignment = memory => Boolean(memory &&
  (String(memory.role || '').startsWith('remote-') ||
    memory.role === 'builder' && memory.builderScope === 'outpost'));
const targetDescriptor = target => !target ? null : {
  id: target.id || null,
  name: target.name || null,
  type: target.structureType || (target.progressTotal !== undefined
    ? 'constructionSite' : target.resourceType ? 'resource' : null),
  roomName: target.room && target.room.name ||
    target.pos && target.pos.roomName || null,
  position: target.pos ? { x: finite(target.pos.x), y: finite(target.pos.y),
    roomName: target.pos.roomName || target.room && target.room.name || null }
    : null
};
const storeSnapshot = store => {
  if (!store) return { resources: null, used: null, free: null, capacity: null };
  const resources = Object.fromEntries(Object.keys(store)
    .filter(key => Number.isFinite(store[key]) && store[key] !== 0)
    .sort().map(key => [key, store[key]]));
  const capacity = typeof store.getCapacity === 'function'
    ? finite(store.getCapacity()) : null;
  const used = typeof store.getUsedCapacity === 'function'
    ? finite(store.getUsedCapacity())
    : Object.values(resources).reduce((sum, value) => sum + value, 0);
  const free = typeof store.getFreeCapacity === 'function'
    ? finite(store.getFreeCapacity()) : capacity == null || used == null
      ? null : Math.max(0, capacity - used);
  return { resources, used, free, capacity };
};
const fallbackRows = (creep, archetype, canRunLane) => {
  const parts = activeBody(creep.body).active || {};
  const role = creep.memory && creep.memory.role;
  const hasWork = (parts.work || 0) > 0;
  const hasCarry = (parts.carry || 0) > 0;
  const hasMove = (parts.move || 0) > 0;
  const lanes = ['build', 'repair', 'upgrade', 'collect', 'refill',
    'buffer', 'storage', 'supply'];
  return lanes.map(lane => {
    const canonical = typeof canRunLane === 'function'
      ? canRunLane(archetype, lane, role) : null;
    const physical = ['build', 'repair', 'upgrade'].includes(lane)
      ? hasWork && (lane === 'upgrade' || hasCarry) && hasMove
      : hasCarry && hasMove;
    const compatible = canonical == null ? physical : canonical && physical;
    return { lane, compatible,
      reason: compatible ? 'body and canonical archetype permit lane'
        : canonical === false ? 'canonical archetype excludes lane'
          : 'active body lacks required WORK, CARRY, or MOVE' };
  });
};

const createCreepCommand = ({ Game, colonyCommand, inferAssignmentKind,
  getBodyType, getTaskLabel, canBodyTypeRunLane,
  getLocalReplacementLead, getRemoteReplacementLead }) => (...args) => {
  const tick = integer(Game && Game.time);
  if (args.length !== 1 || typeof args[0] !== 'string') return errorResult(
    tick, 'ops.creep(creepName) requires one creep name');
  const creepName = args[0];
  if (!creepName.trim() || creepName.length > 100 || /[\u0000-\u001f]/.test(creepName)) {
    return errorResult(tick, `Invalid Screeps creep name: ${creepName}`);
  }
  if (!Game || !Game.creeps) return errorResult(tick,
    'Live creep data is unavailable');
  const creep = Game.creeps[creepName];
  if (!creep) return errorResult(tick, `Creep ${creepName} is not alive or visible`);

  const memory = creep.memory || {};
  const homeName = memory.home || memory.remoteHome || null;
  const home = homeName && Game.rooms && Game.rooms[homeName] || null;
  const roomMemory = home && home.memory || {};
  const demand = roomMemory.demandPlan || null;
  let colonyRow = null;
  if (typeof colonyCommand === 'function') {
    const colony = colonyCommand();
    if (colony && colony.ok && Array.isArray(colony.rooms)) {
      colonyRow = colony.rooms.find(row => row.roomName === homeName) || null;
    }
  }
  const archetype = memory.bodyType || (typeof getBodyType === 'function'
    ? getBodyType(memory) : null);
  const assignmentKind = typeof inferAssignmentKind === 'function'
    ? inferAssignmentKind(memory) : memory.assignmentKind || null;
  const targetReference = memory.taskTarget || memory.workJob &&
    memory.workJob.targetId || memory.withdrawTarget || memory.refillTarget ||
    memory.buildTarget || memory.repairTarget || null;
  const targetId = typeof targetReference === 'string'
    ? targetReference.split(/[\s@()]/)[0] : null;
  const target = targetId && typeof Game.getObjectById === 'function'
    ? Game.getObjectById(targetId) : null;
  const targetRoom = target && target.room && target.room.name ||
    memory.remoteRoom || memory.expansionTarget || memory.defenseTargetRoom ||
    memory.remoteDispatchRoom || null;
  const leadFunction = remoteAssignment(memory)
    ? getRemoteReplacementLead : getLocalReplacementLead;
  const replacementLead = typeof leadFunction === 'function'
    ? finite(leadFunction(creep)) : null;
  const ttl = finite(creep.ticksToLive);
  const deadline = ttl == null || replacementLead == null || tick == null
    ? null : tick + Math.max(0, ttl - replacementLead);
  const workJob = memory.workJob ? { ...memory.workJob } : null;
  const savedJob = demand && demand.jobs && demand.jobs[creepName]
    ? { ...demand.jobs[creepName] } : null;
  const commitment = memory.dispatchCommitment
    ? { ...memory.dispatchCommitment } : demand && demand.commitments &&
      demand.commitments[creepName] ? { ...demand.commitments[creepName] } : null;
  const pickup = memory.pickupReservation
    ? { ...memory.pickupReservation } : roomMemory.pickupReservations &&
      roomMemory.pickupReservations.jobs &&
      roomMemory.pickupReservations.jobs[creepName]
      ? { ...roomMemory.pickupReservations.jobs[creepName] } : null;
  const wait = memory.waitAge ? { ...memory.waitAge } : memory.waitState ||
      memory.waitReason ? {
        state: memory.waitState || null, reason: memory.waitReason || null,
        target: memory.taskTarget || null, updated: null, age: null
      } : null;
  const retirement = memory.staffingRetire || memory.role === 'retire' ? {
    active: true, retiredRole: memory.retiredRole || null,
    reason: memory.recycleReason || memory.retirementReason ||
      'staffing policy marked this creep for retirement'
  } : { active: false, retiredRole: null, reason: null };
  const fallbacks = fallbackRows(creep, archetype, canBodyTypeRunLane);
  const result = {
    ok: true, tick, creepName,
    freshness: 'current tick with per-source observation ages',
    observations: {
      demandPlan: observation(demand && demand.tick, tick),
      wait: observation(wait && wait.updated, tick),
      route: observation(memory.navCorridor && memory.navCorridor.tick, tick),
      reassignment: observation(memory.reassignment && memory.reassignment.tick,
        tick),
      colonyRoom: colonyRow && colonyRow.observations || null
    },
    identity: {
      role: memory.role || null, birthRole: memory.birthRole || null,
      assignmentRole: memory.assignmentRole || null,
      assignmentKind, archetype, sizeTier: sizeTier(creep.body),
      spawning: Boolean(creep.spawning)
    },
    task: {
      name: memory.task || null,
      label: typeof getTaskLabel === 'function'
        ? getTaskLabel(memory.task, { fallback: memory.task || 'Idle' }) : null,
      demandLane: memory.demandLane || demand && demand.assignments &&
        demand.assignments[creepName] || null,
      targetReference, target: targetDescriptor(target),
      lastKnownTask: memory.lastTask || null,
      lastSuccessfulAction: null
    },
    body: activeBody(creep.body),
    carried: storeSnapshot(creep.store),
    lifecycle: { ticksToLive: ttl, replacementLead,
      replacementDeadline: deadline, retirement },
    location: {
      home: homeName, homeVisible: Boolean(home),
      currentRoom: creep.room && creep.room.name || null,
      position: creep.pos ? { x: finite(creep.pos.x), y: finite(creep.pos.y),
        roomName: creep.pos.roomName || creep.room && creep.room.name || null }
        : null,
      targetRoom
    },
    movement: {
      fatigue: finite(creep.fatigue),
      state: wait && wait.state === 'fatigue' ? 'fatigue'
        : (memory.navStuck || 0) > 0 ? 'stuck-or-oscillating'
          : targetRoom && creep.room && targetRoom !== creep.room.name
            ? 'traveling' : memory.navGoal ? 'moving' : 'not-observed',
      goal: memory.navGoal || null,
      roomWaypoint: memory.navRoomWaypoint || null,
      stuckTicks: finite(memory.navStuck),
      lastMoveTick: integer(memory.navLastTick),
      blocker: memory.navBlocker ? { ...memory.navBlocker } : null,
      recovery: memory.navRecovery ? { ...memory.navRecovery } : null,
      corridor: memory.navCorridor ? {
        goal: memory.navCorridor.goal || null,
        room: memory.navCorridor.room || null,
        tick: integer(memory.navCorridor.tick),
        steps: Array.isArray(memory.navCorridor.steps)
          ? memory.navCorridor.steps.map(step => ({ ...step })) : null
      } : null,
      cachedRoute: memory._move && typeof memory._move.path === 'string'
        ? { present: true, encodedLength: memory._move.path.length }
        : { present: false, encodedLength: 0 }
    },
    ownership: {
      workJob, finalizedJob: savedJob,
      dispatchCommitment: commitment,
      pickupReservation: pickup,
      reservedAmount: finite(commitment && commitment.amount) ??
        finite(pickup && pickup.amount),
      sourceId: commitment && commitment.sourceId || pickup && pickup.sourceId ||
        workJob && workJob.sourceId || null,
      targetId: commitment && commitment.targetId || pickup && pickup.targetId ||
        workJob && workJob.targetId || null
    },
    wait,
    fallbacks: {
      lanes: fallbacks,
      compatible: fallbacks.filter(row => row.compatible).map(row => row.lane),
      rejected: fallbacks.filter(row => !row.compatible),
      policyRejections: null
    },
    limits: {
      lastSuccessfulAction: 'The controller persists current and previous task intent, not a confirmed successful action result.',
      policyRejections: 'The controller does not persist a ranked per-creep alternative list; unavailable policy rejections remain unknown.'
    }
  };
  const waitText = wait ? `${wait.state || 'waiting'}: ${wait.reason || '?'}`
    : retirement.active ? `retiring: ${retirement.reason}`
      : result.movement.state;
  result.console = `${creepName} ${result.identity.role || '?'} ` +
    `${archetype || '?'} ${result.identity.sizeTier || '?'} | ` +
    `${result.task.name || 'idle'} -> ${String(targetReference || '?')} | ` +
    `${result.location.currentRoom || '?'}${targetRoom && targetRoom !==
      result.location.currentRoom ? ` -> ${targetRoom}` : ''} | TTL ` +
    `${ttl == null ? '?' : ttl} replace ${deadline == null ? '?' : deadline} | ` +
    `${waitText}`;
  return result;
};

module.exports = { CREEP_DEFINITION, createCreepCommand, activeBody,
  sizeTier, remoteAssignment };
