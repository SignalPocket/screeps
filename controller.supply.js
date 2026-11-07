'use strict';

// Read-only evidence: resolved controller progress is measured; endpoint creep
// state is context, never a reconstruction of every intervening action.
const captureSupply = (database, user) => {
  if (typeof user !== 'string' || !user) throw Error('Require explicit user');
  const rows = name => database.collections?.find(c => c.name === name)?.data || [];
  const env = rows('env')[0]?.data;
  if (!Number.isSafeInteger(env?.gameTime)) throw Error('Missing authoritative tick');
  if (typeof env[`memory:${user}`] !== 'string') throw Error('Missing user memory');
  const memory = JSON.parse(env[`memory:${user}`]);
  const objects = rows('rooms.objects');
  const rooms = {};
  for (const controller of objects.filter(o => o.type === 'controller' && o.user === user)) {
    if (rooms[controller.room]) throw Error('Ambiguous room controller');
    const room = memory.rooms?.[controller.room] || {};
    const execution = memory.cpuPolicy?.execution;
    const freshExecution = execution?.updated === env.gameTime - 1 ||
      execution?.updated === env.gameTime;
    const deferred = new Set(freshExecution ?
      (execution.deferredCreeps || []).map(c => c.name) : []);
    const categories = {};
    let activeWork = 0;
    let boosted = false;
    for (const creep of objects.filter(o => o.type === 'creep' && o.user === user)) {
      const m = memory.creeps?.[creep.name] || {};
      // Include workers assigned to upgrading as well as dedicated upgraders;
      // home assignment alone does not mean a remote creep is in this room.
      if (creep.room !== controller.room ||
          !(m.role === 'upgrader' || m.demandLane === 'upgrade' ||
            ['upgrade', 'urgent-upgrade'].includes(m.task))) continue;
      const work = (creep.body || []).filter(p => p.type === 'work' && p.hits > 0);
      activeWork += work.length;
      boosted ||= work.some(p => p.boost);
      const range = Math.max(Math.abs(creep.x - controller.x), Math.abs(creep.y - controller.y));
      let category = 'unknown';
      if (creep.spawning || !Number.isFinite(creep.ageTime)) category = 'spawning';
      else if (deferred.has(creep.name)) category = 'cpu-deferred';
      else if (m.energyBudgetHeld) category = 'budget-wait';
      else if ((creep.store?.energy || 0) === 0) category = 'empty-energy';
      else if (!work.length) category = 'no-active-work';
      else if (range > 3 && creep.fatigue > 0) category = 'fatigue';
      else if (range > 3 && m.navStuck > 0) category = 'blocked-access-signal';
      else if (range > 3) category = 'travel-needed';
      else if (['upgrade', 'urgent-upgrade'].includes(m.task)) category = 'upgrade-ready';
      categories[category] = (categories[category] || 0) + 1;
    }
    const plan = room.laborPlan;
    rooms[controller.room] = {
      controllerId: controller._id, level: controller.level,
      progress: Number.isFinite(controller.progress) ? controller.progress : null,
      laborBudget: Number.isFinite(plan?.upgradeBudget) && plan.upgradeBudget >= 0
        ? plan.upgradeBudget : null,
      budgetUpdated: Number.isSafeInteger(plan?.updated) ? plan.updated : null,
      activeWork, boosted, categories,
      cpuEvidenceTick: freshExecution ? execution.updated : null
    };
  }
  return { version: 1, user, tick: env.gameTime, rooms };
};

const compareSupply = (before, after) => {
  if (before.version !== 1 || after.version !== 1 || before.user !== after.user)
    throw Error('Require matching version and user');
  if (!Number.isSafeInteger(before.tick) || !Number.isSafeInteger(after.tick) ||
      after.tick <= before.tick) throw Error('Require advancing ticks');
  const ticks = after.tick - before.tick;
  const rooms = {};
  for (const [name, current] of Object.entries(after.rooms)) {
    const old = before.rooms[name];
    let unknown = null;
    if (!old) unknown = 'no earlier controller';
    else if (!old.controllerId || old.controllerId !== current.controllerId)
      unknown = 'controller identity changed';
    else if (old.level !== current.level) unknown = 'controller level changed';
    else if (current.level === 8) unknown = 'RCL8 progress cannot measure upgrading';
    else if (!Number.isFinite(old.progress) || !Number.isFinite(current.progress) ||
      current.progress < old.progress) unknown = 'missing or reset progress';
    const progressPerTick = unknown ? null : (current.progress - old.progress) / ticks;
    rooms[name] = {
      ticks, progressDelta: unknown ? null : current.progress - old.progress,
      progressPerTick, unknown,
      laborBudgetEndpoints: [old?.laborBudget ?? null, current.laborBudget],
      budgetUpdatedEndpoints: [old?.budgetUpdated ?? null, current.budgetUpdated],
      categoriesBefore: old?.categories || null, categoriesAfter: current.categories,
      activeWorkEndpoints: [old?.activeWork ?? null, current.activeWork],
      boostedAtEndpoints: Boolean(old?.boosted || current.boosted),
      limits: 'Progress per tick is resolved room output; labor budgets are endpoint energy/tick plans, not integrated caps. Boosts, emergency bypasses, policy changes and unobserved ticks prevent causal or energy-efficiency attribution. Categories are endpoint observations; upgrade-ready is not successful upgrading and blocked-access-signal is not a proven obstruction.'
    };
  }
  return { user: after.user, fromTick: before.tick, toTick: after.tick, rooms };
};

module.exports = { captureSupply, compareSupply };
