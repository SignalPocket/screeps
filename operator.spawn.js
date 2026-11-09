'use strict';

const SPAWN_DEFINITION = Object.freeze({
  name: 'spawn',
  signature: 'ops.spawn(roomName)',
  purpose: 'Explain finalized spawn staffing, admission, and active bodies.',
  example: "ops.spawn('W7N4')",
  mode: 'read-only',
  writes: 'none',
  expires: null,
  related: Object.freeze(['colony', 'energy', 'room', 'work'])
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
const bodyCost = (body, costs) => Array.isArray(body) && costs
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
const laneFor = memory => {
  const role = memory && memory.role;
  if (['miner', 'harvester'].includes(role)) return 'source';
  if (role === 'remote-miner') return 'remoteMiner';
  if (role === 'remote-hauler') return 'remoteHauler';
  if (role === 'remote-reserver') return 'remoteReserver';
  if (role === 'builder') {
    if (memory.builderScope === 'outpost') return 'remoteBuilder';
    if (memory.builderMission === 'repair') return 'repairBuilder';
    if (memory.builderMission === 'tunnel') return 'tunnelBuilder';
    return 'builder';
  }
  return role || null;
};
const remoteLane = lane => lane.startsWith('remote');
const laneTargets = policy => {
  const rows = Object.entries(policy && policy.roles || {}).map(([lane, target]) =>
    ({ lane, minimum: finite(target.min), desired: finite(target.desired),
      maximum: finite(target.max) }));
  const remote = policy && policy.remote;
  if (remote) rows.push(
    { lane: 'remoteMiner', minimum: finite(remote.minersMin),
      desired: finite(remote.miners), maximum: null },
    { lane: 'remoteHauler', minimum: finite(remote.haulersMin),
      desired: finite(remote.haulers), maximum: null },
    { lane: 'remoteBuilder', minimum: finite(remote.buildersMin),
      desired: finite(remote.builders), maximum: null },
    { lane: 'remoteReserver', minimum: finite(remote.reserversMin),
      desired: finite(remote.reservers), maximum: finite(remote.reservers) });
  return rows.sort((left, right) => left.lane.localeCompare(right.lane));
};

const createSpawnCommand = ({ Game, colonyCommand, bodyPartCost = {},
  getBodyType, hasLocalReplacementLife, hasRemoteReplacementLife,
  getLocalReplacementLead, getRemoteReplacementLead }) => (...args) => {
  const tick = integer(Game && Game.time);
  if (args.length !== 1 || typeof args[0] !== 'string') return errorResult(
    tick, 'ops.spawn(roomName) requires one room name');
  const roomName = args[0];
  if (!/^[WE]\d+[NS]\d+$/.test(roomName)) return errorResult(tick,
    `Invalid Screeps room name: ${roomName}`);
  const room = Game && Game.rooms && Game.rooms[roomName];
  if (!room) return errorResult(tick,
    `Room ${roomName} is not currently visible`);
  if (!room.controller || !room.controller.my) return errorResult(tick,
    `Room ${roomName} is not an owned room`);
  if (typeof colonyCommand !== 'function') return errorResult(tick,
    'Canonical colony inventory is unavailable');
  const colony = colonyCommand();
  if (!colony || !colony.ok || !Array.isArray(colony.rooms)) {
    return errorResult(tick, 'Canonical colony inventory is unavailable');
  }
  const colonyRow = colony.rooms.find(row => row.roomName === roomName);
  if (!colonyRow) return errorResult(tick,
    `Room ${roomName} is absent from canonical colony inventory`);

  const memory = room.memory || {};
  const decision = memory.spawnDecision || null;
  const policy = memory.populationPolicy || null;
  const denials = memory.spawnDenials || null;
  const creeps = Object.values(Game.creeps || {}).filter(creep => creep &&
    creep.memory && creep.memory.home === roomName);
  const spawns = Object.values(Game.spawns || {}).filter(spawn => spawn &&
    spawn.room && spawn.room.name === roomName).sort((a, b) =>
    a.name.localeCompare(b.name));

  const active = spawns.filter(spawn => spawn.spawning).map(spawn => {
    const spawning = spawn.spawning;
    const creep = Game.creeps && Game.creeps[spawning.name];
    const body = creep && Array.isArray(creep.body) ? creep.body : null;
    const creepMemory = creep && creep.memory || {};
    return {
      spawn: spawn.name, name: spawning.name || null,
      remainingTime: finite(spawning.remainingTime),
      cost: bodyCost(body, bodyPartCost),
      body: bodyCounts(body), bodyLength: body && body.length || null,
      task: creepMemory.task || creepMemory.role || null,
      lane: laneFor(creepMemory),
      archetype: creepMemory.bodyType ||
        (typeof getBodyType === 'function' ? getBodyType(creepMemory) : null),
      sizeTier: sizeTier(body)
    };
  });

  const lanes = laneTargets(policy).map(target => {
    const members = creeps.filter(creep => laneFor(creep.memory) === target.lane);
    const viability = remoteLane(target.lane)
      ? hasRemoteReplacementLife : hasLocalReplacementLife;
    const replacementLead = remoteLane(target.lane)
      ? getRemoteReplacementLead : getLocalReplacementLead;
    const viable = typeof viability === 'function'
      ? members.filter(creep => viability(creep)).length : null;
    const spawning = members.filter(creep => creep.spawning).length;
    const traveling = members.filter(creep => !creep.spawning && creep.room &&
      creep.room.name !== roomName).length;
    const retiring = members.filter(creep => creep.memory.staffingRetire ||
      creep.memory.role === 'retire').length;
    const expiring = typeof viability !== 'function' ? null
      : members.filter(creep => !creep.spawning &&
        !creep.memory.staffingRetire && creep.memory.role !== 'retire' &&
        !viability(creep)).length;
    const deadlines = members.map(creep => {
      const lead = typeof replacementLead === 'function'
        ? finite(replacementLead(creep)) : null;
      return { name: creep.name, ticksToLive: finite(creep.ticksToLive),
        lead, replacementDeadline: lead == null ? null : tick +
          Math.max(0, (finite(creep.ticksToLive) || 0) - lead) };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { ...target, count: members.length, viable, spawning, traveling,
      expiring, retiring,
      missingMinimum: target.minimum == null || viable == null ? null
        : Math.max(0, target.minimum - viable),
      missingDesired: target.desired == null || viable == null ? null
        : Math.max(0, target.desired - viable),
      surplus: target.maximum == null ? null
        : Math.max(0, members.length - target.maximum),
      replacementDeadlines: deadlines };
  });

  const records = denials && denials.records || {};
  const candidates = Object.values(records).sort((a, b) =>
    String(a.spawn).localeCompare(String(b.spawn))).map((record, index) => ({
      order: index + 1, spawn: record.spawn || null,
      role: record.role || null, target: record.target || null,
      status: record.status || 'unknown',
      policyPhase: record.gate || decision && decision.phase || null,
      authority: record.authority || null,
      reason: record.reason || (record.status === 'admitted'
        ? decision && decision.reason || 'admitted' : null),
      recovery: record.recovery || null,
      firstTick: integer(record.firstTick), lastTick: integer(record.lastTick),
      age: integer(record.age), observations: integer(record.observations)
    }));
  const affordability = {
    available: finite(room.energyAvailable),
    capacity: finite(room.energyCapacityAvailable),
    waitSince: integer(memory.spawnWaitSince),
    waited: Number.isSafeInteger(memory.spawnWaitSince) && tick != null
      ? Math.max(0, tick - memory.spawnWaitSince) : null,
    waitLimit: finite(memory.spawnWaitLimit),
    waitingFor: memory.spawnWaitRole || null
  };
  const result = {
    ok: true, tick, roomName,
    freshness: 'current tick with per-source observation ages',
    observations: {
      populationPolicy: observation(policy && policy.updated, tick),
      spawnDecision: observation(decision && decision.updated, tick),
      spawnOutcomes: observation(denials && denials.updated, tick)
    },
    active, lanes, candidates,
    decision: decision ? {
      authorized: Boolean(decision.authorized), phase: decision.phase || null,
      jobKey: decision.jobKey || null, role: decision.role || null,
      reason: decision.reason || null, population: finite(decision.population),
      populationLimit: finite(decision.populationLimit),
      workerLimit: finite(decision.workerLimit),
      transitionAllowance: finite(decision.populationTransitionAllowance),
      reservationDeadline: finite(decision.reservationDeadline),
      remoteRoom: decision.remoteRoom || null
    } : null,
    affordability,
    limits: {
      candidateEvidence: 'Saved per-spawn outcomes only; rejected alternatives not persisted by the controller remain unknown.',
      replacementDeadlines: 'Computed from the canonical live replacement lead when available; null means unknown.'
    }
  };
  const missing = lanes.reduce((sum, lane) =>
    sum + (lane.missingDesired || 0), 0);
  const action = active.length ? `active ${active.map(row => row.name).join(',')}`
    : decision && decision.role ? `${decision.authorized ? 'next' : 'deferred'} ${decision.role}`
      : 'no saved candidate';
  result.console = `${roomName} spawn | ${action} | pop ` +
    `${decision && finite(decision.population) != null ? decision.population : '?'}/` +
    `${decision && finite(decision.populationLimit) != null ? decision.populationLimit : '?'} ` +
    `transition ${decision && finite(decision.populationTransitionAllowance) != null
      ? decision.populationTransitionAllowance : '?'} | missing ${missing} | ` +
    `${decision && decision.reason || 'decision unknown'}\n` +
    lanes.map(lane => `${lane.lane} ${lane.viable == null ? '?' : lane.viable}/` +
      `${lane.minimum == null ? '?' : lane.minimum}/` +
      `${lane.desired == null ? '?' : lane.desired} spawn${lane.spawning} ` +
      `travel${lane.traveling} expire${lane.expiring == null ? '?' : lane.expiring} ` +
      `retire${lane.retiring}`).join(' | ');
  return result;
};

module.exports = { SPAWN_DEFINITION, createSpawnCommand, laneFor, sizeTier };
