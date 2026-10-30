'use strict';

const createMinimumSpawnPlanner = dependencies => {
  const {
    getRoomSources, getSource2TunnelSite, hasBuilderBody, workerCost
  } = dependencies;

  const planMinimumSpawn = options => {
    const {
      room, workers, staffingPlan, replacementCluster, recoveryEnergy,
      refillerMinimumEnergy
    } = options;
    const jobs = staffingPlan.jobs;
    const gap = staffingPlan.minimumGap;
    const haulers = jobs.hauler.members;
    const sourceWorkers = jobs.source.members;
    const result = request => ({ handled: true, request, gap, haulers });
    if (!gap || gap.role === 'rebalancer') {
      return { handled: false, request: null, gap, haulers };
    }
    if (gap.role === 'source') {
      const sourceEntry = getRoomSources(room).map(source => ({
        source,
        count: sourceWorkers.filter(creep =>
          creep.memory.preferredSource === source.id ||
          creep.memory.harvestSource === source.id ||
          creep.memory.sourceReplacement === source.id ||
          creep.memory.sourceReserve === source.id).length
      })).sort((a, b) => a.count - b.count)[0];
      return result(sourceEntry ? {
        role: 'harvester', preferredSource: sourceEntry.source,
        forceSpawn: true, minimumEnergy: recoveryEnergy
      } : null);
    }
    if (gap.role === 'upgrader') {
      return result({
        role: 'upgrader', forceSpawn: true, minimumEnergy: recoveryEnergy
      });
    }
    if (gap.role === 'builder') {
      const convertible = workers.some(creep => !creep.spawning &&
        (creep.memory.role === 'hauler' || creep.memory.role === 'worker') &&
        hasBuilderBody(creep));
      return result(convertible ? null : {
        role: 'builder', builderScope: 'local', builderMission: 'build',
        forceSpawn: true,
        minimumEnergy: Math.min(room.energyCapacityAvailable, workerCost * 4)
      });
    }
    if (gap.role === 'repairBuilder') {
      return result({
        role: 'builder', builderScope: 'local', builderMission: 'repair',
        forceSpawn: true,
        minimumEnergy: Math.min(room.energyCapacityAvailable, workerCost * 4)
      });
    }
    if (gap.role === 'hauler') {
      return result({
        role: 'hauler', forceSpawn: true,
        minimumEnergy: workers.some(creep => creep.memory.role === 'hauler')
          ? room.energyCapacityAvailable : recoveryEnergy
      });
    }
    if (gap.role === 'refiller') {
      return result({
        role: 'refiller', forceSpawn: true,
        refillClusterId: replacementCluster && replacementCluster.id,
        refillClusterX: replacementCluster && replacementCluster.x,
        refillClusterY: replacementCluster && replacementCluster.y,
        refillSpawnOwner: Boolean(replacementCluster &&
          replacementCluster.fillsSpawn),
        refillerFallbackAllowed: true,
        minimumEnergy: refillerMinimumEnergy
      });
    }
    if (gap.role === 'tunnelBuilder') {
      const tunnelSite = getSource2TunnelSite(room);
      return result({
        role: 'builder', builderScope: 'local', builderMission: 'tunnel',
        builderTarget: tunnelSite && tunnelSite.id, forceSpawn: true,
        minimumEnergy: room.energyCapacityAvailable
      });
    }
    return { handled: false, request: null, gap, haulers };
  };

  return { planMinimumSpawn };
};

module.exports = { createMinimumSpawnPlanner };
