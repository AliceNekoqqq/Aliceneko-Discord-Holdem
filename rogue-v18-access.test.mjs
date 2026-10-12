import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_V18 as C } from './rogue-content-v18.mjs';
import { CATALOG_V17 as OLD } from './rogue-content-v17.mjs';
import { cardAllowed } from './rogue-card-access-v18.mjs';
import { createRun, runAction } from './rogue-run-v18.mjs';
import { beginBattle } from './rogue-battle-v18.mjs';

const professions=Object.keys(C.professions);
const fresh=Object.keys(C.cards).filter(id=>!Object.hasOwn(OLD.cards,id));
const publics=fresh.filter(id=>!C.cards[id].professionOnly);

test('catalog adds the planned v18 exclusive and public pool sizes',()=>{
 assert.equal(fresh.length,28);
 assert.equal(fresh.filter(id=>C.cards[id].professionOnly).length,16);
 assert.equal(publics.length,12);
 for(const p of professions){
  const exclusive=Object.entries(C.cards).filter(([,d])=>d.professionOnly===p).map(([id])=>id);
  assert.equal(exclusive.length,6,`${p} should have six exclusive cards`);
  for(const id of exclusive)assert.equal(cardAllowed(C,id,p),true);
  for(const id of exclusive)for(const other of professions.filter(x=>x!==p))assert.equal(cardAllowed(C,id,other),false,`${id} leaked to ${other}`);
 }
 for(const id of publics)for(const p of professions)assert.equal(cardAllowed(C,id,p),true,`${id} should be public`);
});

test('blessing/reward/shop/event catalogs filter profession cards and honor reward-act gates',()=>{
 for(const p of professions){
  const legal=id=>cardAllowed(C,id,p);
  for(const act of C.acts){
   const accessible=act.newCardRewards.filter(legal);
   assert.ok(accessible.every(id=>C.cards[id].rewardAct<=act.index),`act ${act.index} surfaced a gated card`);
   // These are the candidate sources consumed by chapter blessings, battle rewards, shops and events.
   const blessing=act.newCardRewards.filter(legal);
   const reward=act.newCardRewards.filter(legal);
   const shop=act.newCardRewards.filter(legal);
   const event=act.newCardRewards.filter(legal);
   for(const pool of [blessing,reward,shop,event])assert.ok(pool.every(legal));
  }
 }
 const later=fresh.filter(id=>C.cards[id].rewardAct>1);
 assert.ok(later.length>0);
 for(const id of later)assert.ok(!C.acts[0].newCardRewards.includes(id),`${id} must remain act-gated`);
});

test('reward, shop and event action payloads cannot inject another profession card',()=>{
 const run=createRun({runId:'v18-access',owner:'owner',guild:'guild',seed:'access',professionId:'traveler',now:0});
 const illegal=fresh.find(id=>C.cards[id].professionOnly&&C.cards[id].professionOnly!=='traveler');
 run.phase='REWARD';run.reward={completed:false,index:0,queue:[{kind:'card',candidates:[illegal],done:false}],selections:{card:illegal}};
 assert.throws(()=>runAction(run,{type:'REWARD_CLAIM'},1),e=>e.code==='PROFESSION_CARD');
 run.phase='ROOM';run.room={type:'shop',stock:[illegal],itemStock:[],services:{upgrade:false,remove:false},prices:{cardByEnergy:{'0':0,'1':0,'2':0,'3':0}}};run.embers=99;
 assert.throws(()=>runAction(run,{type:'SHOP',choice:'buy',cardId:illegal},2),e=>e.code==='PROFESSION_CARD');
 run.room={type:'event',eventId:'synthetic',choices:['card'],candidates:[illegal],itemCandidates:[],cardCost:0};
 assert.throws(()=>runAction(run,{type:'EVENT',choice:'card',cardId:illegal},3),e=>e.code==='PROFESSION_CARD');
});

test('public summon/forge/echo basics remain accessible and v17 cards remain legal cross-profession',()=>{
 for(const id of ['shared_recall','shared_wrench','shared_break','shared_fireline'])assert.equal(cardAllowed(C,id,'traveler'),true,id);
 assert.equal(cardAllowed(C,'kindle','medic'),true);
 assert.equal(C.cards.shared_sprint.rewardAct,2);
 assert.equal(C.cards.clock_tune.rewardAct,2);
 assert.equal(C.cards.forge_recast.rewardAct,2);
});

test('run synchronization preserves temporary target upgrades outside the battle snapshot',()=>{
 const run=createRun({runId:'v18-upgrade',owner:'owner',guild:'guild',seed:'upgrade',professionId:'messenger',now:0});
 const target=run.deck.find(x=>C.cards[x.cardId]?.upgrade);
 assert.ok(target);
 const original=target.upgraded;
 const battle=beginBattle({enemyId:'lantern_rat',deck:structuredClone(run.deck),relics:run.relics,hp:run.hp,seed:'sync-test',professionId:'messenger'});
 battle.deck.find(x=>x.uid===target.uid).upgraded=true;
 battle.temporaryUpgrades={[target.uid]:original};
 run.phase='BATTLE';run.battle=battle;run.room={type:'battle',battleType:'normal',dangerous:false,rewardGranted:false};
 run.battle.temporaryUpgrades={[target.uid]:original};
 const before=run.deck.map(x=>({...x}));
 runAction(run,{type:'END_TURN'},4);
 assert.equal(run.deck.find(x=>x.uid===target.uid).upgraded,original);
 assert.equal(run.battle.deck.find(x=>x.uid===target.uid).upgraded,true);
 assert.deepEqual(before.map(x=>x.uid),run.deck.map(x=>x.uid));
});
