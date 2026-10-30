'use strict';

// Aggregate dashboard-facing construction and repair activity without making
// the main loop understand how each category is counted.
const collectColonyWorkMetrics = ({
  Game, creeps, roomDemandPlans, getRoomSites, getRoomStructures,
  isOutpostRepairTarget, isOutpostBuilder, isExpansionBuilder, isBuilder,
  REPAIR_POWER
}) => {
  const emptyTotals = () => ({
    buildTargets: 0,
    fixTargets: 0,
    buildRemaining: 0,
    repairEnergy: 0
  });
  const ownedRoomNames = new Set(Object.values(Game.rooms)
    .filter(room => room.controller && room.controller.my)
    .map(room => room.name));
  const local = Object.values(roomDemandPlans || {})
    .reduce((totals, plan) => ({
      buildTargets: totals.buildTargets + (plan.demand.buildTargets || 0),
      fixTargets: totals.fixTargets + (plan.demand.fixTargets || 0),
      buildRemaining: totals.buildRemaining +
        (plan.demand.buildRemaining || 0),
      repairEnergy: totals.repairEnergy + (plan.demand.repairEnergy || 0)
    }), emptyTotals());
  const outpost = Object.values(Game.rooms)
    .filter(room => !ownedRoomNames.has(room.name))
    .reduce((totals, room) => {
      const sites = getRoomSites(room);
      const repairs = getRoomStructures(room).filter(isOutpostRepairTarget);
      return {
        buildTargets: totals.buildTargets + sites.length,
        fixTargets: totals.fixTargets + repairs.length,
        buildRemaining: totals.buildRemaining + sites.reduce((sum, site) =>
          sum + Math.max(0, site.progressTotal - site.progress), 0),
        repairEnergy: totals.repairEnergy + repairs.reduce((sum, structure) =>
          sum + Math.ceil(Math.max(0, structure.hitsMax - structure.hits) /
            REPAIR_POWER), 0)
      };
    }, emptyTotals());
  const roster = creeps || [];
  const hasLane = (creep, lane) => creep.memory.workJob &&
    creep.memory.workJob.lane === lane;
  const buildAssigned = roster.filter(creep =>
    hasLane(creep, 'build') || isOutpostBuilder(creep) ||
    isExpansionBuilder(creep) ||
    ['remote-road', 'remote-container', 'expansion-build']
      .includes(creep.memory.task)).length;
  const repairAssigned = roster.filter(creep =>
    hasLane(creep, 'repair') || isBuilder(creep, 'local', 'repair')).length;
  const buildActive = roster.filter(creep =>
    ['build', 'dig-road', 'remote-road', 'remote-container',
      'expansion-build'].includes(creep.memory.task)).length;
  const repairActive = roster.filter(creep =>
    creep.memory.task === 'repair').length;

  return {
    localBuildTargets: local.buildTargets,
    outpostBuildTargets: outpost.buildTargets,
    localFixTargets: local.fixTargets,
    outpostFixTargets: outpost.fixTargets,
    localBuildRemaining: local.buildRemaining,
    outpostBuildRemaining: outpost.buildRemaining,
    localRepairEnergy: local.repairEnergy,
    outpostRepairEnergy: outpost.repairEnergy,
    buildAssigned,
    buildActive,
    repairAssigned,
    repairActive
  };
};

module.exports = { collectColonyWorkMetrics };
