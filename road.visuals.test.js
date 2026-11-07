"use strict";
const assert=require('assert');const {drawRoadNetwork}=require('./road.visuals');
const lines=[];const room={memory:{roadNetworkPlan:{tiles:{
  '1:1':{x:1,y:1},'2:1':{x:2,y:1},'40:40':{x:40,y:40}},directions:{}}},
 visual:{circle(){},line(...args){lines.push(args);},poly(){}}};
const result=drawRoadNetwork({Game:{time:100,rooms:{test:room}}});
assert.strictEqual(result.rooms,1);assert.strictEqual(lines.length,1);
assert.deepStrictEqual(lines[0].slice(0,4),[1,1,2,1]);
assert.strictEqual(room.memory.roadPlanVisual.mode,'new-road-plan-only');
console.log('new road plan visual adjacency scenarios passed');
