import { RunActionError } from './rogue-run-v04.mjs';
export { RunActionError };
import { CATALOG_V07 as CATALOG, PROFESSIONS, ITEMS, EVENTS } from './rogue-content-v07.mjs';
import { beginBattle, battleAction, legalCards } from './rogue-battle.mjs';
import { getDifficultyRules } from './rogue-difficulty.mjs';

export const RULE_VERSION='lantern-rules-v0.7';
const HOUR=3600000, RUN_TTL=72*HOUR;
const clone=(x)=>JSON.parse(JSON.stringify(x));
const fail=(code,message)=>{throw new RunActionError(code,message);};
function timestamp(value){const n=value instanceof Date?value.getTime():Number(value);if(!Number.isFinite(n))fail('INVALID_TIME','now must be a finite timestamp or Date');return n;}
function hashSeed(seed){let h=0x811c9dc5;for(const c of String(seed??'lantern-v0.7')){h^=c.charCodeAt(0);h=Math.imul(h,0x01000193)>>>0;}return h||0x6d2b79f5;}
function nextRandom(stream){let x=stream.state>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;stream.state=x>>>0||0x6d2b79f5;return stream.state/0x100000000;}
function shuffle(stream,values){const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(nextRandom(stream)*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function sample(run,values,count,scope){if(!scope)fail('INVALID_RANDOM_SCOPE','A random scope is required');const key=`${run.act}:${run.slot}:${scope}`;const stream={state:run.rngStreams[key]??hashSeed(`${run.seed}|${run.act}|${run.slot}|${scope}`)};const out=shuffle(stream,values).slice(0,Math.min(count,values.length));run.rngStreams[key]=stream.state;return out;}
function currentAct(run){const a=CATALOG.acts.find(x=>x.index===run.act);if(!a)fail('INVALID_ACT','No catalog entry for current act');return a;}
function unlockedCards(act){return CATALOG.acts.filter(a=>a.index<=act).flatMap(a=>a.newCardRewards);}
function rules(run){return getDifficultyRules(run.difficulty??0);}
function prices(run){const surcharge=rules(run).shopSurcharge;return {cardByEnergy:Object.fromEntries(Object.entries(CATALOG.shop.cardCostByEnergy).map(([k,v])=>[k,v+surcharge])),upgrade:CATALOG.shop.upgradeCost+surcharge,remove:CATALOG.shop.removeCost+surcharge,item:8+surcharge};}
function makeMapPlan(run){
 const plans=[];
 for(let actIndex=1;actIndex<=3;actIndex++){
  run.act=actIndex;const act=CATALOG.acts[actIndex-1];const normalIds=act.normalPool.filter(id=>CATALOG.enemies[id]);const eliteIds=act.elitePool.filter(id=>CATALOG.enemies[id]);
  const bossIds=act.bossPool.filter(id=>CATALOG.enemies[id]);
  const boss=sample(run,bossIds,1,`map-boss-${actIndex}`)[0];run.bosses[actIndex-1]=boss;
  const eventIds=EVENTS.map(e=>e.eventId);
  const slots=[
   [['normal','normal'],['normal','normal'],['event']],
   [['normal','normal'],['shop'],['event']],
   [['elite'],['event'],['camp']],
   [['camp'],['elite'],['shop']],
  ];
  const nodeSets=slots.map((specs,i)=>{
   const enemyScope=`map-enemy-${actIndex}-${i+1}`;
   const enemies=sample(run,i<2?normalIds:eliteIds,3,enemyScope);
   const event=sample(run,eventIds,3,`map-event-${actIndex}-${i+1}`);
   let ni=0,ei=0;
   return specs.map((types,j)=>{
    const type=types[0],node={id:`a${actIndex}s${i+1}n${j}`,type,title:'',description:''};
    if(type==='normal'||type==='elite'){
     node.enemyId=(type==='normal'?enemies:enemies)[(ni++)%(enemies.length||1)];
     const dangerous=type==='normal'&&((actIndex+i+j)%3===0||(actIndex===1&&i===0&&j===0));if(dangerous)node.dangerous=true;
     node.title=CATALOG.enemies[node.enemyId]?.name??'遭遇';node.description=dangerous?'危险遭遇：敌人更强，胜利额外获得余烬与遗物。':`${type==='elite'?'精英':'普通'}战斗`;
    }else if(type==='event'){
     node.eventId=event[ei++%event.length];const def=EVENTS.find(e=>e.eventId===node.eventId);node.title=def.title;node.description=def.description;
    }else{node.title=type==='shop'?'旧街商铺':'营地';node.description=type==='shop'?'购买牌、道具或服务。':'治疗或升级。';}
    return node;
   });
  });
  plans.push({act:actIndex,bossId:boss,nodes:nodeSets});
 }
 return plans;
}
function makeRoute(run,slot){
 run.slot=slot;run.phase='ROUTE';const nodes=clone(run.mapPlan[run.act-1].nodes[slot-1]);
 const path=run.path.filter(p=>p.act===run.act),battles=path.filter(p=>['normal','elite'].includes(p.type)).length,camps=path.filter(p=>p.type==='camp').length;
 for(const node of nodes){node.available=true;node.disabledReason=null;if(node.type==='camp'&&camps>=2){node.available=false;node.disabledReason='本幕营地次数已达上限';}if(slot===4&&battles===0&&node.type!=='elite'){node.available=false;node.disabledReason='Boss前至少完成一场战斗';}}
 run.room={type:'route',slot,choices:nodes.filter(n=>n.available).map(n=>n.id),nodes};
}
function battleSeed(run){return `${run.seed}:${run.act}:${run.slot}:${run.room.enemyId}:${run.room.dangerous?'dangerous':''}`;}
function startBattle(run,enemyId,kind,{dangerous=false}={}){
 if(!CATALOG.enemies[enemyId])fail('UNKNOWN_ENEMY',`Unknown enemy ${enemyId}`);
 run.phase='BATTLE';run.room={type:'battle',battleType:kind,enemyId,dangerous:Boolean(dangerous),rewardGranted:false};
 run.battle=beginBattle({ruleVersion:RULE_VERSION,professionId:run.professionId,difficulty:run.difficulty,dangerous:Boolean(dangerous),items:[...run.inventory],enemyId,deck:clone(run.deck),relics:[...run.relics],hp:run.hp,seed:battleSeed(run)});syncBattle(run);
}
function syncBattle(run){if(!run.battle)return;run.hp=Math.max(0,run.battle.hp);if(Array.isArray(run.battle.deck))run.deck=clone(run.battle.deck);if(Array.isArray(run.battle.relics))run.relics=[...run.battle.relics];run.inventory=[...run.battle.items];}
function addCard(run,id){if(!CATALOG.cards[id])fail('UNKNOWN_CARD',`Unknown card ${id}`);run.deck.push({uid:run.nextUid++,cardId:id,upgraded:false});}
function addItem(run,id,replaceIndex){if(!ITEMS[id])fail('UNKNOWN_ITEM','Unknown item');if(run.inventory.length<2)run.inventory.push(id);else if(!Number.isInteger(replaceIndex)||replaceIndex<0||replaceIndex>=2)fail('INVENTORY_FULL','Choose an inventory slot to replace');else run.inventory[replaceIndex]=id;}
function relicValue(run,trigger){return run.relics.reduce((sum,id)=>sum+(CATALOG.relics[id]?.trigger===trigger?CATALOG.relics[id].value:0),0);}
function findCard(run,uid){return run.deck.find(x=>x.uid===uid);}
function assertUpgrade(run,uid){const e=findCard(run,uid);if(!e)fail('UNKNOWN_ENTITY',`Unknown card entity ${uid}`);if(e.upgraded)fail('ALREADY_UPGRADED',`Card entity ${uid} is already upgraded`);if(!CATALOG.cards[e.cardId]?.upgrade)fail('NO_UPGRADE',`Card ${e.cardId} has no upgrade`);return e;}
function completeStation(run){const expected=(run.act-1)*5+(run.slot-1);if(run.completed!==expected)fail('INVALID_PROGRESS','Completed station count does not match current station');run.completed++;run.room=null;run.battle=null;run.reward=null;
 if(run.slot<4){makeRoute(run,run.slot+1);return;}
 if(run.slot===4){run.path.push({act:run.act,slot:5,nodeId:`a${run.act}s5boss`,type:'boss',enemyId:run.bosses[run.act-1],eventId:null,dangerous:false});run.slot=5;startBattle(run,run.bosses[run.act-1],'boss');return;}
 run.completedActs=run.act;if(run.act===3){run.phase='RESULT';run.result={type:'CLEAR'};return;}run.phase='CHECKPOINT';run.room={type:'checkpoint',completedAct:run.act};
}
function rewardCards(run){const pool=[...new Set(unlockedCards(run.act))];const tags=new Set(run.deck.flatMap(c=>CATALOG.cards[c.cardId]?.tags??[]));const related=pool.filter(id=>CATALOG.cards[id]?.tags?.some(t=>tags.has(t)));const bridge=related.filter(id=>CATALOG.cards[id]?.tags?.some(t=>!tags.has(t)));const selected=[];for(const [values,scope] of [[related,'owned'],[bridge,'bridge'],[pool,'public']]){const a=values.filter(id=>!selected.includes(id)),fallback=pool.filter(id=>!selected.includes(id));selected.push(...sample(run,a.length?a:fallback,1,`reward-${scope}`));}return selected;}
function startRewards(run,source){const q=[{kind:'card',candidates:rewardCards(run),done:false,selected:null}];if(source==='elite'||source==='dangerous'){const available=CATALOG.eliteRelics.filter(id=>!run.relics.includes(id));q.push({kind:'relic',candidates:sample(run,available,3,'reward-relic'),done:false,selected:null});}q.push({kind:'item',candidates:sample(run,Object.keys(ITEMS),2,'reward-item'),done:false,selected:null});run.phase='REWARD';run.reward={source,queue:q,index:0,completed:false};advanceReward(run);}
function advanceReward(run){while(run.reward.index<run.reward.queue.length){const s=run.reward.queue[run.reward.index];if(!s.done&&s.candidates.length)return;s.done=true;run.reward.index++;}run.reward.completed=true;run.phase='REWARD';completeStation(run);}
function resolveBattle(run){syncBattle(run);if(!run.battle?.result)return;const outcome=run.battle.result;if(outcome!=='WIN'){run.phase='RESULT';run.result={type:'DEFEAT',reason:outcome==='LOST_LIGHT'?'LOST_LIGHT':'HP_ZERO'};return;}const room=run.room;if(!room||room.type!=='battle'||room.rewardGranted)fail('BATTLE_ALREADY_SETTLED','Battle result was already processed');room.rewardGranted=true;const act=currentAct(run);if(room.battleType==='normal'){run.embers+=act.normalEmbers;if(room.dangerous){run.embers+=4;startRewards(run,'dangerous');}else startRewards(run,'normal');return;}if(room.battleType==='elite'){run.embers+=act.eliteEmbers;run.eliteWins++;startRewards(run,'elite');return;}run.embers+=act.bossEmbers;completeStation(run);}
function eventRoom(run,eventId){const def=EVENTS.find(e=>e.eventId===eventId);if(!def)fail('UNKNOWN_EVENT','Unknown route event');return {type:'event',...clone(def),candidates:sample(run,unlockedCards(run.act),3,'event-card'),itemCandidates:sample(run,Object.keys(ITEMS),2,'event-item')};}
function routeAction(run,action){if(run.phase!=='ROUTE')fail('INVALID_PHASE','No route choice is open');const room=run.room,node=room.nodes.find(n=>n.id===action.choice);if(!node)fail('INVALID_ROUTE','Choice is not available at this route');
 const path=run.path.filter(p=>p.act===run.act),battles=path.filter(p=>['normal','elite'].includes(p.type)).length,camps=path.filter(p=>p.type==='camp').length;
 if(node.type==='camp'&&camps>=2)fail('INVALID_ROUTE','Only two camps are allowed per act');if(run.slot===4&&battles===0&&node.type!=='elite')fail('INVALID_ROUTE','Choose an elite encounter before the act boss');
 run.path.push({act:run.act,slot:run.slot,nodeId:node.id,type:node.type,enemyId:node.enemyId??null,eventId:node.eventId??null,dangerous:Boolean(node.dangerous)});room.selected=node.id;
 if(node.type==='normal'||node.type==='elite')startBattle(run,node.enemyId,node.type,{dangerous:node.dangerous});
 else if(node.type==='shop'){run.phase='ROOM';run.room={type:'shop',stock:sample(run,unlockedCards(run.act),3,'shop-cards'),itemStock:sample(run,Object.keys(ITEMS),3,'shop-items'),services:{upgrade:false,remove:false},prices:prices(run)};}
 else if(node.type==='camp'){run.phase='ROOM';run.room={type:'camp',healAmount:run.campHealAmount+relicValue(run,'camp_heal')};}
 else if(node.type==='event'){run.phase='ROOM';run.room=eventRoom(run,node.eventId);}
 else fail('INVALID_ROUTE','Route choice is unavailable');
}
function actionBattle(run,action){if(run.phase!=='BATTLE'||!run.battle||run.battle.result)fail('INVALID_PHASE','No live battle is open');if(action.type==='PLAY'){if(!legalCards(run.battle).some(c=>c.uid===action.uid))fail('ILLEGAL_CARD','Card entity is not legally playable now');run.battle=battleAction(run.battle,{type:'PLAY',uid:action.uid,targetUid:action.targetUid});}else if(action.type==='ITEM')run.battle=battleAction(run.battle,{type:'ITEM',itemIndex:action.itemIndex});else if(action.type==='END_TURN')run.battle=battleAction(run.battle,{type:'END_TURN'});else fail('INVALID_ACTION','Unknown battle action');resolveBattle(run);}
function actionReward(run,action){if(run.phase!=='REWARD'||!run.reward||run.reward.completed)fail('INVALID_PHASE','No reward is open');const s=run.reward.queue[run.reward.index];if(!s||s.done)fail('INVALID_REWARD','No pending reward item');const choice=action.choice??null;if(choice!==null&&!s.candidates.includes(choice))fail('INVALID_REWARD','Choice is not in current reward candidates');if(choice!==null){if(s.kind==='card')addCard(run,choice);else if(s.kind==='item')addItem(run,choice,action.replaceIndex);else{if(run.relics.includes(choice))fail('DUPLICATE_RELIC','Relic is already owned');run.relics.push(choice);}}s.selected=choice;s.done=true;run.reward.index++;advanceReward(run);}
function actionCamp(run,action){if(run.phase!=='ROOM'||run.room?.type!=='camp')fail('INVALID_PHASE','No camp choice is open');if(action.choice==='heal'){if(run.hp>=rules(run).maxHp)fail('FULL_HEALTH','Healing unavailable at full health');run.hp=Math.min(rules(run).maxHp,run.hp+run.room.healAmount);}else if(action.choice==='upgrade')assertUpgrade(run,action.uid).upgraded=true;else if(action.choice!=='leave')fail('INVALID_CHOICE','Camp choice must be heal, upgrade, or leave');completeStation(run);}
function actionShop(run,action){if(run.phase!=='ROOM'||run.room?.type!=='shop')fail('INVALID_PHASE','No shop is open');const room=run.room,p=room.prices;if(action.choice==='item'){const i=room.itemStock.indexOf(action.itemId);if(i<0)fail('SOLD_OUT','Item is not in current shop stock');if(run.embers<p.item)fail('INSUFFICIENT_EMBERS','Not enough embers');addItem(run,action.itemId,action.replaceIndex);run.embers-=p.item;room.itemStock.splice(i,1);}else if(action.choice==='buy'){const i=room.stock.indexOf(action.cardId);if(i<0)fail('SOLD_OUT','Card is not in current shop stock');const cost=p.cardByEnergy[String(CATALOG.cards[action.cardId].cost)];if(!Number.isFinite(cost))fail('INVALID_CATALOG','Missing shop price');if(run.embers<cost)fail('INSUFFICIENT_EMBERS','Not enough embers');run.embers-=cost;addCard(run,action.cardId);room.stock.splice(i,1);}else if(action.choice==='upgrade'||action.choice==='remove'){const key=action.choice;if(room.services[key])fail('SERVICE_USED','Shop service already used');if(key==='remove'&&run.deck.length<=CATALOG.shop.minimumDeck)fail('MINIMUM_DECK','Cannot remove below minimum deck size');const cost=p[key];if(run.embers<cost)fail('INSUFFICIENT_EMBERS','Not enough embers');if(key==='upgrade')assertUpgrade(run,action.uid).upgraded=true;else{const i=run.deck.findIndex(e=>e.uid===action.uid);if(i<0)fail('UNKNOWN_ENTITY',`Unknown card entity ${action.uid}`);run.deck.splice(i,1);}run.embers-=cost;room.services[key]=true;}else if(action.choice==='leave')completeStation(run);else fail('INVALID_CHOICE','Unknown shop choice');}
function actionEvent(run,action){if(run.phase!=='ROOM'||run.room?.type!=='event')fail('INVALID_PHASE','No event is open');const room=run.room,c=action.choice;if(!room.choices.includes(c))fail('INVALID_CHOICE','Choice is not offered by this event');
 if(c==='leave'){}
 else if(c==='heal'){if(run.hp>=rules(run).maxHp)fail('FULL_HEALTH','Healing unavailable at full health');if(run.embers<room.healCost)fail('INSUFFICIENT_EMBERS','Not enough embers');run.embers-=room.healCost;run.hp=Math.min(rules(run).maxHp,run.hp+room.healAmount);}
 else if(c==='card'||c==='trade'){if(!room.candidates.includes(action.cardId))fail('INVALID_CARD','Card is not a current candidate');if(c==='trade'){if(run.hp<=room.lifeCost)fail('INSUFFICIENT_HP','Trade must leave at least one life');run.hp-=room.lifeCost;}else{if(run.embers<room.cardCost)fail('INSUFFICIENT_EMBERS','Not enough embers');run.embers-=room.cardCost;}addCard(run,action.cardId);}
 else if(c==='item'){if(!room.itemCandidates.includes(action.itemId))fail('INVALID_ITEM','Item is not offered');if(run.embers<room.itemCost)fail('INSUFFICIENT_EMBERS','Not enough embers');addItem(run,action.itemId,action.replaceIndex);run.embers-=room.itemCost;}
 else if(c==='upgrade'){if(run.embers<room.upgradeCost)fail('INSUFFICIENT_EMBERS','Not enough embers');assertUpgrade(run,action.uid).upgraded=true;run.embers-=room.upgradeCost;}
 else if(c==='remove'){if(run.deck.length<=CATALOG.shop.minimumDeck)fail('MINIMUM_DECK','Cannot remove below minimum deck size');if(run.embers<room.removeCost)fail('INSUFFICIENT_EMBERS','Not enough embers');const i=run.deck.findIndex(e=>e.uid===action.uid);if(i<0)fail('UNKNOWN_ENTITY',`Unknown card entity ${action.uid}`);run.deck.splice(i,1);run.embers-=room.removeCost;}
 else if(c==='gain')run.embers+=room.emberAmount;
 completeStation(run);
}
function blessing(run,action){if(run.phase!=='ROOM'||run.room?.type!=='blessing')fail('INVALID_PHASE','No blessing open');const id=action.relicId??null;if(id!==null){if(!run.room.candidates.includes(id))fail('INVALID_RELIC','Relic is not a current candidate');if(run.relics.includes(id))fail('DUPLICATE_RELIC','Relic is already owned');run.relics.push(id);}run.room=null;makeRoute(run,1);}

export function createRun({runId,owner,guild,mode='normal',seed,startDay,rewardEligible=false,professionId='traveler',difficulty=0,inventory=[],now=Date.now()}){
 if(runId===undefined||owner===undefined||guild===undefined)fail('INVALID_RUN_META','runId, owner, and guild are required');if(!Object.hasOwn(PROFESSIONS,professionId))fail('UNKNOWN_PROFESSION','Unknown profession');if(!['normal','challenge','practice'].includes(mode))fail('INVALID_MODE','Mode must be normal, challenge, or practice');if(!Array.isArray(inventory)||inventory.length>2||inventory.some(id=>!Object.hasOwn(ITEMS,id)))fail('INVALID_INVENTORY','Invalid starting inventory');
 let dr;try{dr=getDifficultyRules(difficulty);}catch{fail('INVALID_DIFFICULTY','Difficulty must be an integer from 0 to 10');}const at=timestamp(now),deck=PROFESSIONS[professionId].starterDeck.map((cardId,uid)=>({uid,cardId,upgraded:false}));if(dr.starterWound)deck.push({uid:deck.length,cardId:'v07_wound',upgraded:false});
 const run={ruleVersion:RULE_VERSION,catalogVersion:CATALOG.version,professionId,difficulty:dr.level,mode,inventory:[...inventory],runId,owner,guild,seed:String(seed??runId),startDay:startDay??null,rewardEligible:Boolean(rewardEligible),phase:'ROOM',act:1,slot:1,stationsPerAct:5,totalStations:15,completed:0,completedActs:0,eliteWins:0,hp:dr.maxHp,embers:0,deck,relics:[PROFESSIONS[professionId].starterRelic],nextUid:deck.length,version:0,lastActionAt:at,rngStreams:{},battle:null,room:{type:'blessing',candidates:[]},reward:null,result:null,path:[],mapPlan:[],bosses:[null,null,null],campHealAmount:dr.campHealAmount};
 run.mapPlan=makeMapPlan(run);run.act=1;const b1=CATALOG.acts[0].chapterRelics.filter(id=>!run.relics.includes(id));run.room={type:'blessing',candidates:b1};return run;
}
export function runAction(run,action,now=Date.now()){
 if(!run||typeof run!=='object'||!action||typeof action!=='object')fail('INVALID_INPUT','run and action objects are required');const at=timestamp(now);if(run.phase==='RESULT')fail('RUN_FINISHED','No actions are accepted after RESULT');if(action.expectedVersion!==undefined&&action.expectedVersion!==run.version)fail('STALE_VERSION','Action was created from an older run version');const n=clone(run);
 if(action.type==='BLESSING')blessing(n,action);else if(action.type==='ROUTE')routeAction(n,action);else if(['PLAY','END_TURN','ITEM'].includes(action.type))actionBattle(n,action);else if(action.type==='REWARD')actionReward(n,action);else if(action.type==='CAMP')actionCamp(n,action);else if(action.type==='SHOP')actionShop(n,action);else if(action.type==='EVENT')actionEvent(n,action);
 else if(action.type==='CONTINUE'){if(n.phase!=='CHECKPOINT'||n.act>=3)fail('INVALID_PHASE','No next act is available');n.act++;n.slot=1;n.phase='ROOM';const choices=CATALOG.acts[n.act-1].chapterRelics.filter(id=>!n.relics.includes(id));n.room={type:'blessing',candidates:sample(n,choices,3,'chapter-relic')};}
 else if(action.type==='RETREAT'){if(n.phase!=='CHECKPOINT'||action.confirmed!==true)fail('INVALID_PHASE','Retreat requires checkpoint confirmation');n.phase='RESULT';n.room=null;n.result={type:'RETREAT'};}
 else if(action.type==='ABANDON'){if(action.confirmed!==true)fail('CONFIRMATION_REQUIRED','Abandon requires explicit confirmation');n.phase='RESULT';n.room=null;n.result={type:'ABANDON'};}
 else fail('INVALID_ACTION',`Unknown action type ${String(action.type)}`);
 n.version=run.version+1;n.lastActionAt=at;if(n.phase==='RESULT'&&n.result)n.result.at=at;return n;
}
export function expireRun(run,now=Date.now()){if(!run||typeof run!=='object')fail('INVALID_INPUT','run object is required');const at=timestamp(now),n=clone(run);if(n.phase==='RESULT'||at-n.lastActionAt<RUN_TTL)return n;n.phase='RESULT';n.room=null;n.result={type:'EXPIRED',at};n.version++;return n;}
