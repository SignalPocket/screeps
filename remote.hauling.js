'use strict';
const { planHaulCapacity } = typeof Game === 'undefined'
  ? require('./logistics.capacity') : require('logistics.capacity');

const isRoomBorder = (position, margin = 1) => Boolean(position) &&
  Math.min(position.x, position.y, 49 - position.x, 49 - position.y) <= margin;

/**
 * Choose the first home handoff for a returning remote carrier.
 *
 * A purpose-built relay remains the strongest destination because it names the
 * outpost this load came from. Without one, distance wins: an eligible
 * container closer than storage receives the load, while storage wins an exact
 * tie. The caller retains the chosen object for the rest of the delivery.
 */
const selectHomeDeliveryTarget = ({ candidates, storage, preferredRelay,
  distance }) => {
  if (preferredRelay && candidates.includes(preferredRelay)) {
    return preferredRelay;
  }
  return candidates.slice().sort((a, b) =>
    distance(a) - distance(b) ||
    Number(b === storage) - Number(a === storage) ||
    String(a.id).localeCompare(String(b.id)))[0] || null;
};

// An assigned lane must not lose all vision merely because every carrier
// waits at home for that same vision. One empty roster carrier reopens it.
const shouldProbeRemoteVision = ({creep,creeps,targetRoomName,readiness,
  RESOURCE_ENERGY}) => {
  if(readiness.ready || readiness.reason!=='room not visible' ||
      creep.memory.remoteRoom!==targetRoomName || creep.memory.remoteRosterSurplus ||
      creep.store[RESOURCE_ENERGY]>0)return false;
  const home=creep.memory.remoteHome||creep.memory.home;
  const leader=creeps.filter(c=>c.memory.role==='remote-hauler'&&!c.spawning&&
    !c.memory.remoteRosterSurplus&&c.memory.remoteRoom===targetRoomName&&
    (c.memory.remoteHome||c.memory.home)===home&&c.store[RESOURCE_ENERGY]===0)
    .sort((a,b)=>a.name.localeCompare(b.name))[0];
  return leader?.name===creep.name;
};

const createRemoteHauling = ({
  Game, PathFinder, buildBody, FIND_SOURCES, FIND_STRUCTURES,
  FIND_MY_SPAWNS, STRUCTURE_CONTAINER, RESOURCE_ENERGY, CARRY,
  CARRY_CAPACITY, ENERGY_REGEN_TIME, hasRemoteReplacementLife = () => true
}) => {
  const getRemoteResourceSummary = targetRoomName => {
    const remoteRoom = Game.rooms[targetRoomName];
    if (!remoteRoom) return {
      roomName: targetRoomName,
      visible: false,
      storedEnergy: 0,
      containerCount: 0,
      richestSlot: 0
    };
    const sources = remoteRoom.find(FIND_SOURCES)
      .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    const containers = remoteRoom.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
        sources.some(source => source.pos.getRangeTo(structure) <= 2)
    });
    const richest = containers.slice().sort((a, b) =>
      b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY] ||
      a.id.localeCompare(b.id))[0];
    const richestSlot = richest ? Math.max(0, sources.findIndex(source =>
      source.pos.getRangeTo(richest) <= 2)) : 0;
    return {
      roomName: targetRoomName,
      visible: true,
      storedEnergy: containers.reduce((total, container) =>
        total + container.store[RESOURCE_ENERGY], 0),
      containerCount: containers.length,
      richestSlot,
      richestContainerId: richest && richest.id
    };
  };

  const rankRemoteDispatchRooms = (targetRoomNames, claimedByRoom = {}) =>
    [...new Set(targetRoomNames)].map(getRemoteResourceSummary)
      .map(summary => ({
        ...summary,
        availableEnergy: Math.max(0, summary.storedEnergy -
          (claimedByRoom[summary.roomName] || 0))
      }))
      .filter(summary => summary.visible && summary.containerCount > 0)
      .sort((a, b) => b.availableEnergy - a.availableEnergy ||
        b.storedEnergy - a.storedEnergy ||
        a.roomName.localeCompare(b.roomName));

  const getRemoteHaulReadiness = (targetRoomName, slot) => {
    const remoteRoom = Game.rooms[targetRoomName];
    if (!remoteRoom) return { ready: false, reason: 'room not visible' };
    const sources = remoteRoom.find(FIND_SOURCES)
      .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    const home = Object.values(Game.rooms).find(room =>
      room.memory && room.memory.remoteHaulRoutes && room.memory.remoteHaulRoutes[targetRoomName]);
    const mapped = home && home.memory.remoteHaulRoutes[targetRoomName].slotSources;
    const planned = home && home.memory.remoteHaulRoutes[targetRoomName];
    const sourceId = planned && planned.lanes && mapped && planned.lanes[mapped[slot]]?.sourceId;
    const source = sources.find(source => source.id === sourceId) ||
      sources[slot % Math.max(1, sources.length)];
    if (!source) return { ready: false, reason: 'source not visible' };
    const container = source.pos.findInRange(FIND_STRUCTURES, 2, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    }).sort((a, b) =>
      b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY] ||
      source.pos.getRangeTo(a) - source.pos.getRangeTo(b))[0];
    if (!container) return { ready: false, reason: 'container unfinished' };
    return {
      ready: true,
      source,
      container,
      reason: container.store[RESOURCE_ENERGY] > 0
        ? `container ${container.store[RESOURCE_ENERGY]}`
        : 'container ready; waiting for energy'
    };
  };

  const getRemoteHaulerTarget = (homeRoomName, targetRoomName) => {
    const homeRoom = Game.rooms[homeRoomName];
    const remoteRoom = Game.rooms[targetRoomName];
    if (!homeRoom || !remoteRoom) return 1;
    const sources = remoteRoom.find(FIND_SOURCES);
    const containers = remoteRoom.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER &&
        sources.some(source => source.pos.getRangeTo(structure) <= 2)
    });
    if (!containers.length) return Math.max(1, sources.length);
    const spawn = homeRoom.find(FIND_MY_SPAWNS)[0];
    const haulSources = sources.slice().sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y).filter(source => containers.some(container =>
      source.pos.getRangeTo(container) <= 2));
    const body = buildBody('remote-hauler', homeRoom.energyCapacityAvailable) ||
      buildBody('remote-hauler', homeRoom.energyAvailable);
    const carryCapacity = Math.max(CARRY_CAPACITY,
      (body || []).filter(part => part === CARRY).length * CARRY_CAPACITY);
    if (!homeRoom.memory.remoteHaulRoutes) {
      homeRoom.memory.remoteHaulRoutes = {};
    }
    let routePlan = homeRoom.memory.remoteHaulRoutes[targetRoomName];
    const signature = 'capacity-v1:' + haulSources.map(source => source.id).join(':');
    if (!routePlan || routePlan.signature !== signature ||
        routePlan.carryCapacity !== carryCapacity ||
        Game.time - (routePlan.updated || 0) >= 1000) {
      const linearDistance = Math.max(1,
        Game.map.getRoomLinearDistance(homeRoomName, targetRoomName));
      const routeLengths = haulSources.map(source => {
        if (!spawn) return linearDistance * 50;
        const search = PathFinder.search(source.pos, {
          pos: spawn.pos,
          range: 1
        }, {
          maxRooms: linearDistance + 2,
          maxOps: 12000,
          plainCost: 2,
          swampCost: 10
        });
        const route = Game.map.findRoute && Game.map.findRoute(homeRoomName, targetRoomName);
        const fallback = Math.max(1, Array.isArray(route) ? route.length : linearDistance) * 50;
        return search.incomplete ? Math.max(fallback, search.path.length)
          : search.path.length || fallback;
      });
      routePlan = { updated: Game.time, signature, carryCapacity, routeLengths,
        slotSources: routePlan && routePlan.signature === signature ? routePlan.slotSources : [] };
      homeRoom.memory.remoteHaulRoutes[targetRoomName] = routePlan;
    }
    const oldSlots = routePlan.slotSources || [];
    const stats = homeRoom.memory.haulTripStats && homeRoom.memory.haulTripStats[targetRoomName];
    const lanes = haulSources.map((source, index) => {
      const observations = Object.entries(stats && stats.slots || {})
        .filter(([slot, value]) => Game.time - value.updated <= 1500 &&
          (value.sourceId ? value.sourceId === source.id :
            (oldSlots[Number(slot)] ?? Number(slot) % haulSources.length) === index))
        .map(([, value]) => value);
      const estimated = Math.max(20, (routePlan.routeLengths[index] || 50) * 2 + 10);
      const measured = observations.length
        ? observations.reduce((sum, value) => sum + value.roundTripTicks, 0) / observations.length
        : null;
      return { sourceId: source.id, production: source.energyCapacity / ENERGY_REGEN_TIME,
        backlog: containers.filter(container => source.pos.getRangeTo(container) <= 2)
          .reduce((sum, container) => sum + container.store[RESOURCE_ENERGY], 0),
        roundTripTicks: measured || estimated, basis: measured ? 'observed' : 'path estimate',
        utilization: observations.length ? Math.min(0.95, observations.reduce(
          (sum, value) => sum + value.loadRatio, 0) / observations.length) : 0.85 };
    });
    const carriers = Object.values(Game.creeps || {}).filter(creep =>
      creep.memory.role === 'remote-hauler' &&
      (creep.memory.remoteHome || creep.memory.home) === homeRoomName &&
      creep.memory.remoteRoom === targetRoomName && hasRemoteReplacementLife(creep))
      .map(creep => ({ slot: creep.memory.remoteHaulerSlot,
        capacity: creep.store.getCapacity(RESOURCE_ENERGY) }));
    const capacityPlan = planHaulCapacity({ lanes, carriers, newCapacity: carryCapacity,
      previousSlots: oldSlots });
    Object.assign(routePlan, capacityPlan, { planned: Game.time, carryCapacity });
    const target = capacityPlan.target;
    return target;
  };

  return {
    getRemoteResourceSummary,
    rankRemoteDispatchRooms,
    getRemoteHaulReadiness,
    getRemoteHaulerTarget
  };
};

module.exports = {
  createRemoteHauling,
  isRoomBorder,
  selectHomeDeliveryTarget,
  shouldProbeRemoteVision
};
