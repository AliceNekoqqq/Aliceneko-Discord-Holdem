import {CATALOG_V06 as CATALOG, ITEMS} from './rogue-content-v06.mjs';

const clone=v=>JSON.parse(JSON.stringify(v));
const DIRECT=new Set(['damage','pet_attack','weapon_attack','sacrifice','damage_from_shield']);
const TARGET=new Set(['sift','retain','exhaust_other']);
const CONTROL=new Set([...TARGET,'echo_next','self_echo','delay_burn']);
const cap=(v,max)=>Math.min(max,Math.max(0,v));
const cardDef=e=>e.upgraded?{...CATALOG.cards[e.cardId],...CATALOG.cards[e.cardId].upgrade}:CATALOG.cards[e.cardId];
const log=(s,t)=>{s.log.push(t);s.log=s.log.slice(-8);};
function hash(seed){let n=0x811c9dc5;for(const c of String(seed)){n^=c.charCodeAt(0);n=Math.imul(n,0x01000193)>>>0;}return n||1;}
function random(s){let x=s.rngState;x^=x<<13;x^=x>>>17;x^=x<<5;s.rngState=x>>>0||1;return s.rngState/4294967296;}
function shuffle(s,a){for(let i=a.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[a[i],a[j]]=[a[j],a[i]];}}
function terminal(s){if(s.hp<=0)s.result='DEFEAT';else if(s.enemyHp<=0)s.result='WIN';if(s.result){s.echo=null;s.pendingEchoes=[];s.delayed=[];}return s.result;}
function relics(s,trigger){return s.relics.filter(id=>CATALOG.relics[id]?.trigger===trigger).map(id=>[id,CATALOG.relics[id]]);}
function trigger(s,type,fn){for(const [id,r] of relics(s,type)){const flags=r.limit==='turn'?s.turnFlags:s.battleFlags;if(flags.includes(id))continue;flags.push(id);fn(r.value,r,id);if(s.result)break;}}
const shield=(s,v)=>{s.shield=cap(s.shield+v,30);};
const burnEnemy=(s,v)=>{s.enemyBurn=cap(s.enemyBurn+v,20);};
function prepare(s,v){s.prepare=cap(s.prepare+v,6);s.prepareUntil=s.turn+1;}
function mark(s,v){s.mark=cap(s.mark+v,4);s.markUntil=s.turn+1;}
function damage(s,value,{ignoreArmor=false,source='active',consume=true}={}){
 if(s.result)return 0;
 let n=value;
 if(consume&&(source==='active'||source==='echo')){
  n+=s.prepare+s.mark;s.prepare=0;s.mark=0;
  if(source==='active'){n+=s.itemAttackBonus;s.itemAttackBonus=0;}
 }
 const after=Math.max(0,n-(ignoreArmor?0:s.enemyArmor));
 const blocked=Math.min(s.enemyShield,after);s.enemyShield-=blocked;
 const loss=Math.min(s.enemyHp,after-blocked);s.enemyHp-=loss;
 if(terminal(s))return loss;
 if(source==='active'&&loss>0&&s.intent.thorns&&!s.turnFlags.includes('enemy-thorns')){
  s.turnFlags.push('enemy-thorns');s.hp-=s.intent.thorns;log(s,`反伤${s.intent.thorns}`);terminal(s);
 }
 return loss;
}
function draw(s,count){for(let i=0;i<count;i++){
 if(!s.draw.length){if(!s.discard.length)break;s.draw=s.discard;s.discard=[];shuffle(s,s.draw);}
 s.hand.push(s.draw.pop());
}}
function queueEcho(s,definition){
 if(s.echoCount>=2||s.echoQueuedThisAction||!definition.replayable||definition.effects.some(e=>e.kind==='heal'))return false;
 s.pendingEchoes.push({definition:clone(definition),cardId:definition.cardId,upgraded:definition.upgraded});s.echoCount++;s.echoQueuedThisAction=true;s.echo=s.pendingEchoes[0]??null;log(s,'已安排下一轮回声');return true;
}
function apply(s,definition,source='active',targetUid=null){
 if(s.result)return;
 const active=source==='active';
 const payment=definition.selfCost??0;s.hp-=payment;s.selfLoss+=payment;
 if(payment)log(s,`支付生命${payment}`);
 if(terminal(s))return;
 if(active&&payment>0)trigger(s,'self_block',v=>shield(s,v));
 let extra=0,ignore=false;
 if(active&&definition.effects.some(e=>DIRECT.has(e.kind))){
  trigger(s,'first_attack_damage',v=>{extra+=v;});
  if(s.pierceReady){ignore=true;extra+=s.pierceReady;s.pierceReady=0;}
 }
 let firstDamage=true,firstBlock=true,cardEcho=false;
 for(const e of definition.effects){
  if(s.result)break;
  const v=e.value??0;
  if(DIRECT.has(e.kind)){
   if((e.kind==='pet_attack'||e.kind==='sacrifice')&&s.petHp<=0)continue;
   let amount=v;
   if(e.kind==='weapon_attack'){amount+=s.forge;if(active)trigger(s,'weapon_bonus',x=>{amount+=x;});}
   if(e.kind==='sacrifice'){s.petHp=0;log(s,'灯灵牺牲');}
   if(e.kind==='damage_from_shield'){const spent=Math.min(s.shield,e.maxSpend??6);s.shield-=spent;amount+=spent;}
   const wasFirst=firstDamage;amount+=wasFirst?extra:0;firstDamage=false;
   const lost=damage(s,amount,{ignoreArmor:ignore||e.ignoreArmor===true,source,consume:wasFirst});
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
   const bonus=active?relics(s,'burn_bonus').reduce((a,[,r])=>a+r.value,0):0;
   burnEnemy(s,v+bonus);
   if(active)trigger(s,'burn_block',x=>shield(s,x));
   if(source==='echo')trigger(s,'echo_burn',x=>burnEnemy(s,x));
  }else if(e.kind==='heal'){
   if(source==='echo')continue;
   const h=Math.min(s.maxHp-s.hp,v);s.hp+=h;s.heals+=h;
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
  }else if(TARGET.has(e.kind)){
   if(!active||targetUid==null)continue;
   const index=s.hand.findIndex(x=>x.uid===targetUid);
   if(index<0)throw new RangeError('选择的手牌目标已不可用');
   if(e.kind==='retain'){s.retainedUid=targetUid;continue;}
   const [entity]=s.hand.splice(index,1);
   if(e.kind==='sift'){s.discard.push(entity);draw(s,1);log(s,'择弃并补抽1张');}
   else{s.exhaust.push(entity);trigger(s,'other_exhaust_prepare',x=>prepare(s,x));trigger(s,'other_exhaust_pierce',x=>{s.pierceReady=x;});log(s,'另一张手牌本战消耗');}
  }else if(e.kind==='echo_next'){
   if(active)s.echoReady=true;
  }else if(e.kind==='self_echo'){
   if(active&&!s.battleFlags.includes(`card-echo:${definition.uid}`)){cardEcho=true;}
  }else if(e.kind==='delay_burn'){
   if(active&&s.delayed.length<2){s.delayed.push({kind:'burn',value:v});log(s,'下轮施放延迟火种');}
  }else if(e.kind==='attack_bonus'){
   s.itemAttackBonus=Math.max(s.itemAttackBonus,v);
  }else if(e.kind==='cleanse_player'){
   s.burn=Math.max(0,s.burn-v);
  }else throw new TypeError(`unsupported effect kind ${e.kind}`);
  terminal(s);
 }
 if(s.result)return;
 if(active&&definition.exhaust)trigger(s,'active_exhaust_block',v=>shield(s,v));
 if(active&&cardEcho&&queueEcho(s,{...definition,replayable:true}))s.battleFlags.push(`card-echo:${definition.uid}`);
 if(active&&s.echoReady&&!definition.effects.some(e=>e.kind==='echo_next')&&queueEcho(s,definition))s.echoReady=false;
 if(active&&definition.replayable&&!s.echoQueuedThisAction&&s.echoCount<2){
  for(const [id] of relics(s,'echo'))if(!s.battleFlags.includes(id)&&queueEcho(s,definition)){s.battleFlags.push(id);break;}
 }
 if(source==='echo')trigger(s,'echo_block',v=>shield(s,v));
}
function previewIntent(s){
 const enemy=CATALOG.enemies[s.enemyId];
 const intent=clone(enemy.intents[(s.turn-1)%enemy.intents.length]);
 if(intent.kind==='thorns')intent.thorns=intent.value;
 if(intent.armor!==undefined)s.enemyArmor=enemy.armor+intent.armor;else s.enemyArmor=enemy.armor;
 return intent;
}
function startTurn(s){
 s.turn++;s.shield=0;s.energy=2;s.plays=0;s.counter=0;s.itemAttackBonus=0;s.turnFlags=[];s.firstCardKind=null;
 if(s.prepareUntil<s.turn)s.prepare=0;if(s.markUntil<s.turn)s.mark=0;
 s.intent=previewIntent(s);
 if(s.turn===1)trigger(s,'start_pet',v=>{s.petHp=cap(s.petHp+v,12);});
 const echoes=s.pendingEchoes;s.pendingEchoes=[];s.echo=null;
 for(const echo of echoes){apply(s,echo.definition,'echo');if(s.result)return;}
 const delays=s.delayed;s.delayed=[];for(const e of delays)burnEnemy(s,e.value);
 draw(s,4-s.hand.length);
}
function endTurn(s){
 if(s.result)return;
 const kept=s.hand.find(e=>e.uid===s.retainedUid);
 s.discard.push(...s.hand.filter(e=>e.uid!==kept?.uid));s.hand=kept?[kept]:[];s.retainedUid=null;
 s.enemyShield=0;
 let i=s.intent;
 if(i.kind==='conditional')i=s.firstCardKind==='attack'?i.onAttack:i.onOther;
 if(i.kind==='attack'){
  for(let n=0;n<(i.hits??1);n++){
   s.attacksTaken++;
   const absorbed=Math.min(s.shield,i.value);s.shield-=absorbed;
   const remaining=i.value-absorbed;const petTaken=Math.min(s.petHp,remaining);s.petHp-=petTaken;s.hp-=remaining-petTaken;
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
 }else if(i.kind==='guard')s.enemyShield=i.value;
 else if(i.kind==='burn')s.burn=cap(s.burn+i.value,20);
 else if(i.kind==='cleanse')s.enemyBurn=Math.max(0,s.enemyBurn-i.value);
 else if(i.kind==='heal'){
  if(!s.battleFlags.includes('enemy-healed')){s.battleFlags.push('enemy-healed');s.enemyHp=Math.min(CATALOG.enemies[s.enemyId].hp,s.enemyHp+i.value);}
 }else if(i.kind!=='charge'&&i.kind!=='thorns')throw new TypeError(`unsupported intent kind ${i.kind}`);
 s.hp-=s.burn;s.burn=Math.max(0,s.burn-1);if(terminal(s))return;
 s.enemyHp-=s.enemyBurn;s.enemyBurn=Math.max(0,s.enemyBurn-1);if(terminal(s))return;
 if(s.turn>=s.prepareUntil)s.prepare=0;if(s.turn>=s.markUntil)s.mark=0;
 s.shield=0;
 if(s.turn>=12){s.result='LOST_LIGHT';s.pendingEchoes=[];s.echo=null;s.delayed=[];}
}
function invariant(s){
 const ids=['draw','hand','discard','exhaust'].flatMap(p=>s[p].map(e=>e.uid));
 if(new Set(ids).size!==ids.length||ids.length!==s.deck.length)throw new Error('实体牌堆不一致');
 const deck=new Set(s.deck.map(e=>e.uid));if(ids.some(id=>!deck.has(id)))throw new Error('未知牌实体');
 if(s.energy<0||s.plays>2||s.petHp<0||s.petHp>12||s.forge<0||s.forge>12||s.echoCount>2||s.items.length>2)throw new Error('战斗资源不一致');
}
export function legalItems(s){
 if(!s||s.result||s.itemUsed)return [];
 return s.items.map((id,itemIndex)=>({id,itemIndex,item:ITEMS[id]})).filter(x=>x.item&&!(x.item.effects.every(e=>e.kind==='heal')&&s.hp>=s.maxHp)&&!(x.item.effects.every(e=>e.kind==='cleanse_player')&&s.burn===0));
}
export function legalCards(s){
 if(!s||s.result)return [];
 return s.hand.filter(entity=>{
  const d=cardDef(entity);
  if(s.plays>=2||d.cost>s.energy)return false;
  if(d.effects.every(e=>e.kind==='heal')&&s.hp>=s.maxHp)return false;
  if(d.effects.every(e=>e.kind==='pet_attack'||e.kind==='sacrifice')&&s.petHp===0)return false;
  if(d.effects.every(e=>TARGET.has(e.kind))&&s.hand.length<2)return false;
  return true;
 }).map(clone);
}
function advance(s){while(!s.result&&legalCards(s).length===0&&legalItems(s).length===0){endTurn(s);if(!s.result)startTurn(s);}invariant(s);}
export function beginBattle({enemyId,deck,relics,hp,seed=0,professionId='traveler',items=[]}){
 const e=CATALOG.enemies[enemyId];if(!e)throw new TypeError('未知敌人');
 if(!Array.isArray(deck)||!deck.length||new Set(deck.map(e=>e.uid)).size!==deck.length||deck.some(e=>!Number.isInteger(e.uid)||!CATALOG.cards[e.cardId]||typeof e.upgraded!=='boolean'))throw new TypeError('牌组无效');
 if(!Array.isArray(relics)||new Set(relics).size!==relics.length||relics.some(id=>!CATALOG.relics[id]))throw new TypeError('遗物无效');
 if(!Number.isInteger(hp)||hp<0||hp>30||items.length>2||items.some(id=>!ITEMS[id]))throw new TypeError('生命或道具无效');
 const s={ruleVersion:'lantern-rules-v0.6',professionId,enemyId,hp,maxHp:30,result:hp<=0?'DEFEAT':null,turn:0,hand:[],draw:clone(deck),discard:[],exhaust:[],deck:clone(deck),relics:[...relics],items:[...items],itemUsed:false,itemsUsed:0,itemAttackBonus:0,energy:0,plays:0,picked:[],intent:null,enemyHp:e.hp,enemyArmor:e.armor,enemyShield:0,enemyBurn:0,shield:0,burn:0,prepare:0,prepareUntil:0,mark:0,markUntil:0,petHp:0,forge:0,pierceReady:0,echo:null,pendingEchoes:[],echoCount:0,echoReady:false,echoQueuedThisAction:false,delayed:[],retainedUid:null,counter:0,firstCardKind:null,battleFlags:[],turnFlags:[],heals:0,selfLoss:0,attacksTaken:0,rngState:hash(seed),log:[]};
 if(!s.result){shuffle(s,s.draw);startTurn(s);advance(s);}invariant(s);return s;
}
export function battleAction(battle,action){
 if(!battle||battle.result)throw new RangeError('战斗已经结束');
 const s=clone(battle);s.echoQueuedThisAction=false;
 if(action.type==='PLAY'){
  const index=s.hand.findIndex(e=>e.uid===action.uid);if(index<0||!legalCards(s).some(e=>e.uid===action.uid))throw new RangeError('手牌当前不可用');
  const entity=s.hand[index],d=cardDef(entity);
  if(action.targetUid!=null&&(!d.effects.some(e=>TARGET.has(e.kind))||action.targetUid===entity.uid||!s.hand.some(e=>e.uid===action.targetUid)))throw new RangeError('目标不是另一张真实手牌');
  if(d.effects.every(e=>TARGET.has(e.kind))&&action.targetUid==null)throw new RangeError('请选择目标手牌');
  s.hand.splice(index,1);s[d.exhaust?'exhaust':'discard'].push(entity);s.energy-=d.cost;s.plays++;s.picked.push(entity.cardId);
  if(s.firstCardKind===null)s.firstCardKind=d.effects.some(e=>DIRECT.has(e.kind))?'attack':'other';
  log(s,`打出${d.name??CATALOG.cards[entity.cardId].name}`);
  apply(s,{...d,cardId:entity.cardId,upgraded:entity.upgraded,uid:entity.uid},'active',action.targetUid??null);
  if(!s.result&&(s.plays>=2||(!legalCards(s).length&&!legalItems(s).length))){endTurn(s);if(!s.result){startTurn(s);advance(s);}}
 }else if(action.type==='ITEM'){
  const item=legalItems(s).find(x=>x.itemIndex===action.itemIndex);if(!item)throw new RangeError('本战道具已用或当前不可用');
  s.items.splice(item.itemIndex,1);s.itemUsed=true;s.itemsUsed=1;log(s,`使用${item.item.name}`);
  apply(s,{cost:0,selfCost:0,exhaust:false,replayable:false,effects:item.item.effects},'item');
  if(!s.result)advance(s);
 }else if(action.type==='END_TURN'){
  endTurn(s);if(!s.result){startTurn(s);advance(s);}
 }else throw new TypeError('未知战斗操作');
 invariant(s);return s;
}
