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

  const getPrimarySpawn = room => room.find(FIND_MY_SPAWNS)
    .sort((a, b) => a.id.localeCompare(b.id))[0] || null;
  const isSourceLink = (room, link) => getRoomSources(room).some(source =>
    source.pos.getRangeTo(link) <= 2);
  const isSpawnLink = (room, link) => {
    const spawn = getPrimarySpawn(room);
    return Boolean(spawn && spawn.pos.getRangeTo(link) <= 2);
  };
  const isControllerLink = (room, link) => room.controller &&
    room.controller.pos.getRangeTo(link) <= 3 && !isSpawnLink(room, link);
  // Keep the old name for callers and rooms that already have a controller
  // endpoint recorded as the network hub.
  const isHubLink = isControllerLink;
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
    const terrain = room.getTerrain();
    const spawn = getPrimarySpawn(room);
    const plannedController = links.some(link => isControllerLink(room, link));
    const plannedSpawn = links.some(link => isSpawnLink(room, link));
    let candidates = [];
    let purpose;
    if (!plannedController) {
      purpose = 'controller';
      for (let x = room.controller.pos.x - 3;
        x <= room.controller.pos.x + 3; x++) {
        for (let y = room.controller.pos.y - 3;
          y <= room.controller.pos.y + 3; y++) {
          const controllerRange = room.controller.pos.getRangeTo(x, y);
          if (controllerRange < 1 || controllerRange > 3 ||
              !isOpen(room, x, y) || isNearExtensionCluster(room, x, y) ||
              spawn && spawn.pos.getRangeTo(x, y) <= 2) {
            continue;
          }
          const storageRange = room.storage
            ? room.storage.pos.getRangeTo(x, y) : 20;
          candidates.push({ x, y, score: controllerRange * 5 + storageRange +
            (terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 10 : 0) });
        }
      }
    } else if (!plannedSpawn && spawn) {
      purpose = 'spawn';
      for (let x = spawn.pos.x - 2; x <= spawn.pos.x + 2; x++) {
        for (let y = spawn.pos.y - 2; y <= spawn.pos.y + 2; y++) {
          const spawnRange = spawn.pos.getRangeTo(x, y);
          if (spawnRange < 1 || spawnRange > 2 ||
              room.controller.pos.getRangeTo(x, y) <= 3 ||
              !isOpen(room, x, y)) continue;
          const storageRange = room.storage
            ? room.storage.pos.getRangeTo(x, y) : 10;
          candidates.push({ x, y, score: spawnRange * 5 + storageRange +
            (terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 10 : 0) });
        }
      }
    } else return false;
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
    const controllerLink = links.filter(link => isControllerLink(room, link))
      .sort((a, b) => room.controller.pos.getRangeTo(a) -
        room.controller.pos.getRangeTo(b))[0];
    const spawn = getPrimarySpawn(room);
    const spawnLink = links.filter(link => isSpawnLink(room, link))
      .sort((a, b) => spawn.pos.getRangeTo(a) -
        spawn.pos.getRangeTo(b))[0];
    if (!controllerLink || !spawnLink) {
      return { controllerLink: controllerLink || null,
        spawnLink: spawnLink || null, transfers: 0 };
    }
    let transfers = 0;
    let sender;
    let receiver;
    if (controllerLink.store[RESOURCE_ENERGY] < 400 &&
        spawnLink.store[RESOURCE_ENERGY] >= 200) {
      sender = spawnLink;
      receiver = controllerLink;
    }
    if (sender && sender.cooldown === 0) {
      const amount = Math.min(sender.store[RESOURCE_ENERGY],
        receiver.store.getFreeCapacity(RESOURCE_ENERGY));
      if (amount > 0 && sender.transferEnergy(receiver, amount) === OK) {
        transfers = 1;
      }
    }
    room.memory.linkNetworkStatus = {
      updated: Game.time, controller: controllerLink.id,
      spawn: spawnLink.id, transfers,
      direction: sender && receiver ? `${sender.id}->${receiver.id}` : null
    };
    return { controllerLink, spawnLink, transfers };
  };

  return { isSourceLink, isHubLink, isControllerLink, isSpawnLink,
    getSourceLink,
    placeLinkSite, placeTowerSite, runLinks };
};

module.exports = { createRcl5Infrastructure };
