import {renderRogueReading,renderRogue,renderRogueHome,renderRogueSettings,renderRogueBoard,renderRogueConfirmation,renderRogueDetails,renderRogueUidPage,renderRogueEchoMenu,rogueUidEligible,parseRogueAction} from './rogue-ui.mjs';

const privateError=content=>({type:4,data:{flags:64,content,allowed_mentions:{parse:[]}}});
const errors={INSUFFICIENT_HP:'这项交易需要保留至少1点生命。',PACT_USED:'这项契约已生效，请选择免费离开。',INVENTORY_FULL:'道具槽已满，请明确选择要替换的槽位。',OWNER:'请打开属于自己的冒险。',GUILD:'这局属于另一个服务器。',STALE:'这个按钮已过期，请重新打开当前冒险。',STALE_VERSION:'这个按钮已过期，请重新打开当前冒险。',INSUFFICIENT_EMBERS:'余烬不足，可以免费离开这个房间。',FULL_HEALTH:'现在已经满血。',SERVICE_USED:'本次服务已使用。',SOLD_OUT:'这张牌已经售出。',MINIMUM_DECK:'牌组至少保留4张。',ILLEGAL_CARD:'这张牌当前无法打出。',ILLEGAL_ECHO:'这张牌当前不能安排回声。',RUN_FINISHED:'这局已经结束。'};
// Only call after the existing worker verifies Discord's request signature.
// Identity comes from signed interaction fields, never from custom_id or body
// overrides. Clock/seed/payment eligibility remain service-owned.
export function dispatchRogue(service,interaction,{onVisual}={}){
 const render=(run,options)=>{const reply=renderRogue(run,options);if(run)onVisual?.(run,'auto');return reply;};
 const id=interaction?.member?.user?.id;
 const guild=interaction?.guild_id;
 if(!id||!guild||guild!==service.guild)return privateError('请在所属服务器打开自己的冒险。');
 if(interaction.member.user.bot)return privateError('冒险奖励只向真人来客开放。');
 const base={guild,id,name:interaction.member.nick||interaction.member.user.global_name||interaction.member.user.username||'',requestId:interaction.id};
 const homeInfo=()=>service.homeInfo?.({guild,id})??{progress:[],challengeProfession:service.challengeProfession?.(base)??null,challengeDifficulty:0};
 const update=interaction.type===3&&!!(interaction.message?.flags&64);
 try{
  if(interaction.type===2){const run=service.resume(base);return run&&run.phase!=='RESULT'?render(run):renderRogueHome({homeInfo:homeInfo()});}
  const parsed=parseRogueAction(interaction.data?.custom_id,interaction.data?.values||[]);
  if(!parsed)return privateError('这个冒险按钮无效，请重新打开冒险。');
  if(parsed.ui==='reading')return renderRogueReading(parsed.kind,parsed.professionId,{update});
  if(parsed.ui==='board')return renderRogueBoard(service.leaderboard(base),{update});
  if(parsed.ui==='home'){
   const run=service.resume(base);return run&&run.phase!=='RESULT'?render(run,{update}):renderRogueHome({homeInfo:homeInfo(),update});
  }
  if(parsed.ui==='settings'){
   const info=homeInfo();
   return renderRogueSettings({professionId:parsed.professionId,difficulty:parsed.difficulty,homeInfo:info,update,catalogVersion:info.rulesVersion??'0.8'});
  }
  if(parsed.ui==='start'||parsed.ui==='practice')return render(service.start({...base,mode:parsed.mode??'normal',practice:parsed.ui==='practice',professionId:parsed.professionId,difficulty:parsed.difficulty??0}),{update});
  const request={...base,runId:parsed.runId,version:parsed.version};
  if(parsed.ui){
   const run=service.resume(request);
   if(!run)return renderRogueHome();
   if(parsed.ui==='refresh')return render(run,{update});
   if(parsed.ui==='details'){const reply=renderRogueDetails(run,parsed.kind,{update,page:parsed.page});if(parsed.kind==='map')onVisual?.(run,'map');return reply;}
   if(parsed.version!==run.version)return privateError(errors.STALE);
   if(parsed.ui==='echo'){
    if(run.phase!=='BATTLE'||!['lantern-rules-v0.16','lantern-rules-v0.17'].includes(run.ruleVersion))return privateError('当前规则或阶段不能使用回声。');
    return renderRogueEchoMenu(run,{update,page:parsed.page});
   }
   if(parsed.ui==='uid-page'){
    if(run.phase!=='ROOM'||run.room?.type!==parsed.source)return privateError('当前房间不能打开该牌组页面。');
    if(parsed.source==='shop'&&(!['upgrade','remove'].includes(parsed.kind)||(run.room.services?.[parsed.kind])||run.embers<(run.room.prices?.[parsed.kind]??0)))return privateError('当前商店服务不可用。');
    if(parsed.source==='camp'&&parsed.kind!=='upgrade')return privateError('营地只提供升级服务。');
    if(parsed.source==='event'&&(!(run.room.choices||[]).includes(parsed.kind)||parsed.kind==='upgrade'&&run.embers<(run.room.upgradeCost??0)||parsed.kind==='remove'&&run.embers<(run.room.removeCost??0)))return privateError('当前事件不提供该服务。');
    return renderRogueUidPage(run,parsed.source,parsed.kind,parsed.page,{update});
   }
   if(parsed.ui==='uid-select'){
    if(run.phase!=='ROOM'||run.room?.type!==parsed.source)return privateError('当前房间不能进行该操作。');
    const deck=run.deck??[]; const entity=deck.find(e=>e.uid===parsed.uid);
    if(!entity||!rogueUidEligible(run,parsed.source,parsed.kind,parsed.uid))return privateError('这张实体牌当前不可选。');
    if(parsed.source==='shop'){
     const price=run.room.prices?.[parsed.kind]??0;
     if(run.room.services?.[parsed.kind]||run.embers<price)return privateError('当前商店服务不可用。');
     const updated=service.act({...request,action:{type:'SHOP',choice:parsed.kind,uid:parsed.uid}});
     return render(updated,{update});
    }
    if(parsed.source==='camp'){
     if(parsed.kind!=='upgrade')return privateError('营地只提供升级服务。');
     const updated=service.act({...request,action:{type:'CAMP',choice:'upgrade',uid:parsed.uid}});
     return render(updated,{update});
    }
    const choice=parsed.kind, candidates=choice==='upgrade'?run.room.upgradeCandidates:run.room.removeCandidates;
    if(!(run.room.choices||[]).includes(choice)||Array.isArray(candidates)&&!candidates.includes(parsed.uid))return privateError('这张牌不在当前事件的候选范围内。');
    const isUpgrade=choice==='upgrade';
    return renderRogueConfirmation(run,{type:isUpgrade?'event-upgrade':'event-remove',uid:parsed.uid,cost:isUpgrade?run.room.upgradeCost??0:run.room.removeCost??0},{update});
   }
   if(parsed.ui==='ask-retreat'&&run.phase==='CHECKPOINT')return renderRogueConfirmation(run,'retreat',{update});
   if(parsed.ui==='ask-abandon'&&run.phase!=='RESULT')return renderRogueConfirmation(run,'abandon',{update});
   if(parsed.ui==='event-confirm'&&run.phase==='ROOM'&&run.room?.type==='event'){
    const room=run.room,allowed=new Set(room.choices||['heal','card','leave']);
    if(parsed.kind==='pact'&&allowed.has('pact')&&room.consequence)return renderRogueConfirmation(run,{type:'event-pact'},{update});
    if(parsed.kind==='heal'&&allowed.has('heal'))return renderRogueConfirmation(run,{type:'event-heal',cost:room.healCost??0,amount:room.healAmount??0},{update});
    if(parsed.kind==='card'&&allowed.has('card')&&room.candidates?.includes(parsed.cardId))return renderRogueConfirmation(run,{type:'event-card',cardId:parsed.cardId,cost:room.cardCost??0},{update});
    if(parsed.kind==='item'&&allowed.has('item')&&room.itemCandidates?.includes(parsed.itemId))return renderRogueConfirmation(run,{type:'event-item',itemId:parsed.itemId,replaceIndex:parsed.replaceIndex,cost:room.itemCost??0},{update});
    if(parsed.kind==='trade'&&allowed.has('trade')&&room.candidates?.includes(parsed.cardId)&&run.hp>(room.lifeCost??0))return renderRogueConfirmation(run,{type:'event-trade',cardId:parsed.cardId,cost:room.lifeCost??0},{update});
    if(parsed.kind==='upgrade'&&allowed.has('upgrade')&&(room.upgradeCandidates??(run.deck??[]).filter((e)=>!e.upgraded).map((e)=>e.uid)).includes(parsed.uid)&&(run.deck??[]).some((e)=>e.uid===parsed.uid&&!e.upgraded))return renderRogueConfirmation(run,{type:'event-upgrade',uid:parsed.uid,cost:room.upgradeCost??0},{update});
    if(parsed.kind==='remove'&&allowed.has('remove')&&(room.removeCandidates??(run.deck??[]).map((e)=>e.uid)).includes(parsed.uid)&&(run.deck??[]).some((e)=>e.uid===parsed.uid))return renderRogueConfirmation(run,{type:'event-remove',uid:parsed.uid,cost:room.removeCost??0},{update});
   }
   return privateError('当前阶段不能进行这个操作。');
  }
  const run=service.act({...request,action:parsed.action});
  return render(run,{update});
 }catch(e){return privateError(errors[e.code]||'这次操作未完成，请重新打开冒险。');}
}

