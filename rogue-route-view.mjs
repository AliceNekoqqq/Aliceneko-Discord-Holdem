import {isConnectedPlan,nextNodeIds,reachableNodeIds} from './rogue-route-graph.mjs';
const marks=['①','②','③'];
export function connectedPlanFor(run,act=run?.act){
 if(!['lantern-rules-v0.11','lantern-rules-v0.12'].includes(run?.ruleVersion))return null;
 const plan=run.mapPlan?.find(p=>p.act===act);
 return isConnectedPlan(plan)?plan:null;
}
export function routeNodeReference(plan,id){
 for(let row=0;row<(plan?.nodes?.length??0);row++){
  const col=plan.nodes[row].findIndex(n=>n.id===id);
  if(col>=0)return {node:plan.nodes[row][col],slot:row+1,mark:marks[col],label:`第${row+1}站${marks[col]}`};
 }
 return id===`a${plan?.act}s5boss`?{slot:5,mark:'',node:{id,type:'boss',title:'本幕首领'},label:'本幕首领'}:null;
}
export function routeAnchor(run,plan){return (run.path??[]).filter(p=>p.act===plan.act).at(-1)?.nodeId??null;}
export function nextRouteLabels(plan,id){
 return nextNodeIds(plan,id).map(to=>{
  const ref=routeNodeReference(plan,to);
  return ref?`${ref.label} ${ref.node.title||ref.node.type}${ref.node.dangerous?'（危险）':''}`:'';
 }).filter(Boolean);
}
export function routeSupplyLines(run,plan){
 const path=(run.path??[]).filter(p=>p.act===plan.act),selected=new Set(path.map(p=>p.nodeId));
 const reachable=new Set(reachableNodeIds(plan,routeAnchor(run,plan)));
 const state=ref=>{
  const done=(run.completed??0)>=(plan.act-1)*5+ref.slot;
  if(selected.has(ref.node.id))return done?'已到访':'当前地点';
  if(done)return '已错过';
  if(run.act>plan.act)return '已错过';
  return run.act<plan.act||reachable.has(ref.node.id)?'后续可达':'支路外';
 };
 const nodes=plan.nodes.flat();
 return [['camp','营地'],['shop','商店']].map(([kind,name])=>{
  const refs=nodes.filter(n=>n.type===kind).map(n=>routeNodeReference(plan,n.id));
  return `${name}：${refs.map(ref=>`${ref.label} · ${state(ref)}`).join('；')||'本幕无此地点'}`;
 });
}
