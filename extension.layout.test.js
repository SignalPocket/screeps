"use strict";
const assert=require('assert');
const {planExtensionLayout,createExtensionLayoutManager}=require('./extension.layout');
const plan=planExtensionLayout({spawn:{x:11,y:37},buffer:{x:3,y:39},
  link:{x:3,y:38},terrain:()=>0,structures:[
    {x:11,y:37,type:'spawn'},{x:3,y:39,type:'container'},
    {x:3,y:38,type:'link'}]});
assert.strictEqual(plan.valid,true);
assert.strictEqual(plan.extensionTiles.length,60);
const extensionKeys=new Set(plan.extensionTiles.map(p=>`${p.x}:${p.y}`));
assert.ok(plan.roadTiles.every(p=>!extensionKeys.has(`${p.x}:${p.y}`)));
assert.ok(plan.extensionTiles.every(p=>plan.roadTiles.some(q=>
  Math.max(Math.abs(p.x-q.x),Math.abs(p.y-q.y))===1)));
assert.strictEqual(planExtensionLayout({spawn:{x:5,y:5},buffer:{x:6,y:5},
  terrain:()=>1,structures:[]}).valid,false);
const pos=(x,y)=>({x,y,getRangeTo:p=>Math.max(Math.abs(x-p.pos.x),Math.abs(y-p.pos.y))});
let structures=[],sites=[],destroyed=[];
const object=(id,type,x,y)=>({id,my:true,structureType:type,pos:pos(x,y),
  store:{energy:0},destroy(){destroyed.push(id);structures=structures.filter(s=>s.id!==id);return 0;}});
const spawn=object('spawn','spawn',5,5);
structures=[spawn,object('buffer','container',2,3),
  object('old','extension',10,10),object('road','road',6,6)];
const room={controller:{my:true,level:1},memory:{extensionContainerPlan:{x:2,y:3},
  extensionOverflowCluster:{x:30,y:30},singleExtensionLayout:{valid:true,
    extensionTiles:[{x:6,y:6}],roadTiles:[{x:5,y:6}]}},
  find:type=>type==='structures'?structures:type==='spawns'?[spawn]:sites,
  createConstructionSite(x,y,type){sites.push(object('site',type,x,y));return 0;}};
const Game={time:1,getObjectById:id=>structures.find(s=>s.id===id)};
const run=createExtensionLayoutManager({Game,FIND_STRUCTURES:'structures',
  FIND_MY_CONSTRUCTION_SITES:'sites',FIND_MY_SPAWNS:'spawns',
  CONTROLLER_STRUCTURES:{extension:{1:1}},getRoomSources:()=>[],OK:0});
run(room);assert.ok(room.memory.singleExtensionLayout.migration);
assert.strictEqual(room.memory.extensionOverflowCluster,undefined);
run(room);assert.deepStrictEqual(destroyed,['road']);
run(room);assert.deepStrictEqual(destroyed,['road','old']);
run(room);assert.strictEqual(sites.filter(s=>s.structureType==='extension').length,1);
for(let tick=0;tick<5;tick++)run(room);
assert.strictEqual(sites.filter(s=>s.structureType==='extension').length,1,'no duplicate replacement sites');
assert.deepStrictEqual(destroyed,['road','old'],'no second extension removal');
sites=[];structures.push(object('replacement','extension',6,6));
run(room);assert.strictEqual(room.memory.singleExtensionLayout.migration,undefined);
assert.strictEqual(room.memory.singleExtensionLayout.completed,1);
console.log('single extension layout and serialized migration scenarios passed');
