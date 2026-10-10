import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRogueImage, describeRogueImage } from './rogue-image.mjs';
import { createRun } from './rogue-run-v08.mjs';
import { CATALOG_V08 } from './rogue-content-v08.mjs';
import {runAction} from './rogue-run-v08.mjs';

async function pngSize(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer());
 assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 return {width:v.getUint32(16),height:v.getUint32(20),bytes};
}
function sampleRun(){return createRun({runId:'render-test',owner:'u',guild:'g',seed:'fixed',now:1});}

test('map model exposes only valid live route choices and recorded progress',async()=>{
 const run=sampleRun();run.path=[{act:1,slot:1,nodeId:run.mapPlan[0].nodes[0][0].id,type:'normal'}];
 run.completed=1;run.slot=2;run.phase='ROUTE';run.room={type:'route',slot:2,choices:[run.mapPlan[0].nodes[1][1].id],nodes:run.mapPlan[0].nodes[1].map((n,i)=>({...n,available:i!==2}))};
 const model=describeRogueImage(run,'map'),act=model.acts[0];
 assert.equal(act.columns[0][0].status,'completed');
 assert.equal(act.columns[0][1].status,'future');
 assert.equal(act.columns[0][1].chosen,false);
 assert.equal(act.columns[1][0].status,'future');
 assert.equal(act.columns[1][1].status,'available');
 assert.equal(act.columns[1][2].status,'future');
 const before=JSON.stringify(run),png=await pngSize(await renderRogueImage(run,{view:'map'}));
 assert.equal(JSON.stringify(run),before);
 assert.equal(png.width,960);assert.ok(png.height<=800);
});

test('legacy saves show only route nodes visible in the saved room',()=>{
 const run={act:2,phase:'BATTLE',hp:23,path:[{act:2,slot:1,nodeId:'old-node',type:'normal'}]};
 const m=describeRogueImage(run,'map');assert.equal(m.acts[0].known,false);assert.deepEqual(m.acts[0].visible,[]);
 run.phase='ROUTE';run.room={type:'route',choices:['visible'],nodes:[{id:'visible',type:'normal',title:'旧街守卫',available:true},{id:'disabled',type:'camp',title:'营地',available:false}]};
 const visible=describeRogueImage(run,'map').acts[0];assert.deepEqual(visible.visible.map(n=>n.status),['available','future']);
});

test('battle PNG is deterministic, bounded, and reports live card eligibility',async()=>{
 const run=sampleRun(),enemyId=CATALOG_V08.acts[0].normalPool[0];
 const deck=run.deck.map(x=>({...x}));
 const {beginBattle}=await import('./rogue-battle-v08.mjs');
 run.battle=beginBattle({enemyId,deck,relics:run.relics,hp:run.hp,seed:'fixed',professionId:run.professionId,items:run.inventory});
 const model=describeRogueImage(run,'battle');assert.ok(model.cards.length>0);assert.ok(model.cards.every(c=>typeof c.playable==='boolean'));
 const before=JSON.stringify(run),first=await pngSize(await renderRogueImage(run)),second=await pngSize(await renderRogueImage(run));
 assert.deepEqual(first.bytes,second.bytes);assert.equal(JSON.stringify(run),before);
 assert.equal(first.width,960);assert.ok(first.height<=800);
});

test('actual route selection marks only current node; cleared station leaves unchosen alternatives gray',()=>{
 let run=runAction(sampleRun(),{type:'BLESSING',relicId:null},2);
 const node=run.room.choices[1];run=runAction(run,{type:'ROUTE',choice:node},3);
 let model=describeRogueImage(run,'map').acts[0];
 assert.equal(model.columns[0].filter(n=>n.status==='current').length,1);
 assert.equal(model.columns[0].find(n=>n.id===node).status,'current');
 run.completed=1;model=describeRogueImage(run,'map').acts[0];
 assert.equal(model.columns[0].filter(n=>n.status==='completed').length,1);
 assert.ok(model.columns[0].filter(n=>n.id!==node).every(n=>n.status==='future'&&!n.chosen));
});

test('reward after battle returns map even when residual battle state is present',()=>{
 const run=sampleRun();run.phase='REWARD';run.battle={enemyId:'retained'};
 assert.equal(describeRogueImage(run).mode,'map');
});

test('saved candidate authorization overrides merely enabled map entry',()=>{
 const run=sampleRun();run.phase='ROUTE';run.room={type:'route',nodes:run.mapPlan[0].nodes[0].map(n=>({...n,available:true})),choices:[run.mapPlan[0].nodes[0][1].id]};
 const nodes=describeRogueImage(run).acts[0].columns[0];
 assert.equal(nodes.filter(n=>n.status==='available').length,1);assert.equal(nodes[0].disabled,true);
});

test('old battle catalog and upgraded energy costs remain accurate',async()=>{
 const {CATALOG}=await import('./rogue-catalog.mjs');const {beginBattle}=await import('./rogue-battle-v04.mjs');
 const run={phase:'BATTLE',act:1,slot:1,hp:30,ruleVersion:'lantern-rules-v0.4'};
 const cardId=Object.keys(CATALOG.cards).find(id=>CATALOG.cards[id].upgrade?.cost!=null);
 assert.ok(cardId);const deck=Array.from({length:4},(_,uid)=>({uid,cardId,upgraded:true}));
 run.battle=beginBattle({enemyId:Object.keys(CATALOG.enemies)[0],deck,relics:[],hp:30,seed:'old'});
 const model=describeRogueImage(run);assert.equal(model.cards[0].cost,CATALOG.cards[cardId].upgrade.cost);
 const png=await pngSize(await renderRogueImage(run));assert.equal(png.width,960);
});
