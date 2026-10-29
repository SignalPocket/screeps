'use strict';

const createMemoryMaintenance = ({ Game }) => {
  const runMemoryMaintenance = memory => {
    const stats = {
      deadCreeps: 0,
      staleNavigation: 0,
      staleCommitments: 0,
      staleRoomState: 0
    };
    if (!memory.creeps) memory.creeps = {};
    for (const [name, creepMemory] of Object.entries(memory.creeps)) {
      const creep = Game.creeps[name];
      if (!creep) {
        delete memory.creeps[name];
        stats.deadCreeps++;
        continue;
      }
      if (Number.isInteger(creepMemory.navLastTick) &&
          creepMemory.navLastTick < Game.time - 100) {
        for (const key of ['navGoal', 'navStuck', 'navLastX', 'navLastY',
          'navLastRoom', 'navLastTick', 'navPrevX', 'navPrevY',
          'navPrevRoom', '_move']) {
          delete creepMemory[key];
        }
        stats.staleNavigation++;
      }
      const commitment = creepMemory.dispatchCommitment;
      if (commitment && commitment.roomName &&
          Game.rooms[commitment.roomName] && commitment.targetId &&
          !Game.getObjectById(commitment.targetId)) {
        delete creepMemory.dispatchCommitment;
        stats.staleCommitments++;
      }
    }

    for (const roomMemory of Object.values(memory.rooms || {})) {
      let changed = false;
      if (roomMemory.refillCarrier &&
          !Game.creeps[roomMemory.refillCarrier]) {
        delete roomMemory.refillCarrier;
        changed = true;
      }
      if (Array.isArray(roomMemory.refillCarriers)) {
        const active = roomMemory.refillCarriers.filter(name =>
          Game.creeps[name]);
        if (active.length !== roomMemory.refillCarriers.length) {
          roomMemory.refillCarriers = active;
          changed = true;
        }
        if (active.length === 0) delete roomMemory.refillCarriers;
      }
      if (!roomMemory.spawnWaitRole) {
        if (roomMemory.spawnWaitSince !== undefined ||
            roomMemory.spawnWaitLimit !== undefined) changed = true;
        delete roomMemory.spawnWaitSince;
        delete roomMemory.spawnWaitLimit;
      } else if (!Number.isInteger(roomMemory.spawnWaitSince)) {
        delete roomMemory.spawnWaitRole;
        delete roomMemory.spawnWaitLimit;
        changed = true;
      }
      if (roomMemory.salvageScan &&
          (roomMemory.salvageScan.updated || 0) < Game.time - 100) {
        delete roomMemory.salvageScan;
        changed = true;
      }
      if (roomMemory.demandPlan &&
          (roomMemory.demandPlan.tick || 0) < Game.time - 100) {
        delete roomMemory.demandPlan;
        changed = true;
      }
      if (changed) stats.staleRoomState++;
    }
    if (memory.colonyDashboard &&
        (memory.colonyDashboard.updated || 0) < Game.time - 100) {
      delete memory.colonyDashboard;
      stats.staleRoomState++;
    }
    return stats;
  };

  return { runMemoryMaintenance };
};

module.exports = { createMemoryMaintenance };
