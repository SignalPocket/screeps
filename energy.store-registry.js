'use strict';

/**
 * Keep one inspectable room-level list of persistent energy stores.
 *
 * Executors should not independently rediscover what every container means.
 * This registry records stable identity, position, structure type, purpose,
 * and whether a store is a legal first handoff for returning remote cargo.
 * Volatile amounts and free capacity remain live structure facts and are not
 * copied into memory.
 */
const createEnergyStoreRegistry = ({
  Game, getRoomSources, getRoomStructures, getContainerPurpose,
  STRUCTURE_CONTAINER, STRUCTURE_STORAGE, refreshInterval = 20
}) => {
  const rebuild = room => {
    const sources = getRoomSources(room);
    const entries = getRoomStructures(room)
      .filter(structure => structure.structureType === STRUCTURE_CONTAINER ||
        structure.structureType === STRUCTURE_STORAGE)
      .map(structure => {
        const sourceBuffer = structure.structureType === STRUCTURE_CONTAINER &&
          sources.some(source => source.pos.getRangeTo(structure) <= 2);
        const purpose = structure.structureType === STRUCTURE_STORAGE
          ? 'storage'
          : getContainerPurpose(room, structure.pos) || 'unclassified';
        return {
          id: structure.id,
          structureType: structure.structureType,
          purpose,
          x: structure.pos.x,
          y: structure.pos.y,
          sourceBuffer,
          remoteDeliveryEligible: !sourceBuffer
        };
      })
      .sort((a, b) => a.structureType.localeCompare(b.structureType) ||
        a.purpose.localeCompare(b.purpose) || a.id.localeCompare(b.id));
    room.memory.energyStoreRegistry = {
      version: 1,
      updated: Game.time,
      entries
    };
    return room.memory.energyStoreRegistry;
  };

  const getRegistry = (room, force = false) => {
    const saved = room.memory.energyStoreRegistry;
    if (force || !saved || saved.version !== 1 ||
        !Array.isArray(saved.entries) ||
        Game.time - (saved.updated || 0) >= refreshInterval) {
      return rebuild(room);
    }
    return saved;
  };

  const getRemoteDeliveryStores = room => {
    let registry = getRegistry(room);
    let stores = registry.entries
      .filter(entry => entry.remoteDeliveryEligible)
      .map(entry => Game.getObjectById(entry.id))
      .filter(Boolean);
    // A destroyed target or newly completed container can make the cached list
    // incomplete between scheduled refreshes. Refresh once before reporting no
    // usable handoff; never make each creep maintain its own competing list.
    if (stores.length === 0 && registry.entries.length > 0) {
      registry = getRegistry(room, true);
      stores = registry.entries
        .filter(entry => entry.remoteDeliveryEligible)
        .map(entry => Game.getObjectById(entry.id))
        .filter(Boolean);
    }
    return stores;
  };

  return { getRegistry, getRemoteDeliveryStores };
};

module.exports = { createEnergyStoreRegistry };
