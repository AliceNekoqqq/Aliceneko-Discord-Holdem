import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRogueImage, describeRogueImage, normalizeRogueImageText } from './rogue-image.mjs';
import { glyphs } from './card-glyphs.mjs';
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
 const selfCost=Object.entries(CATALOG_V08.cards).find(([,d])=>d.selfCost>0&&d.upgrade);
 if(selfCost){run.battle.hand[0].cardId=selfCost[0];run.battle.hand[0].upgraded=true;}
 run.battle.energy=0;
 const model=describeRogueImage(run,'battle');assert.ok(model.cards.length>0);assert.equal(model.playLimit,CATALOG_V08.player.playLimit);assert.ok(model.cards.every(c=>typeof c.playable==='boolean'));
 assert.ok(model.cards.every(c=>Array.isArray(c.categories)&&Array.isArray(c.effects)&&Array.isArray(c.warnings)&&typeof c.reason==='string'));
 assert.ok(model.cards.some(c=>c.reason==='能量不足'));
 if(selfCost){assert.ok(model.cards[0].warnings.includes('已强化'));assert.ok(model.cards[0].warnings.some(w=>w.startsWith('自损')));}
 assert.ok(model.hints.length>0);
 const before=JSON.stringify(run),first=await pngSize(await renderRogueImage(run)),second=await pngSize(await renderRogueImage(run));
 assert.deepEqual(first.bytes,second.bytes);assert.equal(JSON.stringify(run),before);
 assert.equal(first.width,960);assert.ok(first.height<=800);
 const drawn=[...model.hints,'完整效果见下方文字',...model.cards.flatMap(c=>[c.name,`#${c.id}`,c.reason,...c.effects,...c.warnings,...c.categories.map(g=>g.label)])];
 for(const value of drawn){const normalized=normalizeRogueImageText(value);assert.ok(!/[，。；：、（）·×→≤]/u.test(normalized));for(const ch of normalized)assert.ok(glyphs[ch],`renderer glyph missing: ${JSON.stringify(ch)} in ${normalized}`);}
});

test('card metadata distinguishes entity IDs, upgraded effects, risks, and companion requirements',()=>{
 const normalId='slash',selfCost=Object.entries(CATALOG_V08.cards).find(([,d])=>d.selfCost>0&&d.upgrade),petCard=Object.entries(CATALOG_V08.cards).find(([,d])=>d.effects?.length&&d.effects.every(e=>e.kind==='pet_attack'||e.kind==='sacrifice'));
 assert.ok(CATALOG_V08.cards[normalId]?.upgrade&&selfCost&&petCard);
 const run={phase:'BATTLE',act:1,professionId:'tamer',catalogVersion:'0.8',battle:{ruleVersion:'lantern-rules-v0.8',professionId:'tamer',enemyId:CATALOG_V08.acts[0].normalPool[0],hand:[{uid:11,cardId:normalId,upgraded:false},{uid:12,cardId:normalId,upgraded:true},{uid:13,cardId:selfCost[0],upgraded:false},{uid:14,cardId:petCard[0],upgraded:false}],energy:9,plays:0,hp:1,maxHp:30,petHp:0,result:null}};
 const m=describeRogueImage(run,'battle'),[plain,upgraded,risky,pet]=m.cards;
 assert.notEqual(plain.id,upgraded.id);assert.equal(plain.name,upgraded.name);assert.notDeepEqual(plain.effects,upgraded.effects);
 assert.ok(plain.categories.some(g=>g.label==='攻击'));assert.ok(upgraded.warnings.includes('已强化'));
 assert.ok(risky.warnings.some(w=>w.includes('会倒下')));assert.equal(pet.reason,'需要存活的伙伴');
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
