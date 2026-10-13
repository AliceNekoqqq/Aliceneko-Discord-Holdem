import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_V21 as C} from './rogue-content-v21.mjs';
import {CATALOG_V20 as OLD} from './rogue-content-v20.mjs';
import {beginBattle,battleAction,legalCards} from './rogue-battle.mjs';
import {createRun,runAction,V21_RULE_VERSION as CURRENT_RULE_VERSION,V20_RULE_VERSION} from './rogue-run.mjs';
import {hasUsefulUpgrade} from './rogue-upgrade-validity.mjs';
import {renderRogue,rogueUidEligible} from './rogue-ui.mjs';
import {describeRogueImage,renderRogueImage} from './rogue-image.mjs';
import {writeFile} from 'node:fs/promises';
const ids=['riposte_stance','measured_thrust','ash_wall','bellwatch','cask_guard','gatebreak'];
const entity=(cardId,uid,upgraded=false)=>({cardId,uid,upgraded});
function setup(names,p='traveler',version=CURRENT_RULE_VERSION){const deck=names.map((id,i)=>entity(id,i));const b=beginBattle({ruleVersion:version,professionId:p,enemyId:'lantern_rat',deck,relics:[],hp:30,seed:'v21'});Object.assign(b,{hand:structuredClone(deck.slice(0,5)),draw:structuredClone(deck.slice(5)),discard:[],exhaust:[],energy:5,plays:0,enemyHp:999,enemyMaxHp:999,enemyArmor:0,enemyShield:0,result:null,intent:{kind:'guard',value:0}});return b;}
const play=(b,uid,targetUid)=>battleAction(b,{type:'PLAY',uid,...(targetUid==null?{}:{targetUid})});
test('redesigned catalog has no exact functional duplicates and only Wound remains without a useful upgrade',()=>{
 const seen=new Map();for(const [id,c] of Object.entries(C.cards)){const key=JSON.stringify([c.cost,c.selfCost,c.exhaust,c.replayable,c.effects,c.upgrade?.cost,c.upgrade?.effects]);assert.equal(seen.has(key),false,`${id} duplicates ${seen.get(key)}`);seen.set(key,id);}assert.deepEqual(Object.keys(C.cards).filter(id=>!hasUsefulUpgrade(C.cards[id])),['v07_wound']);assert.equal(Object.keys(C.cards).length,124);for(const id of ids){assert.equal(C.cards[id].rewardAct,OLD.cards[id].rewardAct);assert.equal(C.cards[id].professionOnly,OLD.cards[id].professionOnly);}assert.deepEqual(OLD.cards.gatebreak.upgrade.effects,OLD.cards.gatebreak.effects);
});
test('riposte shield is lower without an attack; counter occurs once even against multi-hit',()=>{
 let b=setup(['riposte_stance','slash']);b=play(b,0);assert.equal(b.shield,3);b.intent={kind:'attack',value:1,hits:3};b=battleAction(b,{type:'END_TURN'});assert.equal(b.enemyHp,996);assert.equal(b.hp,30);
});
test('measured thrust checks two preparation before damage, consumes it once and ignores armor',()=>{
 for(const [upgraded,prep,expected] of [[false,0,4],[false,1,5],[false,2,9],[true,2,11]]){let b=setup(['measured_thrust','slash']);b.hand[0].upgraded=upgraded;b.prepare=prep;b.prepareUntil=2;b.enemyArmor=9;b=play(b,0);assert.equal(b.enemyHp,999-expected);assert.equal(b.prepare,0);}
});
test('ash wall is situational: no burn gives small shield, burning gains cleansing and conversion',()=>{
 let b=setup(['ash_wall','slash']);b=play(b,0);assert.equal(b.shield,3);
 b=setup(['ash_wall','slash']);b.burn=3;b=play(b,0);assert.equal(b.burn,1);assert.equal(b.shield,7);
});
test('cask guard consumes fire for shield and no longer applies free fire',()=>{
 let b=setup(['cask_guard','slash'],'brewer');b.enemyBurn=3;b=play(b,0);assert.equal(b.enemyBurn,1);assert.equal(b.shield,6);assert.equal(C.cards.cask_guard.replayable,false);assert.deepEqual(OLD.cards.cask_guard.effects,[{kind:'block',value:5},{kind:'burn',value:1}]);
});
test('gatebreak spends actual shield at double conversion, has meaningful upgrade and no free echo',()=>{
 for(const [upgraded,shield,damage,left] of [[false,0,2,0],[false,5,10,1],[true,7,13,2]]){let b=setup(['gatebreak','slash']);b.hand[0].upgraded=upgraded;b.shield=shield;b=play(b,0);assert.equal(b.enemyHp,999-damage);assert.equal(b.shield,left);}
 assert.equal(C.cards.gatebreak.replayable,false);assert.equal(hasUsefulUpgrade(C.cards.gatebreak),true);
 let old=setup(['gatebreak','slash'],'traveler',V20_RULE_VERSION);old.shield=5;old=play(old,0);assert.equal(old.enemyHp,992);assert.equal(old.shield,0);
});
test('retained discount follows the actual entity, is inactive now, survives JSON, expires after next turn',()=>{
 let b=setup(['bellwatch','guard','slash','pierce','bandage','shared_break']);b=play(b,0,1);assert.equal(b.cardDiscounts[1],undefined);assert.equal(b.pendingRetainDiscounts[1],1);b=JSON.parse(JSON.stringify(b));b=battleAction(b,{type:'END_TURN'});assert.equal(b.hand[0].uid,1);assert.equal(b.cardDiscounts[1],1);assert.equal(b.hand.length,5);assert.deepEqual(b.pendingRetainDiscounts,{});b=play(b,1);assert.equal(b.energy,3);b=battleAction(b,{type:'END_TURN'});assert.deepEqual(b.cardDiscounts,{});
});
test('changing retained entity or playing the target removes the scheduled discount; duplicate coupons do not stack',()=>{
 let b=setup(['bellwatch','guard','folded_note','slash','pierce']);b=play(b,0,1);b=play(b,2,3);b=battleAction(b,{type:'END_TURN'});assert.equal(b.hand[0].uid,3);assert.deepEqual(b.cardDiscounts,{});
 b=setup(['bellwatch','guard','slash']);b=play(b,0,1);b=play(b,1);assert.equal(b.pendingRetainDiscounts[1],undefined);b=battleAction(b,{type:'END_TURN'});assert.deepEqual(b.cardDiscounts,{});
 b=setup(['bellwatch','guard','bellwatch','slash']);b=play(b,0,1);b=play(b,2,1);assert.equal(b.pendingRetainDiscounts[1],1);b=battleAction(b,{type:'END_TURN'});assert.equal(b.cardDiscounts[1],1);
});
test('optional no-target bellwatch only gives block and cannot schedule a coupon',()=>{let b=setup(['bellwatch','slash']);b=play(b,0);assert.equal(b.shield,3);assert.equal(b.retainedUid,null);assert.deepEqual(b.pendingRetainDiscounts,{});});
test('current upgrade menus and run accept redesigned gatebreak while frozen v20 rejects its old no-op',()=>{
 for(const rv of [CURRENT_RULE_VERSION,V20_RULE_VERSION]){const r=createRun({ruleVersion:rv,runId:'up21',owner:'2',guild:'1',professionId:'traveler',seed:'up',now:0});r.deck.push(entity('gatebreak',99));r.nextUid=100;r.phase='ROOM';r.room={type:'camp',healAmount:9};const valid=rv===CURRENT_RULE_VERSION;assert.equal(rogueUidEligible(r,'camp','upgrade',99),valid);if(valid)assert.equal(runAction(r,{type:'CAMP',choice:'upgrade',uid:99},0).deck.find(c=>c.uid===99).upgraded,true);else assert.throws(()=>runAction(r,{type:'CAMP',choice:'upgrade',uid:99},0),e=>e.code==='NO_UPGRADE');}
});
test('v21 private text and image show retained actual cost and two-for-one shield conversion',async()=>{
 const r=createRun({ruleVersion:CURRENT_RULE_VERSION,runId:'ui21',owner:'2',guild:'1',professionId:'traveler',seed:'ui21',now:0});r.phase='BATTLE';r.battle=setup(['bellwatch','gatebreak','measured_thrust','guard','slash']);r.battle=play(r.battle,0,1);r.battle=battleAction(r.battle,{type:'END_TURN'});const response=renderRogue(r);assert.equal(response.data.flags,64);assert.match(JSON.stringify(response),/实际耗盾×2/);assert.equal(describeRogueImage(r).cards.find(c=>c.id===1).cost,0);const png=await renderRogueImage(r);assert.ok(png.size>1000);await writeFile('/tmp/v21-battle-preview.png',new Uint8Array(await png.arrayBuffer()));
});
