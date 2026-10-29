'use strict';

const createSourceStaffing = ({
  Game,
  getRoomSources,
  TERRAIN_MASK_WALL,
  LOOK_STRUCTURES,
  LOOK_CONSTRUCTION_SITES,
  OBSTACLE_OBJECT_TYPES,
  BODYPART_COST,
  CARRY,
  MOVE,
  WORK,
  ENERGY_REGEN_TIME,
  HARVEST_POWER
}) => {
  const getSourceSpotCount = (room, source) => {
    const terrain = room.getTerrain();
    let spots = 0;
    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
      for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
        if (x < 0 || x > 49 || y < 0 || y > 49 ||
            (x === source.pos.x && y === source.pos.y) ||
            terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        const blocked = room.lookForAt(LOOK_STRUCTURES, x, y).some(structure =>
          OBSTACLE_OBJECT_TYPES.includes(structure.structureType));
        const blockedSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)
          .some(site => OBSTACLE_OBJECT_TYPES.includes(site.structureType));
        if (!blocked && !blockedSite) spots++;
      }
    }
    return spots;
  };

  const getSourceBodyWorkCapacity = room => {
    const moveParts = room.energyCapacityAvailable >= 350 ? 2 : 1;
    return Math.max(1, Math.floor(
      (room.energyCapacityAvailable - BODYPART_COST[CARRY] -
        moveParts * BODYPART_COST[MOVE]) / BODYPART_COST[WORK]));
  };

  const reviewSourceStaffing = (stats, source, options) => {
    const minimum = Math.max(1, options.minimum || 1);
    const maximum = Math.max(minimum, options.maximum || minimum);
    if (!Number.isInteger(stats.targetMiners)) {
      stats.targetMiners = Math.max(minimum,
        Math.min(maximum, options.initialTarget || minimum));
    }
    if (!Number.isInteger(stats.windowStarted)) {
      stats.windowStarted = Game.time;
    }
    if (stats.lastSampleTick !== Game.time) {
      const elapsed = Number.isInteger(stats.lastSampleTick)
        ? Math.max(1, Math.min(10, Game.time - stats.lastSampleTick))
        : 1;
      stats.lastSampleTick = Game.time;
      stats.sampleTicks = (stats.sampleTicks || 0) + elapsed;
      if (source.energy === 0 && source.ticksToRegeneration > 60) {
        stats.earlyEmptyTicks = (stats.earlyEmptyTicks || 0) + elapsed;
      }
      if (source.energy >= source.energyCapacity * 0.9) {
        stats.highEnergyTicks = (stats.highEnergyTicks || 0) + elapsed;
      }
      if (Number.isFinite(stats.lastEnergy) && stats.lastEnergy > 0 &&
          source.energy > stats.lastEnergy + source.energyCapacity * 0.5) {
        stats.regeneratedWithEnergy =
          (stats.regeneratedWithEnergy || 0) + 1;
      }
      stats.lastEnergy = source.energy;
    }
    if (Game.time - stats.windowStarted >= 1000) {
      const previous = stats.targetMiners;
      const tooMany = (stats.earlyEmptyTicks || 0) >= 60;
      const tooFew = (stats.regeneratedWithEnergy || 0) > 0 ||
        (stats.highEnergyTicks || 0) >= 150;
      if (tooMany && stats.targetMiners > minimum) stats.targetMiners--;
      else if (tooFew && stats.targetMiners < maximum) stats.targetMiners++;
      const result = stats.targetMiners < previous ? 'fewer' :
        stats.targetMiners > previous ? 'more' : 'stable';
      console.log(`[${Game.time}] ${options.label} 1000-tick mining review: ` +
        `${result}, harvesters ${stats.targetMiners}/${maximum}, ` +
        `early-empty ${stats.earlyEmptyTicks || 0}, ` +
        `high-energy ${stats.highEnergyTicks || 0}, ` +
        `partial-regens ${stats.regeneratedWithEnergy || 0}`);
      stats.lastReviewTick = Game.time;
      stats.windowStarted = Game.time;
      stats.sampleTicks = 0;
      stats.earlyEmptyTicks = 0;
      stats.highEnergyTicks = 0;
      stats.regeneratedWithEnergy = 0;
    }
    return Math.max(minimum, Math.min(maximum, stats.targetMiners));
  };

  const getSourceWorkerTargets = (room, sourceSpotCounts) => {
    if (!room.memory.sourceMiningStats) room.memory.sourceMiningStats = {};
    const maxWorkPerBody = getSourceBodyWorkCapacity(room);
    const targets = {};
    const sources = getRoomSources(room);
    for (const source of sources) {
      const stats = room.memory.sourceMiningStats[source.id] ||
        { earlyExhaustions: 0 };
      if (source.energy === 0 && source.ticksToRegeneration > 50) {
        const cycle = Game.time + source.ticksToRegeneration;
        if (stats.lastEarlyCycle !== cycle) {
          stats.lastEarlyCycle = cycle;
          stats.earlyExhaustions = (stats.earlyExhaustions || 0) + 1;
        }
      }
      room.memory.sourceMiningStats[source.id] = stats;
      const spots = sourceSpotCounts[source.id] || 0;
      const sourceIndex = sources.indexOf(source);
      const maximum = spots;
      const requiredWork = Math.ceil(source.energyCapacity /
        ENERGY_REGEN_TIME / HARVEST_POWER);
      const efficientBodies = Math.max(1,
        Math.ceil(requiredWork / maxWorkPerBody));
      const initialTarget = Math.min(maximum, efficientBodies);
      targets[source.id] = reviewSourceStaffing(stats, source, {
        initialTarget,
        minimum: Math.min(maximum, efficientBodies),
        maximum,
        label: `${room.name} S${sourceIndex + 1}`
      });
    }
    return targets;
  };

  const assignUnallocatedRoles = ({
    candidates,
    sourceWorkerCount,
    sourceWorkerLimit,
    haulerCount,
    haulerTarget
  }) => {
    for (const creep of candidates) {
      const hasWork = creep.getActiveBodyparts(WORK) > 0;
      if (creep.memory.sourceReplacement && hasWork) {
        // Replacement bodies reserve a roster slot while travelling. Count
        // that reservation so a second flexible worker is not promoted and
        // released again later in this same allocation pass.
        creep.memory.role = 'harvester';
        sourceWorkerCount++;
      } else if (sourceWorkerCount < sourceWorkerLimit && hasWork) {
        creep.memory.role = 'harvester';
        sourceWorkerCount++;
      } else if (haulerCount < haulerTarget) {
        creep.memory.role = 'hauler';
        haulerCount++;
      } else if (hasWork) {
        const carryParts = creep.getActiveBodyparts(CARRY);
        const workParts = creep.getActiveBodyparts(WORK);
        creep.memory.role = carryParts >= Math.max(2, workParts * 2)
          ? 'hauler' : 'builder';
        if (creep.memory.role === 'builder') {
          creep.memory.builderScope = 'local';
          creep.memory.builderMission = 'flexible';
        }
      } else {
        creep.memory.role = 'hauler';
      }
    }
    return { sourceWorkerCount, haulerCount };
  };

  return {
    getSourceSpotCount,
    getSourceBodyWorkCapacity,
    reviewSourceStaffing,
    getSourceWorkerTargets,
    assignUnallocatedRoles
  };
};

module.exports = { createSourceStaffing };
