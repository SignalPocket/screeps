'use strict';

const createRcl5Infrastructure = ({
  Game, getRoomSources, CONTROLLER_STRUCTURES,
  STRUCTURE_LINK, STRUCTURE_TOWER, STRUCTURE_ROAD, STRUCTURE_RAMPART,
  FIND_MY_STRUCTURES, FIND_MY_CONSTRUCTION_SITES, FIND_MY_SPAWNS,
  TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP, LOOK_STRUCTURES,
  LOOK_CONSTRUCTION_SITES, RESOURCE_ENERGY, OK
}) => {
  const range = (position, target) => position.getRangeTo(target.pos || target);
  const isNearExtensionCluster = (room, x, y) => [
    room.memory.extensionCluster, room.memory.extensionOverflowCluster
  ].filter(Boolean).some(cluster => Math.max(
    Math.abs(x - cluster.x), Math.abs(y - cluster.y)) <= 3);
  const isOpen = (room, x, y) => x > 1 && x < 48 && y > 1 && y < 48 &&
    room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL &&
    room.lookForAt(LOOK_STRUCTURES, x, y).every(structure =>
      structure.structureType === STRUCTURE_RAMPART) &&
    room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length === 0;
  const structuresAndSites = (room, type) => [
    ...room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === type
    }),
    ...room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === type
    })
  ];
  const linkLimit = room => CONTROLLER_STRUCTURES[STRUCTURE_LINK] &&
    CONTROLLER_STRUCTURES[STRUCTURE_LINK][room.controller.level] || 0;

  const isSourceLink = (room, link) => getRoomSources(room).some(source =>
    source.pos.getRangeTo(link) <= 2);
  const isHubLink = (room, link) => !isSourceLink(room, link) &&
    room.controller && room.controller.pos.getRangeTo(link) <= 3;
  const getSourceLink = (room, source) => room.find(FIND_MY_STRUCTURES, {
    filter: structure => structure.structureType === STRUCTURE_LINK &&
      source.pos.getRangeTo(structure) <= 2
  }).sort((a, b) => source.pos.getRangeTo(a) -
    source.pos.getRangeTo(b))[0] || null;

  const placeLinkSite = room => {
    if (!room.controller || !room.controller.my ||
        room.controller.level < 5) return false;
    const links = structuresAndSites(room, STRUCTURE_LINK);
    if (links.length >= linkLimit(room)) return false;
    const sources = getRoomSources(room);
    const terrain = room.getTerrain();
    const plannedHub = links.some(link => isHubLink(room, link));
    let candidates = [];
    let purpose;
    if (!plannedHub) {
      purpose = 'hub';
      for (let x = room.controller.pos.x - 3;
        x <= room.controller.pos.x + 3; x++) {
        for (let y = room.controller.pos.y - 3;
          y <= room.controller.pos.y + 3; y++) {
          const controllerRange = room.controller.pos.getRangeTo(x, y);
          if (controllerRange < 1 || controllerRange > 3 ||
              !isOpen(room, x, y) || isNearExtensionCluster(room, x, y) ||
              sources.some(source => source.pos.getRangeTo(x, y) <= 2)) {
            continue;
          }
          const storageRange = room.storage
            ? room.storage.pos.getRangeTo(x, y) : 20;
          candidates.push({ x, y, score: controllerRange * 5 + storageRange +
            (terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 10 : 0) });
        }
      }
    } else {
      const anchor = room.storage || room.find(FIND_MY_SPAWNS)[0] ||
        room.controller;
      const uncovered = sources.filter(source => !links.some(link =>
        source.pos.getRangeTo(link) <= 2)).sort((a, b) =>
        anchor.pos.getRangeTo(b) - anchor.pos.getRangeTo(a));
      const source = uncovered[0];
      if (!source) return false;
      purpose = `source:${source.id}`;
      for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
        for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
          if (x === source.pos.x && y === source.pos.y ||
              !isOpen(room, x, y)) continue;
          candidates.push({ x, y, score: anchor.pos.getRangeTo(x, y) +
            (terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 10 : 0) });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score || a.x - b.x || a.y - b.y);
    for (const candidate of candidates) {
      if (room.createConstructionSite(candidate.x, candidate.y,
        STRUCTURE_LINK) !== OK) continue;
      room.memory.linkNetworkPlan = {
        updated: Game.time, purpose, x: candidate.x, y: candidate.y
      };
      console.log(`[${Game.time}] ${room.name} ${purpose} link site at ` +
        `${candidate.x},${candidate.y}`);
      return true;
    }
    return false;
  };

  const placeTowerSite = room => {
    if (!room.controller || !room.controller.my) return false;
    const limit = CONTROLLER_STRUCTURES[STRUCTURE_TOWER] &&
      CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
    const towers = structuresAndSites(room, STRUCTURE_TOWER);
    if (towers.length >= limit) return false;
    const anchor = room.storage || room.find(FIND_MY_SPAWNS)[0];
    if (!anchor) return false;
    const sources = getRoomSources(room);
    const terrain = room.getTerrain();
    const candidates = [];
    for (let x = anchor.pos.x - 5; x <= anchor.pos.x + 5; x++) {
      for (let y = anchor.pos.y - 5; y <= anchor.pos.y + 5; y++) {
        const anchorRange = anchor.pos.getRangeTo(x, y);
        if (anchorRange < 2 || anchorRange > 5 || !isOpen(room, x, y) ||
            isNearExtensionCluster(room, x, y) ||
            room.controller.pos.getRangeTo(x, y) <= 2 ||
            sources.some(source => source.pos.getRangeTo(x, y) <= 2)) continue;
        const nearestTower = towers.length ? Math.min(...towers.map(tower =>
          tower.pos.getRangeTo(x, y))) : 5;
        candidates.push({ x, y, score: anchorRange * 3 - nearestTower +
          (terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 10 : 0) });
      }
    }
    candidates.sort((a, b) => a.score - b.score || a.x - b.x || a.y - b.y);
    for (const candidate of candidates) {
      if (room.createConstructionSite(candidate.x, candidate.y,
        STRUCTURE_TOWER) !== OK) continue;
      room.memory.towerPlan = { updated: Game.time,
        x: candidate.x, y: candidate.y, target: towers.length + 1 };
      console.log(`[${Game.time}] ${room.name} tower ${towers.length + 1} ` +
        `site at ${candidate.x},${candidate.y}`);
      return true;
    }
    return false;
  };

  const runLinks = room => {
    const links = room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_LINK
    });
    const hub = links.filter(link => isHubLink(room, link))
      .sort((a, b) => room.controller.pos.getRangeTo(a) -
        room.controller.pos.getRangeTo(b))[0];
    if (!hub) return { hub: null, transfers: 0 };
    let transfers = 0;
    for (const sourceLink of links.filter(link => isSourceLink(room, link))) {
      if (sourceLink.cooldown > 0 || sourceLink.store[RESOURCE_ENERGY] < 200) {
        continue;
      }
      const free = hub.store.getFreeCapacity(RESOURCE_ENERGY);
      if (free < 200) break;
      const amount = Math.min(sourceLink.store[RESOURCE_ENERGY], free);
      if (amount <= 0) break;
      if (sourceLink.transferEnergy(hub, amount) === OK) {
        transfers++;
        break;
      }
    }
    room.memory.linkNetworkStatus = {
      updated: Game.time, hub: hub.id,
      sources: links.filter(link => isSourceLink(room, link)).map(link =>
        link.id), transfers
    };
    return { hub, transfers };
  };

  return { isSourceLink, isHubLink, getSourceLink,
    placeLinkSite, placeTowerSite, runLinks };
};

module.exports = { createRcl5Infrastructure };
