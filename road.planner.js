'use strict';

const createRoadPlanner = ({
  Game, scheduledRoomTick, getRoomSources, getRoomCreeps,
  showTrafficHeatmap, FIND_MY_SPAWNS, FIND_STRUCTURES,
  FIND_MY_CONSTRUCTION_SITES, STRUCTURE_ROAD, STRUCTURE_CONTAINER,
  LOOK_STRUCTURES,
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
    ].sort((a, b) => spawn.pos.getRangeTo(b.object) -
      spawn.pos.getRangeTo(a.object));
    const signature = ['v3-single-network', spawn.id,
      ...targets.map(target => target.object.id)].join(':');
    const cached = room.memory.roadPlan;
    if (cached && cached.signature === signature &&
        Game.time - cached.updated < 1000 && Array.isArray(cached.paths)) {
      return cached.paths;
    }

    const selectedNetwork = new Set([`${spawn.pos.x}:${spawn.pos.y}`]);
    const existingRoads = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD
    });
    const findPath = (origin, destination) => {
      const points = room.findPath(origin, destination, {
        ignoreCreeps: true,
        range: 1,
        plainCost: 2,
        swampCost: 10,
        maxOps: 4000,
        maxRooms: 1,
        costCallback: (roomName, costs) => {
          // Old traffic roads should not pull a new plan into another parallel
          // lane. Prefer only the trunk selected by earlier destinations.
          for (const road of existingRoads) costs.set(road.pos.x, road.pos.y, 2);
          for (const key of selectedNetwork) {
            const [x, y] = key.split(':').map(Number);
            costs.set(x, y, 1);
          }
          return costs;
        }
      }).map(step => ({ x: step.x, y: step.y }));
      for (const point of points) selectedNetwork.add(`${point.x}:${point.y}`);
      return points;
    };
    // One path per destination is enough. Source-to-controller paths created
    // a second triangle across the room even though creeps can use this shared
    // network to travel between any two endpoints.
    const paths = targets.map(target => ({
      label: target.label,
      targetId: target.object.id,
      points: findPath(spawn.pos, target.object.pos)
    }));
    const usablePaths = paths.filter(path => path.points.length > 0);
    room.memory.roadPlan = { signature, updated: Game.time, paths: usablePaths };
    return usablePaths;
  };
  const getImportantTravelPaths = room => {
    const places = [];
    const addPlace = (key, kind, position) => {
      if (!position || !Number.isInteger(position.x) ||
          !Number.isInteger(position.y)) return;
      if (places.some(place => place.position.x === position.x &&
          place.position.y === position.y)) return;
      places.push({ key, kind, position });
    };
    const spawns = room.find(FIND_MY_SPAWNS).slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const [index, spawn] of spawns.entries()) {
      addPlace(`spawn-${index + 1}-${spawn.id}`, 'spawn', spawn.pos);
    }
    for (const [index, source] of getRoomSources(room).slice()
      .sort((a, b) => a.id.localeCompare(b.id)).entries()) {
      addPlace(`source-${index + 1}-${source.id}`, 'source', source.pos);
    }
    if (room.controller) {
      addPlace(`controller-${room.controller.id}`, 'controller',
        room.controller.pos);
    }
    if (room.storage) {
      addPlace(`storage-${room.storage.id}`, 'storage', room.storage.pos);
    }
    if (!room.controller || !room.controller.my) {
      const containers = room.find(FIND_STRUCTURES, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER
      }).slice().sort((a, b) => a.id.localeCompare(b.id));
      for (const [index, container] of containers.entries()) {
        addPlace(`container-${index + 1}-${container.id}`, 'container',
          container.pos);
      }
    }
    for (const [key, anchor] of [
      ['extension-primary', room.memory.extensionCluster],
      ['extension-overflow', room.memory.extensionOverflowCluster]
    ]) {
      if (!anchor) continue;
      const position = room.getPositionAt
        ? room.getPositionAt(anchor.x, anchor.y) : anchor;
      addPlace(key, 'extensions', position);
    }
    const signature = ['v2-converging-important-pairs',
      ...places.map(place => `${place.key}@${place.position.x},` +
        `${place.position.y}`)].join(':');
    const cached = room.memory.travelPathPlan;
    if (cached && cached.signature === signature &&
        Game.time - cached.updated < 1000 && Array.isArray(cached.paths)) {
      return cached.paths;
    }

    const existingRoads = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_ROAD
    });
    const selectedTravelNetwork = new Set();
    const paths = [];
    for (let originIndex = 0; originIndex < places.length; originIndex++) {
      for (let destinationIndex = originIndex + 1;
        destinationIndex < places.length; destinationIndex++) {
        const origin = places[originIndex];
        const destination = places[destinationIndex];
        const points = room.findPath(origin.position, destination.position, {
          ignoreCreeps: true,
          range: 1,
          plainCost: 3,
          swampCost: 12,
          maxOps: 4000,
          maxRooms: 1,
          costCallback: (roomName, costs) => {
            // Give already selected visual corridors a modest advantage over
            // open ground. Later pairs converge where useful, but cost 2
            // still permits a substantially shorter cost-3 direct route.
            for (const key of selectedTravelNetwork) {
              const [x, y] = key.split(':').map(Number);
              costs.set(x, y, 2);
            }
            for (const road of existingRoads) {
              costs.set(road.pos.x, road.pos.y, 1);
            }
            return costs;
          }
        }).map(step => ({ x: step.x, y: step.y }));
        if (points.length > 0) {
          for (const point of points) {
            selectedTravelNetwork.add(`${point.x}:${point.y}`);
          }
          paths.push({
            label: `${origin.key}-${destination.key}`,
            kinds: [origin.kind, destination.kind],
            points
          });
        }
      }
    }
    room.memory.travelPathPlan = { signature, updated: Game.time, paths };
    return paths;
  };
  const getInterRoomTravelPaths = homeRoom => {
    const byRoom = {};
    const plans = [
      ['left', homeRoom.memory.remoteRoadPlan],
      ['south', homeRoom.memory.southRemoteRoadPlan],
      ['southwest', homeRoom.memory.southwestRemoteRoadPlan]
    ];
    for (const [planLabel, plan] of plans) {
      for (const path of plan && Array.isArray(plan.paths) ? plan.paths : []) {
        let segment = [];
        let segmentRoom;
        const storeSegment = () => {
          if (!segmentRoom || segment.length < 2) return;
          if (!byRoom[segmentRoom]) byRoom[segmentRoom] = [];
          byRoom[segmentRoom].push({
            label: `${planLabel}-${path.slot || 0}-${segmentRoom}`,
            kinds: ['outpost'],
            points: segment
          });
        };
        for (const point of path.points || []) {
          if (!point.roomName) continue;
          if (segmentRoom && point.roomName !== segmentRoom) {
            storeSegment();
            segment = [];
          }
          segmentRoom = point.roomName;
          segment.push({ x: point.x, y: point.y });
        }
        storeSegment();
      }
    }
    return byRoom;
  };
  const getConvergedTravelPaths = paths => {
    const uses = {};
    for (const path of paths) {
      for (const point of path.points || []) {
        const key = `${point.x}:${point.y}`;
        uses[key] = (uses[key] || 0) + 1;
      }
    }
    return paths.map(path => ({
      ...path,
      points: (path.points || []).filter(point =>
        uses[`${point.x}:${point.y}`] >= 2)
    })).filter(path => path.points.length > 0);
  };
  const isSingleLaneRoadPosition = (room, target) => {
    if (!target || !target.pos) return false;
    return getConvergedTravelPaths(getImportantTravelPaths(room))
      .some(path => path.points.some(point =>
        point.x === target.pos.x && point.y === target.pos.y));
  };
  const heatmapRoadTileCache = {};
  const getHeatmapRoadTiles = room => {
    if (heatmapRoadTileCache[room.name]) {
      return heatmapRoadTileCache[room.name];
    }
    // Maintenance follows the converged important-place network. Old or
    // incidental roads remain usable but do not keep consuming repair work.
    const tiles = new Set();
    for (const path of getConvergedTravelPaths(
      getImportantTravelPaths(room))) {
      for (const point of path.points) tiles.add(`${point.x}:${point.y}`);
    }
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
  const drawTravelPaths = (room, paths) => {
    for (const path of paths) {
      const kinds = path.kinds || [];
      const stroke = kinds.includes('outpost') ? '#bf5af2' :
        kinds.includes('controller') ? '#64d2ff' :
        kinds.includes('storage') ? '#ffd60a' :
          kinds.includes('extensions') ? '#ff9f0a' :
            kinds.includes('container') ? '#ffcc80' : '#30d158';
      room.visual.poly(path.points.map(point => [point.x, point.y]), {
        fill: 'transparent',
        stroke,
        strokeWidth: 0.07,
        opacity: 0.3,
        lineStyle: 'dotted'
      });
    }
  };
  const drawRoadPlan = (room, paths, traffic, roadBudget) => {
    drawTravelPaths(room, paths);
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
    const value = Math.max(50, controllerLevel * 10,
      strategicTiles.size + 10);
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
    const corridorUses = {};
    for (const path of paths) {
      for (const point of path.points) {
        const key = `${point.x}:${point.y}`;
        corridorUses[key] = (corridorUses[key] || 0) + 1;
      }
    }
    const terrain = room.getTerrain();
    const candidateKeys = new Set(Object.keys(corridorUses));
    const networkRoadCount = roads.filter(road =>
      candidateKeys.has(`${road.pos.x}:${road.pos.y}`)).length;
    const networkSiteCount = roadSites.filter(site =>
      candidateKeys.has(`${site.pos.x}:${site.pos.y}`)).length;
    const budgetRemaining = roadBudget - networkRoadCount - networkSiteCount;
    const batchLimit = Math.min(2 - networkSiteCount, budgetRemaining);
    if (batchLimit <= 0) return false;

    const candidates = [];
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
    getImportantTravelPaths,
    getInterRoomTravelPaths,
    getConvergedTravelPaths,
    isSingleLaneRoadPosition,
    getHeatmapRoadTiles,
    isHeatmapRoadPosition,
    updateTrafficHeatmap,
    drawRoadPlan,
    drawTravelPaths,
    getRoadBudget,
    placeRoadSite
  };
};

module.exports = { createRoadPlanner };
