'use strict';

const createExpansionPlanner = ({
  Game, getRoomSources, FIND_STRUCTURES, FIND_MY_SPAWNS,
  FIND_MY_CONSTRUCTION_SITES, FIND_SOURCES, STRUCTURE_CONTAINER,
  STRUCTURE_ROAD, STRUCTURE_SPAWN, TERRAIN_MASK_WALL, LOOK_STRUCTURES,
  LOOK_CONSTRUCTION_SITES, BODYPART_COST, CLAIM, MOVE, OK
}) => {
  const scoreCandidate = room => getRoomSources(room).length * 100 +
    room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    }).length * 25 +
    room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD
    }).length;

  const selectExpansionTarget = homeRoom => {
    const candidateNames = [
      homeRoom.memory.leftSurvey && homeRoom.memory.leftSurvey.targetRoom,
      homeRoom.memory.southSurvey && homeRoom.memory.southSurvey.targetRoom
    ].filter(Boolean);
    return candidateNames.map(roomName => Game.rooms[roomName])
      .filter(room => room && room.controller && !room.controller.owner)
      .map(room => ({ room, score: scoreCandidate(room) }))
      .sort((a, b) => b.score - a.score ||
        a.room.name.localeCompare(b.room.name))[0] || null;
  };

  const findSpawnSite = (room, controller) => {
    const terrain = room.getTerrain();
    const sources = room.find(FIND_SOURCES);
    const roads = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD
    });
    const candidates = [];
    for (let x = 3; x <= 46; x++) {
      for (let y = 3; y <= 46; y++) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL ||
            controller.pos.getRangeTo(x, y) < 3 ||
            sources.some(source => source.pos.getRangeTo(x, y) < 3) ||
            room.lookForAt(LOOK_STRUCTURES, x, y).length > 0 ||
            room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) {
          continue;
        }
        const sourceRange = sources.reduce((total, source) =>
          total + source.pos.getRangeTo(x, y), 0);
        const controllerRange = controller.pos.getRangeTo(x, y);
        const roadAdjacent = roads.some(road => road.pos.getRangeTo(x, y) <= 1);
        candidates.push({
          x,
          y,
          score: sourceRange * 2 + controllerRange - (roadAdjacent ? 5 : 0)
        });
      }
    }
    return candidates.sort((a, b) => a.score - b.score ||
      a.x - b.x || a.y - b.y);
  };

  const updateExpansionPlan = () => {
    const primarySpawn = Object.values(Game.spawns)
      .sort((a, b) => a.name.localeCompare(b.name))[0];
    if (!primarySpawn) return null;
    const homeRoom = primarySpawn.room;
    const ownedRoomCount = Object.values(Game.rooms).filter(room =>
      room.controller && room.controller.my).length;
    let plan = homeRoom.memory.expansionPlan;
    if (!plan || !plan.targetRoom) {
      const candidate = selectExpansionTarget(homeRoom);
      if (candidate) {
        plan = {
          targetRoom: candidate.room.name,
          selected: Game.time,
          status: 'waiting-gcl'
        };
        homeRoom.memory.expansionPlan = plan;
        console.log(`[${Game.time}] expansion target ${plan.targetRoom} ` +
          `score ${candidate.score}`);
      }
    }
    if (!plan || !plan.targetRoom) return null;

    const targetRoom = Game.rooms[plan.targetRoom];
    const targetController = targetRoom && targetRoom.controller;
    plan.gclLevel = Game.gcl.level;
    plan.ownedRooms = ownedRoomCount;
    plan.canClaim = Game.gcl.level > ownedRoomCount;
    if (targetController && targetController.my) {
      const targetSpawn = targetRoom.find(FIND_MY_SPAWNS)[0];
      const spawnSite = targetRoom.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: site => site.structureType === STRUCTURE_SPAWN
      })[0];
      if (targetSpawn) {
        plan.status = 'established';
        plan.spawnId = targetSpawn.id;
      } else {
        plan.status = 'bootstrap';
        if (!spawnSite) {
          for (const candidate of findSpawnSite(targetRoom, targetController)) {
            if (targetRoom.createConstructionSite(candidate.x, candidate.y,
              STRUCTURE_SPAWN) === OK) {
              plan.spawnX = candidate.x;
              plan.spawnY = candidate.y;
              console.log(`[${Game.time}] ${plan.targetRoom} bootstrap ` +
                `spawn site ${candidate.x},${candidate.y}`);
              break;
            }
          }
        } else {
          plan.spawnSiteId = spawnSite.id;
        }
      }
    } else if (!plan.canClaim) {
      plan.status = 'waiting-gcl';
    } else if (homeRoom.energyCapacityAvailable <
        BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]) {
      plan.status = 'waiting-energy-capacity';
    } else {
      plan.status = 'claim-ready';
    }
    if (plan.lastReportedStatus !== plan.status) {
      console.log(`[${Game.time}] expansion ${plan.targetRoom}: ` +
        `${plan.lastReportedStatus || 'planned'} -> ${plan.status} ` +
        `(GCL ${plan.gclLevel}, rooms ${plan.ownedRooms})`);
      plan.lastReportedStatus = plan.status;
    }
    return plan;
  };

  return { scoreCandidate, selectExpansionTarget, findSpawnSite,
    updateExpansionPlan };
};

module.exports = { createExpansionPlanner };
