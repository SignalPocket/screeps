'use strict';

/**
 * Plan and operate the RCL5 energy automation layer.
 *
 * Placement pairs each link with the container it serves: a controller-side
 * link/container pair and an extension-side link/container pair. Roads are
 * queued beside those handoffs so carriers can reach them. Runtime transfer
 * logic balances energy between the two sides; it does not redefine staffing
 * or tell creeps to upgrade, refill, or build.
 *
 * Structures and construction sites are counted together during placement.
 * This prevents a duplicate site from being proposed where the corresponding
 * completed structure already exists.
 */
const createRcl5Infrastructure = ({
  Game, getRoomSources, getRoomStructures, getRoomStructuresByType,
  getRoomSitesByType, getContainerPurpose, CONTROLLER_STRUCTURES,
  STRUCTURE_LINK, STRUCTURE_TOWER, STRUCTURE_CONTAINER, STRUCTURE_ROAD,
  STRUCTURE_RAMPART,
  FIND_STRUCTURES, FIND_MY_STRUCTURES, FIND_MY_CONSTRUCTION_SITES,
  FIND_MY_SPAWNS,
  TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP, LOOK_STRUCTURES,
  LOOK_CONSTRUCTION_SITES, RESOURCE_ENERGY, OK
}) => {
  const range = (position, target) => position.getRangeTo(target.pos || target);
  const isNearExtensionCluster = (room, x, y) => [
    room.memory.extensionCluster
  ].filter(Boolean).some(cluster => Math.max(
    Math.abs(x - cluster.x), Math.abs(y - cluster.y)) <= 3);
  const isOpen = (room, x, y) => x > 1 && x < 48 && y > 1 && y < 48 &&
    room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL &&
    room.lookForAt(LOOK_STRUCTURES, x, y).every(structure =>
      structure.structureType === STRUCTURE_RAMPART) &&
    room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length === 0;
  const structuresOfType = (room, type) =>
    (getRoomStructuresByType
      ? getRoomStructuresByType(room, type)
      : room.find(FIND_MY_STRUCTURES, {
        filter: structure => structure.structureType === type
      })).filter(structure => structure.my !== false);
  const sitesOfType = (room, type) => getRoomSitesByType
    ? getRoomSitesByType(room, type)
    : room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === type
    });
  const structuresAndSites = (room, type) => [
    ...structuresOfType(room, type), ...sitesOfType(room, type)
  ];
  const linkLimit = room => CONTROLLER_STRUCTURES[STRUCTURE_LINK] &&
    CONTROLLER_STRUCTURES[STRUCTURE_LINK][room.controller.level] || 0;

  const getPurposeContainers = (room, purpose) =>
    (getRoomStructuresByType
      ? getRoomStructuresByType(room, STRUCTURE_CONTAINER)
      : room.find(FIND_STRUCTURES, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER
      })).filter(structure =>
      getContainerPurpose(room, structure.pos) === purpose);
  const isAdjacentToPurposeContainer = (room, link, purpose) =>
    getPurposeContainers(room, purpose).some(container =>
      container.pos.getRangeTo(link) === 1);
  const isSourceLink = (room, link) => getRoomSources(room).some(source =>
    source.pos.getRangeTo(link) <= 2);
  const isExtensionLink = (room, link) => {
    const plan = room.memory.linkNetworkPlan;
    const matchesLegacyPlan = plan &&
      (plan.purpose === 'spawn' || plan.purpose === 'extensions') &&
      plan.x === link.pos.x && plan.y === link.pos.y;
    return matchesLegacyPlan ||
      getPurposeContainers(room, 'extensions').some(container =>
        container.pos.getRangeTo(link) <= 2);
  };
  const isControllerLink = (room, link) =>
    getPurposeContainers(room, 'controller').some(container =>
      // Older RCL 5 layouts placed the endpoint one tile outside the newer
      // two-tile planner radius. Accept it instead of orphaning a built link.
      container.pos.getRangeTo(link) <= 3);
  // Keep the old name for callers and rooms that already have a controller
  // endpoint recorded as the network hub.
  const isHubLink = isControllerLink;
  const getSourceLink = (room, source) => structuresOfType(room, STRUCTURE_LINK)
    .filter(structure => source.pos.getRangeTo(structure) <= 2)
    .sort((a, b) => source.pos.getRangeTo(a) -
    source.pos.getRangeTo(b))[0] || null;

  const migrateMisplacedLink = room => {
    const links = structuresOfType(room, STRUCTURE_LINK);
    const purposes = [
      { purpose: 'controller', identifies: link =>
        isControllerLink(room, link) },
      { purpose: 'extensions', identifies: link =>
        isExtensionLink(room, link) }
    ];
    for (const entry of purposes) {
      if (links.some(link =>
        isAdjacentToPurposeContainer(room, link, entry.purpose))) continue;
      const legacy = links.find(entry.identifies);
      if (!legacy) continue;
      const stored = legacy.store && legacy.store[RESOURCE_ENERGY] || 0;
      room.memory.linkMigration = {
        updated: Game.time,
        purpose: entry.purpose,
        linkId: legacy.id,
        servedContainerIds: getPurposeContainers(room, entry.purpose)
          .map(container => container.id),
        status: stored > 0 ? 'draining' : 'ready-to-remove',
        stored
      };
      // Never destroy stored energy. Existing consumers keep withdrawing
      // while runLinks refuses to refill a retiring endpoint.
      if (stored > 0 || typeof legacy.destroy !== 'function') return false;
      if (legacy.destroy() !== OK) return false;
      room.memory.linkMigration.status = 'removed';
      console.log(`[${Game.time}] ${room.name} removed misplaced ` +
        `${entry.purpose} link ${legacy.id}; rebuilding beside container`);
      return true;
    }
    return false;
  };

  const placeLinkSite = room => {
    if (!room.controller || !room.controller.my ||
        room.controller.level < 5) return false;
    if (migrateMisplacedLink(room)) return true;
    const links = structuresAndSites(room, STRUCTURE_LINK);
    if (links.length >= linkLimit(room)) return false;
    const terrain = room.getTerrain();
    const plannedController = links.some(link => isControllerLink(room, link));
    const plannedExtensions = links.some(link =>
      isExtensionLink(room, link));
    let purpose;
    if (!plannedController) {
      purpose = 'controller';
    } else if (!plannedExtensions) {
      purpose = 'extensions';
    } else return false;
    const containers = getPurposeContainers(room, purpose);
    if (!containers.length) return false;
    const candidates = [];
    for (const container of containers) {
      for (let x = container.pos.x - 1; x <= container.pos.x + 1; x++) {
        for (let y = container.pos.y - 1; y <= container.pos.y + 1; y++) {
          const containerRange = container.pos.getRangeTo(x, y);
          if (containerRange !== 1 ||
              !isOpen(room, x, y)) continue;
          candidates.push({ x, y, score: containerRange * 5 +
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
    const anchor = room.storage || (getRoomStructures
      ? getRoomStructures(room).find(structure =>
        structure.my && structure.structureType === 'spawn')
      : room.find(FIND_MY_SPAWNS)[0]);
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
    const links = structuresOfType(room, STRUCTURE_LINK);
    const controllerLink = links.filter(link => isControllerLink(room, link))
      .sort((a, b) => Math.min(...getPurposeContainers(room, 'controller')
        .map(container => container.pos.getRangeTo(a))) -
        Math.min(...getPurposeContainers(room, 'controller')
          .map(container => container.pos.getRangeTo(b))))[0] || null;
    const extensionLink = links.filter(link => isExtensionLink(room, link))
      .sort((a, b) => Math.min(...getPurposeContainers(room, 'extensions')
        .map(container => container.pos.getRangeTo(a))) -
        Math.min(...getPurposeContainers(room, 'extensions')
          .map(container => container.pos.getRangeTo(b))))[0] || null;
    const retiringLinkId = room.memory.linkMigration &&
      room.memory.linkMigration.status === 'draining'
      ? room.memory.linkMigration.linkId : null;
    let transfers = 0;
    let sender;
    let receiver;
    let requestedAmount = 0;
    const spawnDemand = Math.max(0,
      (room.energyCapacityAvailable || 0) - (room.energyAvailable || 0));
    const controllerDemand = getPurposeContainers(room, 'controller')
      .reduce((total, container) => {
        if (!container.store ||
            typeof container.store.getCapacity !== 'function') return total;
        const capacity = container.store.getCapacity(RESOURCE_ENERGY) || 0;
        return total + Math.max(0,
          capacity * 0.75 - container.store[RESOURCE_ENERGY]);
      }, 0);
    if (controllerLink && extensionLink && spawnDemand > 0 &&
        controllerDemand === 0 &&
        extensionLink.id !== retiringLinkId &&
        controllerLink.store[RESOURCE_ENERGY] > 0) {
      // The brigade fills the controller side first. Only after every
      // controller container reaches its 75% working reserve is link energy
      // surplus; that excess is then beamed to the spawn/extension endpoint.
      sender = controllerLink;
      receiver = extensionLink;
      requestedAmount = spawnDemand;
    } else if (controllerLink && extensionLink && spawnDemand === 0 &&
        controllerLink.id !== retiringLinkId &&
        controllerDemand > 0 && extensionLink.store[RESOURCE_ENERGY] >= 200) {
      // Reverse only after the spawn network is healthy. This keeps link
      // balancing bidirectional without exporting energy extensions need.
      sender = extensionLink;
      receiver = controllerLink;
      requestedAmount = controllerDemand;
    }
    if (sender && sender.cooldown === 0) {
      const amount = Math.min(sender.store[RESOURCE_ENERGY],
        receiver.store.getFreeCapacity(RESOURCE_ENERGY), requestedAmount);
      if (amount > 0 && sender.transferEnergy(receiver, amount) === OK) {
        transfers = 1;
      }
    }
    room.memory.linkNetworkStatus = {
      updated: Game.time, controller: controllerLink && controllerLink.id,
      extensions: extensionLink && extensionLink.id, transfers,
      direction: sender && receiver ? `${sender.id}->${receiver.id}` : null,
      spawnDemand, controllerDemand
    };
    return { controllerLink, extensionLink, transfers };
  };

  const selectControllerLinkHandoff = (room, targetRatio = 0.75) => {
    const links = structuresOfType(room, STRUCTURE_LINK)
      .filter(structure => isControllerLink(room, structure) &&
        structure.store[RESOURCE_ENERGY] > 0);
    const containers = getPurposeContainers(room, 'controller')
      .filter(container => {
        const capacity = container.store.getCapacity(RESOURCE_ENERGY) || 0;
        return capacity > 0 && container.store[RESOURCE_ENERGY] <
          capacity * targetRatio;
      })
      .sort((a, b) => {
        const aCapacity = a.store.getCapacity(RESOURCE_ENERGY) || 1;
        const bCapacity = b.store.getCapacity(RESOURCE_ENERGY) || 1;
        return a.store[RESOURCE_ENERGY] / aCapacity -
          b.store[RESOURCE_ENERGY] / bCapacity;
      });
    if (!links.length || !containers.length) return null;
    const target = containers[0];
    const source = links.sort((a, b) =>
      target.pos.getRangeTo(a) - target.pos.getRangeTo(b))[0];
    return { source, target };
  };

  const selectControllerLinkFeed = (room, retainRatio = 0.75) => {
    const spawnDemand = Math.max(0,
      (room.energyCapacityAvailable || 0) - (room.energyAvailable || 0));
    if (spawnDemand <= 0) return null;
    const target = structuresOfType(room, STRUCTURE_LINK)
      .find(structure => isControllerLink(room, structure) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    if (!target) return null;
    const candidates = getPurposeContainers(room, 'controller')
      .map(source => {
        const capacity = source.store.getCapacity(RESOURCE_ENERGY) || 0;
        const retained = Math.ceil(capacity * retainRatio);
        return { source, available: Math.max(0,
          source.store[RESOURCE_ENERGY] - retained) };
      })
      .filter(candidate => candidate.available > 0)
      .sort((a, b) => b.available - a.available ||
        a.source.pos.getRangeTo(target) - b.source.pos.getRangeTo(target));
    if (!candidates.length) return null;
    return {
      source: candidates[0].source,
      target,
      amount: Math.min(candidates[0].available,
        target.store.getFreeCapacity(RESOURCE_ENERGY), spawnDemand)
    };
  };

  return { isSourceLink, isHubLink, isControllerLink, isExtensionLink,
    getSourceLink, isAdjacentToPurposeContainer, migrateMisplacedLink,
    placeLinkSite, placeTowerSite, runLinks, selectControllerLinkHandoff,
    selectControllerLinkFeed };
};

module.exports = { createRcl5Infrastructure };
