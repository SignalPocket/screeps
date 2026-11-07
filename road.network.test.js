"use strict";
const assert=require('assert');
const {stepDirection,pairCorridor,chooseLoop,addLane,laneCost}=require('./road.network');
const map={describeExits:r=>r==='W1N1'?{3:'W0N1'}:{7:'W1N1'}};
const p=(x,y,roomName='W1N1')=>({x,y,roomName});
assert.deepStrictEqual(stepDirection(p(49,10),p(0,10,'W0N1'),map),{dx:1,dy:0});
const paired=pairCorridor([p(48,10),p(49,10),p(0,10,'W0N1'),p(1,10,'W0N1')],map,()=>true);
assert.ok(paired.pairs.some(a=>a.outbound.roomName==='W1N1'&&a.outbound.x===49&&a.outbound.y===11));
assert.ok(paired.pairs.some(a=>a.outbound.roomName==='W0N1'&&a.outbound.x===0&&a.outbound.y===11));
const blocked=pairCorridor([p(48,10),p(49,10),p(0,10,'W0N1')],map,a=>a.y!==11);
assert.strictEqual(blocked.pairs.length,0);
assert.ok(blocked.gaps.length>0);
const loop=chooseLoop(p(20,20),a=>a.x>1&&a.x<48&&a.y>1&&a.y<48&&!(a.x===20&&a.y===20));
assert.ok(loop.length>=8);
for(let i=0;i<loop.length;i++){
 const a=loop[i],b=loop[(i+1)%loop.length];
 assert.strictEqual(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y)),1);
}
assert.deepStrictEqual(chooseLoop(p(20,20),()=>false),[]);
const directions={};addLane(directions,p(5,6),p(5,5),1,0);
assert.strictEqual(laneCost(directions['5:6'],{dx:1,dy:0},true),1);
assert.strictEqual(laneCost(directions['5:6'],{dx:-1,dy:0},true),3);
assert.strictEqual(laneCost(directions['5:6'],{dx:1,dy:0},false),null);
addLane(directions,p(5,6),p(5,5),-1,0);
assert.strictEqual(laneCost(directions['5:6'],{dx:1,dy:0},true),null);
console.log('road loops, right-hand costs, and paired room-border scenarios passed');
