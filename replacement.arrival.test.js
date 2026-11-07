'use strict';
const assert = require('assert/strict');
const { bodyCost, forecastArrival, positionKey, observedHaulTravel, captureReplacements } = require('./replacement.arrival');
const route = ticks => ({ ticks, basis: 'estimated' });
const candidate = (overrides = {}) => ({ name: 'Spawn1', body: ['work', 'carry', 'move'],
  energy: 300, availableIn: 0, travel: route(20), ...overrides });
const forecast = (ttl, candidates, successors) => forecastArrival({ ttl, candidates, successors });
assert.equal(bodyCost(['claim', 'move']), 650);
assert.equal(bodyCost([{type:'work',hits:0}, {type:'move',hits:100}]), 150);
for (const body of [[], Array(51).fill('move'), ['unknown'], [null], null])
  assert.equal(bodyCost(body), null);
// Real spawn time is body length * 3; exact arrival boundary has zero gap.
assert.equal(forecast(29, [candidate()]).earliestKnownScenario.gapTicks, 0);
assert.equal(forecast(28, [candidate()]).earliestKnownScenario.gapTicks, 1);
assert.equal(forecast(100, [candidate({availableIn:30,travel:route(150)})])
  .earliestKnownScenario.gapTicks, 89);
// The next free spawn wins, rather than the busiest spawn or another room's spawn.
const parallel = forecast(40, [candidate({name:'busy',availableIn:100}), candidate({name:'idle'})]);
assert.equal(parallel.earliestKnownScenario.name, 'idle');
assert.equal(forecast(40, []).noSpawn, true);
assert.equal(forecast(40, []).earliestKnownScenario, null);
// A smaller affordable candidate is evaluated as supplied, never inferred.
assert.equal(forecast(25, [candidate({body:['carry','move'],energy:100})])
  .earliestKnownScenario.gapTicks, 1);
assert.equal(forecast(25, [candidate({energy:199})]).scenarios[0].unknown, 'funding required');
assert.equal(forecast(50,[candidate({body:['claim','move'],energy:650,travel:route(600)})])
  .scenarios[0].unknown,'candidate expires before arrival');
assert.equal(forecast(50,[candidate({travel:route(1500)})]).earliestKnownScenario,null);
for (const invalid of [null, undefined, NaN, -1, Infinity]) {
  assert.equal(forecast(10, [candidate({availableIn:invalid})]).earliestKnownScenario, null);
  assert.equal(forecast(10, [candidate({travel:route(invalid)})]).earliestKnownScenario, null);
}
assert.equal(forecast(10, [candidate({travel:{ticks:0,basis:'guessed'}})])
  .scenarios[0].unknown, 'unknown travel');
assert.equal(forecast(10, [candidate({travel:undefined})]).scenarios[0].spawnOnlyLowerBound, 9);
const unresolved = forecast(10, [candidate(), candidate({name:'unknown',travel:null})]);
assert.equal(unresolved.unknownAlternatives, true);
assert.equal(unresolved.earliestKnownScenario.gapTicks, 19);
// A reserved successor pays only remaining spawn/travel time, not full spawn cost again.
const successor = {name:'replacement',availableIn:5,expiresIn:1505,travel:route(15)};
assert.equal(forecast(18, [], [successor]).earliestKnownScenario.gapTicks, 2);
assert.equal(forecast(30, [], [{...successor,availableIn:0,
  travel:{ticks:0,basis:'at-position'}}]).earliestKnownScenario.arrivalIn, 0);
assert.equal(forecast(30, [], [{...successor,expiresIn:30}])
  .scenarios[0].unknown, 'successor expires too soon');
assert.equal(forecast(10, [], [{...successor,expiresIn:20}]).earliestKnownScenario, null);
assert.throws(() => forecastArrival({ttl:NaN}), /remaining life/);
const frozen = JSON.stringify({ttl:10,candidates:[candidate()],successors:[successor]});
const inputs = JSON.parse(frozen);
forecastArrival(inputs);
assert.equal(JSON.stringify(inputs), frozen);

const m = {home:'A',role:'remote-miner',remoteRoom:'B',remoteSlot:0};
assert.notEqual(positionKey(m), positionKey({...m,home:'X'}));
assert.notEqual(positionKey(m), positionKey({...m,remoteRoom:'C'}));
assert.notEqual(positionKey(m), positionKey({...m,remoteSlot:1}));
assert.equal(positionKey({...m,remoteSlot:undefined}), null);
assert.equal(positionKey({home:'A',role:'hauler'}), null);
const miner = {home:'A',role:'harvester',minerSource:'source'};
assert.equal(positionKey(miner), positionKey({home:'A',role:'harvester',preferredSource:'source'}));
const haul = {home:'A',role:'remote-hauler',remoteRoom:'B',remoteHaulerSlot:0};
const observations = {rooms:{A:{remoteHaulRoutes:{B:{lanes:[{sourceId:'source'}],slotSources:[0]}},
  haulTripStats:{B:{slots:{0:{sourceId:'source',samples:4,outboundTicks:38.4,updated:100}}}}}}};
assert.equal(observedHaulTravel(observations,haul,1600).ticks,39);
assert.equal(observedHaulTravel(observations,haul,1600).basis,'estimated');
assert.equal(observedHaulTravel(observations,haul,1601),null);
assert.equal(observedHaulTravel(observations,haul,99),null);
assert.equal(observedHaulTravel(observations,{...haul,remoteHaulerSlot:1},100),null);
assert.equal(observedHaulTravel(observations,{...haul,role:'remote-miner'},100),null);
const changed = JSON.parse(JSON.stringify(observations));
changed.rooms.A.remoteHaulRoutes.B.lanes[0].sourceId='different';
assert.equal(observedHaulTravel(changed,haul,100),null);

const db = (spawns = []) => ({collections:[
  {name:'env',data:[{data:{gameTime:100,'memory:u':JSON.stringify({creeps:{
    old:miner,young:miner,foreign:{...miner,home:'B'},retired:{...miner,staffingRetire:true},
    pooled:{home:'A',role:'hauler'},pooled2:{home:'A',role:'hauler'}
  }})}}]},
  {name:'rooms.objects',data:[
    ...['old','young','foreign','retired','pooled','pooled2'].map((name,i)=>({type:'creep',
      user:'u',name,room:'A',body:[{type:'work',hits:100},{type:'move',hits:100}],ageTime:120+i*100})),
    {type:'creep',user:'other',name:'intruder',ageTime:1000},
    ...spawns,
    {type:'extension',user:'u',room:'A',store:{energy:50}},
    {type:'storage',user:'u',room:'A',store:{energy:100000}},
    {type:'extension',user:'other',room:'A',store:{energy:500}}
  ]}
]});
const spawn = {type:'spawn',user:'u',room:'A',name:'S',store:{energy:100},
  spawning:{name:'young',spawnTime:110}};
const data = db([spawn,{...spawn,room:'B',name:'Other',spawning:null}]);
const before = JSON.stringify(data);
const evidence = {user:'u',tick:100,positions:{old:{
  candidates:{S:{body:['carry','move'],travel:route(5)}},
  successors:{young:{travel:route(3)}}
}}};
const captured = captureReplacements(data,'u',evidence);
const old = captured.records.find(r=>r.name==='old');
assert.equal(old.forecast.scenarios[0].energy,150); // no storage/foreign energy
assert.equal(old.forecast.scenarios[0].spawnTicks,6);
assert.equal(old.forecast.scenarios[0].availableIn,10);
assert.equal(old.forecast.scenarios[0].arrivalIn,21);
assert.equal(old.forecast.earliestKnownScenario.name,'young');
assert.equal(old.forecast.earliestKnownScenario.arrivalIn,13);
assert.equal(old.forecast.scenarios.length,2); // one home spawn + exact successor
const damaged = JSON.parse(before);
damaged.collections[1].data.find(c=>c.name==='young').body[0].hits=0;
assert.equal(captureReplacements(damaged,'u',evidence).records.find(r=>r.name==='old')
  .forecast.scenarios.length,1);
assert.equal(captured.records.some(r=>r.name==='retired'),false);
assert.equal(captured.records.find(r=>r.name==='pooled').forecast.scenarios.length,1);
assert.equal(JSON.stringify(data),before);
assert.equal(captureReplacements(db(),'u').records[0].forecast.noSpawn,true);
assert.equal(captureReplacements(data,'u').records[0].forecast.earliestKnownScenario,null);
assert.throws(()=>captureReplacements(data,''),/explicit user/);
assert.throws(()=>captureReplacements(data,'other'),/user memory/);
assert.throws(()=>captureReplacements(data,'u',{...evidence,tick:99}),/current tick/);
assert.throws(()=>captureReplacements(data,'u',{...evidence,user:'other'}),/current tick/);
assert.throws(()=>captureReplacements(db([spawn,spawn]),'u'),/Ambiguous/);
// Busy state with no remaining time is unknown, never silently an idle spawn.
const unknownSpawn = captureReplacements(db([{...spawn,spawning:{name:'young'}}]),'u',evidence);
assert.equal(unknownSpawn.records[0].forecast.scenarios[0].unknown,'unknown spawn availability');
console.log('replacement arrival forecasts passed');
