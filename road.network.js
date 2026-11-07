"use strict";
const localLayout=typeof Game==='undefined'?require('./road.layout.data'):require('road.layout.data');
const key=p=>`${p.x}:${p.y}`;
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const stepDirection=(a,b,map)=>{
  if(a.roomName===b.roomName)return {dx:Math.sign(b.x-a.x),dy:Math.sign(b.y-a.y)};
  const exits=map.describeExits(a.roomName)||{};
  if(exits[3]===b.roomName)return {dx:1,dy:0};
  if(exits[7]===b.roomName)return {dx:-1,dy:0};
  if(exits[5]===b.roomName)return {dx:0,dy:1};
  if(exits[1]===b.roomName)return {dx:0,dy:-1};
  return null;
};
const pairCorridor=(points,map,legal)=>{
  const pairs=[],gaps=[];
  for(let i=0;i<points.length-1;i++){
    const p=points[i],d=i>0&&points[i-1].roomName!==p.roomName
      ? stepDirection(points[i-1],p,map) : stepDirection(p,points[i+1],map);
    if(!d)continue;
    const right={x:p.x-d.dy,y:p.y+d.dx,roomName:p.roomName};
    const next=points[i+1];
    const borderPeer=next.roomName!==p.roomName
      ? {x:next.x-d.dy,y:next.y+d.dx,roomName:next.roomName}:null;
    if(legal(p)&&legal(right)&&(!borderPeer||legal(borderPeer)))
      pairs.push({return:p,outbound:right,...d});
    else gaps.push(p);
  }
  return {pairs,gaps};
};
const chooseLoop=(center,legal)=>{
  const choices=[];
  for(let radius=1;radius<=2;radius++)for(let ox=-2;ox<=2;ox++)for(let oy=-2;oy<=2;oy++){
    const cx=center.x+ox,cy=center.y+oy,points=[];
    for(let x=cx-radius;x<=cx+radius;x++)points.push({x,y:cy-radius,roomName:center.roomName});
    for(let y=cy-radius+1;y<=cy+radius;y++)points.push({x:cx+radius,y,roomName:center.roomName});
    for(let x=cx+radius-1;x>=cx-radius;x--)points.push({x,y:cy+radius,roomName:center.roomName});
    for(let y=cy+radius-1;y>cy-radius;y--)points.push({x:cx-radius,y,roomName:center.roomName});
    if(!points.every(legal)||!points.some(p=>range(p,center)<=1))continue;
    choices.push({points,score:points.length+Math.abs(ox)+Math.abs(oy)});
  }
  // A diamond follows diagonal roads in the extension lattice without
  // occupying any extension tile. Shift it to wrap a close link/container pair.
  for(let ox=-2;ox<=2;ox++)for(let oy=-2;oy<=2;oy++){
    const cx=center.x+ox,cy=center.y+oy;
    const points=[[0,-2],[1,-1],[2,0],[1,1],[0,2],[-1,1],[-2,0],[-1,-1]]
      .map(([dx,dy])=>({x:cx+dx,y:cy+dy,roomName:center.roomName}));
    if(points.every(legal)&&points.some(p=>range(p,center)<=1))
      choices.push({points,score:8+Math.abs(ox)+Math.abs(oy)});
  }
  return choices.sort((a,b)=>a.score-b.score)[0]?.points||[];
};
// A junction can serve several routes. Never impose opposite lane rules there.
const addLane=(directions,p,peer,dx,dy)=>{
  const k=key(p),old=directions[k];
  if(old&&(old.dx!==dx||old.dy!==dy)){directions[k]={junction:true};return;}
  directions[k]={dx,dy,peer:key(peer)};
};
const laneCost=(lane,heading,bothBuilt)=>!lane||lane.junction||!bothBuilt?null:
  lane.dx*heading.dx+lane.dy*heading.dy>0?1:3;
const createRoadNetwork=({Game,FIND_STRUCTURES,FIND_MY_CONSTRUCTION_SITES,
  LOOK_STRUCTURES,LOOK_CONSTRUCTION_SITES,OBSTACLE_OBJECT_TYPES,OK})=>{
  const run=()=>{
    const rooms=Object.values(Game.rooms),legalCache={};
    const legal=p=>{
      const room=Game.rooms[p.roomName];if(!room||p.x<0||p.x>49||p.y<0||p.y>49)return false;
      const k=`${p.roomName}:${key(p)}`;
      if(k in legalCache)return legalCache[k];
      const reserved=room.memory.singleExtensionLayout?.extensionTiles||[];
      const seats=room.memory.controllerBrigadePlan?.segments||[];
      return legalCache[k]=!(room.getTerrain().get(p.x,p.y)&1)&&
        !reserved.some(t=>t.x===p.x&&t.y===p.y)&&
        !seats.some(s=>[s.pickup,s.delivery].some(t=>t&&t.x===p.x&&t.y===p.y))&&
        !room.lookForAt(LOOK_STRUCTURES,p.x,p.y).some(s=>
          OBSTACLE_OBJECT_TYPES.includes(s.structureType))&&
        !room.lookForAt(LOOK_CONSTRUCTION_SITES,p.x,p.y).some(s=>s.structureType!=='road');
    };
    const plans={};
    for(const room of rooms){
      plans[room.name]={version:'right-hand-network-v1',updated:Game.time,
        tiles:{},directions:{},loops:[],gaps:[],crossings:[]};
    }
    const add=p=>{if(plans[p.roomName]&&legal(p))plans[p.roomName].tiles[key(p)]=p;};
    const addPair=pair=>{
      const a=pair.outbound,b=pair.return,plan=plans[a.roomName];
      if(!plan)return;add(a);add(b);
      addLane(plan.directions,a,b,pair.dx,pair.dy);
      addLane(plan.directions,b,a,-pair.dx,-pair.dy);
    };
    if(Game.rooms[localLayout.room]){
      for(const route of localLayout.routes){
        for(let i=0;i<Math.min(route.outbound.length,route.return.length)-1;i++){
          const a={...route.outbound[i],roomName:localLayout.room};
          const b={...route.return[i],roomName:localLayout.room};
          const n=route.outbound[i+1];
          if(legal(a)&&legal(b))addPair({outbound:a,return:b,
            dx:Math.sign(n.x-a.x),dy:Math.sign(n.y-a.y)});
        }
      }
      for(const p of localLayout.junctions)add({...p,roomName:localLayout.room});
    }
    for(const home of rooms.filter(r=>r.controller?.my)){
      for(const memoryKey of ['remoteRoadPlan','southRemoteRoadPlan','southwestRemoteRoadPlan']){
        for(const route of home.memory[memoryKey]?.paths||[]){
          const paired=pairCorridor(route.points,Game.map,legal);
          for(const pair of paired.pairs)addPair(pair);
          for(const p of paired.gaps){add(p);plans[p.roomName]?.gaps.push(p);}
          for(let i=0;i<route.points.length-1;i++){
            const a=route.points[i],b=route.points[i+1];
            if(a.roomName!==b.roomName&&plans[a.roomName]){
              plans[a.roomName].crossings.push({from:a,to:b,
                paired:paired.pairs.some(p=>p.return.x===a.x&&p.return.y===a.y&&p.return.roomName===a.roomName)});
            }
          }
        }
      }
    }
    for(const room of rooms){
      const structures=room.find(FIND_STRUCTURES);
      const containers=structures.filter(s=>s.structureType==='container');
      for(const container of containers){
        const loop=chooseLoop({x:container.pos.x,y:container.pos.y,roomName:room.name},legal);
        plans[room.name].loops.push({container:container.id,points:loop,
          closed:loop.length>0});
        for(const p of loop)add(p);
      }
      for(const p of room.memory.singleExtensionLayout?.roadTiles||[])add({...p,roomName:room.name});
      const plan=plans[room.name];
      const endpoints=[...containers,...structures.filter(s=>s.structureType==='spawn'||s.structureType==='storage'||s.structureType==='link')];
      // Connect loops, service endpoints and paired trunks using real placeable paths.
      const anchor=structures.find(s=>s.structureType==='spawn')||containers[0];
      if(anchor&&typeof room.findPath==='function')for(const endpoint of endpoints){
        const path=room.findPath(anchor.pos,endpoint.pos,{range:1,ignoreCreeps:true,
          maxRooms:1,maxOps:3000,costCallback:(name,costs)=>{
            for(let x=0;x<50;x++)for(let y=0;y<50;y++)if(!legal({x,y,roomName:name}))costs.set(x,y,255);
            return costs;
          }});
        for(const p of path)add({...p,roomName:room.name});
      }
      const existing=structures.filter(s=>s.structureType==='road');
      const sites=room.find(FIND_MY_CONSTRUCTION_SITES);
      let available=Math.max(0,4-sites.filter(s=>s.structureType==='road'&&plan.tiles[key(s.pos)]).length);
      let placed=0;
      const points=Object.values(plan.tiles).sort((a,b)=>
        (containers.some(c=>range(c.pos,a)<=2)?0:1)-
        (containers.some(c=>range(c.pos,b)<=2)?0:1));
      for(const p of points){
        if(available<=0||placed>=2)break;
        if(existing.some(s=>key(s.pos)===key(p))||sites.some(s=>key(s.pos)===key(p)))continue;
        if(room.createConstructionSite(p.x,p.y,'road')===OK){available--;placed++;}
      }
      plan.queued=placed;plan.tileCount=Object.keys(plan.tiles).length;
      room.memory.roadNetworkPlan=plan;
    }
    return plans;
  };
  return {run};
};
module.exports={stepDirection,pairCorridor,chooseLoop,addLane,laneCost,createRoadNetwork};
