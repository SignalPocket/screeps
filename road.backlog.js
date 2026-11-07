'use strict';
const getRoadBacklog = (plan, structures, sites) => {
  const key = p => `${p.x}:${p.y}`;
  const roads = structures.filter(s => s.structureType === 'road');
  const built = new Set(roads.map(s => key(s.pos)));
  const queued = new Set(sites.map(s => key(s.pos)));
  const points = Object.values(plan?.tiles || {});
  const missing = points.filter(p => !built.has(key(p)));
  const unqueued = missing.filter(p => !queued.has(key(p))).length;
  const maintained = roads.filter(s => plan?.tiles?.[key(s.pos)]);
  return { planned: points.length, built: points.length - missing.length,
    missing: missing.length, unqueued,
    critical: maintained.filter(s => s.hits < s.hitsMax * 0.25).length,
    repairHits: maintained.reduce((n,s) => n + Math.max(0,
      s.hitsMax * 0.75 - s.hits), 0),
    unqueuedBuildLowerBound: unqueued * 300 };
};
module.exports = { getRoadBacklog };
