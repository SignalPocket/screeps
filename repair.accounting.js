'use strict';

const { createOutpostMaintenance } = require('./outpost.maintenance');
const { planRepairSupply } = require('./repair.supply');
const maintenance = createOutpostMaintenance({
  STRUCTURE_CONTAINER: 'container', STRUCTURE_ROAD: 'road'
});
const assets = sample => sample.objects.filter(o =>
  ['road', 'container'].includes(o.type) && Number.isFinite(o.hits) && o.hitsMax > 0);
const normalized = o => ({ ...o, id: o._id, structureType: o.type });
const range = (a, b) => a && b && a.room === b.room &&
  [a.x, a.y, b.x, b.y].every(Number.isFinite)
  ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) : null;

// Offline endpoint accounting only: task labels and hit deltas are not action logs.
const accountRepairs = (before, after) => {
  if (!Number.isInteger(before.tick) || !Number.isInteger(after.tick) ||
      after.tick <= before.tick) throw Error('Need advancing integer ticks');
  const elapsed = after.tick - before.tick;
  const old = new Map(assets(before).map(o => [o._id, o]));
  const previousCreeps = new Map(before.roles.map(c => [c.name, c]));
  const objects = new Map(after.objects.map(o => [o._id, o]));
  const all = assets(after).map(o => {
    const previous = old.get(o._id);
    const comparable = previous && previous.room === o.room && previous.type === o.type &&
      previous.hitsMax === o.hitsMax;
    const netHits = comparable ? o.hits - previous.hits : null;
    return { id: o._id, room: o.room, type: o.type, hits: o.hits, hitsMax: o.hitsMax,
      ratio: o.hits / o.hitsMax,
      rescueTriggerGeometry: o.type === 'container' && o.hits < o.hitsMax * .25,
      maintenanceStartGeometry: maintenance.needsMaintenance([normalized(o)]),
      maintenanceFinishGeometry: maintenance.isRepairTarget(normalized(o)),
      emergencyRunnerFinishGeometry: o.hits < o.hitsMax * .8,
      netHits, netHitsPerTick: netHits === null ? null : netHits / elapsed };
  });
  const crews = after.roles.filter(c => c.memory &&
    (c.memory.emergencyRepairRoom || c.memory.builderMission === 'repair' ||
      /repair/.test(c.memory.task || '') || c.memory.repairWorkTarget)).map(c => {
    const m = c.memory, wait = m.waitAge;
    const freshWait = wait && wait.updated === after.tick;
    const targetId = m.taskTarget;
    const target = objects.get(targetId);
    const distance = range(c, target);
    const energy = c.store?.energy || 0;
    const phase = freshWait && wait.state === 'cpu-deferred' ? 'cpu-deferred' :
      freshWait && wait.state === 'budget' ? 'budget-held' :
      m.repairLoading || m.task === 'repair-load' ? 'supply-assignment' :
      distance !== null && distance > 3 ? 'outside-repair-range' :
      energy === 0 ? 'empty-carry' : 'repair-assignment-unconfirmed';
    return { name: c.name, room: c.room, emergencyRoom: m.emergencyRepairRoom || null,
      task: m.task || null, energy, phase, taskTarget: targetId || null,
      targetRange: distance,
      targetIsRepairAsset: Boolean(target && ['road', 'container'].includes(target.type)),
      freshWait: freshWait ? { state: wait.state, age: wait.age, reason: wait.reason } : null,
      endpointDisplacement: range(c, previousCreeps.get(c.name)),
      workParts: (c.body || []).filter(p => p.type === 'work' && p.hits > 0).length };
  });
  const roomNames = [...new Set(all.map(o => o.room))].sort();
  return { ticks: [before.tick, after.tick], elapsed,
    thresholds: { rescueContainer: .25, localCrisisGeometry: .35,
      localBacklogGeometry: .75, emergencyRunnerFinish: .8,
      note: 'Geometry only; surveys, ownership, maintained routes, policy and visibility still gate eligibility.' },
    rooms: roomNames.map(room => {
      const roomAssets = assets(after).filter(o => o.room === room).map(normalized);
      const storedPlan = after.rooms?.[room]?.repairSupplyPlan;
      return { room, assetCount: roomAssets.length,
        netHitChange: all.filter(o => o.room === room && o.netHits !== null)
          .reduce((sum, o) => sum + o.netHits, 0),
        matchedAssets: all.filter(o => o.room === room && o.netHits !== null).length,
        geometricSupplyEstimate: planRepairSupply({ structures: roomAssets }),
        storedSupplyPlan: storedPlan || null,
        storedPlanAge: Number.isInteger(storedPlan?.updated) ? after.tick - storedPlan.updated : null,
        rescueGeometryCount: all.filter(o => o.room === room && o.rescueTriggerGeometry).length };
    }),
    totals: { assets: all.length, matched: all.filter(o => o.netHits !== null).length,
      damaged: all.filter(o => o.hits < o.hitsMax).length, crews: crews.length },
    assets: all.sort((a, b) => a.ratio - b.ratio || a.id.localeCompare(b.id)).slice(0, 100),
    crews: crews.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50),
    omitted: { assets: Math.max(0, all.length - 100), crews: Math.max(0, crews.length - 50) },
    limits: 'All captured road/container objects are included, regardless of current vision, ownership or maintenance eligibility. Net hit change combines repair, attacks and decay; gross repair throughput and energy spent are unknown. Endpoint displacement is a lower bound, not travel ticks or path cost. Labels, range and empty carry do not prove repair, movement or starvation. Missing assets may be destroyed or invisible. Different thresholds alone do not prove conflicting policy. No continuous activity or gameplay improvement is established.' };
};

module.exports = { accountRepairs };
