'use strict';

// Remote survey memory identifies rooms and lanes. It does not authorize a
// population. These selectors run only inside policy-owned aggregate gaps and
// choose one concrete missing assignment within that bounded total.
const createRemoteSpawnPlanner = dependencies => {
  const {
    isOutpostBuilder, hasRemoteReplacementLife,
    getRemoteHaulReadiness, getRemoteReplacementLead,
    BODYPART_COST, WORK, CARRY, MOVE
  } = dependencies;

  const getPlans = room => [
    { survey: room.memory.leftSurvey, team: 'left' },
    { survey: room.memory.southSurvey, team: 'south', delivery: 's2' },
    { survey: room.memory.southwestSurvey, team: 'southwest' }
  ].filter(entry => entry.survey && entry.survey.active &&
    entry.survey.targetRoom);

  const getNeeds = survey => Array.isArray(survey.remoteWorkNeeds) &&
    survey.remoteWorkNeeds.length ? survey.remoteWorkNeeds :
    [...Array(survey.remoteMinerTarget || 1).keys()].map(slot => ({
      slot, minMiners: 1, requiredWork: 1
    }));

  const planRemoteMinerReplacement = ({ room, workers, maintainRemotes }) => {
    if (!maintainRemotes) return null;
    const due = [];
    for (const entry of getPlans(room)) for (const need of getNeeds(entry.survey)) {
      const assigned = workers.filter(creep => creep.memory.role === 'remote-miner' &&
        creep.memory.remoteRoom === entry.survey.targetRoom && creep.memory.remoteSlot === need.slot);
      const safe = assigned.filter(creep => creep.spawning || hasRemoteReplacementLife(creep));
      if (safe.length >= Math.max(1, need.minMiners || 1)) continue;
      const deadline = assigned.length ? Math.min(...assigned.map(creep =>
        (creep.ticksToLive || 0) - getRemoteReplacementLead(creep))) : -Infinity;
      due.push({ entry, need, deadline });
    }
    const selected = due.sort((a, b) => a.deadline - b.deadline)[0];
    if (!selected) return null;
    const { entry, need } = selected;
    return { role: 'remote-miner', remoteRoom: entry.survey.targetRoom,
      remoteSlot: need.slot, remoteTeam: entry.team, remoteDelivery: entry.delivery,
      forceSpawn: true, requiredWork: Math.min(3, Math.max(1, need.requiredWork || 1)),
      minimumEnergy: Math.min(room.energyCapacityAvailable,
        Math.min(3, Math.max(1, need.requiredWork || 1)) * BODYPART_COST[WORK] +
          BODYPART_COST[CARRY] + 2 * BODYPART_COST[MOVE]),
      replacementDeadline: selected.deadline };
  };

  const planMinimumRemoteSpawn = ({
    room, workers, staffingPlan, maintainRemotes
  }) => {
    if (!maintainRemotes) return null;
    const plans = getPlans(room).sort((a, b) =>
      Number(Boolean(b.survey.deliveryPolicy?.blocked)) -
        Number(Boolean(a.survey.deliveryPolicy?.blocked)));
    const selectedGap = staffingPlan.minimumGap ||
      staffingPlan.ordinaryMinimumGap;
    const selectedRole = selectedGap && selectedGap.role;
    if (!['remoteBuilder', 'remoteHauler', 'remoteMiner']
      .includes(selectedRole)) return null;
    const builderJob = staffingPlan.jobs.remoteBuilder;
    const blockedHaulGap = plans.some(entry => entry.survey.deliveryPolicy?.blocked &&
      !workers.some(creep => creep.memory.role === 'remote-hauler' &&
        creep.memory.remoteRoom === entry.survey.targetRoom &&
        hasRemoteReplacementLife(creep)));
    if (selectedRole === 'remoteBuilder') {
      if (blockedHaulGap || !builderJob ||
          builderJob.coverageCount >= builderJob.min) return null;
      const plan = plans.filter(entry =>
        entry.survey.remoteBuilderTarget > 0).map(entry => {
        const assigned = workers.filter(creep => isOutpostBuilder(creep) &&
          creep.memory.remoteRoom === entry.survey.targetRoom &&
          hasRemoteReplacementLife(creep));
        const usedSlots = new Set(assigned.map(creep =>
          creep.memory.remoteBuilderSlot));
        const slot = [...Array(entry.survey.remoteBuilderTarget).keys()]
          .find(candidate => !usedSlots.has(candidate));
        return { ...entry, assigned: assigned.length, slot };
      }).filter(entry => Number.isInteger(entry.slot))
        .sort((a, b) =>
          a.assigned / a.survey.remoteBuilderTarget -
          b.assigned / b.survey.remoteBuilderTarget)[0];
      if (plan) return {
        role: 'builder', builderScope: 'outpost',
        builderMission: 'maintenance',
        remoteRoom: plan.survey.targetRoom,
        remoteBuilderSlot: plan.slot,
        remoteTeam: plan.team, remoteDelivery: plan.delivery,
        forceSpawn: true
      };
      return null;
    }

    const haulerJob = staffingPlan.jobs.remoteHauler;
    if (selectedRole === 'remoteHauler') {
      if (!haulerJob || haulerJob.coverageCount >= haulerJob.min) return null;
      for (const entry of plans) {
        const roomCovered = workers.some(creep =>
          creep.memory.role === 'remote-hauler' &&
          creep.memory.remoteRoom === entry.survey.targetRoom &&
          hasRemoteReplacementLife(creep));
        if (roomCovered) continue;
        for (const need of getNeeds(entry.survey)) {
          if (!getRemoteHaulReadiness(
            entry.survey.targetRoom, need.slot).ready) continue;
          return {
            role: 'remote-hauler',
            remoteRoom: entry.survey.targetRoom,
            remoteHaulerSlot: need.slot,
            remoteTeam: entry.team, remoteDelivery: entry.delivery,
            forceSpawn: true,
            minimumEnergy: Math.min(300, room.energyCapacityAvailable)
          };
        }
      }
      return null;
    }

    const minerJob = staffingPlan.jobs.remoteMiner;
    if (selectedRole !== 'remoteMiner' || !minerJob ||
        minerJob.coverageCount >= minerJob.min) return null;
    // Fund an uncovered physical source before adding WORK to an occupied
    // lane; otherwise the first outpost can starve every later room.
    for (const emptyOnly of [true, false]) for (const entry of plans) {
      if (entry.survey.deliveryPolicy?.blocked) continue;
      const remoteWorkers = workers.filter(creep =>
        creep.memory.role === 'remote-miner' &&
        creep.memory.remoteRoom === entry.survey.targetRoom);
      for (const need of getNeeds(entry.survey)) {
        const assigned = remoteWorkers.filter(creep =>
          creep.memory.remoteSlot === need.slot &&
          (creep.spawning ||
            creep.ticksToLive > getRemoteReplacementLead(creep)));
        if (emptyOnly && assigned.length > 0) continue;
        const assignedWork = assigned.reduce((total, creep) => total +
          creep.body.filter(part => part.type === WORK && part.hits > 0).length,
        0);
        if (assigned.length > 0 &&
            assignedWork >= Math.max(1, need.requiredWork || 0)) continue;
        return {
          role: 'remote-miner',
          requiredWork: Math.min(3, Math.max(1, need.requiredWork || 1)),
          remoteRoom: entry.survey.targetRoom,
          remoteSlot: need.slot,
          remoteTeam: entry.team, remoteDelivery: entry.delivery,
          forceSpawn: true,
          minimumEnergy: Math.min(room.energyCapacityAvailable,
            Math.min(3, Math.max(1, need.requiredWork || 1)) *
              BODYPART_COST[WORK] + BODYPART_COST[CARRY] +
              2 * BODYPART_COST[MOVE])
        };
      }
    }
    return null;
  };

  const planRemoteGrowthSpawn = ({
    room, workers, staffingPlan, allowRemoteGrowth,
    allowRemoteHaulingRecovery = false
  }) => {
    if (!allowRemoteGrowth && !allowRemoteHaulingRecovery) return null;
    const plans = getPlans(room).sort((a, b) =>
      Number(Boolean(b.survey.deliveryPolicy?.blocked)) -
        Number(Boolean(a.survey.deliveryPolicy?.blocked)));
    const haulerJob = staffingPlan.jobs.remoteHauler;
    if (haulerJob && (haulerJob.coverageCount ?? haulerJob.count) < haulerJob.desired) {
      const plan = plans.map(entry => {
        const target = Math.max(0, entry.survey.remoteHaulerTarget || 0);
        const assigned = workers.filter(creep =>
          creep.memory.role === 'remote-hauler' &&
          creep.memory.remoteRoom === entry.survey.targetRoom &&
          hasRemoteReplacementLife(creep));
        const usedSlots = new Set(assigned.map(creep =>
          creep.memory.remoteHaulerSlot));
        const slot = [...Array(target).keys()].find(candidate =>
          !usedSlots.has(candidate) &&
          getRemoteHaulReadiness(
            entry.survey.targetRoom, candidate).ready);
        return { ...entry, target, assigned: assigned.length, slot };
      }).filter(entry => entry.target > 0 && Number.isInteger(entry.slot))
        .sort((a, b) =>         Number(Boolean(b.survey.deliveryPolicy?.blocked)) -
          Number(Boolean(a.survey.deliveryPolicy?.blocked)) ||
        a.assigned / a.target - b.assigned / b.target)[0];
      if (plan) return {
        role: 'remote-hauler', remoteRoom: plan.survey.targetRoom,
        remoteHaulerSlot: plan.slot, remoteTeam: plan.team,
        remoteDelivery: plan.delivery, forceSpawn: true,
        minimumEnergy: Math.min(300, room.energyCapacityAvailable)
      };
    }

    if (!allowRemoteGrowth) return null;
    const builderJob = staffingPlan.jobs.remoteBuilder;
    if (!builderJob || builderJob.count >= builderJob.desired) return null;
    const plan = plans.filter(entry =>
      entry.survey.remoteBuilderTarget > 0).map(entry => {
      const assigned = workers.filter(creep => isOutpostBuilder(creep) &&
        creep.memory.remoteRoom === entry.survey.targetRoom &&
        hasRemoteReplacementLife(creep));
      const usedSlots = new Set(assigned.map(creep =>
        creep.memory.remoteBuilderSlot));
      const slot = [...Array(entry.survey.remoteBuilderTarget).keys()]
        .find(candidate => !usedSlots.has(candidate));
      return { ...entry, assigned: assigned.length, slot };
    }).filter(entry => Number.isInteger(entry.slot))
      .sort((a, b) =>
        a.assigned / a.survey.remoteBuilderTarget -
        b.assigned / b.survey.remoteBuilderTarget)[0];
    return plan ? {
      role: 'builder', builderScope: 'outpost',
      builderMission: 'maintenance', remoteRoom: plan.survey.targetRoom,
      remoteBuilderSlot: plan.slot, remoteTeam: plan.team,
      remoteDelivery: plan.delivery, forceSpawn: true
    } : null;
  };

  return { getPlans, planMinimumRemoteSpawn, planRemoteGrowthSpawn, planRemoteMinerReplacement };
};

module.exports = { createRemoteSpawnPlanner };
