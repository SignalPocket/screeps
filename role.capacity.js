'use strict';

// Build one stronger upgrader before retiring the weaker body it replaces.
// operationWork is the WORK count chosen by the active situation policy for
// each upgrader body. It is not the total room upgrade budget.
const planControllerRelief = ({
  room, workers, viable = () => true, operationWork = 0
}) => {
  const capacityPlan = room.memory.laborPlan?.upgrader;
  if (!capacityPlan) return null;
  if (capacityPlan.desired === 1 && !operationWork) return null;

  const roster = workers.filter(creep =>
    creep.memory.role === 'upgrader' && !creep.memory.staffingRetire);
  const replacementAlreadyExists = roster.some(creep =>
    creep.memory.qualityFor);
  if (replacementAlreadyExists || roster.length < capacityPlan.desired) {
    return null;
  }

  const requiredWork = operationWork || capacityPlan.workParts || 1;
  const weakest = roster.filter(creep =>
    viable(creep) && !creep.spawning &&
    creep.getActiveBodyparts('work') < requiredWork * 0.75)
    .sort((left, right) =>
      left.getActiveBodyparts('work') -
      right.getActiveBodyparts('work'))[0];
  if (!weakest) return null;

  return {
    role: 'upgrader',
    bodyType: 'controller',
    qualityFor: weakest.name,
    forceSpawn: true,
    requiredWork,
    workLimit: requiredWork,
    operationWork: operationWork || undefined,
    spawnBodyRole: operationWork ? 'upgrader' : undefined,
    minimumEnergy: operationWork
      ? requiredWork * 100 + 100 + Math.ceil(requiredWork / 4) * 50
      : requiredWork * 100 + 200
  };
};

// Keep the incumbent working until its stronger replacement reaches an RC
// station. Only then may the old body become a builder or retire.
const reconcileControllerRelief = ({ Game, isRoadMobile }) => {
  for (const replacement of Object.values(Game.creeps)) {
    const incumbentName = replacement.memory.qualityFor;
    if (!incumbentName || replacement.spawning ||
        replacement.room.name !== replacement.memory.home) continue;
    if (replacement.room.controller &&
        replacement.pos.getRangeTo(replacement.room.controller) > 3) continue;

    const incumbent = Game.creeps[incumbentName];
    if (incumbent?.memory.role === 'upgrader' && isRoadMobile(incumbent)) {
      Object.assign(incumbent.memory, {
        role: 'builder',
        bodyType: 'worker',
        builderScope: 'local',
        builderMission: 'flexible',
        assignmentBuilderMission: 'flexible'
      });
      for (const key of ['workJob', 'controllerStation', 'withdrawTarget',
        'task', 'taskTarget', 'demandLane']) delete incumbent.memory[key];
    } else if (incumbent?.memory.role === 'upgrader') {
      incumbent.memory.role = 'retire';
      incumbent.memory.staffingRetire = true;
    }
    delete replacement.memory.qualityFor;
  }
};

const repurposeSurplusUpgrader = (creep, isRoadMobile) => {
  if (isRoadMobile(creep)) {
    Object.assign(creep.memory, {
      role: 'builder',
      bodyType: 'worker',
      builderScope: 'local',
      builderMission: 'flexible',
      assignmentBuilderMission: 'flexible'
    });
  } else {
    creep.memory.role = 'retire';
    creep.memory.staffingRetire = true;
  }
  for (const key of ['controllerStation', 'workJob', 'withdrawTarget',
    'task', 'taskTarget', 'demandLane']) delete creep.memory[key];
};

// Enforce the count selected by the current situation policy. The default is
// one for survival and ordinary constrained rooms. A funded GCL push passes
// three, so three upgraders remain upgraders instead of being silently
// converted by a global cleanup rule.
const enforceUpgraderLimit = ({
  Game, isRoadMobile, getLimit = () => 1
}) => {
  const ownedRooms = Object.values(Game.rooms).filter(room =>
    room.controller?.my);
  for (const room of ownedRooms) {
    const selectedLimit = Math.max(1, Math.floor(getLimit(room) || 1));
    const allCreeps = Object.values(Game.creeps);
    const travelingReplacements = allCreeps.filter(creep =>
      creep.memory.home === room.name && creep.memory.qualityFor &&
      (creep.spawning || creep.room.name !== room.name ||
        creep.pos?.getRangeTo(room.controller) > 3));
    const protectedNames = new Set(travelingReplacements.flatMap(creep =>
      [creep.name, creep.memory.qualityFor]));

    const roster = allCreeps.filter(creep =>
      creep.memory.home === room.name &&
      creep.memory.role === 'upgrader' && !creep.spawning &&
      !protectedNames.has(creep.name))
      .sort((left, right) =>
        right.getActiveBodyparts('work') -
          left.getActiveBodyparts('work') ||
        (right.ticksToLive || 0) - (left.ticksToLive || 0) ||
        (left.pos?.getRangeTo(room.controller) ?? Infinity) -
          (right.pos?.getRangeTo(room.controller) ?? Infinity));

    roster.forEach((creep, index) => {
      delete creep.memory.qualityFor;
      if (index < selectedLimit) return;
      repurposeSurplusUpgrader(creep, isRoadMobile);
    });
  }
};

// Compatibility wrapper for callers that intentionally want the default
// one-upgrader policy.
const enforceSingleUpgrader = options => enforceUpgraderLimit(options);

module.exports = {
  planControllerRelief,
  reconcileControllerRelief,
  enforceUpgraderLimit,
  enforceSingleUpgrader
};
