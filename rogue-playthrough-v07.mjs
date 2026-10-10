import {createRun,runAction,V07_RULE_VERSION as CURRENT_RULE_VERSION} from './rogue-run.mjs';
import {legalCards,legalItems} from './rogue-battle.mjs';
import {CATALOG_V07 as C,PROFESSIONS} from './rogue-content-v07.mjs';
function value(r){const b=r.battle;if(r.phase==='RESULT')return r.result.type==='CLEAR'?1000:-1000+(r.completed*30);if(!b)return 500;return 3*b.hp-2*b.enemyHp+b.shield*.8+b.enemyBurn*2+b.forge*2+b.petHp*.8+b.prepare*.4+b.mark*.4+b.energy*.1+b.items.length*.2;}
function actions(r){const b=r.battle;return [{type:'END_TURN'},...legalItems(b).map(x=>({type:'ITEM',itemIndex:x.itemIndex})),...legalCards(b).flatMap(e=>{const d=C.cards[e.cardId];return d.effects.some(e=>['sift','exhaust_other','retain'].includes(e.kind))?[{type:'PLAY',uid:e.uid},...b.hand.filter(t=>t.uid!==e.uid).map(t=>({type:'PLAY',uid:e.uid,targetUid:t.uid}))]:[{type:'PLAY',uid:e.uid}];})];}
function battleChoice(r){let best=null,bestScore=-Infinity;for(const a of actions(r)){let n;try{n=runAction(r,a,0);}catch{continue;}let score=value(n);if(n.phase==='BATTLE'&&n.battle.turn===r.battle.turn){let sub=-Infinity;for(const aa of actions(n)){try{sub=Math.max(sub,value(runAction(n,aa,0)));}catch{}}score=sub;}if(score>bestScore){bestScore=score;best=a;}}return best;}
function cardScore(id){const d=C.cards[id];return d.effects.reduce((s,e)=>s+(['damage','weapon_attack'].includes(e.kind)?e.value*.7:e.kind==='burn'?e.value*1.9:e.kind==='block'?e.value*.75:e.kind==='forge'?e.value*1.8:e.kind==='heal'?e.value*.5:e.kind==='pet_attack'?e.value*.6:1),0)/d.cost;}
export function play(prof,seed,difficulty=0){let r=createRun({runId:'s',owner:'1',guild:'1',ruleVersion:CURRENT_RULE_VERSION,professionId:prof,difficulty,seed,now:0});let steps=0;while(r.phase!=='RESULT'&&steps++<400){let a;
if(r.phase==='BATTLE')a=battleChoice(r);
else if(r.phase==='ROUTE'){
const choices=r.room.nodes.filter(n=>r.room.choices.includes(n.id));const chosen=(r.hp<24?choices.find(n=>n.type==='camp'):null)??choices.find(n=>n.type==='normal'&&!n.dangerous)??choices.find(n=>n.type==='normal')??choices.find(n=>n.type==='camp')??choices.find(n=>n.type==='event')??choices.find(n=>n.type==='elite')??choices[0];a={type:'ROUTE',choice:chosen.id};}
else if(r.phase==='REWARD'){const st=r.reward.queue[r.reward.index];const choice=st.kind==='card'?[...st.candidates].sort((a,b)=>cardScore(b)-cardScore(a))[0]:st.candidates[0];a={type:'REWARD',choice,replaceIndex:0};}
else if(r.phase==='ROOM'&&r.room.type==='camp'){const uid=r.deck.filter(e=>!e.upgraded).sort((a,b)=>cardScore(b.cardId)-cardScore(a.cardId))[0]?.uid;a={type:'CAMP',choice:r.hp<24?'heal':uid!=null?'upgrade':'leave',uid};}
else if(r.phase==='ROOM'&&r.room.type==='blessing')a={type:'BLESSING',relicId:r.room.candidates[0]};
else if(r.phase==='ROOM'&&r.room.type==='event')a={type:'EVENT',choice:r.room.choices.includes('gain')?'gain':'leave'};
else if(r.phase==='ROOM'&&r.room.type==='shop')a={type:'SHOP',choice:'leave'};
else if(r.phase==='CHECKPOINT')a={type:'CONTINUE'};
else throw Error(JSON.stringify(r.room));
r=runAction(JSON.parse(JSON.stringify(r)),a,0);
}return {prof,seed,difficulty,completed:r.completed,result:r.result?.type,hp:r.hp,steps,path:r.path};}
if(process.argv[1]===new URL(import.meta.url).pathname){const out=[];for(const prof of Object.keys(PROFESSIONS))for(const difficulty of [0,10])for(let seed=0;seed<4;seed++)out.push(play(prof,'v07-s'+seed,difficulty));console.log(JSON.stringify({summary:Object.fromEntries(Object.keys(PROFESSIONS).map(p=>[p,Object.fromEntries([0,10].map(d=>{const a=out.filter(x=>x.prof===p&&x.difficulty===d);return [d,{clear:a.filter(x=>x.result==='CLEAR').length,total:a.length,averageStations:a.reduce((s,x)=>s+x.completed,0)/a.length}]}))])),runs:out},null,2));}
