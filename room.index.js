'use strict';

const createRoomIndex = options => {
  const { Game, FIND_SOURCES, FIND_STRUCTURES, FIND_MY_CONSTRUCTION_SITES,
    FIND_MY_CREEPS } = options;
  const indexes = {};
  const getRoomObjectIndex = room => {
    if (indexes[room.name]) return indexes[room.name];
    const index = {
      sources: room.find(FIND_SOURCES),
      structures: room.find(FIND_STRUCTURES),
      sites: room.find(FIND_MY_CONSTRUCTION_SITES),
      creeps: room.find(FIND_MY_CREEPS)
    };
    indexes[room.name] = index;
    return index;
  };
  const getRoomSources = room => getRoomObjectIndex(room).sources;
  const getRoomStructures = room => getRoomObjectIndex(room).structures;
  const getRoomSites = room => getRoomObjectIndex(room).sites;
  const getRoomCreeps = room => getRoomObjectIndex(room).creeps;
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
    getRoomSites, getRoomCreeps, getSlowWorkInventory };
};

module.exports = { createRoomIndex };
