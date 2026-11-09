'use strict';

const { calculatePopulationTotals } =
  typeof Game === 'undefined'
    ? require('./population.totals')
    : require('population.totals');

// Katherine's bounded operational request. This is not the future default
// controller-supply design. Reservations remain after the upgrade push ends.
const HOME_ROOM = 'W7N4';
const RESERVATION_ROOMS = Object.freeze(['W8N4', 'W7N3', 'W8N3']);
const STOP_GCL = 2;
const RESERVER_COST = 1300;
const RESERVER_LIFETIME = 600;
const GCL_PUSH_UPGRADER_COUNT = 3;
const GCL_PUSH_TOTAL_WORK = 15;

const getOperationScope = (room, Game) => {
  const managed = Boolean(room && room.name === HOME_ROOM &&
    Game.gcl && Number.isFinite(Game.gcl.level));
  return { managed, pushRequested: managed && Game.gcl.level < STOP_GCL,
    completed: managed && Game.gcl.level >= STOP_GCL, stopGcl: STOP_GCL };
};

const applyOperationPolicy = (policy, room, Game) => {
  const scope = getOperationScope(room, Game);
  if (!scope.managed) return policy;
  // Survey visibility is transient; it must not silently dismantle the
  // established reservation roster when the last scout or reserver dies.
  const reservationRooms = RESERVATION_ROOMS.filter(name => {
    const controller = Game.rooms[name] && Game.rooms[name].controller;
    return !controller || !controller.owner && (!controller.reservation ||
      controller.reservation.username === room.controller.owner.username);
  });
  const reserveFloor = policy.budgets && policy.budgets.reserveFloor || 0;
  const storageEnergy = room.storage && room.storage.store.energy || 0;
  const seats = room.memory.controllerBrigadePlan &&
    room.memory.controllerBrigadePlan.segments || [];
  // The GCL-push situation owns a stable 15-WORK budget. Do not feed the
  // partially built roster back into this target: that made three missing or
  // traveling consumers reduce their own future body sizes every tick.
  const totalUpgradeWork = GCL_PUSH_TOTAL_WORK;
  const upgraderTarget = Math.min(
    GCL_PUSH_UPGRADER_COUNT, totalUpgradeWork);
  const workPerUpgrader = Math.ceil(totalUpgradeWork / upgraderTarget);
  const upgradeCost = workPerUpgrader * 100 + 100 +
    Math.ceil(workPerUpgrader / 4) * 50;
  const startupBudget = seats.length * 150 +
    upgraderTarget * upgradeCost +
    reservationRooms.length * RESERVER_COST;
  const safe = policy.health !== 'critical' && policy.health !== 'recovering' &&
    storageEnergy >= reserveFloor + startupBudget &&
    (!Game.cpu || !Number.isFinite(Game.cpu.bucket) || Game.cpu.bucket >= 3000);
  const upgradePush = scope.pushRequested && safe && seats.length > 0 &&
    room.controller.level >= 5 && room.energyCapacityAvailable >= upgradeCost;
  policy.permissions.controllerBrigade = upgradePush;
  const baseUpgraderRole = policy.roles.upgrader && {
    ...policy.roles.upgrader
  };
  if (upgradePush && baseUpgraderRole) {
    policy.roles.upgrader = {
      ...baseUpgraderRole,
      min: upgraderTarget,
      desired: upgraderTarget,
      max: upgraderTarget,
      reason: `${upgraderTarget}-member funded GCL push`
    };
  }
  // The link network still needs a carrier to move controller-container
  // surplus into the controller link. Keep the policy's balancing roster
  // during the push; only surplus balancers may be adopted into open relay
  // seats.
  if (scope.pushRequested && policy.roles.rebalancer) {
    policy.roles.rebalancer = {
      ...policy.roles.rebalancer,
      min: Math.max(1, policy.roles.rebalancer.min || 0),
      desired: Math.max(1, policy.roles.rebalancer.desired || 0),
      max: Math.max(1, policy.roles.rebalancer.max || 0),
      reason: 'dedicated controller-container to link feeder'
    };
  }
  const reservationEnabled = Boolean(policy.permissions.remoteMaintenance &&
    policy.health !== 'critical' && policy.health !== 'recovering' &&
    storageEnergy >= reserveFloor + reservationRooms.length * RESERVER_COST &&
    room.energyCapacityAvailable >= RESERVER_COST &&
    (!Game.cpu || !Number.isFinite(Game.cpu.bucket) || Game.cpu.bucket >= 1000));
  policy.remote.reserversMin = reservationEnabled ? reservationRooms.length : 0;
  policy.remote.reservers = policy.remote.reserversMin;
  policy.operations = { ...scope, upgradePush, reservationRooms,
    upgradeWork: workPerUpgrader, upgradeWorkTotal: totalUpgradeWork,
    upgraderTarget, upgradeBodyEnergy: upgradeCost, startupBudget,
    baseUpgraderRole,
    relayTarget: upgradePush ? seats.length : 0,
    reason: scope.completed ? 'GCL 2 reached' : upgradePush
      ? 'funded upgrade push until GCL 2' : 'push waits for reserves, CPU and capacity' };
  room.memory.controllerBrigadeOperation = {
    updated: Game.time, active: upgradePush, ...policy.operations
  };
  return policy;
};

const isBrigadePlanActive = room => !room.memory.controllerBrigadeOperation ||
  room.memory.controllerBrigadeOperation.active === true;

const finalizeOperationPolicy = (policy, room, Game) => {
  if (!policy.operations || !policy.operations.managed) return;
  const hardStopScenarios = new Set([
    'active-attack', 'cpu-emergency', 'spawn-capacity-overload',
    'post-attack-recovery', 'tower-reserve-deficit'
  ]);
  const hardStop = policy.health === 'critical' ||
    (policy.scenarioDecision && policy.scenarioDecision.active || [])
      .some(key => hardStopScenarios.has(key));
  // A transient assignment or traffic scenario may pause brigade growth and
  // replacement through the permission flag, but it must not dismantle an
  // established, funded upgrade operation or silently change its upgrader
  // count. Hard survival scenarios still stop the push and restore the base
  // role policy.
  policy.operations.upgradePush = Boolean(
    policy.operations.upgradePush && !hardStop);
  if (!policy.operations.upgradePush && policy.operations.baseUpgraderRole) {
    policy.roles.upgrader = policy.operations.baseUpgraderRole;
  }
  delete policy.operations.baseUpgraderRole;
  if (policy.health === 'critical') {
    policy.remote.reserversMin = 0;
    policy.remote.reservers = 0;
  }
  // Scenario and spawn-capacity stages calculate totals before this final
  // operation boundary. Restoring a protected role or suspending reservers
  // must refresh that derived field from the final published policy state.
  policy.totals = calculatePopulationTotals(policy);
  room.memory.controllerBrigadeOperation = { updated: Game.time,
    ...policy.operations, active: policy.operations.upgradePush };
};

const adoptBalancers = (room, Game, policy) => {
  if (!policy.operations || !policy.operations.upgradePush) return [];
  const plan = room.memory.controllerBrigadePlan;
  if (!plan || !Array.isArray(plan.segments)) return [];
  const workers = Object.values(Game.creeps).filter(c => c.memory.home === room.name);
  const occupied = new Set(workers.filter(c => c.memory.role === 'controller-relay' &&
    !c.memory.staffingRetire).map(c => c.memory.controllerRelaySlot));
  const adopted = [];
  const protectedBalancers = Math.max(1,
    policy.roles && policy.roles.rebalancer &&
      policy.roles.rebalancer.desired || 0);
  const candidates = workers.filter(c => c.memory.role === 'rebalancer' &&
      !c.spawning && !c.memory.staffingRetire && c.getActiveBodyparts('carry') > 0 &&
      c.getActiveBodyparts('move') > 0).sort((a,b) =>
      a.name.localeCompare(b.name)).slice(protectedBalancers);
  for (const creep of candidates) {
    const slot = plan.segments.findIndex((s, index) => !occupied.has(index));
    if (slot < 0) break;
    const previousRole = creep.memory.role;
    for (const key of ['rebalancerSource','rebalanceTarget','rebalancePickupTarget',
      'rebalanceTargetReviewed','rebalancerSurplusSince','controllerLinkFeedTarget',
      'controllerLinkHandoffTarget','workJob','dispatchCommitment','demandLane',
      'sourceReserve','sourceReplacement','preferredSource','harvestSource',
      'minerSource','controllerRelaySubstituteSlot','controllerRelaySubstituteSince',
      'controllerRelaySubstituteReason','controllerRelaySeatingKey','controllerRelaySeated',
      'controllerRelayState','task','taskTarget','_move','navGoal']) delete creep.memory[key];
    Object.assign(creep.memory, { role: 'controller-relay', birthRole: 'controller-relay',
      controllerRelaySlot: slot, assignmentRole: 'controller-relay',
      reassignment: { tick: Game.time, from: previousRole, to: 'controller-relay',
        slot, reason: 'Katherine requested all balancers join the brigade' } });
    occupied.add(slot);
    adopted.push({ creep: creep.name, slot });
  }
  if (adopted.length) room.memory.brigadeBalancerAdoption = { tick: Game.time, adopted };
  return adopted;
};

const adoptSurplusHaulerForLink = (room, Game, policy) => {
  const plan = room.memory.controllerBrigadePlan;
  if (!plan || !Array.isArray(plan.segments) ||
      !Number.isInteger(plan.linkSlot) || !plan.segments[plan.linkSlot]) {
    return [];
  }
  const workers = Object.values(Game.creeps).filter(creep =>
    creep.memory.home === room.name);
  const existing = workers.find(creep =>
    creep.memory.role === 'controller-relay' &&
      creep.memory.controllerRelaySlot === plan.linkSlot &&
      !creep.memory.staffingRetire);
  if (existing) {
    delete existing.memory.defenseTargetRoom;
    delete existing.memory.defenseReturnHome;
    return [];
  }
  const protectedHaulers = Math.max(1,
    policy.roles && policy.roles.hauler &&
      policy.roles.hauler.desired || 0);
  const haulers = workers.filter(creep => creep.memory.role === 'hauler' &&
      !creep.spawning && !creep.memory.staffingRetire &&
      creep.getActiveBodyparts('carry') >= 2 &&
      creep.getActiveBodyparts('move') > 0)
    .sort((a, b) =>
      b.getActiveBodyparts('carry') - a.getActiveBodyparts('carry') ||
      (b.ticksToLive || 0) - (a.ticksToLive || 0) ||
      a.name.localeCompare(b.name));
  if (haulers.length <= protectedHaulers) return [];
  const creep = haulers[protectedHaulers];
  for (const key of ['workJob', 'dispatchCommitment', 'demandLane',
    'refillTarget', 'refillPickupTarget', 'withdrawTarget',
    'pickupReservation', 'defenseTargetRoom', 'defenseReturnHome',
    'controllerRelaySubstituteSlot',
    'controllerRelaySubstituteSince', 'controllerRelaySubstituteReason',
    'controllerRelaySeatingKey', 'controllerRelaySeated',
    'controllerRelayState', 'task', 'taskTarget', 'waitState', 'waitReason',
    '_move', 'navGoal']) delete creep.memory[key];
  Object.assign(creep.memory, {
    role: 'controller-relay',
    birthRole: 'controller-relay',
    assignmentRole: 'controller-relay',
    controllerRelaySlot: plan.linkSlot,
    reassignment: {
      tick: Game.time,
      from: 'hauler',
      to: 'controller-relay',
      slot: plan.linkSlot,
      reason: 'surplus home hauler assigned to dedicated controller link seat'
    }
  });
  const adopted = [{ creep: creep.name, slot: plan.linkSlot }];
  room.memory.brigadeLinkAdoption = { tick: Game.time, adopted };
  return adopted;
};

const adoptDefenders = (room, Game, plan, warActive,
  isEligible = () => true) => {
  if (warActive || !plan || !Array.isArray(plan.segments)) return [];
  const workers = Object.values(Game.creeps).filter(creep =>
    creep.memory.home === room.name);
  const occupied = new Set(workers.filter(creep =>
    creep.memory.role === 'controller-relay' &&
    Number.isInteger(creep.memory.controllerRelaySlot))
    .map(creep => creep.memory.controllerRelaySlot));
  const adopted = [];
  const candidates = workers.filter(creep =>
    creep.memory.role === 'defender' && !creep.spawning &&
    !creep.memory.staffingRetire &&
    creep.getActiveBodyparts('carry') > 0 &&
    creep.getActiveBodyparts('move') > 0 && isEligible(creep))
    .sort((a, b) =>
      b.getActiveBodyparts('carry') - a.getActiveBodyparts('carry') ||
      b.getActiveBodyparts('move') - a.getActiveBodyparts('move') ||
      (b.ticksToLive || 0) - (a.ticksToLive || 0) ||
      a.name.localeCompare(b.name));
  for (const creep of candidates) {
    const slot = plan.segments.findIndex((segment, index) =>
      segment && !occupied.has(index));
    if (slot < 0) break;
    for (const key of ['defenseTargetRoom', 'defenseReturnHome',
      'retiredRole', 'task', 'taskTarget', 'waitState', 'waitReason',
      'idleNow', '_move', 'navGoal', 'controllerRelayState',
      'controllerRelaySeatingKey', 'controllerRelaySeated']) {
      delete creep.memory[key];
    }
    Object.assign(creep.memory, {
      role: 'controller-relay',
      birthRole: 'controller-relay',
      assignmentRole: 'controller-relay',
      controllerRelaySlot: slot,
      reassignment: {
        tick: Game.time,
        from: 'defender',
        to: 'controller-relay',
        slot,
        reason: 'post-war defender reassigned to brigade'
      }
    });
    occupied.add(slot);
    adopted.push({ creep: creep.name, slot });
  }
  if (adopted.length) {
    room.memory.brigadeDefenderAdoption = {
      tick: Game.time, adopted
    };
  }
  return adopted;
};

// Restore one reassigned combat body for each attacked outpost immediately.
const reactivateDefenders = (Game, threatenedRooms) => {
  const rooms = new Set(threatenedRooms || []);
  const covered = new Set(Object.values(Game.creeps).filter(creep =>
    creep.memory.role === 'defender' && !creep.spawning).map(creep =>
    creep.memory.defenseTargetRoom || creep.room.name));
  const candidates = Object.values(Game.creeps).filter(creep => {
    const targetRoom = creep.memory.defenseTargetRoom;
    return targetRoom && rooms.has(targetRoom) && !covered.has(targetRoom) &&
      !creep.spawning && !creep.memory.staffingRetire &&
      creep.memory.bodyType === 'defender' &&
      creep.memory.role !== 'defender';
  }).sort((a, b) =>
    Number(b.room.name === b.memory.defenseTargetRoom) -
      Number(a.room.name === a.memory.defenseTargetRoom) ||
    (b.ticksToLive || 0) - (a.ticksToLive || 0) ||
    a.name.localeCompare(b.name));
  const reactivated = [];
  for (const creep of candidates) {
    const targetRoom = creep.memory.defenseTargetRoom;
    if (covered.has(targetRoom)) continue;
    const from = creep.memory.role;
    for (const key of ['controllerRelaySlot', 'controllerRelayState',
      'controllerRelaySeatingKey', 'controllerRelaySeated', 'reassignment',
      'waitState', 'waitReason', 'idleNow', '_move', 'navGoal']) {
      delete creep.memory[key];
    }
    Object.assign(creep.memory, {
      role: 'defender', birthRole: 'defender', assignmentRole: 'defender',
      task: 'defend', taskTarget: targetRoom,
      defenseReactivation: { tick: Game.time, from, targetRoom }
    });
    covered.add(targetRoom);
    reactivated.push({ creep: creep.name, targetRoom, from });
  }
  return reactivated;
};

const retireCompletedPush = (Game) => {
  for (const room of Object.values(Game.rooms)) {
    if (!getOperationScope(room, Game).completed) continue;
    room.memory.controllerBrigadeOperation = { updated: Game.time,
      managed: true, completed: true, active: false, stopGcl: STOP_GCL };
    for (const creep of Object.values(Game.creeps)) {
      if (creep.memory.home !== room.name ||
          creep.memory.role !== 'controller-relay') continue;
      creep.memory.retiredRole = 'controller-relay';
      creep.memory.role = 'retire';
      creep.memory.staffingRetire = true;
      delete creep.memory.controllerRelaySlot;
      delete creep.memory.workJob;
      delete creep.memory.dispatchCommitment;
      creep.memory.reassignment = { tick: Game.time, reason: 'GCL 2 push completed' };
    }
  }
};

module.exports = { HOME_ROOM, RESERVATION_ROOMS, STOP_GCL, RESERVER_COST,
  RESERVER_LIFETIME, getOperationScope, applyOperationPolicy,
  isBrigadePlanActive, retireCompletedPush, finalizeOperationPolicy,
  adoptBalancers, adoptDefenders, reactivateDefenders,
  adoptSurplusHaulerForLink };
