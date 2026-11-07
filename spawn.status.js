'use strict';

// Worker activity and spawn occupancy are independent observations. Neither
// authorizes nor denies a request; spawn.authority owns that decision.
const getSpawnActivityStatus = ({ idleCount, congestionCount, population,
  workerLimit, spawns }) => {
  const status = [];
  if (idleCount > 0) status.push(`${idleCount} idle`);
  if (congestionCount > 0) status.push(`${congestionCount} congested`);
  if (population >= workerLimit) status.push('pop target');
  if (spawns.length > 0 && spawns.every(spawn => spawn.spawning)) {
    status.push('spawns busy');
  }
  return status;
};

module.exports = { getSpawnActivityStatus };
