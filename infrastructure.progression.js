'use strict';

// This inventory and schedule are shared planning inputs, not spawn authority.
// Visible ownership matters even before the first spawn finishes.
const ownedInfrastructureRooms = rooms => Object.values(rooms)
  .filter(room => room.controller && room.controller.my);

const assessInfrastructureProgression = ({ room, spawns, structures, sites,
  limits, tick, allowSlowPlanning, globalSiteCount, siteCap = 100,
  period = 20, previous = room.memory.infrastructureProgression }) => {
  const level = room.controller.level;
  const signature = `${room.controller.id || room.name}:${level}:` +
    spawns.map(spawn => spawn.id).sort().join(',');
  const changed = !previous || previous.signature !== signature;
  const due = changed || !Number.isFinite(previous?.checked) ||
    tick - previous.checked >= period;
  const inventory = {};
  for (const type of ['spawn', 'extension', 'container', 'road', 'tower',
    'storage', 'link']) {
    const built = structures.filter(s => s.structureType === type &&
      (s.my !== false || ['container', 'road'].includes(type))).length;
    const pending = sites.filter(site => site.structureType === type).length;
    const limit = limits[type]?.[level] || 0;
    inventory[type] = { built, pending, limit,
      missing: Math.max(0, limit - built - pending) };
  }
  // A deferred transition is never acknowledged as checked: retry the moment
  // the gate clears, rather than waiting for another ownership/RCL change.
  const gate = !allowSlowPlanning ? 'cpu-slow-planning-disabled' :
    globalSiteCount >= siteCap ? 'global-construction-cap' :
    !due ? 'periodic-retry-not-due' : null;
  return { signature, changed, due, eligible: due && !gate, gate,
    inventory, retry: gate === 'cpu-slow-planning-disabled'
      ? 'when CPU policy permits slow planning' :
      gate === 'global-construction-cap' ? 'when a global site slot opens' :
      gate === 'periodic-retry-not-due' ? `at tick ${previous.checked + period}` :
      'after this bounded reconciliation',
    spawnCapability: spawns.length ? 'working-spawn' : 'awaiting-first-spawn',
    checked: previous?.checked };
};

module.exports = { ownedInfrastructureRooms, assessInfrastructureProgression };
