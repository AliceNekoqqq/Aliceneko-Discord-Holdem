import test from 'node:test';
import assert from 'node:assert/strict';
import {beginBattle,battleAction} from './rogue-battle-v10.mjs';
import {createRun,runAction,CURRENT_RULE_VERSION} from './rogue-run-v10.mjs';
import {CATALOG_V10 as C} from './rogue-content-v10.mjs';
import {mergeRunMetrics} from './rogue-effect-metrics.mjs';
const battle=hp=>beginBattle({professionId:'medic',enemyId:C.acts[0].bossPool[0],hp,seed:'metric',relics:[],deck:Array.from({length:8},(_,uid)=>({uid,cardId:'field_wrap',upgraded:false}))});
test('actual healing and overheal counters use resolution, and resource投入 ignores later armor mitigation',()=>{
 let b=battle(29);b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.effectMetrics.healing,1);assert.equal(b.effectMetrics.overheal,2);
 b=battle(30);b.hand[0].cardId='slash';b.prepare=3;b.mark=2;b.enemyArmor=100;const hp=b.enemyHp;
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.enemyHp,hp);assert.equal(b.effectMetrics.prepareConsumed,3);assert.equal(b.effectMetrics.markConsumed,2);
});
test('boss final action survives clearing battle and does not reapply cumulative upgraded plays',()=>{
 let r=createRun({runId:'metrics',owner:'1',guild:'1',seed:'metric',ruleVersion:CURRENT_RULE_VERSION,now:0});
 r.phase='BATTLE';r.act=1;r.slot=5;r.completed=4;r.room={type:'battle',battleType:'boss',rewardGranted:false};r.battle=battle(30);
 r.battle.enemyHp=1;r.battle.enemyArmor=0;r.battle.enemyShield=0;r.battle.hand[0].cardId='slash';r.battle.hand[0].upgraded=true;
 r.battle.effectMetrics.upgradedCardsPlayed=4;r.effectMetrics={upgradedCardsPlayed:4};
 const n=mergeRunMetrics(r,runAction(r,{type:'PLAY',uid:r.battle.hand[0].uid},1),{type:'PLAY'});
 assert.equal(n.phase,'CHECKPOINT');assert.equal(n.battle,null);assert.equal(n.effectMetrics.upgradedCardsPlayed,5);assert.equal(Object.hasOwn(n,'settledEffectMetrics'),false);
 const dup=mergeRunMetrics(n,n,{type:'PLAY'});assert.equal(dup.effectMetrics.upgradedCardsPlayed,5);
});
