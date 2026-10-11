import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,runAction,RULE_VERSION} from './rogue-run-v12.mjs';
import {CATALOG_V12 as C,EVENTS,PROFESSIONS} from './rogue-content-v12.mjs';
import {CATALOG_V11} from './rogue-content-v11.mjs';
import {candidateFit} from './rogue-build-system.mjs';
import {resourceEffectLines,lastResourceReceipt} from './rogue-resource-state.mjs';
import {renderRogue,renderRogueUidPage} from './rogue-ui.mjs';
import {previewRogueDeckChange} from './rogue-build-guide.mjs';
const fresh=(professionId='traveler',seed='resources')=>createRun({runId:'r',owner:'1',guild:'1',professionId,seed,now:0});
function roomRun(type){const r=fresh();r.phase='ROOM';r.room={type};return r;}

test('v12 stock has real support, a current-act option, variety and deterministic JSON recovery',()=>{
 for(const profession of Object.keys(PROFESSIONS))for(let i=0;i<8;i++){
  const r=fresh(profession,'stock-'+i);r.phase='ROUTE';r.slot=2;r.completed=1;
  const first=r.mapPlan[0].nodes[0][1];r.path=[{act:1,slot:1,nodeId:first.id}];
  const shop=r.mapPlan[0].nodes[1].find(n=>n.type==='shop');assert.ok(shop);
  r.room={type:'route',choices:[shop.id],nodes:r.mapPlan[0].nodes[1]};
  const a=runAction(r,{type:'ROUTE',choice:shop.id},1),b=runAction(JSON.parse(JSON.stringify(r)),{type:'ROUTE',choice:shop.id},1);
  assert.deepEqual(a.room,b.room);assert.equal(a.ruleVersion,RULE_VERSION);
  assert.equal(a.room.stock.length,3);assert.equal(new Set(a.room.stock).size,3);
  const fits=C.acts[0].newCardRewards.filter(id=>candidateFit(r,id,C).evidence===true);
  if(fits.length)assert.ok(a.room.stock.some(id=>a.room.stockRoles[id]==='构筑补强'&&candidateFit(r,id,C).evidence===true));
  assert.ok(a.room.stock.some(id=>a.room.stockRoles[id]==='当幕新牌'&&C.acts[0].newCardRewards.includes(id)));
 }
});
test('successful stock/service transactions record actual deltas and rejected actions never alter input',()=>{
 const r=roomRun('shop');r.embers=50;r.room={type:'shop',stock:['slash'],itemStock:['ember_flare_item'],prices:{cardByEnergy:{1:10},upgrade:12,remove:8,item:8},services:{upgrade:false,remove:false}};
 const a=runAction(r,{type:'SHOP',choice:'buy',cardId:'slash'},1);
 assert.equal(a.embers,40);assert.equal(a.deck.length,r.deck.length+1);assert.equal(a.resourceLog.at(-1).embers,-10);assert.match(lastResourceReceipt(a),/余额40/);assert.equal(r.resourceLog.length,0);
 assert.throws(()=>runAction(a,{type:'SHOP',choice:'buy',cardId:'slash'},2),e=>e.code==='SOLD_OUT');
 const b=runAction(a,{type:'SHOP',choice:'upgrade',uid:a.deck[0].uid},2);assert.equal(b.resourceLog.at(-1).embers,-12);assert.equal(b.deck[0].upgraded,true);
 assert.throws(()=>runAction(b,{type:'SHOP',choice:'upgrade',uid:b.deck[1].uid},3),e=>e.code==='SERVICE_USED');
 const c=runAction(b,{type:'SHOP',choice:'remove',uid:b.deck[1].uid},3);assert.equal(c.resourceLog.at(-1).embers,-8);assert.equal(c.deck.length,b.deck.length-1);
 const full=structuredClone(r);full.resourceLog=Array.from({length:24},()=>({summary:'old'}));assert.equal(runAction(full,{type:'SHOP',choice:'buy',cardId:'slash'},1).resourceLog.length,24);
});
test('event scopes are exact and private to v12; payment and future effect survive JSON restore',()=>{
 assert.equal(CATALOG_V11.version,'0.11');assert.notEqual(C.events,CATALOG_V11.events);
 for(const id of ['cinder_loan','sealed_relic','boss_bargain']){
  const r=roomRun('event');r.embers=30;const def=EVENTS.find(e=>e.eventId===id);
  r.room={type:'event',...structuredClone(def),relicCandidate:C.eliteRelics.find(id=>!r.relics.includes(id))};
  const a=runAction(JSON.parse(JSON.stringify(r)),{type:'EVENT',choice:'pact'},1);
  assert.equal(a.resourceLog.length,1);assert.equal(a.story.history.length,1);
  assert.match(JSON.stringify(renderRogue(a).data),/上次资源操作/);
  if(id==='cinder_loan'){assert.equal(a.story.debtBattles,2);assert.equal(a.embers,42);assert.match(resourceEffectLines(a).join(' '),/未来2场.*每段.*跨幕/);}
  if(id==='sealed_relic'){assert.equal(a.hp,r.hp-4);assert.equal(a.story.campPenalty,2);assert.match(resourceEffectLines(a).join(' '),/所有营地.*本局结束/);}
  if(id==='boss_bargain'){assert.equal(a.embers,18);assert.match(resourceEffectLines(a).join(' '),/本幕首领/);a.act=2;a.completedActs=1;assert.match(resourceEffectLines(a).join(' '),/已结束/);}
 }
});
test('v12 UID upgrade retains the real before/after preview and bounded panel content',()=>{
 const r=roomRun('shop');r.embers=30;r.room={type:'shop',prices:{upgrade:12,remove:8},services:{}};
 const p=previewRogueDeckChange({...r,uid:r.deck[0].uid,action:'upgrade'});assert.equal(p.supported,true);assert.equal(p.available,true);
 const view=renderRogueUidPage(r,'shop','upgrade');assert.match(view.data.embeds[0].description,/升级前.*升级后/s);assert.ok(view.data.embeds[0].description.length<=4096);
});
test('debt decrements on battle entry and reports paid only after last battle, camp receipt uses effective healing',()=>{
 let r=fresh();r.story={debtBattles:2,campPenalty:2,weakenedBossActs:[],history:[{kind:'debt'}]};r=runAction(r,{type:'BLESSING',relicId:null},1);
 const a=runAction(r,{type:'ROUTE',choice:r.room.choices[0]},2);assert.equal(a.story.debtBattles,1);assert.match(a.room.storyEffect,/借火债/);
 const last=structuredClone(a);last.story.debtBattles=0;assert.doesNotMatch(resourceEffectLines(last).join(' '),/已偿清/);last.phase='REWARD';assert.match(resourceEffectLines(last).join(' '),/已偿清/);
 const camp=roomRun('camp');camp.hp=28;camp.story.campPenalty=2;camp.room.healAmount=7;
 const healed=runAction(camp,{type:'CAMP',choice:'heal'},1);assert.equal(healed.hp,30);assert.equal(healed.resourceLog.at(-1).hp,2);
});
