import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_V15 } from './rogue-content-v15.mjs';
import { CATALOG_V16 } from './rogue-content-v16.mjs';
import { beginBattle, battleAction, legalEchoes } from './rogue-battle-v16.mjs';
import { getCatalog } from './rogue-content.mjs';

const V16='lantern-rules-v0.16';
const entity=(uid,cardId,upgraded=false)=>({uid,cardId,upgraded});
function controlledBattle(cards){
 const deck=cards.map((card,uid)=>entity(uid,card.id,card.upgraded));
 const b=beginBattle({ruleVersion:V16,enemyId:'lantern_rat',deck,relics:[],hp:30,seed:'v16-echo'});
 b.enemyHp=200;b.enemyMaxHp=200;b.enemyArmor=0;b.enemyShield=0;
 b.hand=deck.map(e=>({...e}));b.draw=[];b.discard=[];b.exhaust=[];b.energy=3;b.plays=0;b.turn=1;b.intent={kind:'guard',value:0};
 return b;
}

test('v16 brings one-cost attacks and high defense closer together while v15 stays frozen',()=>{
 assert.equal(getCatalog('0.15'),CATALOG_V15);assert.equal(getCatalog(V16),CATALOG_V16);
 assert.equal(CATALOG_V15.version,'0.15');assert.equal(CATALOG_V16.version,'0.16');
 assert.equal(CATALOG_V15.cards.iron_wall.effects[0].value,9);
 assert.equal(CATALOG_V16.cards.iron_wall.effects[0].value,6);
 assert.equal(CATALOG_V16.cards.iron_wall.upgrade.effects[0].value,8);
 assert.equal(CATALOG_V15.cards.pierce.effects[0].value,4);
 assert.equal(CATALOG_V16.cards.pierce.effects[0].value,6);
 assert.equal(CATALOG_V16.cards.pierce.upgrade.effects[0].value,8);
 assert.equal(CATALOG_V16.cards.a3_knell_arc.effects[0].value,5);
 assert.equal(CATALOG_V16.cards.a3_knell_arc.upgrade.effects[0].value,7);
 assert.deepEqual(CATALOG_V16.cards.heavy_blow,CATALOG_V15.cards.heavy_blow);
 for(const card of Object.values(CATALOG_V16.cards).filter(c=>c.cost===1)){
  assert.ok((card.effects??[]).filter(e=>e.kind==='block').every(e=>e.value<=6),`${card.name} base block`);
 }
});

test('echo charge needs a button choice, schedules one selected card for free next turn',()=>{
 let b=controlledBattle([{id:'echoing_edge'},{id:'slash'},{id:'guard'}]);
 b=battleAction(b,{type:'PLAY',uid:0});
 assert.equal(b.echoCharges,1);assert.equal(b.echoReady,true);assert.deepEqual(legalEchoes(b),[]);
 b=battleAction(b,{type:'PLAY',uid:1});
 assert.deepEqual(legalEchoes(b).map(e=>e.uid),[1]);
 const plays=b.plays,energy=b.energy,damageBefore=b.enemyHp;
 b=battleAction(b,{type:'ECHO',uid:1});
 assert.equal(b.plays,plays);assert.equal(b.energy,energy);assert.equal(b.echoCharges,0);assert.equal(b.echoCount,1);
 assert.equal(b.pendingEchoes[0].cardId,'slash');assert.equal(b.effectMetrics.echoReplays,0);
 b=battleAction(b,{type:'END_TURN'});
 assert.equal(b.enemyHp,damageBefore-CATALOG_V16.cards.slash.effects[0].value);
 assert.equal(b.effectMetrics.echoReplays,1);
});

test('upgraded echo charge grants two choices and cannot schedule the same physical card twice',()=>{
 let b=controlledBattle([{id:'echoing_edge',upgraded:true},{id:'slash'},{id:'pierce'},{id:'guard'}]);
 b=battleAction(b,{type:'PLAY',uid:0});assert.equal(b.echoCharges,2);
 b=battleAction(b,{type:'PLAY',uid:1});
 assert.deepEqual(legalEchoes(b).map(e=>e.uid),[1]);
 b=battleAction(b,{type:'ECHO',uid:1});assert.equal(b.echoCharges,1);assert.equal(b.echoCount,1);
 assert.deepEqual(legalEchoes(b),[]);
 b=battleAction(b,{type:'PLAY',uid:2});
 assert.equal(b.echoCharges,1);assert.deepEqual(legalEchoes(b).map(e=>e.uid),[2]);
 b=battleAction(b,{type:'ECHO',uid:2});
 assert.equal(b.echoCharges,0);assert.equal(b.echoCount,2);
 assert.equal(b.effectMetrics.echoReplays,0);
 assert.equal(b.pendingEchoes.filter(e=>e.definition.uid===1).length,1);
 assert.equal(b.pendingEchoes.filter(e=>e.definition.uid===2).length,1);
});

test('upgraded self-echo value now queues both copies without echo recursion',()=>{
 let b=controlledBattle([{id:'echo_ward',upgraded:true},{id:'guard'}]);
 b=battleAction(b,{type:'PLAY',uid:0});
 assert.equal(b.echoCount,2);
 assert.equal(b.effectMetrics.echoReplays,0);
 assert.equal(b.pendingEchoes.length,2);
 assert.equal(b.echoCount+b.echoCharges,2);
 b=battleAction(b,{type:'END_TURN'});
 assert.equal(b.effectMetrics.echoReplays,2);
 assert.equal(b.pendingEchoes.length,0);
});

 test('last playable card keeps a choice window open before the enemy turn',()=>{
 let b=controlledBattle([{id:'echoing_edge'},{id:'slash'}]);
 b=battleAction(b,{type:'PLAY',uid:0});
 b=battleAction(b,{type:'PLAY',uid:1});
 assert.equal(b.turn,1);assert.equal(b.energy,1);
 assert.deepEqual(legalEchoes(b).map(e=>e.uid),[1]);
 b=battleAction(b,{type:'ECHO',uid:1});
 assert.equal(b.turn,1);assert.equal(b.pendingEchoes.length,1);
 b=battleAction(b,{type:'END_TURN'});
 assert.equal(b.effectMetrics.echoReplays,1);
 });
