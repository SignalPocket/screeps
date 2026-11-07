"use strict";
const assert=require('assert');const {shouldProbeRemoteVision:probe}=require('./remote.hauling');
const c=name=>({name,store:{energy:0},memory:{role:'remote-hauler',
 home:'W7N4',remoteRoom:'W8N3'}});
const a=c('a'),b=c('b'),creeps=[b,a];
const opts={creeps,targetRoomName:'W8N3',readiness:{ready:false,reason:'room not visible'},RESOURCE_ENERGY:'energy'};
assert.strictEqual(probe({...opts,creep:a}),true);
assert.strictEqual(probe({...opts,creep:b}),false);
a.store.energy=50;assert.strictEqual(probe({...opts,creep:a}),false);
assert.strictEqual(probe({...opts,creep:b}),true);
assert.strictEqual(probe({...opts,creep:b,readiness:{ready:false,reason:'container unfinished'}}),false);
b.memory.remoteRosterSurplus=true;assert.strictEqual(probe({...opts,creep:b}),false);
console.log('single empty carrier remote-vision recovery scenarios passed');
