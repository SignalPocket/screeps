'use strict';

const createSpawnPolicy = ({
  Game, buildBody, CARRY, WORK, MOVE,
  refillerMaxChargeWait = 25,
  maxSpawnChargeWait = 60
}) => {
  const dedicatedRoles = new Set([
    'remote-scout', 'remote-hauler', 'refiller', 'rebalancer', 'claimer'
  ]);
  const replacementRoles = new Set([
    'upgrader', 'builder', 'remote-scout', 'remote-hauler', 'refiller',
    'rebalancer', 'claimer'
  ]);
  const fullBodyRoles = new Set([
    'miner', 'harvester', 'hauler', 'refiller', 'rebalancer', 'upgrader',
    'builder', 'remote-scout', 'remote-hauler', 'claimer'
  ]);

  const getSpawnChargeWaitLimit = (current, target) => {
    if (target <= 0) return maxSpawnChargeWait;
    const staffingRatio = Math.max(0, Math.min(1, current / target));
    return Math.max(5, Math.round(maxSpawnChargeWait *
      staffingRatio * staffingRatio));
  };

  const clearSpawnWait = room => {
    delete room.memory.spawnWaitSince;
    delete room.memory.spawnWaitRole;
    delete room.memory.spawnWaitLimit;
  };

  const prepareSpawnRequest = ({
    spawn, assignment, workers, workerLimit, hasWorkParts
  }) => {
    const requiresDedicatedBody = assignment &&
      (dedicatedRoles.has(assignment.role) ||
        assignment.role === 'builder' &&
          (assignment.builderScope && assignment.builderScope !== 'local' ||
            assignment.builderMission === 'tunnel'));
    const hasCapableIdleWorker = assignment && !assignment.forceSpawn &&
      !requiresDedicatedBody && workers.some(creep =>
        !creep.spawning && creep.memory.idleNow &&
        (assignment.role === 'hauler'
          ? creep.getActiveBodyparts(CARRY) > 0
          : hasWorkParts(creep)));
    const specialistReplacement = assignment &&
      (replacementRoles.has(assignment.role) || assignment.forceSpawn);
    const needsWorker = Boolean(assignment && !hasCapableIdleWorker &&
      (workers.length < workerLimit || specialistReplacement));
    if (!needsWorker) {
      clearSpawnWait(spawn.room);
      return { needsWorker: false, body: null };
    }

    const assignmentKey = assignment.role === 'builder'
      ? ['builder', assignment.builderScope || 'local',
        assignment.builderMission || 'build'].join(':')
      : assignment.role;
    if (spawn.room.memory.spawnWaitRole !== assignmentKey) {
      spawn.room.memory.spawnWaitRole = assignmentKey;
      spawn.room.memory.spawnWaitSince = Game.time;
    }
    const waitLimit = getSpawnChargeWaitLimit(workers.length, workerLimit);
    spawn.room.memory.spawnWaitLimit = waitLimit;
    const sourceWorkerCount = workers.filter(creep =>
      creep.memory.role === 'miner' ||
      creep.memory.role === 'harvester').length;
    const emergency = workers.length === 0 || sourceWorkerCount === 0 ||
      (spawn.room.controller &&
        spawn.room.controller.ticksToDowngrade < 1000);
    const energyFull = spawn.room.energyAvailable >=
      spawn.room.energyCapacityAvailable;
    const waited = Game.time -
      (spawn.room.memory.spawnWaitSince || Game.time);
    const refillerWaitExpired = assignment.role === 'refiller' &&
      assignment.refillerFallbackAllowed !== false &&
      waited >= refillerMaxChargeWait;
    const chargeComplete = energyFull || emergency ||
      (assignment.minimumEnergy && spawn.room.energyAvailable >=
        assignment.minimumEnergy) || refillerWaitExpired ||
      waited >= waitLimit ||
      (!fullBodyRoles.has(assignment.role) && waited >= 25);
    const candidateBody = chargeComplete
      ? buildBody(assignment.role, spawn.room.energyAvailable)
      : null;
    const mobileWorkRole = assignment.role === 'builder';
    const workParts = candidateBody
      ? candidateBody.filter(part => part === WORK).length : 0;
    const moveParts = candidateBody
      ? candidateBody.filter(part => part === MOVE).length : 0;
    const nonMoveParts = candidateBody ? candidateBody.length - moveParts : 0;
    const body = candidateBody && mobileWorkRole &&
      (workParts < 4 || moveParts * 2 < nonMoveParts)
      ? null : candidateBody;
    return { needsWorker: true, body, waited, waitLimit, emergency };
  };

  return { getSpawnChargeWaitLimit, clearSpawnWait, prepareSpawnRequest };
};

module.exports = { createSpawnPolicy };
