const validId=value=>/^\d{1,20}$/.test(String(value||''));
const clean=value=>String(value||'').replace(/[\x00-\x1f<>@]/g,' ').trim().slice(0,64);

export function channelReadPlan(text='') {
 const summary=/总结|总结一下|概括|汇总|聊了什么|聊了啥|讨论了什么|聊天回顾|聊天摘要|summari[sz]e|recap/iu.test(text);
 const count=summary?String(text).match(/(?:最近|近|前|过去)\s*(\d{1,6})\s*条/u):null;
 const requested=count?Number(count[1]):summary?100:30;
 return {mode:summary?'summary':'context',requested,limit:Math.max(1,Math.min(300,requested))};
}

// Read only when addressed, from the triggering channel, before the triggering
// message. No passive ingestion, text cache, persisted archive, or extra model call.
export async function recentChannelMessages(env,message,botId,fetcher=fetch,enabled=true) {
 const plan=channelReadPlan(message.content||'');
 const result={source:'discord_channel_history',scope:'current_channel',...plan,records:[],fetched:0,truncated:false,exhausted:false,available:false};
 if(!enabled)return {...result,notice:'管理员已关闭当前频道上下文；不能根据旧互动记录冒充频道聊天总结。'};
 if(!env.BOT_TOKEN||![message.id,message.guild_id,message.channel_id].every(validId))return {...result,notice:'当前频道历史无法读取；不能据此总结未提供的聊天。'};
 let before=String(message.id),remaining=plan.limit;
 const seen=new Set(),rows=[];
 try {
  for(let page=0;remaining>0&&page<3;page++) {
   const size=Math.min(100,remaining);
   const response=await fetcher(`https://discord.com/api/v10/channels/${message.channel_id}/messages?limit=${size}&before=${before}`,{headers:{Authorization:'Bot '+env.BOT_TOKEN},signal:AbortSignal.timeout(3000)});
   if(!response.ok)throw Error('history_unavailable');
   const batch=await response.json();
   if(!Array.isArray(batch))throw Error('invalid_history');
   result.available=true;
   const valid=batch.slice(0,size).filter(row=>validId(row.id)&&BigInt(row.id)<BigInt(before)&&(!row.channel_id||String(row.channel_id)===String(message.channel_id))&&(!row.guild_id||String(row.guild_id)===String(message.guild_id)));
   for(const row of valid)if(!seen.has(String(row.id))){seen.add(String(row.id));rows.push(row);}
   remaining-=size;
   if(batch.length<size){result.exhausted=true;break;}
   const next=valid.reduce((id,row)=>BigInt(row.id)<BigInt(id)?String(row.id):id,before);
   if(next===before){result.truncated=true;break;}
   before=next;
  }
 }catch{result.notice='频道历史读取失败或不完整，可能缺少查看频道/读取消息历史权限；仅能总结已读到的记录。';result.truncated=true;}
 result.fetched=rows.length;
 // Keep the latest records if the prompt budget is exceeded; retain chronological
 // ordering and mark per-message truncation. Attachment filenames are data only.
 let budget=plan.mode==='summary'?24000:6000;
 const normalized=rows.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?1:-1).filter(row=>validId(row.author?.id)).map(row=>{
  const raw=String(row.content||'');
  const attachments=(row.attachments||[]).slice(0,4).map(a=>clean(a.filename)).filter(Boolean);
  const content=raw.slice(0,1200)+(attachments.length?`\n[附件：${attachments.join('、')}；未读取附件内容]`:'')||'[无可读取正文；不能猜测图片、嵌入卡片或语音内容]';
  const ref=row.message_reference;
  return {id:String(row.id),author:{id:String(row.author.id),nick:clean(row.member?.nick),display:clean(row.author.global_name),username:clean(row.author.username),kind:String(row.author.id)===String(botId)?'this_bot':row.author.bot?'other_bot':'member'},content,at:row.timestamp||null,...(ref?.message_id&&(!ref.channel_id||String(ref.channel_id)===String(message.channel_id))?{replyToMessage:String(ref.message_id)}:{}),...(raw.length>1200?{truncated:true}:{})};
 });
 for(const row of normalized){
  const cost=JSON.stringify(row).length;
  if(cost>budget){result.truncated=true;break;}
  result.records.push(row);budget-=cost;
  if(row.truncated)result.truncated=true;
 }
 result.records.reverse();
 if(plan.requested>plan.limit)result.truncated=true;
 result.returned=result.records.length;
 result.start=result.records[0]?.at||null;result.end=result.records.at(-1)?.at||null;
 if(result.records.some(row=>row.content.startsWith('[无可读取正文')))result.contentNotice='部分消息没有可读取正文，可能是附件/嵌入卡片或Message Content Intent限制；不能猜测。';
 return result;
}
