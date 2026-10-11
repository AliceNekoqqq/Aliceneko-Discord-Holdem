import test from 'node:test';
import assert from 'node:assert/strict';
import {beginBattle,battleAction} from './rogue-battle-v15.mjs';
import {renderRogue} from './rogue-ui.mjs';
import {describeRogueImage,renderRogueImage} from './rogue-image.mjs';
import {CATALOG_V15 as C} from './rogue-content-v15.mjs';
import {enemyApproach} from './rogue-enemy-guide.mjs';
const deck=Array.from({length:8},(_,uid)=>({uid,cardId:uid===0?'slash':'guard',upgraded:false}));
const view=battle=>({runId:'boss-ui',owner:'1',guild:'1',ruleVersion:battle.ruleVersion,catalogVersion:'0.15',professionId:'traveler',phase:'BATTLE',act:2,slot:5,completed:9,hp:battle.hp,embers:20,version:0,deck,inventory:[],relics:[],battle,room:{type:'battle'},story:{debtBattles:0,campPenalty:0,weakenedBossActs:[],history:[]}});
function phasePreview(enemyId='a2_mirror_regent',difficulty=0){
 let b=beginBattle({enemyId,deck,relics:[],hp:difficulty>=6?28:30,seed:'boss-ui',difficulty});
 b.enemyShield=0;b.enemyHp=Math.floor(b.enemyMaxHp*b.phaseThreshold)+1;
 b.hand=deck.slice(0,5);b.draw=deck.slice(5);b.discard=[];b.exhaust=[];
 return battleAction(b,{type:'PLAY',uid:0});
}
test('phase opening forecast is explicit, includes both tempo responses, and does not mutate saved state',async()=>{
 const b=phasePreview(),r=view(b),before=JSON.stringify(r);
 assert.equal(b.phaseNextIntent.kind,'tempo');assert.equal(b.phaseStartTurn,b.turn+1);
 const text=JSON.stringify(renderRogue(r).data);assert.match(text,/下轮阶段开场.*至多2张.*架盾.*8.*超过2张.*4×2/);
 assert.match(describeRogueImage(r,'battle').hints[0],/下轮阶段开场.*至多2张.*8.*4×2/);
 const png=await renderRogueImage(r);assert.ok(png.size>1000);assert.equal(JSON.stringify(r),before);
 const next=battleAction(b,{type:'END_TURN'});assert.deepEqual(next.intent,b.phaseNextIntent);assert.equal(next.phaseNextIntent,null);
});
test('tempo UI counts actual played cards and warns the third card changes the response',()=>{
 let b=battleAction(phasePreview(),{type:'END_TURN'});
 assert.equal(b.intent.kind,'tempo');
 for(let count=0;count<=2;count++){
  const text=JSON.stringify(renderRogue(view(b)).data);
  assert.match(text,new RegExp(`本轮已出${count}张，当前架盾分支`));
  assert.match(text,/第三张前再确认意图/);
  assert.match(describeRogueImage(view(b),'battle').hints[0],new RegExp(`已出${count}张 当前架盾`));
  if(count<2)b=battleAction(b,{type:'PLAY',uid:b.hand.find(e=>e.cardId==='guard').uid});
 }
 const calm=battleAction(b,{type:'END_TURN'});assert.equal(calm.enemyShield,8);
 const rush=battleAction(b,{type:'PLAY',uid:b.hand.find(e=>e.cardId==='guard').uid});assert.equal(rush.enemyShield,0);
 assert.equal(rush.turn,b.turn+1);assert.equal(rush.attacksTaken-b.attacksTaken,2);
});
test('difficulty ten phase forecast has the real phase bonus and early 65 percent transition',()=>{
 const b=phasePreview('dark_lantern',10);
 assert.equal(b.phaseThreshold,.65);assert.equal(b.enemyPhase,2);
 assert.equal(b.phaseNextIntent.value,9+b.attackBonus+b.bossPhaseAttackBonus);
 assert.equal(b.phaseNextIntent.next.value,b.phaseNextIntent.value);
 const r=view(b),text=JSON.stringify(renderRogue(r).data);assert.match(text,/下轮阶段开场/);
 const next=battleAction(b,{type:'END_TURN'});assert.deepEqual(next.intent,b.phaseNextIntent);
});
test('Boss route cues include the second-phase counterplay and old v14 images get no new phase forecast',()=>{
 assert.match(enemyApproach(C.enemies.a2_mirror_regent),/第三张牌改变应对/);
 assert.match(enemyApproach(C.enemies.a3_unlit_bellmaster),/蓄力可破势/);
 const b=phasePreview(),old=view({...b,ruleVersion:'lantern-rules-v0.14'});old.ruleVersion='lantern-rules-v0.14';old.catalogVersion='0.14';
 assert.doesNotMatch(JSON.stringify(renderRogue(old).data),/下轮阶段开场/);
 assert.doesNotMatch(describeRogueImage(old,'battle').hints[0],/下轮阶段开场/);
});
