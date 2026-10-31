'use strict';

const {
  CONTROLLER_BRIGADE_ROLE
} = typeof Game === 'undefined'
  ? require('./controller.brigade.constants')
  : require('controller.brigade.constants');

const key = point => `${point.x},${point.y}`;

const createControllerBrigadeRuntime = dependencies => {
  const {
    Game, RoomPosition, RESOURCE_ENERGY, OK, ERR_NOT_IN_RANGE, moveCreep,
    getSlotOwner
  } = dependencies;

  const at = (creep, point) => creep.pos.x === point.x &&
    creep.pos.y === point.y && creep.pos.roomName === point.roomName;
  const position = (roomName, point) =>
    new RoomPosition(point.x, point.y, roomName);
  const moveToStop = (creep, target) =>
    moveCreep(creep, target, 0, {
      direct: true,
      preferRoads: true,
      // A newly spawned downstream relay may need to pass the already seated
      // single-lane crew. It may bypass them during initial positioning, then
      // returns to strict road-only movement for its permanent one-step leg.
      roadOnly: creep.memory.controllerRelaySeated === true
    });

  const getStats = (room, activeSize) => {
    if (!room.memory.controllerBrigadeStats ||
        room.memory.controllerBrigadeStats.version !== 1) {
      room.memory.controllerBrigadeStats = {
        version: 1,
        intakeTotal: 0,
        handoffTotal: 0,
        deliveredTotal: 0,
        constructionFeedTotal: 0,
        directFeedTotal: 0,
        backpressureTicks: 0
      };
    }
    const stats = room.memory.controllerBrigadeStats;
    for (const field of ['intakeTotal', 'handoffTotal', 'deliveredTotal',
      'constructionFeedTotal', 'directFeedTotal', 'backpressureTicks']) {
      if (!Number.isFinite(stats[field])) stats[field] = 0;
    }
    if (!Array.isArray(stats.stepsBySlot) ||
        stats.stepsBySlot.length !== activeSize) {
      stats.stepsBySlot = Array(activeSize).fill(0);
    }
    if (!stats.lastPositions || typeof stats.lastPositions !== 'object') {
      stats.lastPositions = {};
    }
    return stats;
  };

  const recordMovement = (creep, plan, slot, stats) => {
    const planKey = `${plan.version}:${plan.controllerBufferId}:` +
      `${(plan.boundaryIndexes || []).join(',')}`;
    if (stats.stepPlanKey !== planKey) {
      stats.stepPlanKey = planKey;
      stats.stepPlanVersion = plan.version;
      stats.stepStarted = Game.time;
      stats.stepsBySlot = Array(plan.segments.length).fill(0);
      stats.lastPositions = {};
    }
    const current = key(creep.pos);
    const previous = stats.lastPositions[slot];
    if (previous && previous !== current) stats.stepsBySlot[slot]++;
    stats.lastPositions[slot] = current;
    stats.updated = Game.time;
  };

  const getProvisionalBuilders = (creep, plan, finalDelivery) => {
    if (!plan.provisional) return [];
    return Object.values(Game.creeps).filter(candidate =>
      candidate.memory.home === creep.memory.home &&
      candidate.name !== creep.name && candidate.store &&
      candidate.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
      (candidate.memory.taskTarget === plan.controllerBufferId ||
        candidate.memory.builderTarget === plan.controllerBufferId ||
        candidate.memory.workJob &&
          candidate.memory.workJob.targetId === plan.controllerBufferId))
      .sort((a, b) =>
        b.store.getFreeCapacity(RESOURCE_ENERGY) -
          a.store.getFreeCapacity(RESOURCE_ENERGY) ||
        a.name.localeCompare(b.name))
      .map(builder => ({
        creep: builder,
        inRange: builder.pos.getRangeTo(finalDelivery) <= 1
      }));
  };

  const getPipelineEnergy = (home, plan, pipeline) => Object.values(Game.creeps)
    .filter(candidate => candidate.memory.home === home &&
      candidate.memory.role === CONTROLLER_BRIGADE_ROLE &&
      !candidate.memory.controllerRelayStandby &&
      plan.segments[candidate.memory.controllerRelaySlot] &&
      plan.segments[candidate.memory.controllerRelaySlot].pipeline ===
        pipeline)
    .reduce((total, candidate) => total +
      (candidate.store[RESOURCE_ENERGY] || 0), 0);

  const runPickup = ({ creep, plan, slot, segment, pickup, delivery, stats,
    provisionalBuilders }) => {
    if (!at(creep, pickup)) {
      moveToStop(creep, pickup);
      creep.memory.taskTarget = `BRIG${slot + 1} pickup ` +
        `${pickup.x},${pickup.y}`;
      return true;
    }
    if (!segment.intake) {
      creep.memory.taskTarget = `BRIG${segment.upstreamSlot + 1} ` +
        'handoff waiting';
      return true;
    }
    const storage = Game.getObjectById(plan.storageId);
    const pipeline = plan.pipelines.find(candidate =>
      candidate.index === segment.pipeline);
    const controllerBuffer = pipeline &&
      Game.getObjectById(pipeline.destinationId);
    const bufferFree = plan.provisional
      ? provisionalBuilders.reduce((total, builder) => total +
        builder.creep.store.getFreeCapacity(RESOURCE_ENERGY), 0)
      : controllerBuffer && controllerBuffer.store
        ? controllerBuffer.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
    const intakeDemand = Math.max(0,
      bufferFree - getPipelineEnergy(creep.memory.home, plan,
        segment.pipeline));
    if (intakeDemand <= 0) {
      stats.backpressureTicks++;
      creep.memory.taskTarget = 'brigade backpressure';
      return true;
    }
    if (!storage || storage.store[RESOURCE_ENERGY] <= 0) {
      creep.memory.taskTarget = 'brigade intake waiting';
      return true;
    }
    const amount = Math.min(
      creep.store.getFreeCapacity(RESOURCE_ENERGY),
      storage.store[RESOURCE_ENERGY], intakeDemand);
    const result = creep.withdraw(storage, RESOURCE_ENERGY, amount);
    if (result !== OK && result !== ERR_NOT_IN_RANGE) return false;
    if (result === OK) {
      stats.intakeTotal += amount;
      creep.memory.controllerRelayState = 'delivery';
      moveToStop(creep, delivery);
    }
    creep.memory.taskTarget = `${storage.id} brigade intake`;
    return true;
  };

  const findDownstream = (creep, segment, plan) =>
    Number.isInteger(segment.downstreamSlot)
      ? getSlotOwner(creep.memory.home, segment.downstreamSlot, plan) : null;

  const runDelivery = ({ creep, plan, slot, segment, delivery, energy,
    stats, provisionalBuilders }) => {
    if (!at(creep, delivery)) {
      moveToStop(creep, delivery);
      creep.memory.taskTarget = `BRIG${slot + 1} delivery ` +
        `${delivery.x},${delivery.y}`;
      return true;
    }
    const downstream = findDownstream(creep, segment, plan);
    if (downstream) {
      const downstreamPickup = position(plan.roomName,
        plan.segments[segment.downstreamSlot].pickup);
      if (!at(downstream, downstreamPickup)) {
        creep.memory.taskTarget =
          `BRIG${segment.downstreamSlot + 1} rendezvous waiting`;
        return true;
      }
    }
    const constructionReceiver = provisionalBuilders.find(builder =>
      builder.inRange);
    const target = segment.terminal
      ? plan.provisional ? constructionReceiver && constructionReceiver.creep
        : Game.getObjectById(segment.destinationId)
      : downstream;
    if (!target || !target.store ||
        target.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) {
      creep.memory.taskTarget = segment.terminal
        ? plan.provisional ? 'container builder waiting'
          : 'controller buffer full'
        : `BRIG${segment.downstreamSlot + 1} unavailable`;
      return true;
    }
    const amount = Math.min(energy,
      target.store.getFreeCapacity(RESOURCE_ENERGY));
    const result = creep.transfer(target, RESOURCE_ENERGY, amount);
    if (result === OK) {
      if (segment.terminal) {
        if (plan.provisional) stats.constructionFeedTotal += amount;
        else stats.deliveredTotal += amount;
      } else {
        stats.handoffTotal += amount;
        target.memory.controllerRelayIncoming = Game.time;
      }
      creep.memory.controllerRelayState = amount >= energy
        ? 'pickup' : 'delivery';
    }
    creep.memory.taskTarget = segment.terminal
      ? plan.provisional ? `${target.name} container construction feed`
        : `${segment.destinationId} RC power`
      : `BRIG${segment.downstreamSlot + 1} handoff`;
    return result === OK || result === ERR_NOT_IN_RANGE;
  };

  const runStationary = ({ creep, plan, slot, segment, station, energy,
    stats }) => {
    if (!at(creep, station)) {
      moveToStop(creep, station);
      creep.memory.taskTarget = `BRIG${slot + 1} seat ` +
        `${station.x},${station.y}`;
      return true;
    }
    const destinations = (segment.destinationIds || [])
      .map(id => Game.getObjectById(id))
      .filter(target => target && target.store &&
        target.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    const downstream = Number.isInteger(segment.downstreamSlot)
      ? getSlotOwner(creep.memory.home, segment.downstreamSlot, plan) : null;
    const downstreamSegment = Number.isInteger(segment.downstreamSlot)
      ? plan.segments[segment.downstreamSlot] : null;
    const downstreamReady = downstream && downstreamSegment &&
      at(downstream, position(plan.roomName, downstreamSegment.pickup)) &&
      downstream.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    if (energy <= 0) {
      if (!segment.intake) {
        creep.memory.taskTarget = `BRIG${segment.upstreamSlot + 1} ` +
          'stationary handoff';
        return true;
      }
      const storage = Game.getObjectById(plan.storageId);
      const destinationFree = (plan.controllerBufferIds || [])
        .map(id => Game.getObjectById(id))
        .filter(Boolean)
        .reduce((total, target) => total +
          target.store.getFreeCapacity(RESOURCE_ENERGY), 0);
      const demand = Math.max(0, destinationFree -
        getPipelineEnergy(creep.memory.home, plan, segment.pipeline));
      if (!storage || storage.store[RESOURCE_ENERGY] <= 0 || demand <= 0) {
        if (demand <= 0) stats.backpressureTicks++;
        creep.memory.taskTarget = demand <= 0
          ? 'stationary brigade backpressure'
          : 'stationary brigade intake waiting';
        return true;
      }
      const amount = Math.min(
        creep.store.getFreeCapacity(RESOURCE_ENERGY),
        storage.store[RESOURCE_ENERGY], demand);
      const result = creep.withdraw(storage, RESOURCE_ENERGY, amount);
      if (result === OK) stats.intakeTotal += amount;
      creep.memory.taskTarget = `${storage.id} stationary intake`;
      return result === OK || result === ERR_NOT_IN_RANGE;
    }
    const targets = [
      ...destinations.map(target => ({ target, destination: true })),
      ...(downstreamReady ? [{ target: downstream, destination: false }] : [])
    ];
    if (!targets.length) {
      creep.memory.taskTarget = segment.terminal
        ? 'controller buffers full' : 'stationary downstream waiting';
      return true;
    }
    const cursor = creep.memory.controllerRelayBranchCursor || 0;
    const choice = targets[cursor % targets.length];
    const amount = Math.min(energy,
      choice.target.store.getFreeCapacity(RESOURCE_ENERGY));
    const result = creep.transfer(choice.target, RESOURCE_ENERGY, amount);
    if (result === OK) {
      creep.memory.controllerRelayBranchCursor = cursor + 1;
      if (choice.destination) stats.deliveredTotal += amount;
      else {
        stats.handoffTotal += amount;
        choice.target.memory.controllerRelayIncoming = Game.time;
      }
    }
    creep.memory.taskTarget = choice.destination
      ? `${choice.target.id} stationary RC power`
      : `BRIG${segment.downstreamSlot + 1} stationary handoff`;
    return result === OK || result === ERR_NOT_IN_RANGE;
  };

  const run = (creep, plan) => {
    const slot = creep.memory.controllerRelaySlot;
    const segment = plan && plan.segments && plan.segments[slot];
    if (!segment || creep.room.name !== plan.roomName) return false;
    const energy = creep.store[RESOURCE_ENERGY] || 0;
    const pickup = position(plan.roomName, segment.pickup);
    const delivery = position(plan.roomName, segment.delivery);
    const seatingKey = `${plan.version}:${slot}:${segment.pickup.x}:` +
      `${segment.pickup.y}`;
    const onOwnStop = at(creep, pickup) || at(creep, delivery);
    if (creep.memory.controllerRelaySeatingKey !== seatingKey) {
      creep.memory.controllerRelaySeatingKey = seatingKey;
      creep.memory.controllerRelaySeated = onOwnStop;
      if (!onOwnStop) delete creep.memory._move;
    } else if (onOwnStop) {
      creep.memory.controllerRelaySeated = true;
    }
    if (plan.stationary) {
      const owner = getSlotOwner(creep.memory.home, slot, plan);
      if (owner && owner.name !== creep.name) {
        creep.memory.controllerRelayStandby = true;
        creep.memory.controllerRelaySeated = false;
        moveCreep(creep, pickup, 1, {
          direct: true, preferRoads: true, roadOnly: false
        });
        creep.memory.taskTarget = `BRIG${slot + 1} relief waiting`;
        return true;
      }
    }
    delete creep.memory.controllerRelayStandby;
    const stats = getStats(creep.room, plan.segments.length);
    recordMovement(creep, plan, slot, stats);
    if (plan.stationary) {
      return runStationary({
        creep, plan, slot, segment, station: pickup, energy, stats
      });
    }
    const terminalSegment = plan.segments.find(candidate =>
      candidate.pipeline === segment.pipeline && candidate.terminal);
    const finalDelivery = position(plan.roomName, terminalSegment.delivery);
    const provisionalBuilders = getProvisionalBuilders(creep, plan,
      finalDelivery);
    const incomingNow = creep.memory.controllerRelayIncoming === Game.time;
    if (energy <= 0 && !incomingNow) {
      creep.memory.controllerRelayState = 'pickup';
    } else if (creep.memory.controllerRelayState !== 'delivery') {
      creep.memory.controllerRelayState = 'delivery';
    }
    if (incomingNow && energy <= 0) {
      moveToStop(creep, delivery);
      creep.memory.taskTarget = `BRIG${slot + 1} incoming launch`;
      return true;
    }
    if (creep.memory.controllerRelayState === 'pickup') {
      return runPickup({
        creep, plan, slot, segment, pickup, delivery, stats,
        provisionalBuilders
      });
    }
    return runDelivery({
      creep, plan, slot, segment, delivery, energy, stats,
      provisionalBuilders
    });
  };

  return { run };
};

module.exports = { createControllerBrigadeRuntime };
