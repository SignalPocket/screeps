'use strict';

const { calculatePopulationTotals } =
  typeof Game === 'undefined'
    ? require('./population.totals')
    : require('population.totals');

// Preserve the existing exported mutation boundary for independent callers.
const recalculateTotals = policy => {
  policy.totals = calculatePopulationTotals(policy);
};

/**
 * Compose observable scenarios into the already-derived room policy.
 * Scenarios may constrain permissions or protect bounded capability, but they
 * never create a spawn request themselves.
 */
const applyScenarioPolicy = (policy, scenarios = []) => {
  if (!policy) return policy;
  const active = new Set(scenarios.map(scenario => scenario.key));
  const prohibitions = [];
  const protections = [];
  const unavailable = [];
  const execution = { preserveAssignments: false, clearTraffic: false };
  const prohibit = (key, reason) => {
    if (policy.permissions && policy.permissions[key]) {
      policy.permissions[key] = false;
    }
    const existing = prohibitions.find(entry => entry.key === key);
    if (existing) {
      if (!existing.reason.includes(reason)) existing.reason += `; ${reason}`;
    } else {
      prohibitions.push({ key, reason });
    }
  };
  const strain = () => {
    if (policy.health === 'healthy' || policy.health === 'surplus') {
      policy.health = 'strained';
    }
  };
  const protect = (roleName, minimum, reason) => {
    const role = policy.roles && policy.roles[roleName];
    if (!role) return;
    role.min = Math.max(role.min || 0, minimum);
    role.desired = Math.max(role.desired || 0, role.min);
    role.max = Math.max(role.max || 0, role.desired);
    protections.push({ role: roleName, minimum: role.min, reason });
  };

  if (active.has('active-attack')) {
    policy.health = 'critical';
    for (const key of ['remoteGrowth', 'controllerBrigade',
      'optionalConstruction', 'optionalPopulation', 'expansion']) {
      prohibit(key, 'active attack');
    }
    policy.remote.miners = policy.remote.minersMin;
    policy.remote.haulers = policy.remote.haulersMin;
    policy.remote.builders = policy.remote.buildersMin;
    protect('defender', 1, 'active owned-room combat threat');
  }
  if (active.has('cpu-emergency')) {
    for (const key of ['remoteGrowth', 'controllerBrigade',
      'optionalConstruction', 'optionalPopulation', 'expansion']) {
      prohibit(key, 'CPU emergency');
    }
  }
  if (active.has('spawn-capacity-overload')) {
    policy.health = 'critical';
    for (const key of ['remoteGrowth', 'controllerBrigade',
      'optionalConstruction', 'optionalPopulation', 'expansion']) {
      prohibit(key, 'protected roster exceeds spawn capacity');
    }
  }
  if (active.has('assignment-instability')) {
    strain();
    execution.preserveAssignments = true;
    prohibit('remoteGrowth', 'assignment instability');
    prohibit('controllerBrigade', 'assignment instability');
    prohibit('optionalPopulation', 'assignment instability');
  }
  if (active.has('traffic-congestion')) {
    strain();
    execution.clearTraffic = true;
    prohibit('remoteGrowth', 'traffic congestion');
    prohibit('optionalPopulation', 'traffic congestion');
  }
  if (active.has('post-attack-recovery') ||
      active.has('tower-reserve-deficit')) {
    prohibit('remoteGrowth', 'post-attack recovery');
    prohibit('controllerBrigade', 'post-attack recovery');
    prohibit('expansion', 'post-attack recovery');
  }
  if (active.has('controller-supply-deficit')) {
    protect('upgrader', 1, 'controller supply deficit');
  }
  if (active.has('critical-repair')) {
    protect('repairBuilder', 1, 'critical maintained damage');
  }
  if (active.has('source-buffer-overflow')) {
    const hauler = policy.roles && policy.roles.hauler;
    if (hauler) {
      hauler.desired = Math.max(hauler.desired, hauler.min + 1);
      hauler.max = Math.max(hauler.max, hauler.desired);
      protections.push({ role: 'hauler', minimum: hauler.min,
        reason: 'source buffer overflow adds desired hauling only' });
    }
  }
  if (active.has('remote-hauling-recovery')) {
    strain();
    prohibit('remoteGrowth', 'remote hauling recovery');
    prohibit('optionalConstruction', 'remote hauling recovery');
    prohibit('optionalPopulation', 'remote hauling recovery');
    policy.remote.miners = policy.remote.minersMin;
    policy.remote.builders = policy.remote.buildersMin;
  }

  recalculateTotals(policy);
  policy.scenarioDecision = {
    active: scenarios.map(scenario => scenario.key),
    prohibitions,
    protections,
    unavailable,
    execution
  };
  return policy;
};

module.exports = { applyScenarioPolicy, recalculateTotals };
