'use strict';
const { isSourceStationAvailable, getSourceStationCandidates } =
  typeof Game === 'undefined' ? require('./source.station-geometry')
    : require('source.station-geometry');

const createSourcePositions = ({
  getRoomSources,
  getRoomSites,
  LOOK_STRUCTURES,
  LOOK_CREEPS,
  OBSTACLE_OBJECT_TYPES,
  STRUCTURE_ROAD,
  STRUCTURE_RAMPART,
  TERRAIN_MASK_WALL
}) => {
  const findMinerStation = (room, source, container, reserved, ignoreCreep,
    preferred) => {
    // Use one walkable tile within range one of both source and container.
    const terrain = room.getTerrain();
    const geometry = { room, source, container, reserved, ignoreCreep,
      allowWalkableRamparts: true, avoidCreeps: true, terrain,
      LOOK_STRUCTURES, LOOK_CREEPS, OBSTACLE_OBJECT_TYPES, STRUCTURE_ROAD,
      STRUCTURE_RAMPART, TERRAIN_MASK_WALL };

    if (preferred && Number.isInteger(preferred.x) &&
        Number.isInteger(preferred.y) &&
        isSourceStationAvailable({ ...geometry, x: preferred.x,
          y: preferred.y })) return preferred;
    return getSourceStationCandidates(geometry)[0] || null;
  };

  const getSource2TunnelSite = room => {
    const source = getRoomSources(room)[1];
    if (!source) return null;
    return getRoomSites(room).filter(site =>
      site.structureType === STRUCTURE_ROAD &&
        site.progressTotal > 300 && source.pos.getRangeTo(site) <= 2
    ).sort((a, b) => source.pos.getRangeTo(a) -
      source.pos.getRangeTo(b))[0] || null;
  };

  return { findMinerStation, getSource2TunnelSite };
};

module.exports = { createSourcePositions };
