import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_V10 as C, getCatalog, PROFESSIONS } from './rogue-content-v10.mjs';
import { CATALOG_V09 } from './rogue-content-v09.mjs';
import { CATALOG_V08 } from './rogue-content-v08.mjs';
import { createRun, runAction, CURRENT_RULE_VERSION, V08_RULE_VERSION } from './rogue-run-v10.mjs';
import { beginBattle, battleAction } from './rogue-battle-v10.mjs';
import { renderRogue, renderRogueDetails } from './rogue-ui.mjs';
const fresh=(seed='audit')=>createRun({runId:'audit',owner:'1',guild:'1',seed,professionId:'messenger',ruleVersion:CURRENT_RULE_VERSION,now:0});
const battle=(version=CURRENT_RULE_VERSION)=>beginBattle({ruleVersion:version,professionId:'messenger',enemyId:C.acts[0].bossPool[0],hp:30,seed:'seal',relics:['messenger_seal'],deck:Array.from({length:8},(_,uid)=>({uid,cardId:'paper_screen',upgraded:false}))});

test('v0.10 uses a private catalog while preserving old catalog lookup and save rule labels',()=>{
 assert.equal(CURRENT_RULE_VERSION,'lantern-rules-v0.10');
 for(const v of ['0.4','0.6','0.7','0.8','0.9','0.10'])assert.ok(getCatalog(v));
 assert.equal(getCatalog('0.9'),CATALOG_V09);
 assert.equal(getCatalog('0.10'),C);
 assert.equal(getCatalog(V08_RULE_VERSION),CATALOG_V08);
 assert.equal(getCatalog('0.7').version,'0.7');
 assert.equal(CATALOG_V09.cards.quiet_hour.rewardAct,2);
 assert.equal(CATALOG_V09.cards.clean_cut.rewardAct,2);
 assert.equal(C.cards.quiet_hour.rewardAct,1);
 assert.equal(C.cards.clean_cut.rewardAct,1);
 assert.ok(CATALOG_V09.acts[1].newCardRewards.includes('quiet_hour'));
 assert.ok(CATALOG_V09.acts[1].newCardRewards.includes('clean_cut'));
 const oldCatalog=structuredClone(CATALOG_V09);
 assert.deepEqual(CATALOG_V09,oldCatalog);
 const old=fresh();assert.equal(old.catalogVersion,'0.10');assert.equal(old.ruleVersion,CURRENT_RULE_VERSION);
});
test('messenger seal works from starter cards once per turn and survives JSON; automatic draws and items do not trigger it',()=>{
 let b=battle();assert.equal(b.prepare,0);
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.prepare,1);
 b=battleAction(JSON.parse(JSON.stringify(b)),{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.prepare,1);
 b=battleAction(b,{type:'END_TURN'});const before=b.prepare;
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.prepare,before+1);
 // At hand cap a blocked draw cannot qualify; a real sift or retention can.
 let sift=battle();sift.hand[0].cardId='sift_and_cut';
 let noTarget=battleAction(sift,{type:'PLAY',uid:sift.hand[0].uid});assert.equal(noTarget.prepare,0);
 let yes=battleAction(sift,{type:'PLAY',uid:sift.hand[0].uid,targetUid:sift.hand[1].uid});assert.equal(yes.prepare,1);
});
test('map seeds rotate a single camp per act and never strand a player before the boss',()=>{
 const positions=new Set();
 for(let seed=0;seed<30;seed++){
  const r=fresh('route-'+seed);
  assert.deepEqual(JSON.parse(JSON.stringify(r)).mapPlan,r.mapPlan);
  for(const a of r.mapPlan){const camps=a.nodes.flat().filter(n=>n.type==='camp');assert.equal(camps.length,1);positions.add(a.nodes.findIndex(row=>row.some(n=>n.type==='camp')));assert.ok(a.nodes[3].some(n=>n.type==='elite'));assert.ok(a.nodes[0].some(n=>n.type==='normal'));}
 }
 assert.deepEqual([...positions].sort(),[1,2,3]);
});
test('reward stages are disjoint, every profession can build early, no combat-identical cards or excessive burn upgrades remain',()=>{
 const ids=C.acts.flatMap(a=>a.newCardRewards);assert.equal(new Set(ids).size,ids.length);
 for(const a of C.acts){assert.ok(a.newCardRewards.length>=10);for(const id of a.newCardRewards)assert.ok(C.cards[id]);}
 for(const p of Object.values(PROFESSIONS)){
  const first=p.starterDeck.slice(4).filter(id=>C.acts[0].newCardRewards.includes(id)).length;
  const second=p.starterDeck.slice(4).filter(id=>C.acts[1].newCardRewards.includes(id)).length;
  assert.equal(first+second,4);
  assert.equal(first,p.starterDeck.includes('clean_cut')?3:2);
 }
 const signatures=new Map();
 for(const [id,c]of Object.entries(C.cards)){
  const sig=JSON.stringify({cost:c.cost,effects:c.effects,selfCost:c.selfCost,exhaust:c.exhaust,replayable:c.replayable,upgrade:c.upgrade});
  assert.ok(!signatures.has(sig),`${id} duplicates ${signatures.get(sig)}`);signatures.set(sig,id);
  const base=c.effects.filter(e=>e.kind==='burn');(c.upgrade?.effects??[]).filter(e=>e.kind==='burn').forEach((e,i)=>assert.ok(!base[i]||e.value<=base[i].value+1,id));
 }
});
test('act reward includes a new-stage candidate, stays unique, and renders its actual v09 effects',()=>{
 for(let act=1;act<=3;act++){
  let r=runAction(fresh(),{type:'BLESSING',relicId:null},1);
  r.act=act;r.slot=1;r.completed=(act-1)*5;r.phase='BATTLE';
  r.room={type:'battle',battleType:'normal',enemyId:C.acts[act-1].normalPool[0],rewardGranted:false};
  r.battle=beginBattle({ruleVersion:CURRENT_RULE_VERSION,enemyId:r.room.enemyId,deck:r.deck,relics:r.relics,hp:r.hp,seed:'win'});
  r.battle.enemyHp=1;r.battle.enemyArmor=0;r.battle.enemyShield=0;r.battle.hand[0].cardId='slash';
  r=runAction(r,{type:'PLAY',uid:r.battle.hand[0].uid},2);
  assert.equal(r.phase,'REWARD');const candidates=r.reward.queue[0].candidates;assert.equal(new Set(candidates).size,3);assert.ok(candidates.some(id=>C.acts[act-1].newCardRewards.includes(id)));
  assert.ok(renderRogue(r).data.components.length);
 }
 let r=fresh();r.phase='ROOM';r.room={type:'camp',healAmount:9};r.deck=[{uid:0,cardId:'hot_iron',upgraded:false}];
 const view=renderRogueDetails(r,'deck');assert.ok(JSON.stringify(view).includes(C.cards.hot_iron.name));
});
test('weighted card rewards are unique, deterministic after JSON recovery, and retain a current-act option',()=>{
 const open=(seed,act=1)=>{
  let r=fresh(seed);r=runAction(r,{type:'BLESSING',relicId:null},1);r.act=act;r.slot=1;r.completed=(act-1)*5;r.phase='BATTLE';
  r.room={type:'battle',battleType:'normal',enemyId:C.acts[act-1].normalPool[0],rewardGranted:false};
  r.battle=beginBattle({enemyId:r.room.enemyId,deck:r.deck,relics:r.relics,hp:r.hp,seed:'forced-win'});
  r.battle.enemyHp=1;r.battle.enemyArmor=0;r.battle.enemyShield=0;r.battle.hand[0].cardId='slash';
  return runAction(JSON.parse(JSON.stringify(r)),{type:'PLAY',uid:r.battle.hand[0].uid},2);
 };
 for(const act of [1,2,3]){
  const a=open('weighted-'+act,act),b=open('weighted-'+act,act);
  const ca=a.reward.queue[0].candidates,cb=b.reward.queue[0].candidates;
  assert.deepEqual(ca,cb);assert.equal(new Set(ca).size,ca.length);assert.equal(ca.length,3);
  assert.ok(ca.some(id=>C.acts[act-1].newCardRewards.includes(id)));
  assert.equal(Object.keys(a.reward.candidateInfo).length,3);
  assert.equal(a.reward.selections.card,a.reward.recommendedCard);
  assert.equal(a.reward.selections.recommendationReason,undefined);
  assert.equal(typeof a.reward.recommendationReason==='string'||a.reward.recommendationReason===null,true);
 }
 const seeds=new Set(Array.from({length:20},(_,i)=>open('variation-'+i).reward.queue[0].candidates.join(',')));
 assert.ok(seeds.size>1,'bounded positive weights should preserve seed-driven variety');
});
test('a JSON-restored run can complete all fifteen stations and three act bosses',()=>{
 let r=fresh('full-json-run');r=runAction(r,{type:'BLESSING',relicId:null},1);let now=2,steps=0;
 while(r.phase!=='RESULT'&&steps++<400){
  r=JSON.parse(JSON.stringify(r));
  if(r.phase==='CHECKPOINT')r=runAction(r,{type:'CONTINUE'},now++);
  else if(r.phase==='ROUTE'){
   let node=r.room.nodes.find(n=>r.room.choices.includes(n.id)&&n.type==='normal')??r.room.nodes.find(n=>r.room.choices.includes(n.id)&&n.type==='elite')??r.room.nodes.find(n=>r.room.choices.includes(n.id));
   r=runAction(r,{type:'ROUTE',choice:node.id},now++);
  }else if(r.phase==='BATTLE'){
   r.battle.enemyHp=1;r.battle.enemyArmor=0;r.battle.enemyShield=0;
   r.battle.hand[0].cardId='slash';
   r=runAction(r,{type:'PLAY',uid:r.battle.hand[0].uid},now++);
  }else if(r.phase==='REWARD')r=runAction(r,{type:'REWARD_CLAIM'},now++);
  else if(r.phase==='ROOM'){
   if(r.room.type==='blessing')r=runAction(r,{type:'BLESSING',relicId:null},now++);
   else if(r.room.type==='route')continue;
   else if(r.room.type==='event')r=runAction(r,{type:'EVENT',choice:'leave'},now++);
   else if(r.room.type==='shop')r=runAction(r,{type:'SHOP',choice:'leave'},now++);
   else if(r.room.type==='camp')r=runAction(r,{type:'CAMP',choice:'leave'},now++);
   else throw new Error('unexpected room '+r.room.type);
  }else throw new Error('unexpected phase '+r.phase);
 }
 assert.ok(steps<400,'run made progress to completion');
 assert.equal(r.result.type,'CLEAR');assert.equal(r.completed,15);assert.equal(r.stationsPerAct,5);
 assert.equal(r.totalStations,15);assert.equal(r.ruleVersion,'lantern-rules-v0.10');
});
test('every redesigned and upgraded card resolves with finite state, and shield conversion preserves its new shield',()=>{
 for(const [id,c]of Object.entries(C.cards))for(const upgraded of [false,true]){
  if(upgraded&&!c.upgrade)continue;
  let b=battle();b.hp=15;b.enemyHp=500;b.enemyMaxHp=500;b.enemyShield=0;b.enemyArmor=0;b.shield=10;b.petHp=6;b.forge=3;b.energy=9;b.burn=2;
  b.hand[0]={uid:b.hand[0].uid,cardId:id,upgraded};
  const d=upgraded?c.upgrade:c;
  if(!d.effects.length||d.effects.every(e=>e.kind==='heal')&&b.hp===b.maxHp)continue;
  const target=d.effects.some(e=>['retain','sift','exhaust_other'].includes(e.kind))?b.hand[1].uid:undefined;
  const n=battleAction(b,{type:'PLAY',uid:b.hand[0].uid,...(target==null?{}:{targetUid:target})});
  for(const k of ['hp','enemyHp','shield','energy','prepare','forge','petHp'])assert.ok(Number.isFinite(n[k]),`${id} ${k}`);
 }
 let b=battle();b.shield=10;b.hand[0].cardId='measured_reply';const hp=b.enemyHp;
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.shield,10);assert.equal(b.counter,2);assert.ok(b.enemyHp<hp);
});
test('stacked burn boosters contribute only once per turn and cannot multiply across repeated cards',()=>{
 let b=beginBattle({ruleVersion:CURRENT_RULE_VERSION,enemyId:C.acts[0].bossPool[0],hp:30,seed:'burn',relics:['burn_bonus','a2_prism_ember','a3_cinder_toll'],deck:Array.from({length:8},(_,uid)=>({uid,cardId:'kindle',upgraded:false}))});
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.enemyBurn,7);
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.enemyBurn,10);
 b=battleAction(b,{type:'END_TURN'});assert.equal(b.enemyBurn,9);
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.enemyBurn,16);
});
test('free messenger dispatch opens an energy choice without bypassing the three-play limit',()=>{
 let b=beginBattle({ruleVersion:CURRENT_RULE_VERSION,enemyId:C.acts[0].bossPool[0],hp:30,seed:'free',relics:['messenger_seal'],deck:Array.from({length:8},(_,uid)=>({uid,cardId:'dispatch_strike',upgraded:false}))});
 const turn=b.turn;b.energy=0;b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.energy,0);assert.equal(b.plays,1);
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.turn,turn+1);
 assert.equal(C.shop.cardCostByEnergy[0],10);
});
test('medic treatment shields once each turn only after real active healing',()=>{
 const make=hp=>beginBattle({ruleVersion:CURRENT_RULE_VERSION,enemyId:C.acts[0].bossPool[0],hp,seed:'heal',relics:['medic_badge'],deck:Array.from({length:8},(_,uid)=>({uid,cardId:'field_wrap',upgraded:false}))});
 let b=make(20);b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.hp,23);assert.equal(b.shield,5);
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.hp,26);assert.equal(b.shield,8);
 b=make(30);b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.shield,3);
});
