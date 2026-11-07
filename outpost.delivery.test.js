"use strict";
const assert = require('assert');
const { updateDeliveryPolicy: update } = require('./outpost.delivery');
const survey = { started: 1, exportTrackingStarted: 1 };
const run = (tick, economy = {}, backlog = 4000, visible = true) =>
  update({ tick, survey, economy, backlog, visible });
assert.strictEqual(run(749).blocked, false);
assert.strictEqual(run(751, {}, 1999).blocked, false);
assert.strictEqual(run(751, {}, 4000, false).blocked, false);
assert.strictEqual(run(751).blocked, true);
assert.strictEqual(run(251, {}, 1500).degraded, true);
assert.strictEqual(run(251, {}, 1500).allowConstruction, false);
assert.strictEqual(run(1510, {lastExport:1509,exportBuckets:{1500:50}}).blocked,true);
assert.strictEqual(run(1600, {lastExport:1599}, 0, false).blocked,true);
assert.strictEqual(run(1801, {lastExport:1800,
  exportBuckets:{1600:50,1700:50,1800:50}}).blocked,false);
assert.strictEqual(survey.deliveryPolicy.protectRepairs,true);
console.log('outpost delivery policy scenarios passed');

const { derivePopulationPolicy } = require('./colony.policy');
const policy = derivePopulationPolicy({ rcl:5, controllerOwned:true,
  sourceCount:2, activeRemoteSources:6, activeRemoteRooms:3,
  remoteMinerDemand:12, deliveryEligibleMinerDemand:0 });
assert.strictEqual(policy.remote.minersMin, 0);
assert.strictEqual(policy.remote.miners, 0);
