'use strict';

const assert = require('assert');
const { BODY_TYPES, getBodyTypeForAssignment, deriveBodyTargets,
  buildBodyRoster, canBodyTypeRunLane } = require('./body.archetypes');

const WORK = 'work';
const CARRY = 'carry';
const CLAIM = 'claim';
const constants = { WORK, CARRY, CLAIM };
const creep = (bodyType, ttl = 1000) => ({
  memory: { bodyType },
  ticksToLive: ttl,
  getActiveBodyparts: () => 1
});

assert.strictEqual(getBodyTypeForAssignment({ role: 'remote-hauler' }),
  BODY_TYPES.HAULER);
assert.strictEqual(getBodyTypeForAssignment({ role: 'controller-relay' }),
  BODY_TYPES.HAULER);
assert.strictEqual(getBodyTypeForAssignment({ bodyType: 'carrier' }),
  BODY_TYPES.HAULER);
assert.strictEqual(getBodyTypeForAssignment({ role: 'builder' }),
  BODY_TYPES.WORKER);
assert.strictEqual(getBodyTypeForAssignment({ role: 'remote-scout' }),
  BODY_TYPES.FIELD);

const targets = deriveBodyTargets({
  localMinerMin: 2, localMinerDesired: 2,
  refillerMin: 1, refillerDesired: 2,
  remoteCarrierMin: 1, remoteCarrierDesired: 3,
  haulerMin: 1, haulerDesired: 2,
  rebalancerMin: 0, rebalancerDesired: 1,
  upgraderMin: 1, upgraderDesired: 2,
  builderMin: 1, builderDesired: 2,
  repairMin: 1, repairDesired: 1,
  remoteMinerMin: 4, remoteMinerDesired: 4
});
assert.deepStrictEqual(targets.hauler, { min: 3, desired: 8, max: 8 });
assert.strictEqual(targets.carrier, undefined);
assert.deepStrictEqual(targets.worker, { min: 2, desired: 3, max: 3 });

const roster = buildBodyRoster([
  creep(BODY_TYPES.MINER), creep(BODY_TYPES.MINER),
  creep('carrier'), creep(BODY_TYPES.WORKER)
], targets, constants, candidate => candidate.ticksToLive > 100);
assert.strictEqual(roster.viable.miner, 2);
assert.strictEqual(roster.viable.hauler, 1);
assert.strictEqual(roster.viable.carrier, undefined);
assert.strictEqual(roster.shortages[0].type, BODY_TYPES.FIELD);

assert.strictEqual(canBodyTypeRunLane(BODY_TYPES.WORKER, 'repair'), true);
assert.strictEqual(canBodyTypeRunLane(BODY_TYPES.CONTROLLER, 'repair'), false);
assert.strictEqual(canBodyTypeRunLane(BODY_TYPES.CONTROLLER, 'upgrade'), true);
assert.strictEqual(canBodyTypeRunLane(BODY_TYPES.HAULER, 'refill'), true);
assert.strictEqual(canBodyTypeRunLane('carrier', 'refill'), true);
assert.strictEqual(canBodyTypeRunLane(BODY_TYPES.MINER, 'refill'), false);

console.log('body archetype scenarios passed');
