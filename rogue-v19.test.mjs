import test from 'node:test';
import assert from 'node:assert/strict';
import { beginBattle,battleAction,legalCards } from './rogue-battle.mjs';
import { createRun,runAction,V19_RULE_VERSION as CURRENT_RULE_VERSION,V18_RULE_VERSION } from './rogue-run.mjs';
import { getCatalog } from './rogue-content.mjs';
import { supportPreview } from './rogue-card-effects-v19.mjs';
import { candidateFit } from './rogue-build-system-v19.mjs';
import { previewRogueDeckChange } from './rogue-build-guide.mjs';
import { renderRogue,renderRogueSettings } from './rogue-ui.mjs';
const C=getCatalog('0.19');
function controlled(ids,p='traveler',version=CURRENT_RULE_VERSION){const deck=ids.map((cardId,uid)=>({cardId,uid,upgraded:false}));const b=beginBattle({ruleVersion:version,enemyId:'lantern_rat',deck,relics:[],hp:30,seed:'v19',professionId:p});Object.assign(b,{hand:structuredClone(deck),draw:[],discard:[],exhaust:[],energy:5,plays:0,enemyHp:999,enemyMaxHp:999,enemyArmor:0,enemyShield:0,intent:{kind:'guard',value:0},result:null});return b;}
const play=(b,uid)=>battleAction(b,{type:'PLAY',uid});
test('v19 shield treatment spends useful even shields; upgrade heals three; v18 is frozen',()=>{
 for(const [upgraded,shield,hp,expectedShield,expectedHp] of [[false,5,20,1,22],[true,7,20,1,23],[true,7,29,5,30]]){
  let b=controlled(['medic_shield_suture','slash'],'medic');b.hand[0].upgraded=upgraded;b.shield=shield;b.hp=hp;b=play(b,0);assert.equal(b.shield,expectedShield);assert.equal(b.hp,expectedHp);
 }
 let old=controlled(['medic_shield_suture','slash'],'medic',V18_RULE_VERSION);old.hand[0].upgraded=true;old.shield=5;old.hp=20;old=play(old,0);assert.equal(old.shield,0);assert.equal(old.hp,22);
 assert.equal(getCatalog('0.18').cards.medic_shield_suture.upgrade.effects[0].value,5);
 assert.equal(C.cards.medic_shield_suture.upgrade.effects[0].value,6);
});
test('shield recovery recognizes converters and banking, moves UID once and never resurrects exhausted cards',()=>{
 for(const id of ['shared_bank','fire_cashout','medic_triage','forge_emergency','shared_recall']){
  const p=C.cards[id].professionOnly??'traveler';let b=controlled(['shared_recover','slash'],p);const target={cardId:id,uid:99,upgraded:true};b.discard=[target];b.deck.push(structuredClone(target));b=play(b,0);assert.equal(b.hand.filter(x=>x.uid===99).length,1);assert.equal(b.discard.some(x=>x.uid===99),false);
 }
 let b=controlled(['shared_recover','slash']);b.exhaust=[{cardId:'shared_bank',uid:99,upgraded:false}];b.deck.push(...structuredClone(b.exhaust));b=play(b,0);assert.equal(b.hand.some(x=>x.uid===99),false);
 let old=controlled(['shared_recover','slash'],'traveler',V18_RULE_VERSION);old.discard=[{cardId:'shared_bank',uid:99,upgraded:false}];old.deck.push(...structuredClone(old.discard));old=play(old,0);assert.equal(old.hand.some(x=>x.uid===99),false);
});
test('draw forecasts include the spent card slot and conditional triggers; actual draw matches',()=>{
 let b=controlled(['shared_breath','slash','guard','bandage','pierce']);b.draw=[{cardId:'slash',uid:99,upgraded:false},{cardId:'guard',uid:100,upgraded:false}];b.deck.push(...structuredClone(b.draw));
 assert.match(supportPreview(b,{...C.cards.shared_breath,uid:0},C),/预计抽1\/2/);b=play(b,0);assert.equal(b.hand.length,5);assert.equal(b.effectMetrics.drawSucceeded,1);assert.equal(b.extraPlays,1);
 let x=controlled(['trail_exchange','slash']);assert.match(supportPreview(x,{...C.cards.trail_exchange,uid:0},C),/预计抽0\/1/);
});
test('last-play damage bonus triggers in both normal and extra-action final slots',()=>{
 for(const [plays,extra] of [[2,0],[3,1]]){let b=controlled(['shared_ultimatum','slash']);b.plays=plays;b.extraPlays=extra;b=play(b,0);assert.equal(b.enemyHp,991);}
});
test('unsupported converters are not recommended as build reinforcement',()=>{
 const run={professionId:'traveler',deck:[{cardId:'slash',uid:0}],relics:[]};const fit=candidateFit(run,'forge_emergency',C);assert.equal(fit.evidence,null);assert.equal(fit.category,'新方向');assert.match(fit.reason,/需要先补充锻造启动/);
 run.deck.push({cardId:'forge_stance',uid:1});assert.equal(candidateFit(run,'forge_emergency',C).evidence,true);
});
function wonRun(p,seed,act=1){let r=createRun({ruleVersion:CURRENT_RULE_VERSION,runId:'test',owner:'2',guild:'1',professionId:p,seed,now:0});r.act=act;r.slot=1;r.completed=(act-1)*5;r.phase='BATTLE';r.room={type:'battle',battleType:'normal',enemyId:'lantern_rat',rewardGranted:false};r.battle=controlled(['slash','guard'],p);r.battle.deck=structuredClone(r.deck);r.battle.hand=structuredClone(r.deck.slice(0,2));r.battle.draw=structuredClone(r.deck.slice(2));r.battle.enemyHp=1;return runAction(r,{type:'PLAY',uid:0},0);}
test('real battle rewards offer unowned profession discovery plus a common card across all acts/classes',()=>{
 for(const p of Object.keys(C.professions))for(let act=1;act<=3;act++)for(let seed=0;seed<4;seed++){
  const r=wonRun(p,String(seed),act),ids=r.reward.queue[0].candidates;assert.equal(new Set(ids).size,3);assert.ok(ids.some(id=>C.cards[id].professionOnly===p&&!r.deck.some(c=>c.cardId===id)));assert.ok(ids.some(id=>!C.cards[id].professionOnly));assert.ok(ids.every(id=>!C.cards[id].professionOnly||C.cards[id].professionOnly===p));assert.ok(ids.every(id=>C.cards[id].rewardAct<=act));
 }
});
test('real shop generation provides profession discovery and legal finite-price purchases',()=>{
 for(const p of Object.keys(C.professions)){
  let r=createRun({ruleVersion:CURRENT_RULE_VERSION,runId:'shop',owner:'2',guild:'1',professionId:p,seed:'shop',now:0});r=runAction(r,{type:'BLESSING',relicId:null},0);const node=r.room.nodes[0];node.type='shop';r=runAction(r,{type:'ROUTE',choice:node.id},0);assert.ok(r.room.stock.some(id=>C.cards[id].professionOnly===p&&!r.deck.some(c=>c.cardId===id)));assert.ok(r.room.stock.some(id=>!C.cards[id].professionOnly));const id=r.room.stock[0];r.embers=100;const price=r.room.prices.cardByEnergy[C.cards[id].cost];assert.ok(Number.isFinite(price));r=runAction(r,{type:'SHOP',choice:'buy',cardId:id},0);assert.equal(r.embers,100-price);assert.ok(r.deck.some(c=>c.cardId===id));
 }
});
test('private v19 panel shows live support hints and current exclusive settings without changing old UI',()=>{
 const r=createRun({ruleVersion:CURRENT_RULE_VERSION,runId:'ui',owner:'2',guild:'1',professionId:'traveler',seed:'ui',now:0});r.phase='BATTLE';r.battle=controlled(['shared_breath','shared_recover','slash','guard','pierce']);r.battle.discard=[{cardId:'shared_bank',uid:99,upgraded:false}];const response=renderRogue(r);assert.equal(response.data.flags,64);const text=JSON.stringify(response);assert.match(text,/预计抽1\/2/);assert.match(text,/可回收：以守待援/);assert.match(JSON.stringify(renderRogueSettings({professionId:'medic'})),/专属池：6张/);
 assert.match(C.cards.shared_sprint.description,/自损2/);assert.match(C.cards.shared_sprint.upgrade.description,/自损2/);
});

test('upgrade preview resolves the new catalog and daily seeds separate frozen v18 from v19',async()=>{
 const p=previewRogueDeckChange({ruleVersion:CURRENT_RULE_VERSION,deck:[{cardId:'medic_shield_suture',uid:0,upgraded:false}],uid:0});assert.equal(p.available,true);assert.match(JSON.stringify(p),/≤6/);
 const {dailySeedGroup}=await import('./rogue-economy.mjs');assert.notEqual(dailySeedGroup('1','2026-10-13',CURRENT_RULE_VERSION,0),dailySeedGroup('1','2026-10-13',V18_RULE_VERSION,0));
});
