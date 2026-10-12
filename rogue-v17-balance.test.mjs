import test from 'node:test';
import assert from 'node:assert/strict';
import * as old from './rogue-battle-v16.mjs';
import * as next from './rogue-battle-v17.mjs';
import { CATALOG_V16 } from './rogue-content-v16.mjs';
import { CATALOG_V17 } from './rogue-content-v17.mjs';
import { getDifficultyRules } from './rogue-difficulty-v17.mjs';
import { createRun, runAction, CURRENT_RULE_VERSION, V16_RULE_VERSION } from './rogue-run.mjs';
import { beginBattle } from './rogue-battle.mjs';
import { dailySeedGroup } from './rogue-economy.mjs';
import { renderRogue, renderRogueReading, renderRogueSettings } from './rogue-ui.mjs';

const cards = ids => ids.map((cardId,uid)=>({cardId,uid,upgraded:false}));
function controlled(ids, relics=[]){
 const deck=cards(ids);
 const b=next.beginBattle({enemyId:'lantern_rat',deck,relics,hp:30,seed:'balance'});
 Object.assign(b,{hand:structuredClone(deck),draw:[],discard:[],energy:3,plays:0,enemyHp:999,enemyMaxHp:999,enemyArmor:0,enemyShield:0,intent:{kind:'guard',value:0}});
 return b;
}

test('burn relic budgets persist across rounds and JSON restoration; each still triggers once per round',()=>{
 let b=controlled(['kindle','kindle','guard','guard','guard'],['burn_bonus','a2_prism_ember','a3_cinder_toll']);
 const base=CATALOG_V17.cards.kindle.effects.find(e=>e.kind==='burn').value;
 for(let round=0;round<4;round++){
  b.enemyBurn=0;b.intent={kind:'guard',value:0};
  const burns=b.hand.filter(e=>e.cardId==='kindle');assert.equal(burns.length,2);
  b=next.battleAction(b,{type:'PLAY',uid:burns[0].uid});
  assert.equal(b.enemyBurn,base+(round<3?3:0));
  b=next.battleAction(b,{type:'PLAY',uid:burns[1].uid});
  assert.equal(b.enemyBurn,base*2+(round<3?3:0));
  b=next.battleAction(b,{type:'END_TURN'});
  b=JSON.parse(JSON.stringify(b));
 }
 for(const id of b.relics)assert.equal(b.relicTriggerCounts[id],3);
 assert.equal(CATALOG_V16.relics.a3_cinder_toll.value,2);
 assert.equal(CATALOG_V16.relics.cinder_scoop.value,2);
 assert.equal(CATALOG_V16.relics.burn_bonus.maxTriggersPerBattle,undefined);
});

test('blocking fire relics fire once during multi-hit attacks and stop after three activations',()=>{
 let b=controlled(['guard','guard','guard','guard','guard'],['shelter_ember','cinder_scoop']);
 for(let round=0;round<4;round++){
  b.shield=30;b.enemyBurn=0;b.intent={kind:'attack',value:1,hits:3};
  b=next.battleAction(b,{type:'END_TURN'});
  assert.equal(b.enemyBurn,round<3?1:0); // two applied layers, one decays
  assert.equal(b.hp,30);
 }
 assert.deepEqual(b.relicTriggerCounts,{shelter_ember:3,cinder_scoop:3});
});

test('new combat can continue after round 12 while old saved combat retains its old cutoff',()=>{
 const options={enemyId:'lantern_rat',deck:cards(['guard','guard','guard','guard','guard']),relics:[],hp:30,seed:'long'};
 let b=next.beginBattle(options),legacy=old.beginBattle(options);
 for(let i=0;i<20;i++){
  b.intent={kind:'guard',value:0};b=next.battleAction(b,{type:'END_TURN'});
  if(!legacy.result){legacy.intent={kind:'guard',value:0};legacy=old.battleAction(legacy,{type:'END_TURN'});}
 }
 assert.equal(b.turn,21);assert.equal(b.result,null);assert.equal(legacy.result,'LOST_LIGHT');
 // An exhausted deck returns control after at most one automatic empty round.
 Object.assign(b,{hand:[],draw:[],discard:[],exhaust:structuredClone(b.deck),intent:{kind:'guard',value:0}});
 const turn=b.turn;b=next.battleAction(b,{type:'END_TURN'});
 assert.ok(b.turn<=turn+2);assert.equal(b.result,null);
});

test('healing is reduced, still exhausts, and camp recovery remains meaningful',()=>{
 for(const [id,c] of Object.entries(CATALOG_V17.cards)){
  const heal=c.effects.find(e=>e.kind==='heal');if(!heal)continue;
  if(['field_wrap','warding_vial'].includes(id)){assert.deepEqual(c,CATALOG_V16.cards[id]);continue;}
  assert.equal(heal.value,CATALOG_V16.cards[id].effects.find(e=>e.kind==='heal').value-1);
  assert.equal(c.exhaust,true);
 }
 let b=controlled(['bandage','guard','guard','guard','guard']);b.hp=10;
 b=next.battleAction(b,{type:'PLAY',uid:0});assert.equal(b.hp,13);assert.ok(b.exhaust.some(e=>e.uid===0));
 const run=createRun({runId:'camp17',guild:'1',owner:'2',professionId:'traveler',ruleVersion:CURRENT_RULE_VERSION,mode:'normal',now:0});
 Object.assign(run,{hp:10,phase:'ROOM',room:{type:'camp',healAmount:run.campHealAmount}});
 assert.equal(runAction(run,{type:'CAMP',choice:'heal'},1).hp,19);
 assert.equal(getDifficultyRules(4).campHealAmount,7);
});

test('version routing, daily grouping, guide and remaining relic counters recognize v17',()=>{
 assert.equal(CURRENT_RULE_VERSION,'lantern-rules-v0.17');
 const options={enemyId:'lantern_rat',deck:cards(['guard','guard','guard','guard','guard']),relics:[],hp:30,seed:'routing'};
 const current=beginBattle({...options,ruleVersion:CURRENT_RULE_VERSION});
 const legacy=beginBattle({...options,ruleVersion:V16_RULE_VERSION});
 assert.equal(current.enemyMaxHp,24);assert.equal(legacy.enemyMaxHp,22);
 assert.equal(current.intent.value,legacy.intent.value+1);
 assert.notEqual(dailySeedGroup('1','2026-10-13',CURRENT_RULE_VERSION,0),dailySeedGroup('1','2026-10-13',V16_RULE_VERSION,0));
 const run=createRun({runId:'ui17',guild:'1',owner:'2',professionId:'traveler',ruleVersion:CURRENT_RULE_VERSION,mode:'normal',now:0});
 Object.assign(run,{phase:'BATTLE',battle:controlled(['guard','guard','guard','guard','guard'],['cinder_scoop'])});
 assert.match(JSON.stringify(renderRogue(run)),/余烬小铲3次/);
 const guide=JSON.stringify(renderRogueReading('guide',undefined,{run}));
 assert.match(guide,/战斗没有回合数上限/);assert.doesNotMatch(guide,/最多12轮/);
 assert.match(JSON.stringify(renderRogueSettings({professionId:'traveler'})),/敌人生命提高8%/);
});
