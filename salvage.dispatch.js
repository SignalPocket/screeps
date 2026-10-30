'use strict';

const assignClosest = ({ items, collectors, assignedCollectors, assignments,
  memoryKey, eligible }) => {
  const pairs = [];
  for (const item of items) {
    for (const collector of collectors) {
      if (assignedCollectors.has(collector.name) ||
          !eligible(collector, item)) continue;
      pairs.push({ item, collector, distance: collector.pos.getRangeTo(item) });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance ||
    a.collector.name.localeCompare(b.collector.name) ||
    a.item.id.localeCompare(b.item.id));
  const assignedItems = new Set();
  for (const pair of pairs) {
    if (assignedItems.has(pair.item.id) ||
        assignedCollectors.has(pair.collector.name)) continue;
    assignments[pair.collector.name] = pair.item.id;
    pair.collector.memory[memoryKey] = pair.item.id;
    assignedItems.add(pair.item.id);
    assignedCollectors.add(pair.collector.name);
  }
};

// Gives each salvage object one closest eligible owner, with dropped energy
// taking precedence over ruins and tombstones. Source-local drops can be
// reserved for their harvester through canCollectDrop.
const planSalvageAssignments = ({ rooms, creeps, Game, RESOURCE_ENERGY,
  FIND_DROPPED_RESOURCES, FIND_RUINS, FIND_TOMBSTONES,
  canCollectDrop = () => true }) => {
  const dropAssignments = {};
  const ruinAssignments = {};
  const tombstoneAssignments = {};
  for (const creep of creeps) {
    delete creep.memory.dropTarget;
    delete creep.memory.ruinTarget;
    delete creep.memory.tombstoneTarget;
  }
  const nearbyEligible = (collector, target) => {
    const distance = collector.pos.getRangeTo(target);
    const nearbyRange = collector.memory.role === 'upgrader' ? 1 : 3;
    return collector.memory.role === 'hauler' || distance <= nearbyRange;
  };
  for (const room of rooms) {
    const collectors = creeps.filter(creep =>
      creep.room.name === room.name && !creep.spawning &&
      creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    const assignedCollectors = new Set();
    const drops = room.find(FIND_DROPPED_RESOURCES, {
      filter: resource => resource.resourceType === RESOURCE_ENERGY &&
        resource.amount > 0
    });
    assignClosest({
      items: drops, collectors, assignedCollectors,
      assignments: dropAssignments, memoryKey: 'dropTarget',
      eligible: (collector, drop) => nearbyEligible(collector, drop) &&
        canCollectDrop(collector, drop, room)
    });

    let salvageScan = room.memory.salvageScan;
    if (!salvageScan || Game.time - (salvageScan.updated || 0) >= 5) {
      salvageScan = {
        updated: Game.time,
        ruinIds: room.find(FIND_RUINS, {
          filter: ruin => ruin.store[RESOURCE_ENERGY] > 0
        }).map(ruin => ruin.id),
        tombstoneIds: room.find(FIND_TOMBSTONES, {
          filter: tombstone => tombstone.store[RESOURCE_ENERGY] > 0
        }).map(tombstone => tombstone.id)
      };
      room.memory.salvageScan = salvageScan;
    }
    const ruins = (salvageScan.ruinIds || [])
      .map(id => Game.getObjectById(id))
      .filter(ruin => ruin && ruin.store[RESOURCE_ENERGY] > 0);
    assignClosest({
      items: ruins, collectors, assignedCollectors,
      assignments: ruinAssignments, memoryKey: 'ruinTarget',
      eligible: nearbyEligible
    });
    const tombstones = (salvageScan.tombstoneIds || [])
      .map(id => Game.getObjectById(id))
      .filter(tombstone => tombstone &&
        tombstone.store[RESOURCE_ENERGY] > 0);
    assignClosest({
      items: tombstones, collectors, assignedCollectors,
      assignments: tombstoneAssignments, memoryKey: 'tombstoneTarget',
      eligible: nearbyEligible
    });
  }
  return { dropAssignments, ruinAssignments, tombstoneAssignments };
};

module.exports = { planSalvageAssignments };
