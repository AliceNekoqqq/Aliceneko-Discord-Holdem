import {tavernRequest} from './tavern-service.mjs';
import {validId} from './tavern-catalog.mjs';
import {SLOT_BETS,SLOT_SYMBOLS} from './tavern-slots.mjs';
import {renderSlotsImage} from './tavern-slots-image.mjs';
import {SLOT_COPY} from './tavern-slots-copy.mjs';

const mentions={parse:[]};
const row=(...components)=>({type:1,components});
const button=(g,id,action,label,style=2,disabled=false)=>({type:2,custom_id:`t:${g}:${id}:${action}`,label,style,disabled});
export const slotsCommandOption={type:1,name:'老虎机',description:'单人红豆老虎机 · 使用酒馆币，打开后选择金额开始'};
export function slotsInteraction(i){return i.type===2&&i.data?.name==='酒馆'&&i.data.options?.[0]?.name==='老虎机'||i.type===3&&String(i.data?.custom_id||'').startsWith('t:')&&String(i.data.custom_id).split(':')[3]?.startsWith('slots');}
function parts(i){
 const guild=i.guild_id,id=i.member?.user?.id,channel=i.channel_id;
 if(!validId(guild)||!validId(id)||!validId(channel)||i.member.user.bot)throw Error('请在服务器内打开自己的老虎机。');
 if(i.type===2&&slotsInteraction(i))return {guild,id,channel,action:'slots'};
 const p=String(i.data?.custom_id||'').split(':');
 if(i.type!==3||p.length!==4||p[1]!==guild||!/^slots(?:$|Rules$|Spin~[a-f0-9]{16}~(?:10|20|50)$)/.test(p[3]))throw Error('老虎机面板已失效，请重新打开。');
 if(p[2]==='any'&&p[3]==='slots')return {guild,id,channel,action:'slots',publicEntry:true};
 if(p[2]!==id||!(Number(i.message?.flags)&64))throw Error('请从本人私密老虎机面板操作。');
 return {guild,id,channel,action:p[3]};
}
export function immediateSlotsReply(i){if(!slotsInteraction(i))return null;try{parts(i);return null;}catch(e){return {type:4,data:{content:e.message,flags:64,allowed_mentions:mentions}};}}
export function slotsDeferredReply(i){if(!slotsInteraction(i))return null;const p=parts(i);return i.type===3&&!p.publicEntry?{type:6}:{type:5,data:{flags:64}};}
export function slotsRules(guild,id){
 return {content:`🎰 **红豆老虎机 · 玩法与赔率**\n三列独立转动，仅中间一条线计奖；每局只扣一次投入。\n\n${SLOT_SYMBOLS.map(s=>`${s.emoji} ${s.name}：每列 ${s.weight*10}% · 三个相同返还 **${s.triple}倍**`).join('\n')}\n\n任意恰好两个相同：返还 **1倍**，即本金；三个不同：返还0。三连优先，只发一档奖励。\n**所有倍数均含本金**。例如投入10币，三只蝴蝶返还1000币，净赢990币。\n理论平均返还率 **95%**，单局可能有较大差异。每局概率独立，不随余额、输赢或好感度变化。\n酒馆币仅用于游戏；返还全额结算，与到店礼及多人对局奖励的每日额度分开计算。`,components:[row(button(guild,id,'slots','返回老虎机',1),button(guild,id,'wallet','我的钱包'))],allowed_mentions:mentions};
}
export function slotsData(data,guild,id,notice=''){
 const r=data.result,icons=r?.symbols.map(id=>SLOT_SYMBOLS.find(s=>s.id===id).emoji).join('　')||'🍒　🫘　🦋';
 const result=r?`\n\n${r.kind==='triple'?SLOT_COPY.win:r.kind==='pair'?SLOT_COPY.refund:SLOT_COPY.lose}\n投入 ${r.bet} · 返还 ${r.payout}（含本金）· 净变化 ${r.net>0?'+':''}${r.net}币\n本局结算后余额 ${r.balanceAfter}币${data.repeated?'\n本局已经结算，没有重复扣币或发奖。':''}`:'';
 return {content:`🎰 **红豆老虎机**\n单人游玩 · 当前钱包 **${data.balance}币**\n\n${icons}${result}${notice?`\n\n${notice}`:''}\n\n${r?'选择金额开启新一局。':SLOT_COPY.intro}\n累计 ${data.stats.plays}局 · 投入 ${data.stats.wagered} · 返还 ${data.stats.returned} · 净变化 ${data.stats.net>0?'+':''}${data.stats.net}币`,embeds:[{color:0xbb8896,title:r?'本局转轮':'红豆娱乐城',footer:{text:'三列 · 单条中奖线 · 返还包含本金'}}],components:[row(...SLOT_BETS.map(b=>button(guild,id,`slotsSpin~${data.token}~${b}`,`${r?'再转':'转一次'} · ${b}币`,1,data.balance<b))),row(button(guild,id,'slotsRules','玩法与赔率'),button(guild,id,'slots','刷新 / 恢复结果'),button(guild,id,'wallet','我的钱包'))],allowed_mentions:mentions};
}
export async function answerSlots(env,i){
 const p=parts(i);if(p.action==='slotsRules')return slotsRules(p.guild,p.id);
 const base={guild:p.guild,id:p.id,channel:p.channel,name:i.member.nick||i.member.user.global_name||i.member.user.username||'来客'};
 let data,notice='';
 if(p.action.startsWith('slotsSpin~')){
  const [,token,bet]=p.action.split('~');
  try{data=await tavernRequest(env,{...base,action:'slotsSpin',token,bet:Number(bet)});}
  catch(e){data=await tavernRequest(env,{...base,action:'slotsView'});notice=e.message;}
 }else data=await tavernRequest(env,{...base,action:'slotsView'});
 const view=slotsData(data,p.guild,p.id,notice);
 // Rendering failure cannot undo a settled round or hide the textual receipt.
 try{view._mapScene={bytes:await renderSlotsImage(data.result,env),filename:'red-bean-slots.png',mime:'image/png',description:'红豆老虎机三列转轮；本局图案与结算结果'};}catch{view.content+='\n转轮配图暂未加载，以上结算与余额有效。';}
 return view;
}
