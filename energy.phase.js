'use strict';

const createEnergyPhase = ({ Game, workerCost }) => {
  const updateEnergyWorkPhase = room => {
    const capacity = room.energyCapacityAvailable || 0;
    const ratio = capacity > 0 ? room.energyAvailable / capacity : 1;
    let phase = room.memory.energyWorkPhase;
    if (phase !== 'refill' && phase !== 'work') {
      phase = ratio >= 1 ? 'work' : 'refill';
      room.memory.energyWorkPhaseSince = Game.time;
    } else if (phase === 'refill' && ratio >= 1) {
      phase = 'work';
      room.memory.energyWorkPhaseSince = Game.time;
      console.log(`[${Game.time}] ${room.name} energy phase refill -> work`);
    } else if (phase === 'work' && ratio <= 0.5 &&
        (room.energyAvailable < workerCost ||
          Game.time - (room.memory.energyWorkPhaseSince || 0) >= 25)) {
      phase = 'refill';
      room.memory.energyWorkPhaseSince = Game.time;
      console.log(`[${Game.time}] ${room.name} energy phase work -> refill` +
        `${room.energyAvailable < workerCost ? ' (spawn reserve)' : ''}`);
    }
    room.memory.energyWorkPhase = phase;
    return phase;
  };

  return { updateEnergyWorkPhase };
};

module.exports = { createEnergyPhase };
