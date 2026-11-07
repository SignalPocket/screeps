'use strict';

// One persistent, per-room combat record owns both reporting and deployment.
// Lack of vision never clears a previously observed fight.
const updateRoomCombat = (room, tick, targets) => {
  const previous = room.memory.combatStatus || {};
  const fighting = targets.length > 0;
  const cores = targets.filter(target => target.structureType === 'invaderCore');
  const status = {
    state: fighting ? 'Fighting' : 'Peace', fighting, updated: tick,
    since: previous.fighting === fighting ? previous.since || tick : tick,
    lastThreat: fighting ? tick : previous.lastThreat || null,
    hostileCount: targets.length, invaderCores: cores.length,
    threatIds: targets.map(target => target.id),
    requiredDefenders: fighting ? (cores.length ? 2 : 1) : 0
  };
  room.memory.combatStatus = status;
  const previousRoomStatus = room.memory.roomStatus || {};
  room.memory.roomStatus = withCombatStatus({ ...previousRoomStatus,
    key: previousRoomStatus.economyKey || previousRoomStatus.key || 'observed',
    label: previousRoomStatus.economyLabel || previousRoomStatus.label || 'Observed',
    updated: tick }, status);
  return status;
};

const isActiveDefenseAssignment = (creep, rooms) => {
  const memory = creep.memory || {};
  const target = rooms[memory.defenseTargetRoom];
  const combat = target && target.memory && target.memory.combatStatus;
  return Boolean(memory.defenseTargetRoom && combat && combat.fighting &&
    (memory.role === 'defender' || memory.birthRole === 'defender' ||
      memory.retiredRole === 'defender'));
};

const withCombatStatus = (status, combat) => ({
  ...status, combat: combat && combat.state || 'Unknown',
  fighting: Boolean(combat && combat.fighting),
  ...(combat && combat.fighting ? {
    economyKey: status.key, economyLabel: status.label,
    key: 'fighting', label: 'Fighting', conditionLabel: 'Fighting'
  } : {})
});

module.exports = { updateRoomCombat, isActiveDefenseAssignment, withCombatStatus };
