import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,runAction,V08_RULE_VERSION as CURRENT_RULE_VERSION,V07_RULE_VERSION} from './rogue-run.mjs';
import {CATALOG_V08 as C,EVENTS} from './rogue-content-v08.mjs';
const fresh=(extra={})=>createRun({ruleVersion:CURRENT_RULE_VERSION,runId:'v08',owner:'1',guild:'1',seed:'persist-pacts',now:0,...extra});
const blessing=r=>runAction(r,{type:'BLESSING',relicId:null},1);
const event=(id)=>{let r=blessing(fresh());r.phase='ROOM';r.room={type:'event',...structuredClone(EVENTS.find(x=>x.eventId===id)),relicCandidate:C.eliteRelics.find(id=>!r.relics.includes(id))};return r;};
const act=(r,a)=>runAction(JSON.parse(JSON.stringify(r)),a,r.lastActionAt+1);
const enterFight=r=>act(r,{type:'ROUTE',choice:r.room.nodes.find(n=>n.type==='normal').id});
const reward=()=>{let r=blessing(fresh());r.phase='REWARD';r.room={type:'battle',battleType:'normal',enemyId:C.acts[0].normalPool[0]};r.reward={source:'normal',queue:[{kind:'card',candidates:['trail_cut','guard']},{kind:'relic',candidates:['cinder_scoop']},{kind:'item',candidates:['bright_tea_item']}],index:0,completed:false,selections:{card:'trail_cut',relic:'cinder_scoop',item:{id:'bright_tea_item',replaceIndex:null}}};return r;};
test('one claim adds the visible bundle and advances the station, while full slots never silently replace',()=>{
 let r=reward(),n=act(r,{type:'REWARD_CLAIM'});assert.equal(n.completed,1);assert.equal(n.deck.length,r.deck.length+1);assert.ok(n.relics.includes('cinder_scoop'));assert.deepEqual(n.inventory,['bright_tea_item']);assert.equal(n.phase,'ROUTE');assert.throws(()=>act(n,{type:'REWARD_CLAIM'}));
 r=reward();r.inventory=['cold_ash_item','quench_salt_item'];r.reward.selections.item=null;n=act(r,{type:'REWARD_CLAIM'});assert.deepEqual(n.inventory,r.inventory);
});
test('reward alternatives are bounded candidates; malformed replacement and out-of-phase action leave original unchanged',()=>{
 const r=reward(),old=JSON.stringify(r);assert.throws(()=>act(r,{type:'REWARD_SELECT',kind:'card',choice:'v07_wound'}));assert.equal(JSON.stringify(r),old);
 let n=act(r,{type:'REWARD_SELECT',kind:'card',choice:'guard'});assert.equal(n.completed,0);assert.equal(n.reward.selections.card,'guard');n=act(n,{type:'REWARD_SKIP'});assert.equal(n.deck.length,r.deck.length);assert.equal(n.relics.length,r.relics.length);assert.deepEqual(n.inventory,[]);
 const full=reward();full.inventory=['cold_ash_item','quench_salt_item'];assert.throws(()=>act(full,{type:'REWARD_SELECT',kind:'item',choice:'bright_tea_item',replaceIndex:2}));n=act(full,{type:'REWARD_SELECT',kind:'item',choice:'bright_tea_item',replaceIndex:1});n=act(n,{type:'REWARD_CLAIM'});assert.deepEqual(n.inventory,['cold_ash_item','bright_tea_item']);
});
test('borrowed embers persist after restart and strengthen exactly the next two battles',()=>{
 let r=event('cinder_loan');r=act(r,{type:'EVENT',choice:'pact'});assert.equal(r.embers,12);assert.equal(r.story.debtBattles,2);r=enterFight(r);assert.equal(r.battle.extraAttackBonus,1);assert.equal(r.story.debtBattles,1);
 // Use separate saved route fixtures to inspect two later encounter starts without modifying battle health.
 let later=blessing(fresh());later.story=structuredClone(r.story);later=enterFight(later);assert.equal(later.battle.extraAttackBonus,1);assert.equal(later.story.debtBattles,0);
 let third=blessing(fresh());third.story=structuredClone(later.story);third=enterFight(third);assert.equal(third.battle.extraAttackBonus,0);
});
test('sacrificed life grants the disclosed relic and penalizes later camps without touching coins',()=>{
 let r=event('sealed_relic');const relic=r.room.relicCandidate;r=act(r,{type:'EVENT',choice:'pact'});assert.equal(r.hp,26);assert.ok(r.relics.includes(relic));assert.equal(r.story.campPenalty,2);
 r.slot=3;r.completed=2;r.phase='ROUTE';r.room={type:'route',choices:r.mapPlan[0].nodes[2].map(n=>n.id),nodes:r.mapPlan[0].nodes[2]};r=act(r,{type:'ROUTE',choice:r.room.nodes.find(n=>n.type==='camp').id});assert.equal(r.room.healAmount,Math.max(0,7+r.relics.reduce((v,id)=>v+(C.relics[id].trigger==='camp_heal'?C.relics[id].value:0),0)));
 const poor=event('sealed_relic');poor.hp=4;assert.throws(()=>act(poor,{type:'EVENT',choice:'pact'}));
});
test('Boss bargain requires local embers, persists the act and affects only that Boss',()=>{
 const poor=event('boss_bargain');assert.throws(()=>act(poor,{type:'EVENT',choice:'pact'}));
 let r=event('boss_bargain');r.embers=12;r=act(r,{type:'EVENT',choice:'pact'});assert.equal(r.embers,0);assert.deepEqual(r.story.weakenedBossActs,[1]);
 r.phase='ROOM';r.slot=4;r.completed=3;r.room={type:'camp',healAmount:9};r=act(r,{type:'CAMP',choice:'leave'});assert.equal(r.battle.bossHpMultiplier,.85);assert.equal(r.battle.enemyMaxHp,Math.ceil(C.enemies[r.battle.enemyId].hp*.85));
 let again=event('boss_bargain');again.embers=20;again.story.weakenedBossActs=[1];assert.throws(()=>act(again,{type:'EVENT',choice:'pact'}));
});
test('v07 snapshots retain their original rules, queue rewards and legacy starter effects',()=>{
 let r=createRun({ruleVersion:V07_RULE_VERSION,runId:'old',owner:'1',guild:'1',professionId:'tamer',now:0});assert.equal(r.ruleVersion,V07_RULE_VERSION);assert.equal(r.story,undefined);assert.ok(!('selections' in (r.reward??{})));r=act(r,{type:'BLESSING',relicId:null});assert.equal(r.phase,'ROUTE');assert.throws(()=>act(r,{type:'REWARD_CLAIM'}));
});
