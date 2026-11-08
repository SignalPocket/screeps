'use strict';

// Conservative observation only: this is the longest currently visible busy
// time in one room, not a prediction of the scheduler's earliest free spawn.
const getSpawnQueueWait = (spawns, roomName) => {
  if (!roomName) return 0;
  return Object.values(spawns || {}).reduce((longest, spawn) => {
    if (!spawn || !spawn.room || spawn.room.name !== roomName ||
        !spawn.spawning) return longest;
    const remaining = spawn.spawning.remainingTime;
    return Number.isFinite(remaining) && remaining > longest
      ? remaining : longest;
  }, 0);
};

module.exports = { getSpawnQueueWait };
