'use strict';

const createInfrastructurePlanner = ({
  Game, RoomPosition, getRoomSources, isSingleLaneRoadPosition,
  CONTROLLER_STRUCTURES, STRUCTURE_EXTENSION, STRUCTURE_CONTAINER,
  STRUCTURE_ROAD, STRUCTURE_RAMPART, FIND_MY_STRUCTURES,
  FIND_MY_CONSTRUCTION_SITES, FIND_MY_SPAWNS, FIND_STRUCTURES,
  TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP, LOOK_STRUCTURES,
  LOOK_CONSTRUCTION_SITES, LOOK_CREEPS, RESOURCE_ENERGY, OK
}) => {
  // Pack extensions in adjacent two-wide columns. Every pair borders a
  // reserved access aisle, so haulers can still reach every structure.
  const isExtensionClusterTile = (cluster, x, y) => {
    const dx = x - cluster.x;
    const dy = y - cluster.y;
    return Math.max(Math.abs(dx), Math.abs(dy)) <= 3 &&
      (dx + 3) % 3 !== 2;
  };
  // Keep up to three extension sites active whenever the RCL unlocks more.
  // Roads and remote construction must not block core room capacity upgrades.
  const placeExtensionSite = room => {
    if (!room.controller || !room.controller.my) return false;
    const extensionLimit = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
    const builtExtensions = room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_EXTENSION
    }).length;
    const extensionSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_EXTENSION
    });
    const extensionCount = builtExtensions + extensionSites.length;
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return false;
    const terrain = room.getTerrain();
    const sources = getRoomSources(room);
    const trafficTiles = room.memory.traffic && room.memory.traffic.tiles || {};
    const usableExtensionTile = (x, y) => x > 1 && x < 48 && y > 1 && y < 48 &&
      terrain.get(x, y) !== TERRAIN_MASK_WALL &&
      room.controller.pos.getRangeTo(x, y) >= 2 &&
      !sources.some(source => source.pos.getRangeTo(x, y) < 2) &&
      !isSingleLaneRoadPosition(room, { pos: { x, y } }) &&
      room.lookForAt(LOOK_STRUCTURES, x, y).length === 0 &&
      room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length === 0;
    let cluster = room.memory.extensionCluster;
    if (!cluster || cluster.version !== 'low-traffic-v1') {
      const anchors = [];
      for (let x = spawn.pos.x - 9; x <= spawn.pos.x + 9; x++) {
        for (let y = spawn.pos.y - 9; y <= spawn.pos.y + 9; y++) {
          const range = spawn.pos.getRangeTo(x, y);
          if (range < 6 || range > 9 || x < 4 || x > 45 || y < 4 || y > 45) {
            continue;
          }
          let usable = 0;
          let traffic = 0;
          let corridor = 0;
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
              const tileX = x + dx;
              const tileY = y + dy;
              if (!isExtensionClusterTile({ x, y }, tileX, tileY)) continue;
              if (usableExtensionTile(tileX, tileY)) usable++;
              traffic += trafficTiles[`${tileX}:${tileY}`] || 0;
              if (isSingleLaneRoadPosition(room,
                { pos: { x: tileX, y: tileY } })) corridor++;
            }
          }
          if (usable < 10) continue;
          const routeLength = room.findPath(spawn.pos,
            new RoomPosition(x, y, room.name), {
              ignoreCreeps: true,
              maxOps: 2000
            }).length || 100;
          anchors.push({
            x,
            y,
            score: traffic * 20 + corridor * 200 +
              Math.abs(routeLength - 7) * 5 - usable
          });
        }
      }
      anchors.sort((a, b) => a.score - b.score ||
        a.x - b.x || a.y - b.y);
      if (anchors.length) {
        cluster = {
          x: anchors[0].x,
          y: anchors[0].y,
          version: 'low-traffic-v1',
          selected: Game.time
        };
        room.memory.extensionCluster = cluster;
        console.log(`[${Game.time}] ${room.name} extension cluster -> ` +
          `${cluster.x},${cluster.y}`);
      }
    }
    if (extensionCount >= extensionLimit || !cluster) return false;
    if (extensionSites.length >= Math.min(3,
      extensionLimit - builtExtensions)) return false;

    const candidates = [];
    for (let radius = 0; radius <= 3; radius++) {
      for (let x = cluster.x - radius; x <= cluster.x + radius; x++) {
        for (let y = cluster.y - radius; y <= cluster.y + radius; y++) {
          if (Math.max(Math.abs(x - cluster.x), Math.abs(y - cluster.y)) !==
              radius || !isExtensionClusterTile(cluster, x, y) ||
              !usableExtensionTile(x, y) ||
              room.lookForAt(LOOK_CREEPS, x, y).length > 0) continue;
          candidates.push({
            x,
            y,
            score: (trafficTiles[`${x}:${y}`] || 0) * 20 +
              radius * 2 + x / 100 + y / 10000
          });
        }
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    for (const candidate of candidates) {
      const result = room.createConstructionSite(
        candidate.x, candidate.y, STRUCTURE_EXTENSION);
      if (result === OK) {
        console.log(`[${Game.time}] Placed extension site in ${room.name} at ${candidate.x},${candidate.y}`);
        return true;
      }
    }
    return false;
  };
  const getContainerPurpose = (room, position) => {
    const source = getRoomSources(room).find(candidate =>
      // Range-two overflow buffers can still be reached from a harvesting
      // tile adjacent to the source and are part of the same logistics lane.
      candidate.pos.getRangeTo(position) <= 2);
    if (source) return `source:${source.id}`;
    if (room.controller && room.controller.pos.getRangeTo(position) <= 3) {
      return 'controller';
    }
    return null;
  };
  const isExtensionRefillBuffer = (room, structure) => {
    if (!structure || structure.structureType !== STRUCTURE_CONTAINER) {
      return false;
    }
    const plan = room.memory.extensionContainerPlan;
    if (plan && structure.pos.x === plan.x &&
        structure.pos.y === plan.y) return true;
    const cluster = room.memory.extensionCluster;
    if (!cluster || structure.pos.getRangeTo(cluster.x, cluster.y) > 3) {
      return false;
    }
    return !getRoomSources(room).some(source =>
      source.pos.getRangeTo(structure) <= 2) &&
      (!room.controller || structure.pos.getRangeTo(room.controller) > 3);
  };
  const placeSourceContainerSite = room => {
    if (!room.controller || !room.controller.my || room.controller.level < 2) {
      return false;
    }
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    const terrain = room.getTerrain();
    for (const source of getRoomSources(room)) {
      const hasContainer = source.pos.findInRange(FIND_STRUCTURES, 2, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER
      }).length > 0;
      const hasContainerSite = source.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 2, {
        filter: site => site.structureType === STRUCTURE_CONTAINER
      }).length > 0;
      if (hasContainer || hasContainerSite) continue;

      const candidates = [];
      for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
        for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
          if ((x === source.pos.x && y === source.pos.y) || x < 0 || x > 49 ||
              y < 0 || y > 49 || terrain.get(x, y) === TERRAIN_MASK_WALL ||
              room.lookForAt(LOOK_STRUCTURES, x, y).length > 0 ||
              room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
          let coverage = 0;
          for (let spotX = source.pos.x - 1; spotX <= source.pos.x + 1; spotX++) {
            for (let spotY = source.pos.y - 1; spotY <= source.pos.y + 1; spotY++) {
              if (spotX >= 0 && spotX <= 49 && spotY >= 0 && spotY <= 49 &&
                  (spotX !== source.pos.x || spotY !== source.pos.y) &&
                  terrain.get(spotX, spotY) !== TERRAIN_MASK_WALL &&
                  Math.max(Math.abs(x - spotX), Math.abs(y - spotY)) <= 1) {
                coverage++;
              }
            }
          }
          candidates.push({
            x,
            y,
            coverage,
            route: spawn ? room.findPath(spawn.pos,
              new RoomPosition(x, y, room.name), {
                ignoreCreeps: true,
                maxOps: 2000
              }).length || spawn.pos.getRangeTo(x, y) * 3 : 0,
            swamp: terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 1 : 0
          });
        }
      }
      candidates.sort((a, b) => b.coverage - a.coverage ||
        a.swamp - b.swamp || a.route - b.route);
      for (const candidate of candidates) {
        const result = room.createConstructionSite(
          candidate.x, candidate.y, STRUCTURE_CONTAINER);
        if (result === OK) {
          console.log(`[${Game.time}] Placed source container site in ${room.name} at ${candidate.x},${candidate.y}`);
          return true;
        }
      }
    }
    return false;
  };
  const manageExtensionContainer = room => {
    if (!room.controller || !room.controller.my ||
        room.controller.level < 2 || !room.memory.extensionCluster) {
      return false;
    }
    const cluster = room.memory.extensionCluster;
    const structures = room.find(FIND_STRUCTURES);
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const containers = structures.filter(structure =>
      structure.structureType === STRUCTURE_CONTAINER);
    const containerSites = sites.filter(site =>
      site.structureType === STRUCTURE_CONTAINER);
    const sources = getRoomSources(room);
    const source2 = sources[1];

    // S2 owns one source buffer only. Pending duplicates can be cancelled
    // safely before construction; never destroy its completed primary buffer.
    if (source2) {
      const source2Containers = containers.filter(container =>
        source2.pos.getRangeTo(container) <= 2)
        .sort((a, b) => source2.pos.getRangeTo(a) -
          source2.pos.getRangeTo(b));
      const source2Sites = containerSites.filter(site =>
        source2.pos.getRangeTo(site) <= 2);
      if (source2Containers.length >= 1 && source2Sites.length > 0) {
        const removed = source2Sites[0].remove();
        if (removed === OK) {
          console.log(`[${Game.time}] ${room.name} removed duplicate S2 ` +
            `container site at ${source2Sites[0].pos.x},` +
            `${source2Sites[0].pos.y}`);
          return true;
        }
      }
    }

    const byExtensions = target =>
      target.pos.getRangeTo(cluster.x, cluster.y) <= 3 &&
      !sources.some(source => source.pos.getRangeTo(target) <= 2) &&
      (!room.controller || target.pos.getRangeTo(room.controller) > 3);
    if (containers.some(byExtensions) || containerSites.some(byExtensions)) {
      return false;
    }

    const containerLimit = CONTROLLER_STRUCTURES[STRUCTURE_CONTAINER]
      [room.controller.level] || 0;
    if (containers.length + containerSites.length >= containerLimit) {
      // Reclaim only an unfinished duplicate where that source already has a
      // completed adjacent container. This preserves every completed buffer.
      const redundantSite = containerSites.find(site => sources.some(source =>
        source.pos.getRangeTo(site) <= 2 &&
        containers.some(container =>
          source.pos.getRangeTo(container) <= 1)));
      if (!redundantSite || redundantSite.remove() !== OK) return false;
      console.log(`[${Game.time}] ${room.name} reallocated unfinished ` +
        `source container site at ${redundantSite.pos.x},` +
        `${redundantSite.pos.y} to the extension cluster`);
    }

    const terrain = room.getTerrain();
    const extensions = structures.filter(structure =>
      structure.structureType === STRUCTURE_EXTENSION && structure.my);
    const candidates = [];
    for (let x = cluster.x - 3; x <= cluster.x + 3; x++) {
      for (let y = cluster.y - 3; y <= cluster.y + 3; y++) {
        if (x < 1 || x > 48 || y < 1 || y > 48 ||
            terrain.get(x, y) === TERRAIN_MASK_WALL ||
            sources.some(source => source.pos.getRangeTo(x, y) <= 2) ||
            room.controller.pos.getRangeTo(x, y) <= 3 ||
            room.lookForAt(LOOK_STRUCTURES, x, y).some(structure =>
              structure.structureType !== STRUCTURE_ROAD &&
              structure.structureType !== STRUCTURE_RAMPART) ||
            room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
        const coverage = extensions.filter(extension =>
          extension.pos.getRangeTo(x, y) <= 1).length;
        if (coverage < 2) continue;
        candidates.push({
          x,
          y,
          coverage,
          clusterTile: isExtensionClusterTile(cluster, x, y),
          centerRange: Math.max(Math.abs(x - cluster.x),
            Math.abs(y - cluster.y))
        });
      }
    }
    candidates.sort((a, b) =>
      Number(a.clusterTile) - Number(b.clusterTile) ||
      b.coverage - a.coverage ||
      a.centerRange - b.centerRange || a.x - b.x || a.y - b.y);
    for (const candidate of candidates) {
      const result = room.createConstructionSite(candidate.x, candidate.y,
        STRUCTURE_CONTAINER);
      if (result === OK) {
        room.memory.extensionContainerPlan = {
          x: candidate.x,
          y: candidate.y,
          placed: Game.time
        };
        console.log(`[${Game.time}] ${room.name} extension container site ` +
          `placed at ${candidate.x},${candidate.y}`);
        return true;
      }
    }
    return false;
  };
  const manageControllerContainer = room => {
    if (!room.controller || !room.controller.my || room.controller.level < 2) {
      return false;
    }
    const controllerContainer = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
        structure.pos.getRangeTo(room.controller) <= 3
    })[0];
    const controllerSite = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_CONTAINER &&
        site.pos.getRangeTo(room.controller) <= 3
    })[0];
    if (controllerContainer || controllerSite) {
      room.memory.controllerContainerPlan = {
        ready: Boolean(controllerContainer),
        siteId: controllerSite && controllerSite.id,
        containerId: controllerContainer && controllerContainer.id
      };
      return true;
    }

    const containers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    });
    const containerLimit = CONTROLLER_STRUCTURES[STRUCTURE_CONTAINER]
      [room.controller.level] || 0;
    let plan = room.memory.controllerContainerPlan;
    if (!plan || (!plan.retireContainerId && !plan.retired)) {
      if (containers.length < containerLimit) {
        plan = { retired: true, ready: false };
      } else {
        const essential = new Set(containers
          .filter(container => getContainerPurpose(room, container.pos))
          .map(container => container.id));
        const trafficTiles = room.memory.traffic && room.memory.traffic.tiles || {};
        const excess = containers
          .filter(container => !essential.has(container.id))
          .sort((a, b) =>
            (trafficTiles[`${a.pos.x}:${a.pos.y}`] || 0) -
              (trafficTiles[`${b.pos.x}:${b.pos.y}`] || 0) ||
            a.id.localeCompare(b.id));
        if (!excess.length) return false;
        plan = {
          ready: false,
          retired: false,
          retireContainerId: excess[0].id,
          retireX: excess[0].pos.x,
          retireY: excess[0].pos.y
        };
        console.log(`[${Game.time}] ${room.name} draining excess container ` +
          `${excess[0].id} at ${excess[0].pos.x},${excess[0].pos.y} ` +
          `for controller container replacement`);
      }
      room.memory.controllerContainerPlan = plan;
    }

    const retiring = Game.getObjectById(plan.retireContainerId);
    if (retiring) {
      if (getContainerPurpose(room, retiring.pos)) {
        delete plan.retireContainerId;
        delete plan.drainCreep;
        plan.retired = false;
        console.log(`[${Game.time}] ${room.name} kept important container at ` +
          `${retiring.pos.x},${retiring.pos.y}`);
        return false;
      }
      if (retiring.store[RESOURCE_ENERGY] > 0) {
        const currentDrainer = Game.creeps[plan.drainCreep];
        const drainers = Object.values(Game.creeps)
          .filter(creep => creep.memory.home === room.name &&
            creep.memory.role === 'hauler' && !creep.spawning)
          .sort((a, b) =>
            b.store.getCapacity(RESOURCE_ENERGY) -
              a.store.getCapacity(RESOURCE_ENERGY) ||
            a.pos.getRangeTo(retiring) - b.pos.getRangeTo(retiring));
        const emptyDrainer = drainers.find(creep =>
          creep.store[RESOURCE_ENERGY] === 0);
        if (emptyDrainer && currentDrainer !== emptyDrainer) {
          plan.drainCreep = emptyDrainer.name;
        } else if (!currentDrainer ||
            currentDrainer.memory.role !== 'hauler') {
          plan.drainCreep = drainers[0] && drainers[0].name;
        }
        return false;
      }
      const result = retiring.destroy();
      if (result !== OK) return false;
      plan.retired = true;
      delete plan.retireContainerId;
      delete plan.drainCreep;
      console.log(`[${Game.time}] ${room.name} removed drained excess container ` +
        `at ${plan.retireX},${plan.retireY}`);
      return true;
    }
    if (!plan.retired) return false;

    const spawn = room.find(FIND_MY_SPAWNS)[0];
    const terrain = room.getTerrain();
    const candidates = [];
    for (let x = room.controller.pos.x - 3;
      x <= room.controller.pos.x + 3; x++) {
      for (let y = room.controller.pos.y - 3;
        y <= room.controller.pos.y + 3; y++) {
        const range = room.controller.pos.getRangeTo(x, y);
        if (x < 0 || x > 49 || y < 0 || y > 49 || range < 1 || range > 3 ||
            terrain.get(x, y) === TERRAIN_MASK_WALL ||
            room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0 ||
            room.lookForAt(LOOK_STRUCTURES, x, y).some(structure =>
              structure.structureType !== STRUCTURE_ROAD &&
              structure.structureType !== STRUCTURE_RAMPART)) continue;
        candidates.push({
          x,
          y,
          score: (spawn ? room.findPath(spawn.pos,
            new RoomPosition(x, y, room.name), {
              ignoreCreeps: true,
              maxOps: 2000
            }).length || spawn.pos.getRangeTo(x, y) * 3 : 0) +
            (terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 10 : 0)
        });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const candidate of candidates) {
      const result = room.createConstructionSite(
        candidate.x, candidate.y, STRUCTURE_CONTAINER);
      if (result === OK) {
        plan.siteX = candidate.x;
        plan.siteY = candidate.y;
        console.log(`[${Game.time}] ${room.name} controller container site ` +
          `placed at ${candidate.x},${candidate.y}`);
        return true;
      }
    }
    return false;
  };
  const isRetiringContainer = (room, structure) =>
    Boolean(room.memory.controllerContainerPlan &&
      room.memory.controllerContainerPlan.retireContainerId === structure.id);

  return {
    isExtensionClusterTile,
    placeExtensionSite,
    getContainerPurpose,
    isExtensionRefillBuffer,
    placeSourceContainerSite,
    manageExtensionContainer,
    manageControllerContainer,
    isRetiringContainer
  };
};

module.exports = { createInfrastructurePlanner };
