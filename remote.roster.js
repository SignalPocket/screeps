'use strict';

const reconcileRemoteHaulerRosters = ({
  rooms, creeps, Game, RESOURCE_ENERGY,
  getRemoteHaulerBudget = null,
  isOwnedRoom = roomName => Boolean(Game.rooms && Game.rooms[roomName] &&
    Game.rooms[roomName].controller && Game.rooms[roomName].controller.my)
}) => {
  const results = {};
  for (const room of rooms.filter(candidate =>
    candidate.controller && candidate.controller.my)) {
    const rosterPlans = [
      { survey: room.memory.leftSurvey, team: 'left' },
      { survey: room.memory.southSurvey, team: 'south', delivery: 's2' },
      { survey: room.memory.southwestSurvey, team: 'southwest' }
    ].filter(entry => entry.survey && entry.survey.active &&
      entry.survey.targetRoom && !isOwnedRoom(entry.survey.targetRoom) &&
      entry.survey.remoteHaulerTarget > 0);
    const measuredTarget = rosterPlans.reduce((total, entry) =>
      total + entry.survey.remoteHaulerTarget, 0);
    const policyBudget = getRemoteHaulerBudget
      ? Math.max(0, getRemoteHaulerBudget(room) || 0)
      : measuredTarget;
    const signature = `${policyBudget}|` + rosterPlans.map(entry =>
      `${entry.survey.targetRoom}:${entry.survey.remoteHaulerTarget}`)
      .sort().join('|');
    const haulers = creeps.filter(creep =>
      creep.memory.role === 'remote-hauler' &&
      (creep.memory.remoteHome || creep.memory.home) === room.name);
    const needs = [];
    const largestTarget = rosterPlans.reduce((maximum, entry) =>
      Math.max(maximum, entry.survey.remoteHaulerTarget), 0);
    for (let slot = 0; slot < largestTarget &&
        needs.length < policyBudget; slot++) {
      for (const entry of rosterPlans) {
        if (slot >= entry.survey.remoteHaulerTarget ||
            needs.length >= policyBudget) continue;
        needs.push({
          roomName: entry.survey.targetRoom, slot,
          team: entry.team, delivery: entry.delivery, creep: null
        });
      }
    }
    const neededKeys = new Set(needs.map(need =>
      `${need.roomName}:${need.slot}`));
    const slotCounts = haulers.reduce((counts, creep) => {
      if (creep.memory.remoteRosterSurplus) return counts;
      const key = `${creep.memory.remoteRoom}:` +
        `${creep.memory.remoteHaulerSlot}`;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const rosterHealthy = needs.every(need =>
      slotCounts[`${need.roomName}:${need.slot}`] === 1) &&
      haulers.every(creep => {
        const key = `${creep.memory.remoteRoom}:` +
          `${creep.memory.remoteHaulerSlot}`;
        return creep.memory.remoteRosterSurplus || neededKeys.has(key);
      });
    if (room.memory.remoteHaulerRosterSignature === signature &&
        rosterHealthy) {
      results[room.name] = { changed: false, signature };
      continue;
    }
    const used = new Set();
    for (const need of needs) {
      need.creep = haulers.filter(creep => !used.has(creep.name) &&
        creep.memory.remoteRoom === need.roomName &&
        creep.memory.remoteHaulerSlot === need.slot)
        .sort((a, b) => (b.ticksToLive || 1500) -
          (a.ticksToLive || 1500))[0] || null;
      if (need.creep) used.add(need.creep.name);
    }
    for (const need of needs.filter(candidate => !candidate.creep)) {
      const replacement = haulers.filter(creep => !used.has(creep.name))
        .sort((a, b) =>
          Number(a.store[RESOURCE_ENERGY] > 0) -
            Number(b.store[RESOURCE_ENERGY] > 0) ||
          (b.ticksToLive || 1500) - (a.ticksToLive || 1500))[0];
      if (!replacement) continue;
      replacement.memory.remoteRoom = need.roomName;
      replacement.memory.remoteHaulerSlot = need.slot;
      replacement.memory.remoteTeam = need.team;
      replacement.memory.remoteDelivery = need.delivery;
      delete replacement.memory.remoteRosterSurplus;
      if (replacement.store[RESOURCE_ENERGY] === 0) {
        delete replacement.memory.remotePickupTarget;
        delete replacement.memory.remotePickupSource;
        delete replacement.memory.remoteDeliveryTarget;
        delete replacement.memory.dispatchCommitment;
      }
      need.creep = replacement;
      used.add(replacement.name);
    }
    for (const hauler of haulers) {
      if (used.has(hauler.name)) delete hauler.memory.remoteRosterSurplus;
      else hauler.memory.remoteRosterSurplus = true;
    }
    room.memory.remoteHaulerRosterSignature = signature;
    room.memory.remoteHaulerRosterReconciled = Game.time;
    console.log(`[${Game.time}] ${room.name} remote roster ` +
      `${used.size}/${needs.length} assigned; ` +
      `${Math.max(0, haulers.length - used.size)} surplus aging out`);
    results[room.name] = {
      changed: true,
      signature,
      assigned: used.size,
      needed: needs.length,
      surplus: Math.max(0, haulers.length - used.size)
    };
  }
  return results;
};

const reconcileRemoteMinerRosters = ({
  rooms, creeps, getReplacementLead = () => 100,
  getWork = creep => creep.getActiveBodyparts('work'),
  isOwnedRoom = () => false
}) => {
  const results = {};
  for (const room of rooms.filter(candidate =>
    candidate.controller && candidate.controller.my)) {
    const surveys = [room.memory.leftSurvey, room.memory.southSurvey,
      room.memory.southwestSurvey].filter(survey =>
      survey && survey.active && survey.targetRoom &&
      !isOwnedRoom(survey.targetRoom));
    const needs = surveys.flatMap(survey => {
      const lanes = Array.isArray(survey.remoteWorkNeeds) &&
        survey.remoteWorkNeeds.length ? survey.remoteWorkNeeds :
        [...Array(survey.remoteMinerTarget || 0).keys()].map(slot => ({
          slot, minMiners: 1, requiredWork: 1
        }));
      return lanes.map(need => ({ roomName: survey.targetRoom,
        slot: need.slot, requiredWork: Math.max(1, need.requiredWork || 1) }));
    });
    const miners = creeps.filter(creep =>
      creep.memory.role === 'remote-miner' &&
      (creep.memory.remoteHome || creep.memory.home) === room.name);
    const originalKey = new Map(miners.map(creep => [creep.name,
      `${creep.memory.remoteRoom}:${creep.memory.remoteSlot}`]));
    const used = new Set();
    const strength = creep => getWork(creep);
    const life = creep => creep.spawning ? 1600 : creep.ticksToLive || 0;
    const rank = (a, b) =>
      Number(Boolean(b.spawning)) - Number(Boolean(a.spawning)) ||
      life(b) - life(a) || strength(b) - strength(a) ||
      a.name.localeCompare(b.name);
    for (const need of needs) {
      const key = `${need.roomName}:${need.slot}`;
      const keeper = miners.filter(creep => !used.has(creep.name) &&
        originalKey.get(creep.name) === key).sort(rank)[0];
      if (!keeper) continue;
      used.add(keeper.name);
      delete keeper.memory.remoteReplacementOverlap;
    }
    for (const need of needs) {
      const occupied = miners.some(creep => used.has(creep.name) &&
        creep.memory.remoteRoom === need.roomName &&
        creep.memory.remoteSlot === need.slot);
      if (occupied) continue;
      const replacement = miners.filter(creep => !used.has(creep.name))
        .sort(rank)[0];
      if (!replacement) continue;
      replacement.memory.remoteRoom = need.roomName;
      replacement.memory.remoteSlot = need.slot;
      delete replacement.memory.remoteReplacementOverlap;
      used.add(replacement.name);
    }
    const overlaps = new Set();
    for (const need of needs) {
      const key = `${need.roomName}:${need.slot}`;
      const expiring = miners.filter(creep => !used.has(creep.name) &&
        originalKey.get(creep.name) === key && !creep.spawning &&
        (creep.ticksToLive || 0) <= getReplacementLead(creep))
        .sort((a, b) => (a.ticksToLive || 0) -
          (b.ticksToLive || 0))[0];
      if (!expiring) continue;
      expiring.memory.remoteReplacementOverlap = true;
      overlaps.add(expiring.name);
    }
    const retired = [];
    for (const miner of miners) {
      if (used.has(miner.name) || overlaps.has(miner.name)) continue;
      miner.memory.role = 'retire';
      miner.memory.staffingRetire = true;
      miner.memory.retiredRole = 'remote-miner';
      miner.memory.assignmentRole = 'retire';
      delete miner.memory.assignmentKind;
      delete miner.memory.remoteReplacementOverlap;
      retired.push(miner.name);
    }
    results[room.name] = { needed: needs.length, assigned: used.size,
      overlaps: overlaps.size, retired };
  }
  return results;
};

module.exports = { reconcileRemoteHaulerRosters,
  reconcileRemoteMinerRosters };
