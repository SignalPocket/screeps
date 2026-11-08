'use strict';

// Invader cores reserve controllers without any hostile creep being present.
// Use the same target set for discovery, deployment, combat and retirement.
const getDefenseTargets = (room, hostileCreeps, hostileStructures) => [
  ...room.find(hostileCreeps),
  ...room.find(hostileStructures).filter(structure =>
    structure.structureType === 'invaderCore' && structure.hits > 0)
];

const threatScore = (creep, constants) => [
  [constants.HEAL, 8], [constants.RANGED_ATTACK, 6],
  [constants.ATTACK, 5], [constants.WORK, 2], [constants.CLAIM, 1]
].reduce((total, [part, weight]) => total +
  (part && creep.getActiveBodyparts
    ? creep.getActiveBodyparts(part) : 0) * weight, 0);

const selectCombatTarget = (creep, hostiles, constants) =>
  (hostiles || []).slice().sort((a, b) =>
    threatScore(b, constants) - threatScore(a, constants) ||
    creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b) ||
    a.hits - b.hits || String(a.id).localeCompare(String(b.id)))[0] || null;

const needsEmergencyDefender = (hostileCount, defenderCoverage,
  spawnQueuedThisTick = false, requiredDefenders = 1) => hostileCount > 0 &&
    defenderCoverage < requiredDefenders && !spawnQueuedThisTick;

// Defense runs after ordinary work. Cancel a movement intent already issued
// earlier in the tick when melee has reached its target, or that stale intent
// can pull the defender away immediately after a successful strike.
const holdMeleeEngagement = (creep, target, attackResult, OK = 0) => {
  if (attackResult !== OK || !target || creep.pos.getRangeTo(target) > 1 ||
      typeof creep.cancelOrder !== 'function') return false;
  creep.cancelOrder('move');
  return true;
};

// A garrison in one outpost must not hide an uncovered hostile in another.
const selectUndefendedThreat = (threats, defenders, constants) => {
  const coverage = new Map();
  for (const defender of defenders || []) {
    const room = defender.memory.defenseTargetRoom || defender.room.name;
    coverage.set(room, (coverage.get(room) || 0) + 1);
  }
  return (threats || []).filter(threat => threat && threat.creep &&
    (coverage.get(threat.roomName) || 0) <
      (threat.requiredDefenders || 1)).sort((a, b) =>
    threatScore(b.creep, constants) - threatScore(a.creep, constants) ||
    String(a.roomName).localeCompare(String(b.roomName)) ||
    String(a.creep.id).localeCompare(String(b.creep.id)))[0] || null;
};

const selectDefenderGarrison = (defenders, requiredByRoom = {}) => {
  const selected = new Map();
  for (const creep of defenders || []) {
    const targetRoom = creep.memory.defenseTargetRoom || creep.room.name;
    if (!selected.has(targetRoom)) selected.set(targetRoom, []);
    selected.get(targetRoom).push(creep);
  }
  for (const [room, members] of selected) {
    members.sort((a, b) => Number(b.room.name === room) -
      Number(a.room.name === room) || (b.ticksToLive || 0) - (a.ticksToLive || 0));
    selected.set(room, members.slice(0, Math.max(1, requiredByRoom[room] || 1)));
  }
  return selected;
};

/**
 * Compare each creep's current hits with its previous-tick snapshot.
 *
 * This detects that friendly damage occurred even when the hostile is no
 * longer visible by the time defense planning runs. It records only the room
 * of damage and the creep's home room; it does not identify an attacker or a
 * damage type. The current hit value is saved for the next tick.
 */
const collectFriendlyDamageEvents = creeps => {
  const events = [];
  for (const creep of creeps || []) {
    const previousHits = creep.memory.warPreviousHits;
    if (Number.isFinite(previousHits) && creep.hits < previousHits) {
      events.push({
        damaged: true,
        roomName: creep.room.name,
        homeRoomName: creep.memory.home || creep.room.name
      });
    }
    creep.memory.warPreviousHits = creep.hits;
  }
  return events;
};

const updateWarState = (memory, tick, events, duration = 100) => {
  const event = (events || []).find(entry => entry &&
    (entry.damaged || entry.hostile));
  if (event) {
    memory.war = true;
    memory.warUntil = tick + duration;
    memory.warRoom = event.roomName;
    memory.warHome = event.homeRoomName || event.roomName;
  } else if (memory.war && tick > (memory.warUntil || 0)) {
    memory.war = false;
    delete memory.warUntil;
    delete memory.warRoom;
    delete memory.warHome;
  }
  global.war = memory.war === true;
  return memory.war === true;
};

const getDefenseRoomNames = (homeRoomName, homeMemory, creeps) => {
  const roomNames = new Set([homeRoomName]);
  for (const [roomName, objective] of Object.entries(
    homeMemory && homeMemory.combatObjectives || {})) {
    if (objective && objective.active !== false) roomNames.add(roomName);
  }
  for (const survey of Object.values(homeMemory || {})) {
    if (survey && survey.active && survey.targetRoom) {
      roomNames.add(survey.targetRoom);
    }
  }
  for (const creep of creeps || []) {
    if (creep.memory && creep.memory.home === homeRoomName &&
        creep.memory.remoteRoom) {
      roomNames.add(creep.memory.remoteRoom);
    }
  }
  return roomNames;
};

const getOutpostPresenceGap = (homeRoomName, homeMemory, creeps) => {
  const surveys = [
    { survey: homeMemory && homeMemory.leftSurvey, team: 'left' },
    { survey: homeMemory && homeMemory.southSurvey, team: 'south',
      delivery: 's2' },
    { survey: homeMemory && homeMemory.southwestSurvey,
      team: 'southwest' }
  ].filter(entry => entry.survey && entry.survey.active &&
    entry.survey.targetRoom);
  return surveys.find(({ survey }) => {
    const occupants = (creeps || []).filter(creep =>
      creep.room && creep.room.name === survey.targetRoom);
    if (occupants.length > 0) return false;
    return !(creeps || []).some(creep => {
      const memory = creep.memory || {};
      return memory.home === homeRoomName &&
        memory.remoteRoom === survey.targetRoom &&
        ['remote-miner', 'remote-hauler', 'remote-reserver'].includes(
          memory.role) &&
        !memory.staffingRetire;
    });
  }) || null;
};

const createDefenseController = ({
  PathFinder, FIND_STRUCTURES, FIND_CREEPS, OBSTACLE_OBJECT_TYPES,
  STRUCTURE_ROAD, STRUCTURE_RAMPART
}) => {
  const range = (a, b) => Math.max(Math.abs(a.x - b.x),
    Math.abs(a.y - b.y));
  const costMatrices = {};
  const getRoomCostMatrix = room => {
    if (costMatrices[room.name]) return costMatrices[room.name];
    const costs = new PathFinder.CostMatrix();
    for (const structure of room.find(FIND_STRUCTURES)) {
      if (structure.structureType === STRUCTURE_ROAD) {
        costs.set(structure.pos.x, structure.pos.y, 1);
      } else if (structure.structureType === STRUCTURE_RAMPART &&
          (structure.my || structure.isPublic)) {
        continue;
      } else if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
        costs.set(structure.pos.x, structure.pos.y, 255);
      }
    }
    for (const other of room.find(FIND_CREEPS)) {
      costs.set(other.pos.x, other.pos.y, 255);
    }
    costMatrices[room.name] = costs;
    return costs;
  };

  const findFleeStep = (creep, hostiles, safeRange = 5,
    defenders = []) => {
    const nearbyHostiles = (hostiles || []).filter(hostile =>
      creep.pos.getRangeTo(hostile) <= safeRange);
    if (nearbyHostiles.length === 0) return null;
    const result = PathFinder.search(creep.pos,
      nearbyHostiles.map(hostile => ({ pos: hostile.pos, range: safeRange })),
      {
        flee: true,
        maxRooms: 1,
        plainCost: 2,
        swampCost: 10,
        roomCallback: roomName => roomName === creep.room.name
          ? getRoomCostMatrix(creep.room) : false
      });
    const fallback = result.path && result.path[0] || null;
    const protector = (defenders || []).filter(defender => defender &&
      !defender.spawning && defender.hits > 0 &&
      defender.room && defender.room.name === creep.room.name &&
      defender.memory && defender.memory.role === 'defender' &&
      !defender.memory.defenseReturnHome &&
      (defender.memory.defenseTargetRoom || defender.room.name) ===
        creep.room.name).sort((a, b) =>
      b.hits / Math.max(1, b.hitsMax) - a.hits / Math.max(1, a.hitsMax) ||
      range(creep.pos, a.pos) - range(creep.pos, b.pos) ||
      String(a.id || a.name).localeCompare(String(b.id || b.name)))[0];
    if (!protector) return fallback;
    const currentThreatRange = Math.min(...nearbyHostiles.map(hostile =>
      range(creep.pos, hostile.pos)));
    const requiredRange = currentThreatRange < safeRange
      ? currentThreatRange + 1 : safeRange;
    const currentProtectorRange = range(creep.pos, protector.pos);
    const costs = getRoomCostMatrix(creep.room);
    const terrain = creep.room.getTerrain && creep.room.getTerrain();
    const candidates = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const candidate = { x: creep.pos.x + dx, y: creep.pos.y + dy,
        roomName: creep.room.name };
      if (candidate.x <= 0 || candidate.x >= 49 || candidate.y <= 0 ||
          candidate.y >= 49 || costs.get(candidate.x, candidate.y) >= 255 ||
          terrain && terrain.get(candidate.x, candidate.y) === 1) continue;
      const threatRange = Math.min(...nearbyHostiles.map(hostile =>
        range(candidate, hostile.pos)));
      const protectorRange = range(candidate, protector.pos);
      if (threatRange < requiredRange ||
          protectorRange >= currentProtectorRange) continue;
      candidates.push({ candidate, threatRange, protectorRange });
    }
    candidates.sort((a, b) => a.protectorRange - b.protectorRange ||
      b.threatRange - a.threatRange || a.candidate.x - b.candidate.x ||
      a.candidate.y - b.candidate.y);
    return candidates[0] && candidates[0].candidate || fallback;
  };

  return { findFleeStep };
};

module.exports = {
  getDefenseTargets,
  selectCombatTarget, needsEmergencyDefender, selectUndefendedThreat,
  holdMeleeEngagement,
  selectDefenderGarrison, collectFriendlyDamageEvents,
  updateWarState, getDefenseRoomNames,
  getOutpostPresenceGap,
  createDefenseController
};
