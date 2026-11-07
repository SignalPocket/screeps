'use strict';

// Diagnostic only. Nothing here admits work, moves a creep or changes a task.
const PROLONGED_TICKS = 100;
const bounded = value => {
  const text = String(value ?? '');
  if (text.length <= 160) return text;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return text.slice(0, 140) + '#' + hash.toString(16);
};

const createWaitAgeTracker = tick => {
  const evaluated = new Set();
  const overrides = new Set();
  const tired = new Set();
  const markEvaluated = (creep, override = false) => {
    evaluated.add(creep.name);
    if (override) overrides.add(creep.name);
  };
  const wrapMovement = (move, ERR_TIRED) => (...args) => {
    const result = move(...args);
    if (result === ERR_TIRED) tired.add(args[0].name);
    return result;
  };
  const describe = creep => {
    const memory = creep.memory;
    if (!evaluated.has(creep.name)) return {
      state: 'cpu-deferred', authority: 'cpu', target: '',
      reason: 'execution ceiling reached before evaluation',
      retry: 'next admitted execution tick'
    };
    // Final defense/healing/flee decisions supersede stale ordinary wait flags.
    if (!overrides.has(creep.name)) {
      if (memory.energyBudgetHeld) return {
        state: 'budget', authority: 'policy', target: memory.taskTarget,
        reason: memory.energyBudgetReason || 'controller spending budget',
        retry: 'spending budget admits the selected work'
      };
      if (memory.waitState) return {
        state: memory.waitState, authority: 'assignment',
        target: memory.taskTarget,
        reason: memory.waitReason || 'no executable assignment',
        retry: 'assignment reason or target changes, or work resumes'
      };
    }
    if (tired.has(creep.name)) return {
      state: 'fatigue', authority: 'movement', target: memory.taskTarget,
      reason: 'movement returned ERR_TIRED; other work may still execute',
      retry: 'fatigue clears and movement is retried'
    };
    return null;
  };
  const finish = creeps => {
    const summary = { updated: tick, total: 0, prolonged: 0,
      threshold: PROLONGED_TICKS, states: {}, authorities: {}, longest: [] };
    for (const creep of creeps) {
      const memory = creep.memory;
      const wait = !creep.spawning && describe(creep);
      if (!wait) {
        delete memory.waitAge;
        continue;
      }
      const identity = { room: bounded(creep.room.name), role: bounded(memory.role),
        state: bounded(wait.state), authority: wait.authority,
        reason: bounded(wait.reason), target: bounded(wait.target) };
      const previous = memory.waitAge;
      const same = previous && Object.keys(identity).every(key =>
        previous[key] === identity[key]);
      // Missing ticks/reloads cannot prove continuous observation; never backdate.
      const continuous = same && Number.isInteger(previous.since) &&
        previous.since >= 0 && previous.since <= tick &&
        (previous.updated === tick - 1 || previous.updated === tick);
      const since = continuous ? previous.since : tick;
      const record = { ...identity, since, updated: tick,
        age: tick - since, prolonged: tick - since >= PROLONGED_TICKS,
        retry: wait.retry, fatigue: Math.max(0, Number(creep.fatigue) || 0),
        evaluated: evaluated.has(creep.name),
        movementTired: tired.has(creep.name) };
      memory.waitAge = record;
      summary.total++;
      if (record.prolonged) summary.prolonged++;
      summary.states[record.state] = (summary.states[record.state] || 0) + 1;
      summary.authorities[record.authority] =
        (summary.authorities[record.authority] || 0) + 1;
      summary.longest.push({ name: bounded(creep.name), ...record });
      summary.longest.sort((a, b) => b.age - a.age || a.name.localeCompare(b.name));
      if (summary.longest.length > 10) summary.longest.length = 10;
    }
    return summary;
  };
  return { markEvaluated, wrapMovement, finish };
};

module.exports = { createWaitAgeTracker, PROLONGED_TICKS };
