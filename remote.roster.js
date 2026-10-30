'use strict';

const reconcileRemoteHaulerRosters = ({
  rooms, creeps, Game, RESOURCE_ENERGY
}) => {
  const results = {};
  for (const room of rooms.filter(candidate =>
    candidate.controller && candidate.controller.my)) {
    const rosterPlans = [
      { survey: room.memory.leftSurvey, team: 'left' },
      { survey: room.memory.southSurvey, team: 'south', delivery: 's2' },
      { survey: room.memory.southwestSurvey, team: 'southwest' }
    ].filter(entry => entry.survey && entry.survey.active &&
      entry.survey.targetRoom && entry.survey.remoteHaulerTarget > 0);
    const signature = rosterPlans.map(entry =>
      `${entry.survey.targetRoom}:${entry.survey.remoteHaulerTarget}`)
      .sort().join('|');
    const haulers = creeps.filter(creep =>
      creep.memory.role === 'remote-hauler' &&
      (creep.memory.remoteHome || creep.memory.home) === room.name);
    const needs = rosterPlans.flatMap(entry =>
      [...Array(entry.survey.remoteHaulerTarget).keys()].map(slot => ({
        roomName: entry.survey.targetRoom,
        slot,
        team: entry.team,
        delivery: entry.delivery,
        creep: null
      })));
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

module.exports = { reconcileRemoteHaulerRosters };
