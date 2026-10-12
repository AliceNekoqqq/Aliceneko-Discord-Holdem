import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, CURRENT_RULE_VERSION, V15_RULE_VERSION, SUPPORTED_RULE_VERSIONS } from './rogue-run.mjs';
import { beginBattle } from './rogue-battle.mjs';
import { CATALOG_V16 } from './rogue-content-v16.mjs';
import { getCatalog } from './rogue-content.mjs';
import { scoreRun, dailySeedGroup } from './rogue-economy.mjs';

test('v16 is the current ruleset, v15 remains selectable for saved runs, and catalogs stay isolated',()=>{
 assert.equal(CURRENT_RULE_VERSION,'lantern-rules-v0.16');
 assert.equal(V15_RULE_VERSION,'lantern-rules-v0.15');
 assert(SUPPORTED_RULE_VERSIONS.includes(CURRENT_RULE_VERSION));
 assert(SUPPORTED_RULE_VERSIONS.includes(V15_RULE_VERSION));
 const old=createRun({runId:'old-v15',owner:'2',guild:'1',mode:'normal',seed:'same',now:0,ruleVersion:V15_RULE_VERSION,professionId:'traveler'});
 const fresh=createRun({runId:'fresh-v16',owner:'2',guild:'1',mode:'normal',seed:'same',now:0,ruleVersion:CURRENT_RULE_VERSION,professionId:'traveler'});
 assert.equal(old.catalogVersion,'0.15');assert.equal(fresh.catalogVersion,'0.16');
 assert.equal(getCatalog('0.15').version,'0.15');assert.equal(getCatalog(CURRENT_RULE_VERSION),CATALOG_V16);
 for(const [run,expected] of [[old,V15_RULE_VERSION],[fresh,CURRENT_RULE_VERSION]]){
  const battle=beginBattle({ruleVersion:run.ruleVersion,enemyId:'lantern_rat',deck:run.deck,relics:[],hp:run.hp,seed:'dispatch'});
  assert.equal(battle.ruleVersion,expected);
 }
});

test('v16 daily challenge seed and scoring use the fifteen-station format',()=>{
 const seed=dailySeedGroup('1','2026-10-12',CURRENT_RULE_VERSION,6);
 assert.match(seed,/difficulty-6\/15stations-3energy-5draw-v16-echo-choice$/);
 assert.notEqual(seed,dailySeedGroup('1','2026-10-12',V15_RULE_VERSION,6));
 assert.deepEqual(scoreRun({ruleVersion:CURRENT_RULE_VERSION,result:{type:'CLEAR'},completedActs:3,completed:15,eliteWins:6,hp:28,mode:'challenge'}),{score:4018,baseCoins:30,ranked:true});
});
