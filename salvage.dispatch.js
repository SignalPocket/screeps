'use strict';

const assignClosest = ({ items, collectors, assignedCollectors, assignments,
  memoryKey, eligible, shareItems = false, getAmount = () => Infinity }) => {
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
  const assignedAmounts = new Map();
  for (const pair of pairs) {
    const available = Math.max(0, getAmount(pair.item));
    const committed = assignedAmounts.get(pair.item.id) || 0;
    if ((!shareItems && assignedItems.has(pair.item.id)) ||
        committed >= available ||
        assignedCollectors.has(pair.collector.name)) continue;
    assignments[pair.collector.name] = pair.item.id;
    pair.collector.memory[memoryKey] = pair.item.id;
    assignedItems.add(pair.item.id);
    assignedCollectors.add(pair.collector.name);
    const capacity = pair.collector.store.getFreeCapacity();
    assignedAmounts.set(pair.item.id, committed + Math.max(0, capacity || 0));
  }
};

const getStoredAmount = target => target && target.store
  ? Object.keys(target.store).reduce((total, resourceType) =>
    total + Math.max(0, target.store[resourceType] || 0), 0)
  : 0;

// Gives each salvage object one closest eligible owner, with dropped energy
// taking precedence over ruins and tombstones. Source-local drops can be
// reserved for their harvester through canCollectDrop.
const planSalvageAssignments = ({ rooms, creeps, Game, RESOURCE_ENERGY,
  FIND_DROPPED_RESOURCES, FIND_RUINS, FIND_TOMBSTONES,
  canCollectDrop = () => true, postBattleRooms = new Set() }) => {
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
    const postBattle = postBattleRooms.has(room.name);
    const collectors = creeps.filter(creep =>
      creep.room.name === room.name && !creep.spawning &&
      creep.store.getFreeCapacity() > 0 && (!postBattle ||
        ['hauler', 'builder', 'worker', 'rebalancer', 'remote-hauler',
          'remote-miner'].includes(creep.memory.role)));
    const assignedCollectors = new Set();
    const drops = room.find(FIND_DROPPED_RESOURCES, {
      filter: resource => resource.resourceType === RESOURCE_ENERGY &&
        resource.amount > 0
    });
    let salvageScan = room.memory.salvageScan;
    if (!salvageScan || Game.time - (salvageScan.updated || 0) >= 5) {
      salvageScan = {
        updated: Game.time,
        ruinIds: room.find(FIND_RUINS, {
          filter: ruin => getStoredAmount(ruin) > 0
        }).map(ruin => ruin.id),
        tombstoneIds: room.find(FIND_TOMBSTONES, {
          filter: tombstone => getStoredAmount(tombstone) > 0
        }).map(tombstone => tombstone.id)
      };
      room.memory.salvageScan = salvageScan;
    }
    const ruins = (salvageScan.ruinIds || [])
      .map(id => Game.getObjectById(id))
      .filter(ruin => ruin && getStoredAmount(ruin) > 0);
    const tombstones = (salvageScan.tombstoneIds || [])
      .map(id => Game.getObjectById(id))
      .filter(tombstone => tombstone && getStoredAmount(tombstone) > 0);
    const assignDrops = () => assignClosest({
      items: drops, collectors, assignedCollectors,
      assignments: dropAssignments, memoryKey: 'dropTarget',
      eligible: (collector, drop) =>
        (postBattle || nearbyEligible(collector, drop)) &&
        canCollectDrop(collector, drop, room),
      shareItems: postBattle,
      getAmount: drop => drop.amount
    });
    const assignRuins = () => assignClosest({
      items: ruins, collectors, assignedCollectors,
      assignments: ruinAssignments, memoryKey: 'ruinTarget',
      eligible: (collector, ruin) => postBattle ||
        nearbyEligible(collector, ruin),
      shareItems: postBattle,
      getAmount: getStoredAmount
    });
    const assignTombstones = () => assignClosest({
      items: tombstones, collectors, assignedCollectors,
      assignments: tombstoneAssignments, memoryKey: 'tombstoneTarget',
      eligible: (collector, tombstone) => postBattle ||
        nearbyEligible(collector, tombstone),
      shareItems: postBattle,
      getAmount: getStoredAmount
    });
    if (postBattle) {
      // Corpses decay. Swarm them first and allocate enough total carry to
      // empty each store rather than assigning only one creep per tombstone.
      assignTombstones();
      assignRuins();
      assignDrops();
    } else {
      assignDrops();
      assignRuins();
      assignTombstones();
    }
  }
  return { dropAssignments, ruinAssignments, tombstoneAssignments };
};

module.exports = { getStoredAmount, planSalvageAssignments };
