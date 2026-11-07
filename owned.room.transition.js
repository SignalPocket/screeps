'use strict';

const SURVEY_KEYS = ['leftSurvey', 'southSurvey', 'southwestSurvey'];

const ownedTarget = (Game, roomName) => {
  const room = Game.rooms[roomName];
  return Boolean(room && room.controller && room.controller.my);
};

const deactivateOwnedSurvey = (survey, Game) => {
  if (!survey || !survey.targetRoom ||
      !ownedTarget(Game, survey.targetRoom)) return false;
  const changed = survey.active !== false || survey.status !== 'owned-colony' ||
    survey.exportEnabled !== false || survey.remoteMinerTarget !== 0 ||
    survey.remoteHaulerTarget !== 0 || survey.remoteBuilderTarget !== 0 ||
    !Array.isArray(survey.remoteWorkNeeds) || survey.remoteWorkNeeds.length > 0;
  survey.active = false;
  survey.status = 'owned-colony';
  survey.ownedRoom = true;
  survey.exportEnabled = false;
  survey.remoteMinerTarget = 0;
  survey.remoteHaulerTarget = 0;
  survey.remoteBuilderTarget = 0;
  survey.remoteWorkNeeds = [];
  if (changed) survey.ownershipTransitionTick = Game.time;
  return changed;
};

const clearRemoteTaskState = memory => {
  for (const key of [
    'remoteRoom', 'remoteSlot', 'remoteTeam', 'remoteDelivery',
    'remoteBuilderSlot', 'remoteHaulerSlot', 'remoteDispatchRoom',
    'remoteDispatchSlot', 'remotePickupTarget', 'remotePickupSource',
    'remoteDeliveryTarget', 'remoteHaulReturning', 'remoteCargoOrigin',
    'remoteCargoRemaining', 'remoteCacheDeliveryPending',
    'remoteCacheReturnHome', 'remoteRosterSurplus', 'remoteRecall',
    'remoteTransitRoom', 'reservationRetreatUntil', 'task', 'taskTarget',
    'buildTarget', 'repairTarget', 'withdrawTarget', 'supplyTarget',
    'workJob', 'demandLane'
  ]) delete memory[key];
};

const convertBootstrapWorker = (creep, roomName) => {
  const memory = creep.memory;
  clearRemoteTaskState(memory);
  memory.role = 'builder';
  memory.birthRole = 'builder';
  memory.assignmentRole = 'builder';
  memory.assignmentKind = 'expansion-bootstrap';
  memory.builderScope = 'expansion';
  memory.builderMission = 'bootstrap';
  memory.expansionTarget = roomName;
  memory.ownershipTransitionRoom = roomName;
  delete memory.staffingRetire;
};

const retireObsoleteReserver = (creep, roomName) => {
  clearRemoteTaskState(creep.memory);
  creep.memory.role = 'retire';
  creep.memory.assignmentRole = 'retire';
  delete creep.memory.assignmentKind;
  creep.memory.staffingRetire = true;
  creep.memory.retiredRole = 'remote-reserver';
  creep.memory.ownershipTransitionRoom = roomName;
};

const reconcileOwnedRoomTransitions = ({ Game, rooms, creeps,
  getWork = creep => creep.getActiveBodyparts('work'),
  getCarry = creep => creep.getActiveBodyparts('carry'),
  getEnergy = creep => creep.store && creep.store.energy || 0 }) => {
  const transitionedRooms = new Set();
  for (const home of rooms) {
    for (const key of SURVEY_KEYS) {
      const survey = home.memory && home.memory[key];
      if (deactivateOwnedSurvey(survey, Game)) {
        transitionedRooms.add(survey.targetRoom);
        delete home.memory.remoteHaulerRosterSignature;
      }
    }
  }

  const converted = [];
  const retired = [];
  for (const creep of creeps) {
    const target = creep.memory.remoteRoom;
    if (!target || !ownedTarget(Game, target)) continue;
    if (creep.memory.role === 'remote-reserver') {
      retireObsoleteReserver(creep, target);
      retired.push(creep.name);
      continue;
    }
    const remoteWorker = creep.memory.role === 'remote-miner' ||
      creep.memory.builderScope === 'outpost';
    if (remoteWorker && getWork(creep) > 0 && getCarry(creep) > 0) {
      convertBootstrapWorker(creep, target);
      converted.push(creep.name);
      continue;
    }
    if (creep.memory.role === 'remote-hauler' &&
        creep.room && creep.room.name === target && getEnergy(creep) > 0) {
      clearRemoteTaskState(creep.memory);
      creep.memory.role = 'hauler';
      creep.memory.birthRole = 'hauler';
      creep.memory.assignmentRole = 'hauler';
      delete creep.memory.assignmentKind;
      creep.memory.home = target;
      creep.memory.ownershipTransitionRoom = target;
      converted.push(creep.name);
    }
  }

  return { rooms: [...transitionedRooms], converted, retired };
};

module.exports = { SURVEY_KEYS, ownedTarget, deactivateOwnedSurvey,
  reconcileOwnedRoomTransitions };
