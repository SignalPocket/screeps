'use strict';

const createCreepNaming = ({ Game, Memory, getRoomSources }) => {
  const roleCodes = {
    worker: 'WK', miner: 'LM', harvester: 'LM', hauler: 'LC',
    refiller: 'RF', rebalancer: 'RB', upgrader: 'UP', builder: 'BU',
    'remote-scout': 'OP', 'remote-hauler': 'OC', claimer: 'CL'
  };

  const nextOrdinal = () => Math.max(0,
    ...Object.values(Memory.roomOrdinals).filter(Number.isInteger)) + 1;

  const refreshRoomOrdinals = () => {
    if (!Memory.roomOrdinals) Memory.roomOrdinals = {};
    const candidates = new Map();
    for (const spawn of Object.values(Game.spawns)) {
      candidates.set(spawn.room.name, 0);
      const roomMemory = spawn.room.memory;
      for (const survey of [roomMemory.leftSurvey, roomMemory.southSurvey,
        roomMemory.southwestSurvey]) {
        if (!survey || !survey.targetRoom) continue;
        const established = Number.isInteger(survey.started)
          ? survey.started : Game.time;
        candidates.set(survey.targetRoom, Math.min(established,
          candidates.get(survey.targetRoom) || Infinity));
      }
    }
    let ordinal = nextOrdinal();
    for (const [roomName] of [...candidates.entries()].sort((a, b) =>
      a[1] - b[1] || a[0].localeCompare(b[0]))) {
      if (Number.isInteger(Memory.roomOrdinals[roomName])) continue;
      Memory.roomOrdinals[roomName] = ordinal++;
    }
  };

  const getRoomOrdinal = roomName => {
    if (!Memory.roomOrdinals) Memory.roomOrdinals = {};
    if (!Number.isInteger(Memory.roomOrdinals[roomName])) {
      Memory.roomOrdinals[roomName] = nextOrdinal();
    }
    return String(Memory.roomOrdinals[roomName]).padStart(2, '0');
  };

  const getBirthName = (spawn, assignment) => {
    if (assignment.role === 'controller-relay' &&
        Number.isInteger(assignment.controllerRelaySlot)) {
      return `BRIG${assignment.controllerRelaySlot + 1}`;
    }
    const targetRoom = assignment.remoteRoom || assignment.expansionTarget ||
      spawn.room.name;
    const parts = [getRoomOrdinal(targetRoom),
      assignment.role === 'builder'
        ? 'BU' : roleCodes[assignment.role] || 'WK'];
    if (assignment.role === 'refiller' && assignment.refillClusterId) {
      parts.push(assignment.refillClusterId === 'primary' ? 'P' : 'O');
    } else if (assignment.role === 'remote-scout' &&
        Number.isInteger(assignment.remoteSlot)) {
      parts.push(`S${assignment.remoteSlot + 1}`);
    } else if (assignment.role === 'remote-hauler' &&
        Number.isInteger(assignment.remoteHaulerSlot)) {
      parts.push(`S${assignment.remoteHaulerSlot + 1}`);
    } else if (assignment.role === 'builder' &&
        assignment.builderScope === 'outpost' &&
        Number.isInteger(assignment.remoteBuilderSlot)) {
      parts.push(`M${assignment.remoteBuilderSlot + 1}`);
    } else if ((assignment.role === 'harvester' ||
        assignment.role === 'miner') && assignment.preferredSource) {
      const sourceIndex = getRoomSources(spawn.room)
        .findIndex(source => source.id === assignment.preferredSource.id);
      if (sourceIndex >= 0) parts.push(`S${sourceIndex + 1}`);
    }
    const base = `${parts.join('-')}-${Game.time}`;
    let name = base;
    let duplicate = 2;
    while (Game.creeps[name] || Memory.creeps[name]) {
      name = `${base}-${duplicate++}`;
    }
    return name;
  };

  return { refreshRoomOrdinals, getRoomOrdinal, getBirthName };
};

module.exports = { createCreepNaming };
