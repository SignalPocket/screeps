'use strict';

const createRemoteHauling = ({
  Game, PathFinder, buildBody, FIND_SOURCES, FIND_STRUCTURES,
  FIND_MY_SPAWNS, STRUCTURE_CONTAINER, RESOURCE_ENERGY, CARRY,
  CARRY_CAPACITY, ENERGY_REGEN_TIME
}) => {
  const getRemoteHaulReadiness = (targetRoomName, slot) => {
    const remoteRoom = Game.rooms[targetRoomName];
    if (!remoteRoom) return { ready: false, reason: 'room not visible' };
    const sources = remoteRoom.find(FIND_SOURCES)
      .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    const source = sources[slot % Math.max(1, sources.length)];
    if (!source) return { ready: false, reason: 'source not visible' };
    const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    })[0];
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
    const haulSources = sources.filter(source => containers.some(container =>
      source.pos.getRangeTo(container) <= 2));
    const body = buildBody('remote-hauler', homeRoom.energyCapacityAvailable) ||
      buildBody('remote-hauler', homeRoom.energyAvailable);
    const carryCapacity = Math.max(CARRY_CAPACITY,
      (body || []).filter(part => part === CARRY).length * CARRY_CAPACITY);
    if (!homeRoom.memory.remoteHaulRoutes) {
      homeRoom.memory.remoteHaulRoutes = {};
    }
    let routePlan = homeRoom.memory.remoteHaulRoutes[targetRoomName];
    const signature = haulSources.map(source => source.id).sort().join(':');
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
        return search.path.length || linearDistance * 50;
      });
      routePlan = { updated: Game.time, signature, carryCapacity, routeLengths };
      homeRoom.memory.remoteHaulRoutes[targetRoomName] = routePlan;
    }
    const throughputEnergy = haulSources.reduce((total, source, index) => {
      const production = source.energyCapacity / ENERGY_REGEN_TIME;
      const roundTripTicks = Math.max(20,
        (routePlan.routeLengths[index] || 25) * 2 + 10);
      return total + production * roundTripTicks;
    }, 0);
    const routeTarget = Math.max(haulSources.length,
      Math.ceil(throughputEnergy / carryCapacity));
    const highestPressure = Math.max(...containers.map(container => {
      const capacity = container.store.getCapacity(RESOURCE_ENERGY) || 1;
      return container.store[RESOURCE_ENERGY] / capacity;
    }));
    const pressureSurge = highestPressure >= 0.75 ? 2 :
      highestPressure >= 0.5 ? 1 : 0;
    const target = Math.min(haulSources.length * 6,
      routeTarget + pressureSurge);
    if (routePlan.target !== target) {
      console.log(`[${Game.time}] ${targetRoomName} remote hauling -> ` +
        `${target} carriers; routes ${routePlan.routeLengths.join('/')} ` +
        `tiles, cargo ${carryCapacity}, pressure ` +
        `${Math.round(highestPressure * 100)}%`);
      routePlan.target = target;
    }
    return target;
  };

  return { getRemoteHaulReadiness, getRemoteHaulerTarget };
};

module.exports = { createRemoteHauling };
