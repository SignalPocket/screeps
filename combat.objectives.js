'use strict';

const getActiveCombatObjectives = homeMemory =>
  Object.entries(homeMemory && homeMemory.combatObjectives || {})
    .filter(([, objective]) => objective && objective.active !== false)
    .map(([roomName, objective]) => ({ roomName, ...objective,
      requiredDefenders: Math.max(1, objective.requiredDefenders || 1) }));

const makeObjectiveTarget = (roomName, structureType) => ({
  id: `combat-objective:${roomName}`,
  structureType,
  hits: 1,
  getActiveBodyparts: () => 0
});

const reconcileCombatObjectives = ({ homeRoom, Game, getTargets,
  invaderCoreType }) => {
  const threats = [];
  for (const objective of getActiveCombatObjectives(homeRoom.memory)) {
    const saved = homeRoom.memory.combatObjectives[objective.roomName];
    const room = Game.rooms[objective.roomName];
    if (!room) {
      saved.status = 'seeking-vision';
      threats.push({ creep: makeObjectiveTarget(objective.roomName,
        invaderCoreType), roomName: objective.roomName,
      homeRoomName: homeRoom.name,
      requiredDefenders: objective.requiredDefenders,
      combatObjective: true });
      continue;
    }
    const targets = getTargets(room);
    const objectiveTargets = objective.kind === 'invader-core'
      ? targets.filter(target => target.structureType === invaderCoreType)
      : targets;
    if (objectiveTargets.length > 0) {
      saved.status = 'engaged';
      saved.observed = true;
      saved.lastSeen = Game.time;
      threats.push(...objectiveTargets.map(creep => ({ creep,
        roomName: objective.roomName, homeRoomName: homeRoom.name,
        requiredDefenders: objective.requiredDefenders,
        combatObjective: true })));
      continue;
    }
    saved.active = false;
    saved.status = 'complete';
    saved.completed = Game.time;
  }
  return threats;
};

const getObjectiveDefenderRequirements = rooms => {
  const required = {};
  for (const room of rooms || []) {
    for (const objective of getActiveCombatObjectives(room.memory)) {
      required[objective.roomName] = Math.max(
        required[objective.roomName] || 0, objective.requiredDefenders);
    }
  }
  return required;
};

module.exports = { getActiveCombatObjectives, reconcileCombatObjectives,
  getObjectiveDefenderRequirements };
