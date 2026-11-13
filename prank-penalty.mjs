// Entertainment-only card builder. Delivery sends messages, never moderation.
export const PRANK_DELIVERY_RUNTIME='prank2-standalone-bot-message';
export const prankPenaltyCommand={
 name:'整蛊处罚',description:'发送玩笑处罚通知卡片，仅发消息，不执行实际处罚',type:1,integration_types:[0],contexts:[0],
 options:[
  {type:6,name:'成员',description:'卡片上显示的成员',required:true},
  {type:3,name:'类型',description:'选择通知类型',required:true,choices:[{name:'禁言',value:'mute'},{name:'封禁',value:'ban'},{name:'警告',value:'warn'},{name:'解除处罚',value:'pardon'}]},
  {type:3,name:'时长',description:'自由填写，例如2天、10分钟、永久',min_length:1,max_length:100},
  {type:3,name:'原因',description:'填写这次整蛊的原因',min_length:1,max_length:1000},
  {type:3,name:'警告期限',description:'可选，例如30天',min_length:1,max_length:100}
 ]
};
const styles={mute:{title:'🔇 禁言处罚',color:0xe67e22},ban:{title:'⛔ 封禁处罚',color:0xe74c3c},warn:{title:'⚠️ 警告通知',color:0xf1c40f},pardon:{title:'🔓 解除处罚',color:0x2ecc71}};
const idPattern=/^\d{1,20}$/;
const privateError=content=>({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
export function prankPenaltyReply(i){
 if(!idPattern.test(i.guild_id||'')||!idPattern.test(i.member?.user?.id||''))return privateError('请在服务器内使用。');
 const options=Object.fromEntries((i.data?.options||[]).map(o=>[o.name,o.value]));
 const target=options.成员,style=styles[options.类型];
 if(typeof target!=='string'||!idPattern.test(target)||!Object.hasOwn(styles,options.类型))return privateError('请选择成员和处罚类型。');
 for(const [key,max]of [['时长',100],['原因',1000],['警告期限',100]]){
  if(options[key]!==undefined&&(typeof options[key]!=='string'||!options[key].trim()||options[key].length>max))return privateError(`${key}格式不正确，最多${max}字。`);
 }
 const fields=[
  {name:'时长',value:options.时长?.trim()||'未指定'},
  {name:'成员',value:`<@${target}>`},
  {name:'执行人',value:`<@${i.member.user.id}>`},
  {name:'原因',value:options.原因?.trim()||'未填写'}
 ];
 if(options.警告期限)fields.push({name:'警告',value:options.警告期限.trim()});
 const user=i.data?.resolved?.users?.[target],member=i.data?.resolved?.members?.[target];
 const avatar=/^(a_)?[a-f0-9]{32}$/;
 const defaultAvatar=/^[1-9]\d{0,3}$/.test(user?.discriminator||'')?Number(user.discriminator)%5:Number((BigInt(target)>>22n)%6n);
 const thumbnail=avatar.test(member?.avatar||'')?`https://cdn.discordapp.com/guilds/${i.guild_id}/users/${target}/avatars/${member.avatar}.png?size=256`:avatar.test(user?.avatar||'')?`https://cdn.discordapp.com/avatars/${target}/${user.avatar}.png?size=256`:`https://cdn.discordapp.com/embed/avatars/${defaultAvatar}.png`;
 return {type:4,data:{allowed_mentions:{parse:[]},embeds:[{...style,fields,thumbnail:{url:thumbnail},footer:{text:`处罚ID: ${crypto.randomUUID().slice(0,8)}`}}]}};
}
// A channel message has no slash-command attribution. The acknowledgement stays
// ephemeral, and is removed after delivery; only private errors remain visible.
export async function sendPrankPenalty(env,i,card,fetcher=fetch){
 const original=`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${encodeURIComponent(i.token)}/messages/@original`;
 const privateNotice=content=>fetcher(original,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,embeds:[],allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(6000)});
 let delivered;
 try{
  delivered=await fetcher(`https://discord.com/api/v10/channels/${i.channel_id}/messages`,{method:'POST',headers:{Authorization:`Bot ${env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({...card,nonce:i.id,enforce_nonce:true}),signal:AbortSignal.timeout(6000)});
 }catch{
  await privateNotice('发送结果未确认，请先查看频道，避免重复发送。');return false;
 }
 if(!delivered.ok){
  await privateNotice(delivered.status===429?'发送过于频繁，请稍后重试。':delivered.status>=500?'发送结果未确认，请先查看频道，避免重复发送。':'发送失败，请确认Bot有发送消息和嵌入链接权限后重试。');return false;
 }
 // Cleanup failure must never cause the public card to be sent again.
 try{const removed=await fetcher(original,{method:'DELETE',signal:AbortSignal.timeout(6000)});if(removed.ok||removed.status===404)return true;}catch{}
 await privateNotice('已发送。');return true;
}
