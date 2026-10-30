'use strict';

const { selectMinimumStaffingGap } =
  typeof Game === 'undefined'
    ? require('./staffing.minimums')
    : require('staffing.minimums');

const MINIMUM_PRIORITY = [
  'refiller', 'source', 'upgrader', 'repairBuilder', 'builder', 'hauler',
  'tunnelBuilder', 'remoteBuilder', 'remoteHauler', 'remoteMiner',
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
      creep.memory.role === 'remote-scout' &&
      remoteRooms.has(creep.memory.remoteRoom));
    const remoteMinerTarget = surveys.reduce((total, survey) => total +
      (Array.isArray(survey.remoteWorkNeeds) && survey.remoteWorkNeeds.length
        ? survey.remoteWorkNeeds.reduce((sum, need) => sum +
          Math.max(1, need.minMiners || 0), 0)
        : Math.max(1, survey.remoteMinerTarget || 0)), 0);
    add('remoteMiner', remoteMiners, {
      min: remoteMinerTarget, desired: remoteMinerTarget,
      max: null
    });
    const remoteHaulers = homeCreeps.filter(creep => remoteViable(creep) &&
      creep.memory.role === 'remote-hauler' &&
      remoteRooms.has(creep.memory.remoteRoom));
    const coveredRemoteRooms = new Set(remoteHaulers.map(creep =>
      creep.memory.remoteRoom));
    const remoteHaulerTarget = surveys.reduce((total, survey) => total +
      Math.max(1, survey.remoteHaulerTarget || 0), 0);
    add('remoteHauler', remoteHaulers, {
      min: surveys.length,
      desired: remoteHaulerTarget,
      max: null
    }, coveredRemoteRooms.size);
    const remoteBuilders = homeCreeps.filter(creep => remoteViable(creep) &&
      isBuilder(creep, 'outpost') &&
      remoteRooms.has(creep.memory.remoteRoom));
    const remoteBuilderTarget = surveys.reduce((total, survey) => total +
      Math.max(0, survey.remoteBuilderTarget || 0), 0);
    const remoteBuilderMinimum = surveys.filter(survey =>
      (survey.remoteBuilderTarget || 0) > 0).length;
    add('remoteBuilder', remoteBuilders, {
      min: remoteBuilderMinimum,
      desired: remoteBuilderTarget,
      max: null
    });

    const sourceIds = new Set(getRoomSources(room).map(source => source.id));
    const coveredSources = new Set(jobs.source.members.map(creep =>
      creep.memory.minerSource || creep.memory.preferredSource ||
      creep.memory.harvestSource || creep.memory.sourceReplacement ||
      creep.memory.sourceReserve).filter(sourceId =>
      sourceIds.has(sourceId)));
    const workMembers = [...jobs.builder.members,
      ...jobs.repairBuilder.members, ...jobs.tunnelBuilder.members];
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

    const minimumGap = selectMinimumStaffingGap(jobs,
      Object.fromEntries(Object.entries(jobs).map(([key, job]) =>
        [key, job.coverageCount])), MINIMUM_PRIORITY);
    return { roomName: room.name, surveys, jobs, emergency, minimumGap };
  };

  return { buildRoomStaffingPlan };
};

module.exports = { MINIMUM_PRIORITY, normalizeTarget, createStaffingPlanner };
