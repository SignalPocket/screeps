'use strict';

const normalizeBuilderMemory = memory => {
  if (!memory) return false;
  const legacyRole = memory.role;
  if (legacyRole === 'worker' &&
      (memory.builderScope === 'outpost' ||
        memory.builderScope === 'expansion')) {
    memory.role = 'builder';
  } else if (legacyRole === 'fixer') {
    memory.role = 'builder';
    memory.builderScope = 'local';
    memory.builderMission = 'repair';
  } else if (legacyRole === 'digger') {
    memory.role = 'builder';
    memory.builderScope = 'local';
    memory.builderMission = 'tunnel';
    memory.builderTarget = memory.diggerTarget;
  } else if (legacyRole === 'remote-builder') {
    memory.role = 'builder';
    memory.builderScope = 'outpost';
    memory.builderMission = 'maintenance';
  } else if (legacyRole === 'expansion-builder') {
    memory.role = 'builder';
    memory.builderScope = 'expansion';
    memory.builderMission = 'bootstrap';
  } else if (legacyRole === 'builder') {
    if (!memory.builderScope) memory.builderScope = 'local';
    if (!memory.builderMission) memory.builderMission = 'build';
  } else {
    return false;
  }
  if (!memory.birthRole || memory.birthRole === legacyRole) {
    memory.birthRole = 'builder';
  }
  delete memory.diggerTarget;
  return legacyRole !== memory.role;
};

const isBuilder = (creep, scope, mission) => Boolean(creep &&
  creep.memory.role === 'builder' &&
  (!scope || (creep.memory.builderScope || 'local') === scope) &&
  (!mission || (creep.memory.builderMission || 'build') === mission));

const isLocalBuilder = creep => isBuilder(creep, 'local');
const isOutpostBuilder = creep => isBuilder(creep, 'outpost');
const isExpansionBuilder = creep => isBuilder(creep, 'expansion');

module.exports = {
  normalizeBuilderMemory,
  isBuilder,
  isLocalBuilder,
  isOutpostBuilder,
  isExpansionBuilder
};
