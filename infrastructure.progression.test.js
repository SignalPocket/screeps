'use strict';
const assert = require('assert');
const { ownedInfrastructureRooms, assessInfrastructureProgression: assess,
  createOwnedRoomInfrastructure } =
  require('./infrastructure.progression');
const { createExtensionGrowthPlanner } = require('./extension.layout');
const limits = { extension: { 1: 0, 2: 5, 3: 10, 4: 20 },
  spawn: { 1: 1, 2: 1, 3: 1, 7: 2 }, container: { 2: 5 } };
const pos = (x, y) => ({ x, y });
const room = { name: 'new-room', controller: { id: 'controller', my: true,
  level: 2, pos: pos(40, 40) }, memory: {} };
const spawn = { id: 'spawn', pos: pos(25, 25), my: true,
  structureType: 'spawn' };
const input = { room, spawns: [], structures: [], sites: [], limits,
  tick: 10, allowSlowPlanning: true, globalSiteCount: 0 };
assert.deepStrictEqual(ownedInfrastructureRooms({ room,
  reserved: { controller: { reservation: {} } },
  enemy: { controller: { my: false } }, highway: {} }), [room]);
let result = assess(input);
assert.strictEqual(result.eligible, true);
assert.strictEqual(result.spawnCapability, 'awaiting-first-spawn');
assert.strictEqual(result.inventory.extension.missing, 5);
const previous = { signature: result.signature, checked: 10 };
assert.strictEqual(assess({ ...input, previous, tick: 11 }).gate,
  'periodic-retry-not-due');
assert.strictEqual(assess({ ...input, previous, tick: 30 }).eligible, true);
assert.strictEqual(assess({ ...input, previous, spawns: [spawn],
  tick: 11 }).eligible, true, 'first spawn completion bypasses periodic delay');
assert.strictEqual(assess({ ...input, previous, spawns: [spawn,
  { id: 'second' }], tick: 11 }).changed, true);
const spawnSignature = assess({ ...input, spawns: [spawn, { id: 'second' }] });
assert.strictEqual(assess({ ...input, spawns: [{ id: 'second' }, spawn],
  previous: { signature: spawnSignature.signature, checked: 10 },
  tick: 11 }).changed, false, 'spawn enumeration order is irrelevant');
room.controller.level = 3;
assert.strictEqual(assess({ ...input, previous, tick: 11 }).eligible, true);
room.controller.level = 2;
assert.strictEqual(assess({ ...input, previous: undefined,
  allowSlowPlanning: false }).gate, 'cpu-slow-planning-disabled');
assert.strictEqual(assess({ ...input, globalSiteCount: 100 }).gate,
  'global-construction-cap');
assert.strictEqual(assess({ ...input, globalSiteCount: 99 }).eligible, true);
assert.strictEqual(assess({ ...input, sites: Array.from({ length: 5 },
  () => ({ structureType: 'extension' })) }).inventory.extension.missing, 0);
assert.strictEqual(assess({ ...input, structures: [{ my: false,
  structureType: 'extension' }] }).inventory.extension.built, 0);
// Exercise the actual placement authority with live-style mutable inventories.
let structures = [spawn], sites = [], calls = [], spawns = [spawn];
let terrain = () => 0, placementResult = 0;
const Game = { time: 10 };
Object.assign(room, {
  find(type) { return type === 'structures' ? structures :
    type === 'sites' ? sites : spawns; },
  getTerrain() { return { get: terrain }; },
  createConstructionSite(x, y, structureType) {
    calls.push({ x, y, structureType });
    if (placementResult === 0) sites.push({ id: `site-${calls.length}`,
      pos: pos(x, y), structureType, remove() { throw Error('manual removal'); } });
    return placementResult;
  }
});
const run = createExtensionGrowthPlanner({ Game, FIND_STRUCTURES: 'structures',
  FIND_MY_CONSTRUCTION_SITES: 'sites', FIND_MY_SPAWNS: 'spawns',
  CONTROLLER_STRUCTURES: limits, getRoomSources: () => [], OK: 0 });
// An invalid old sixty-extension layout must not gate current RCL capacity.
room.memory.singleExtensionLayout = { valid: false, reason: 'RCL8 capacity' };
result = run(room);
assert.strictEqual(result.reason, 'site-placed');
assert.strictEqual(calls.length, 1, 'bounded to one successful site per pass');
run(room);
assert.strictEqual(calls.length, 1, 'pending site is counted on repeated calls');
for (let i = 0; i < 5; i++) {
  if (!sites.length) run(room);
  const site = sites.shift();
  structures.push({ ...site, my: true,
    destroy() { throw Error('existing extension demolition'); } });
}
assert.strictEqual(run(room).reason, 'capacity-covered');
assert.strictEqual(structures.filter(s => s.structureType === 'extension').length, 5);
const before = calls.length;
room.controller.level = 3;
assert.strictEqual(run(room).reason, 'site-placed', 'RCL advance unlocks growth');
assert.strictEqual(calls.length, before + 1);
const manual = [[21,29], [20,30], [20,28], [19,29], [18,28]].map(([x,y]) =>
  ({ pos: pos(x,y), structureType: 'extension',
    remove() { throw Error('manual extension removal'); } }));
structures = [spawn]; sites = manual.slice(); room.controller.level = 2;
assert.strictEqual(run(room).reason, 'capacity-covered');
assert.deepStrictEqual(sites, manual);
room.controller.level = 3;
assert.strictEqual(run(room).reason, 'extensions-under-construction');
assert.deepStrictEqual(sites, manual);
sites = []; spawns = [];
assert.strictEqual(run(room).reason, 'awaiting-first-spawn');
spawns = [spawn, { id: 'second', pos: pos(20,20) }];
placementResult = -8;
assert.strictEqual(run(room).reason, 'placement-rejected');
assert.strictEqual(room.memory.extensionGrowth.result, -8);
terrain = () => 1;
assert.strictEqual(run(room).reason, 'no-connected-layout');
assert.strictEqual(room.memory.singleExtensionLayout.valid, false,
  'growth preserves historical migration state');
// A constrained bootstrap room can fit its current capacity while the
// historical 60-extension plan cannot. No wall/road/occupied tile is replaced.
structures = [spawn]; sites = []; placementResult = 0;
room.controller.level = 2;
terrain = (x,y) => x >= 22 && x <= 28 && y >= 22 && y <= 28 ? 0 : 1;
assert.strictEqual(run(room).reason, 'site-placed');
const firstTarget = { ...sites[0].pos };
sites = [];
structures.push({ structureType: 'road', pos: firstTarget,
  destroy() { throw Error('road demolition'); } });
assert.strictEqual(run(room).reason, 'site-placed');
assert.notDeepStrictEqual(sites[0].pos, firstTarget);
assert.strictEqual(terrain(sites[0].pos.x, sites[0].pos.y), 0);
structures = [spawn, ...manual.map(s => ({ ...s, my: true,
  destroy() { throw Error('completed manual extension demolition'); } }))];
sites = [];
assert.strictEqual(run(room).reason, 'capacity-covered');
// Multiple owned rooms retain independent progression receipts and inventories.
const other = { ...room, name: 'other', memory: {},
  controller: { id: 'other-controller', my: true, level: 1 } };
assert.strictEqual(run(other).reason, 'controller-level');
assert.strictEqual(room.memory.extensionGrowth.reason, 'capacity-covered');
console.log('owned-room infrastructure transitions and non-destructive growth passed');

// Run the production coordinator with the shared authority interfaces. Throwing
// callbacks prove an existing/manual buffer or legacy link cannot enter its
// destructive migration path merely because room capability changes.
const rangePos = (x,y) => ({ x,y, getRangeTo(other,otherY) {
  const p = typeof other === 'number' ? {x:other,y:otherY} : other.pos || other;
  return Math.max(Math.abs(x-p.x),Math.abs(y-p.y));
} });
const mk = (id,type,x,y) => ({ id, my:true, structureType:type,
  pos:rangePos(x,y), destroy(){throw Error('unexpected demolition');},
  remove(){throw Error('unexpected site removal');} });
const testLimits = { ...limits, extension:{...limits.extension,5:30},
  container:{2:5,3:5,4:5,5:5}, storage: {4:1,5:1}, tower:{3:1,5:2}, link:{5:2} };
const firstSpawn=mk('working','spawn',25,25);
const src={id:'src',pos:rangePos(10,10)};
const ctrl={id:'ctrl',my:true,level:2,pos:rangePos(40,40)};
const fixture = (name, built=[firstSpawn], pending=[]) => ({ name,
  memory:{}, controller:{...ctrl}, built:built.slice(), pending:pending.slice(),
  find(type) { return type==='structures'?this.built:type==='sites'?this.pending:
    this.built.filter(s=>s.structureType==='spawn'); },
  getTerrain(){return {get:()=>0};},
  createConstructionSite(x,y,type){this.pending.push(mk(`new-${type}`,type,x,y));return 0;}
});
const environment={time:100,constructionSites:{}};
let callsByAuthority=[];
const add = (room,type,x,y) => {
  callsByAuthority.push(type);room.createConstructionSite(x,y,type);return true;
};
const deps={Game:environment,FIND_STRUCTURES:'structures',
  FIND_MY_CONSTRUCTION_SITES:'sites',FIND_MY_SPAWNS:'spawns',
  CONTROLLER_STRUCTURES:testLimits,getRoomSources:()=>[src],OK:0,
  getContainerPurpose:(r,p)=>p.x>30?'controller':'extensions',
  placeSourceContainerSite:r=>add(r,'container',10,11),
  manageControllerContainer:r=>add(r,'container',40,39),
  manageExtensionContainer:()=>{throw Error('extension anchor required');},
  placeStorageSite:r=>add(r,'storage',24,24),
  placeTowerSite:r=>add(r,'tower',24,23),
  placeLinkSite:()=>{throw Error('legacy link migration entered');},
  isControllerLink:()=>true,isExtensionLink:()=>false};
let reconcile=createOwnedRoomInfrastructure(deps);
const opts={allowSlowPlanning:true,optionalConstruction:true};
let live=fixture('fresh');
let report=reconcile(live,opts);
assert.strictEqual(report.placed,2,'source buffer and extension use bounded slots');
assert.strictEqual(report.actions.controllerContainer.reason,'placement-budget');
const count=live.pending.length;
environment.time++;
assert.strictEqual(reconcile(live,opts).eligible,false);
assert.strictEqual(live.pending.length,count,'no repeated off-cycle placement');
// Transition while CPU planning is disabled must remain unacknowledged.
live.controller.level=3;environment.time++;
const acceptedSignature=live.memory.infrastructureProgression.signature;
report=reconcile(live,{...opts,allowSlowPlanning:false});
assert.strictEqual(report.signature,acceptedSignature);
assert.notStrictEqual(report.pendingSignature,acceptedSignature);
environment.time++;
report=reconcile(live,opts);
assert.strictEqual(report.eligible,true,'CPU recovery retries blocked transition immediately');
assert.strictEqual(report.checked,environment.time);
assert.strictEqual(report.signature,report.pendingSignature);
// Newly owned room without a spawn can establish source/controller buffers.
let bootstrap=fixture('bootstrap',[]);
environment.time++;
report=reconcile(bootstrap,opts);
assert.strictEqual(report.actions.extensions.reason,'awaiting-first-spawn');
assert.strictEqual(report.spawnCapability,'awaiting-first-spawn');
assert.strictEqual(report.placed,2);
bootstrap.built.push(firstSpawn);environment.time++;
assert.strictEqual(reconcile(bootstrap,opts).eligible,true);
// All five manual extension sites are preserved through the production run.
live=fixture('manual',[firstSpawn],manual);
environment.time++;
report=reconcile(live,opts);
assert.strictEqual(report.actions.extensions.reason,'capacity-covered');
assert.ok(manual.every(site=>live.pending.includes(site)));
// Actual controller/source inventory suppresses unsafe migration callbacks.
const buffer=mk('controller-buffer','container',40,39);
const link=mk('legacy-link','link',37,39);
live=fixture('legacy',[firstSpawn,buffer,link,mk('source','container',10,11)]);
live.controller.level=5;
const safeDeps={...deps,manageControllerContainer:()=>{throw Error('controller migration');}};
environment.time++;
reconcile=createOwnedRoomInfrastructure(safeDeps);
report=reconcile(live,opts);
assert.strictEqual(report.actions.controllerContainer.reason,'controller-buffer-covered');
assert.strictEqual(report.actions.link.reason,'preserve-existing-link-layout');
assert.ok(live.built.includes(link));
// Global construction slots are shared across rooms, including unreflected
// successful intents. A transition held by the cap retries once a slot opens.
environment.constructionSites=Object.fromEntries(Array.from({length:99},(_,i)=>[i,{}]));
reconcile=createOwnedRoomInfrastructure(deps);
environment.time++;
live=fixture('last-slot');
assert.strictEqual(reconcile(live,opts).placed,1);
const capped=fixture('capped');
assert.strictEqual(reconcile(capped,opts).gate,'global-construction-cap');
assert.strictEqual(capped.pending.length,0);
environment.time++;environment.constructionSites={};
reconcile=createOwnedRoomInfrastructure(deps);
assert.strictEqual(reconcile(capped,opts).eligible,true);
// Ownership regained after a gap bypasses the periodic delay even if its RCL
// and spawn identities have not changed since the last observed ownership.
environment.time+=2;
assert.strictEqual(reconcile(capped,opts).changed,true);
// Exercise the exact main-loop wiring against two owned rooms and one neutral
// room; the test executes source from main.js rather than mirroring the loop.
const fs=require('fs'),vm=require('vm');
const main=fs.readFileSync(require.resolve('./main.js'),'utf8');
const start=main.indexOf('  for (const room of ownedInfrastructureRooms(Game.rooms)) {');
const end=main.indexOf('  const ownedRooms =',start);
assert.ok(start>0&&end>start,'main must reconcile all controller-owned rooms');
const visits=[];
vm.runInNewContext(main.slice(start,end),{
  Game:{rooms:{bootstrap,live,neutral:{controller:{my:false}}}},
  ownedInfrastructureRooms,allowSlowPlanning:true,
  getRoomSituation:()=>({policy:{permissions:{optionalConstruction:false}}}),
  reconcileInfrastructure:(r,o)=>visits.push([r.name,o.optionalConstruction])
});
assert.deepStrictEqual(visits,[[bootstrap.name,false],[live.name,false]]);
console.log('production infrastructure reconciliation, budget and main wiring passed');

// Exercise the unchanged shared placement implementations, including their
// actual terrain/count checks, behind the coordinator's additive guards.
const {createInfrastructurePlanner}=require('./infrastructure.planner');
const {createRcl5Infrastructure}=require('./rcl5.infrastructure');
environment.time=500;environment.constructionSites={};
live=fixture('shared-authorities',[firstSpawn],manual.slice());
live.controller.pos=rangePos(40,40);
const originalFind=live.find;
live.find=function(type,options={}) {
  const found=originalFind.call(this,type);
  return options.filter?found.filter(options.filter):found;
};
live.lookForAt=function(type,x,y) {
  return (type==='lookStructures'?this.built:type==='lookSites'?this.pending:[])
    .filter(s=>s.pos.x===x&&s.pos.y===y);
};
live.findPath=()=>[{x:1,y:1},{x:2,y:2}];
src.pos.findInRange=(type,d,options={})=>live.find(type,options)
  .filter(s=>src.pos.getRangeTo(s)<=d);
environment.getObjectById=id=>id ? live.built.find(s=>s.id===id)||
  live.pending.find(s=>s.id===id) : null;
const shared={...deps,RoomPosition:function(x,y){return rangePos(x,y);},
  isSingleLaneRoadPosition:()=>false,
  STRUCTURE_EXTENSION:'extension',STRUCTURE_CONTAINER:'container',
  STRUCTURE_STORAGE:'storage',STRUCTURE_ROAD:'road',STRUCTURE_RAMPART:'rampart',
  STRUCTURE_LINK:'link',STRUCTURE_TOWER:'tower',
  FIND_MY_STRUCTURES:'structures',TERRAIN_MASK_WALL:1,TERRAIN_MASK_SWAMP:2,
  LOOK_STRUCTURES:'lookStructures',LOOK_CONSTRUCTION_SITES:'lookSites',
  LOOK_CREEPS:'lookCreeps',RESOURCE_ENERGY:'energy'};
const sharedInfrastructure=createInfrastructurePlanner(shared);
const sharedRcl5=createRcl5Infrastructure({...shared,
  getContainerPurpose:sharedInfrastructure.getContainerPurpose});
reconcile=createOwnedRoomInfrastructure({...shared,...sharedInfrastructure,
  ...sharedRcl5});
report=reconcile(live,opts);
assert.strictEqual(report.placed,2);
assert.strictEqual(report.actions.sourceContainers.reason,'site-placed');
assert.strictEqual(report.actions.controllerContainer.reason,'site-placed');
assert.ok(manual.every(site=>live.pending.includes(site)));
assert.strictEqual(live.pending.filter(s=>s.structureType==='extension').length,5);
environment.time+=20;
report=reconcile(live,opts);
assert.strictEqual(report.placed,0,'shared helpers do not duplicate covered sites');
assert.ok(manual.every(site=>live.pending.includes(site)));
console.log('shared additive source/controller placement preserves manual extension sites');
