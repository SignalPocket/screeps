'use strict';

const { createOperationalColonyScope, observation } =
  typeof Game === 'undefined'
    ? require('./colony.scope')
    : require('colony.scope');

const finite = value => Number.isFinite(value) ? value : null;
const integer = value => Number.isSafeInteger(value) ? value : null;
const sumKnown = values => values.every(value => value !== null)
  ? values.reduce((sum, value) => sum + value, 0) : null;
const latestRecord = history => history && Array.isArray(history.records)
  ? history.records[history.records.length - 1] || null : null;
const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const networkRecoveryNeeded = ({ energy, capacity, previous = false }) =>
  capacity > 0 && energy < capacity * (previous ? 1 : 0.9);

const homePickupCandidates = ({ creep, candidates, planned,
  isSpawnReserve, isSourceBuffer }) => {
  if (creep.memory.role !== 'hauler' || creep.memory.refillSpecialist) {
    return candidates;
  }
  const available = candidates.filter(structure => !isSpawnReserve(structure));
  if (!planned) return available;
  const assigned = planned.store
    ? available.filter(structure => structure.id === planned.id)
    : available.filter(structure => isSourceBuffer(structure, planned));
  return assigned.length ? assigned : available;
};

const safeFind = (room, type) => {
  if (!room || type == null || typeof room.find !== 'function') return null;
  try {
    const found = room.find(type);
    return Array.isArray(found) ? found : null;
  } catch (error) {
    return null;
  }
};
const storedEnergy = (object, resource) => {
  if (!object || !object.store) return 0;
  return finite(object.store[resource]) ?? 0;
};
const knownSum = (objects, getValue) => {
  const values = objects.map(getValue);
  return values.every(value => finite(value) !== null)
    ? values.reduce((sum, value) => sum + value, 0) : null;
};
const defaultRepairTarget = structure => structure &&
  finite(structure.hits) !== null && finite(structure.hitsMax) !== null &&
  structure.hits < structure.hitsMax &&
  !['constructedWall', 'wall', 'rampart'].includes(structure.structureType);

const liveEnergy = ({ room, findSources, findDroppedResources,
  findStructures, resourceEnergy, consumerStructureTypes }) => {
  const sources = safeFind(room, findSources);
  const drops = safeFind(room, findDroppedResources);
  const structures = safeFind(room, findStructures);
  if (sources === null || drops === null || structures === null) return null;
  const harvestable = knownSum(sources, source => source.energy);
  const energyDrops = drops.filter(drop =>
    drop && drop.resourceType === resourceEnergy);
  const dropped = knownSum(energyDrops, drop => drop.amount);
  const stored = structures.reduce((sum, structure) =>
    sum + storedEnergy(structure, resourceEnergy), 0);
  const withdrawable = structures.filter(structure =>
    !consumerStructureTypes.has(structure.structureType))
    .reduce((sum, structure) =>
      sum + storedEnergy(structure, resourceEnergy), 0);
  return {
    available: sumKnown([harvestable, dropped, stored]),
    collectable: sumKnown([harvestable, dropped, withdrawable]),
    harvestable,
    dropped,
    stored,
    withdrawable
  };
};

const liveWork = ({ room, findStructures, findConstructionSites,
  isRepairTarget, repairPower }) => {
  const structures = safeFind(room, findStructures);
  const sites = safeFind(room, findConstructionSites);
  if (structures === null || sites === null) return null;
  const repairs = structures.filter(isRepairTarget);
  const repairEnergy = Number.isFinite(repairPower) && repairPower > 0
    ? repairs.reduce((sum, structure) => sum + Math.ceil(
      Math.max(0, structure.hitsMax - structure.hits) / repairPower), 0)
    : null;
  const constructionRemaining = sites.every(site =>
    finite(site && site.progress) !== null &&
    finite(site && site.progressTotal) !== null)
    ? sites.reduce((sum, site) => sum + Math.max(0,
      site.progressTotal - site.progress), 0) : null;
  return {
    repairTargets: repairs.length,
    repairEnergy,
    constructionTargets: sites.length,
    constructionRemaining
  };
};

const metricObservation = (value, updated, tick, current, source) =>
  value === null ? observation(null, tick)
    : observation(updated, tick, current, source);

const collectOperationalRoomHealth = ({ Game = {}, Memory = {},
  findSources, findDroppedResources, findStructures,
  findConstructionSites, resourceEnergy = 'energy', repairPower = 100,
  isRepairTarget = defaultRepairTarget,
  consumerStructureTypes = ['spawn', 'extension', 'tower'] } = {}) => {
  const scope = createOperationalColonyScope({ Game, Memory });
  const tick = integer(Game && Game.time);
  const gameRooms = Game && Game.rooms && typeof Game.rooms === 'object'
    ? Game.rooms : {};
  const memoryRooms = Memory && Memory.rooms && typeof Memory.rooms === 'object'
    ? Memory.rooms : {};
  const consumers = new Set(Array.isArray(consumerStructureTypes)
    ? consumerStructureTypes : []);
  const rows = scope.rows.map(scopeRow => {
    const room = gameRooms[scopeRow.roomName] || null;
    const memory = room && room.memory || memoryRooms[scopeRow.roomName] || {};
    const demand = memory.demandPlan || null;
    const trend = latestRecord(memory.roomTrendHistory);
    const status = memory.roomStatus || null;
    const combat = memory.combatStatus || null;
    const measuredEnergy = room ? liveEnergy({ room, findSources,
      findDroppedResources, findStructures, resourceEnergy,
      consumerStructureTypes: consumers }) : null;
    const measuredWork = room ? liveWork({ room, findStructures,
      findConstructionSites, isRepairTarget, repairPower }) : null;
    const available = measuredEnergy
      ? measuredEnergy.available : finite(trend && trend.stored);
    const collectable = measuredEnergy
      ? measuredEnergy.collectable : finite(demand && demand.sourceStored);
    const repairEnergy = measuredWork
      ? measuredWork.repairEnergy
      : finite(demand && demand.repairEnergy) ?? finite(trend && trend.repair);
    const constructionRemaining = measuredWork
      ? measuredWork.constructionRemaining
      : finite(demand && demand.buildRemaining) ?? finite(trend && trend.build);
    const workBasis = measuredWork ? 'live construction and repair targets'
      : demand ? 'remembered demand plan'
        : trend ? 'remembered room trend' : 'unknown';
    const workTick = measuredWork ? tick
      : integer(demand && demand.tick) ?? integer(trend && trend.tick);
    const ownedHome = Boolean(room && room.controller && room.controller.my);
    return freeze({
      roomName: scopeRow.roomName,
      tick,
      scope: {
        membership: scopeRow.membership,
        configuredRole: scopeRow.configuredRole,
        authorityHome: scopeRow.authority.homeRoom,
        ownedHome,
        visibility: scopeRow.visibility,
        controllerStatus: scopeRow.controller.status,
        transitionedToOwned: scopeRow.transitionedToOwned
      },
      health: {
        label: status && (status.label || status.health || status.key) || null,
        reasons: status && Array.isArray(status.reasons)
          ? [...status.reasons] : [],
        observation: metricObservation(status,
          integer(status && status.updated), tick, false, 'room status')
      },
      energy: {
        available,
        collectable,
        harvestable: measuredEnergy ? measuredEnergy.harvestable : null,
        dropped: measuredEnergy ? measuredEnergy.dropped : null,
        stored: measuredEnergy ? measuredEnergy.stored
          : finite(trend && trend.stored),
        withdrawable: measuredEnergy ? measuredEnergy.withdrawable : null,
        sourceStored: finite(demand && demand.sourceStored),
        storageFree: finite(demand && demand.storageFree),
        spawnAvailable: ownedHome ? finite(room.energyAvailable) : null,
        spawnCapacity: ownedHome
          ? finite(room.energyCapacityAvailable) : null,
        workPhase: demand && demand.energyWorkPhase || null,
        basis: {
          available: measuredEnergy
            ? 'live sources + energy drops + structure stores'
            : trend ? 'remembered stored energy only' : 'unknown',
          collectable: measuredEnergy
            ? 'live sources + energy drops + non-consumer structure stores'
            : demand ? 'remembered source-buffer energy only' : 'unknown'
        },
        evidenceLimit: 'Collectable is physical potential supply before ' +
          'task reservations, protected reserves, pathing, or labor limits.',
        observations: {
          available: measuredEnergy
            ? observation(tick, tick, true, 'live room inventory')
            : metricObservation(available, integer(trend && trend.tick), tick,
              false, 'room trend'),
          collectable: measuredEnergy
            ? observation(tick, tick, true, 'live room inventory')
            : metricObservation(collectable, integer(demand && demand.tick),
              tick, false, 'demand plan'),
          demandPlan: metricObservation(demand, integer(demand && demand.tick),
            tick, false, 'demand plan'),
          trend: metricObservation(trend, integer(trend && trend.tick), tick,
            false, 'room trend')
        }
      },
      work: {
        repairEnergy,
        repairTargets: measuredWork ? measuredWork.repairTargets : null,
        constructionRemaining,
        constructionTargets: measuredWork
          ? measuredWork.constructionTargets : null,
        basis: workBasis,
        evidenceLimit: measuredWork
          ? 'Routine repair excludes walls and ramparts; construction is ' +
            'remaining progress, not energy cost.'
          : 'Remembered work may have changed since its observation tick.',
        observation: metricObservation(
          repairEnergy === null && constructionRemaining === null
            ? null : true,
          workTick, tick, Boolean(measuredWork), measuredWork
            ? 'live room work inventory' : demand ? 'demand plan'
              : trend ? 'room trend' : null)
      },
      staffing: {
        population: finite(trend && trend.population),
        desired: finite(trend && trend.desired),
        observation: metricObservation(trend, integer(trend && trend.tick),
          tick, false, 'room trend')
      },
      threats: {
        state: combat && combat.state || null,
        active: combat ? Boolean(combat.fighting) : null,
        count: finite(combat && combat.hostileCount),
        observation: metricObservation(combat,
          integer(combat && combat.updated), tick, false, 'combat status')
      }
    });
  });
  return freeze({ tick, roomNames: rows.map(row => row.roomName), rows });
};

module.exports = {
  collectOperationalRoomHealth,
  homePickupCandidates,
  networkRecoveryNeeded
};
