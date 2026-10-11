import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, runAction } from './rogue-run-v11.mjs';
import { isConnectedPlan, nextNodeIds, reachableNodeIds, routeAvailability } from './rogue-route-graph.mjs';

const fresh=(seed)=>createRun({runId:'graph',owner:'u',guild:'g',seed,now:0});

test('seeded route plans have fixed 4x3 rows, adjacent edges, full reachability, one reachable camp, and early combat',()=>{
 for(let seed=0;seed<40;seed++){
  const run=fresh(`graph-${seed}`);
  for(const plan of run.mapPlan){
   assert.equal(isConnectedPlan(plan),true);assert.equal(plan.nodes.length,4);assert.ok(plan.nodes.every(row=>row.length===3));
   assert.equal(plan.edges.length,24);
   for(let row=0;row<3;row++)for(let col=0;col<3;col++){
    const from=`a${plan.act}s${row+1}n${col}`,targets=nextNodeIds(plan,from);
    assert.equal(targets.length,2+(col===1?1:0));
    for(const id of targets){const match=id.match(/s(\d)n(\d)$/);assert.equal(Number(match[1]),row+2);assert.ok(Math.abs(Number(match[2])-col)<=1);}
   }
   for(const first of plan.nodes[0]) assert.ok(reachableNodeIds(plan,first.id).includes(`a${plan.act}s5boss`));
   assert.equal(plan.nodes[0].filter(n=>n.type==='normal').length,3);
   const camps=plan.nodes.flat().filter(n=>n.type==='camp');assert.equal(camps.length,1);
   const campRow=plan.nodes.findIndex(row=>row.some(n=>n.type==='camp'));assert.ok(campRow===1||campRow===2);
   if(campRow===1)assert.deepEqual(plan.nodes[campRow].map(n=>n.type).sort(),['camp','event','shop']);
   if(campRow===2)assert.deepEqual(plan.nodes[campRow].map(n=>n.type).sort(),['camp','elite','normal']);
   assert.ok(plan.nodes[0].every(n=>nextNodeIds(plan,n.id).some(id=>id===camps[0].id)||reachableNodeIds(plan,n.id).includes(camps[0].id)));
  }
 }
});

test('route offers only connected branches and rejects a stale or tampered lane choice',()=>{
 let run=fresh('branch-check');run=runAction(run,{type:'BLESSING',relicId:null},1);
 const plan=run.mapPlan[0],first=plan.nodes[0][0];let avail=routeAvailability(run,plan,1);assert.deepEqual(avail.choices,plan.nodes[0].map(n=>n.id));
 const expected=nextNodeIds(plan,first.id);
 run.path.push({act:1,slot:1,nodeId:first.id,type:'normal'});run.slot=2;run.phase='ROUTE';run.room={type:'route',slot:2,...routeAvailability(run,plan,2)};assert.deepEqual(run.room.choices,expected);
 const unreachable=plan.nodes[1].find(n=>!expected.includes(n.id));assert.ok(unreachable);
 const tampered=structuredClone(run);tampered.room.nodes.push({...unreachable,available:true});tampered.room.choices.push(unreachable.id);
 assert.throws(()=>runAction(tampered,{type:'ROUTE',choice:unreachable.id},3),e=>e.code==='INVALID_ROUTE');
 const restored=JSON.parse(JSON.stringify(run));assert.deepEqual(routeAvailability(restored,plan,2).choices,expected);
});

test('graph validator rejects wrong acts, noncanonical IDs, and extra or reversed edges',()=>{
 const plan=structuredClone(fresh('invalid-graph').mapPlan[0]);
 const invalid=[];
 let copy=structuredClone(plan);copy.edges.push({from:'a1s5boss',to:'a1s1n0'});invalid.push(copy);
 copy=structuredClone(plan);copy.edges.push({from:'a1s4n0',to:'a1s3n2'});invalid.push(copy);
 copy=structuredClone(plan);copy.edges[0]={from:copy.edges[0].to,to:copy.edges[0].from};invalid.push(copy);
 copy=structuredClone(plan);copy.act=4;invalid.push(copy);
 copy=structuredClone(plan);copy.nodes[0][0].id='a1s1n2';invalid.push(copy);
 copy=structuredClone(plan);copy.edges[0]=null;invalid.push(copy);
 copy=structuredClone(plan);copy.edges[0]='a1s1n0';invalid.push(copy);
 for(const bad of invalid)assert.equal(isConnectedPlan(bad),false);
});
