'use strict';

const createRefillManagement = ({
  Game, getRoomStructures, isExtensionClusterTile, getRoomSituation,
  FIND_MY_SPAWNS, STRUCTURE_SPAWN, STRUCTURE_EXTENSION, RESOURCE_ENERGY,
  BODYPART_COST, CARRY, MOVE, CARRY_CAPACITY
}) => {
  const getRefillClusters = room => {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    const extensions = getRoomStructures(room).filter(structure =>
      structure.my && structure.structureType === STRUCTURE_EXTENSION);
    return [
      { id: 'primary', anchor: room.memory.extensionCluster },
      { id: 'overflow', anchor: room.memory.extensionOverflowCluster }
    ].filter(cluster => cluster.anchor && extensions.some(extension =>
      isExtensionClusterTile(cluster.anchor,
        extension.pos.x, extension.pos.y)))
      .map(cluster => ({
        id: cluster.id,
        x: cluster.anchor.x,
        y: cluster.anchor.y,
        spawnRange: spawn
          ? spawn.pos.getRangeTo(cluster.anchor.x, cluster.anchor.y)
          : Infinity
      }))
      .sort((a, b) => a.spawnRange - b.spawnRange ||
        a.id.localeCompare(b.id))
      .map((cluster, index) => ({ ...cluster, fillsSpawn: index === 0 }));
  };

  const isRefillTargetFor = (creep, structure) => {
    if (!creep || creep.memory.role !== 'refiller') return true;
    if (structure.structureType === STRUCTURE_SPAWN) {
      return Boolean(creep.memory.refillSpawnOwner);
    }
    if (structure.structureType !== STRUCTURE_EXTENSION) return false;
    if (!Number.isInteger(creep.memory.refillClusterX) ||
        !Number.isInteger(creep.memory.refillClusterY)) return true;
    return Math.max(
      Math.abs(structure.pos.x - creep.memory.refillClusterX),
      Math.abs(structure.pos.y - creep.memory.refillClusterY)) <= 3;
  };

  const getRefillerCarryFloor = room => Math.min(400,
    Math.floor(room.energyCapacityAvailable /
      (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) * CARRY_CAPACITY);

  const reconcileRefillerClusters = (room, workers) => {
    const clusters = getRefillClusters(room);
    const refillers = workers.filter(creep =>
      creep.memory.role === 'refiller').sort((a, b) =>
      Number(a.spawning) - Number(b.spawning) ||
      b.store.getCapacity(RESOURCE_ENERGY) -
        a.store.getCapacity(RESOURCE_ENERGY) || a.name.localeCompare(b.name));
    const clustersById = Object.fromEntries(clusters.map(cluster =>
      [cluster.id, cluster]));
    const claimed = new Set();
    const assignedNames = new Set();
    for (const creep of refillers) {
      const cluster = clustersById[creep.memory.refillClusterId];
      if (!cluster || claimed.has(cluster.id)) continue;
      claimed.add(cluster.id);
      assignedNames.add(creep.name);
      creep.memory.refillClusterX = cluster.x;
      creep.memory.refillClusterY = cluster.y;
      creep.memory.refillSpawnOwner = cluster.fillsSpawn || undefined;
    }
    for (const creep of refillers.filter(candidate =>
      !assignedNames.has(candidate.name))) {
      const cluster = clusters.filter(candidate => !claimed.has(candidate.id))
        .sort((a, b) => creep.pos.getRangeTo(a.x, a.y) -
          creep.pos.getRangeTo(b.x, b.y) || a.spawnRange - b.spawnRange)[0];
      if (!cluster) {
        delete creep.memory.refillClusterId;
        delete creep.memory.refillClusterX;
        delete creep.memory.refillClusterY;
        delete creep.memory.refillSpawnOwner;
        continue;
      }
      creep.memory.refillClusterId = cluster.id;
      creep.memory.refillClusterX = cluster.x;
      creep.memory.refillClusterY = cluster.y;
      creep.memory.refillSpawnOwner = cluster.fillsSpawn || undefined;
      delete creep.memory.refillTarget;
      delete creep.memory.dispatchCommitment;
      claimed.add(cluster.id);
      assignedNames.add(creep.name);
    }
  };

  const releaseUndersizedRefillers = (room, workers) => {
    const target = getRoomSituation(room).targets.refiller;
    const active = workers.filter(creep => !creep.spawning &&
      creep.memory.role === 'refiller')
      .sort((a, b) =>
        b.store.getCapacity(RESOURCE_ENERGY) -
          a.store.getCapacity(RESOURCE_ENERGY) ||
        b.ticksToLive - a.ticksToLive);
    const keepers = active.slice(0, target);
    const keeperNames = new Set(keepers.map(creep => creep.name));
    for (const creep of active.filter(candidate =>
      !keeperNames.has(candidate.name))) {
      creep.memory.role = 'worker';
      delete creep.memory.promotedFromSource;
      delete creep.memory.refillTarget;
      delete creep.memory.refillPickupTarget;
      delete creep.memory.dispatchCommitment;
      delete creep.memory.working;
      delete creep.memory.task;
      delete creep.memory.taskTarget;
      console.log(`[${Game.time}] ${creep.name} released from refill; ` +
        `${creep.store.getCapacity(RESOURCE_ENERGY)} carry, ` +
        `${keepers.length}/${target} stronger clump owners retained`);
    }
    return keepers;
  };

  return {
    getRefillClusters,
    isRefillTargetFor,
    getRefillerCarryFloor,
    reconcileRefillerClusters,
    releaseUndersizedRefillers
  };
};

module.exports = { createRefillManagement };
