import test from 'node:test';
import assert from 'node:assert/strict';
import {beginBattle,battleAction} from './rogue-battle.mjs';
import {createRun,runAction,CURRENT_RULE_VERSION,V19_RULE_VERSION} from './rogue-run.mjs';
import {getCatalog} from './rogue-content.mjs';
import {enemyPressureFor} from './rogue-enemy-pressure-v20.mjs';
import {renderRogue} from './rogue-ui.mjs';
import {describeRogueImage} from './rogue-image.mjs';
const C=getCatalog('0.20');
function controlled(ids,p='traveler',enemyId='lantern_rat',version=CURRENT_RULE_VERSION){const deck=ids.map((cardId,uid)=>({cardId,uid,upgraded:false}));const b=beginBattle({ruleVersion:version,enemyId,professionId:p,deck,relics:[],hp:30,seed:'v20'});Object.assign(b,{hand:structuredClone(deck),draw:[],discard:[],exhaust:[],energy:5,plays:0,enemyHp:999,enemyMaxHp:999,enemyArmor:0,enemyShield:0,intent:{kind:'guard',value:0},result:null});return b;}
const play=(b,uid)=>battleAction(b,{type:'PLAY',uid});
test('six offensive shield turns keep shield amount and leave old ordinary enemies frozen',()=>{
 for(const id of ['ash_guard','empty_bottle','a2_mirror_moth','rivet_carrier','a3_bell_warden','rusted_scribe']){const old=getCatalog('0.19').enemies[id].intents.find(i=>i.kind==='guard'),i=C.enemies[id].intents.find(i=>i.shieldAfter);assert.equal(i.shieldAfter,old.value);assert.equal(i.kind,'attack');assert.equal(C.enemies[id].hp,getCatalog('0.19').enemies[id].hp);}
 let b=controlled(['slash','guard']);b.intent={kind:'attack',value:4,shieldAfter:4};b=battleAction(b,{type:'END_TURN'});assert.equal(b.hp,26);assert.equal(b.enemyShield,4);
});
test('pressure starts at 7, boss steps at 11, elite caps at one; charge preview includes future step',()=>{
 const boss=C.enemies.dark_lantern,elite=C.enemies.cinder_knight;
 for(const [turn,n] of [[1,0],[6,0],[7,1],[10,1],[11,2],[90,2]])assert.equal(enemyPressureFor(boss,turn),n);
 assert.equal(enemyPressureFor(elite,90),1);assert.equal(enemyPressureFor(C.enemies.lantern_rat,90),0);
 let b=controlled(['slash','guard'],'traveler','dark_lantern');b.turn=5;b=battleAction(b,{type:'END_TURN'});assert.equal(b.turn,6);assert.equal(b.enemyPressure,0);assert.equal(b.intent.kind,'charge');const predicted=b.intent.next.value;assert.equal(predicted,10);b=battleAction(b,{type:'END_TURN'});assert.equal(b.turn,7);assert.equal(b.intent.value,predicted);assert.equal(b.enemyPressure,1);
 let old=controlled(['slash','guard'],'traveler','dark_lantern',V19_RULE_VERSION);old.turn=5;old=battleAction(old,{type:'END_TURN'});assert.equal(old.intent.next.value,9);assert.equal(old.pressurePlan,undefined);
});
test('pressure at difficulty 10 remains bounded and phase preview matches actual first phase turn',()=>{
 const deck=[{cardId:'guard',uid:0,upgraded:false}];let b=beginBattle({ruleVersion:CURRENT_RULE_VERSION,enemyId:'a3_unlit_bellmaster',professionId:'traveler',difficulty:10,hp:20,deck,relics:[],seed:'d10'});b.turn=10;b.enemyHp=999;b.enemyMaxHp=999;b.intent={kind:'guard',value:0};b=battleAction(b,{type:'END_TURN'});assert.equal(b.enemyPressure,2);assert.ok(b.intent.value<=C.enemies[b.enemyId].intents[0].value+b.attackBonus+2);assert.equal(b.result,null);
 b=controlled(['slash','guard'],'traveler','dark_lantern');b.enemyHp=2;const max=b.enemyMaxHp=100;b.enemyHp=51;b=play(b,0);assert.equal(b.enemyPhase,2);const expected=structuredClone(b.phaseNextIntent);b=battleAction(b,{type:'END_TURN'});assert.deepEqual(b.intent,expected);
});
test('hot iron gains forge before damage and pierces at four without consuming forge',()=>{
 for(const [initialForge,expectedDamage] of [[0,2],[2,4],[3,7]]){let b=controlled(['hot_iron','slash'],'forger');b.enemyArmor=2;b.forge=initialForge;b=play(b,0);assert.equal(b.enemyHp,999-expectedDamage);assert.equal(b.forge,initialForge+1);}
 let old=controlled(['hot_iron','slash'],'forger','lantern_rat',V19_RULE_VERSION);old.enemyArmor=2;old.forge=3;old=play(old,0);assert.equal(old.enemyHp,995);assert.equal(old.forge,4);
});
test('actual doctor healing yields one setup per turn; full health, items and duplicate heal do not',()=>{
 let b=controlled(['field_wrap','warding_vial','slash'],'medic');b.relics=['medic_badge'];b.hp=20;b=play(b,0);assert.equal(b.prepare,1);assert.equal(b.shield,5);b=play(b,1);assert.equal(b.prepare,1);assert.equal(b.shield,10);
 b=controlled(['field_wrap','slash'],'medic');b.relics=['medic_badge'];b=play(b,0);assert.equal(b.prepare,0);assert.equal(b.shield,3);
 const item=Object.entries(C.items).find(([,d])=>d.effects.every(e=>e.kind==='heal'));assert.ok(item);b=controlled(['slash'],'medic');b.relics=['medic_badge'];b.hp=20;b.items=[item[0]];b=battleAction(b,{type:'ITEM',itemIndex:0});assert.equal(b.prepare,0);
 let old=controlled(['field_wrap','slash'],'medic','lantern_rat',V19_RULE_VERSION);old.relics=['medic_badge'];old.hp=20;old=play(old,0);assert.equal(old.prepare,0);
});
test('new doctor shield conversion also grants setup only on actual healing',()=>{
 let b=controlled(['medic_shield_suture','slash'],'medic');b.relics=['medic_badge'];b.hp=20;b.shield=4;b=play(b,0);assert.equal(b.hp,22);assert.equal(b.shield,2);assert.equal(b.prepare,1);
});
test('returned cheap card gains temporary discount; JSON roundtrip and next turn clear it',()=>{
 let b=controlled(['mail_return','slash'],'messenger');const target={cardId:'guard',uid:99,upgraded:false};b.deck.push(target);b.discard=[structuredClone(target)];b=play(b,0);assert.equal(b.cardDiscounts[99],1);assert.equal(b.hand.filter(e=>e.uid===99).length,1);b=JSON.parse(JSON.stringify(b));b=battleAction(b,{type:'END_TURN'});assert.deepEqual(b.cardDiscounts,{});
});
test('v20 private text and raster model expose pressure and signature mechanics',()=>{
 const run=createRun({ruleVersion:CURRENT_RULE_VERSION,runId:'ui20',owner:'2',guild:'1',professionId:'forger',seed:'ui20',now:0});run.phase='BATTLE';run.battle=controlled(['hot_iron','slash'],'forger','dark_lantern');const response=renderRogue(run);assert.equal(response.data.flags,64);assert.match(JSON.stringify(response),/第7轮起\+1/);assert.match(JSON.stringify(response),/锻值≥4时无视护甲/);const image=describeRogueImage(run);assert.match(JSON.stringify(image),/第7轮增压/);
});

test('phase-start charge preview across turn7 includes next-turn pressure and broken charge is reduced once',()=>{
 let b=controlled(['slash','guard'],'traveler','dark_lantern');b.turn=5;b.enemyMaxHp=100;b.enemyHp=51;b=play(b,0);const preview=structuredClone(b.phaseNextIntent);assert.equal(preview.kind,'charge');assert.equal(preview.next.value,11);b=battleAction(b,{type:'END_TURN'});assert.deepEqual(b.intent,preview);
 b=controlled(['slash','guard'],'traveler','dark_lantern');b.turn=5;b=battleAction(b,{type:'END_TURN'});b.chargeDamage=8;b.chargeBreakReady=true;b.intent.next.value=6;b=battleAction(b,{type:'END_TURN'});assert.equal(b.intent.value,6);
});
