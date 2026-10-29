'use strict';

const createColonyDashboard = ({
  Game, Memory, getWorkerLimits, getRoomStructures, shortRoles,
  maxSpawnWait, RESOURCE_ENERGY, STRUCTURE_SPAWN, STRUCTURE_EXTENSION,
  FIND_DROPPED_RESOURCES
}) => {
  const compact = value => value >= 1000
    ? `${(value / 1000).toFixed(1).replace('.0', '')}k` : `${value}`;

  const updateDashboard = creeps => {
    if (Game.time % 5 !== 0) return Memory.colonyDashboard;
    const ownedRooms = Object.values(Game.rooms).filter(room =>
      room.controller && room.controller.my);
    let populationNeed = 0;
    let replacementNeed = 0;
    const spawnWaits = [];
    for (const room of ownedRooms) {
      const current = creeps.filter(creep =>
        creep.memory.home === room.name).length;
      const target = getWorkerLimits(room).workerLimit;
      const gap = Math.max(0, target - current);
      populationNeed += gap;
      if (room.memory.spawnWaitRole) {
        const role = shortRoles[room.memory.spawnWaitRole] ||
          room.memory.spawnWaitRole;
        const waited = Number.isInteger(room.memory.spawnWaitSince)
          ? Math.max(0, Game.time - room.memory.spawnWaitSince) : 0;
        const limit = Number.isInteger(room.memory.spawnWaitLimit)
          ? room.memory.spawnWaitLimit : maxSpawnWait;
        spawnWaits.push(`${role} ${waited}/${limit}t`);
        if (gap === 0) replacementNeed++;
      }
    }
    const readyEnergy = ownedRooms.reduce((total, room) =>
      total + room.energyAvailable, 0);
    const readyCapacity = ownedRooms.reduce((total, room) =>
      total + room.energyCapacityAvailable, 0);
    const reserveEnergy = Object.values(Game.rooms).reduce((total, room) =>
      total + getRoomStructures(room).filter(structure => structure.store &&
        !(structure.my &&
          (structure.structureType === STRUCTURE_SPAWN ||
            structure.structureType === STRUCTURE_EXTENSION)))
        .reduce((sum, structure) =>
          sum + (structure.store[RESOURCE_ENERGY] || 0), 0), 0);
    const carriedEnergy = creeps.reduce((total, creep) =>
      total + creep.store[RESOURCE_ENERGY], 0);
    const looseEnergy = Object.values(Game.rooms).reduce((total, room) =>
      total + room.find(FIND_DROPPED_RESOURCES, {
        filter: resource => resource.resourceType === RESOURCE_ENERGY
      }).reduce((sum, resource) => sum + resource.amount, 0), 0);
    const totalEnergy = readyEnergy + reserveEnergy + carriedEnergy +
      looseEnergy;
    const spawning = Object.values(Game.spawns).filter(spawn =>
      spawn.spawning).length;
    const needed = populationNeed + replacementNeed;
    const dashboard = {
      updated: Game.time,
      creeps: creeps.length,
      spawning,
      needed,
      waits: spawnWaits,
      totalEnergy,
      readyEnergy,
      readyCapacity,
      reserveEnergy,
      carriedEnergy,
      looseEnergy
    };
    Memory.colonyDashboard = dashboard;
    if (Game.time % 25 === 0) {
      console.log(`[${Game.time}] Colony | Creeps ${creeps.length} ` +
        `(spawning ${spawning}, need ${needed}` +
        `${spawnWaits.length ? `, wait ${spawnWaits.join(',')}` : ''}) | ` +
        `Energy ${compact(totalEnergy)} total ` +
        `(ready ${readyEnergy}/${readyCapacity}, ` +
        `reserve ${compact(reserveEnergy)}, ` +
        `carried ${compact(carriedEnergy)}, ` +
        `loose ${compact(looseEnergy)})`);
    }
    return dashboard;
  };

  const drawDashboard = () => {
    const dashboard = Memory.colonyDashboard;
    if (!dashboard) return;
    const waitText = dashboard.waits && dashboard.waits.length
      ? `Wait ${dashboard.waits.join(' | ')}` : 'Wait none';
    for (const room of Object.values(Game.rooms).filter(candidate =>
      candidate.controller && candidate.controller.my)) {
      room.visual.rect(0.5, 20.5, 15.5, 4.9, {
        fill: '#101820', opacity: 0.82, stroke: '#64d2ff',
        strokeWidth: 0.08
      });
      room.visual.text('COLONY', 1.2, 21.3, {
        align: 'left', color: '#64d2ff', font: 'bold 0.65'
      });
      room.visual.text(
        `Creeps ${dashboard.creeps} | spawning ${dashboard.spawning} | ` +
          `need ${dashboard.needed}`,
        1.2, 22.2,
        { align: 'left', color: '#ffffff', font: 0.55 }
      );
      room.visual.text(waitText, 1.2, 23.05, {
        align: 'left', color: dashboard.waits && dashboard.waits.length
          ? '#ff9f0a' : '#30d158', font: 0.55
      });
      room.visual.text(
        `Energy ${compact(dashboard.totalEnergy)} | ready ` +
          `${dashboard.readyEnergy}/${dashboard.readyCapacity}`,
        1.2, 23.9,
        { align: 'left', color: '#ffd60a', font: 0.55 }
      );
      room.visual.text(
        `Reserve ${compact(dashboard.reserveEnergy)} | carry ` +
          `${compact(dashboard.carriedEnergy)} | loose ` +
          `${compact(dashboard.looseEnergy)}`,
        1.2, 24.75,
        { align: 'left', color: '#d1d1d6', font: 0.5 }
      );
    }
  };

  return { updateDashboard, drawDashboard };
};

module.exports = { createColonyDashboard };
