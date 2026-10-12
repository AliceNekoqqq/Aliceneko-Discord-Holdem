import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as R18 from '../rogue-run-v18.mjs';
import * as R17 from '../rogue-run-v17.mjs';
import * as B18 from '../rogue-battle-v18.mjs';
import * as B17 from '../rogue-battle-v17.mjs';
import { CATALOG_V18 as C18 } from '../rogue-content-v18.mjs';
import { CATALOG_V17 as C17 } from '../rogue-content-v17.mjs';
import { cardAllowed } from '../rogue-card-access-v18.mjs';
import { NEW_TARGETS, supportTargetAllowed } from '../rogue-card-effects-v18.mjs';
const professions=Object.keys(C18.professions), fresh=Object.keys(C18.cards).filter(id=>!C17.cards[id]);
if(fresh.length!==28||fresh.filter(id=>C18.cards[id].professionOnly).length!==16)throw Error('Unexpected v18 card pool size');
const exclusive=Object.values(C18.cards).filter(d=>d.professionOnly);if(exclusive.length!==48||Object.keys(C18.cards).length!==124||professions.some(p=>exclusive.filter(d=>d.professionOnly===p).length!==6))throw Error('Unexpected profession ownership catalog');
function score(run){const b=run.battle;if(run.phase==='RESULT')return run.result.type==='CLEAR'?1000:-1000+run.completed*30;if(!b)return 500;return 3*b.hp-2*b.enemyHp+b.shield*.8+b.enemyBurn*2+b.forge*2+b.petHp*.8+b.prepare*.4+b.mark*.4+b.energy*.1+b.items.length*.2;}
function legalActions(run,R,B,C){const b=run.battle, actions=[...B.legalItems(b).map(x=>({type:'ITEM',itemIndex:x.itemIndex})),{type:'END_TURN'}];
 for(const entry of B.legalCards(b)){const base=C.cards[entry.cardId],def=entry.upgraded?{...base,...base.upgrade}:base, targeted=def.effects.some(e=>['sift','exhaust_other','retain',...NEW_TARGETS].includes(e.kind));
  const targets=targeted?b.hand.filter(t=>t.uid!==entry.uid&&(!def.effects.some(e=>NEW_TARGETS.has(e.kind))||supportTargetAllowed(b,def,t,C))):[null];
  for(const t of targets)actions.push({type:'PLAY',uid:entry.uid,...(t?{targetUid:t.uid}:{})});
 }
 actions.push(...B.legalEchoes(b).map(x=>({type:'ECHO',uid:x.uid})));return actions;}
function battleChoice(run,R,B,C){let best=null,bestScore=-Infinity;for(const a of legalActions(run,R,B,C)){try{let n=R.runAction(run,a,0),v=score(n);if(n.phase==='BATTLE'&&n.battle.turn===run.battle.turn){for(const z of legalActions(n,R,B,C)){try{v=Math.max(v,score(R.runAction(n,z,0)));}catch{}}}if(v>bestScore){bestScore=v;best=a;}}catch{}}return best??{type:'END_TURN'};}
function routeChoice(run){const ns=run.room.nodes.filter(n=>run.room.choices.includes(n.id)),find=t=>ns.find(n=>n.type===t);return run.hp<=24&&find('camp')?find('camp'):ns.find(n=>n.type==='normal'&&!n.dangerous)??find('normal')??find('camp')??find('event')??find('elite')??ns[0];}
function assertPools(run,p){const check=(ids,where)=>{for(const id of ids??[])if(C18.cards[id]&&!cardAllowed(C18,id,p))throw Error(`illegal card ${id} surfaced for ${p} in ${where}`);};check(run.deck?.map(x=>x.cardId),'deck');check(run.room?.candidates,'room candidates');check(run.room?.stock,'shop stock');check(run.reward?.queue?.flatMap(x=>x.kind==='card'?x.candidates:[]),'reward candidates');}
function sim(p,seedIndex,version){const v18=version===18,R=v18?R18:R17,B=v18?B18:B17,C=v18?C18:C17,rv=v18?'lantern-rules-v0.18':'lantern-rules-v0.17',seed=`whole-${p}-${seedIndex}`;
 let run=R.createRun({runId:`v${version}-balance-audit`,owner:'audit',guild:'audit',ruleVersion:rv,professionId:p,difficulty:0,seed,now:0}),steps=0,active=null;const combats=[],gains={},uses={},camps=[];
 while(run.phase!=='RESULT'&&steps<600){steps++;if(v18)assertPools(run,p);let a;
  if(run.phase==='BATTLE'){if(!active)active={enemyId:run.battle.enemyId,startHp:run.battle.hp,startEnemyHp:run.battle.enemyHp,startTurn:run.battle.turn};a=battleChoice(run,R,B,C);if(a.type==='PLAY'){const x=run.battle.deck.find(e=>e.uid===a.uid);if(x){uses[x.cardId]=(uses[x.cardId]??0)+1;}}}
  else if(run.phase==='ROUTE')a={type:'ROUTE',choice:routeChoice(run).id};else if(run.phase==='REWARD')a={type:'REWARD_CLAIM'};
  else if(run.phase==='ROOM'&&run.room.type==='camp'){a={type:'CAMP',choice:run.hp<=24?'heal':'leave'};const hp=run.hp;run=R.runAction(run,a,0);camps.push({choice:a.choice,hpRestored:run.hp-hp});run=JSON.parse(JSON.stringify(run));continue;}
  else if(run.phase==='ROOM'&&run.room.type==='blessing')a={type:'BLESSING',relicId:run.room.candidates[0]??null};
  else if(run.phase==='ROOM'&&run.room.type==='event'){const can=run.room.choices.includes('gain')?'gain':'leave';a={type:'EVENT',choice:can};if(['card','trade'].includes(can)&&run.room.candidates?.[0])gains[run.room.candidates[0]]=(gains[run.room.candidates[0]]??0)+1;}
  else if(run.phase==='ROOM'&&run.room.type==='shop')a={type:'SHOP',choice:'leave'};else if(run.phase==='CHECKPOINT')a={type:'CONTINUE'};else throw Error(`Unexpected ${run.phase}/${run.room?.type}`);
  const before=run;run=R.runAction(run,a,0);if(a.type==='REWARD_CLAIM'){const id=before.reward?.selections?.card;if(id)gains[id]=(gains[id]??0)+1;}
  if(before.phase==='BATTLE'&&active&&run.phase!=='BATTLE'){active.endHp=run.battle?.hp??run.hp;active.turns=run.battle?.turn??before.battle.turn;active.result=run.result?.type==='DEFEAT'?'DEFEAT':'WIN';active.hpLost=Math.max(0,active.startHp-active.endHp);active.enemyHpLost=Math.max(0,active.startEnemyHp-(run.battle?.enemyHp??0));combats.push(active);active=null;}
  run=JSON.parse(JSON.stringify(run));
 }
 return{professionId:p,seedIndex,seed,outcome:steps>=600?'TIMEOUT':run.result?.type??run.phase,stationsCompleted:run.completed,endingHp:run.hp,steps,newCardGains:Object.entries(gains).filter(([id])=>fresh.includes(id)).reduce((n,[,x])=>n+x,0),newCardUses:Object.entries(uses).filter(([id])=>fresh.includes(id)).reduce((n,[,x])=>n+x,0),gains:Object.fromEntries(Object.entries(gains).filter(([id])=>fresh.includes(id))),uses:Object.fromEntries(Object.entries(uses).filter(([id])=>fresh.includes(id))),campHeals:camps.filter(x=>x.choice==='heal').length,combatHpLost:combats.reduce((n,x)=>n+x.hpLost,0)};}
const summarize=rs=>({runs:rs.length,clears:rs.filter(x=>x.outcome==='CLEAR').length,defeats:rs.filter(x=>x.outcome==='DEFEAT').length,timeouts:rs.filter(x=>x.outcome==='TIMEOUT').length,meanEndingHp:+(rs.reduce((n,x)=>n+x.endingHp,0)/rs.length).toFixed(2),meanStations:+(rs.reduce((n,x)=>n+x.stationsCompleted,0)/rs.length).toFixed(2),newCardGains:rs.reduce((n,x)=>n+x.newCardGains,0),newCardUses:rs.reduce((n,x)=>n+x.newCardUses,0),campHeals:rs.reduce((n,x)=>n+x.campHeals,0),combatHpLost:rs.reduce((n,x)=>n+x.combatHpLost,0)});
const runs=[];for(const p of professions)for(let i=1;i<=2;i++){const v17=sim(p,i,17),v18=sim(p,i,18);runs.push({professionId:p,seedIndex:i,v17,v18});}
const byProfession=Object.fromEntries(professions.map(p=>[p,{v17:summarize(runs.flatMap(x=>[x.v17]).filter(x=>x.professionId===p)),v18:summarize(runs.flatMap(x=>[x.v18]).filter(x=>x.professionId===p))}]));
const report={generatedAt:new Date().toISOString(),rules:['lantern-rules-v0.17','lantern-rules-v0.18'],scope:'8 professions × 2 paired seeds × difficulty 0 = 32 full runs total',method:'Two-action greedy legal battle lookahead; actual route rooms; no injected HP; reward defaults claimed; camp heal at HP <=24; seed string whole-${profession}-${index} identical across versions; 600-action test bound only.',limits:'Small deterministic policy sample; not human-play balance evidence. Every surfaced room/reward/shop card candidate and every deck snapshot was checked against profession access. Shop choices left untouched, so shop purchase behavior is source-checked rather than exercised.',cardPool:{total:C18.cards?Object.keys(C18.cards).length:0,newCount:fresh.length,newExclusive:fresh.filter(id=>C18.cards[id].professionOnly).length,newCommon:fresh.filter(id=>!C18.cards[id].professionOnly).length,exclusiveTotal:exclusive.length,definitions:Object.keys(C18.cards).length,newIds:fresh},summary:{v17:summarize(runs.map(x=>x.v17)),v18:summarize(runs.map(x=>x.v18))},byProfession,runs};
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);if(out)await writeFile(resolve(out),JSON.stringify(report)+'\n');console.log(JSON.stringify({out,summary:report.summary,byProfession},null,2));
