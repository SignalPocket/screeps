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
  spawnQueuedThisTick = false) => hostileCount > 0 &&
    defenderCoverage === 0 && !spawnQueuedThisTick;

// A garrison in one outpost must not hide an uncovered hostile in another.
const selectUndefendedThreat = (threats, defenders, constants) => {
  const coveredRooms = new Set((defenders || [])
    .filter(defender => !defender.spawning)
    .map(defender => defender.memory.defenseTargetRoom ||
      defender.room.name));
  return (threats || []).filter(threat => threat && threat.creep &&
    !coveredRooms.has(threat.roomName)).sort((a, b) =>
    threatScore(b.creep, constants) - threatScore(a.creep, constants) ||
    String(a.roomName).localeCompare(String(b.roomName)) ||
    String(a.creep.id).localeCompare(String(b.creep.id)))[0] || null;
};

const selectDefenderGarrison = defenders => {
  const selected = new Map();
  for (const creep of defenders || []) {
    const targetRoom = creep.memory.defenseTargetRoom || creep.room.name;
    const current = selected.get(targetRoom);
    if (!current ||
        Number(creep.room.name === targetRoom) >
          Number(current.room.name === targetRoom) ||
        creep.room.name === targetRoom &&
          current.room.name === targetRoom &&
          (creep.ticksToLive || 0) > (current.ticksToLive || 0) ||
        creep.room.name !== targetRoom &&
          current.room.name !== targetRoom &&
          (creep.ticksToLive || 0) > (current.ticksToLive || 0)) {
      selected.set(targetRoom, creep);
    }
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

  const findFleeStep = (creep, hostiles, safeRange = 5) => {
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
    return result.path && result.path[0] || null;
  };

  return { findFleeStep };
};

module.exports = {
  getDefenseTargets,
  selectCombatTarget, needsEmergencyDefender, selectUndefendedThreat,
  selectDefenderGarrison, collectFriendlyDamageEvents,
  updateWarState, getDefenseRoomNames,
  getOutpostPresenceGap,
  createDefenseController
};
