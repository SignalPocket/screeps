'use strict';

const createRoadPlanner = ({
  Game, scheduledRoomTick, getRoomSources, getRoomCreeps,
  showTrafficHeatmap, FIND_MY_SPAWNS, FIND_STRUCTURES,
  FIND_MY_CONSTRUCTION_SITES, STRUCTURE_ROAD, LOOK_STRUCTURES,
  LOOK_CONSTRUCTION_SITES, TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP, OK
}) => {
  const getImportantRoadPaths = room => {
    const spawn = room.find(FIND_MY_SPAWNS)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!spawn) return [];
    const sources = getRoomSources(room);
    const targets = [
      ...sources.map(source => ({ label: 'source', object: source })),
      ...(room.controller ? [{ label: 'controller', object: room.controller }] : []),
      ...(room.storage ? [{ label: 'storage', object: room.storage }] : [])
    ];
    const signature = ['v2', spawn.id,
      ...targets.map(target => target.object.id)].join(':');
    const cached = room.memory.roadPlan;
    if (cached && cached.signature === signature &&
        Game.time - cached.updated < 1000 && Array.isArray(cached.paths)) {
      return cached.paths;
    }

    const findPath = (origin, destination) => room.findPath(origin, destination, {
      ignoreCreeps: true,
      range: 1,
      plainCost: 2,
      swampCost: 10,
      maxOps: 4000,
      maxRooms: 1
    }).map(step => ({ x: step.x, y: step.y }));
    const paths = targets.map(target => ({
      label: target.label,
      targetId: target.object.id,
      points: findPath(spawn.pos, target.object.pos)
    }));
    if (room.controller) {
      for (const source of sources) {
        paths.push({
          label: 'source-controller',
          targetId: room.controller.id,
          sourceId: source.id,
          points: findPath(source.pos, room.controller.pos)
        });
      }
    }
    const usablePaths = paths.filter(path => path.points.length > 0);
    room.memory.roadPlan = { signature, updated: Game.time, paths: usablePaths };
    return usablePaths;
  };
  const isSingleLaneRoadPosition = (room, target) => {
    if (!target || !target.pos) return false;
    return getImportantRoadPaths(room).some(path => path.points.some(point =>
      point.x === target.pos.x && point.y === target.pos.y));
  };
  const heatmapRoadTileCache = {};
  const getHeatmapRoadTiles = room => {
    if (heatmapRoadTileCache[room.name]) {
      return heatmapRoadTileCache[room.name];
    }
    const trafficTiles = room.memory.traffic && room.memory.traffic.tiles || {};
    const savedHotTiles = room.memory.traffic &&
      room.memory.traffic.hotTiles;
    const rankedTiles = Array.isArray(savedHotTiles)
      ? savedHotTiles
      : Object.entries(trafficTiles)
        .filter(([, visits]) => visits >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80);
    const tiles = new Set(rankedTiles.map(([key]) => key));
    heatmapRoadTileCache[room.name] = tiles;
    return tiles;
  };
  const isHeatmapRoadPosition = (room, target) => target && target.pos &&
    getHeatmapRoadTiles(room).has(`${target.pos.x}:${target.pos.y}`);
  const updateTrafficHeatmap = room => {
    if (!room.memory.traffic || !room.memory.traffic.tiles) {
      room.memory.traffic = {
        started: Game.time,
        lastDecay: Game.time,
        tiles: {}
      };
    }
    const traffic = room.memory.traffic;
    if (!Number.isInteger(traffic.started)) traffic.started = Game.time;
    if (!Number.isInteger(traffic.lastDecay)) traffic.lastDecay = Game.time;
    // Sample every other tick and weight the observation by two. This retains
    // the same approximate heat while halving position-memory writes.
    if (scheduledRoomTick(room, 2)) {
      for (const creep of getRoomCreeps(room)) {
        const previous = creep.memory.trafficPosition;
        if (previous && previous.roomName === room.name &&
            (previous.x !== creep.pos.x || previous.y !== creep.pos.y)) {
          const key = `${creep.pos.x}:${creep.pos.y}`;
          traffic.tiles[key] = (traffic.tiles[key] || 0) + 2;
        }
        creep.memory.trafficPosition = {
          x: creep.pos.x,
          y: creep.pos.y,
          roomName: room.name
        };
      }
    }

    if (Game.time - traffic.lastDecay >= 1000) {
      for (const key of Object.keys(traffic.tiles)) {
        const decayed = Math.floor(traffic.tiles[key] / 2);
        if (decayed > 0) traffic.tiles[key] = decayed;
        else delete traffic.tiles[key];
      }
      traffic.lastDecay = Game.time;
    }

    // Only re-sort the full history every 25 ticks. A short period of visual
    // staleness does not affect movement or jobs.
    if (!Array.isArray(traffic.hotTiles) ||
        Game.time - (traffic.hotTilesUpdated || 0) >= 25) {
      traffic.hotTiles = Object.entries(traffic.tiles)
        .filter(([, visits]) => visits >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80);
      traffic.hotTilesUpdated = Game.time;
    }
    const hotTiles = traffic.hotTiles;
    const maximum = hotTiles.length ? hotTiles[0][1] : 1;
    // Forty visible cells preserve the useful traffic picture with half the
    // visual calls. The full top-80 set remains available for road planning.
    if (showTrafficHeatmap) {
      for (const [key, visits] of hotTiles.slice(0, 40)) {
        const [x, y] = key.split(':').map(Number);
        const intensity = visits / maximum;
        const fill = intensity >= 0.67 ? '#ff453a' :
          intensity >= 0.34 ? '#ff9f0a' : '#ffd60a';
        room.visual.circle(x, y, {
          fill,
          radius: 0.18 + intensity * 0.27,
          opacity: 0.18 + intensity * 0.42,
          stroke: 'transparent'
        });
      }
    }
    return traffic;
  };
  const drawRoadPlan = (room, paths, traffic, roadBudget) => {
    for (const path of paths) {
      const stroke = path.label === 'controller' ? '#64d2ff' :
        path.label === 'source-controller' ? '#bf5af2' : '#30d158';
      room.visual.poly(path.points.map(point => [point.x, point.y]), {
        fill: 'transparent',
        stroke,
        strokeWidth: 0.08,
        opacity: 0.28,
        lineStyle: 'dashed'
      });
    }
    const samples = Object.values(traffic.tiles)
      .reduce((total, visits) => total + visits, 0);
    let roadStatus = room.memory.roadVisualStatus;
    if (!roadStatus || Game.time - (roadStatus.updated || 0) >= 25) {
      roadStatus = {
        updated: Game.time,
        roadCount: room.find(FIND_STRUCTURES, {
          filter: structure => structure.structureType === STRUCTURE_ROAD
        }).length,
        roadSiteCount: room.find(FIND_MY_CONSTRUCTION_SITES, {
          filter: site => site.structureType === STRUCTURE_ROAD
        }).length
      };
      room.memory.roadVisualStatus = roadStatus;
    }
    room.visual.text(
      `traffic ${samples} | roads ${roadStatus.roadCount}+` +
        `${roadStatus.roadSiteCount}/${roadBudget}`,
      1, 1,
      { align: 'left', color: '#ffffff', font: 0.55, opacity: 0.75 }
    );
  };
  const getRoadBudget = (room, paths, controllerLevel) => {
    const cached = room.memory.roadBudgetCache;
    const planUpdated = room.memory.roadPlan && room.memory.roadPlan.updated;
    if (cached && cached.controllerLevel === controllerLevel &&
        cached.planUpdated === planUpdated &&
        Game.time - cached.updated < 100) return cached.value;
    const strategicTiles = new Set();
    for (const path of paths) {
      for (const point of path.points) {
        strategicTiles.add(`${point.x}:${point.y}`);
      }
    }
    const offNetworkRoads = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD &&
        !strategicTiles.has(`${structure.pos.x}:${structure.pos.y}`)
    }).length;
    const dottedNetworkMinimum = strategicTiles.size + offNetworkRoads;
    const value = Math.max(50, controllerLevel * 10,
      dottedNetworkMinimum + 25);
    room.memory.roadBudgetCache = {
      value,
      updated: Game.time,
      controllerLevel,
      planUpdated
    };
    return value;
  };
  const placeRoadSite = (room, paths, traffic, roadBudget) => {
    if (!room.controller || !room.controller.my || room.controller.level < 2) {
      return false;
    }
    const roads = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD
    });
    const roadSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_ROAD
    });
    const builtRoadTiles = new Set(roads.map(road =>
      `${road.pos.x}:${road.pos.y}`));
    const queuedRoadTiles = new Set(roadSites.map(site =>
      `${site.pos.x}:${site.pos.y}`));
    const budgetRemaining = roadBudget - roads.length - roadSites.length;
    const batchLimit = Math.min(2 - roadSites.length, budgetRemaining);
    if (batchLimit <= 0) return false;

    const corridorUses = {};
    for (const path of paths) {
      for (const point of path.points) {
        const key = `${point.x}:${point.y}`;
        corridorUses[key] = (corridorUses[key] || 0) + 1;
      }
    }
    const terrain = room.getTerrain();
    const candidates = [];
    const candidateKeys = new Set(Object.keys(corridorUses));
    // The heatmap is now an input to construction, not just a visual. Limit
    // it to the hottest established traffic so occasional detours do not
    // become permanent roads.
    Object.entries(traffic.tiles)
      .filter(([, visits]) => visits >= 10)
      .filter(([key]) => {
        const [x, y] = key.split(':').map(Number);
        return x > 0 && x < 49 && y > 0 && y < 49 &&
          !builtRoadTiles.has(key) && !queuedRoadTiles.has(key) &&
          terrain.get(x, y) !== TERRAIN_MASK_WALL &&
          room.lookForAt(LOOK_STRUCTURES, x, y).length === 0 &&
          room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length === 0;
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .forEach(([key]) => candidateKeys.add(key));
    for (const key of candidateKeys) {
      const visits = traffic.tiles[key] || 0;
      const corridorCount = corridorUses[key] || 0;
      const [x, y] = key.split(':').map(Number);
      if (x <= 0 || x >= 49 || y <= 0 || y >= 49 ||
          builtRoadTiles.has(key) || queuedRoadTiles.has(key) ||
          terrain.get(x, y) === TERRAIN_MASK_WALL ||
          room.lookForAt(LOOK_STRUCTURES, x, y).length > 0 ||
          room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
      const swampBonus = terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 50 : 0;
      const score = visits * 20 + corridorCount * 40 + swampBonus;
      candidates.push({ x, y, visits, corridorCount, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    let placed = 0;
    for (const candidate of candidates) {
      const key = `${candidate.x}:${candidate.y}`;
      const roadExists = room.lookForAt(LOOK_STRUCTURES,
        candidate.x, candidate.y).some(structure =>
        structure.structureType === STRUCTURE_ROAD);
      const roadQueued = room.lookForAt(LOOK_CONSTRUCTION_SITES,
        candidate.x, candidate.y).some(site =>
        site.structureType === STRUCTURE_ROAD);
      if (builtRoadTiles.has(key) || queuedRoadTiles.has(key) ||
          roadExists || roadQueued) continue;
      const result = room.createConstructionSite(
        candidate.x, candidate.y, STRUCTURE_ROAD);
      if (result === OK) {
        queuedRoadTiles.add(key);
        console.log(`[${Game.time}] Placed road site in ${room.name} at ` +
          `${candidate.x},${candidate.y} (heat ${candidate.visits}, ` +
          `corridor ${candidate.corridorCount})`);
        placed++;
        if (placed >= batchLimit) break;
      }
    }
    return placed > 0;
  };

  return {
    getImportantRoadPaths,
    isSingleLaneRoadPosition,
    getHeatmapRoadTiles,
    isHeatmapRoadPosition,
    updateTrafficHeatmap,
    drawRoadPlan,
    getRoadBudget,
    placeRoadSite
  };
};

module.exports = { createRoadPlanner };
