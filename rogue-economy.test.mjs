import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreRun,rewardAmount,dailySeedGroup} from './rogue-economy.mjs';
const run=(type,completedActs,completed,hp=0,eliteWins=0)=>({result:{type},completedActs,completed,hp,eliteWins,mode:'challenge',rewardEligible:true});
test('completed acts pay cumulative 8/18/30, no ember or speed score',()=>{
 for(const [acts,coins] of [[0,0],[1,8],[2,18],[3,30]]){
  const r=run(acts===3?'CLEAR':'DEFEAT',acts,acts*3,25);
  assert.equal(scoreRun(r).baseCoins,coins);
  assert.deepEqual(scoreRun(r),scoreRun({...r,embers:999999,totalTurns:1,actionProxy:1}));
 }
});
test('clear dominates all partial progression and elite wins add a bounded bonus',()=>{
 const clear=scoreRun(run('CLEAR',3,9,1)).score;
 assert.ok(clear>scoreRun(run('DEFEAT',2,8,30,3)).score);
 assert.equal(scoreRun(run('CLEAR',3,9,1,1)).score-clear,40);
});
test('lost light remaining hp is not survival bonus; abandoned/expired have no coins or rank',()=>{
 assert.equal(scoreRun(run('DEFEAT',2,8,30)).score,2400);
 for(const type of ['ABANDON','EXPIRED'])assert.deepEqual(scoreRun(run(type,2,8,30)),{score:0,baseCoins:0,ranked:false});
});
test('practice zero, 60 subcap and existing total ceiling both clamp actual credits',()=>{
 const clear=run('CLEAR',3,9,20);
 assert.equal(rewardAmount({...clear,rewardEligible:false}),0);
 assert.equal(rewardAmount(clear,{totalEarned:147}),3);
 assert.equal(rewardAmount(clear,{rogueEarned:55}),5);
 assert.equal(rewardAmount(clear,{totalEarned:150}),0);
 assert.equal(rewardAmount(clear,{rogueEarned:80}),0);
});
test('daily board groups server, day and runtime rules with identical starting config',()=>{
 const a=dailySeedGroup('1','2026-10-10','v4');
 assert.notEqual(a,dailySeedGroup('2','2026-10-10','v4'));
 assert.notEqual(a,dailySeedGroup('1','2026-10-11','v4'));
 assert.notEqual(a,dailySeedGroup('1','2026-10-10','v5'));
});
