'use strict';

const {
  CONTROLLER_BRIGADE_ROLE,
  CONTROLLER_BRIGADE_SIZE,
  CONTROLLER_BRIGADE_REPLACEMENT_LEAD
} = typeof Game === 'undefined'
  ? require('./controller.brigade.constants')
  : require('controller.brigade.constants');

const createControllerBrigadeRoster = ({ Game, RoomPosition }) => {
  const resetRelaySeatState = creep => {
    delete creep.memory.controllerRelaySeatingKey;
    delete creep.memory.controllerRelaySeated;
    delete creep.memory.controllerRelayState;
    delete creep.memory.controllerRelayStandby;
    delete creep.memory.controllerRelayBranchCursor;
    delete creep.memory.taskTarget;
    delete creep.memory._move;
  };
  const releaseSubstitute = creep => {
    delete creep.memory.controllerRelaySubstituteSlot;
    delete creep.memory.controllerRelaySubstituteSince;
    delete creep.memory.controllerRelaySubstituteReason;
    resetRelaySeatState(creep);
  };
  const getRelaySlot = creep => creep && creep.memory &&
    Number.isInteger(creep.memory.controllerRelaySlot)
    ? creep.memory.controllerRelaySlot
    : creep && creep.memory &&
      Number.isInteger(creep.memory.controllerRelaySubstituteSlot)
      ? creep.memory.controllerRelaySubstituteSlot : null;
  const isRealRelay = creep => creep && creep.memory &&
    creep.memory.role === CONTROLLER_BRIGADE_ROLE &&
    Number.isInteger(creep.memory.controllerRelaySlot);
  const isBrigadeCreep = (creep, roomName) => creep && creep.memory &&
    creep.memory.home === roomName &&
    (isRealRelay(creep) ||
      Number.isInteger(creep.memory.controllerRelaySubstituteSlot));

  const getSlotCreeps = (creeps, roomName, slot) => (creeps || [])
    .filter(creep => isBrigadeCreep(creep, roomName) &&
      getRelaySlot(creep) === slot);

  const getMissingSlot = (creeps, roomName,
    activeSize = CONTROLLER_BRIGADE_SIZE,
    replacementLead = CONTROLLER_BRIGADE_REPLACEMENT_LEAD) => {
    // Repair true holes before considering preventive replacement. This also
    // prevents an aging low-numbered slot from hiding a later empty slot.
    for (let slot = 0; slot < activeSize; slot++) {
      // Temporary coverage must never satisfy the spawn roster. Otherwise the
      // stand-in prevents the real BRIGn from ever being requested.
      const occupants = (creeps || []).filter(creep =>
        isRealRelay(creep) && creep.memory.home === roomName &&
        creep.memory.controllerRelaySlot === slot);
      if (!occupants.length) return slot;
    }
    // Only one preventive overlap may exist across the whole brigade. Relay
    // bodies usually share an age, so independently replacing every aging
    // slot can otherwise double a 17-creep line into 30+ bodies at once.
    const occupantsBySlot = Array.from({ length: activeSize }, (_, slot) =>
      (creeps || []).filter(creep => isRealRelay(creep) &&
        creep.memory.home === roomName &&
        creep.memory.controllerRelaySlot === slot));
    if (occupantsBySlot.some(occupants => occupants.length > 1)) return null;
    if (replacementLead > 0) {
      for (let slot = 0; slot < activeSize; slot++) {
        const occupant = occupantsBySlot[slot][0];
        if (!occupant.spawning && Number.isFinite(occupant.ticksToLive) &&
            occupant.ticksToLive <= replacementLead) return slot;
      }
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
      .sort((a, b) => {
        const aSeated = at(a, pickup) || at(a, delivery);
        const bSeated = at(b, pickup) || at(b, delivery);
        const aRank = aSeated && isRealRelay(a) ? 0
          : aSeated ? 1 : !isRealRelay(a) ? 2 : 3;
        const bRank = bSeated && isRealRelay(b) ? 0
          : bSeated ? 1 : !isRealRelay(b) ? 2 : 3;
        return aRank - bRank ||
        (a.ticksToLive || Infinity) - (b.ticksToLive || Infinity) ||
        a.name.localeCompare(b.name);
      })[0] || null;
  };

  const releaseRealRelay = creep => {
    delete creep.memory.controllerRelaySlot;
    releaseSubstitute(creep);
    creep.memory.role = 'hauler';
    creep.memory.controllerRelaySurplusSince = Game.time;
  };

  // Collapse replacement waves already created by older logic. Preserve one
  // overlap for the most urgent aging slot; all other duplicate relay bodies
  // return to useful hauling immediately instead of waiting beside the line.
  const reconcileRealOverlaps = (roomName, plan) => {
    if (!plan || !Array.isArray(plan.segments)) {
      return { reassigned: [], released: [] };
    }
    const reassigned = [];
    const released = [];
    const relayGroups = () => plan.segments.map((segment, slot) => ({
      slot,
      occupants: Object.values(Game.creeps).filter(creep =>
        isRealRelay(creep) && creep.memory.home === roomName &&
        creep.memory.controllerRelaySlot === slot)
    }));

    // A numbered real relay is more authoritative than a borrowed carrier.
    // Move a waiting duplicate into a true hole before releasing surplus or
    // allowing substitute reconciliation. Deterministic slot order and the
    // reassignment marker prevent two seats from trading occupants each tick.
    for (const hole of relayGroups().filter(group =>
      group.occupants.length === 0).sort((a, b) => a.slot - b.slot)) {
      const donor = relayGroups().filter(group =>
        group.occupants.length > 1).sort((a, b) => a.slot - b.slot)[0];
      if (!donor) break;
      const owner = getSlotOwner(roomName, donor.slot, plan);
      const replacement = donor.occupants.filter(creep => creep !== owner)
        .sort((a, b) =>
          Number(Boolean(b.memory.controllerRelayStandby)) -
            Number(Boolean(a.memory.controllerRelayStandby)) ||
          (b.ticksToLive || 1500) - (a.ticksToLive || 1500) ||
          a.name.localeCompare(b.name))[0];
      if (!replacement) continue;
      const previousSlot = replacement.memory.controllerRelaySlot;
      replacement.memory.controllerRelaySlot = hole.slot;
      replacement.memory.controllerRelayReassignedAt = Game.time;
      replacement.memory.controllerRelayReassignedFrom = previousSlot;
      resetRelaySeatState(replacement);
      reassigned.push({ creep: replacement.name, from: previousSlot,
        to: hole.slot });
    }

    const duplicateGroups = relayGroups()
      .filter(group => group.occupants.length > 1)
      .sort((a, b) => {
        const oldest = group => Math.min(...group.occupants.map(creep =>
          Number.isFinite(creep.ticksToLive) ? creep.ticksToLive : 1500));
        return oldest(a) - oldest(b) || a.slot - b.slot;
      });
    duplicateGroups.forEach((group, groupIndex) => {
      const owner = getSlotOwner(roomName, group.slot, plan);
      const allowed = groupIndex === 0 ? 2 : 1;
      const keep = [owner, ...group.occupants.filter(creep => creep !== owner)
        .sort((a, b) => (b.ticksToLive || 1500) -
          (a.ticksToLive || 1500))].filter(Boolean).slice(0, allowed);
      for (const creep of group.occupants) {
        if (keep.includes(creep)) continue;
        releaseRealRelay(creep);
        released.push(creep.name);
      }
    });
    return { reassigned, released };
  };

  /**
   * Temporarily seat ordinary compatible carriers in uncovered relay slots.
   * The substitute keeps its real role and durable job in memory. It is
   * released when the numbered relay reaches the seat, not merely when that
   * replacement begins spawning or is still crossing the room.
   */
  const reconcileSubstitutes = ({ creeps, roomName, plan, candidates }) => {
    const all = creeps || [];
    const segments = plan && Array.isArray(plan.segments)
      ? plan.segments : [];
    const assignments = [];
    const available = (candidates || []).filter(candidate =>
      candidate && candidate.memory &&
      !Number.isInteger(candidate.memory.controllerRelaySubstituteSlot));

    for (const creep of all) {
      const slot = creep.memory &&
        creep.memory.controllerRelaySubstituteSlot;
      if (!Number.isInteger(slot)) continue;
      if (creep.memory.home !== roomName || !segments[slot]) {
        releaseSubstitute(creep);
      }
    }

    // One borrowed creep can bridge one exceptional gap. Borrowing one creep
    // for every relay that is still spawning or walking to its seat doubles
    // the brigade and strips the room's entire logistics roster. Keep the
    // oldest valid stand-in and release every other temporary occupant now.
    const validSubstitutes = all.filter(creep => creep.memory &&
      creep.memory.home === roomName &&
      Number.isInteger(creep.memory.controllerRelaySubstituteSlot) &&
      segments[creep.memory.controllerRelaySubstituteSlot])
      .sort((a, b) =>
        (a.memory.controllerRelaySubstituteSince || Game.time) -
          (b.memory.controllerRelaySubstituteSince || Game.time) ||
        a.name.localeCompare(b.name));
    let keeper = validSubstitutes.shift() || null;
    for (const extra of validSubstitutes) releaseSubstitute(extra);

    if (keeper) {
      const slot = keeper.memory.controllerRelaySubstituteSlot;
      const segment = segments[slot];
      const realArrived = all.some(creep => isRealRelay(creep) &&
        creep.memory.home === roomName &&
        creep.memory.controllerRelaySlot === slot && !creep.spawning &&
        creep.pos && creep.pos.roomName === plan.roomName &&
        (creep.pos.getRangeTo(segment.pickup) <= 1 ||
          creep.pos.getRangeTo(segment.delivery) <= 1));
      if (realArrived) {
        releaseSubstitute(keeper);
        keeper = null;
      } else {
        assignments.push({ slot, creep: keeper.name });
        return assignments;
      }
    }

    for (let slot = 0; slot < segments.length; slot++) {
      const segment = segments[slot];
      const realRelays = all.filter(creep => isRealRelay(creep) &&
        creep.memory.home === roomName &&
        creep.memory.controllerRelaySlot === slot);
      // A real BRIGn already spawning or traveling owns this slot. Do not
      // borrow a second creep merely because the real relay is not seated yet.
      if (realRelays.length > 0) continue;
      const candidate = available.shift();
      if (!candidate) continue;
      candidate.memory.controllerRelaySubstituteSlot = slot;
      candidate.memory.controllerRelaySubstituteSince = Game.time;
      candidate.memory.controllerRelaySubstituteReason =
        `BRIG${slot + 1} roster slot empty`;
      assignments.push({ slot, creep: candidate.name });
      break;
    }
    return assignments;
  };

  return { getMissingSlot, getSlotOwner, reconcileRealOverlaps,
    reconcileSubstitutes };
};

module.exports = { createControllerBrigadeRoster };
