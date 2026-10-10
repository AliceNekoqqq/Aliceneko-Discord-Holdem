import test from 'node:test';
import assert from 'node:assert/strict';
import {beginBattle,battleAction,legalCards,legalItems} from './rogue-battle.mjs';
import {CATALOG_V07 as C,PROFESSIONS} from './rogue-content-v07.mjs';
import {getDifficultyRules} from './rogue-difficulty.mjs';
const deck=(ids)=>ids.map((cardId,uid)=>({uid,cardId,upgraded:false}));
const start=(extra={})=>beginBattle({ruleVersion:'lantern-rules-v0.7',enemyId:C.acts[0].bossPool[0],deck:deck(PROFESSIONS.traveler.starterDeck),relics:[],hp:30,seed:'engine',...extra});
test('v07 has five real cards and three energy/active actions while v06 remains frozen',()=>{
 let b=start();assert.equal(b.hand.length,5);assert.equal(b.energy,3);
 b=start({deck:deck(Array(8).fill('iron_wall'))});
 for(let i=0;i<3;i++)b=battleAction(b,{type:'PLAY',uid:legalCards(b)[0].uid});
 assert.equal(b.turn,2);assert.equal(b.energy,3);assert.equal(b.plays,0);assert.equal(b.hand.length,5);
 const old=beginBattle({ruleVersion:'lantern-rules-v0.6',enemyId:C.acts[0].normalPool[0],deck:deck(['slash','slash','guard','guard','bandage','pierce','guard','slash']),relics:[],hp:30});
 assert.equal(old.hand.length,4);assert.equal(old.energy,2);
});
test('each cumulative difficulty changes its corresponding live battle parameter',()=>{
 const normal=C.acts[0].normalPool[0],elite=C.acts[0].elitePool[0];
 assert.ok(start({enemyId:normal,difficulty:1}).enemyHp>start({enemyId:normal}).enemyHp);
 assert.ok(start({enemyId:elite,difficulty:2}).enemyHp>start({enemyId:elite}).enemyHp);
 assert.equal(start({difficulty:3}).attackBonus,1);
 assert.equal(start({difficulty:6,hp:28}).maxHp,28);
 assert.equal(start({enemyId:elite,difficulty:7,hp:28}).enemyShield,4);
 assert.equal(start({difficulty:8,hp:28}).bossPhaseAttackBonus,1);
 assert.equal(start({difficulty:10,hp:28}).attackBonus,4);
 assert.equal(start({difficulty:10,hp:28}).phaseThreshold,.65);
 assert.ok(start({enemyId:normal,dangerous:true}).enemyHp>start({enemyId:normal}).enemyHp);
 assert.equal(start({enemyId:normal,dangerous:true}).attackBonus,1);
 assert.throws(()=>start({difficulty:6,hp:30}));
});
test('every Boss and phased elite switches once, preserves current intent, and shows new intent next turn',()=>{
 for(const enemyId of Object.keys(C.enemies).filter(id=>C.enemies[id].phaseIntents?.length)){
  let b=start({enemyId,deck:deck(Array(8).fill('trail_cut'))});const intent=structuredClone(b.intent);
  b.enemyHp=Math.floor(b.enemyMaxHp*.5)+1;
  b=battleAction(b,{type:'PLAY',uid:legalCards(b)[0].uid});
  assert.equal(b.enemyPhase,2,enemyId);assert.deepEqual(b.intent,intent,enemyId);assert.equal(b.phaseStartTurn,2);assert.equal(b.enemyShield,3);
  b=battleAction(b,{type:'END_TURN'});
  assert.equal(b.enemyPhase,2,enemyId);assert.equal(b.turn,2);
  assert.deepEqual(b.intent,C.enemies[enemyId].phaseIntents[0]);
 }
});
test('lethal hit wins without a phase shield and terminal snapshots reject more actions',()=>{
 let b=start({deck:deck(Array(8).fill('hot_iron'))});b.enemyHp=Math.floor(b.enemyMaxHp*.5)+1;b.forge=12;b.prepare=6;b.mark=4;b=battleAction(b,{type:'PLAY',uid:legalCards(b)[0].uid});
 assert.equal(b.result,'WIN');assert.equal(b.enemyPhase,1);assert.throws(()=>battleAction(b,{type:'END_TURN'}));
});
test('draw items conserve all UIDs, respect hand cap and one-item budget',()=>{
 const id=Object.keys(C.items).find(id=>C.items[id].effects.some(e=>e.kind==='draw'));assert.ok(id);
 let b=start({items:[id,id],deck:deck(Array(8).fill('iron_wall'))});assert.equal(legalItems(b).some(x=>x.id===id),false);
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});const plays=b.plays;
 b=battleAction(b,{type:'ITEM',itemIndex:0});assert.ok(b.hand.length<=5);assert.equal(b.plays,plays);assert.equal(b.items.length,1);assert.deepEqual(legalItems(b),[]);
 assert.equal(new Set(['hand','draw','discard','exhaust'].flatMap(p=>b[p].map(c=>c.uid))).size,b.deck.length);
});
