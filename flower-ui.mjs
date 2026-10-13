import {FLOWERS} from './flower-shop.mjs';
import {tavernRequest} from './tavern-service.mjs';
import {cityChatContext} from './city-ui.mjs';
import {verifyGiftRecipient} from './tavern-gifts.mjs';
const row=(...components)=>({type:1,components});
const key=(i,a)=>`f:${i.guild_id}:${i.member.user.id}:${a}`;
const button=(i,a,label,style=2)=>({type:2,custom_id:key(i,a),label,style});
const data=content=>({content,flags:64,allowed_mentions:{parse:[]}});
const rpc=(env,i,p)=>tavernRequest(env,{guild:i.guild_id,id:i.member.user.id,name:i.member.nick||i.member.user.global_name||i.member.user.username,channel:i.channel_id,...p});
export const flowerInteraction=i=>i.type===3&&/^f(?:p)?:/.test(i.data?.custom_id||'');

async function place(env,i,purchase=false){const c=await cityChatContext(env,{guild_id:i.guild_id,channel_id:i.channel_id,author:i.member.user});if(c?.place.kind!=='flower')throw Error('请到登记为花店的频道使用 /城市 花店。');if(purchase&&c.place.open===false)throw Error('花店正在休息，暂时不能购买。');return c.place;}
function draftData(i,d){const item=FLOWERS.find(x=>x.id===d.item);return {...data(`🌷 **花束订单 · 待确认**\n${item.name} ×${d.quantity} · **${d.price}币**\n收礼人：${d.recipient_name}\n${d.note?`赠言：${d.note}\n`:''}余额：${d.balance}币\n确认前不会扣款，订单3分钟内有效。`),embeds:[{image:{url:`https://discord-holdem.aliceneko.workers.dev/art/flowers/${d.item}.jpg`}}],components:[row(button(i,`confirm~${d.id}~${d.recipient}`,'确认付款',1),button(i,`cancel~${d.id}`,'取消'))]};}
export async function flowerData(env,i){
 let s=i.data.options?.[0];const opts=Object.fromEntries((s?.options||[]).map(o=>[o.name,o.value]));
 if(i.type===3&&i.data.custom_id.startsWith('fp:')){
  const parts=i.data.custom_id.split(':');
  if(parts.length!==4||parts[1]!==i.guild_id||parts[2]!==i.channel_id||!['menu','gifts'].includes(parts[3]))throw Error('请到这张面板所属的花店频道使用。');
  const p=await place(env,i);if(p.channelId!==i.channel_id)throw Error('请在花店主频道使用常驻面板。');
  s={name:parts[3]==='gifts'?'礼物':'花店'};i={...i,type:2};
 }
 if(i.type===3){const parts=i.data.custom_id.split(':');if(parts.length!==4||parts[1]!==i.guild_id||parts[2]!==i.member.user.id||(!(Number(i.message?.flags)&64)&&!parts[3].startsWith('review~')))throw Error('请打开自己的花店或礼物面板。');
  const [a,id,recipient]=parts[3].split('~');
  if(a==='review'){await place(env,i);return draftData(i,await rpc(env,i,{action:'flowerDraft',draftId:id}));}
  if(a==='claim'){const o=await rpc(env,i,{action:'flowerClaim',orderId:id});return data(`已领取 ${FLOWERS.find(x=>x.id===o.item).name} ×${o.quantity}，已存入你的花束收藏。`);}
  if(a==='cancel'){await rpc(env,i,{action:'flowerCancel',draftId:id});return {...data('订单已取消，未扣款。'),components:[]};}
  if(a==='prepare'){await place(env,i,true);return draftData(i,await rpc(env,i,{action:'flowerPrepare',item:id,requestKey:`f${i.id}`}));}
  if(a==='confirm'){
   await place(env,i,true);const d=await rpc(env,i,{action:'flowerDraft',draftId:id});await verifyGiftRecipient(env,i.guild_id,d.recipient,i.member.user.id);
   const r=await rpc(env,i,{action:'flowerConfirm',draftId:id,expectedRecipient:recipient});
   return {...data(`已购买 ${FLOWERS.find(x=>x.id===r.order.item).name} ×${r.order.quantity}。\n${r.order.recipient===i.member.user.id?'花束已存入你的收藏。':'礼物已送入收礼人的待领清单，对方在任一地点使用 /城市 礼物 即可领取。'}\n余额：${r.balance}币${r.repeated?'\n本单此前已完成，没有重复扣款。':''}`),components:[]};
  }throw Error('这个花店按钮已失效。');
 }
 if(s.name==='礼物'){
  const r=await rpc(env,i,{action:'flowerInbox'});
  return {...data(`🎁 **我的花束与礼物**\n收藏：${r.inventory.map(x=>`${FLOWERS.find(f=>f.id===x.item).name} ×${x.quantity}`).join('、')||'暂无'}\n待领：${r.waiting.length}份${r.waiting.length?'\n'+r.waiting.map((o,n)=>`${n+1}. ${o.senderName}赠送的${FLOWERS.find(f=>f.id===o.item).name} ×${o.quantity}${o.note?' · '+o.note:''}`).join('\n'):''}`),components:r.waiting.length?[row(...r.waiting.slice(0,5).map((o,n)=>button(i,`claim~${o.id}`,`领取第${n+1}份`,1)))]:[]};
 }
 const p=await place(env,i);
 if(!opts['商品'])return {...data(`🌷 **${p.name} · ${p.open===false?'休息中':'营业中'}**\n${FLOWERS.map(x=>`${x.name} · ${x.price}币\n${x.description}\n${x.materials}`).join('\n\n')}\n自己购买可点下方按钮；赠送使用 /城市 花店 的「赠给」与「赠言」选项。`),embeds:FLOWERS.map(x=>({title:x.name,image:{url:`https://discord-holdem.aliceneko.workers.dev/art/flowers/${x.id}.jpg`}})),components:[row(...FLOWERS.map(x=>button(i,`prepare~${x.id}`,x.name))) ]};
 if(p.open===false)throw Error('花店正在休息，暂时不能购买。');
 const recipient=opts['赠给']?await verifyGiftRecipient(env,i.guild_id,opts['赠给'],i.member.user.id):undefined;
 return draftData(i,await rpc(env,i,{action:'flowerPrepare',item:opts['商品'],quantity:opts['数量'],recipient,note:opts['赠言'],requestKey:`f${i.id}`}));
}
export async function finishFlower(env,i){let d;try{d=await flowerData(env,i);}catch(e){d=data(e.message||'花店暂时无法处理，请重试。');}const r=await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${i.token}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(d),signal:AbortSignal.timeout(8000)});if(!r.ok)console.warn('flower_delivery_failed',{status:r.status});}

export const flowerReviewComponents=(guild,user,d)=>[{type:1,components:[{type:2,custom_id:`f:${guild}:${user}:review~${d.id}`,label:'打开我的花束订单',style:1}]}];
