'use strict';

function createRemoteCorridorPlanner({
  Game, PathFinder, scheduledRoomTick, getRoomSources, isRetiringContainer,
  FIND_STRUCTURES, FIND_SOURCES, FIND_MY_SPAWNS, FIND_MY_CONSTRUCTION_SITES,
  STRUCTURE_CONTAINER, STRUCTURE_ROAD, STRUCTURE_RAMPART,
  LOOK_STRUCTURES, LOOK_CONSTRUCTION_SITES, OBSTACLE_OBJECT_TYPES,
  LEFT, BOTTOM, OK
}) {
  const getRemoteSources = room => room.find(FIND_SOURCES)
    .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);

  const buildCostMatrix = (roomName, allowedRooms, blockNonRoadSites) => {
    if (!allowedRooms.has(roomName)) return false;
    const room = Game.rooms[roomName];
    if (!room) return false;
    const costs = new PathFinder.CostMatrix();
    for (const structure of room.find(FIND_STRUCTURES)) {
      if (structure.structureType === STRUCTURE_ROAD) {
        costs.set(structure.pos.x, structure.pos.y, 1);
      } else if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
        costs.set(structure.pos.x, structure.pos.y, 255);
      }
    }
    if (blockNonRoadSites) {
      for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (site.structureType !== STRUCTURE_ROAD) {
          costs.set(site.pos.x, site.pos.y, 255);
        }
      }
    }
    return costs;
  };

  const findPaths = ({
    sources, destination, allowedRooms, maxRooms, maxOps,
    blockNonRoadSites
  }) => sources.map((source, slot) => {
    const search = PathFinder.search(source.pos, {
      pos: destination.pos,
      range: 1
    }, {
      maxRooms,
      maxOps,
      plainCost: 2,
      swampCost: 10,
      roomCallback: roomName => buildCostMatrix(roomName, allowedRooms,
        blockNonRoadSites)
    });
    return {
      slot,
      incomplete: search.incomplete,
      points: search.path.map(position => ({
        x: position.x,
        y: position.y,
        roomName: position.roomName
      }))
    };
  });

  const getCorridorPoints = (paths, deduplicate) => {
    if (!deduplicate) {
      return (paths || []).flatMap(path =>
        path.points.map((point, index) => ({
          ...point,
          slot: path.slot,
          index
        }))).sort((a, b) => a.index - b.index || a.slot - b.slot);
    }
    const corridor = new Map();
    for (const path of paths || []) {
      for (let index = 0; index < path.points.length; index++) {
        const point = path.points[index];
        const key = `${point.roomName}:${point.x}:${point.y}`;
        if (!corridor.has(key)) corridor.set(key, { ...point, index });
      }
    }
    return [...corridor.values()].sort((a, b) =>
      a.index - b.index || a.roomName.localeCompare(b.roomName));
  };

  const placeRoadSites = (paths, { deduplicate = false, siteLimit = 5 } = {}) => {
    const points = getCorridorPoints(paths, deduplicate);
    let activeSites = 0;
    for (const point of points) {
      const room = Game.rooms[point.roomName];
      if (room && room.lookForAt(LOOK_CONSTRUCTION_SITES, point.x, point.y)
        .some(site => site.structureType === STRUCTURE_ROAD)) activeSites++;
    }
    let availableSites = Math.max(0, siteLimit - activeSites);
    for (const point of points) {
      if (availableSites <= 0) break;
      const room = Game.rooms[point.roomName];
      if (!room) continue;
      const structures = room.lookForAt(LOOK_STRUCTURES, point.x, point.y);
      const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES,
        point.x, point.y);
      if (structures.some(structure =>
        structure.structureType === STRUCTURE_ROAD) || structures.some(
        structure => structure.structureType !== STRUCTURE_RAMPART) ||
        sites.length > 0) continue;
      if (room.createConstructionSite(point.x, point.y,
        STRUCTURE_ROAD) === OK) availableSites--;
    }
    return siteLimit - availableSites;
  };

  const updatePlan = (room, remoteRoom, destination, sources, config) => {
    const signature = [remoteRoom.name, destination.id,
      ...sources.map(source => source.id)].join(':');
    let plan = room.memory[config.memoryKey];
    const retryIncomplete = config.retryIncompleteAfter && plan &&
      (plan.paths || []).some(path => path.incomplete) &&
      Game.time - (plan.created || 0) >= config.retryIncompleteAfter;
    if (!plan || plan.signature !== signature || retryIncomplete) {
      const allowedRooms = config.getAllowedRooms(room, remoteRoom);
      const paths = findPaths({
        sources,
        destination,
        allowedRooms,
        maxRooms: config.maxRooms,
        maxOps: config.maxOps,
        blockNonRoadSites: config.blockNonRoadSites
      });
      plan = { signature, created: Game.time, paths };
      room.memory[config.memoryKey] = plan;
      console.log(config.formatLog(room, paths));
    }
    placeRoadSites(plan.paths, { deduplicate: config.deduplicate });
  };

  const routeConfigs = [
    {
      phase: 2,
      surveyKey: 'leftSurvey',
      memoryKey: 'remoteRoadPlan',
      maxRooms: 2,
      maxOps: 10000,
      blockNonRoadSites: true,
      deduplicate: true,
      requireSources: false,
      getDestination: room => room.find(FIND_STRUCTURES, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
          structure.pos.getRangeTo(room.controller) <= 3
      }).sort((a, b) => a.pos.getRangeTo(room.controller) -
        b.pos.getRangeTo(room.controller))[0],
      getAllowedRooms: (room, remoteRoom) =>
        new Set([room.name, remoteRoom.name]),
      formatLog: (room, paths) =>
        `[${Game.time}] ${room.name} planned remote roads: ` +
        paths.map(path => `L${path.slot + 1}=${path.points.length}`).join(' ')
    },
    {
      phase: 18,
      surveyKey: 'southSurvey',
      memoryKey: 'southRemoteRoadPlan',
      maxRooms: 2,
      maxOps: 10000,
      blockNonRoadSites: true,
      deduplicate: false,
      getDestination: room => {
        const source2 = getRoomSources(room)
          .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y)[1];
        if (!source2) return null;
        return source2.pos.findInRange(FIND_STRUCTURES, 1, {
          filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
            !isRetiringContainer(room, structure)
        }).sort((a, b) => b.pos.y - a.pos.y)[0];
      },
      getAllowedRooms: (room, remoteRoom) =>
        new Set([room.name, remoteRoom.name]),
      formatLog: (room, paths) =>
        `[${Game.time}] ${room.name} planned south roads ` +
        paths.map(path => `D${path.slot + 1}=${path.points.length}`)
          .join(' ') + ' to S2'
    },
    {
      phase: 34,
      surveyKey: 'southwestSurvey',
      memoryKey: 'southwestRemoteRoadPlan',
      maxRooms: 3,
      maxOps: 15000,
      blockNonRoadSites: false,
      deduplicate: false,
      retryIncompleteAfter: 25,
      getDestination: room => room.find(FIND_MY_SPAWNS)[0],
      getAllowedRooms: (room, remoteRoom) => {
        const exits = Game.map.describeExits(room.name) || {};
        return new Set([room.name, exits[LEFT], exits[BOTTOM],
          remoteRoom.name]);
      },
      isReady: room => {
        const exits = Game.map.describeExits(room.name) || {};
        return Boolean(exits[LEFT]);
      },
      formatLog: (room, paths) =>
        `[${Game.time}] ${room.name} planned southwest roads ` +
        paths.map(path => `SW${path.slot + 1}=${path.points.length}`)
          .join(' ')
    }
  ];

  const planRemoteCorridors = rooms => {
    for (const room of rooms) {
      if (!room.controller || !room.controller.my) continue;
      for (const config of routeConfigs) {
        if (!scheduledRoomTick(room, 50, config.phase)) continue;
        const survey = room.memory[config.surveyKey];
        const remoteRoom = survey && survey.active &&
          Game.rooms[survey.targetRoom];
        if (!remoteRoom || config.isReady && !config.isReady(room)) continue;
        const destination = config.getDestination(room);
        const sources = getRemoteSources(remoteRoom);
        if (!destination || config.requireSources !== false &&
            sources.length === 0) continue;
        updatePlan(room, remoteRoom, destination, sources, config);
      }
    }
  };

  return { getCorridorPoints, placeRoadSites, planRemoteCorridors };
}

module.exports = { createRemoteCorridorPlanner };
