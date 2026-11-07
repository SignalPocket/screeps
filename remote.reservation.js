'use strict';

const ROLE = 'remote-reserver';
// A two-CLAIM responder needs its spawn time, cross-room travel, and room
// entry variance. Live replacement at the route-only estimate allowed an
// established reservation to lapse, so protect a conservative fixed window.
const RESERVATION_EMERGENCY_LEAD = 300;
const replacementLead = (roomName, home, Game) => {
  const route = Game.map.findRoute(home, roomName);
  if (!Array.isArray(route)) return Infinity;
  const queue = Math.max(0, ...Object.values(Game.spawns || {})
    .filter(s => s.room.name === home && s.spawning)
    .map(s => s.spawning.remainingTime || 0));
  return Math.max(RESERVATION_EMERGENCY_LEAD,
    12 + Math.max(1, route.length) * 75 + queue + 25);
};

const getReservationCoverage = (room, workers, policy, Game) => {
  const targets = policy.operations && policy.operations.reservationRooms || [];
  const members = workers.filter(c => c.memory.role === ROLE &&
    c.memory.home === room.name && !c.memory.staffingRetire && targets.includes(c.memory.remoteRoom) &&
    (c.spawning || c.getActiveBodyparts('claim') >= 2 &&
      c.ticksToLive > replacementLead(c.memory.remoteRoom, room.name, Game)));
  return { members, count: new Set(members.map(c => c.memory.remoteRoom)).size };
};

const planReservationSpawn = ({ room, workers, policy, staffingPlan, Game,
  urgentOnly = false }) => {
  const targets = policy.operations && policy.operations.reservationRooms || [];
  // Recovery pauses the ordinary roster budget, but an expiring established
  // reservation is income protection, not remote growth. The spawn authority
  // still rejects it for a collapsed home baseline, so health classification
  // alone must not strand an established outpost.
  const targetCount = policy.remote.reserversMin ||
    (urgentOnly ? targets.length : 0);
  if (!targetCount ||
      (!urgentOnly && (staffingPlan.baselineGap ||
        (staffingPlan.minimumGap &&
          staffingPlan.minimumGap.role !== 'remoteReserver')))) return null;
  const coverage = getReservationCoverage(room, workers, policy, Game);
  const candidates = targets.map(remoteRoom => {
    const target = Game.rooms[remoteRoom] && Game.rooms[remoteRoom].controller;
    const reservationTicks = target && target.reservation &&
      target.reservation.username === room.controller.owner.username
      ? target.reservation.ticksToEnd : undefined;
    return { remoteRoom, target, reservationTicks };
  }).sort((a, b) => (a.reservationTicks === undefined ? Infinity : a.reservationTicks) -
    (b.reservationTicks === undefined ? Infinity : b.reservationTicks));
  for (const { remoteRoom, target, reservationTicks } of candidates) {
    if (target && target.my) continue;
    if (coverage.members.some(c => c.memory.remoteRoom === remoteRoom)) continue;
    const lead = replacementLead(remoteRoom, room.name, Game);
    if (!Number.isFinite(lead) || lead >= 600) continue;
    // An uncovered active outpost without vision is also urgent. Waiting for
    // a new reserver to reveal it lets the known reservation expire before
    // the normal staffing tiers ever see a deadline.
    if (urgentOnly && reservationTicks !== undefined &&
        reservationTicks > lead) continue;
    // At most one incumbent and one replacement; never repeatedly fill an
    // invisible or blocked lane with fresh short-lived CLAIM bodies.
    const occupants = workers.filter(c => c.memory.role === ROLE &&
      c.memory.remoteRoom === remoteRoom && !c.memory.staffingRetire);
    if (occupants.length >= 2 || occupants.some(c => c.spawning)) continue;
    if (target && (target.owner || target.reservation &&
        target.reservation.username !== room.controller.owner.username)) continue;
    return { role: ROLE, remoteRoom, bodyType: 'claimer',
      spawnBodyRole: ROLE, forceSpawn: true, minimumEnergy: 1300,
      ...(urgentOnly ? { reservationDeadline: reservationTicks === undefined
        ? 0 : reservationTicks } : {}),
      staffingCurrent: coverage.count, staffingTarget: targetCount };
  }
  return null;
};

const runReservation = ({ creep, Game, move, RoomPosition,
  OK, ERR_NOT_IN_RANGE, FIND_HOSTILE_CREEPS }) => {
  const targetRoom = creep.memory.remoteRoom;
  if (!targetRoom) return false;
  const visible = Game.rooms[targetRoom];
  if (visible && visible.controller && visible.controller.my) {
    creep.memory.role = 'retire';
    creep.memory.assignmentRole = 'retire';
    delete creep.memory.assignmentKind;
    creep.memory.staffingRetire = true;
    creep.memory.retiredRole = ROLE;
    creep.memory.taskTarget = `${targetRoom} already owned`;
    return true;
  }
  // Publish every executor outcome, including paths that cannot reserve.
  // Otherwise a claimed room or a travelling replacement retains an old OK.
  const report = (state, result = null, reason = null) => {
    const home = Game.rooms[creep.memory.home];
    if (!home) return;
    const controller = visible && visible.controller;
    if (!home.memory.reservationStatus) home.memory.reservationStatus = {};
    home.memory.reservationStatus[targetRoom] = { tick: Game.time,
      creep: creep.name, state, result, reason, room: creep.room.name,
      controllerId: controller && controller.id || null,
      owner: controller && controller.owner &&
        controller.owner.username || null,
      ticksToEnd: controller && controller.reservation
        ? controller.reservation.ticksToEnd : null,
      observedReservation: controller && controller.reservation || null };
  };
  if (visible && visible.find(FIND_HOSTILE_CREEPS).length) {
    creep.memory.reservationRetreatUntil = Game.time + 25;
  }
  if (creep.memory.reservationRetreatUntil > Game.time) {
    if (creep.room.name !== creep.memory.home) {
      move(creep, new RoomPosition(25, 25, creep.memory.home), 20);
    }
    creep.memory.taskTarget = `${creep.memory.home} reservation retreat`;
    report('retreat', null, 'hostile retreat interval');
    return true;
  }
  if (creep.room.name !== targetRoom) {
    move(creep, new RoomPosition(25, 25, targetRoom), 20);
    creep.memory.taskTarget = `${targetRoom} reservation`;
    report('travel');
    return true;
  }
  const controller = creep.room.controller;
  if (!controller || controller.owner || controller.reservation &&
      controller.reservation.username !== creep.owner.username) {
    creep.memory.taskTarget = `${targetRoom} reservation unavailable`;
    report('unavailable', null, !controller ? 'no controller'
      : controller.owner ? 'owned controller' : 'foreign reservation');
    return true; // Never attack or claim an unexpected owner.
  }
  if (creep.room.find(FIND_HOSTILE_CREEPS).length) {
    move(creep, new RoomPosition(25, 25, creep.memory.home), 20);
    creep.memory.taskTarget = `${creep.memory.home} reservation retreat`;
    report('retreat', null, 'hostiles in target room');
    return true;
  }
  const result = creep.reserveController(controller);
  if (result === ERR_NOT_IN_RANGE) move(creep, controller, 1);
  creep.memory.taskTarget = controller.id;
  report(result === OK ? 'reserving'
    : result === ERR_NOT_IN_RANGE ? 'approach' : 'failed', result);
  return result === OK || result === ERR_NOT_IN_RANGE;
};

module.exports = { ROLE, replacementLead, getReservationCoverage,
  planReservationSpawn, runReservation };
