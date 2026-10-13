// Discord REST component adapter. SPDX-License-Identifier: AGPL-3.0-only
import {DevilState,ITEM_DEFS,GAME_CONFIG} from './devil-roulette-engine.mjs';
import {label,CHOICES,settings} from './duel-roulette-model.mjs';
export const TITLE={duel:'⚔️ 死斗',devil_roulette:'🔫 恶魔轮盘'};
export const SOURCE='https://github.com/AliceNekoqqq/Aliceneko-Discord-Holdem';
export const mentions={parse:[]};
const sub=(name,description,options)=>({type:1,name,description,...(options?{options}:{})});
const definition=(name,description)=>({name,description,type:1,integration_types:[0],contexts:[0],options:[sub('等待对手','在当前频道公开等待一位真人应战'),sub('发起挑战','向指定服务器玩家发起双人挑战',[{type:6,name:'玩家',description:'要挑战的另一位真人玩家',required:true}]),sub('牌桌','定位当前频道的游戏面板'),sub('帮助','查看游戏规则、超时与败者惩罚')]});
export const duelCommand=definition('死斗','双人石头剪刀布，先赢两轮者裁决惩罚');
export const devilCommand=definition('恶魔轮盘','双人弹巢与九种道具的回合对决');
export const HELP={
 duel:'⚔️ **死斗**\n`/死斗 等待对手` 公开招募；`/死斗 发起挑战 玩家` 点名约战。邀请 1 分钟过期。\n双方在私密面板选择石头、剪刀或布，出拳后不能改。每轮 30 秒，先赢 2 轮获胜；最多 7 轮，平局也占一轮。仅一人超时则另一人得分；双方均超时则取消。\n胜者有 30 秒选择禁言 3 分钟或改名 5 分钟；不选自动禁言。选择改名后有 60 秒提交昵称，逾期放弃。昵称到期自动恢复；机器人权限不足会明确提示。应战代表同意惩罚。',
 devil_roulette:'🔫 **恶魔轮盘**\n`/恶魔轮盘 等待对手` 公开招募；`/恶魔轮盘 发起挑战 玩家` 点名约战。邀请 2 分钟过期。\n双方各 4 点生命，共用随机实弹/空弹枪膛。向自己打出空弹可继续行动；实弹通常造成 1 点伤害，手锯增至 2 点。每回合 60 秒，另有 2 秒宽限，超时自动向对手开枪。空仓重新装填、补发道具并交替先手。\n九种道具：放大镜、香烟、啤酒、手锯、手铐、手机、逆转器、肾上腺素、过期药。情报仅自己可见。生命高于 2 点时可确认认输。\n正常落败接受禁言 5 分钟或改名 10 分钟；认输为 3/7 分钟。胜者 60 秒不选自动禁言 5 分钟。应战代表同意惩罚。'
};
export const help=type=>`${HELP[type]}\n\n改编自 ESSEX-CV9/ManageBot，AGPL-3.0。源代码：${SOURCE}`;
export const key=(t,action)=>`dr:${t.epoch}:${t.version}:${action}`;
export const button=(t,action,text,style=2,disabled=false)=>({type:2,custom_id:key(t,action),label:text,style,disabled});
export const row=(...components)=>({type:1,components});
const stamp=time=>`<t:${Math.floor(time/1000)}:R>`;
const items=xs=>xs?.length?xs.map(k=>`${ITEM_DEFS[k].emoji}${ITEM_DEFS[k].name}`).join(' / '):'无道具';
export function board(t){
 const rows=[],fields=[];let description;
 if(t.phase==='lobby'){
  const cfg=settings(t.game);description=`${label(t.players[0])} ${t.target?`向 <@${t.target}> 发起挑战`:'正在等待一位真人对手'}\n${stamp(t.waitUntil)} 邀请到期。\n败者由胜者选择禁言 **${cfg.mute} 分钟**或改名 **${cfg.rename} 分钟**；应战即同意规则。`;
  rows.push(row(button(t,'join',t.target?'接受挑战':'加入对局',1),...(t.target?[button(t,'decline','拒绝')]:[]),button(t,'cancel','取消邀请',4),button(t,'help','规则')));
 }else if(t.phase==='active'){
  if(t.game==='duel'){
   description=`**第 ${t.round}/7 轮 · 先赢 2 轮**\n${stamp(t.deadline)} 本轮到期。点击私密面板出拳；出拳内容在双方完成前保密。`;
   for(const p of t.players)fields.push({name:label(p),value:`${t.scores[p.id]} 分 · ${t.choices[p.id]?'✅ 已出拳':'⌛ 待出拳'}`,inline:true});
  }else{
   const s=DevilState.restore(t.state);description=`👉 **${label(t.players.find(p=>p.id===t.turn))}** 行动 · ${stamp(t.deadline)} 超时\n弹巢剩余 **${s.totalRemaining}** 发：${s.inverterObscured?'实弹/空弹数量暂时隐藏':`**${s.liveRemaining} 实弹 / ${s.blankRemaining} 空弹**`}${s.sawArmed?'\n🪚 下一发实弹伤害翻倍。':''}`;
   for(const p of t.players)fields.push({name:label(p),value:`${s.hpText(p.id)}${s.handcuffed.has(p.id)?' · 🔗 被铐':''}\n${items(s.items[p.id])}`,inline:true});
  }
  rows.push(row(button(t,'panel',t.game==='duel'?'打开私密出拳面板':'我的操作 / 情报',1),button(t,'refresh','刷新'),button(t,'help','规则')));
 }else{
  description=t.winner?`🏆 **${label(t.players.find(p=>p.id===t.winner))}** 获胜。`:`${t.closeReason||'对局已结束。'}`;
  if(t.phase==='settled'&&t.penalty){description+=`\n胜者可在 ${stamp(t.penalty.until)} 前选择禁言 ${t.penalty.muteMinutes} 分钟或改名 ${t.penalty.renameMinutes} 分钟。\n${t.penaltyNotice||'未选择将自动禁言。'}`;rows.push(row(button(t,'mute','选择禁言',4),button(t,'rename','指定昵称',1),button(t,'refresh','刷新')));}
  else if(t.penaltyNotice)description+=`\n${t.penaltyNotice}`;
 }
 if(t.log?.length)fields.push({name:'对局记录',value:t.log.join('\n').slice(-1024),inline:false});
 return {content:t.phase==='lobby'&&t.target?`<@${t.target}> ${TITLE[t.game]}邀请`: '',embeds:[{title:`${TITLE[t.game]} · 红豆粉小酒馆`,description,color:t.game==='duel'?0xba5a72:0x657887,fields,footer:{text:'双人真人对局 · 仅供娱乐 · AGPL-3.0 / 帮助内提供源代码'}}],components:rows,attachments:[],allowed_mentions:t.phase==='lobby'&&t.target?{parse:[],users:[t.target]}:mentions};
}
export function panel(t,id,notice=''){
 const p=t.players.find(p=>p.id===id);if(!p)return {content:'你没有参加这场对局。',components:[],embeds:[],allowed_mentions:mentions};
 const rows=[];let text;
 if(t.phase!=='active')text='本局已结束，请查看公开结算。';
 else if(t.game==='duel'){
  text=`第 ${t.round} 轮 · ${t.choices[id]?`已记录你的 ${CHOICES[t.choices[id]]}，不能修改。`:'选择一项出拳，其他人看不到你的选择。'}`;
  if(!t.choices[id])rows.push(row(...Object.entries(CHOICES).map(([choice,text])=>button(t,`p~${id}~choose~${t.round}~${choice}`,text,1))));
 }else{
  const s=DevilState.restore(t.state),mine=s.currentPlayerId===id;text=`${mine?'轮到你。':'等待对手行动。'}\n生命 ${s.hp[id]}/${GAME_CONFIG.hp}\n**你的情报**：${s.privateIntelText(id)}\n**你的道具**：${items(s.items[id])}`;
  if(mine){
   rows.push(row(button(t,`p~${id}~shoot_opponent`,'向对手开枪',4),button(t,`p~${id}~shoot_self`,'向自己开枪',4)));
   const usable=[...new Set(s.items[id])].filter(k=>k!=='adrenaline'&&s.canUseItem(id,k));
   for(let n=0;n<usable.length;n+=5)rows.push(row(...usable.slice(n,n+5).map(k=>button(t,`p~${id}~${k}`,`${ITEM_DEFS[k].emoji} ${ITEM_DEFS[k].name}`,['cigarette','medicine'].includes(k)?3:2))));
   if(s.canUseItem(id,'adrenaline'))rows.push(row({type:3,custom_id:key(t,`p~${id}~adrenaline`),placeholder:'肾上腺素：偷取并立即使用',min_values:1,max_values:1,options:s._stealableItems(id).map(k=>({label:ITEM_DEFS[k].name,value:k,description:ITEM_DEFS[k].description.slice(0,100)}))}));
  }
  if(s.hp[id]>2)rows.push(row(button(t,`p~${id}~surrender`,'认输',4),button(t,`p~${id}~panel`,'刷新我的面板')));
  else rows.push(row(button(t,`p~${id}~panel`,'刷新我的面板')));
 }
 return {content:[notice,text].filter(Boolean).join('\n'),embeds:[],components:rows.slice(0,5),attachments:[],flags:64,allowed_mentions:mentions};
}
export function renameModal(t,id){return {type:9,data:{custom_id:key(t,`p~${id}~rename_submit`),title:'指定败者临时昵称',components:[row({type:4,custom_id:'nickname',label:'新昵称（1～32 字）',style:1,required:true,min_length:1,max_length:32})]}};}
