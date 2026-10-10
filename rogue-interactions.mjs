import {renderRogue,renderRogueHome,renderRogueBoard,renderRogueConfirmation,renderRogueDetails,parseRogueAction} from './rogue-ui.mjs';

const privateError=content=>({type:4,data:{flags:64,content,allowed_mentions:{parse:[]}}});
const errors={OWNER:'请打开属于自己的冒险。',GUILD:'这局属于另一个服务器。',STALE:'这个按钮已过期，请重新打开当前冒险。',STALE_VERSION:'这个按钮已过期，请重新打开当前冒险。',INSUFFICIENT_EMBERS:'余烬不足，可以免费离开这个房间。',FULL_HEALTH:'现在已经满血。',SERVICE_USED:'本次服务已使用。',SOLD_OUT:'这张牌已经售出。',MINIMUM_DECK:'牌组至少保留4张。',ILLEGAL_CARD:'这张牌当前无法打出。',RUN_FINISHED:'这局已经结束。'};
// Only call after the existing worker verifies Discord's request signature.
// Identity comes from signed interaction fields, never from custom_id or body
// overrides. Clock/seed/payment eligibility remain service-owned.
export function dispatchRogue(service,interaction){
 const id=interaction?.member?.user?.id;
 const guild=interaction?.guild_id;
 if(!id||!guild||guild!==service.guild)return privateError('请在所属服务器打开自己的冒险。');
 if(interaction.member.user.bot)return privateError('冒险奖励只向真人来客开放。');
 const base={guild,id,name:interaction.member.nick||interaction.member.user.global_name||interaction.member.user.username||'',requestId:interaction.id};
 const update=interaction.type===3&&!!(interaction.message?.flags&64);
 try{
  if(interaction.type===2){const run=service.resume(base);return run&&run.phase!=='RESULT'?renderRogue(run):renderRogueHome({challengeProfession:service.challengeProfession?.(base)});}
  const parsed=parseRogueAction(interaction.data?.custom_id,interaction.data?.values||[]);
  if(!parsed)return privateError('这个冒险按钮无效，请重新打开冒险。');
  if(parsed.ui==='board')return renderRogueBoard(service.leaderboard(base),{update});
  if(parsed.ui==='home'){
   const run=service.resume(base);return run&&run.phase!=='RESULT'?renderRogue(run,{update}):renderRogueHome({challengeProfession:service.challengeProfession?.(base),update});
  }
  if(parsed.ui==='start'||parsed.ui==='practice')return renderRogue(service.start({...base,mode:parsed.mode??'normal',practice:parsed.ui==='practice',professionId:parsed.professionId}),{update});
  const request={...base,runId:parsed.runId,version:parsed.version};
  if(parsed.ui){
   const run=service.resume(request);
   if(!run)return renderRogueHome();
   if(parsed.ui==='refresh')return renderRogue(run,{update});
   if(parsed.ui==='details')return renderRogueDetails(run,parsed.kind,{update,page:parsed.page});
   if(parsed.version!==run.version)return privateError(errors.STALE);
   if(parsed.ui==='ask-retreat'&&run.phase==='CHECKPOINT')return renderRogueConfirmation(run,'retreat',{update});
   if(parsed.ui==='ask-abandon'&&run.phase!=='RESULT')return renderRogueConfirmation(run,'abandon',{update});
   if(parsed.ui==='event-confirm'&&run.phase==='ROOM'&&run.room?.type==='event'){
    const room=run.room,allowed=new Set(room.choices||['heal','card','leave']);
    if(parsed.kind==='heal'&&allowed.has('heal'))return renderRogueConfirmation(run,{type:'event-heal',cost:room.healCost??0,amount:room.healAmount??0},{update});
    if(parsed.kind==='card'&&allowed.has('card')&&room.candidates?.includes(parsed.cardId))return renderRogueConfirmation(run,{type:'event-card',cardId:parsed.cardId,cost:room.cardCost??0},{update});
    if(parsed.kind==='item'&&allowed.has('item')&&room.itemCandidates?.includes(parsed.itemId))return renderRogueConfirmation(run,{type:'event-item',itemId:parsed.itemId,replaceIndex:parsed.replaceIndex,cost:room.itemCost??0},{update});
    if(parsed.kind==='trade'&&allowed.has('trade')&&room.candidates?.includes(parsed.cardId)&&run.hp>(room.lifeCost??0))return renderRogueConfirmation(run,{type:'event-trade',cardId:parsed.cardId,cost:room.lifeCost??0},{update});
   }
   return privateError('当前阶段不能进行这个操作。');
  }
  const run=service.act({...request,action:parsed.action});
  return renderRogue(run,{update});
 }catch(e){return privateError(errors[e.code]||'这次操作未完成，请重新打开冒险。');}
}
