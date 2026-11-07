"use strict";

const key = p => `${p.x}:${p.y}`;
const distance = (a,b) => Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
// Alternating extension/road tiles keep every extension adjacent to a lane.
// Diagonal movement connects the road lattice without solid extension walls.
const planExtensionLayout = ({ spawn, buffer, link, terrain, structures,
  sources = [], controller, capacity = 60, excludedTiles = [] }) => {
  const center = {x:Math.round((spawn.x+buffer.x)/2),
    y:Math.round((spawn.y+buffer.y)/2)};
  const permanent = structures.filter(s => !['extension','road','rampart']
    .includes(s.type));
  const blocked = new Set(permanent.filter(s => s.type !== 'container')
    .map(key));
  const candidates=[];
  for(let x=Math.max(2,center.x-7);x<=Math.min(47,center.x+7);x++) {
    for(let y=Math.max(2,center.y-7);y<=Math.min(47,center.y+7);y++) {
      const p={x,y};
      if((terrain(x,y)&1)||excludedTiles.some(s=>key(s)===key(p))||
          permanent.some(s=>key(s)===key(p))||
          sources.some(s=>distance(s,p)<3)||controller&&distance(controller,p)<4)
        continue;
      candidates.push(p);
    }
  }
  const existing=new Set(structures.filter(s=>s.type==='extension').map(key));
  const roads=new Set(structures.filter(s=>s.type==='road').map(key));
  const extensionTiles=candidates.filter(p=>(p.x+p.y)%2===0)
    .sort((a,b)=> {
      const score=p=>distance(p,spawn)+distance(p,buffer)+
        (link?distance(p,link):0)+ (roads.has(key(p))?4:0)-
        (existing.has(key(p))?2:0);
      return score(a)-score(b)||a.x-b.x||a.y-b.y;
    }).slice(0,capacity);
  const extensionKeys=new Set(extensionTiles.map(key));
  const roadTiles=candidates.filter(p=>(p.x+p.y)%2===1&&!blocked.has(key(p)));
  // Validate the complete final layout, including access from the spawn and
  // the existing service endpoints. Never start a destructive invalid plan.
  const seen=new Set();const queue=[];
  const walkable=(x,y)=>x>0&&x<49&&y>0&&y<49&&!(terrain(x,y)&1)&&
    !blocked.has(`${x}:${y}`)&&!extensionKeys.has(`${x}:${y}`);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++) {
    const x=spawn.x+dx,y=spawn.y+dy;
    if(walkable(x,y)){seen.add(`${x}:${y}`);queue.push({x,y});}
  }
  for(let i=0;i<queue.length;i++){
    const p=queue[i];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      const x=p.x+dx,y=p.y+dy,k=`${x}:${y}`;
      if(!seen.has(k)&&walkable(x,y)){seen.add(k);queue.push({x,y});}
    }
  }
  const accessible=p=>queue.some(q=>distance(p,q)<=1);
  const valid=extensionTiles.length>=capacity&&extensionTiles.every(accessible)&&
    [buffer,...(link?[link]:[])].every(accessible);
  return {version:'single-road-lattice-v2',center,anchor:buffer,
    extensionTiles,roadTiles:roadTiles.filter(p=>seen.has(key(p))),valid,
    reason:valid?'connected access to every extension and service endpoint':
      'insufficient capacity or disconnected access; migration paused'};
};

const createExtensionLayoutManager = ({Game,FIND_STRUCTURES,
  FIND_MY_CONSTRUCTION_SITES,FIND_MY_SPAWNS,CONTROLLER_STRUCTURES,
  getRoomSources,OK}) => room => {
  const structures=room.find(FIND_STRUCTURES);
  const extensions=structures.filter(s=>s.my&&s.structureType==='extension');
  const sites=room.find(FIND_MY_CONSTRUCTION_SITES);
  const extensionSites=sites.filter(s=>s.structureType==='extension');
  const spawn=room.find(FIND_MY_SPAWNS)[0];
  if(!spawn)return false;
  const buffer=structures.find(s=>s.structureType==='container'&&
    s.pos.x===room.memory.extensionContainerPlan?.x&&
    s.pos.y===room.memory.extensionContainerPlan?.y)||structures.filter(s=>
      s.structureType==='container'&&s.pos.getRangeTo(spawn)<=12&&
      !getRoomSources(room).some(source=>source.pos.getRangeTo(s)<=2))
      .sort((a,b)=>a.pos.getRangeTo(spawn)-b.pos.getRangeTo(spawn))[0] || {pos:spawn.pos};
  const link=structures.filter(s=>s.structureType==='link'&&
    s.pos.getRangeTo(buffer)<=5).sort((a,b)=>a.pos.getRangeTo(buffer)-
      b.pos.getRangeTo(buffer))[0];
  let plan=room.memory.singleExtensionLayout;
  if(!plan || plan.version==='single-road-lattice-v1'){
    const previous=plan;
    const terrain=room.getTerrain();
    plan=planExtensionLayout({spawn:spawn.pos,buffer:buffer.pos,link:link?.pos,
      terrain:(x,y)=>terrain.get(x,y),controller:room.controller?.pos,
      sources:getRoomSources(room).map(s=>s.pos),structures:structures.map(s=>
        ({x:s.pos.x,y:s.pos.y,type:s.structureType})),capacity:60});
    if(previous?.migration)plan.migration=previous.migration;
    if(previous?.completed)plan.completed=previous.completed;
    plan.created=Game.time;room.memory.singleExtensionLayout=plan;
  }
  if(!plan.valid)return false;
  room.memory.extensionCluster={x:buffer.pos.x,y:buffer.pos.y,
    version:'single-road-lattice-v1',extensionTiles:plan.extensionTiles};
  delete room.memory.extensionOverflowCluster;
  const at=(a,b)=>a.pos.x===b.x&&a.pos.y===b.y;
  const limit=CONTROLLER_STRUCTURES.extension[room.controller.level]||0;
  const permitted=new Set(plan.extensionTiles.map(key));
  let migration=plan.migration;
  if(migration){
    if(extensions.some(s=>at(s,migration.target))){
      plan.completed=(plan.completed||0)+1;delete plan.migration;
      plan.lastCompleted=Game.time;return true;
    }
    const retiring=Game.getObjectById(migration.retireId);
    const road=structures.find(s=>s.structureType==='road'&&at(s,migration.target));
    if(road){
      if(road.destroy()===OK){migration.roadRemoved=Game.time;return true;}
      return false;
    }
    if(retiring){
      if(retiring.store&&retiring.store.energy>0)return false;
      if(retiring.destroy()===OK){migration.removed=Game.time;return true;}
      return false;
    }
    if(!extensionSites.some(s=>at(s,migration.target))){
      const result=room.createConstructionSite(migration.target.x,
        migration.target.y,'extension');
      migration.lastSiteResult=result;
      if(result===OK)migration.sitePlaced=Game.time;
    }
    // Road lanes can improve while the one extension replacement is built.
    // A remote road backlog must not consume this local lattice's queue.
    const localRoadKeys = new Set(plan.roadTiles.map(key));
    const localRoadSites = sites.filter(s=>s.structureType==='road'&&
      localRoadKeys.has(key(s.pos))).length;
    if(localRoadSites<4){
      let placed=0;
      for(const p of plan.roadTiles.slice().sort((a,b)=>
        distance(a,buffer.pos)-distance(b,buffer.pos))){
        if(at({pos:p},migration.target)||structures.some(s=>at(s,p))||
            sites.some(s=>at(s,p)))continue;
        if(room.createConstructionSite(p.x,p.y,'road')===OK&&
            ++placed>=Math.min(2,4-localRoadSites))break;
      }
    }
    // No second removal until this exact replacement is completed.
    return true;
  }
  if(extensionSites.length)return false;
  const vacant=plan.extensionTiles.find(p=>!structures.some(s=>at(s,p)&&
    !['road','rampart'].includes(s.structureType))&&!sites.some(s=>at(s,p)));
  if(!vacant)return false;
  if(extensions.length<limit){
    plan.migration={target:vacant,started:Game.time,kind:'capacity'};
    return true;
  }
  const violating=extensions.filter(s=>!permitted.has(key(s.pos))&&
    (!s.store||s.store.energy===0)).sort((a,b)=>
      a.pos.getRangeTo(buffer)-b.pos.getRangeTo(buffer)||a.id.localeCompare(b.id));
  if(violating.length){
    plan.migration={retireId:violating[0].id,from:{x:violating[0].pos.x,
      y:violating[0].pos.y},target:vacant,started:Game.time,kind:'relocation'};
    return true;
  }
  // With no extension work pending, build at most two lattice road sites.
  if(sites.filter(s=>s.structureType==='road').length>=4)return false;
  let placed=0;
  for(const p of plan.roadTiles.sort((a,b)=>distance(a,buffer.pos)-distance(b,buffer.pos))){
    if(structures.some(s=>at(s,p))||sites.some(s=>at(s,p)))continue;
    if(room.createConstructionSite(p.x,p.y,'road')===OK&&++placed>=2)break;
  }
  return placed>0;
};
// Growth is deliberately separate from the historical migration manager.
// A room must not need a valid RCL8 layout before adding its RCL2 capacity,
// and reaching a new level never authorizes retiring user infrastructure.
const createExtensionGrowthPlanner = ({ Game, FIND_STRUCTURES,
  FIND_MY_CONSTRUCTION_SITES, FIND_MY_SPAWNS, CONTROLLER_STRUCTURES,
  getRoomSources, OK }) => room => {
  if (!room.controller?.my) return { reason: 'not-owned' };
  const structures = room.find(FIND_STRUCTURES);
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const extensions = structures.filter(s => s.my &&
    s.structureType === 'extension');
  const pending = sites.filter(s => s.structureType === 'extension');
  const limit = CONTROLLER_STRUCTURES.extension?.[room.controller.level] || 0;
  const missing = Math.max(0, limit - extensions.length - pending.length);
  const report = { tick: Game.time, limit, built: extensions.length,
    pending: pending.length, missing, placed: 0 };
  const finish = (reason, retry, extra = {}) => {
    Object.assign(report, { reason, retry }, extra);
    room.memory.extensionGrowth = report;
    return report;
  };
  if (!missing) return finish(limit ? 'capacity-covered' : 'controller-level',
    'controller level, structure or site inventory changes');
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return finish('awaiting-first-spawn',
    'expansion authority completes the first spawn');
  // Complete outstanding extensions first, including manual placements.
  if (pending.length) return finish('extensions-under-construction',
    'existing extension sites complete');
  const terrain = room.getTerrain();
  const sources = getRoomSources(room).map(s => s.pos);
  // Existing extensions and every pending site are permanent obstacles for
  // this pass. The old planner otherwise treats extensions as movable.
  const obstacles = [...structures.map(s => ({ x: s.pos.x, y: s.pos.y,
    type: s.structureType === 'extension' ? 'preserved-extension' :
      s.structureType })), ...sites.map(s => ({ x: s.pos.x, y: s.pos.y,
    type: 'preserved-site' })), ...sources.map(p => ({ ...p,
    type: 'source' })), ...(room.controller.pos ? [{
    x: room.controller.pos.x, y: room.controller.pos.y, type: 'controller'
  }] : [])];
  const plan = planExtensionLayout({ spawn: spawn.pos, buffer: spawn.pos,
    terrain: (x, y) => terrain.get(x, y), structures: obstacles, sources,
    controller: room.controller.pos, capacity: missing,
    excludedTiles: [...structures.filter(s => s.structureType !== 'rampart'),
      ...sites].map(s => s.pos) });
  if (!plan.valid) return finish('no-connected-layout',
    'periodic retry after terrain or infrastructure changes');
  // The graph search already proves spawn access. Also preserve service access
  // beside every existing extension, including those outside the new lattice.
  const blocked = new Set(obstacles.filter(s =>
    !['road', 'rampart', 'container'].includes(s.type)).map(key));
  const extensionKeys = new Set(plan.extensionTiles.map(key));
  const seen = new Set();
  const queue = [];
  const enqueue = (x, y) => {
    const k = `${x}:${y}`;
    if (x <= 0 || x >= 49 || y <= 0 || y >= 49 || seen.has(k) ||
      (terrain.get(x, y) & 1) || blocked.has(k) || extensionKeys.has(k)) return;
    seen.add(k); queue.push({ x, y });
  };
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
    enqueue(spawn.pos.x + dx, spawn.pos.y + dy);
  for (let i = 0; i < queue.length; i++)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      enqueue(queue[i].x + dx, queue[i].y + dy);
  const endpoints = structures.filter(s => ['extension', 'container', 'link',
    'storage', 'spawn'].includes(s.structureType));
  if (!endpoints.every(s => queue.some(p => distance(p, s.pos) <= 1)))
    return finish('existing-service-access',
      'periodic retry after an accessible layout becomes possible');
  const target = plan.extensionTiles[0];
  const result = room.createConstructionSite(target.x, target.y, 'extension');
  return result === OK ? finish('site-placed',
    'new extension site completes', { placed: 1, target, result }) :
    finish('placement-rejected', 'next bounded planning pass', { target, result });
};

module.exports={planExtensionLayout,createExtensionLayoutManager,
  createExtensionGrowthPlanner};
