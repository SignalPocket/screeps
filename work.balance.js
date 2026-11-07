'use strict';
const allocateBalancedWork=({workers,repairTargets,buildSlots})=>{
 const n=workers.length;
 const repairs=Math.min(repairTargets,repairTargets>0?(buildSlots>0?Math.ceil(n*.7):n):0,
  buildSlots>0&&n>1?n-1:n);
 const builds=Math.min(buildSlots,n-repairs);
 const construction=workers.slice().sort((a,b)=>
  Number(b.memory.workJob?.lane==='build')-Number(a.memory.workJob?.lane==='build')||
  a.getActiveBodyparts('work')-b.getActiveBodyparts('work')||a.name.localeCompare(b.name)).slice(0,builds);
 const names=new Set(construction.map(c=>c.name));
 const repair=workers.filter(c=>!names.has(c.name)).slice(0,repairs);
 return {repair:new Set(repair.map(c=>c.name)),build:names};
};
module.exports={allocateBalancedWork};
