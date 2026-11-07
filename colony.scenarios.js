'use strict';

const record = (key, family, priority, evidence, exitEvidence) => ({
  key, family, priority, evidence, exitEvidence
});

/**
 * Convert already-measured room facts into composable scenario candidates.
 * Candidates describe policy context only; they never request a creep.
 */
const classifyColonyScenarios = facts => {
  const scenarios = [];
  const add = (...args) => scenarios.push(record(...args));

  if (facts.hostileCount > 0) {
    add('active-attack', 'defense', 10,
      [`${facts.hostileCount} hostile creep${facts.hostileCount === 1 ? '' : 's'}`],
      ['hostile count reaches zero']);
  }
  if (facts.cpuMode === 'recovery') {
    add('cpu-emergency', 'transition', 20,
      [`CPU bucket ${facts.cpuBucket}`],
      ['CPU bucket and execution trend recover']);
  }
  if (facts.spawnCapacityOverloaded) {
    add('spawn-capacity-overload', 'transition', 25,
      [`protected replacement load ${facts.minimumSpawnLoad}/${facts.spawnBudget} ticks`],
      ['protected replacement load fits sustainable spawn budget']);
  }
  const observed = Math.max(0, facts.operationalSamples || 0);
  if (observed >= 25 && ((facts.taskFlips || 0) >= 4 ||
      (facts.roleChanges || 0) >= Math.max(5, observed * 0.1))) {
    add('assignment-instability', 'transition', 26,
      [`${facts.taskFlips || 0} harmful task flips`,
        `${facts.roleChanges || 0} role changes in ${observed} samples`],
      ['assignment churn remains below threshold for a complete window']);
  }
  if (observed >= 25 && (facts.stuckTicks || 0) >= observed * 0.5) {
    add('traffic-congestion', 'transition', 27,
      [`${facts.stuckTicks || 0} stuck-creep ticks in ${observed} samples`],
      ['stuck rate remains below threshold for a complete window']);
  }
  if (facts.baselineGap) {
    add('baseline-gap', 'foundation', 30,
      [`missing ${facts.baselineGap.key}`],
      ['all four baseline jobs are viable']);
  }
  if (facts.initialBootstrap) {
    add('initial-bootstrap', 'foundation', 35,
      ['owned spawn lacks a complete sustainable baseline'],
      ['baseline covered', 'spawn recharge reliable']);
  }
  if (facts.postAttackRecovery) {
    const evidence = [];
    if (facts.woundedFriendly) evidence.push('wounded friendly creep');
    if (facts.towerReserveDeficit) evidence.push('tower reserve below floor');
    if (facts.salvageAvailable) evidence.push('battle salvage available');
    if (facts.repairCritical) evidence.push('critical maintained damage');
    add('post-attack-recovery', 'recovery', 40, evidence,
      ['friendlies healed', 'tower reserve restored',
        'critical damage and battle salvage cleared']);
  }
  if (facts.towerReserveDeficit) {
    add('tower-reserve-deficit', 'defense', 45,
      ['threat-active tower reserve below 50%'],
      ['tower reserve restored']);
  }
  if (facts.controllerSupplyDeficit) {
    add('controller-supply-deficit', 'economy', 50,
      [facts.controllerTicks < 3000
        ? `controller ${facts.controllerTicks} ticks from downgrade`
        : 'controller work buffer below target'],
      ['downgrade margin and controller reserve recover']);
  }
  if (facts.refillDeficit) {
    add('refill-deficit', 'economy', 55,
      [`spawn network ${Math.round(facts.energyRatio * 100)}% charged`],
      ['spawn charge and refill latency recover']);
  }
  if (facts.sourceBufferOverflow) {
    add('source-buffer-overflow', 'economy', 60,
      [`source buffer ${Math.round(facts.bufferRatio * 100)}% full`],
      ['source buffers drain at a sustainable rate']);
  }
  if ((facts.remoteBlockedRooms || 0) > 0 ||
      (facts.remoteBacklog || 0) >= 1000 &&
        (facts.remoteHaulerShortfall || 0) > 0) {
    add('remote-hauling-recovery', 'remote', 58,
      [`${Math.round(facts.remoteBacklog || 0)} remote energy waiting`,
        `${Math.round(facts.remoteHaulerShortfall || 0)} authorized carrier slots open`],
      ['remote exports and roster coverage recover']);
  }
  if (facts.repairCritical) {
    add('critical-repair', 'infrastructure', 65,
      [`${Math.round(facts.repairRemaining || 0)} repair hits remaining`],
      ['critical maintained damage clears']);
  }
  if (facts.buildRemaining > 0) {
    add('construction-wave', 'infrastructure', 80,
      [`${Math.round(facts.buildRemaining)} construction progress remaining`],
      ['authorized construction queue clears']);
  }
  if (scenarios.length === 0) {
    add('ordinary-operation', 'economy', 100,
      ['queues and protected thresholds within bounds'],
      ['replaced by stronger observable evidence']);
  }
  return scenarios;
};

/** Preserve entry time while refreshing evidence for the current tick. */
const reconcileScenarioRecords = (previous, candidates, tick) => {
  const previousByKey = new Map((previous || []).map(item => [item.key, item]));
  const unique = new Map();
  for (const candidate of candidates || []) {
    if (!candidate || !candidate.key || unique.has(candidate.key)) continue;
    const prior = previousByKey.get(candidate.key);
    unique.set(candidate.key, {
      key: candidate.key,
      family: candidate.family || 'other',
      priority: Number.isFinite(candidate.priority)
        ? candidate.priority : 100,
      evidence: Array.isArray(candidate.evidence)
        ? candidate.evidence.slice() : [],
      firstSeen: prior && Number.isFinite(prior.firstSeen)
        ? prior.firstSeen : tick,
      lastSeen: tick,
      exitEvidence: Array.isArray(candidate.exitEvidence)
        ? candidate.exitEvidence.slice() : []
    });
  }
  return [...unique.values()].sort((a, b) => a.priority - b.priority ||
    a.key.localeCompare(b.key));
};

module.exports = { classifyColonyScenarios, reconcileScenarioRecords };
