'use strict';
const { getSpawnQueueWait } = typeof Game === 'undefined'
  ? require('./spawn.queue') : require('spawn.queue');

const isBootstrapWorker = (creep, roomName) => Boolean(creep &&
  creep.memory.role === 'builder' &&
  creep.memory.builderScope === 'expansion' &&
  creep.memory.expansionTarget === roomName && !creep.memory.staffingRetire);

const planBootstrapSpawn = ({ room, workers, Game, permitted,
  hasSpawn, spawnTime = 3 }) => {
  const plan = room.memory.expansionPlan;
  const target = plan && Game.rooms[plan.targetRoom];
  if (!permitted || !target || !target.controller?.my || hasSpawn(target) ||
      !['bootstrap', 'bootstrap-paused'].includes(plan.status)) return null;
  const route = Game.map.findRoute(room.name, target.name);
  const travel = (Array.isArray(route) ? route.length : 1) * 75;
  const queued = getSpawnQueueWait(Game.spawns, room.name);
  const crew = workers.filter(creep => isBootstrapWorker(creep, target.name));
  const viable = crew.filter(creep => creep.spawning || creep.ticksToLive >
    creep.body.length * spawnTime + travel + queued + 50);
  const desired = Math.max(1, Math.min(3,
    Math.ceil(room.energyCapacityAvailable / 600)));
  if (viable.length >= desired) return null;
  return { role: 'builder', builderScope: 'expansion',
    builderMission: 'bootstrap', expansionTarget: target.name,
    bootstrapMaintenance: true, forceSpawn: true };
};

// Pioneers own a complete gather/work cycle while the claimed room has no
// spawn or mature local workforce to supply a useful local dispatch plan.
const selectBootstrapWork = ({ creep, controller, crew, sources, stores,
  sites, structures, closest, harvestFits, resource = 'energy' }) => {
  const energy = creep.store[resource] || 0;
  const source = closest(sources.filter(source => source.energy > 0));
  if (energy === 0 && creep.memory.expansionBuilding) {
    creep.memory.bootstrapLoad = (creep.memory.bootstrapLoad || 0) + 1;
  }
  if (energy === 0) creep.memory.expansionBuilding = false;
  if (energy > 0 && (creep.store.getFreeCapacity(resource) === 0 ||
      !source || !harvestFits(source))) creep.memory.expansionBuilding = true;
  if (!creep.memory.expansionBuilding) {
    const store = closest(stores.filter(store => (store.store[resource] || 0) > 0));
    if (store) return { action: 'withdraw', target: store, range: 1 };
    if (source) return { action: 'harvest', target: source, range: 1 };
  }
  if (energy === 0) return { action: 'wait' };
  if (controller?.my && controller.ticksToDowngrade < 3000) {
    return { action: 'upgrade', target: controller, range: 3 };
  }
  const repair = closest(structures.filter(structure =>
    ['container', 'road'].includes(structure.structureType) &&
    structure.hits < Math.min(5000, structure.hitsMax * 0.2)));
  if (repair) return { action: 'repair', target: repair, range: 3 };
  const present = crew.filter(other => isBootstrapWorker(other,
    creep.memory.expansionTarget) && !other.spawning &&
    other.room.name === creep.room.name).sort((a, b) => a.name.localeCompare(b.name));
  const index = present.findIndex(other => other.name === creep.name);
  const spawn = sites.find(site => site.structureType === 'spawn');
  // Establish RCL2 first; then keep one controller worker. A lone pioneer
  // reserves one load in four for upgrading and the rest for its spawn.
  if (controller?.my && (controller.level < 2 ||
      controller.ticksToDowngrade < 5000 ||
      index === 0 && (present.length > 1 ||
        (creep.memory.bootstrapLoad || 0) % 4 === 0))) {
    return { action: 'upgrade', target: controller, range: 3 };
  }
  if (index >= 2) {
    const maintenance = closest(structures.filter(structure =>
      ['container', 'road'].includes(structure.structureType) &&
      structure.hits < structure.hitsMax * 0.75));
    if (maintenance) return { action: 'repair', target: maintenance, range: 3 };
  }
  if (spawn) return { action: 'build', target: spawn, range: 3 };
  const site = closest(sites);
  if (site) return { action: 'build', target: site, range: 3 };
  return controller?.my ? { action: 'upgrade', target: controller, range: 3 }
    : { action: 'wait' };
};

module.exports = { isBootstrapWorker, planBootstrapSpawn, selectBootstrapWork };
