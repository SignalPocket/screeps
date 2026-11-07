'use strict';
const assert = require('assert');
const fs = require('fs');
const { refillRetentionSituation, recoverSpawnFiller } = require('./park.recovery');
const { createRefillManagement } = require('./refill.management');
const { selectBaselineStaffingGap } = require('./staffing.baseline');
const room = { name: 'new-room', memory: {} };
const policy = Object.freeze({ targets: Object.freeze({ refiller: 0, builder: 2 }) });
const retained = refillRetentionSituation(policy);
assert.strictEqual(retained.targets.refiller, 1);
assert.strictEqual(policy.targets.refiller, 0);
assert.strictEqual(refillRetentionSituation({targets:{refiller:3}}).targets.refiller,3);
const creep = (name, extra = {}) => ({ name, room, ticksToLive: 700,
  memory: { home: room.name, role: 'hauler', birthRole: 'refiller',
    task: 'standby', waitState: 'parked', conservationX: 12, unrelated: 42 },
  store: { energy: 100, getCapacity: () => 100 },
  getActiveBodyparts: type => type === 'work' ? 0 : 2, ...extra });
const viable = c => c.ticksToLive > 100;
const manager = createRefillManagement({ Game: {time:1},
  getRoomSituation: () => refillRetentionSituation(policy), RESOURCE_ENERGY:'energy' });
const workers = Array.from({length:20}, (_,i) => creep(`carrier-${i}`));
for (let tick = 0; tick < 5; tick++) {
  manager.releaseUndersizedRefillers(room, workers);
  const selected = recoverSpawnFiller({room, workers, viable});
  assert.strictEqual(selected, tick === 0 ? 'carrier-0' : null);
  assert.strictEqual(workers.filter(c=>c.memory.role==='refiller').length,1);
  assert.strictEqual(selectBaselineStaffingGap({miner:1,upgrader:1,
    spawnFiller:workers.filter(c=>c.memory.role==='refiller').length,
    builderFixer:1}),null,'release/recovery must not reopen baseline spawn demand');
}
assert.strictEqual(workers[0].memory.birthRole,'refiller');
assert.strictEqual(workers[0].memory.unrelated,42);
assert.strictEqual(workers[0].memory.waitState,undefined);
assert.strictEqual(workers[0].memory.conservationX,undefined);
assert.strictEqual(workers[1].memory.task,'standby','legitimate reserves are preserved');
assert.strictEqual(recoverSpawnFiller({room,workers:[],viable}),null);
const exclusions = [creep('foreign',{room:{name:'other'}}),
  creep('old',{ticksToLive:50}),creep('spawning',{spawning:true}),
  creep('work',{getActiveBodyparts:()=>2}),
  creep('immobile',{getActiveBodyparts:t=>t==='carry'?2:0})];
for (const [name,field,value] of [['retire','staffingRetire',true],
  ['remote','remoteRoom','away'],['relay','controllerRelaySlot',0],
  ['substitute','controllerRelaySubstituteSlot',0],['contract','assignmentKind','remote-hauler']]) {
  const c=creep(name);c.memory[field]=value;exclusions.push(c);
}
assert.strictEqual(recoverSpawnFiller({room,workers:exclusions,viable}),null);
const loaded=creep('loaded'),empty=creep('empty',{store:{energy:0,getCapacity:()=>400}});
assert.strictEqual(recoverSpawnFiller({room,workers:[empty,loaded],viable}),'loaded');
const pending=creep('pending',{spawning:true});pending.memory.role='refiller';
assert.strictEqual(recoverSpawnFiller({room,workers:[pending,creep('reserve')],viable}),null);
const old=creep('old-owner',{ticksToLive:20});old.memory.role='refiller';
assert.strictEqual(recoverSpawnFiller({room,workers:[old,creep('replacement')],viable}),'replacement');
const otherRoom={name:'other',memory:{}};
const other=creep('other');other.room=otherRoom;other.memory.home='other';
assert.strictEqual(recoverSpawnFiller({room:otherRoom,workers:[...workers,other],viable}),'other');
// Verify production wiring uses the same retention and recovery authorities,
// before spawn selection, rather than only exercising an unused helper.
const main=fs.readFileSync(require.resolve('./main'),'utf8');
assert(main.includes('getRoomSituation: room => refillRetentionSituation(getRoomSituation(room))'));
const start=main.indexOf('releaseSurplusRebalancers(spawn.room, workers);');
const end=main.indexOf('const proposedAssignment = getSpawnAssignment',start);
const lane=main.slice(start,end);
assert(lane.indexOf('releaseUndersizedRefillers(')<lane.indexOf('recoverSpawnFiller('));
assert(lane.includes('viable: hasLocalReplacementLife'));
console.log('park recovery baseline churn, reuse, replacement and isolation passed');
