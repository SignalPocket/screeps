'use strict';

const CANONICAL_OPERATIONAL_ROOM_CONFIGURATION = Object.freeze([
  Object.freeze({ roomName: 'W7N4', configuredRole: 'home',
    authorityHome: 'W7N4' }),
  Object.freeze({ roomName: 'W8N4', configuredRole: 'home',
    authorityHome: 'W8N4' }),
  Object.freeze({ roomName: 'W7N3', configuredRole: 'reserved',
    authorityHome: 'W7N4' }),
  Object.freeze({ roomName: 'W8N3', configuredRole: 'reserved',
    authorityHome: 'W7N4' })
]);

const EXPECTED_CONFIGURATION = new Map(
  CANONICAL_OPERATIONAL_ROOM_CONFIGURATION.map((entry, index) =>
    [entry.roomName, { ...entry, index }])
);
const ROOM_NAME_PATTERN = /^[WE]\d+[NS]\d+$/;

const integer = value => Number.isSafeInteger(value) ? value : null;
const finite = value => Number.isFinite(value) ? value : null;
const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};
const observation = (updated, tick, current = false, source = null) => {
  if (current && Number.isSafeInteger(tick)) return freeze({
    tick, age: 0, freshness: 'current tick', source
  });
  if (!Number.isSafeInteger(updated)) return freeze({
    tick: null, age: null, freshness: 'unknown', source: null
  });
  const age = Number.isSafeInteger(tick) ? Math.max(0, tick - updated) : null;
  return freeze({
    tick: updated,
    age,
    freshness: age === 0 ? 'current tick' : age === null
      ? 'unknown' : `stale by ${age} ticks`,
    source
  });
};

const validateConfiguration = configuration => {
  if (!Array.isArray(configuration)) {
    throw new TypeError('Operational room configuration must be an array');
  }
  if (configuration.length !== EXPECTED_CONFIGURATION.size) {
    throw new TypeError('Operational room configuration must contain exactly four rooms');
  }
  const seen = new Set();
  const normalized = configuration.map((entry, position) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`Operational room entry ${position} must be an object`);
    }
    const { roomName, configuredRole, authorityHome } = entry;
    if (typeof roomName !== 'string' || !ROOM_NAME_PATTERN.test(roomName)) {
      throw new TypeError(`Operational room entry ${position} has an invalid roomName`);
    }
    if (seen.has(roomName)) {
      throw new TypeError(`Operational room configuration duplicates ${roomName}`);
    }
    seen.add(roomName);
    const expected = EXPECTED_CONFIGURATION.get(roomName);
    if (!expected) {
      throw new TypeError(`Operational room configuration includes unexpected room ${roomName}`);
    }
    if (configuredRole !== expected.configuredRole) {
      throw new TypeError(`${roomName} must be configured as ${expected.configuredRole}`);
    }
    if (authorityHome !== expected.authorityHome) {
      throw new TypeError(`${roomName} must use authority home ${expected.authorityHome}`);
    }
    return { roomName, configuredRole, authorityHome,
      index: expected.index };
  });
  for (const roomName of EXPECTED_CONFIGURATION.keys()) {
    if (!seen.has(roomName)) {
      throw new TypeError(`Operational room configuration is missing ${roomName}`);
    }
  }
  return normalized.sort((left, right) => left.index - right.index);
};

const memoryObservation = (roomMemory, authorityStatus) => {
  const candidates = [
    ['room status', roomMemory && roomMemory.roomStatus &&
      roomMemory.roomStatus.updated],
    ['combat status', roomMemory && roomMemory.combatStatus &&
      roomMemory.combatStatus.updated],
    ['demand plan', roomMemory && roomMemory.demandPlan &&
      roomMemory.demandPlan.tick],
    ['population policy', roomMemory && roomMemory.populationPolicy &&
      roomMemory.populationPolicy.updated],
    ['reservation status', authorityStatus && authorityStatus.tick]
  ].map(([source, tick]) => ({ source, tick: integer(tick) }))
    .filter(candidate => candidate.tick !== null)
    .sort((left, right) => right.tick - left.tick ||
      left.source.localeCompare(right.source));
  return candidates[0] || { source: null, tick: null };
};

const visibleController = (controller, tick) => {
  if (!controller) return {
    status: 'no-controller', owner: null, reservation: null,
    observation: observation(tick, tick, true, 'live controller')
  };
  const owner = controller.owner && controller.owner.username || null;
  const reservation = controller.reservation ? {
    username: controller.reservation.username || null,
    ticksToEnd: finite(controller.reservation.ticksToEnd)
  } : null;
  return {
    status: controller.my ? 'owned' : owner ? 'foreign-owned'
      : reservation ? 'reserved' : 'neutral',
    owner,
    reservation,
    observation: observation(tick, tick, true, 'live controller')
  };
};

const rememberedController = (status, roomObservation, tick) => {
  if (!status) return {
    status: roomObservation.tick === null ? 'unknown' : 'last-observed-neutral',
    owner: null,
    reservation: null,
    observation: observation(roomObservation.tick, tick, false,
      roomObservation.source)
  };
  const savedReservation = status.observedReservation || null;
  const owner = status.owner || null;
  const reservation = savedReservation ? {
    username: savedReservation.username || null,
    ticksToEnd: finite(savedReservation.ticksToEnd)
  } : status.ticksToEnd == null ? null : {
    username: null,
    ticksToEnd: finite(status.ticksToEnd)
  };
  return {
    status: owner ? 'last-observed-owned'
      : reservation ? 'last-observed-reserved' : 'last-observed-neutral',
    owner,
    reservation,
    observation: observation(integer(status.tick) ?? roomObservation.tick,
      tick, false, integer(status.tick) === null
        ? roomObservation.source : 'reservation status')
  };
};

const createOperationalColonyScope = ({ Game = {}, Memory = {},
  configuration = CANONICAL_OPERATIONAL_ROOM_CONFIGURATION } = {}) => {
  const normalized = validateConfiguration(configuration);
  const tick = integer(Game && Game.time);
  const gameRooms = Game && Game.rooms && typeof Game.rooms === 'object'
    ? Game.rooms : {};
  const memoryRooms = Memory && Memory.rooms && typeof Memory.rooms === 'object'
    ? Memory.rooms : {};
  const rows = normalized.map(entry => {
    const room = gameRooms[entry.roomName] || null;
    const roomMemory = memoryRooms[entry.roomName] || null;
    const authorityMemory = memoryRooms[entry.authorityHome] || null;
    const authorityStatus = authorityMemory && authorityMemory.reservationStatus &&
      authorityMemory.reservationStatus[entry.roomName] || null;
    const latest = memoryObservation(roomMemory, authorityStatus);
    const controller = room
      ? visibleController(room.controller, tick)
      : rememberedController(authorityStatus, latest, tick);
    return freeze({
      roomName: entry.roomName,
      membership: 'operational-colony',
      configuredRole: entry.configuredRole,
      authority: {
        homeRoom: entry.authorityHome,
        reservationStatus: authorityStatus ? {
          tick: integer(authorityStatus.tick),
          owner: authorityStatus.owner || null,
          reservation: authorityStatus.observedReservation ? {
            username: authorityStatus.observedReservation.username || null,
            ticksToEnd: finite(authorityStatus.observedReservation.ticksToEnd)
          } : authorityStatus.ticksToEnd == null ? null : {
            username: null,
            ticksToEnd: finite(authorityStatus.ticksToEnd)
          }
        } : null
      },
      visibility: {
        visible: Boolean(room),
        observation: room
          ? observation(tick, tick, true, 'live room')
          : observation(latest.tick, tick, false, latest.source)
      },
      controller,
      transitionedToOwned: entry.configuredRole === 'reserved' &&
        controller.status === 'owned'
    });
  });
  return freeze({
    tick,
    roomNames: rows.map(row => row.roomName),
    rows
  });
};

module.exports = {
  CANONICAL_OPERATIONAL_ROOM_CONFIGURATION,
  createOperationalColonyScope,
  observation,
  validateConfiguration
};
