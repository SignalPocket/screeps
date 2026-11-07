'use strict';

const shortRoles = {
  miner: 'LM',
  harvester: 'LM',
  hauler: 'LC',
  refiller: 'RF',
  rebalancer: 'RB',
  builder: 'BU',
  upgrader: 'UP',
  'remote-miner': 'OM',
  'remote-hauler': 'OC',
  'remote-reserver': 'OR',
  'controller-relay': 'PR',
  claimer: 'CL',
  worker: 'W',
  retire: 'RET'
};

const shortTasks = {
  'mine-to-container': 'Mine',
  'source-work': 'Src',
  harvest: 'Mine',
  'emergency-refill': 'Fill!',
  'urgent-upgrade': 'RC!',
  upgrade: 'RC',
  scavenge: 'Pick',
  refill: 'Fill',
  'refill-load': 'Load',
  rebalance: 'Bal',
  build: 'Build',
  'dig-road': 'Dig',
  repair: 'Fix',
  'emergency-repair': 'Fix!',
  'supply-worker': 'Give',
  'await-supply': 'WaitE',
  'remote-miner': 'Mine',
  'remote-harvest': 'Src',
  'remote-container': 'Cont',
  'remote-haul': 'RHaul',
  'remote-road': 'RBuild',
  'controller-relay': 'Power',
  claim: 'Claim',
  reserve: 'Reserve',
  'expansion-build': 'Expand',
  'stage-supply': 'Stage',
  'stock-refill': 'StockSp',
  'stock-refill-pass': 'StockSp+',
  'collect-pass': 'Get+',
  'stage-refill': 'StageSp',
  'committed-collect': 'Get',
  'committed-refill': 'Fill',
  'committed-refill-buffer': 'StockSp',
  'committed-buffer': 'StockRC',
  'committed-storage': 'Store',
  'committed-supply': 'Give',
  standby: 'Blocked',
  'wait-job': 'Blocked',
  withdraw: 'Get',
  store: 'Store',
  'store-storage': 'Store',
  recycle: 'Recycle'
};

const getWaitSpeech = memory => memory.waitState === 'parked' ? 'Park' : 'Blocked';

const shortCreepName = name => name
  .replace(/^worker-/, '')
  .replace(/^Spawn/, 'S');

const createCreepReporting = ({ Game, getRoomSources,
  STRUCTURE_CONTAINER }) => {
  const getObjectLabel = target => {
    if (!target) return null;
    if (target.name) return target.name;
    const room = target.room;
    if (room && target === room.controller) return 'Room Controller';
    if (room && target.energyCapacity !== undefined &&
        target.ticksToRegeneration !== undefined) {
      const sourceIndex = getRoomSources(room)
        .findIndex(source => source.id === target.id);
      return sourceIndex >= 0 ? `Source ${sourceIndex + 1}` : 'Source';
    }
    if (target.resourceType && target.amount !== undefined) {
      return `dropped ${target.resourceType} (${target.pos.x},${target.pos.y})`;
    }
    if (target.structureType) {
      if (target.structureType === STRUCTURE_CONTAINER && room) {
        if (room.controller && target.pos.getRangeTo(room.controller) <= 3) {
          return 'Controller container';
        }
        const sourceIndex = getRoomSources(room)
          .findIndex(source => source.pos.getRangeTo(target) <= 5);
        if (sourceIndex >= 0) return `Source ${sourceIndex + 1} container`;
      }
      const siteSuffix = target.progressTotal !== undefined ? ' site' : '';
      return `${target.structureType}${siteSuffix} (${target.pos.x},${target.pos.y})`;
    }
    return target.id || null;
  };

  const formatTaskTarget = targetReference => {
    if (!targetReference || typeof targetReference !== 'string') {
      return targetReference || '-';
    }
    const id = targetReference.split(/[\s@()]/)[0];
    const target = Game.getObjectById(id);
    const label = getObjectLabel(target);
    return label ? targetReference.replace(id, label) : targetReference;
  };

  const logDeadCreeps = memoryCreeps => {
    for (const name in memoryCreeps) {
      if (Game.creeps[name]) continue;
      const memory = memoryCreeps[name] || {};
      const role = shortRoles[memory.role] || memory.role || 'W';
      const task = shortTasks[memory.lastTask || memory.task] ||
        memory.lastTask || memory.task || 'Idle';
      const roomName = memory.lastRoom || memory.home || '?';
      const reason = memory.retired
        ? 'RETIRED'
        : memory.lastTtl <= 1 ? 'EXPIRED' : 'DIED';
      console.log(`[${Game.time}] ${reason} ${shortCreepName(name)} ` +
        `${role}/${task} in ${roomName}`);
      delete memoryCreeps[name];
    }
  };

  return { getObjectLabel, formatTaskTarget, logDeadCreeps };
};

module.exports = {
  createCreepReporting,
  getWaitSpeech,
  shortCreepName,
  shortRoles,
  shortTasks
};
