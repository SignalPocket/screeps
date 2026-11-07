'use strict';

const { selectMinimumStaffingGap } =
  typeof Game === 'undefined'
    ? require('./staffing.minimums')
    : require('staffing.minimums');
const { selectBaselineStaffingGap } =
  typeof Game === 'undefined'
    ? require('./staffing.baseline')
    : require('staffing.baseline');

const { getReservationCoverage } = typeof Game === 'undefined'
  ? require('./remote.reservation') : require('remote.reservation');

const MINIMUM_PRIORITY = [
  'defender', 'refiller', 'source', 'upgrader', 'repairBuilder', 'builder', 'hauler',
  'tunnelBuilder', 'remoteBuilder', 'remoteHauler', 'remoteMiner', 'remoteReserver',
  'rebalancer'
];

const normalizeTarget = target => {
  const minimum = Math.max(0, target && target.min || 0);
  const desired = Math.max(minimum, target && target.desired || 0);
  return {
    min: minimum,
    desired,
    max: target && target.max === null
      ? null : Math.max(desired, target && target.max || 0)
  };
};

const createStaffingPlanner = dependencies => {
  const {
    isBuilder, isLocalBuilder, hasWorkParts,
    hasLocalReplacementLife, hasRemoteReplacementLife,
    getRoomSources = () => []
  } = dependencies;

  /**
   * Compare viable creep coverage with an already-derived policy.
   * This planner may count and rank gaps; it must not create independent
   * targets from room memory. Remote targets therefore come from policy.remote
   * even though survey memory is still used to identify eligible creeps.
   */
  const buildRoomStaffingPlan = (room, creeps, policy) => {
    const homeCreeps = (creeps || []).filter(creep =>
      creep.memory.home === room.name);
    const localViable = creep => creep.spawning ||
      hasLocalReplacementLife(creep);
    const remoteViable = creep => creep.spawning ||
      hasRemoteReplacementLife(creep);
    const surveys = [room.memory.leftSurvey, room.memory.southSurvey,
      room.memory.southwestSurvey].filter(survey =>
      survey && survey.active && survey.targetRoom);
    const remoteRooms = new Set(surveys.map(survey => survey.targetRoom));
    const jobs = {};
    const add = (key, members, target, coverageCount = members.length) => {
      jobs[key] = {
        key,
        members,
        count: members.length,
        coverageCount,
        ...normalizeTarget(target)
      };
    };
    const roles = policy.roles;
    const remotePolicy = policy.remote || {};
    add('source', homeCreeps.filter(creep => localViable(creep) &&
      (creep.memory.role === 'miner' ||
        creep.memory.role === 'harvester') && hasWorkParts(creep)),
    roles.source);
    const refillers = homeCreeps.filter(creep => localViable(creep) &&
      creep.memory.role === 'refiller');
    const coveredClusters = new Set(refillers.map(creep =>
      creep.memory.refillClusterId).filter(Boolean));
    const unassignedRefillers = refillers.filter(creep =>
      !creep.memory.refillClusterId).length;
    add('refiller', refillers, roles.refiller,
      coveredClusters.size + unassignedRefillers);
    add('hauler', homeCreeps.filter(creep => localViable(creep) &&
      creep.memory.role === 'hauler'), roles.hauler);
    add('rebalancer', homeCreeps.filter(creep => localViable(creep) &&
      creep.memory.role === 'rebalancer'), roles.rebalancer);
    add('defender', homeCreeps.filter(creep => localViable(creep) &&
      creep.memory.role === 'defender' &&
      creep.getActiveBodyparts('attack') > 0), roles.defender);
    add('upgrader', homeCreeps.filter(creep => localViable(creep) &&
      creep.memory.role === 'upgrader' && hasWorkParts(creep)),
    roles.upgrader);
    add('builder', homeCreeps.filter(creep => localViable(creep) &&
      isLocalBuilder(creep) && creep.memory.builderMission !== 'repair' &&
      creep.memory.builderMission !== 'tunnel' && hasWorkParts(creep)),
    roles.builder);
    add('repairBuilder', homeCreeps.filter(creep => localViable(creep) &&
      isBuilder(creep, 'local', 'repair') && hasWorkParts(creep)),
    roles.repairBuilder);
    add('tunnelBuilder', homeCreeps.filter(creep => localViable(creep) &&
      isBuilder(creep, 'local', 'tunnel') && hasWorkParts(creep)),
    roles.tunnelBuilder);

    const remoteMiners = homeCreeps.filter(creep => remoteViable(creep) &&
      creep.memory.role === 'remote-miner' &&
      remoteRooms.has(creep.memory.remoteRoom));
    const remoteMinerTargets = new Map(surveys.map(survey =>
      [survey.targetRoom, Math.max(0,
        Array.isArray(survey.remoteWorkNeeds) &&
          survey.remoteWorkNeeds.length
          ? survey.remoteWorkNeeds.length
          : survey.remoteMinerTarget || 0)]));
    const coveredRemoteMinerSlots = new Set(remoteMiners.map(creep => {
      const slot = creep.memory.remoteSlot;
      const target = remoteMinerTargets.get(creep.memory.remoteRoom) || 0;
      return Number.isInteger(slot) && slot >= 0 && slot < target
        ? `${creep.memory.remoteRoom}:${slot}` : null;
    }).filter(Boolean));
    add('remoteMiner', remoteMiners, {
      min: remotePolicy.minersMin || 0,
      desired: remotePolicy.miners || 0,
      max: null
    }, coveredRemoteMinerSlots.size);
    const remoteHaulers = homeCreeps.filter(creep => remoteViable(creep) &&
      creep.memory.role === 'remote-hauler' &&
      remoteRooms.has(creep.memory.remoteRoom));
    const coveredRemoteRooms = new Set(remoteHaulers.map(creep =>
      creep.memory.remoteRoom));
    add('remoteHauler', remoteHaulers, {
      min: remotePolicy.haulersMin || 0,
      desired: remotePolicy.haulers || 0,
      max: null
    }, coveredRemoteRooms.size);
    const remoteBuilders = homeCreeps.filter(creep => remoteViable(creep) &&
      isBuilder(creep, 'outpost') &&
      remoteRooms.has(creep.memory.remoteRoom));
    const remoteBuilderTargets = new Map(surveys.map(survey =>
      [survey.targetRoom, Math.max(0, survey.remoteBuilderTarget || 0)]));
    const coveredRemoteBuilderSlots = new Set(remoteBuilders.map(creep => {
      const slot = creep.memory.remoteBuilderSlot;
      const target = remoteBuilderTargets.get(creep.memory.remoteRoom) || 0;
      return Number.isInteger(slot) && slot >= 0 && slot < target
        ? `${creep.memory.remoteRoom}:${slot}` : null;
    }).filter(Boolean));
    add('remoteBuilder', remoteBuilders, {
      min: remotePolicy.buildersMin || 0,
      desired: remotePolicy.builders || 0,
      max: null
    }, coveredRemoteBuilderSlots.size);

    const reservation = getReservationCoverage(room, homeCreeps, policy,
      dependencies.Game || globalThis.Game || { map: { findRoute: () => [] }, spawns: {} });
    add('remoteReserver', reservation.members, {
      min: remotePolicy.reserversMin || 0, desired: remotePolicy.reservers || 0,
      max: remotePolicy.reservers || 0
    }, reservation.count);

    const sourceIds = new Set(getRoomSources(room).map(source => source.id));
    const coveredSources = new Set(jobs.source.members.map(creep =>
      creep.memory.minerSource || creep.memory.preferredSource ||
      creep.memory.harvestSource || creep.memory.sourceReplacement ||
      creep.memory.sourceReserve).filter(sourceId =>
      sourceIds.has(sourceId)));
    const workMembers = [...jobs.builder.members,
      ...jobs.repairBuilder.members, ...jobs.tunnelBuilder.members];
    const baselineCoverage = {
      miner: Math.min(1, coveredSources.size),
      upgrader: Math.min(1, jobs.upgrader.coverageCount),
      spawnFiller: Math.min(1, jobs.refiller.coverageCount),
      builderFixer: Math.min(1,
        new Set(workMembers.map(creep => creep.name)).size)
    };
    const baselineGap = selectBaselineStaffingGap(baselineCoverage);
    const emergencyEntries = [
      {
        key: 'source', label: 'LM', target: sourceIds.size,
        count: jobs.source.count, coverageCount: coveredSources.size
      },
      {
        key: 'refiller', label: 'RF',
        target: jobs.refiller.min > 0 ? 1 : 0,
        count: jobs.refiller.count,
        coverageCount: Math.min(1, jobs.refiller.coverageCount)
      },
      {
        key: 'hauler', label: 'LC', target: jobs.hauler.min > 0 ? 1 : 0,
        count: jobs.hauler.count,
        coverageCount: Math.min(1, jobs.hauler.coverageCount)
      },
      {
        key: 'upgrader', label: 'UP',
        target: jobs.upgrader.min > 0 ? 1 : 0,
        count: jobs.upgrader.count,
        coverageCount: Math.min(1, jobs.upgrader.coverageCount)
      },
      {
        key: 'worker', label: 'WK',
        target: jobs.builder.min + jobs.repairBuilder.min +
          jobs.tunnelBuilder.min > 0 ? 1 : 0,
        count: new Set(workMembers.map(creep => creep.name)).size,
        coverageCount: Math.min(1,
          new Set(workMembers.map(creep => creep.name)).size)
      }
    ];
    const emergency = {
      entries: emergencyEntries,
      missing: emergencyEntries.filter(entry =>
        entry.coverageCount < entry.target)
    };

    const counts=Object.fromEntries(Object.entries(jobs).map(([key,job])=>[key,job.coverageCount]));
    // Optional balancing and remote gaps must not hide an executable core gap.
    const coreJobs=Object.fromEntries(Object.entries(jobs).filter(([key])=>
      ['defender','source','refiller','upgrader','repairBuilder','builder',
        'hauler','tunnelBuilder'].includes(key)));
    const coreMinimumGap = selectMinimumStaffingGap(coreJobs, counts,
      MINIMUM_PRIORITY);
    // Balancing is below the productive home floor but above remote work. A
    // remote gap used to hide a required 0/1 rebalancer, so the spawn selector
    // proposed the brigade and the final authority rejected it forever.
    const rebalancerMinimumGap = !coreMinimumGap
      ? selectMinimumStaffingGap({ rebalancer: jobs.rebalancer }, counts,
        MINIMUM_PRIORITY)
      : null;
    const blockedRemoteHaulGap = !coreMinimumGap && surveys.some(survey =>
      survey.deliveryPolicy && survey.deliveryPolicy.blocked &&
      !jobs.remoteHauler.members.some(creep =>
        creep.memory.remoteRoom === survey.targetRoom))
      ? {
        role: 'remoteHauler',
        minimum: Math.max(1, jobs.remoteHauler.min),
        count: jobs.remoteHauler.coverageCount,
        coverage: jobs.remoteHauler.coverageCount /
          Math.max(1, jobs.remoteHauler.min)
      } : null;
    const ordinaryMinimumGap = coreMinimumGap || rebalancerMinimumGap ||
      blockedRemoteHaulGap ||
      selectMinimumStaffingGap(jobs, counts, MINIMUM_PRIORITY);
    const minimumGap = baselineGap || ordinaryMinimumGap;
    return { roomName: room.name, surveys, jobs, emergency,
      baseline: { coverage: baselineCoverage, gap: baselineGap },
      baselineGap, ordinaryMinimumGap, minimumGap };
  };

  return { buildRoomStaffingPlan };
};

module.exports = { MINIMUM_PRIORITY, normalizeTarget, createStaffingPlanner };
