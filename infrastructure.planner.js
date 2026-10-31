'use strict';

const createInfrastructurePlanner = ({
  Game, RoomPosition, getRoomSources, isSingleLaneRoadPosition,
  CONTROLLER_STRUCTURES, STRUCTURE_EXTENSION, STRUCTURE_CONTAINER,
  STRUCTURE_STORAGE, STRUCTURE_ROAD, STRUCTURE_RAMPART, FIND_MY_STRUCTURES,
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
    const getClusterCandidates = selectedCluster => {
      if (!selectedCluster) return [];
      const candidates = [];
      for (let radius = 0; radius <= 3; radius++) {
        for (let x = selectedCluster.x - radius;
          x <= selectedCluster.x + radius; x++) {
          for (let y = selectedCluster.y - radius;
            y <= selectedCluster.y + radius; y++) {
            if (Math.max(Math.abs(x - selectedCluster.x),
              Math.abs(y - selectedCluster.y)) !== radius ||
                !isExtensionClusterTile(selectedCluster, x, y) ||
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
      return candidates.sort((a, b) => a.score - b.score);
    };
    const selectCluster = (minRange, maxRange, minUsable, excluded) => {
      const anchors = [];
      for (let x = spawn.pos.x - maxRange;
        x <= spawn.pos.x + maxRange; x++) {
        for (let y = spawn.pos.y - maxRange;
          y <= spawn.pos.y + maxRange; y++) {
          const range = spawn.pos.getRangeTo(x, y);
          if (range < minRange || range > maxRange ||
              x < 4 || x > 45 || y < 4 || y > 45 ||
              excluded.some(existing => Math.max(
                Math.abs(x - existing.x), Math.abs(y - existing.y)) <= 7)) {
            continue;
          }
          const candidateCluster = { x, y };
          let usable = 0;
          let traffic = 0;
          let corridor = 0;
          for (let dx = -3; dx <= 3; dx++) {
            for (let dy = -3; dy <= 3; dy++) {
              const tileX = x + dx;
              const tileY = y + dy;
              if (!isExtensionClusterTile(candidateCluster, tileX, tileY)) {
                continue;
              }
              if (usableExtensionTile(tileX, tileY)) usable++;
              traffic += trafficTiles[`${tileX}:${tileY}`] || 0;
              if (isSingleLaneRoadPosition(room,
                { pos: { x: tileX, y: tileY } })) corridor++;
            }
          }
          if (usable < minUsable) continue;
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
      return anchors[0];
    };
    let cluster = room.memory.extensionCluster;
    if (!cluster || cluster.version !== 'low-traffic-v1') {
      const selected = selectCluster(6, 9, 10, []);
      if (selected) {
        cluster = {
          x: selected.x,
          y: selected.y,
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

    let candidates = getClusterCandidates(cluster);
    const availableSiteSlots = Math.min(3 - extensionSites.length,
      extensionLimit - extensionCount);
    if (candidates.length < availableSiteSlots) {
      let overflow = room.memory.extensionOverflowCluster;
      let overflowCandidates = getClusterCandidates(overflow);
      if (!overflow || overflow.version !== 'overflow-v1' ||
          overflowCandidates.length === 0) {
        const selected = selectCluster(6, 12,
          Math.min(6, extensionLimit - extensionCount), [cluster]);
        overflow = selected && {
          x: selected.x,
          y: selected.y,
          version: 'overflow-v1',
          selected: Game.time
        };
        if (overflow) {
          room.memory.extensionOverflowCluster = overflow;
          console.log(`[${Game.time}] ${room.name} extension overflow ` +
            `cluster -> ${overflow.x},${overflow.y}`);
          overflowCandidates = getClusterCandidates(overflow);
        }
      }
      candidates = candidates.concat(overflowCandidates);
    }
    let placed = 0;
    for (const candidate of candidates) {
      if (placed >= availableSiteSlots) break;
      const result = room.createConstructionSite(
        candidate.x, candidate.y, STRUCTURE_EXTENSION);
      if (result === OK) {
        console.log(`[${Game.time}] Placed extension site in ${room.name} at ${candidate.x},${candidate.y}`);
        placed++;
      }
    }
    return placed > 0;
  };
  const placeStorageSite = room => {
    if (!room.controller || !room.controller.my) return false;
    const storageLimit = CONTROLLER_STRUCTURES[STRUCTURE_STORAGE] &&
      CONTROLLER_STRUCTURES[STRUCTURE_STORAGE][room.controller.level] || 0;
    if (storageLimit <= 0 || room.storage && room.storage.my) return false;
    const storageSite = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_STORAGE
    })[0];
    if (storageSite) {
      room.memory.storagePlan = {
        x: storageSite.pos.x,
        y: storageSite.pos.y,
        siteId: storageSite.id,
        placed: room.memory.storagePlan && room.memory.storagePlan.placed ||
          Game.time
      };
      return false;
    }
    const extensionLimit = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION]
      [room.controller.level] || 0;
    const builtExtensions = room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_EXTENSION
    }).length;
    // Storage is the next milestone, not a parallel build. Finish every
    // extension currently unlocked by this RCL before reserving its site.
    if (builtExtensions < extensionLimit) return false;
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return false;
    const terrain = room.getTerrain();
    const sources = getRoomSources(room);
    const cluster = room.memory.extensionCluster;
    const trafficTiles = room.memory.traffic && room.memory.traffic.tiles || {};
    const usable = (x, y) => x > 1 && x < 48 && y > 1 && y < 48 &&
      terrain.get(x, y) !== TERRAIN_MASK_WALL &&
      room.controller.pos.getRangeTo(x, y) >= 3 &&
      !sources.some(source => source.pos.getRangeTo(x, y) <= 2) &&
      (!cluster || Math.max(Math.abs(x - cluster.x),
        Math.abs(y - cluster.y)) > 3) &&
      !isSingleLaneRoadPosition(room, { pos: { x, y } }) &&
      room.lookForAt(LOOK_STRUCTURES, x, y).every(structure =>
        structure.structureType === STRUCTURE_ROAD ||
        structure.structureType === STRUCTURE_RAMPART) &&
      room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length === 0 &&
      room.lookForAt(LOOK_CREEPS, x, y).length === 0;
    const candidates = [];
    for (let x = spawn.pos.x - 5; x <= spawn.pos.x + 5; x++) {
      for (let y = spawn.pos.y - 5; y <= spawn.pos.y + 5; y++) {
        const spawnRange = spawn.pos.getRangeTo(x, y);
        if (spawnRange < 2 || spawnRange > 5 || !usable(x, y)) continue;
        const clusterRange = cluster
          ? Math.max(Math.abs(x - cluster.x), Math.abs(y - cluster.y)) : 5;
        candidates.push({
          x,
          y,
          score: spawnRange * 5 + Math.abs(clusterRange - 5) * 2 +
            (trafficTiles[`${x}:${y}`] || 0) * 20 +
            (terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 15 : 0)
        });
      }
    }
    candidates.sort((a, b) => a.score - b.score ||
      a.x - b.x || a.y - b.y);
    if (!candidates.length) return false;
    const planned = room.memory.storagePlan;
    const candidate = planned && usable(planned.x, planned.y)
      ? planned : candidates[0];
    room.memory.storagePlan = {
      x: candidate.x,
      y: candidate.y,
      selected: planned && planned.selected || Game.time
    };
    const result = room.createConstructionSite(
      candidate.x, candidate.y, STRUCTURE_STORAGE);
    if (result !== OK) return false;
    room.memory.storagePlan.placed = Game.time;
    console.log(`[${Game.time}] ${room.name} storage site placed at ` +
      `${candidate.x},${candidate.y} after ${builtExtensions} extensions`);
    return true;
  };
  const getExtensionClusters = room => [
    { key: 'primary', anchor: room.memory.extensionCluster },
    { key: 'overflow', anchor: room.memory.extensionOverflowCluster }
  ].filter(entry => entry.key !== (room.memory.controllerContainerPairPlan &&
    room.memory.controllerContainerPairPlan.sacrificeClusterKey) &&
    entry.anchor && Number.isInteger(entry.anchor.x) &&
    Number.isInteger(entry.anchor.y));
  const isExtensionBufferPosition = (room, position) => {
    const plans = [room.memory.extensionContainerPlan,
      ...Object.values(room.memory.extensionContainerPlans || {})]
      .filter(Boolean);
    if (plans.some(plan => position.x === plan.x && position.y === plan.y)) {
      return true;
    }
    const nearCluster = getExtensionClusters(room).some(({ anchor }) =>
      Math.max(Math.abs(position.x - anchor.x),
        Math.abs(position.y - anchor.y)) <= 3);
    if (!nearCluster) return false;
    return !getRoomSources(room).some(source =>
      source.pos.getRangeTo(position) <= 2) &&
      (!room.controller || room.controller.pos.getRangeTo(position) > 3);
  };
  const getBorderRelayPurpose = (room, position) => {
    const plans = room.memory.borderRelayPlans || {};
    const entry = Object.values(plans).find(plan => plan &&
      plan.x === position.x && plan.y === position.y);
    return entry ? `relay:${entry.remoteRoom}` : null;
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
    if (isExtensionBufferPosition(room, position)) return 'extensions';
    const relayPurpose = getBorderRelayPurpose(room, position);
    if (relayPurpose) return relayPurpose;
    return null;
  };

  const getImportantContainerGaps = room => {
    const structures = room.find(FIND_STRUCTURES);
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const containers = structures.filter(structure =>
      structure.structureType === STRUCTURE_CONTAINER);
    const containerSites = sites.filter(site =>
      site.structureType === STRUCTURE_CONTAINER);
    const gaps = [];
    for (const source of getRoomSources(room)) {
      if (!containers.some(container => source.pos.getRangeTo(container) <= 2) &&
          !containerSites.some(site => source.pos.getRangeTo(site) <= 2)) {
        gaps.push(`source:${source.id}`);
      }
    }
    if (room.controller && room.controller.my &&
        !containers.some(container =>
          container.pos.getRangeTo(room.controller) <= 3) &&
        !containerSites.some(site => site.pos.getRangeTo(room.controller) <= 3)) {
      gaps.push('controller');
    }
    for (const { key, anchor } of getExtensionClusters(room)) {
      const hasExtensions = structures.some(structure => structure.my &&
        structure.structureType === STRUCTURE_EXTENSION &&
        Math.max(Math.abs(structure.pos.x - anchor.x),
          Math.abs(structure.pos.y - anchor.y)) <= 3);
      if (!hasExtensions) continue;
      const validBuffer = target =>
        Math.max(Math.abs(target.pos.x - anchor.x),
          Math.abs(target.pos.y - anchor.y)) <= 3 &&
        !getRoomSources(room).some(source =>
          source.pos.getRangeTo(target) <= 2) &&
        (!room.controller || target.pos.getRangeTo(room.controller) > 3);
      if (!containers.some(validBuffer) && !containerSites.some(validBuffer)) {
        gaps.push(`extensions:${key}`);
      }
    }
    return gaps;
  };

  const placeBorderRelaySite = (room, interRoomTravelPaths = {}) => {
    if (!room.controller || !room.controller.my || room.controller.level < 2) {
      return false;
    }
    const importantGaps = getImportantContainerGaps(room);
    room.memory.borderRelayBlockedBy = importantGaps;
    if (importantGaps.length > 0) return false;
    const containerLimit = CONTROLLER_STRUCTURES[STRUCTURE_CONTAINER]
      [room.controller.level] || 0;
    const containers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    });
    const containerSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_CONTAINER
    });
    if (containers.length + containerSites.length >= containerLimit) {
      room.memory.borderRelayFreeSlots = 0;
      return false;
    }
    room.memory.borderRelayFreeSlots = containerLimit - containers.length -
      containerSites.length;
    const routes = [
      { key: 'left', survey: room.memory.leftSurvey },
      { key: 'south', survey: room.memory.southSurvey },
      { key: 'southwest', survey: room.memory.southwestSurvey }
    ].filter(entry => entry.survey && entry.survey.active &&
      entry.survey.targetRoom);
    if (!room.memory.borderRelayPlans) room.memory.borderRelayPlans = {};
    const plans = room.memory.borderRelayPlans;
    for (const route of routes) {
      const remoteRoom = route.survey.targetRoom;
      const current = plans[remoteRoom];
      if (current) {
        const built = containers.some(container =>
          container.pos.x === current.x && container.pos.y === current.y);
        const pending = containerSites.some(site =>
          site.pos.x === current.x && site.pos.y === current.y);
        if (built || pending) continue;
        delete plans[remoteRoom];
      }
      const usage = new Map();
      for (const path of interRoomTravelPaths[room.name] || []) {
        if (!String(path.label || '').startsWith(`${route.key}-`)) continue;
        for (const point of path.points || []) {
          const edge = Math.min(point.x, point.y, 49 - point.x, 49 - point.y);
          if (edge < 1 || edge > 3) continue;
          const key = `${point.x}:${point.y}`;
          const entry = usage.get(key) || { x: point.x, y: point.y,
            uses: 0, edge };
          entry.uses++;
          usage.set(key, entry);
        }
      }
      const candidates = [...usage.values()].filter(candidate => {
        const structures = room.lookForAt(LOOK_STRUCTURES,
          candidate.x, candidate.y);
        const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES,
          candidate.x, candidate.y);
        return structures.every(structure =>
          structure.structureType === STRUCTURE_ROAD ||
          structure.structureType === STRUCTURE_RAMPART) && sites.length === 0;
      }).sort((a, b) => b.uses - a.uses || a.edge - b.edge ||
        a.x - b.x || a.y - b.y);
      const candidate = candidates[0];
      if (!candidate) continue;
      if (room.createConstructionSite(candidate.x, candidate.y,
        STRUCTURE_CONTAINER) !== OK) continue;
      plans[remoteRoom] = {
        remoteRoom,
        route: route.key,
        x: candidate.x,
        y: candidate.y,
        placed: Game.time
      };
      console.log(`[${Game.time}] ${room.name} border relay for ` +
        `${remoteRoom} at ${candidate.x},${candidate.y}`);
      return true;
    }
    return false;
  };
  const describeContainer = (room, container) => {
    const purpose = getContainerPurpose(room, container.pos);
    const sourceId = purpose && purpose.startsWith('source:')
      ? purpose.slice('source:'.length) : null;
    return {
      id: container.id,
      kind: sourceId ? 'source' : purpose || 'unknown',
      sourceId: sourceId || undefined,
      x: container.pos.x,
      y: container.pos.y
    };
  };
  const refreshContainerPurposes = room => {
    const containers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    });
    const byId = Object.fromEntries(containers.map(container => {
      const descriptor = describeContainer(room, container);
      return [container.id, descriptor];
    }));
    room.memory.containerPurposes = { updated: Game.time, byId };
    return room.memory.containerPurposes;
  };
  const isExtensionRefillBuffer = (room, structure) => {
    if (!structure || structure.structureType !== STRUCTURE_CONTAINER) {
      return false;
    }
    return isExtensionBufferPosition(room, structure.pos);
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
    const structures = room.find(FIND_STRUCTURES);
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const containers = structures.filter(structure =>
      structure.structureType === STRUCTURE_CONTAINER);
    const containerSites = sites.filter(site =>
      site.structureType === STRUCTURE_CONTAINER);
    const sources = getRoomSources(room);
    const extensions = structures.filter(structure =>
      structure.structureType === STRUCTURE_EXTENSION && structure.my);
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

    const missingCluster = getExtensionClusters(room).find(({ anchor }) => {
      const hasExtensions = extensions.some(extension =>
        extension.pos.getRangeTo(anchor.x, anchor.y) <= 3);
      const byExtensions = target =>
        target.pos.getRangeTo(anchor.x, anchor.y) <= 3 &&
        !sources.some(source => source.pos.getRangeTo(target) <= 2) &&
        (!room.controller || target.pos.getRangeTo(room.controller) > 3);
      return hasExtensions && !containers.some(byExtensions) &&
        !containerSites.some(byExtensions);
    });
    if (!missingCluster) return false;
    const { key: clusterKey, anchor: cluster } = missingCluster;

    const containerLimit = CONTROLLER_STRUCTURES[STRUCTURE_CONTAINER]
      [room.controller.level] || 0;
    if (containers.length + containerSites.length >= containerLimit) {
      // Reclaim only an unfinished duplicate where that source already has a
      // completed adjacent container. This preserves every completed buffer.
      const redundantSite = containerSites.find(site => sources.some(source =>
        source.pos.getRangeTo(site) <= 2 &&
        containers.some(container =>
          source.pos.getRangeTo(container) <= 1)));
      if (redundantSite && redundantSite.remove() === OK) {
        console.log(`[${Game.time}] ${room.name} reallocated unfinished ` +
          `source container site at ${redundantSite.pos.x},` +
          `${redundantSite.pos.y} to the extension cluster`);
      } else {
        let replacement = room.memory.extensionContainerReplacement;
        if (replacement && replacement.clusterKey !== clusterKey) {
          replacement = null;
          delete room.memory.extensionContainerReplacement;
        }
        const retiring = replacement &&
          Game.getObjectById(replacement.retireContainerId);
        if (retiring) {
          if (retiring.store[RESOURCE_ENERGY] > 0) return false;
          if (retiring.destroy() !== OK) return false;
          replacement.retired = true;
          delete replacement.retireContainerId;
          console.log(`[${Game.time}] ${room.name} removed drained duplicate ` +
            `source container for ${clusterKey} extension buffer`);
          return true;
        }
        if (!replacement || !replacement.retired) {
          const redundantContainers = sources.flatMap(source => {
            const nearby = containers.filter(container =>
              source.pos.getRangeTo(container) <= 2).sort((a, b) =>
              source.pos.getRangeTo(a) - source.pos.getRangeTo(b) ||
              b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
            return nearby.slice(1);
          }).sort((a, b) => a.store[RESOURCE_ENERGY] -
            b.store[RESOURCE_ENERGY] || a.id.localeCompare(b.id));
          const redundant = redundantContainers[0];
          if (!redundant) return false;
          room.memory.extensionContainerReplacement = {
            clusterKey,
            retireContainerId: redundant.id,
            retireX: redundant.pos.x,
            retireY: redundant.pos.y,
            started: Game.time
          };
          console.log(`[${Game.time}] ${room.name} draining duplicate source ` +
            `container ${redundant.id} for ${clusterKey} extensions`);
          return false;
        }
      }
    }

    const terrain = room.getTerrain();
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
        if (!room.memory.extensionContainerPlans) {
          room.memory.extensionContainerPlans = {};
        }
        const plan = {
          x: candidate.x,
          y: candidate.y,
          placed: Game.time
        };
        room.memory.extensionContainerPlans[clusterKey] = plan;
        if (clusterKey === 'primary') room.memory.extensionContainerPlan = plan;
        delete room.memory.extensionContainerReplacement;
        console.log(`[${Game.time}] ${room.name} extension container site ` +
          `placed for ${clusterKey} at ${candidate.x},${candidate.y}`);
        return true;
      }
    }
    return false;
  };
  const manageControllerContainer = room => {
    if (!room.controller || !room.controller.my || room.controller.level < 2) {
      return false;
    }
    const containers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    });
    const controllerContainers = containers.filter(structure =>
      structure.pos.getRangeTo(room.controller) <= 3);
    const controllerSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_CONTAINER &&
        site.pos.getRangeTo(room.controller) <= 3
    });
    const activateControllerPair = (primary, secondary, pairPlan) => {
      pairPlan.ready = true;
      pairPlan.secondaryId = secondary.id;
      delete pairPlan.siteId;
      room.memory.controllerContainerPlan = {
        version: 3,
        ready: true,
        containerId: primary.id,
        containerIds: [primary.id, secondary.id],
        desiredX: primary.pos.x,
        desiredY: primary.pos.y,
        destinations: [
          { id: primary.id, x: primary.pos.x, y: primary.pos.y },
          { id: secondary.id, x: secondary.pos.x, y: secondary.pos.y }
        ]
      };
      return true;
    };
    const terrain = room.getTerrain();
    const origin = room.storage || room.find(FIND_MY_SPAWNS)[0];
    const usableStandingTile = (x, y) => {
      if (x < 1 || x > 48 || y < 1 || y > 48 ||
          terrain.get(x, y) === TERRAIN_MASK_WALL ||
          room.controller.pos.getRangeTo(x, y) > 3) return false;
      return !room.lookForAt(LOOK_STRUCTURES, x, y).some(structure =>
        structure.structureType !== STRUCTURE_ROAD &&
        structure.structureType !== STRUCTURE_RAMPART &&
        structure.structureType !== STRUCTURE_CONTAINER);
    };
    const candidates = [];
    for (let x = room.controller.pos.x - 3;
      x <= room.controller.pos.x + 3; x++) {
      for (let y = room.controller.pos.y - 3;
        y <= room.controller.pos.y + 3; y++) {
        const controllerRange = room.controller.pos.getRangeTo(x, y);
        if (x < 1 || x > 48 || y < 1 || y > 48 ||
            controllerRange < 1 || controllerRange > 3 ||
            terrain.get(x, y) === TERRAIN_MASK_WALL ||
            room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)
              .some(site => site.structureType !== STRUCTURE_CONTAINER) ||
            room.lookForAt(LOOK_STRUCTURES, x, y).some(structure =>
              structure.structureType !== STRUCTURE_ROAD &&
              structure.structureType !== STRUCTURE_RAMPART &&
              structure.structureType !== STRUCTURE_CONTAINER)) continue;
        let standingTiles = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if ((dx || dy) && usableStandingTile(x + dx, y + dy)) {
              standingTiles++;
            }
          }
        }
        if (standingTiles < 3) continue;
        const supplyDistance = origin
          ? room.findPath(origin.pos, new RoomPosition(x, y, room.name), {
            ignoreCreeps: true, maxOps: 2000
          }).length || origin.pos.getRangeTo(x, y) * 3
          : 0;
        candidates.push({
          x, y, standingTiles, controllerRange, supplyDistance,
          swamp: terrain.get(x, y) === TERRAIN_MASK_SWAMP
        });
      }
    }
    candidates.sort((a, b) =>
      b.standingTiles - a.standingTiles ||
      Math.abs(a.controllerRange - 2) - Math.abs(b.controllerRange - 2) ||
      Number(a.swamp) - Number(b.swamp) ||
      a.supplyDistance - b.supplyDistance || a.x - b.x || a.y - b.y);
    const existingPairPlan = room.memory.controllerContainerPairPlan;
    // Pair creation can retire an extension-clump container, so discovering a
    // long brigade is not sufficient authorization. Existing pairs remain
    // maintainable; new destructive migrations require an explicit room flag.
    const pairEnabled = room.memory.controllerContainerPairEnabled === true;
    const wantsPair = pairEnabled ||
      existingPairPlan && existingPairPlan.version === 2;
    const primary = wantsPair && (Game.getObjectById(
      room.memory.controllerContainerPlan &&
        room.memory.controllerContainerPlan.containerId) ||
      controllerContainers.slice().sort((a, b) =>
        b.store.getUsedCapacity(RESOURCE_ENERGY) -
          a.store.getUsedCapacity(RESOURCE_ENERGY) ||
        a.id.localeCompare(b.id))[0]);
    if (primary) {
      const readyExistingSecondary = existingPairPlan &&
        existingPairPlan.version === 2 &&
        existingPairPlan.primaryId === primary.id &&
        Number.isInteger(existingPairPlan.secondaryX) &&
        Number.isInteger(existingPairPlan.secondaryY) &&
        Number.isInteger(existingPairPlan.branchX) &&
        Number.isInteger(existingPairPlan.branchY) &&
        controllerContainers.find(container =>
          container.pos.x === existingPairPlan.secondaryX &&
          container.pos.y === existingPairPlan.secondaryY);
      if (readyExistingSecondary) {
        return activateControllerPair(primary, readyExistingSecondary,
          existingPairPlan);
      }
      const secondCandidates = candidates.map(candidate => {
        let stationaryLineCreeps = Infinity;
        let branch;
        const branchOptions = [];
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const branchX = candidate.x + dx;
            const branchY = candidate.y + dy;
            if (!usableStandingTile(branchX, branchY)) continue;
            const lowerBound = room.storage.pos.getRangeTo(branchX, branchY) +
              Math.max(0, primary.pos.getRangeTo(branchX, branchY) - 1);
            if (lowerBound <= 17) branchOptions.push({
              x: branchX, y: branchY, lowerBound
            });
          }
        }
        branchOptions.sort((a, b) => a.lowerBound - b.lowerBound ||
          a.x - b.x || a.y - b.y);
        for (const option of branchOptions) {
          const branchPosition = new RoomPosition(option.x, option.y,
            room.name);
          const pathOptions = {
            ignoreCreeps: true, plainCost: 1, swampCost: 1,
            maxOps: 4000, maxRooms: 1
          };
          const required = room.findPath(room.storage.pos, branchPosition,
            { ...pathOptions, range: 0 }).length +
            room.findPath(branchPosition, primary.pos,
              { ...pathOptions, range: 1 }).length;
          if (required <= 17) {
            stationaryLineCreeps = required;
            branch = { x: option.x, y: option.y };
            break;
          }
        }
        return { ...candidate, stationaryLineCreeps, branch };
      }).filter(candidate =>
        primary.pos.getRangeTo(candidate.x, candidate.y) >= 4 &&
        candidate.stationaryLineCreeps <= 17)
        .sort((a, b) => b.standingTiles - a.standingTiles ||
          a.stationaryLineCreeps - b.stationaryLineCreeps ||
          b.x - a.x || b.y - a.y ||
          Math.abs(a.controllerRange - 2) -
            Math.abs(b.controllerRange - 2) ||
          Number(a.swamp) - Number(b.swamp) ||
          a.supplyDistance - b.supplyDistance);
      const second = existingPairPlan && existingPairPlan.version === 2 &&
        secondCandidates.find(candidate =>
          candidate.x === existingPairPlan.secondaryX &&
          candidate.y === existingPairPlan.secondaryY) ||
        secondCandidates[0];
      if (!second) return false;
      let pairPlan = existingPairPlan;
      if (!pairPlan || pairPlan.version !== 2 ||
          pairPlan.primaryId !== primary.id ||
          pairPlan.secondaryX !== second.x ||
          pairPlan.secondaryY !== second.y) {
        pairPlan = {
          ...existingPairPlan,
          version: 2,
          mode: 'stationary-branch',
          sacrificeClusterKey: 'overflow',
          primaryId: primary.id,
          primaryX: primary.pos.x,
          primaryY: primary.pos.y,
          secondaryX: second.x,
          secondaryY: second.y,
          separation: primary.pos.getRangeTo(second.x, second.y),
          standingTiles: second.standingTiles,
          stationaryLineCreeps: second.stationaryLineCreeps,
          branchX: second.branch.x,
          branchY: second.branch.y,
          selected: Game.time
        };
        room.memory.controllerContainerPairPlan = pairPlan;
      }
      const readySecondary = controllerContainers.find(container =>
        container.pos.x === second.x && container.pos.y === second.y);
      if (readySecondary) {
        return activateControllerPair(primary, readySecondary, pairPlan);
      }
      const readySecondarySite = controllerSites.find(site =>
        site.pos.x === second.x && site.pos.y === second.y);
      if (readySecondarySite) {
        pairPlan.siteId = readySecondarySite.id;
        return true;
      }
      const obsoleteSecondarySite = existingPairPlan &&
        controllerSites.find(site => site.id === existingPairPlan.siteId);
      let removedObsoleteSite = false;
      if (obsoleteSecondarySite && !pairEnabled) return false;
      if (obsoleteSecondarySite && obsoleteSecondarySite.remove() === OK) {
        removedObsoleteSite = true;
        console.log(`[${Game.time}] ${room.name} moved unfinished second ` +
          `controller container site to fit the stationary 16-creep line`);
      }
      const containerLimit = CONTROLLER_STRUCTURES[STRUCTURE_CONTAINER]
        [room.controller.level] || 0;
      const activeControllerSiteCount = controllerSites.length -
        Number(removedObsoleteSite);
      if (containers.length + activeControllerSiteCount >= containerLimit) {
        if (!pairEnabled) return false;
        const overflow = room.memory.extensionOverflowCluster;
        const retired = overflow && containers.filter(container =>
          container.id !== primary.id &&
          container.pos.getRangeTo(overflow.x, overflow.y) <= 3 &&
          !getRoomSources(room).some(source =>
            source.pos.getRangeTo(container) <= 2) &&
          container.pos.getRangeTo(room.controller) > 3)
          .sort((a, b) => a.pos.getRangeTo(overflow.x, overflow.y) -
            b.pos.getRangeTo(overflow.x, overflow.y) ||
            a.id.localeCompare(b.id))[0];
        if (!retired) return false;
        const releasedEnergy = retired.store[RESOURCE_ENERGY] || 0;
        if (retired.destroy() !== OK) return false;
        pairPlan.retiredExtensionId = retired.id;
        pairPlan.retiredExtensionX = retired.pos.x;
        pairPlan.retiredExtensionY = retired.pos.y;
        pairPlan.retiredAt = Game.time;
        pairPlan.releasedEnergy = releasedEnergy;
        console.log(`[${Game.time}] ${room.name} removed overflow-clump ` +
          `container ${retired.id} at ${retired.pos.x},${retired.pos.y}; ` +
          `${releasedEnergy} energy released for recovery`);
      }
      const pairResult = room.createConstructionSite(second.x, second.y,
        STRUCTURE_CONTAINER);
      if (pairResult !== OK) return false;
      const site = room.lookForAt(LOOK_CONSTRUCTION_SITES,
        second.x, second.y).find(candidate =>
        candidate.structureType === STRUCTURE_CONTAINER);
      if (site) pairPlan.siteId = site.id;
      pairPlan.placed = Game.time;
      console.log(`[${Game.time}] ${room.name} second controller ` +
        `container site at ${second.x},${second.y}; separation ` +
        `${pairPlan.separation}, standing tiles ${second.standingTiles}`);
      return true;
    }
    const best = candidates[0];
    if (!best) return false;
    const atBest = object => object && object.pos.x === best.x &&
      object.pos.y === best.y;
    const readyContainer = controllerContainers.find(atBest);
    const readySite = controllerSites.find(atBest);
    if (readyContainer) {
      room.memory.controllerContainerPlan = {
        version: 2, ready: true, containerId: readyContainer.id,
        desiredX: best.x, desiredY: best.y,
        standingTiles: best.standingTiles
      };
      return true;
    }

    let plan = room.memory.controllerContainerPlan;
    if (!plan || plan.version !== 2 || plan.desiredX !== best.x ||
        plan.desiredY !== best.y) {
      plan = {
        version: 2, ready: false, relocation: true,
        desiredX: best.x, desiredY: best.y,
        standingTiles: best.standingTiles
      };
      room.memory.controllerContainerPlan = plan;
    }
    if (readySite) {
      plan.siteId = readySite.id;
      return true;
    }

    const containerLimit = CONTROLLER_STRUCTURES[STRUCTURE_CONTAINER]
      [room.controller.level] || 0;
    const retiring = Game.getObjectById(plan.retireContainerId);
    if (retiring) {
      const releasedEnergy = retiring.store[RESOURCE_ENERGY] || 0;
      const result = retiring.destroy();
      if (result !== OK) return false;
      plan.retired = true;
      delete plan.retireContainerId;
      delete plan.drainCreep;
      console.log(`[${Game.time}] ${room.name} removed controller ` +
        `container at ${retiring.pos.x},${retiring.pos.y} for better access; ` +
        `${releasedEnergy} energy released for local recovery`);
      return true;
    }

    if (containers.length >= containerLimit && !plan.retired) {
      const oldControllerContainer = controllerContainers
        .sort((a, b) => a.pos.getRangeTo(best.x, best.y) -
          b.pos.getRangeTo(best.x, best.y))[0];
      if (!oldControllerContainer) return false;
      plan.retireContainerId = oldControllerContainer.id;
      plan.retireX = oldControllerContainer.pos.x;
      plan.retireY = oldControllerContainer.pos.y;
      console.log(`[${Game.time}] ${room.name} draining controller container ` +
        `${oldControllerContainer.id} at ${plan.retireX},${plan.retireY}; ` +
        `best tile is ${best.x},${best.y} with ` +
        `${best.standingTiles} standing tiles`);
      return false;
    }

    const result = room.createConstructionSite(best.x, best.y,
      STRUCTURE_CONTAINER);
    if (result === OK) {
      plan.siteX = best.x;
      plan.siteY = best.y;
      console.log(`[${Game.time}] ${room.name} controller container site ` +
        `placed at optimal tile ${best.x},${best.y}`);
      return true;
    }
    return false;
  };
  const isRetiringContainer = (room, structure) => Boolean(
    room.memory.controllerContainerPlan &&
      room.memory.controllerContainerPlan.retireContainerId === structure.id ||
    room.memory.extensionContainerReplacement &&
      room.memory.extensionContainerReplacement.retireContainerId ===
        structure.id);

  return {
    isExtensionClusterTile,
    placeExtensionSite,
    placeStorageSite,
    getContainerPurpose,
    describeContainer,
    refreshContainerPurposes,
    isExtensionRefillBuffer,
    placeSourceContainerSite,
    manageExtensionContainer,
    manageControllerContainer,
    getImportantContainerGaps,
    placeBorderRelaySite,
    isRetiringContainer
  };
};

module.exports = { createInfrastructurePlanner };
