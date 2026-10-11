import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,runAction,CURRENT_RULE_VERSION,V10_RULE_VERSION} from './rogue-run.mjs';
import {renderRogue,renderRogueDetails} from './rogue-ui.mjs';
import {describeRogueImage,renderRogueImage} from './rogue-image.mjs';
import {routeAvailability,nextNodeIds} from './rogue-route-graph.mjs';
import {connectedPlanFor,routeSupplyLines} from './rogue-route-view.mjs';
const fresh=(ruleVersion=CURRENT_RULE_VERSION)=>runAction(createRun({runId:'p2',owner:'1',guild:'1',seed:'p2-ui',ruleVersion,now:0}),{type:'BLESSING',relicId:null},1);
test('v11 map exposes exactly saved graph links and branch restrictions, old v10 keeps its map',async()=>{
 const r=fresh(),plan=r.mapPlan[0],first=plan.nodes[0][0];r.path=[{act:1,slot:1,nodeId:first.id,type:first.type}];r.completed=1;r.slot=2;r.room={type:'route',slot:2,...routeAvailability(r,plan,2)};
 const before=JSON.stringify(r),act=describeRogueImage(r,'map').acts[0];
 assert.equal(act.connected,true);assert.deepEqual(act.edges,plan.edges);assert.equal(act.edges.length,24);
 assert.deepEqual(act.columns[1].filter(n=>n.status==='available').map(n=>n.id),nextNodeIds(plan,first.id));
 assert.equal(act.columns[1][2].status,'unreachable');assert.equal(act.columns[0][0].status,'completed');
 const reply=renderRogue(r),e=reply.data.embeds[0];assert.match(e.description,/沿连线/);assert.match(e.description,/营地：第[23]站②/);
 assert.equal(reply.data.components[0].components[2].disabled,true);assert.match(e.fields[2].value,/无法抵达/);
 assert.match(e.fields[0].value,/通往：第3站/);
 const detail=renderRogueDetails(r,'map').data.embeds[0].description;assert.doesNotMatch(detail,/a1s1n0/);assert.match(detail,/通往：/);
 const png=await renderRogueImage(r,{view:'map'});assert.equal(png.type,'image/png');assert.ok(png.size<1500000);assert.equal(JSON.stringify(r),before);
 const old=fresh(V10_RULE_VERSION);assert.equal(connectedPlanFor(old),null);assert.equal(describeRogueImage(old,'map').acts[0].connected,false);assert.equal(old.mapPlan[0].edges,undefined);
});
test('supply forecast distinguishes future, current, visited and missed without changing choices',()=>{
 const r=fresh(),plan=r.mapPlan[0],camp=plan.nodes.flat().find(n=>n.type==='camp'),slot=plan.nodes.findIndex(row=>row.includes(camp))+1;
 assert.match(routeSupplyLines(r,plan)[0],/后续可达/);
 r.slot=slot;r.path.push({act:1,slot,nodeId:camp.id,type:'camp'});r.phase='ROOM';assert.match(routeSupplyLines(r,plan)[0],/当前地点/);
 r.completed=slot;assert.match(routeSupplyLines(r,plan)[0],/已到访/);
 r.path=[];assert.match(routeSupplyLines(r,plan)[0],/已错过/);
});
