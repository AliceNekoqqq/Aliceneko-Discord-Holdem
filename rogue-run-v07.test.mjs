import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, runAction, RULE_VERSION } from './rogue-run-v07.mjs';
import { CATALOG_V07, PROFESSIONS, EVENTS } from './rogue-content-v07.mjs';
import { getDifficultyRules } from './rogue-difficulty.mjs';

const fresh=(extra={})=>{const r=createRun({runId:'v07',owner:'u',guild:'g',seed:'saved-map',now:0,...extra});return runAction(r,{type:'BLESSING',relicId:null},1);};
const route=(run,id)=>runAction(run,{type:'ROUTE',choice:id},run.lastActionAt+1);
const leaveEvent=(run)=>runAction(run,{type:'EVENT',choice:'leave'},run.lastActionAt+1);

test('new runs freeze fifteen saved stations, three branches, and a complete path record',()=>{
 const unopened=createRun({runId:'before',owner:'u',guild:'g',seed:'saved-map',now:0}),a=fresh(),b=fresh();assert.equal(unopened.room.type,'blessing');assert.equal(RULE_VERSION,'lantern-rules-v0.7');assert.equal(a.stationsPerAct,5);assert.equal(a.totalStations,15);assert.equal(a.mapPlan.length,3);assert.deepEqual(a.mapPlan,b.mapPlan);assert.deepEqual(a.bosses,b.bosses);assert.equal(a.room.nodes.length,3);assert.deepEqual(a.room.choices,a.room.nodes.filter(n=>n.available).map(n=>n.id));
 for(const plan of a.mapPlan){assert.equal(plan.nodes.length,4);assert.ok(plan.nodes.every(nodes=>nodes.length===3));assert.ok(CATALOG_V07.enemies[plan.bossId]);}
 const eventNode=a.room.nodes.find(n=>n.type==='event');assert.ok(eventNode);const room=route(a,eventNode.id);assert.equal(room.phase,'ROOM');assert.equal(room.room.eventId,eventNode.eventId);assert.equal(room.path[0].eventId,eventNode.eventId);assert.deepEqual(room.path[0],{act:1,slot:1,nodeId:eventNode.id,type:'event',enemyId:null,eventId:eventNode.eventId,dangerous:false});
});

test('difficulty affects starting/max health, room prices, camp healing, and battle parameters',()=>{
 const d0=fresh(),d6=fresh({difficulty:6});assert.equal(d0.difficulty,0);assert.equal(d0.hp,30);assert.equal(d6.hp,28);assert.equal(d6.battle,null);
 const d6Slot2=leaveEvent(route(d6,d6.room.nodes.find(n=>n.type==='event').id));const shopNode=d6Slot2.room.nodes.find(n=>n.type==='shop');const r=route(d6Slot2,shopNode.id);assert.equal(r.room.prices.item,10);assert.equal(r.room.prices.upgrade,14);
 const battleNode=d0.room.nodes.find(n=>n.type==='normal');const fight=route(d0,battleNode.id);assert.equal(fight.battle.ruleVersion,RULE_VERSION);assert.equal(fight.battle.difficulty,0);assert.equal(fight.battle.professionId,'traveler');
 assert.deepEqual([0,4,5,6,7,8,9,10].map(x=>getDifficultyRules(x).campHealAmount),[9,7,7,7,7,7,7,7]);
 assert.throws(()=>fresh({difficulty:11}),e=>e.code==='INVALID_DIFFICULTY');
});

test('dangerous route reaches battle and preserves its separate reward flag',()=>{
 let selected=fresh({seed:'hazard'});const n=selected.room.nodes.find(x=>x.type==='normal'&&x.dangerous);assert.ok(n);selected=route(selected,n.id);assert.equal(selected.room.dangerous,true);assert.equal(selected.battle.dangerous,true);assert.equal(selected.battle.attackBonus,1);
 selected.battle.enemyHp=1;selected.battle.enemyShield=0;selected.battle.enemyArmor=0;let attack=selected.battle.hand.find(c=>CATALOG_V07.cards[c.cardId].effects.some(e=>['damage','weapon_attack'].includes(e.kind)));
 if(!attack){attack=selected.battle.draw.find(c=>CATALOG_V07.cards[c.cardId].effects.some(e=>['damage','weapon_attack'].includes(e.kind)));selected.battle.draw=selected.battle.draw.filter(c=>c.uid!==attack.uid);selected.battle.hand.push(attack);}
 selected=runAction(selected,{type:'PLAY',uid:attack.uid},selected.lastActionAt+1);assert.equal(selected.reward.source,'dangerous');assert.ok(selected.reward.queue.some(x=>x.kind==='relic'));assert.equal(selected.embers,CATALOG_V07.acts[0].normalEmbers+4);
});

test('route selection cannot exceed two camps or skip all pre-boss battles',()=>{
 const r=fresh();let current=r;
 for(let slot=1;slot<=3;slot++){
  const options=current.room.nodes;const chosen=options.find(n=>n.type==='camp')??options.find(n=>n.type==='event');current=route(current,chosen.id);
  if(current.phase==='BATTLE')assert.fail('chosen branch unexpectedly battled');
  // Leave events to move along, and camp once only.
  if(current.room.type==='event')current=runAction(current,{type:'EVENT',choice:'leave'},current.lastActionAt+1);
  else if(current.room.type==='camp')current=runAction(current,{type:'CAMP',choice:'leave'},current.lastActionAt+1);
 }
 const slot4=current.room.nodes.find(n=>n.type!=='elite');assert.throws(()=>route(current,slot4.id),e=>e.code==='INVALID_ROUTE');
});

test('all event action families resolve with valid prices and targets',()=>{
 for(const def of EVENTS){
  let r=fresh();r.phase='ROOM';r.room={type:'event',...structuredClone(def),candidates:['trail_cut'],itemCandidates:['cold_ash_item']};r.embers=100;r.hp=20;
  const choice=def.choices.find(c=>c!=='leave');if(!choice)continue;
  if(choice==='upgrade')r=runAction(r,{type:'EVENT',choice,uid:0},1);
  else if(choice==='remove')r=runAction(r,{type:'EVENT',choice,uid:0},1);
  else if(choice==='card'||choice==='trade')r=runAction(r,{type:'EVENT',choice,cardId:'trail_cut'},1);
  else if(choice==='item')r=runAction(r,{type:'EVENT',choice,itemId:'cold_ash_item'},1);
  else r=runAction(r,{type:'EVENT',choice},1);
  assert.equal(r.completed,1,def.eventId);
 }
});

test('profession decks and event map candidates remain recoverable across cloned snapshots',()=>{
 for(const professionId of Object.keys(PROFESSIONS)){
  const run=fresh({professionId});const copy=JSON.parse(JSON.stringify(run));assert.deepEqual(copy.mapPlan,run.mapPlan);assert.equal(copy.deck.length,8);assert.equal(copy.difficulty,0);
 }
});

test('an action-driven three-act route records and completes all fifteen stations',()=>{
 let run=fresh({seed:'full-route'}),steps=0;
 while(run.phase!=='RESULT'&&steps++<250){
  if(run.phase==='ROUTE')run=route(run,run.room.choices[0]);
  else if(run.phase==='BATTLE'){
   run.battle.enemyHp=1;run.battle.enemyArmor=0;run.battle.enemyShield=0;run.battle.energy=3;run.battle.plays=0;
   let attack=run.battle.hand.find(c=>c.cardId==='slash');
   if(!attack){attack=run.battle.deck.find(c=>c.cardId==='slash');run.battle.hand=run.battle.hand.filter(c=>c.uid!==attack.uid);run.battle.draw=run.battle.draw.filter(c=>c.uid!==attack.uid);run.battle.discard=run.battle.discard.filter(c=>c.uid!==attack.uid);run.battle.exhaust=run.battle.exhaust.filter(c=>c.uid!==attack.uid);run.battle.hand.push(attack);}
   run=runAction(run,{type:'PLAY',uid:attack.uid},run.lastActionAt+1);
  }else if(run.phase==='REWARD')run=runAction(run,{type:'REWARD',choice:null},run.lastActionAt+1);
  else if(run.phase==='ROOM'&&run.room.type==='blessing')run=runAction(run,{type:'BLESSING',relicId:null},run.lastActionAt+1);
  else if(run.phase==='ROOM'&&run.room.type==='event')run=runAction(run,{type:'EVENT',choice:'leave'},run.lastActionAt+1);
  else if(run.phase==='ROOM'&&run.room.type==='camp')run=runAction(run,{type:'CAMP',choice:'leave'},run.lastActionAt+1);
  else if(run.phase==='ROOM'&&run.room.type==='shop')run=runAction(run,{type:'SHOP',choice:'leave'},run.lastActionAt+1);
  else if(run.phase==='CHECKPOINT')run=runAction(run,{type:'CONTINUE'},run.lastActionAt+1);
  else assert.fail(`unexpected state ${run.phase}/${run.room?.type}`);
 }
 assert.equal(run.phase,'RESULT');assert.equal(run.result.type,'CLEAR');assert.equal(run.completed,15);assert.equal(run.completedActs,3);assert.equal(run.path.length,15);assert.equal(run.path.filter(p=>p.type==='boss').length,3);
});
