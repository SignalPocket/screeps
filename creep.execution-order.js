'use strict';

// Screeps creep and Memory properties cross an isolate boundary. Snapshot the
// few values used by both execution sorts once per creep; comparator calls
// then operate on plain local values instead of multiplying proxy reads.
const snapshotExecutionOrder = (creeps, getTaskPriority, gameTime) =>
  creeps.map((creep, index) => {
    const memory = creep.memory || {};
    const commitment = memory.dispatchCommitment;
    return {
      creep,
      index,
      name: creep.name,
      priority: getTaskPriority(creep, memory),
      emergency: Boolean(memory.emergencyRepairRoom),
      outpostBuilder: memory.role === 'builder' &&
        memory.builderScope === 'outpost',
      committed: Boolean(commitment),
      commitmentSince: commitment && commitment.since || gameTime,
      loaded: creep.store.getUsedCapacity() > 0
    };
  });

const sortTaskRecords = records => records.slice().sort((a, b) =>
  a.priority - b.priority || a.index - b.index);

const sortExecutionRecords = records => records.slice().sort((a, b) =>
  Number(b.emergency || b.outpostBuilder) -
    Number(a.emergency || a.outpostBuilder) ||
  Number(b.committed) - Number(a.committed) ||
  a.commitmentSince - b.commitmentSince ||
  Number(b.loaded) - Number(a.loaded) ||
  a.priority - b.priority || a.name.localeCompare(b.name));

module.exports = {
  snapshotExecutionOrder,
  sortTaskRecords,
  sortExecutionRecords
};
