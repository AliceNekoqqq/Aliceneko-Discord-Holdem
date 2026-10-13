import { threatValue } from './rogue-enemy-threat-v22.mjs';
import { enemyPressureFor } from './rogue-enemy-pressure-v20.mjs';
import {CATALOG_V22 as CATALOG, ITEMS} from './rogue-content-v22.mjs';
import {getDifficultyRules} from './rogue-difficulty-v17.mjs';
import { cardAllowed } from './rogue-card-access-v18.mjs';
import { applyNewEffect, NEW_TARGETS, hasHealing, playLimitFor, discountedDefinition, conditionMet, supportTargetAllowed, supportUnavailable } from './rogue-card-effects-v21.mjs';
import {applyMetric} from './rogue-effect-metrics-v22.mjs';

const clone=v=>JSON.parse(JSON.stringify(v));
const DIRECT=new Set(['damage','pet_attack','weapon_attack','sacrifice','damage_from_shield']);
const TARGET=new Set(['sift','retain','exhaust_other',...NEW_TARGETS]);
const CONTROL=new Set([...TARGET,'echo_next','self_echo','delay_burn']);
const cap=(v,max)=>Math.min(max,Math.max(0,v));
const cardDef=(e,s=null)=>discountedDefinition(e.upgraded?{...CATALOG.cards[e.cardId],...CATALOG.cards[e.cardId].upgrade}:CATALOG.cards[e.cardId],e,s);
const log=(s,t)=>{s.log.push(t);s.log=s.log.slice(-8);};
function metric(s,key,n=1){s.effectMetrics=applyMetric(s,key,n).effectMetrics;}
function hash(seed){let n=0x811c9dc5;for(const c of String(seed)){n^=c.charCodeAt(0);n=Math.imul(n,0x01000193)>>>0;}return n||1;}
function random(s){let x=s.rngState;x^=x<<13;x^=x>>>17;x^=x<<5;s.rngState=x>>>0||1;return s.rngState/4294967296;}
function shuffle(s,a){for(let i=a.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[a[i],a[j]]=[a[j],a[i]];}}
function terminal(s){
 const phaseBefore=s.enemyPhase;
 if(s.hp<=0)s.result='DEFEAT';else if(s.enemyHp<=0)s.result='WIN';
 if(!s.result&&s.enemyPhase===1&&CATALOG.enemies[s.enemyId].phaseIntents?.length&&s.enemyHp<=Math.floor(s.enemyMaxHp*s.phaseThreshold)){
  if(CATALOG.enemies[s.enemyId].phaseAtCycleEnd){if(!s.enemyPhasePending){s.enemyPhasePending=2;log(s,'半血阶段已触发：当前已预告循环结束后进入第二阶段');}}else{
  s.enemyPhase=2;s.phaseStartTurn=s.turn+1;s.enemyShield=cap(s.enemyShield+s.phaseShield,30);log(s,'敌人进入第二阶段，获得护盾'+s.phaseShield+'；新意图从下轮生效');
  }
 }
 if(s.enemyPhase!==phaseBefore){
  s.phaseNextIntent=intentAt(s,s.turn+1);
  if(s.intent?.kind==='charge')syncChargeNext(s);
 }
 if(s.furnaceArmed&&!s.furnaceBroken&&s.enemyShield<=0){s.furnaceBroken=true;log(s,'炉盾已破：下一击削弱');if(s.intent?.kind==='charge')syncChargeNext(s);}
 if(s.result){s.echo=null;s.pendingEchoes=[];s.echoReady=false;s.echoCharges=0;s.echoEligibleUids=[];s.delayed=[];}return s.result;
}
function relics(s,trigger){return s.relics.filter(id=>CATALOG.relics[id]?.trigger===trigger).map(id=>[id,CATALOG.relics[id]]);}
function trigger(s,type,fn){for(const [id,r] of relics(s,type)){const flags=r.limit==='turn'?s.turnFlags:s.battleFlags;const used=s.relicTriggerCounts?.[id]??0;if(flags.includes(id)||(r.maxTriggersPerBattle!=null&&used>=r.maxTriggersPerBattle))continue;flags.push(id);if(r.maxTriggersPerBattle!=null){s.relicTriggerCounts??={};s.relicTriggerCounts[id]=used+1;}fn(r.value,r,id);if(s.result)break;}}
const shield=(s,v)=>{s.shield=cap(s.shield+v,30);};
const burnEnemy=(s,v)=>{s.enemyBurn=cap(s.enemyBurn+v,20);};
function prepare(s,v){s.prepare=cap(s.prepare+v,6);s.prepareUntil=s.turn+1;}
function mark(s,v){s.mark=cap(s.mark+v,4);s.markUntil=s.turn+1;}
function damage(s,value,{ignoreArmor=false,source='active',consume=true}={}){
 if(s.result)return 0;
 let n=value;
 if(consume&&(source==='active'||source==='echo')){
  if(s.prepare)metric(s,'prepareConsumed',s.prepare);
  if(s.mark)metric(s,'markConsumed',s.mark);
  n+=s.prepare+s.mark;s.prepare=0;s.mark=0;
  if(source==='active'){n+=s.itemAttackBonus;s.itemAttackBonus=0;}
 }
 const after=Math.max(0,n-(ignoreArmor?0:s.enemyArmor));
 const blocked=Math.min(s.enemyShield,after);s.enemyShield-=blocked;
 const loss=Math.min(s.enemyHp,after-blocked);s.enemyHp-=loss;
 if(loss>0)s.chargeDamage=(s.chargeDamage??0)+loss;
 if(loss>0&&s.intent?.kind==='charge'&&s.intent.chargeBreak&&s.chargeDamage>=s.intent.chargeBreak.threshold&&!s.chargeBreakReady){s.chargeBreakReady=true;syncChargeNext(s);}
 if(terminal(s))return loss;
 if(source==='active'&&loss>0&&s.intent.thorns&&!s.turnFlags.includes('enemy-thorns')){
  s.turnFlags.push('enemy-thorns');s.hp-=s.intent.thorns;log(s,`反伤${s.intent.thorns}`);terminal(s);
 }
 return loss;
}
function draw(s,count,source='auto'){for(let i=0;i<count;i++){
 if(!s.draw.length){if(!s.discard.length)break;s.draw=s.discard;s.discard=[];shuffle(s,s.draw);}
 if(s.hand.length>=5)break;s.hand.push(s.draw.pop());if(source==='active')metric(s,'drawSucceeded');
}}
function queueEcho(s,definition,count=1,{consumeCharge=false}={}){
 if(s.echoCount>=3||s.echoQueuedThisAction||!definition.replayable||hasHealing(definition))return false;
 const capacity=Math.max(0,3-s.echoCount-(consumeCharge?0:s.echoCharges??0));
 const queued=Math.min(Math.max(1,Math.floor(count)),capacity);
 if(!queued)return false;
 for(let n=0;n<queued;n++)s.pendingEchoes.push({definition:clone(definition),cardId:definition.cardId,upgraded:definition.upgraded});
 s.echoCount+=queued;s.echoQueuedThisAction=true;s.echo=s.pendingEchoes[0]??null;
 log(s,`已安排${definition.name??CATALOG.cards[definition.cardId]?.name??'这张牌'}回声${queued>1?`×${queued}`:''}`);return true;
}
export function legalEchoes(s){
 if(s?.result)return [];
 if(!(s?.echoCharges??(s?.echoReady?1:0))||(s.echoCount??0)>=3)return [];
 const queued=new Set((s.pendingEchoes??[]).map(e=>e.definition?.uid).filter(Number.isSafeInteger));
 const known=new Set();
 return (s.echoEligibleUids??[]).flatMap(uid=>{
  if(known.has(uid)||queued.has(uid))return [];
  known.add(uid);
  const entity=(s.deck??[]).find(e=>e.uid===uid),base=entity&&CATALOG.cards[entity.cardId];
  const definition=entity?.upgraded?{...base,...base?.upgrade}:base;
  if(!entity||!definition?.replayable||definition.effects?.some(e=>e.kind==='heal'))return [];
  return [{uid,cardId:entity.cardId,upgraded:entity.upgraded,definition}];
 });
}
function apply(s,definition,source='active',targetUid=null){
 if(s.result)return;
 if(source==='echo')metric(s,'echoReplays');
 const active=source==='active';
 const before={prepare:s.prepare,mark:s.mark,enemyBurn:s.enemyBurn,plays:s.plays,playLimit:playLimitFor(s)};s.forgeSpentThisCard=0;
 const payment=definition.selfCost??0;s.hp-=payment;s.selfLoss+=payment;
 if(payment)log(s,`支付生命${payment}`);
 if(terminal(s))return;
 if(active&&payment>0)trigger(s,'self_block',v=>shield(s,v));
 let extra=0,ignore=false;
 if(active&&definition.effects.some(e=>DIRECT.has(e.kind))){
  trigger(s,'first_attack_damage',v=>{extra+=v;});
  if(s.pierceReady){ignore=true;extra+=s.pierceReady;s.pierceReady=0;}
 }
 let firstDamage=true,firstBlock=true,selfEcho=0;
 for(const e of definition.effects){
  if(s.result)break;
  const v=e.value??0;
  if(DIRECT.has(e.kind)){
   if((e.kind==='pet_attack'||e.kind==='sacrifice')&&s.petHp<=0)continue;
   let amount=v+(e.bonus&&conditionMet(e.bonus.condition,before,s)?e.bonus.value:0);
   if(e.kind==='weapon_attack'){amount+=s.forge;if(active)trigger(s,'weapon_bonus',x=>{amount+=x;});}
   if(e.kind==='sacrifice'){s.petHp=0;log(s,'灯灵牺牲');}
   if(e.kind==='damage_from_shield'){const spent=Math.min(s.shield,e.maxSpend??6);s.shield-=spent;amount+=spent*(e.multiplier??1);}
   const wasFirst=firstDamage;amount+=wasFirst?extra:0;firstDamage=false;
   const lost=damage(s,amount,{ignoreArmor:ignore||e.ignoreArmor===true||(e.kind==='weapon_attack'&&e.forgePierceThreshold!=null&&s.forge>=e.forgePierceThreshold),source,consume:wasFirst});
   if(s.result)break;
   if(active&&lost>0)trigger(s,'first_attack_burn',x=>burnEnemy(s,x));
   if(active&&e.kind==='pet_attack')trigger(s,'pet_attack_block',x=>shield(s,x));
  }else if(e.kind==='block'){
   let n=v;
   if(active&&firstBlock)for(const [id,r] of relics(s,'first_block_per_turn')){
    if(!s.turnFlags.includes(id)){s.turnFlags.push(id);n+=r.value;}
   }
   firstBlock=false;shield(s,n);
  }else if(e.kind==='burn'){
   let bonus=0;if(active)trigger(s,'burn_bonus',x=>{bonus+=x;});
   burnEnemy(s,v+bonus);
   if(active)trigger(s,'burn_block',x=>shield(s,x));
   if(source==='echo')trigger(s,'echo_burn',x=>burnEnemy(s,x));
  }else if(e.kind==='heal'){
   if(source==='echo')continue;
   const h=Math.min(s.maxHp-s.hp,v);s.hp+=h;s.heals+=h;metric(s,'healing',h);metric(s,'overheal',Math.max(0,v-h));if(active&&h>0)trigger(s,'heal_block',(x,r)=>{shield(s,x);if(r.prepare)prepare(s,r.prepare);} );
  }else if(e.kind==='prepare'){
   prepare(s,v);if(active)trigger(s,'prepare_block',x=>shield(s,x));
  }else if(e.kind==='mark'){
   mark(s,v);
   if(active){if(s.enemyBurn>0)trigger(s,'burn_mark',x=>mark(s,x));trigger(s,'mark_block',x=>shield(s,x));}
  }else if(e.kind==='counter'){
   s.counter=Math.max(s.counter,v);
  }else if(e.kind==='summon'){
   s.petHp=cap(s.petHp+v,12);log(s,`灯灵生命${s.petHp}/12`);
  }else if(e.kind==='forge'){
   const old=s.forge;s.forge=cap(s.forge+v,12);log(s,`锻造${s.forge}/12`);
   if(active&&s.forge>old)trigger(s,'forge_block',x=>shield(s,x));
  }else if(TARGET.has(e.kind)&&!NEW_TARGETS.has(e.kind)){
   if(!active||targetUid==null)continue;
   const index=s.hand.findIndex(x=>x.uid===targetUid);
   if(index<0)throw new RangeError('选择的手牌目标已不可用');
   if(e.kind==='retain'){s.retainedUid=targetUid;trigger(s,'hand_manage_prepare',x=>prepare(s,x));continue;}
   const [entity]=s.hand.splice(index,1);
   if(e.kind==='sift'){s.discard.push(entity);draw(s,1,source);log(s,'择弃并补抽1张');trigger(s,'hand_manage_prepare',x=>prepare(s,x));}
   else{s.exhaust.push(entity);trigger(s,'other_exhaust_prepare',x=>prepare(s,x));trigger(s,'other_exhaust_pierce',x=>{s.pierceReady=x;});log(s,'另一张手牌本战消耗');}
 }else if(e.kind==='echo_next'){
   if(active){const capacity=Math.max(0,3-s.echoCount-s.echoCharges);const added=Math.min(capacity,Math.max(1,Math.floor(v)));s.echoCharges+=added;s.echoReady=s.echoCharges>0;log(s,added?`回声蓄能+${added}：打出可回声牌后，可选择安排到下轮重放`:'回声蓄能已达本战上限');}
  }else if(e.kind==='self_echo'){
   if(active&&!s.battleFlags.includes(`card-echo:${definition.uid}`)){selfEcho=Math.max(selfEcho,Math.max(1,Math.floor(v)));}
  }else if(e.kind==='delay_burn'){
   if(active&&s.delayed.length<2){s.delayed.push({kind:'burn',value:v});log(s,'下轮施放延迟火种');}
  }else if(e.kind==='attack_bonus'){
   s.itemAttackBonus=Math.max(s.itemAttackBonus,v);
  }else if(e.kind==='draw'){
   if((active||source==='item')&&conditionMet(e.condition,before,s)){const count=s.hand.length;draw(s,v,source);if(active&&s.hand.length>count)trigger(s,'hand_manage_prepare',x=>prepare(s,x));}
  }else if(e.kind==='cleanse_player'){
   s.burn=Math.max(0,s.burn-v);
  }else if(applyNewEffect({s,e,definition,targetUid,active,catalog:CATALOG,shield,draw,prepare,burnEnemy,metric,trigger,log})){}else throw new TypeError(`unsupported effect kind ${e.kind}`);
  terminal(s);
 }
 if(s.result)return;
 if(active&&definition.exhaust)trigger(s,'active_exhaust_block',v=>shield(s,v));
 if(active&&selfEcho&&queueEcho(s,{...definition,replayable:true},selfEcho))s.battleFlags.push(`card-echo:${definition.uid}`);
 if(active&&s.echoCharges>0&&!definition.effects.some(e=>e.kind==='echo_next')&&definition.replayable&&!hasHealing(definition)){
  if(!s.echoEligibleUids.includes(definition.uid))s.echoEligibleUids.push(definition.uid);
  log(s,`可安排回声：${definition.name??CATALOG.cards[definition.cardId]?.name??'这张牌'}`);
 }
 if(active&&definition.replayable&&!s.echoQueuedThisAction&&s.echoCount<3){
  for(const [id] of relics(s,'echo'))if(!s.battleFlags.includes(id)&&queueEcho(s,definition)){s.battleFlags.push(id);break;}
 }
 if(source==='echo')trigger(s,'echo_block',v=>shield(s,v));
}
function reactionKey(s,intent){return intent.recordMode==='first'?(s.firstCardKind==='attack'?'attack':'other'):(s.plays<=2?'few':'many');}
function enhanced(s,raw,atTurn){
 const enemy=CATALOG.enemies[s.enemyId],phase2=s.enemyPhase===2&&atTurn>=s.phaseStartTurn,i=clone(raw);
 const enhance=p=>{
  if(p.kind==='attack'||p.kind==='charge')p.value=threatValue(enemy,p)+enemyPressureFor(enemy,atTurn)+s.attackBonus+(phase2&&enemy.role==='Boss'?s.bossPhaseAttackBonus:0);
  if(p.kind==='conditional'){enhance(p.onAttack);enhance(p.onOther);}
  if(p.kind==='tempo'){enhance(p.onCalm);enhance(p.onRush);}
  if(p.kind==='charge'&&p.next)enhance(p.next);
 };
 enhance(i);if(i.kind==='thorns')i.thorns=i.value;return i;
}
function intentAt(s,atTurn,withNext=true){
 const enemy=CATALOG.enemies[s.enemyId],phase2=s.enemyPhase===2&&atTurn>=s.phaseStartTurn;
 const pool=phase2?enemy.phaseIntents:enemy.intents,offset=phase2?atTurn-s.phaseStartTurn:atTurn-1;
 let raw=clone(pool[offset%pool.length]);
 if(raw.kind==='respond'){
  const response=s.intent?.recordMode&&atTurn===s.turn+1?s.intent.responses[reactionKey(s,s.intent)]:s.recordedResponse;
  if(!response)throw new Error('反制轮缺少已记录分支');raw={...clone(response),responseLocked:true};
 }
 if(raw.furnaceStrike){const weak=s.furnaceOutcomeLocked?s.furnaceWeak:s.furnaceBroken;if(weak){raw.value=raw.weakValue;raw.furnaceWeakened=true;}}
 const intent=enhanced(s,raw,atTurn);
 if(withNext&&intent.kind==='charge'&&intent.next)intent.next=intentAt(s,atTurn+1,false);
 if(intent.kind==='attack'&&s.chargeBreakPending)intent.value=Math.max(1,intent.value-s.chargeBreakPending.reduction);
 return intent;
}
function syncResponsePreview(s){
 if(!s.intent?.recordMode){s.responseOptions=null;s.responsePreview=null;return;}
 s.responseOptions=Object.fromEntries(Object.entries(s.intent.responses).map(([key,raw])=>[key,enhanced(s,raw,s.turn+1)]));
 s.responsePreview=clone(s.responseOptions[reactionKey(s,s.intent)]);
}
function syncChargeNext(s){
 const next=intentAt(s,s.turn+1);
 if(s.intent?.kind==='charge'&&s.intent.next){
  const preview=clone(next);
  if(preview.kind==='attack'&&s.chargeBreakReady&&s.intent.chargeBreak)preview.value=Math.max(1,preview.value-s.intent.chargeBreak.reduction);
  s.intent.next=preview;
 }
}
function previewIntent(s){
 const intent=intentAt(s,s.turn);
 s.enemyPressure=enemyPressureFor(CATALOG.enemies[s.enemyId],s.turn);
 s.enemyArmor=Math.max(0,CATALOG.enemies[s.enemyId].armor+(intent.armor??0));
 return intent;
}
function startTurn(s){
 s.turn++;s.shield=s.bankedShield??0;s.bankedShield=0;s.hitReduction=0;s.extraPlays=0;s.cardDiscounts=Object.fromEntries(Object.entries(s.pendingRetainDiscounts??{}).filter(([uid])=>s.hand.some(c=>String(c.uid)===uid)));s.pendingRetainDiscounts={};s.energy=3;s.plays=0;s.counter=0;s.itemAttackBonus=0;s.turnFlags=[];s.firstCardKind=null;s.chargeDamage=0;s.chargeBreakReady=false;
 if(s.prepareUntil<s.turn)s.prepare=0;if(s.markUntil<s.turn)s.mark=0;
 s.intent=previewIntent(s);s.chargeBreakPending=null;s.phaseNextIntent=null;
 if(s.intent.clearShield)s.enemyShield=0;
 if(s.intent.startShield)s.enemyShield=Math.max(s.enemyShield,s.intent.startShield);
 if(s.intent.recordMode)s.recordedResponse=null;
 syncResponsePreview(s);
 if(s.intent?.kind==='charge')syncChargeNext(s);
 if(s.turn===1)trigger(s,'start_pet',v=>{s.petHp=cap(s.petHp+v,12);});
 const echoes=s.pendingEchoes;s.pendingEchoes=[];s.echo=null;
 for(const echo of echoes){apply(s,echo.definition,'echo');if(s.result)return;}
 const delays=s.delayed;s.delayed=[];for(const e of delays)burnEnemy(s,e.value);
 draw(s,5-s.hand.length);
}
function endTurn(s){
 if(s.result)return;
 const kept=s.hand.find(e=>e.uid===s.retainedUid);
 if(kept)metric(s,'retainSucceeded');
 s.discard.push(...s.hand.filter(e=>e.uid!==kept?.uid));s.hand=kept?[kept]:[];s.retainedUid=null;
 if(!s.intent.furnaceCharge)s.enemyShield=0;
 let i=s.intent;
 if(i.kind==='conditional')i=s.firstCardKind==='attack'?i.onAttack:i.onOther;
 if(i.kind==='tempo')i=s.plays<=i.playThreshold?i.onCalm:i.onRush;
 if(i.kind==='attack'){
  for(let n=0;n<(i.hits??1);n++){
   s.attacksTaken++;
   metric(s,'incomingAttackDamage',i.value);
   const incoming=Math.max(0,i.value-(n===0?(s.hitReduction??0):0));if(n===0)s.hitReduction=0;const absorbed=Math.min(s.shield,incoming);s.shield-=absorbed;if(absorbed)metric(s,'shieldAbsorbed',absorbed);
   const remaining=incoming-absorbed;const petTaken=Math.min(s.petHp,remaining);metric(s,'petAbsorbed',petTaken);metric(s,'attackHpLost',Math.min(s.hp,remaining-petTaken));s.petHp-=petTaken;s.hp-=remaining-petTaken;
   if(petTaken)log(s,`灯灵挡伤${petTaken}`);
   if(terminal(s))return;
   if(absorbed>0){
    trigger(s,'block_burn',v=>burnEnemy(s,v));
    if(s.counter>0&&!s.turnFlags.includes('card-counter')){s.turnFlags.push('card-counter');damage(s,s.counter,{source:'reflect',consume:false});}
    if(s.result)return;
    for(const [,r] of relics(s,'reflect')){damage(s,r.value,{source:'reflect',consume:false});if(s.result)return;}
   }
  }
  if(i.shieldAfter)s.enemyShield=i.shieldAfter;
  if(i.opensFurnace){s.furnaceArmed=true;s.furnaceBroken=false;s.furnaceWeak=false;s.furnaceOutcomeLocked=false;s.furnaceShieldMax=i.shieldAfter;}
  if(i.recordMode)s.recordedResponse=clone(i.responses[reactionKey(s,i)]);
 }else if(i.kind==='guard')s.enemyShield=i.value;
 else if(i.kind==='burn')s.burn=cap(s.burn+i.value,20);
 else if(i.kind==='cleanse')s.enemyBurn=Math.max(0,s.enemyBurn-i.value);
 else if(i.kind==='heal'){
  if(!s.battleFlags.includes('enemy-healed')){s.battleFlags.push('enemy-healed');s.enemyHp=Math.min(s.enemyMaxHp,s.enemyHp+i.value);}
 }else if(i.kind!=='charge'&&i.kind!=='thorns')throw new TypeError(`unsupported intent kind ${i.kind}`);
 metric(s,'burnHpLost',Math.min(s.hp,s.burn));s.hp-=s.burn;s.burn=Math.max(0,s.burn-1);if(terminal(s))return;
 const burnLoss=Math.min(s.enemyHp,s.enemyBurn);s.enemyHp-=burnLoss;if(burnLoss>0)s.chargeDamage=(s.chargeDamage??0)+burnLoss;s.enemyBurn=Math.max(0,s.enemyBurn-1);if(terminal(s))return;
 if(i.kind==='charge'&&i.chargeBreak&&s.chargeDamage>=i.chargeBreak.threshold){
  const next=intentAt(s,s.turn+1);
  if(next.kind==='attack'){
   s.chargeBreakPending={reduction:i.chargeBreak.reduction};
   if(i.next)i.next={kind:'attack',value:Math.max(1,next.value-i.chargeBreak.reduction),hits:next.hits??1,...(next.label?{label:next.label}:{})};
   log(s,'破势：紧接攻击每段伤害减少'+i.chargeBreak.reduction);
  } else { s.chargeBreakPending=null; syncChargeNext(s); log(s,'阶段切换覆盖破势：下一轮为非攻击意图，不产生破势减伤'); }
 }
 if(i.furnaceCharge){s.furnaceWeak=Boolean(s.furnaceBroken);s.furnaceOutcomeLocked=true;s.furnaceArmed=false;s.enemyShield=0;}
 if(i.phaseRest&&s.enemyPhasePending===2&&!s.result){s.enemyPhase=2;s.enemyPhasePending=null;s.phaseStartTurn=s.turn+1;s.enemyShield=cap(s.enemyShield+s.phaseShield,30);s.phaseNextIntent=intentAt(s,s.turn+1);log(s,'当前循环结束：第二阶段下轮开始');}
 if(s.turn>=s.prepareUntil)s.prepare=0;if(s.turn>=s.markUntil)s.mark=0;
 s.shield=0;
}
function invariant(s){
 const ids=['draw','hand','discard','exhaust'].flatMap(p=>s[p].map(e=>e.uid));
 if(new Set(ids).size!==ids.length||ids.length!==s.deck.length)throw new Error('实体牌堆不一致');
 const deck=new Set(s.deck.map(e=>e.uid));if(ids.some(id=>!deck.has(id)))throw new Error('未知牌实体');
 if(s.energy<0||s.plays>playLimitFor(s)||s.petHp<0||s.petHp>12||s.forge<0||s.forge>12||s.echoCount>3||s.echoCharges<0||s.echoCount+s.echoCharges>3||s.echoReady!==(s.echoCharges>0)||s.items.length>2||s.hand.length>5||!Array.isArray(s.echoEligibleUids)||new Set(s.echoEligibleUids).size!==s.echoEligibleUids.length||s.echoEligibleUids.some(uid=>!(s.deck??[]).some(e=>e.uid===uid)))throw new Error('战斗资源不一致');
}
export function legalItems(s){
 if(!s||s.result||s.itemUsed)return [];
 return s.items.map((id,itemIndex)=>({id,itemIndex,item:ITEMS[id]})).filter(x=>x.item&&!(x.item.effects.every(e=>e.kind==='draw')&&s.hand.length>=5)&&!(x.item.effects.every(e=>e.kind==='heal')&&s.hp>=s.maxHp)&&!(x.item.effects.every(e=>e.kind==='cleanse_player')&&s.burn===0));
}
export function legalCards(s){
 if(!s||s.result)return [];
 return s.hand.filter(entity=>{
  const d=cardDef(entity,s);if(supportUnavailable(s,{...d,uid:entity.uid},CATALOG))return false;
  if(s.plays>=playLimitFor(s)||d.cost>s.energy)return false;
  if(d.effects.every(e=>e.kind==='heal')&&s.hp>=s.maxHp)return false;
  if(d.effects.every(e=>e.kind==='pet_attack'||e.kind==='sacrifice')&&s.petHp===0)return false;
  if(d.effects.every(e=>TARGET.has(e.kind))&&s.hand.length<2)return false;
  return true;
 }).map(clone);
}
function advance(s){if(!s.result&&legalCards(s).length===0&&legalItems(s).length===0&&legalEchoes(s).length===0){endTurn(s);if(!s.result)startTurn(s);}invariant(s);}
export function beginBattle({enemyId,deck,relics,hp,seed=0,professionId='traveler',items=[],difficulty=0,dangerous=false,extraAttackBonus=0,bossHpMultiplier=1}){
 const rules=getDifficultyRules(difficulty);
 if(!Number.isInteger(extraAttackBonus)||extraAttackBonus<0||extraAttackBonus>3||!Number.isFinite(bossHpMultiplier)||bossHpMultiplier<.85||bossHpMultiplier>1)throw new TypeError('事件战斗参数无效');
 const e=CATALOG.enemies[enemyId];if(!e)throw new TypeError('未知敌人');
 if(!Array.isArray(deck)||!deck.length||new Set(deck.map(e=>e.uid)).size!==deck.length||deck.some(e=>!Number.isInteger(e.uid)||!cardAllowed(CATALOG,e.cardId,professionId)||typeof e.upgraded!=='boolean'))throw new TypeError('牌组无效');
 if(!Array.isArray(relics)||new Set(relics).size!==relics.length||relics.some(id=>!CATALOG.relics[id]))throw new TypeError('遗物无效');
 if(!Number.isInteger(hp)||hp<0||hp>rules.maxHp||items.length>2||items.some(id=>!ITEMS[id]))throw new TypeError('生命或道具无效');
 const enemyHp=Math.ceil(e.hp*(e.role==='普通'?rules.normalHpMultiplier:e.role==='精英'?rules.eliteHpMultiplier:rules.bossHpMultiplier)*rules.allHpMultiplier*(dangerous?1.1:1)*(e.role==='Boss'?bossHpMultiplier:1));
 const s={ruleVersion:'lantern-rules-v0.22',professionId,difficulty,dangerous,enemyId,hp,maxHp:rules.maxHp,enemyMaxHp:enemyHp,enemyPhase:1,phaseStartTurn:0,enemyPhasePending:null,actIndex:e.actIndex,furnaceArmed:false,furnaceBroken:false,furnaceWeak:false,furnaceOutcomeLocked:false,furnaceShieldMax:0,recordedResponse:null,responseOptions:null,responsePreview:null,phaseThreshold:e.role==='Boss'?rules.bossPhaseThreshold:.5,phaseShield:rules.phaseShield,phaseNextIntent:null,attackBonus:rules.attackBonus+(dangerous?1:0)+extraAttackBonus,extraAttackBonus,bossHpMultiplier,bossPhaseAttackBonus:rules.bossPhaseAttackBonus,result:hp<=0?'DEFEAT':null,turn:0,hand:[],draw:clone(deck),discard:[],exhaust:[],deck:clone(deck),relics:[...relics],relicTriggerCounts:{},pressurePlan:clone(e.pressure??null),enemyPressure:0,bankedShield:0,hitReduction:0,extraPlays:0,pendingRetainDiscounts:{},cardDiscounts:{},forgeSpentThisCard:0,items:[...items],itemUsed:false,itemsUsed:0,itemAttackBonus:0,energy:0,plays:0,picked:[],intent:null,enemyHp,enemyArmor:e.armor,enemyShield:e.role==='精英'?rules.eliteOpeningShield:0,enemyBurn:0,shield:0,burn:0,chargeDamage:0,chargeBreakReady:false,chargeBreakPending:null,prepare:0,prepareUntil:0,mark:0,markUntil:0,petHp:0,forge:0,pierceReady:0,echo:null,pendingEchoes:[],echoCount:0,echoReady:false,echoCharges:0,echoEligibleUids:[],echoQueuedThisAction:false,delayed:[],retainedUid:null,counter:0,firstCardKind:null,battleFlags:[],turnFlags:[],heals:0,selfLoss:0,attacksTaken:0,rngState:hash(seed),log:[],effectMetrics:{healing:0,overheal:0,shieldAbsorbed:0,prepareConsumed:0,markConsumed:0,drawSucceeded:0,retainSucceeded:0,upgradedCardsPlayed:0,echoReplays:0}};
 if(!s.result){shuffle(s,s.draw);startTurn(s);advance(s);}syncResponsePreview(s);invariant(s);return s;
}
export function battleAction(battle,action){
 if(!battle||battle.result)throw new RangeError('战斗已经结束');
 const s=clone(battle);s.echoQueuedThisAction=false;
 if(action.type==='PLAY'){
  const index=s.hand.findIndex(e=>e.uid===action.uid);if(index<0||!legalCards(s).some(e=>e.uid===action.uid))throw new RangeError('手牌当前不可用');
  const entity=s.hand[index],d=cardDef(entity,s);
  if(entity.upgraded)metric(s,'upgradedCardsPlayed');
  if(action.targetUid!=null&&(!d.effects.some(e=>TARGET.has(e.kind))||action.targetUid===entity.uid||!s.hand.some(e=>e.uid===action.targetUid)))throw new RangeError('目标不是另一张真实手牌');
  if(d.effects.every(e=>TARGET.has(e.kind))&&action.targetUid==null)throw new RangeError('请选择目标手牌');
  if(d.effects.some(e=>NEW_TARGETS.has(e.kind))&&(action.targetUid==null||!supportTargetAllowed(s,d,s.hand.find(e=>e.uid===action.targetUid),CATALOG)))throw new RangeError('手牌目标不符合效果条件');
  if(s.pendingRetainDiscounts)delete s.pendingRetainDiscounts[entity.uid];
  s.hand.splice(index,1);s[d.exhaust?'exhaust':'discard'].push(entity);s.energy-=d.cost;s.plays++;s.picked.push(entity.cardId);
  if(s.firstCardKind===null)s.firstCardKind=d.effects.some(e=>DIRECT.has(e.kind))?'attack':'other';
  log(s,`打出${d.name??CATALOG.cards[entity.cardId].name}`);
  apply(s,{...d,cardId:entity.cardId,upgraded:entity.upgraded,uid:entity.uid},'active',action.targetUid??null);
  if(!s.result&&!legalEchoes(s).length&&(s.plays>=playLimitFor(s)||(!legalCards(s).length&&!legalItems(s).length))){endTurn(s);if(!s.result){startTurn(s);advance(s);}}
 }else if(action.type==='ECHO'){
  const selected=legalEchoes(s).find(e=>e.uid===action.uid);
  if(!selected)throw new RangeError('当前没有符合条件的回声牌');
  const entity=s.deck.find(e=>e.uid===selected.uid),definition={...cardDef(entity),cardId:entity.cardId,upgraded:entity.upgraded,uid:entity.uid};
  if(!queueEcho(s,definition,1,{consumeCharge:true}))throw new RangeError('这张牌当前不能安排回声');
  s.echoCharges=Math.max(0,s.echoCharges-1);s.echoReady=s.echoCharges>0;s.echoEligibleUids=s.echoReady?s.echoEligibleUids.filter(uid=>uid!==selected.uid):[];log(s,`已选择${definition.name??CATALOG.cards[entity.cardId]?.name??'手牌'}，下轮免费重放`);
 }else if(action.type==='ITEM'){
  const item=legalItems(s).find(x=>x.itemIndex===action.itemIndex);if(!item)throw new RangeError('本战道具已用或当前不可用');
  s.items.splice(item.itemIndex,1);s.itemUsed=true;s.itemsUsed=1;log(s,`使用${item.item.name}`);
  apply(s,{cost:0,selfCost:0,exhaust:false,replayable:false,effects:item.item.effects},'item');
  if(!s.result)advance(s);
 }else if(action.type==='END_TURN'){
  endTurn(s);if(!s.result){startTurn(s);advance(s);}
 }else throw new TypeError('未知战斗操作');
 syncResponsePreview(s);invariant(s);return s;
}
