'use strict';

const runTowers = ({ rooms, RESOURCE_ENERGY, FIND_MY_STRUCTURES,
  FIND_HOSTILE_CREEPS, FIND_MY_CREEPS, FIND_STRUCTURES, STRUCTURE_TOWER,
  STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_WALL, STRUCTURE_RAMPART,
  ATTACK, RANGED_ATTACK, HEAL, WORK, CLAIM, reserveRatio = 0.5 }) => {
  const statuses = {};
  const threatScore = creep => [
    [HEAL, 8], [RANGED_ATTACK, 6], [ATTACK, 5], [WORK, 2], [CLAIM, 1]
  ].reduce((total, [part, weight]) => total +
    (part && creep.getActiveBodyparts ? creep.getActiveBodyparts(part) : 0) *
      weight, 0);

  for (const room of rooms) {
    if (!room.controller || !room.controller.my) continue;
    const towers = room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_TOWER
    }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    const status = {
      towers: towers.length,
      hostileCount: hostiles.length,
      mode: towers.length > 0 ? 'idle' : 'none',
      targetId: null,
      actions: 0
    };
    statuses[room.name] = status;
    if (towers.length === 0) continue;

    if (hostiles.length > 0) {
      const target = hostiles.slice().sort((a, b) =>
        threatScore(b) - threatScore(a) || a.hits - b.hits ||
        towers[0].pos.getRangeTo(a) - towers[0].pos.getRangeTo(b) ||
        String(a.id).localeCompare(String(b.id)))[0];
      status.mode = 'attack';
      status.targetId = target.id;
      for (const tower of towers) {
        if (tower.store[RESOURCE_ENERGY] > 0 && tower.attack(target) === 0) {
          status.actions++;
        }
      }
      continue;
    }

    const injured = room.find(FIND_MY_CREEPS, {
      filter: creep => creep.hits < creep.hitsMax
    }).sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax ||
      a.hits - b.hits || String(a.id || a.name).localeCompare(
        String(b.id || b.name)));
    if (injured.length > 0) {
      status.mode = 'heal';
      status.targetId = injured[0].id || injured[0].name;
      for (const tower of towers) {
        if (tower.store[RESOURCE_ENERGY] > 0 &&
            tower.heal(injured[0]) === 0) status.actions++;
      }
      continue;
    }

    const excludedRepairTypes = new Set([STRUCTURE_ROAD, STRUCTURE_CONTAINER,
      STRUCTURE_WALL, STRUCTURE_RAMPART]);
    const repairTargets = room.find(FIND_STRUCTURES, {
      filter: structure => structure.my && structure.hits !== undefined &&
        structure.hits < structure.hitsMax * 0.5 &&
        !excludedRepairTypes.has(structure.structureType)
    }).sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax ||
      a.hits - b.hits || String(a.id).localeCompare(String(b.id)));
    if (repairTargets.length === 0) continue;

    for (const tower of towers) {
      const capacity = tower.store.getCapacity(RESOURCE_ENERGY);
      if (capacity > 0 && tower.store[RESOURCE_ENERGY] >=
          capacity * reserveRatio && tower.repair(repairTargets[0]) === 0) {
        status.actions++;
      }
    }
    if (status.actions > 0) {
      status.mode = 'repair';
      status.targetId = repairTargets[0].id;
    }
  }
  return statuses;
};

module.exports = { runTowers };
