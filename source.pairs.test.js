'use strict';
const assert=require('assert');
const {harvestBatch,harvestBatchFits,harvestSafely}=require('./source.harvest');
const {planSourceRecovery}=require('./source.recovery');
const {planSourceAssignments}=require('./source.assignment');
const {createBodyFactory}=require('./body.factory');
for(const work of [3,6,10]){
 let energy=0,dropped=0,unloads=0;
 const source={energy:3000};
 const creep={body:Array(work).fill('work'),store:{getFreeCapacity:()=>50-energy},
  harvest:()=>{const amount=work*2;dropped+=Math.max(0,energy+amount-50);energy=Math.min(50,energy+amount);return 0;}};
 for(let t=0;t<100;t++){
  if(!harvestBatchFits(creep,source)){energy=0;unloads++;}
  else assert.strictEqual(harvestSafely({creep,source}),0);
 }
 assert.strictEqual(dropped,0);assert(unloads>0);
 energy=48;
 assert.strictEqual(harvestSafely({creep,source}),-8);
 assert.strictEqual(energy,48,'unsafe harvest never issues an intent');
}
const boosted={body:[{type:'work',hits:100,boost:'X'}],store:{getFreeCapacity:()=>3}};
assert.strictEqual(harvestBatch(boosted,{energy:100},{boosts:{work:{X:{harvest:4}}}}),8);
assert(!harvestBatchFits(boosted,{energy:100},{boosts:{work:{X:{harvest:4}}}}));
assert(harvestBatchFits(boosted,{energy:2},{boosts:{work:{X:{harvest:4}}}}));
const primary={name:'primary',memory:{role:'harvester',preferredSource:'s1'},work:11};
const second={name:'second',memory:{role:'harvester',sourceReserve:'s1'},work:3};
const recovery=planSourceRecovery({sources:[{id:'s1'}],workers:[primary,second],surplus:[],
 requiredWork:()=>5,minWorkers:()=>2,maxWorkers:()=>2,getWork:c=>c.work,isViable:()=>true});
assert.deepStrictEqual(recovery.plans[0].retained,[second],
 'the second miner is retained even when the first already supplies enough WORK');
const assignments=planSourceAssignments({needs:[{sourceId:'s1',remaining:1,minimumRemaining:1,workDeficit:0}],
 candidates:[{name:'second',sourceReserve:'s1'}],getWork:()=>3});
assert.strictEqual(assignments.assignments[0].sourceId,'s1');
const c={WORK:'work',CARRY:'carry',MOVE:'move',BODYPART_COST:{work:100,carry:50,move:50}};
const factory=createBodyFactory(c);
assert.strictEqual(factory.buildBody('miner',1750,{workLimit:3}).filter(p=>p==='work').length,3);
assert.strictEqual(factory.buildBody('miner',450,{workLimit:3}).filter(p=>p==='work').length,3);
console.log('paired source retention, shared WORK sizing and zero-spill mining across full carry cycles passed');
// Source owners are the deliberate exception to the 700-energy roster cap.
// One 800-energy miner sustains regeneration through unloading ticks and
// avoids consuming another permanent source slot.
const productive=factory.buildBody('miner',1750,{miningProduction:10});
assert.strictEqual(productive.filter(p=>p==='work').length,6);
assert.strictEqual(productive.filter(p=>p==='carry').length,2);
const work=productive.filter(p=>p==='work').length;
const capacity=productive.filter(p=>p==='carry').length*50;
const fullHarvests=Math.floor(capacity/(work*2));
const sustainedRate=work*2*fullHarvests/(fullHarvests+1);
assert(sustainedRate>=10.5);
let cargo=0,delivered=0,spill=0;
for(let tick=0;tick<900;tick++){
 if(capacity-cargo<work*2){delivered+=cargo;cargo=0;}
 else {cargo+=work*2;spill+=Math.max(0,cargo-capacity);}
}
assert.strictEqual(spill,0);
assert(delivered/900>=10,'one productive miner covers source regeneration');
console.log('800-energy source exception sustains regeneration without a second miner');
