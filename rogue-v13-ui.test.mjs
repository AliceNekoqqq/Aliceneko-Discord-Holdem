import test from 'node:test';
import assert from 'node:assert/strict';
import {beginBattle,battleAction} from './rogue-battle-v13.mjs';
import {CATALOG_V13 as C} from './rogue-content-v13.mjs';
import {renderRogue} from './rogue-ui.mjs';
import {describeRogueImage,renderRogueImage} from './rogue-image.mjs';
import {enemyDecisionCue,enemyApproach} from './rogue-enemy-guide.mjs';
const deck=Array.from({length:8},(_,uid)=>({uid,cardId:'slash',upgraded:false}));
const viewRun=battle=>({runId:'p3-ui',owner:'1',guild:'1',ruleVersion:'lantern-rules-v0.13',catalogVersion:'0.13',phase:'BATTLE',act:2,slot:1,completed:5,hp:30,embers:20,version:0,deck,inventory:[],relics:[],battle,room:{type:'battle'},story:{debtBattles:0,campPenalty:0,weakenedBossActs:[],history:[]}});

test('charge break UI shows true threshold, progress, reduction and next attack without changing state',async()=>{
 const b=beginBattle({enemyId:'a2_seam_duelist',deck,hp:30,relics:[],seed:'p3-ui'});
 assert.equal(b.intent.kind,'charge');const r=viewRun(b),before=JSON.stringify(r);
 const text=JSON.stringify(renderRogue(r).data);assert.match(text,/破势 0\/8/);assert.match(text,/敌生命损失需达8/);assert.match(text,/每段-2/);assert.match(text,/盾与护甲减免不计/);
 const image=describeRogueImage(r,'battle');assert.match(image.hints[0],/破势 0\/8/);
 const png=await renderRogueImage(r);assert.ok(png.size>1000);const bytes=new Uint8Array(await png.arrayBuffer());assert.deepEqual([...bytes.slice(0,4)],[137,80,78,71]);assert.equal(JSON.stringify(r),before);
 const a=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(a.chargeDamage,5);
 assert.match(JSON.stringify(renderRogue(viewRun(a)).data),/破势 5\/8/);
 const boosted=battleAction(a,{type:'PLAY',uid:a.hand[0].uid});assert.ok(boosted.chargeDamage>=8);assert.match(JSON.stringify(renderRogue(viewRun(boosted)).data),/破势 8\/8.*已达标/);
});
test('conditional shows the public two branches and locks after the first card',()=>{
 const b=beginBattle({enemyId:'mirror_dancer',deck,hp:30,relics:[],seed:'p3-ui'});
 let n=b;for(let i=0;i<2;i++)n=battleAction(n,{type:'END_TURN'});
 assert.equal(n.intent.kind,'conditional');const text=JSON.stringify(renderRogue(viewRun(n)).data);
 assert.match(text,/首张含直伤/);assert.match(text,/首张不含直伤/);assert.match(text,/首张牌决定分支/);
 n=battleAction(n,{type:'PLAY',uid:n.hand[0].uid});assert.match(enemyDecisionCue(n),/已锁定.*含直伤/);
 assert.equal(n.intent.onAttack.kind,'attack');assert.equal(n.intent.onOther.kind,'guard');
});
test('mirror dancer resolves the shown branch: defensive opener gains enemy shield, attack opener takes the stated hit',()=>{
 for (const cardId of ['guard','slash']) {
  const cards=deck.map(e=>({...e,cardId}));
  let b=beginBattle({enemyId:'mirror_dancer',deck:cards,hp:30,relics:[],seed:'branch'});
  b=battleAction(b,{type:'END_TURN'});b=battleAction(b,{type:'END_TURN'});
  assert.equal(b.intent.kind,'conditional');const hp=b.hp;
  b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});b=battleAction(b,{type:'END_TURN'});
  if(cardId==='guard'){assert.equal(b.hp,hp);assert.equal(b.enemyShield,5);}
  else {assert.equal(b.hp,hp-4);assert.equal(b.enemyShield,0);}
 }
});
test('all ordinary enemies expose a concise factual approach; old catalog has no break rule',()=>{
 for(const a of C.acts)for(const id of a.normalPool){assert.ok(enemyApproach(C.enemies[id]));assert.ok(enemyApproach(C.enemies[id]).length<60);}
 const b=beginBattle({enemyId:'a2_seam_duelist',deck,hp:30,relics:[]});
 const old={...viewRun(b),ruleVersion:'lantern-rules-v0.12',catalogVersion:'0.12'};
 assert.doesNotMatch(JSON.stringify(renderRogue(old).data),/破势/);
});
