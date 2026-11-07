"use strict";
// Draw only the actual new plan. Never join an unordered tile set into a path.
const drawRoadNetwork = ({Game,RoomPosition}) => {
  let rooms=0,segments=0;
  for(const room of Object.values(Game.rooms)){
    const plan=room.memory.roadNetworkPlan;
    if(!plan||!room.visual)continue;
    rooms++;
    const tiles=plan.tiles||{},directions=plan.directions||{};
    for(const p of Object.values(tiles)){
      const lane=directions[`${p.x}:${p.y}`];
      room.visual.circle(p.x,p.y,{radius:0.12,fill:'transparent',
        stroke:lane&&!lane.junction?'#40c8c0':'#aab6c2',
        strokeWidth:0.05,opacity:0.65,lineStyle:'dotted'});
      // Connect adjacent planned road tiles only. This keeps loops and shared
      // junctions visible without room-spanning false zigzags.
      for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]){
        const next=tiles[`${p.x+dx}:${p.y+dy}`];
        if(!next)continue;
        room.visual.line(p.x,p.y,next.x,next.y,{color:'#9bafc0',
          width:0.045,opacity:0.45,lineStyle:'dotted'});segments++;
      }
      if(lane&&!lane.junction){
        const dx=lane.dx*0.25,dy=lane.dy*0.25;
        room.visual.poly([[p.x-dx,p.y-dy],[p.x+dx,p.y+dy]],{
          stroke:'#40c8c0',strokeWidth:0.07,opacity:0.75,
          lineStyle:'dotted',fill:'transparent'});
      }
    }
    if(Game.map?.visual&&RoomPosition)for(const crossing of plan.crossings||[]){
      const a=crossing.from,b=crossing.to;
      Game.map.visual.line(new RoomPosition(a.x,a.y,a.roomName),
        new RoomPosition(b.x,b.y,b.roomName),{color:'#40c8c0',
          width:1,opacity:0.7,lineStyle:'dotted'});
    }
    room.memory.roadPlanVisual={tick:Game.time,tiles:Object.keys(tiles).length,
      mode:'new-road-plan-only'};
  }
  return {rooms,segments};
};
module.exports={drawRoadNetwork};
