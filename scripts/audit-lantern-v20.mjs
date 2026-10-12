import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as R19 from '../rogue-run-v19.mjs';
import * as R20 from '../rogue-run-v20.mjs';
import * as Router from '../rogue-run.mjs';
import * as B19 from '../rogue-battle-v19.mjs';
import * as B20 from '../rogue-battle-v20.mjs';
import { CATALOG_V17 as C17 } from '../rogue-content-v17.mjs';
import { CATALOG_V19 as C19 } from '../rogue-content-v19.mjs';
import { CATALOG_V20 as C20 } from '../rogue-content-v20.mjs';
import { cardAllowed } from '../rogue-card-access-v18.mjs';
import { NEW_TARGETS, supportTargetAllowed } from '../rogue-card-effects-v19.mjs';
import { candidateFit } from '../rogue-build-system-v19.mjs';
import { getDifficultyRules } from '../rogue-difficulty-v17.mjs';

const professions=Object.keys(C20.professions);
const fresh=Object.keys(C19.cards).filter(id=>!C17.cards[id]);
if(fresh.length!==28||fresh.filter(id=>C19.cards[id].professionOnly).length!==16)throw Error('Unexpected fresh card pool size (28 relative to v17)');
function score(run){const b=run.battle;if(run.phase==='RESULT')return run.result.type==='CLEAR'?1000:-1000+run.completed*30;if(!b)return 500;return 3*b.hp-2*b.enemyHp+b.shield*.8+b.enemyBurn*2+b.forge*2+b.petHp*.8+b.prepare*.4+b.mark*.4+b.energy*.1+b.items.length*.2;}
function legalActions(run,B,C){const b=run.battle,actions=[...B.legalItems(b).map(x=>({type:'ITEM',itemIndex:x.itemIndex})),{type:'END_TURN'}];
 for(const entry of B.legalCards(b)){const base=C.cards[entry.cardId],def=entry.upgraded?{...base,...base.upgrade}:base,targeted=def.effects.some(e=>['sift','exhaust_other','retain',...NEW_TARGETS].includes(e.kind));
  const targets=targeted?b.hand.filter(t=>t.uid!==entry.uid&&(!def.effects.some(e=>NEW_TARGETS.has(e.kind))||supportTargetAllowed(b,def,t,C))):[null];
  for(const t of targets)actions.push({type:'PLAY',uid:entry.uid,...(t?{targetUid:t.uid}:{})});}
 actions.push(...B.legalEchoes(b).map(x=>({type:'ECHO',uid:x.uid})));return actions;}
function battleChoice(run,B,C){let best=null,bestScore=-Infinity;for(const a of legalActions(run,B,C)){try{let n=Router.runAction(run,a,0),v=score(n);if(n.phase==='BATTLE'&&n.battle.turn===run.battle.turn){for(const z of legalActions(n,B,C)){try{v=Math.max(v,score(Router.runAction(n,z,0)));}catch{}}}if(v>bestScore){bestScore=v;best=a;}}catch{}}return best??{type:'END_TURN'};}
function routeChoice(run){const ns=run.room.nodes.filter(n=>run.room.choices.includes(n.id)),find=t=>ns.find(n=>n.type===t),shopPrice=10+getDifficultyRules(run.difficulty).shopSurcharge,usedShop=run.path.some(x=>x.act===run.act&&x.type==='shop');if(run.hp>24&&!usedShop&&run.embers>=shopPrice&&find('shop'))return find('shop');return run.hp<=24&&find('camp')?find('camp'):ns.find(n=>n.type==='normal'&&!n.dangerous)??find('normal')??find('camp')??find('event')??find('elite')??ns[0];}
function unlocked(C,act,p){return new Set(C.acts.filter(a=>a.index<=act).flatMap(a=>a.newCardRewards).filter(id=>cardAllowed(C,id,p)));}
function assertPools(run,C,p){const allowed=unlocked(C,run.act,p),check=(ids,where)=>{for(const id of ids??[])if(C.cards[id]&&(!cardAllowed(C,id,p)||!allowed.has(id)))throw Error(`card ${id} violates profession/act acquisition gate for ${p} in ${where} act ${run.act}`);};
 for(const e of run.deck??[])if(!cardAllowed(C,e.cardId,p))throw Error(`illegal card ${e.cardId} in ${p} deck`);
 check(run.room?.candidates,'room candidates');check(run.room?.stock,'shop stock');check(run.reward?.queue?.flatMap(x=>x.kind==='card'?x.candidates:[]),'reward candidates');}
function preferred(run,ids,C,accept=()=>true){const deckIds=new Set(run.deck.map(e=>e.cardId));return [...(ids??[])].filter(id=>cardAllowed(C,id,run.professionId)).map(id=>({id,fit:candidateFit(run,id,C),duplicate:deckIds.has(id)})).filter(x=>accept(x)).sort((a,b)=>Number(a.duplicate)-Number(b.duplicate)||Number(b.fit.evidence===true)-Number(a.fit.evidence===true)||b.fit.score-a.fit.score||a.id.localeCompare(b.id))[0]??null;}
function sim(p,seedIndex,difficulty,version){const is20=version===20,R=is20?R20:R19,B=is20?B20:B19,C=is20?C20:C19,rv=is20?'lantern-rules-v0.20':'lantern-rules-v0.19',seed=`beta19-${p}-${seedIndex}-d${difficulty}`;
 let run=Router.createRun({runId:`v${version}-balance-audit`,owner:'audit',guild:'audit',ruleVersion:rv,professionId:p,difficulty,seed,now:0}),steps=0,active=null;const combats=[],gains={},uses={},camps=[],shops={offers:0,purchases:0},events={offers:0,cardAcquisitions:0},signatures={hotIronPierces:0,mailReturnDiscounts:0,medicBadgePreparations:0};
 if(run.ruleVersion!==rv)throw Error(`router create dispatch failed for ${rv}`);
 while(run.phase!=='RESULT'&&steps<600){steps++;assertPools(run,C,p);let a;
  if(run.phase==='BATTLE'){if(!active)active={enemyId:run.battle.enemyId,startHp:run.battle.hp,startEnemyHp:run.battle.enemyHp,startTurn:run.battle.turn,pressureTurns:new Set(),shieldAfterTurns:new Set()};if(run.battle.enemyPressure>0)active.pressureTurns.add(run.battle.turn);if(run.battle.intent?.shieldAfter>0)active.shieldAfterTurns.add(run.battle.turn);a=battleChoice(run,B,C);if(a.type==='PLAY'){const x=run.battle.deck.find(e=>e.uid===a.uid);if(x)uses[x.cardId]=(uses[x.cardId]??0)+1;}}
  else if(run.phase==='ROUTE')a={type:'ROUTE',choice:routeChoice(run).id};else if(run.phase==='REWARD')a={type:'REWARD_CLAIM'};
  else if(run.phase==='ROOM'&&run.room.type==='camp'){a={type:'CAMP',choice:run.hp<=24?'heal':'leave'};const hp=run.hp;run=Router.runAction(run,a,0);camps.push({choice:a.choice,hpRestored:run.hp-hp});run=JSON.parse(JSON.stringify(run));continue;}
  else if(run.phase==='ROOM'&&run.room.type==='blessing')a={type:'BLESSING',relicId:run.room.candidates[0]??null};
  else if(run.phase==='ROOM'&&run.room.type==='event'){
   const room=run.room;events.offers++;
   const card=room.choices.includes('card')&&run.embers>=room.cardCost?preferred(run,room.candidates,C,x=>x.fit.evidence===true):null;
   const trade=room.choices.includes('trade')&&run.hp>room.lifeCost?preferred(run,room.candidates,C,x=>x.fit.evidence===true):null;
   if(card){a={type:'EVENT',choice:'card',cardId:card.id};events.cardAcquisitions++;}
   else if(trade){a={type:'EVENT',choice:'trade',cardId:trade.id};events.cardAcquisitions++;}
   else if(room.choices.includes('gain'))a={type:'EVENT',choice:'gain'};else a={type:'EVENT',choice:'leave'};
   if(a.cardId)gains[a.cardId]=(gains[a.cardId]??0)+1;
  }else if(run.phase==='ROOM'&&run.room.type==='shop'){
   const room=run.room;shops.offers+=room.stock.length;
   const card=preferred(run,room.stock,C,x=>x.fit.evidence===true&&run.embers>=room.prices.cardByEnergy[String(C.cards[x.id].cost)]);
   if(card){a={type:'SHOP',choice:'buy',cardId:card.id};shops.purchases++;gains[card.id]=(gains[card.id]??0)+1;}
   else a={type:'SHOP',choice:'leave'};
  }else if(run.phase==='CHECKPOINT')a={type:'CONTINUE'};else throw Error(`Unexpected ${run.phase}/${run.room?.type}`);
  const before=run;run=Router.runAction(run,a,0);if(a.type==='REWARD_CLAIM'){const id=before.reward?.selections?.card;if(id)gains[id]=(gains[id]??0)+1;}
  if(before.phase==='BATTLE'&&a.type==='PLAY'){
   const entity=before.battle.deck.find(e=>e.uid===a.uid),base=entity&&C.cards[entity.cardId],def=entity?.upgraded?{...base,...base?.upgrade}:base;
   if(entity?.cardId==='hot_iron'){const addedForge=(def?.effects??[]).filter(e=>e.kind==='forge').reduce((n,e)=>n+e.value,0),threshold=(def?.effects??[]).find(e=>e.kind==='weapon_attack')?.forgePierceThreshold;if(threshold&&before.battle.enemyArmor>0&&before.battle.forge+addedForge>=threshold)signatures.hotIronPierces++;}
   if(entity?.cardId==='mail_return'&&Object.keys(run.battle?.cardDiscounts??{}).some(uid=>(before.battle.cardDiscounts?.[uid]??0)<run.battle.cardDiscounts[uid]))signatures.mailReturnDiscounts++;
   if(C.relics.medic_badge?.prepare&&before.battle.relics.includes('medic_badge')&&!before.battle.turnFlags.includes('medic_badge')&&run.battle?.turnFlags.includes('medic_badge'))signatures.medicBadgePreparations++;
  }
  if(before.phase==='BATTLE'&&active&&run.phase!=='BATTLE'){active.endHp=run.battle?.hp??run.hp;active.turns=run.battle?.turn??before.battle.turn;active.result=run.result?.type==='DEFEAT'?'DEFEAT':'WIN';active.hpLost=Math.max(0,active.startHp-active.endHp);active.enemyHpLost=Math.max(0,active.startEnemyHp-(run.battle?.enemyHp??0));active.pressureTurns=active.pressureTurns.size;active.shieldAfterTurns=active.shieldAfterTurns.size;combats.push(active);active=null;}
  run=JSON.parse(JSON.stringify(run));
 }
 if(steps<600&&run.phase!=='RESULT')throw Error('Unexpected incomplete run');
 return{professionId:p,seedIndex,difficulty,seed,outcome:steps>=600?'TIMEOUT':run.result?.type??run.phase,stationsCompleted:run.completed,endingHp:run.hp,steps,newCardGains:Object.entries(gains).filter(([id])=>fresh.includes(id)).reduce((n,[,x])=>n+x,0),newCardUses:Object.entries(uses).filter(([id])=>fresh.includes(id)).reduce((n,[,x])=>n+x,0),gains:Object.fromEntries(Object.entries(gains).filter(([id])=>fresh.includes(id))),uses:Object.fromEntries(Object.entries(uses).filter(([id])=>fresh.includes(id))),campHeals:camps.filter(x=>x.choice==='heal').length,combatHpLost:combats.reduce((n,x)=>n+x.hpLost,0),pressureTurns:combats.reduce((n,x)=>n+x.pressureTurns,0),shieldAfterIntentTurns:combats.reduce((n,x)=>n+x.shieldAfterTurns,0),signatures,shops,events};}
const summarize=rs=>({runs:rs.length,clears:rs.filter(x=>x.outcome==='CLEAR').length,defeats:rs.filter(x=>x.outcome==='DEFEAT').length,timeouts:rs.filter(x=>x.outcome==='TIMEOUT').length,meanEndingHp:+(rs.reduce((n,x)=>n+x.endingHp,0)/rs.length).toFixed(2),meanStations:+(rs.reduce((n,x)=>n+x.stationsCompleted,0)/rs.length).toFixed(2),newCardGains:rs.reduce((n,x)=>n+x.newCardGains,0),newCardUses:rs.reduce((n,x)=>n+x.newCardUses,0),campHeals:rs.reduce((n,x)=>n+x.campHeals,0),combatHpLost:rs.reduce((n,x)=>n+x.combatHpLost,0),pressureTurns:rs.reduce((n,x)=>n+x.pressureTurns,0),shieldAfterIntentTurns:rs.reduce((n,x)=>n+x.shieldAfterIntentTurns,0),signatureUses:Object.fromEntries(['hotIronPierces','mailReturnDiscounts','medicBadgePreparations'].map(k=>[k,rs.reduce((n,x)=>n+x.signatures[k],0)])),shopCardPurchases:rs.reduce((n,x)=>n+x.shops.purchases,0),eventCardAcquisitions:rs.reduce((n,x)=>n+x.events.cardAcquisitions,0)});
const pairs=[];for(const difficulty of [0,3])for(const p of professions)for(let i=1;i<=(difficulty===0?4:2);i++){const v19=sim(p,i,difficulty,19),v20=sim(p,i,difficulty,20);pairs.push({professionId:p,seedIndex:i,difficulty,v19,v20});}
const byProfession=Object.fromEntries(professions.map(p=>[p,Object.fromEntries([0,3].map(d=>[String(d),{v19:summarize(pairs.filter(x=>x.professionId===p&&x.difficulty===d).map(x=>x.v19)),v20:summarize(pairs.filter(x=>x.professionId===p&&x.difficulty===d).map(x=>x.v20))}]))]));
// Exercise the public wrapper independently for both version selectors and JSON persistence.
for(const [version,mod] of [[19,R19],[20,R20]]){const ruleVersion=`lantern-rules-v0.${version}`,direct=mod.createRun({runId:'dispatch',owner:'audit',guild:'audit',ruleVersion,professionId:'traveler',seed:'dispatch',now:0}),routed=Router.createRun({runId:'dispatch',owner:'audit',guild:'audit',ruleVersion,professionId:'traveler',seed:'dispatch',now:0});if(JSON.stringify(direct)!==JSON.stringify(routed))throw Error(`wrapper create dispatch mismatch ${ruleVersion}`);const action={type:'BLESSING',relicId:null};if(JSON.stringify(mod.runAction(direct,action,1))!==JSON.stringify(Router.runAction(JSON.parse(JSON.stringify(routed)),action,1)))throw Error(`wrapper action dispatch mismatch ${ruleVersion}`);}
const classClears=Object.fromEntries(professions.map(p=>[p,Object.fromEntries([0,3].map(d=>[String(d),Object.fromEntries(['v19','v20'].map(v=>[v,pairs.filter(x=>x.professionId===p&&x.difficulty===d&&x[v].outcome==='CLEAR').length]))]))]));
const report={generatedAt:new Date().toISOString(),rules:['lantern-rules-v0.19','lantern-rules-v0.20'],scope:'Difficulty 0: 8 professions × 4 paired seeds = 64 runs; difficulty 3: 8 professions × 2 paired seeds = 32 runs; 96 full runs total.',method:'Two-action greedy legal battle lookahead; paired deterministic seed strings beta19-${profession}-${index}-d${difficulty}; actual route rooms; rewards claimed using defaults; camp heal at HP <=24; shop once per act when affordable and not urgent for camp; evidence-supported acquisitions prefer nonduplicates. CandidateFit v19 is used consistently for v19 and v20. Pressure counts count distinct battle turns with enemyPressure >0 and distinct turns showing an intent with shieldAfter. Signature counters record hot_iron armor-pierce plays where forge reaches the threshold, successful mail_return discounts on recovered cards, and successful active-heal medic_badge trigger turns (not item/full-health nontriggers). JSON roundtrip after every action; public wrapper used for actions and checked against direct v19/v20 dispatch.',limitations:'Small deterministic policy sample, not human-play balance evidence. CandidateFit evidence is a heuristic; the policy does not optimize long-term deck value, relic/item purchases, shop services, event pacts, or route choices. Runs stop at a 600-action bound.',cardPool:{v17Total:Object.keys(C17.cards).length,v19Total:Object.keys(C19.cards).length,v20Total:Object.keys(C20.cards).length,freshFromV17:fresh.length,newExclusive:fresh.filter(id=>C19.cards[id].professionOnly).length,newCommon:fresh.filter(id=>!C19.cards[id].professionOnly).length,newIds:fresh},summary:{difficulty0:{v19:summarize(pairs.filter(x=>x.difficulty===0).map(x=>x.v19)),v20:summarize(pairs.filter(x=>x.difficulty===0).map(x=>x.v20))},difficulty3:{v19:summarize(pairs.filter(x=>x.difficulty===3).map(x=>x.v19)),v20:summarize(pairs.filter(x=>x.difficulty===3).map(x=>x.v20))}},classClears,byProfession,pairs};
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);if(out)await writeFile(resolve(out),JSON.stringify(report)+'\n');console.log(JSON.stringify({out,summary:report.summary,classClears},null,2));
