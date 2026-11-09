'use strict';

const { scaleEnergyBudget } = typeof Game === 'undefined'
  ? require('./room.scaling') : require('room.scaling');

const createSpawnPolicy = ({
  Game, buildBody, CARRY, WORK, MOVE,
  refillerMaxChargeWait = 15,
  maxSpawnChargeWait = 20,
  minSpawnChargeWait = 3,
  emergencyBodyEnergyRatio = 0.5,
  recoveryBodyEnergyRatio = 0.65,
  minimumRecoveryBodyEnergy = 300,
  maximumBodyEnergy = 700,
  productiveMinerMaximumBodyEnergy = 800
}) => {
  const dedicatedRoles = new Set([
    'remote-miner', 'remote-hauler', 'refiller', 'rebalancer', 'claimer',
    'controller-relay', 'remote-reserver', 'defender'
  ]);
  const fullBodyRoles = new Set([
    'miner', 'harvester', 'hauler', 'refiller', 'rebalancer', 'upgrader',
    'builder', 'remote-miner', 'remote-hauler', 'remote-reserver', 'claimer', 'defender'
  ]);

  const getSpawnChargeWaitLimit = (current, target) => {
    if (target <= 0) return maxSpawnChargeWait;
    const staffingRatio = Math.max(0, Math.min(1, current / target));
    return Math.max(minSpawnChargeWait, Math.round(maxSpawnChargeWait *
      staffingRatio * staffingRatio));
  };

  const clearSpawnWait = room => {
    delete room.memory.spawnWaitSince;
    delete room.memory.spawnWaitRole;
    delete room.memory.spawnWaitLimit;
  };

  const getSpawnBodyEnergyBudget = (current, target, available, capacity,
    emergency = false) => {
    const scaledBudget = ratio => scaleEnergyBudget(capacity, ratio, {
      minimum: minimumRecoveryBodyEnergy
    });
    if (emergency || target > 0 && current / target < 0.75) {
      return Math.min(available, scaledBudget(emergencyBodyEnergyRatio));
    }
    if (target > 0 && current / target < 0.9) {
      return Math.min(available, scaledBudget(recoveryBodyEnergyRatio));
    }
    return Math.min(available, capacity);
  };

  /**
   * Turn an assignment into a bounded spawn request.
   * Assignment selection answers "which missing capability is next"; this
   * function answers "may we add population now, and what can we afford".
   * `forceSpawn` affects body timing only and never bypasses population caps.
   */
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
    const needsWorker = Boolean(assignment && !hasCapableIdleWorker &&
      (workers.length < workerLimit || assignment.emergencyDefense ||
        assignment.manualDefense ||
        assignment.emergencyPresence));
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
    const staffingCurrent = assignment.staffingCurrent == null
      ? workers.length : assignment.staffingCurrent;
    const staffingTarget = assignment.staffingTarget == null
      ? workerLimit : assignment.staffingTarget;
    const waitLimit = getSpawnChargeWaitLimit(staffingCurrent,
      staffingTarget);
    spawn.room.memory.spawnWaitLimit = waitLimit;
    const sourceWorkerCount = workers.filter(creep =>
      (creep.memory.role === 'miner' ||
        creep.memory.role === 'harvester') &&
      (creep.spawning || creep.getActiveBodyparts(WORK) > 0)).length;
    const emergency = workers.length === 0 || sourceWorkerCount === 0 ||
      Boolean(assignment.emergencyPresence) ||
      Boolean(assignment.minimumGap && staffingCurrent === 0) ||
      (spawn.room.controller &&
        spawn.room.controller.ticksToDowngrade < 1000);
    const energyFull = spawn.room.energyAvailable >=
      spawn.room.energyCapacityAvailable;
    const waited = Game.time -
      (spawn.room.memory.spawnWaitSince || Game.time);
    const refillerWaitExpired = assignment.role === 'refiller' &&
      assignment.refillerFallbackAllowed !== false &&
      waited >= refillerMaxChargeWait;
    const bodyType = assignment.spawnBodyRole || assignment.bodyType ||
      assignment.role;
    const productiveMiner = ['miner', 'harvester'].includes(bodyType) &&
      assignment.miningProduction > 0;
    const operationEnergy = assignment.role === 'upgrader' && assignment.operationWork
      ? assignment.operationWork * 100 + 100 + Math.ceil(assignment.operationWork / 4) * 50
      : assignment.role === 'remote-reserver' ? 1300 : 0;
    const assignmentBodyEnergyCeiling = operationEnergy ||
      (assignment.rapidDefense ? 300 : productiveMiner
        ? productiveMinerMaximumBodyEnergy : maximumBodyEnergy);
    // Legacy planners may still describe the pre-cap ideal body. A request
    // must never wait for more energy than the body factory is allowed to
    // spend on one creep.
    const effectiveMinimumEnergy = assignment.minimumEnergy
      ? Math.min(assignment.minimumEnergy, assignmentBodyEnergyCeiling) : 0;
    const minimumEnergyMet = !effectiveMinimumEnergy ||
      spawn.room.energyAvailable >= effectiveMinimumEnergy;
    const maximumAllowedBodyFunded = spawn.room.energyAvailable >=
      assignmentBodyEnergyCeiling;
    // minimumEnergy is a fallback floor, not an immediate launch threshold.
    // Healthy rooms first let their extension network charge; only emergency
    // coverage bypasses the wait. Once the wait expires, still refuse a body
    // below the assignment's functional minimum.
    const fallbackWaitExpired = refillerWaitExpired || waited >= waitLimit ||
      (!fullBodyRoles.has(assignment.role) && waited >= 25);
    const chargeComplete = energyFull || maximumAllowedBodyFunded || emergency ||
      minimumEnergyMet && fallbackWaitExpired;
    const maximize = Boolean(assignment.qualityFor) || !emergency && staffingCurrent > 0 &&
      staffingTarget > 0 && staffingTarget <= 2;
    const plannedBodyEnergy = maximize
      ? Math.min(spawn.room.energyAvailable, spawn.room.energyCapacityAvailable)
      : getSpawnBodyEnergyBudget(staffingCurrent,
      staffingTarget,
      spawn.room.energyAvailable, spawn.room.energyCapacityAvailable,
      emergency);
    const bodyEnergy = Math.min(plannedBodyEnergy,
      assignmentBodyEnergyCeiling);
    const bodyOptions = { maximize,
      workLimit: assignment.workLimit || assignment.requiredWork,
      carryParts: assignment.carryParts,
      miningProduction: assignment.miningProduction,
      operationWork: assignment.operationWork,
      healerSupport: assignment.healerSupport };
    let candidateBody = chargeComplete
      ? buildBody(bodyType, bodyEnergy, bodyOptions) ||
        buildBody(bodyType, spawn.room.energyAvailable, bodyOptions)
      : null;
    const maximumBody = assignment.requiredWork
      ? buildBody(bodyType, assignmentBodyEnergyCeiling,
        { ...bodyOptions, maximize: true }) : null;
    const maximumWork = maximumBody
      ? maximumBody.filter(part => part === WORK).length : 0;
    const effectiveRequiredWork = assignment.requiredWork
      ? Math.min(assignment.requiredWork, maximumWork) : 0;
    if (candidateBody && (['remote-miner', 'harvester', 'miner', 'upgrader', 'builder'].includes(assignment.role)||assignment.qualityFor) &&
        effectiveRequiredWork && candidateBody.filter(part => part === WORK).length <
          effectiveRequiredWork) candidateBody = null;
    const mobileWorkRole = assignment.role === 'builder';
    const workParts = candidateBody
      ? candidateBody.filter(part => part === WORK).length : 0;
    const moveParts = candidateBody
      ? candidateBody.filter(part => part === MOVE).length : 0;
    const nonMoveParts = candidateBody ? candidateBody.length - moveParts : 0;
    const builderFallbackAllowed = emergency || maximumAllowedBodyFunded ||
      waited >= waitLimit;
    const body = candidateBody && mobileWorkRole &&
      (workParts < 4 || moveParts * 2 < nonMoveParts) &&
      !builderFallbackAllowed
      ? null : candidateBody;
    return {
      needsWorker: true, body, waited, waitLimit, emergency, bodyEnergy
    };
  };

  return {
    getSpawnChargeWaitLimit, getSpawnBodyEnergyBudget, clearSpawnWait,
    prepareSpawnRequest
  };
};

module.exports = { createSpawnPolicy };
