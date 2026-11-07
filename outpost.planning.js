'use strict';

const createOutpostPlanning = ({
  Game, getRemoteBuilderTarget, getRemoteHaulerTarget,
  getSourceBodyWorkCapacity, scheduledRoomTick, FIND_SOURCES, LEFT, BOTTOM,
  ENERGY_REGEN_TIME, HARVEST_POWER
}) => {
  const getMinerTarget = (survey, remoteRoom) =>
    Array.isArray(survey.remoteWorkNeeds) && survey.remoteWorkNeeds.length
      ? survey.remoteWorkNeeds.reduce((total, need) => total +
        Math.max(1, need.minMiners || 0), 0)
      : remoteRoom ? remoteRoom.find(FIND_SOURCES).length : 1;

  const refreshRemoteWorkNeeds = (homeRoom, survey, remoteRoom, refresh,
    fallbackWhenUnseen = false) => {
    if (remoteRoom && (!Array.isArray(survey.remoteWorkNeeds) || refresh)) {
      const sources = remoteRoom.find(FIND_SOURCES)
        .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
      if (sources.length > 0) {
        if (!survey.sourceStats) survey.sourceStats = {};
        survey.remoteWorkNeeds = sources.map((source, slot) => {
          const stats = survey.sourceStats[source.id] || {};
          const requiredWork = Math.ceil(source.energyCapacity /
            ENERGY_REGEN_TIME / HARVEST_POWER);
          const minMiners = Math.ceil(requiredWork /
            getSourceBodyWorkCapacity(homeRoom));
          stats.targetMiners = minMiners;
          stats.staffingVersion = 'required-work-v1';
          survey.sourceStats[source.id] = stats;
          return { slot, minMiners, requiredWork };
        });
      }
    } else if (fallbackWhenUnseen &&
        !Array.isArray(survey.remoteWorkNeeds)) {
      survey.remoteWorkNeeds = [{ slot: 0, minMiners: 1, requiredWork: 1 }];
    }
    return survey.remoteWorkNeeds;
  };

  const planLeftSurvey = room => {
    const exits = Game.map.describeExits(room.name) || {};
    const targetRoom = exits[LEFT];
    if (!targetRoom) return null;
    const survey = room.memory.leftSurvey || {
      active: true,
      started: Game.time
    };
    survey.active = true;
    survey.targetRoom = targetRoom;
    if (!survey.started) survey.started = Game.time;
    const remoteRoom = Game.rooms[targetRoom];
    refreshRemoteWorkNeeds(room, survey, remoteRoom,
      true, true);
    survey.remoteMinerTarget = getMinerTarget(survey, remoteRoom);
    survey.remoteHaulerTarget = getRemoteHaulerTarget(room.name, targetRoom);
    survey.haulPlanUpdated = Game.time;
    survey.remoteBuilderTarget = getRemoteBuilderTarget(remoteRoom);
    room.memory.leftSurvey = survey;
    return survey;
  };

  const planSouthSurvey = room => {
    const exits = Game.map.describeExits(room.name) || {};
    const targetRoom = exits[BOTTOM];
    if (!targetRoom) return null;
    const survey = room.memory.southSurvey || {
      active: true,
      started: Game.time
    };
    survey.active = true;
    survey.targetRoom = targetRoom;
    const remoteRoom = Game.rooms[targetRoom];
    survey.remoteMinerTarget = getMinerTarget(survey, remoteRoom);
    survey.remoteHaulerTarget = getRemoteHaulerTarget(room.name, targetRoom);
    survey.haulPlanUpdated = Game.time;
    survey.remoteBuilderTarget = getRemoteBuilderTarget(remoteRoom);
    survey.delivery = 's2';
    refreshRemoteWorkNeeds(room, survey, remoteRoom,
      true, true);
    room.memory.southSurvey = survey;
    return survey;
  };

  const planSouthwestSurvey = room => {
    const homeExits = Game.map.describeExits(room.name) || {};
    const westRoomName = homeExits[LEFT];
    const westExits = westRoomName
      ? Game.map.describeExits(westRoomName) || {} : {};
    const southRoomName = homeExits[BOTTOM];
    const southExits = southRoomName
      ? Game.map.describeExits(southRoomName) || {} : {};
    const targetRoom = westExits[BOTTOM] || southExits[LEFT];
    if (!targetRoom) return null;
    const survey = room.memory.southwestSurvey || {
      active: true,
      started: Game.time
    };
    survey.active = true;
    survey.targetRoom = targetRoom;
    const remoteRoom = Game.rooms[targetRoom];
    survey.remoteMinerTarget = getMinerTarget(survey, remoteRoom);
    survey.remoteBuilderTarget = getRemoteBuilderTarget(remoteRoom);
    survey.remoteHaulerTarget = getRemoteHaulerTarget(room.name, targetRoom);
    survey.haulPlanUpdated = Game.time;
    refreshRemoteWorkNeeds(room, survey, remoteRoom,
      true, true);
    room.memory.southwestSurvey = survey;
    return survey;
  };

  const planRegionalOutposts = rooms => {
    const planned = {};
    for (const room of rooms) {
      if (!room.controller || !room.controller.my) continue;
      planned[room.name] = {
        left: planLeftSurvey(room),
        south: planSouthSurvey(room),
        southwest: planSouthwestSurvey(room)
      };
    }
    return planned;
  };

  return { getMinerTarget, refreshRemoteWorkNeeds, planLeftSurvey,
    planSouthSurvey, planSouthwestSurvey, planRegionalOutposts };
};

module.exports = { createOutpostPlanning };
