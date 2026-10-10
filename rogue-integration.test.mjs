import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,runAction} from './rogue-run.mjs';
import {battleAction,legalCards} from './rogue-battle.mjs';
import {CATALOG} from './rogue-catalog.mjs';
import {scoreRun} from './rogue-economy.mjs';

function turnPlan(b){
 const candidates=[];
 const assess=(s,actions)=>{
  let end=s;
  if(!s.result&&s.turn===b.turn)end=battleAction(s,{type:'END_TURN'});
  const score=end.result==='WIN'?10000+end.hp:end.result?-10000:3*end.hp-end.enemyHp+2*end.enemyBurn;
  candidates.push({score,actions});
 };
 assess(b,[{type:'END_TURN'}]);
 for(const card of legalCards(b)){
  const first={type:'PLAY',uid:card.uid};const s=battleAction(b,first);
  assess(s,[first]);
  if(!s.result&&s.turn===b.turn)for(const other of legalCards(s)){
   const second={type:'PLAY',uid:other.uid};assess(battleAction(s,second),[first,second]);
  }
 }
 return candidates.sort((a,b)=>b.score-a.score)[0].actions;
}
function playFull(seed){
 let now=1,run=createRun({runId:`smoke-${seed}`,owner:'2',guild:'1',mode:'challenge',seed,startDay:'2026-10-10',rewardEligible:true,now});
 let steps=0;const scenes=[];
 while(run.phase!=='RESULT'&&steps++<300){
  const before=JSON.stringify(run);let action;
  if(run.phase==='ROOM'){
   if(run.room.type==='blessing')action={type:'BLESSING',relicId:run.room.candidates.find(x=>CATALOG.relics[x].trigger==='burn_bonus')??run.room.candidates[1]};
   if(run.room.type==='camp')action=run.hp<24?{type:'CAMP',choice:'heal'}:{type:'CAMP',choice:'upgrade',uid:run.deck.find(x=>!x.upgraded).uid};
   if(run.room.type==='shop')action={type:'SHOP',choice:'leave'};
   if(run.room.type==='event')action=run.hp<30&&run.embers>=12?{type:'EVENT',choice:'heal'}:{type:'EVENT',choice:'leave'};
  }else if(run.phase==='ROUTE')action={type:'ROUTE',choice:run.slot===2?'camp':run.act===1?run.room.choices[0]:run.act===2?'shop':'event'};
  else if(run.phase==='BATTLE')action=turnPlan(run.battle)[0];
  else if(run.phase==='REWARD'){
   const stage=run.reward.queue[run.reward.index];
   action={type:'REWARD',choice:stage.candidates[0]??null};
  }else if(run.phase==='CHECKPOINT')action={type:'CONTINUE'};
  assert.ok(action,`phase ${run.phase}`);
  const restored=JSON.parse(before);const next=runAction(run,action,++now);
  assert.equal(JSON.stringify(run),before,'action cannot mutate previous save');
  assert.deepEqual(next,runAction(restored,action,now),'JSON restoration must preserve random and transient state');
  assert.ok(next.embers>=0);assert.ok(next.completed>=run.completed);
  if(next.completed>run.completed)scenes.push({act:run.act,slot:run.slot,hp:next.hp});
  run=next;
 }
 assert.ok(steps<300,'bounded run action loop');
 return {run,scenes,steps};
}
test('real three-act battle actions and restored snapshots reach a terminal result without near-death fixtures',()=>{
 const samples=Array.from({length:8},(_,seed)=>playFull(`runtime-smoke-${seed}`));
 for(const {run} of samples){
  assert.equal(run.phase,'RESULT');assert.ok(['CLEAR','DEFEAT'].includes(run.result.type));
  assert.doesNotThrow(()=>scoreRun(run));
 }
 const clears=samples.filter(x=>x.run.result.type==='CLEAR');
 assert.ok(clears.length>0,'actual combat must be able to clear all 3 chapters');
 for(const {run,scenes} of clears){assert.equal(run.completed,9);assert.equal(run.completedActs,3);assert.equal(scenes.length,9);assert.equal(scoreRun(run).baseCoins,30);}
});
