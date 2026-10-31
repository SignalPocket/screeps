'use strict';

const {
  CONTROLLER_BRIGADE_ROLE,
  CONTROLLER_BRIGADE_SIZE,
  CONTROLLER_BRIGADE_REPLACEMENT_LEAD
} = typeof Game === 'undefined'
  ? require('./controller.brigade.constants')
  : require('controller.brigade.constants');

const createControllerBrigadeRoster = ({ Game, RoomPosition }) => {
  const isBrigadeCreep = (creep, roomName) => creep && creep.memory &&
    creep.memory.home === roomName &&
    creep.memory.role === CONTROLLER_BRIGADE_ROLE &&
    Number.isInteger(creep.memory.controllerRelaySlot);

  const getSlotCreeps = (creeps, roomName, slot) => (creeps || [])
    .filter(creep => isBrigadeCreep(creep, roomName) &&
      creep.memory.controllerRelaySlot === slot);

  const getMissingSlot = (creeps, roomName,
    activeSize = CONTROLLER_BRIGADE_SIZE,
    replacementLead = CONTROLLER_BRIGADE_REPLACEMENT_LEAD) => {
    for (let slot = 0; slot < activeSize; slot++) {
      const occupants = getSlotCreeps(creeps, roomName, slot);
      if (!occupants.length) return slot;
      if (replacementLead > 0 && occupants.length === 1 &&
          !occupants[0].spawning &&
          Number.isFinite(occupants[0].ticksToLive) &&
          occupants[0].ticksToLive <= replacementLead) return slot;
    }
    return null;
  };

  const at = (creep, point) => creep.pos.x === point.x &&
    creep.pos.y === point.y && creep.pos.roomName === point.roomName;

  const getSlotOwner = (roomName, slot, plan) => {
    const segment = plan && plan.segments && plan.segments[slot];
    if (!segment) return null;
    const pickup = new RoomPosition(segment.pickup.x, segment.pickup.y,
      plan.roomName);
    const delivery = new RoomPosition(segment.delivery.x, segment.delivery.y,
      plan.roomName);
    return getSlotCreeps(Object.values(Game.creeps), roomName, slot)
      .sort((a, b) =>
        Number(at(b, pickup) || at(b, delivery)) -
          Number(at(a, pickup) || at(a, delivery)) ||
        (a.ticksToLive || Infinity) - (b.ticksToLive || Infinity) ||
        a.name.localeCompare(b.name))[0] || null;
  };

  return { getMissingSlot, getSlotOwner };
};

module.exports = { createControllerBrigadeRoster };
