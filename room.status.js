'use strict';

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const deriveRoomStatus = state => {
  const hasSpawn = state.hasSpawn !== false;
  const sourceCount = Math.max(1, state.sourceCount || 0);
  const spawnFill = hasSpawn ? clamp(state.energyRatio || 0, 0, 1) : 1;
  const storedEnergy = Math.max(0, state.storedEnergy || 0);
  const storedSourceEnergy = Math.max(0, state.storedSourceEnergy || 0);
  const sourceRemaining = clamp(state.sourceEnergyRatio || 0, 0, 1);
  const emptySourceRatio = clamp((state.emptySourceCount || 0) /
    sourceCount, 0, 1);
  const historicalEmptyRate = clamp(state.sourceEarlyEmptyRate || 0, 0, 1);
  const historicalHighRate = clamp(state.sourceHighEnergyRate || 0, 0, 1);
  const reserveTarget = Math.max(1000, sourceCount * 1500,
    (state.energyCapacity || 0) * 4);
  const reserveRatio = storedEnergy / reserveTarget;
  const bufferRatio = clamp(state.bufferRatio || 0, 0, 1);
  const droppedEnergy = Math.max(0, state.droppedEnergy || 0);
  const controllerDanger = Number.isFinite(state.controllerTicks) &&
    state.controllerTicks < 3000;
  const repairCrisis = Boolean(state.repairCritical);

  let harvest;
  if (emptySourceRatio >= 0.5 || sourceRemaining <= 0.15 ||
      historicalEmptyRate >= 0.2) {
    harvest = 'fully-used';
  } else if (sourceRemaining >= 0.65 || historicalHighRate >= 0.25) {
    harvest = 'underused';
  } else {
    harvest = 'working';
  }

  const logisticsPressure = storedSourceEnergy >= 1000 ||
    bufferRatio >= 0.65 || droppedEnergy >= 500;
  const logistics = logisticsPressure && (!hasSpawn || spawnFill < 0.85)
    ? 'blocked'
    : logisticsPressure ? 'backlogged' : 'flowing';

  const reserve = reserveRatio < 0.15 ? 'critical'
    : reserveRatio < 0.5 ? 'low'
      : reserveRatio < 1.25 ? 'healthy' : 'surplus';

  const reasons = [];
  let key = 'stable';
  let label = 'Stable';
  if (controllerDanger) {
    key = 'controller-danger';
    label = 'Controller danger';
    reasons.push(`controller ${state.controllerTicks} ticks`);
  } else if (logistics === 'blocked') {
    key = hasSpawn ? 'logistics-blocked' : 'haul-backlog';
    label = hasSpawn ? 'Logistics blocked' : 'Haul backlog';
    reasons.push(`${storedSourceEnergy} source energy waiting`);
  } else if (harvest === 'underused' && reserveRatio < 1) {
    key = 'mining-gap';
    label = 'Mining gap';
    reasons.push(`${Math.round(sourceRemaining * 100)}% source energy unused`);
  } else if (hasSpawn && reserve === 'critical' && spawnFill < 0.5) {
    key = 'energy-starved';
    label = 'Energy starved';
    reasons.push(`${storedEnergy}/${reserveTarget} reserve`);
  } else if (repairCrisis) {
    key = 'repair-crisis';
    label = 'Repair crisis';
    reasons.push(`${Math.round(state.repairRemaining || 0)} repair remaining`);
  } else if (hasSpawn && reserve === 'surplus' && spawnFill >= 0.85) {
    key = 'energy-surplus';
    label = 'Energy surplus';
    reasons.push(`${storedEnergy}/${reserveTarget} reserve`);
  } else if ((state.buildRemaining || 0) > 0) {
    key = 'building';
    label = 'Building';
    reasons.push(`${Math.round(state.buildRemaining)} build remaining`);
  } else if (!hasSpawn && harvest === 'fully-used') {
    key = 'remote-producing';
    label = 'Remote producing';
    reasons.push('sources are being fully used');
  }

  if (spawnFill < 0.5 && key !== 'energy-starved') {
    reasons.push(`spawn network ${Math.round(spawnFill * 100)}%`);
  }
  if (droppedEnergy >= 100) reasons.push(`${droppedEnergy} dropped`);
  if (reasons.length === 0) reasons.push('energy flow within targets');

  let score = 100;
  if (hasSpawn) score -= Math.round((1 - spawnFill) * 20);
  score -= Math.round((1 - clamp(reserveRatio, 0, 1)) * 25);
  if (harvest === 'underused' && reserveRatio < 1) score -= 15;
  if (logistics === 'blocked') score -= 20;
  if (controllerDanger) score -= 35;
  if (repairCrisis) score -= 10;
  if ((state.buildRemaining || 0) > 25000 && reserveRatio < 0.5) score -= 5;

  return {
    key,
    label,
    score: clamp(score, 0, 100),
    reserve,
    harvest,
    logistics,
    reasons,
    metrics: {
      spawnFill,
      storedEnergy,
      reserveTarget,
      reserveRatio,
      sourceRemaining,
      emptySourceRatio,
      historicalEmptyRate,
      historicalHighRate,
      storedSourceEnergy,
      bufferRatio,
      droppedEnergy
    }
  };
};

module.exports = { deriveRoomStatus };
