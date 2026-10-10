import test from 'node:test';import assert from 'node:assert/strict';
import {beginBattle,battleAction,legalCards} from './rogue-battle.mjs';
import {CATALOG_V08 as C} from './rogue-content-v08.mjs';
import {getDifficultyRules} from './rogue-difficulty-v08.mjs';
const deck=id=>Array.from({length:8},(_,uid)=>({uid,cardId:id,upgraded:false}));
const enemyId=Object.keys(C.enemies).find(id=>C.enemies[id].role==='精英'&&C.enemies[id].intents[0].kind==='attack');
const start=(extra={})=>beginBattle({ruleVersion:'lantern-rules-v0.8',enemyId,deck:deck('guard'),relics:[],hp:30,seed:'bounded',...extra});
test('Cinder Scoop ignites after blocking once per turn, and no longer gives shield on a burn card',()=>{
 let b=start({relics:['cinder_scoop']});b=battleAction(b,{type:'PLAY',uid:legalCards(b)[0].uid});b=battleAction(b,{type:'END_TURN'});assert.ok(b.enemyBurn>0);assert.ok(b.enemyBurn<=1);
 b=start({relics:['cinder_scoop'],deck:deck('flame_pour')});b=battleAction(b,{type:'PLAY',uid:legalCards(b)[0].uid});assert.equal(b.shield,0);assert.equal(b.enemyBurn,3);
});
test('difficulty ramps HP throughout intermediate levels and avoids a final forty-percent jump',()=>{
 for(const id of [C.acts[0].normalPool[0],C.acts[1].elitePool[0],C.acts[2].bossPool[0]]){
  const h=Array.from({length:11},(_,difficulty)=>start({enemyId:id,difficulty,hp:getDifficultyRules(difficulty).maxHp}).enemyMaxHp);
  for(let i=1;i<h.length;i++)assert.ok(h[i]>=h[i-1]);assert.ok(h[10]/h[9]<1.08);
 }
 const a=Array.from({length:11},(_,d)=>getDifficultyRules(d).attackBonus);assert.deepEqual(a,[0,0,0,1,1,1,2,2,2,3,4]);
});
test('charge preview matches the real boosted following strike and event modifiers are bounded',()=>{
 const id=C.acts[0].bossPool[0];let b=start({enemyId:id,difficulty:10,hp:28});assert.equal(b.intent.kind,'charge');const shown=b.intent.value;b=battleAction(b,{type:'END_TURN'});assert.equal(b.intent.kind,'attack');assert.equal(b.intent.value,shown);
 assert.throws(()=>start({extraAttackBonus:4}));assert.throws(()=>start({bossHpMultiplier:.5}));assert.equal(start({extraAttackBonus:1}).attackBonus,1);
});
test('all fifteen phased foes switch once and expose their authored next phase after a JSON restore',()=>{
 for(const id of C.acts.flatMap(a=>[...a.bossPool,...a.elitePool])){
  let b=start({enemyId:id,deck:deck('pierce')});b.enemyHp=Math.floor(b.enemyMaxHp*.5)+1;const current=structuredClone(b.intent);
  b=battleAction(b,{type:'PLAY',uid:legalCards(b)[0].uid});assert.equal(b.enemyPhase,2,id);assert.deepEqual(b.intent,current,id);
  b=battleAction(JSON.parse(JSON.stringify(b)),{type:'END_TURN'});assert.equal(b.enemyPhase,2,id);assert.equal(b.turn,2,id);assert.equal(b.intent.kind,C.enemies[id].phaseIntents[0].kind,id);
 }
 const bossKinds=C.acts.flatMap(a=>a.bossPool).map(id=>C.enemies[id].phaseIntents.map(i=>i.kind).join('/'));assert.equal(new Set(bossKinds).size,6);
});
