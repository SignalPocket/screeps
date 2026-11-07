'use strict';

const createRoomIndex = options => {
  const { Game, FIND_SOURCES, FIND_STRUCTURES, FIND_MY_CONSTRUCTION_SITES,
    FIND_MY_CREEPS, FIND_TOMBSTONES } = options;
  const indexes = {};
  const getRoomObjectIndex = room => {
    if (indexes[room.name]) return indexes[room.name];
    const sources = room.find(FIND_SOURCES);
    const structures = room.find(FIND_STRUCTURES);
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const creeps = room.find(FIND_MY_CREEPS);
    const tombstones = FIND_TOMBSTONES === undefined
      ? [] : room.find(FIND_TOMBSTONES);
    const groupByType = objects => objects.reduce((groups, object) => {
      const type = object.structureType || 'unknown';
      if (!groups[type]) groups[type] = [];
      groups[type].push(object);
      return groups;
    }, {});
    const index = {
      sources,
      structures,
      structuresByType: groupByType(structures),
      sites,
      sitesByType: groupByType(sites),
      creeps,
      tombstones
    };
    indexes[room.name] = index;
    return index;
  };
  const getRoomSources = room => getRoomObjectIndex(room).sources;
  const getRoomStructures = room => getRoomObjectIndex(room).structures;
  const getRoomSites = room => getRoomObjectIndex(room).sites;
  const getRoomCreeps = room => getRoomObjectIndex(room).creeps;
  const getRoomTombstones = room => getRoomObjectIndex(room).tombstones;
  const getRoomStructuresByType = (room, structureType) =>
    getRoomObjectIndex(room).structuresByType[structureType] || [];
  const getRoomSitesByType = (room, structureType) =>
    getRoomObjectIndex(room).sitesByType[structureType] || [];
  const getSlowWorkInventory = room => {
    let saved = room.memory.slowWorkInventory;
    if (!saved || Game.time - (saved.updated || 0) >= 10) {
      saved = {
        updated: Game.time,
        siteIds: getRoomSites(room).map(site => site.id),
        structureIds: getRoomStructures(room).map(structure => structure.id)
      };
      room.memory.slowWorkInventory = saved;
    }
    return {
      sites: (saved.siteIds || []).map(id => Game.getObjectById(id))
        .filter(Boolean),
      structures: (saved.structureIds || []).map(id => Game.getObjectById(id))
        .filter(Boolean)
    };
  };
  return { getRoomObjectIndex, getRoomSources, getRoomStructures,
    getRoomStructuresByType, getRoomSites, getRoomSitesByType,
    getRoomCreeps, getRoomTombstones, getSlowWorkInventory };
};

module.exports = { createRoomIndex };
