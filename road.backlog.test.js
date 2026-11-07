'use strict';
const assert = require('assert');
const { getRoadBacklog } = require('./road.backlog');
const plan = { tiles: { '1:1': {x:1,y:1}, '2:2': {x:2,y:2},
  '3:3': {x:3,y:3} } };
const result = getRoadBacklog(plan, [{structureType:'road',pos:{x:1,y:1},
  hits:500,hitsMax:5000}], [{structureType:'road',pos:{x:2,y:2}}]);
assert.deepStrictEqual(result, {planned:3,built:1,missing:2,unqueued:1,
  critical:1,repairHits:3250,unqueuedBuildLowerBound:300});
assert.strictEqual(getRoadBacklog(null,[],[]).missing,0);
console.log('planned road backlog including unqueued work scenarios passed');

const { derivePopulationPolicy } = require('./colony.policy');
const funded = derivePopulationPolicy({rcl:5,sourceCount:2,spawnCount:1,
  energyCapacity:1800,energyRatio:0.3,storedEnergy:50000,
  construction:{remaining:45000,roadUnqueued:140}});
assert.ok(funded.roles.builder.min > 1 && funded.roles.builder.min <= 4,
  'funded unqueued road recovery scales a bounded crew despite optional growth gates');
const unfunded = derivePopulationPolicy({rcl:5,sourceCount:2,spawnCount:1,
  energyCapacity:1800,energyRatio:0.3,storedEnergy:0,
  construction:{remaining:45000,roadUnqueued:140}});
assert.ok(unfunded.roles.builder.min < 3,
  'road backlog cannot force a funded crew when reserves are absent');

const state = {rcl:5,sourceCount:2,spawnCount:1,energyCapacity:1800,
  energyRatio:0.3,storedEnergy:50000};
const small = derivePopulationPolicy({...state,
  construction:{remaining:300,roadUnqueued:1}});
const complete = derivePopulationPolicy({...state,construction:{remaining:0}});
assert.ok(small.roles.builder.min < funded.roles.builder.min);
assert.strictEqual(complete.roles.builder.min,0);
const lightRepair = derivePopulationPolicy({...state,repair:{remaining:1000}});
const crisisRepair = derivePopulationPolicy({...state,
  repair:{remaining:1000000,critical:true}});
assert.ok(crisisRepair.roles.repairBuilder.desired > lightRepair.roles.repairBuilder.desired);
assert.strictEqual(complete.roles.repairBuilder.desired,0);
const remoteRecovery = derivePopulationPolicy({...state,activeRemoteRooms:3,
  activeRemoteSources:6,remoteRoomsWithConstruction:3,
  remoteBuilderDemand:9,remoteInfrastructureDemand:9});
assert.strictEqual(remoteRecovery.remote.buildersMin,6);
