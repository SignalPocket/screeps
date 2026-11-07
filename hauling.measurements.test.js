'use strict';
const assert = require('assert');
const { auditHauling } = require('./hauling.measurements');
const sample = { updated: 990, sourceId: 'source', samples: 4,
  roundTripTicks: 100, loadRatio: 0.5, outboundTicks: 60, returnTicks: 40 };
const rooms = { HOME: { remoteHaulRoutes: { REMOTE: { planned: 995, slotSources: [0],
  lanes: [{ sourceId: 'source', actualRate: 2, requiredRate: 5, projectedRate: 6 }] } },
  haulTripStats: { REMOTE: { slots: { 0: sample } } } } };
const carrier = (home, capacity) => ({ memory: { role: 'remote-hauler', home,
  remoteRoom: 'REMOTE', remoteHaulerSlot: 0, haulTrip: { started: 980 } },
  body: Array.from({length: capacity / 50}, () => ({type: 'carry', hits:100})) });
const creeps = [carrier('HOME',100), carrier('HOME',200), carrier('OTHER',500)];
const before = JSON.stringify({rooms, creeps});
let report = auditHauling({tick:1000, rooms, creeps});
let slot = report.routes[0].slots[0];
assert.equal(slot.basis, 'fresh-inferred-cycle');
assert.equal(slot.assignedSlotCapacity,200, 'replacement overlap uses maximum, not sum');
assert.equal(slot.assignedCount,2, 'another home never contributes capacity');
assert.equal(slot.inferredCycle.loadRatio,0.5, 'partial loads remain visible');
assert.equal(report.deliveredEnergy,null, 'empty at home never proves recipient delivery');
assert.equal(report.measuredEnergyPerTick,null, 'current body cannot reconstruct historical cargo');
assert.equal(report.routes[0].lanes[0].modeledAssignedRate,2);
assert.equal(report.routes[0].incompleteTrips,2, 'incomplete cycles remain separate');
assert.equal(JSON.stringify({rooms,creeps}),before, 'query preserves source memory');
assert.deepStrictEqual(auditHauling({tick:1000,rooms,creeps}),report, 'repeat query is idempotent');
for (const [patch, basis] of [[{updated:-501},'stale'],[{updated:1001},'invalid-time'],
  [{samples:0},'invalid-sample'],[{roundTripTicks:NaN},'invalid-sample'],
  [{loadRatio:1.1},'invalid-sample'],[{sourceId:'elsewhere'},'source-mismatch'],
  [{sourceId:undefined},'source-unverified']]) {
  const altered = JSON.parse(JSON.stringify(rooms));
  Object.assign(altered.HOME.haulTripStats.REMOTE.slots[0],patch);
  const actual=auditHauling({tick:1000,rooms:altered,creeps}).routes[0].slots[0];
  assert.equal(actual.basis,basis);
  assert.equal(actual.inferredCycle,null,'untrusted evidence cannot become completed throughput');
}
assert.throws(()=>auditHauling({tick:NaN}),/Authoritative/);
assert.deepStrictEqual(auditHauling({tick:1000}).routes,[]);
report=auditHauling({tick:1000,creeps:[{...carrier('UNPLANNED',100),spawning:true,
  body:[{type:'carry',hits:100},{type:'carry',hits:0}]}]});
assert.equal(report.routes[0].home,'UNPLANNED','unplanned assignments remain visible');
assert.equal(report.routes[0].slots[0].basis,'missing');
assert.equal(report.routes[0].slots[0].assignedSlotCapacity,50,'destroyed carry parts excluded');
assert.equal(report.routes[0].slots[0].spawningCount,1,'spawn overlap remains explicit');
// Exercise the actual legacy observer: recipient transfer and cargo disposal
// have identical observed inventory endpoints. The audit must retain unknown.
const { observeHaulTrip } = require('./logistics.capacity');
const legacy = {};
const actor={memory:{role:'remote-hauler',home:'HOME',remoteRoom:'REMOTE',
  remoteHaulerSlot:0},room:{name:'HOME'},store:{energy:0,getCapacity:()=>200}};
observeHaulTrip({creep:actor,homeMemory:legacy,tick:1});
actor.room.name='REMOTE';actor.memory.remoteCargoOrigin='REMOTE';actor.store.energy=100;
observeHaulTrip({creep:actor,homeMemory:legacy,tick:50});
actor.room.name='HOME';actor.store.energy=0;
observeHaulTrip({creep:actor,homeMemory:legacy,tick:101});
assert.equal(legacy.haulTripStats.REMOTE.slots[0].samples,1);
report=auditHauling({tick:102,rooms:{HOME:legacy},creeps:[actor]});
assert.equal(report.deliveredEnergy,null,'actual observer lacks a recipient-confirmed ledger');
assert.equal(report.routes[0].slots[0].basis,'source-unverified');
const many={};
for(let i=0;i<20;i++) many['HOME'+i]={haulTripStats:{REMOTE:{slots:Object.fromEntries(
  Array.from({length:40},(_,i)=>[i,sample]))}}};
report=auditHauling({tick:1000,rooms:many});
assert.equal(report.routes.length,16);
assert.equal(report.omittedRoutes,4);
assert.equal(report.routes[0].slots.length,32);
assert.equal(report.routes[0].omittedSlots,8);
console.log('Hauling audit preserves evidence limits, source freshness, replacement capacity and bounded output');
