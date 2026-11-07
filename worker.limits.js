'use strict';

const createWorkerLimits = ({
  Game, getRoomSources, getRoomCreeps, getSourceWorkerTargets,
  getRoomSituation, LOOK_STRUCTURES, LOOK_CONSTRUCTION_SITES,
  OBSTACLE_OBJECT_TYPES, STRUCTURE_ROAD, STRUCTURE_RAMPART,
  TERRAIN_MASK_WALL
}) => {
  const cache = {};

  /**
   * Collapse policy role targets into total population budgets.
   * Geometry is diagnostic here; it must not increase remote or role demand
   * beyond the policy snapshot. Results are cached briefly to avoid repeating
   * source-tile scans on every consumer path.
   */
  const getWorkerLimits = room => {
    if (cache[room.name]) return cache[room.name];
    // Count each usable source-adjacent tile once, assigning shared tiles to
    // their nearest source.
    const sources = getRoomSources(room);
    const spotOwners = {};
    const spotDistances = {};
    const terrain = room.getTerrain();
    for (const source of sources) {
      for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
        for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
          if (x === source.pos.x && y === source.pos.y || x < 0 || x > 49 ||
              y < 0 || y > 49) continue;
          const tileStructures = room.lookForAt(LOOK_STRUCTURES, x, y);
          const completedTunnelRoad = tileStructures.some(structure =>
            structure.structureType === STRUCTURE_ROAD);
          if (terrain.get(x, y) === TERRAIN_MASK_WALL &&
              !completedTunnelRoad) continue;
          const blocked = tileStructures.some(structure =>
            OBSTACLE_OBJECT_TYPES.includes(structure.structureType) &&
            !(structure.structureType === STRUCTURE_RAMPART &&
              (structure.my || structure.isPublic)));
          const blockedSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)
            .some(site => OBSTACLE_OBJECT_TYPES.includes(site.structureType));
          const key = `${x}:${y}`;
          if (blocked || blockedSite) continue;
          const distance = source.pos.getRangeTo(x, y);
          if (spotDistances[key] === undefined || distance < spotDistances[key]) {
            spotOwners[key] = source.id;
            spotDistances[key] = distance;
          }
        }
      }
    }
    const sourceSpotCounts = Object.fromEntries(
      sources.map(source => [source.id, 0]));
    for (const sourceId of Object.values(spotOwners)) {
      sourceSpotCounts[sourceId]++;
    }
    const sourceSpotTotal = Object.values(sourceSpotCounts)
      .reduce((total, count) => total + count, 0);
    const minerLimit = Math.min(20, sourceSpotTotal);
    const sourceWorkerTargets = getSourceWorkerTargets(room, sourceSpotCounts);
    const sourceWorkerTargetTotal = Object.values(sourceWorkerTargets)
      .reduce((total, count) => total + count, 0);
    const situation = getRoomSituation(room);
    const targets = situation.targets;
    const roles = situation.policy.roles;
    const policyLocalWorkerMinimum = roles.source.min + roles.builder.min +
      roles.repairBuilder.min + roles.upgrader.min + roles.hauler.min +
      roles.refiller.min + roles.rebalancer.min + roles.tunnelBuilder.min;
    const defenseMinimum = roles.defender ? roles.defender.min : 0;
    // An owned spawn room always budgets the invariant miner, upgrader,
    // filler, and builder/fixer roster even when queue-derived policy puts a
    // role (especially the idle builder/fixer) at zero for this tick.
    const baselineWorkerMinimum = room.controller && room.controller.my
      ? 4 : 0;
    const localWorkerMinimum = Math.max(baselineWorkerMinimum,
      policyLocalWorkerMinimum + defenseMinimum);
    const localWorkerDesired = roles.source.desired + targets.builder +
      targets.repairBuilder + targets.upgrader + targets.hauler +
      targets.refiller + targets.rebalancer + targets.tunnelBuilder;
    const desiredDefense = roles.defender ? roles.defender.desired : 0;
    const remote = situation.policy.remote || {};
    const maintainRemotes = Boolean(situation.policy.permissions &&
      situation.policy.permissions.remoteMaintenance);
    const allowRemoteGrowth = Boolean(situation.policy.permissions &&
      situation.policy.permissions.remoteGrowth);
    const allowRemoteHaulingRecovery = Boolean(
      situation.policy.permissions &&
      situation.policy.permissions.remoteHaulingRecovery);
    const remoteWorkerMinimum = (remote.minersMin || 0) +
      (remote.haulersMin || 0) + (remote.buildersMin || 0) +
      (remote.reserversMin || 0);
    const remoteWorkerDesired = (remote.miners || 0) +
      (remote.haulers || 0) + (remote.builders || 0) + (remote.reservers || 0);
    const minimumWorkerLimit = localWorkerMinimum + remoteWorkerMinimum;
    const desiredWorkerLimit = Math.max(minimumWorkerLimit,
      localWorkerDesired + desiredDefense + remoteWorkerDesired);
    const remoteHaulingRecoveryAllowance = allowRemoteHaulingRecovery
      ? Math.max(0, (remote.haulers || 0) - (remote.haulersMin || 0)) : 0;
    const workerLimit = situation.policy.permissions &&
      situation.policy.permissions.optionalPopulation
      ? desiredWorkerLimit
      : minimumWorkerLimit + remoteHaulingRecoveryAllowance;
    room.memory.workerTarget = workerLimit;
    room.memory.populationRoutingVersion = 'state-policy-v4';
    const congestionCount = getRoomCreeps(room).filter(creep =>
      (creep.memory.navStuck || 0) >= 2 &&
      creep.memory.navLastTick >= Game.time - 1).length;
    room.memory.congestionCount = congestionCount;
    const result = {
      sourceSpotCounts,
      sourceWorkerTargets,
      sourceWorkerTargetTotal,
      sourceSpotTotal,
      minerLimit,
      baselineWorkerMinimum,
      policyLocalWorkerMinimum,
      localWorkerMinimum,
      maintainRemotes,
      allowRemoteGrowth,
      allowRemoteHaulingRecovery,
      remoteHaulingRecoveryAllowance,
      remoteWorkerMinimum,
      minimumWorkerLimit,
      desiredWorkerLimit,
      workerLimit
    };
    cache[room.name] = result;
    room.memory.workerLimitsPlan = { updated: Game.time, result };
    return result;
  };

  return { getWorkerLimits };
};

module.exports = { createWorkerLimits };
