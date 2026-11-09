'use strict';

const ROOM_DEFINITION = Object.freeze({
  name: 'room',
  signature: "ops.room(roomName)",
  purpose: 'Explain one owned room using the canonical colony health row.',
  example: "ops.room('W7N4')",
  mode: 'read-only',
  writes: 'none',
  expires: null,
  related: Object.freeze(['colony', 'energy', 'remotes', 'spawn', 'work'])
});

const errorResult = (tick, message, available = []) => ({
  ok: false,
  tick,
  freshness: 'current tick',
  error: message,
  available,
  console: available.length ? `${message}. Owned rooms: ${available.join(', ')}`
    : message
});
const value = (item, unit) => item == null ? 'unknown'
  : `${item}${unit ? ` ${unit}` : ''}`;

const createRoomCommand = ({ Game, colonyCommand }) => (...args) => {
  const tick = Game && Number.isSafeInteger(Game.time) ? Game.time : null;
  if (args.length !== 1 || typeof args[0] !== 'string') {
    return errorResult(tick, 'ops.room(roomName) requires one room name');
  }
  const roomName = args[0];
  if (!/^[WE]\d+[NS]\d+$/.test(roomName)) {
    return errorResult(tick, `Invalid Screeps room name: ${roomName}`);
  }
  if (!Game || !Game.rooms || !Game.rooms[roomName]) {
    return errorResult(tick, `Room ${roomName} is not currently visible`);
  }
  if (!Game.rooms[roomName].controller ||
      !Game.rooms[roomName].controller.my) {
    return errorResult(tick, `Room ${roomName} is not an owned room`);
  }
  if (typeof colonyCommand !== 'function') {
    return errorResult(tick, 'Canonical colony health inventory is unavailable');
  }
  const colony = colonyCommand();
  if (!colony || !colony.ok || !Array.isArray(colony.rooms)) {
    return errorResult(tick, 'Canonical colony health inventory is unavailable');
  }
  const row = colony.rooms.find(candidate => candidate.roomName === roomName);
  const available = colony.rooms.map(candidate => candidate.roomName).sort();
  if (!row) return errorResult(tick,
    `Owned room ${roomName} is missing from the canonical health inventory`,
    available);

  const sections = {
    health: { label: row.health, mode: row.mode,
      reasons: [...(row.healthReasons || [])] },
    controller: { ...row.controller, units: {
      ticksToDowngrade: 'ticks', progress: 'controller progress',
      progressTotal: 'controller progress' } },
    storage: { energy: row.energy.stored,
      freeCapacity: row.energy.freeCapacity,
      units: { energy: 'energy', freeCapacity: 'capacity' } },
    energy: { ...row.energy, units: {
      stored: 'energy', freeCapacity: 'capacity',
      spawnAvailable: 'energy', spawnCapacity: 'energy' } },
    work: { ...row.work, units: {
      constructionSites: 'sites', buildRemaining: 'build progress',
      repairEnergy: 'energy', upgraders: 'creeps' } },
    staffing: { ...row.staffing, units: 'creeps' },
    logistics: { ...row.logistics, units: {
      sourceStored: 'energy', spawnFree: 'capacity',
      bufferFree: 'capacity', supplyFree: 'capacity' } },
    remotes: { ...row.remotes, units: {
      activeRooms: 'rooms', backlog: 'energy', blockedRooms: 'rooms',
      rosterGap: 'creeps', trouble: 'mixed indicator; inspect raw fields' } },
    threats: { ...row.threats, units: {
      count: 'targets', requiredDefenders: 'creeps' } },
    cpu: { ...row.cpu, units: {
      deferred: 'creeps', longestDeferral: 'ticks' } },
    spawn: { ...row.spawn }
  };
  const reasons = sections.health.reasons.length
    ? sections.health.reasons : ['no unhealthy or constrained reason recorded'];
  const lines = [
    `${roomName} @${value(row.tick)} | ${row.health || 'health unknown'} | ` +
      `${row.mode || 'mode unknown'}`,
    `Reasons: ${reasons.join('; ')}`,
    `Controller: RCL ${value(row.controller.level)}, downgrade ` +
      `${value(row.controller.ticksToDowngrade, 'ticks')} ` +
      `(${row.controller.downgradeRisk})`,
    `Storage: ${value(row.energy.stored, 'energy')}, free ` +
      `${value(row.energy.freeCapacity, 'capacity')}`,
    `Energy: spawn ${value(row.energy.spawnAvailable, 'energy')}/` +
      `${value(row.energy.spawnCapacity, 'energy')}`,
    `Work: ${value(row.work.constructionSites, 'sites')}, build ` +
      `${value(row.work.buildRemaining, 'progress')}, repair ` +
      `${value(row.work.repairEnergy, 'energy')}, upgraders ` +
      `${row.work.upgraders.current}/${value(row.work.upgraders.desired)}`,
    `Staffing: ${row.staffing.current}/${value(row.staffing.desired)} ` +
      `(missing ${value(row.staffing.missingDesired)})`,
    `Logistics: reserve ${row.logistics.reserve || 'unknown'}, harvest ` +
      `${row.logistics.harvest || 'unknown'}, flow ` +
      `${row.logistics.flow || 'unknown'}`,
    `Remotes: ${value(row.remotes.activeRooms, 'rooms')}, backlog ` +
      `${value(row.remotes.backlog, 'energy')}, blocked ` +
      `${value(row.remotes.blockedRooms, 'rooms')}, gap ` +
      `${value(row.remotes.rosterGap, 'creeps')}`,
    `Threats: ${row.threats.state || 'unknown'}, ` +
      `${value(row.threats.count, 'targets')}`,
    `CPU: ${row.cpu.mode || 'unknown'}, deferred ` +
      `${value(row.cpu.deferred, 'creeps')}, longest ` +
      `${value(row.cpu.longestDeferral, 'ticks')}`,
    `Spawn: ${row.spawn.action}`
  ];
  return {
    ok: true,
    tick: row.tick,
    freshness: colony.freshness,
    roomName,
    observations: { ...row.observations },
    reasons,
    sections,
    console: lines.join('\n')
  };
};

module.exports = { ROOM_DEFINITION, createRoomCommand };
