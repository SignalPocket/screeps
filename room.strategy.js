'use strict';

const createRoomStrategy = ({
  Game,
  getRoomSources,
  getRoomStagePlan,
  FIND_STRUCTURES,
  FIND_MY_SPAWNS,
  FIND_MY_STRUCTURES,
  STRUCTURE_ROAD,
  STRUCTURE_TOWER
}) => {
  // Re-evaluate the earliest unmet gate so rooms advance or regress as
  // conditions change.
  const getRoomStrategy = room => {
    const level = room.controller ? room.controller.level : 0;
    const stage = getRoomStagePlan(level);
    const sources = getRoomSources(room);
    const roads = room.find(FIND_STRUCTURES)
      .filter(structure => structure.structureType === STRUCTURE_ROAD);
    const roadTargets = [
      ...room.find(FIND_MY_SPAWNS),
      ...(room.controller ? [room.controller] : []),
      ...sources
    ];
    const roadAccess = roadTargets.filter(target =>
      roads.some(road => target.pos.getRangeTo(road) <= 1)).length;
    const towerCount = room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_TOWER
    }).length;
    const hasStorage = Boolean(room.storage && room.storage.my);
    const ownedSpawnRooms = new Set(Object.values(Game.spawns)
      .map(spawn => spawn.room.name)).size;
    const hasGclSlot = Boolean(Game.gcl && Game.gcl.level > ownedSpawnRooms);
    let mode;
    let gate;
    let objectives;
    let progress;

    if (level < 3) {
      mode = 'setup';
      gate = 'reach controller level 3';
      objectives = 'establish energy buffers, build extensions, and raise RCL';
      progress = `RCL ${level}/3`;
    } else if (level < 5) {
      mode = 'development';
      gate = 'reach controller level 5';
      objectives = 'build extensions, raise RCL, fill containers, and repair';
      progress = `RCL ${level}/5`;
    } else if (roadAccess < roadTargets.length) {
      mode = 'roads';
      gate = 'build road access beside every spawn, controller, and source';
      objectives = 'complete core road access while maintaining energy and RCL';
      progress = `road access ${roadAccess}/${roadTargets.length}`;
    } else if (level < 6 || towerCount < 1 || !hasStorage) {
      mode = 'infrastructure';
      gate = 'reach RCL 6 and build a tower and storage';
      objectives = 'build core infrastructure and repair damaged structures';
      progress = `RCL ${level}/6, tower ${towerCount ? 'ready' : 'needed'}, ` +
        `storage ${hasStorage ? 'ready' : 'needed'}`;
    } else if (level < 7 || !hasGclSlot) {
      mode = 'remote-sources';
      gate = 'reach RCL 7 and have an available GCL room slot';
      objectives = 'prepare additional energy sources and maintain the core room';
      progress = `RCL ${level}/7, GCL slot ${hasGclSlot ? 'ready' : 'needed'}`;
    } else {
      mode = 'expansion-ready';
      gate = 'claim and establish another room';
      objectives = 'expand, then run setup gates in the new room';
      progress = 'RCL and GCL gates met';
    }

    const strategy = {
      mode, gate, objectives, progress, updated: Game.time,
      stage: stage.key,
      stageName: stage.name,
      stageGoal: stage.goal,
      stageLogic: [...stage.logic],
      constructionOrder: [...stage.construction],
      stageGates: [...stage.advanceWhen]
    };
    room.memory.strategy = strategy;
    room.memory.stagePlan = {
      updated: Game.time,
      rcl: level,
      key: stage.key,
      name: stage.name,
      goal: stage.goal,
      logic: [...stage.logic],
      construction: [...stage.construction],
      advanceWhen: [...stage.advanceWhen]
    };
    return strategy;
  };

  return { getRoomStrategy };
};

module.exports = { createRoomStrategy };
