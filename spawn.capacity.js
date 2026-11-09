'use strict';

const { calculatePopulationTotals } =
  typeof Game === 'undefined'
    ? require('./population.totals')
    : require('population.totals');

const getEntries = (policy, spawnTicks) => {
  const entries = Object.entries(policy.roles || {}).map(([key, role]) => ({
    key, kind: 'local', target: role,
    minimumKey: 'min', desiredKey: 'desired',
    ticks: Math.max(1, spawnTicks[key] || spawnTicks.worker || 3)
  }));
  const remote = policy.remote || {};
  entries.push(
    { key: 'remoteMiner', kind: 'remote', target: remote,
      minimumKey: 'minersMin', desiredKey: 'miners',
      ticks: Math.max(1, spawnTicks.remoteMiner || 3) },
    { key: 'remoteHauler', kind: 'remote', target: remote,
      minimumKey: 'haulersMin', desiredKey: 'haulers',
      ticks: Math.max(1, spawnTicks.remoteHauler || 3) },
    { key: 'remoteBuilder', kind: 'remote', target: remote,
      minimumKey: 'buildersMin', desiredKey: 'builders',
      ticks: Math.max(1, spawnTicks.remoteBuilder || 3) }
  );
  if (remote.reserversMin || remote.reservers) entries.push({
    key: 'remoteReserver', kind: 'remote', target: remote,
    minimumKey: 'reserversMin', desiredKey: 'reservers',
    // CLAIM bodies live 600 ticks rather than 1500. Charge the conservative
    // 400-tick replacement interval including overlap/travel allowance.
    ticks: Math.ceil(Math.max(1, spawnTicks.remoteReserver || 12) * 1500 / 400)
  });
  return entries;
};

/** Bound sustainable desired population by replacement production capacity. */
const applySpawnCapacityBudget = (policy, spawnTicks, options = {}) => {
  if (!policy) return policy;
  const lifetime = Math.max(1, options.lifetime || 1500);
  const spawnCount = Math.max(1, options.spawnCount || 1);
  const utilization = Math.max(0.5, Math.min(0.95,
    options.utilization == null ? 0.8 : options.utilization));
  const budget = Math.floor(lifetime * spawnCount * utilization);
  const entries = getEntries(policy, spawnTicks || {});
  const auxiliaryLoad = Math.max(0, options.auxiliaryLoad || 0);
  const load = key => auxiliaryLoad + entries.reduce((sum, entry) => sum +
    Math.max(0, entry.target[entry[key]] || 0) * entry.ticks, 0);
  const minimumLoad = load('minimumKey');
  const requestedLoad = load('desiredKey');
  let boundedLoad = requestedLoad;
  const reductions = [];
  // Construction and growth contract before income and survival capability.
  const contractionOrder = ['remoteBuilder', 'builder', 'rebalancer',
    'upgrader', 'remoteHauler', 'hauler', 'repairBuilder', 'refiller',
    'remoteMiner', 'source', 'defender'];
  for (const key of contractionOrder) {
    if (boundedLoad <= budget) break;
    const entry = entries.find(candidate => candidate.key === key);
    if (!entry) continue;
    const minimum = Math.max(0, entry.target[entry.minimumKey] || 0);
    const desired = Math.max(minimum, entry.target[entry.desiredKey] || 0);
    const removable = Math.min(desired - minimum,
      Math.ceil((boundedLoad - budget) / entry.ticks));
    if (removable <= 0) continue;
    entry.target[entry.desiredKey] = desired - removable;
    if (entry.kind === 'local') {
      entry.target.max = Math.max(entry.target.min, entry.target.desired);
    }
    boundedLoad -= removable * entry.ticks;
    reductions.push({ key, from: desired, to: desired - removable,
      savedTicks: removable * entry.ticks });
  }
  policy.totals = calculatePopulationTotals(policy);
  policy.spawnCapacity = { lifetime, spawnCount, utilization, budget,
    minimumLoad, requestedLoad, boundedLoad, auxiliaryLoad, overloaded: minimumLoad > budget,
    reductions };
  return policy;
};

module.exports = { applySpawnCapacityBudget };
