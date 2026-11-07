"use strict";
const assert=require('assert');const {planPickupJobs}=require('./pickup.jobs');
const stores=[{id:'A',store:{energy:250}},{id:'B',store:{energy:150}}];
const c=(name)=>({name,memory:{role:'hauler'},store:{getFreeCapacity:()=>100},
 pos:{getRangeTo:s=>s.id==='A'?1:3}});
const creeps=['1','2','3','4','5'].map(c);
const run=tick=>planPickupJobs({creeps,tick,getCandidates:()=>stores,
 getPreferredTarget:()=> 'A',maxCollectors:2});
let p=run(1);assert.strictEqual(p.counts.A,2);assert.strictEqual(p.counts.B,2);
assert.strictEqual(Object.keys(p.jobs).length,4);
assert.ok(Object.values(p.jobs).filter(j=>j.targetId==='B')
 .reduce((n,j)=>n+j.amount,0)<=150);
const held=p.jobs['1'].targetId;p=run(2);assert.strictEqual(p.jobs['1'].targetId,held);
stores[0].store.energy=0;p=run(3);assert.strictEqual(p.counts.A,undefined);
assert.ok(Object.keys(p.jobs).length<=2);
assert.ok(!creeps[4].memory.pickupReservation);
console.log('quantity-bounded pickup jobs and two-collector admission scenarios passed');

const builder=c('builder');builder.memory.role='builder';
const hauler=c('hauler');
const priorityPlan=planPickupJobs({creeps:[hauler,builder],tick:1,
 getCandidates:()=>[{id:'small',store:{energy:100}}],getPreferredTarget:()=>null,
 getJobPriority:c=>c.memory.role==='builder'?2:3,maxCollectors:2});
assert.ok(priorityPlan.jobs.builder);
assert.strictEqual(priorityPlan.jobs.hauler,undefined);
