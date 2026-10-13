// Durable Object adapter for independent /死斗 and /恶魔轮盘 commands.
// SPDX-License-Identifier: AGPL-3.0-only
import * as game from './duel-roulette-model.mjs';
import {board,panel,help,renameModal,button,row} from './duel-roulette-ui.mjs';
import {penaltyRequest} from './duel-roulette-penalties.mjs';
import {ITEM_DEFS} from './devil-roulette-engine.mjs';
const json=body=>Response.json(body),priv=content=>({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
export const typeForName=name=>name==='死斗'?'duel':name==='恶魔轮盘'?'devil_roulette':null;
export const matches=i=>!!typeForName(i.data?.name)||String(i.data?.custom_id||'').startsWith('dr:');
const human=i=>!!i.member?.user?.id&&!i.member.user.bot&&!(Date.parse(i.member.communication_disabled_until||'')>Date.now());
export class DuelRouletteController {
 constructor(host){this.host=host;this.storage=host.ctx.storage;this.env=host.env;}
 async save(t,seen=null){await this.storage.put(seen?{table:t,recentInteractions:seen}:{table:t});await this.host.boards.queue(t);await this.host.armAlarm(t);}
 async penaltySync(t,now=Date.now()){
  if(t.phase!=='settled'||!t.penalty)return false;
  try{
   if(!t.penaltyCreated){await penaltyRequest(this.env,t.guild,'create',{penalty:t.penalty});t.penaltyCreated=true;}
   const status=await penaltyRequest(this.env,t.guild,'view',{id:t.penalty.id});
   if(!status)throw Error('结算记录尚未保存。');
   t.penalty.status=status.status;t.penaltyNotice=status.notice;t.penalty.renameUntil=status.renameUntil;
   if(['applied','activeRename','restored','externallyChanged','failed','expired'].includes(status.status)){t.phase='closed';t.penaltyDue=null;}
   else t.penaltyDue=status.status==='pending'?Math.max(now+1000,status.until+500):status.status==='renamePending'?Math.max(now+1000,status.renameUntil+500):Math.max(now+2000,Math.min(status.retryAt||now+5000,now+30000)+500);
  }catch{t.penaltyNotice='结算正在保存或执行，稍后自动重试。';t.penaltyDue=now+5000;}
  return true;
 }
 async progress(t,now=Date.now()){
  if(!game.isDuelRoulette(t))return false;let changed=game.expire(t,now);
  if(t.phase==='settled'&&t.penaltyDue<=now)changed=await this.penaltySync(t,now)||changed;
  if(changed){t.version++;await this.save(t);}return changed;
 }
 async dispatch(payload,t){
  const i=payload.interaction,id=i.member?.user?.id,display=i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'玩家';
  if(!human(i))return json(priv('请使用未被禁言的服务器真人账号参加。'));
  await this.progress(t);
  if(i.type===2){
   const type=typeForName(i.data.name),sub=i.data.options?.[0]?.name;
   if(!type)return json(priv('当前频道正在进行死斗或恶魔轮盘，请先完成对局。'));
   if(sub==='帮助')return json(priv(help(type)));
   if(sub==='牌桌')return json(priv(t&&t.phase!=='closed'?(t.messageId?`当前面板：https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId}`:'面板正在创建。'):'当前频道没有进行中的对局。'));
   if(!['等待对手','发起挑战'].includes(sub))return json(priv(help(type)));
   if(!this.env.BOT_TOKEN)return json(priv('机器人尚未配置完成。'));
   if(t&&t.phase!=='closed')return json(priv('当前频道已有牌桌或对局，请先结束当前游戏。'));
   if(await this.storage.get('createdInteraction')===i.id)return json(priv('本次创建已处理。'));
   const target=sub==='发起挑战'?i.data.options[0].options?.find(o=>o.name==='玩家')?.value:null;
   if(target){const user=i.data.resolved?.users?.[target],member=i.data.resolved?.members?.[target];if(target===id||!/^\d{1,20}$/.test(target)||!user||user.bot||!member||Date.parse(member.communication_disabled_until||'')>Date.now())return json(priv('请选择本服务器另一位未被禁言的真人玩家。'));}
   else if(sub==='发起挑战')return json(priv('请选择要挑战的玩家。'));
   t=game.create(type,id,i.channel_id,i.guild_id,display,target);await this.storage.delete(['privatePanels','privateSyncAt','privateExpiry']);await this.storage.put({table:t,createdInteraction:i.id});await this.host.armAlarm(t);
   return json({type:4,data:board(t),bindEpoch:t.epoch});
  }
  const parts=String(i.data?.custom_id||'').split(':');
  if(!game.isDuelRoulette(t)||parts.length!==4||parts[0]!=='dr'||parts[1]!==t.epoch)return json(priv('这是旧对局的按钮，请使用当前面板。'));
  const bound=parts[3].match(/^p~(\d+)~(.+)$/),action=bound?bound[2]:parts[3],privateMessage=!!(Number(i.message?.flags)&64);
  if(i.type===5&&(!bound||action!=='rename_submit'))return json(priv('无效游戏表单。'));
  if(bound&&(bound[1]!==id||i.type===3&&!privateMessage))return json(priv('请打开自己的私密操作面板。'));
  if(!bound&&(i.type!==3||privateMessage||t.messageId&&i.message?.id!==t.messageId))return json(priv('请使用原公开对局面板。'));
  const seated=t.players.some(p=>p.id===id);
  const panelReply=notice=>({type:privateMessage?7:4,data:{...panel(t,id,notice),...(privateMessage?{flags:undefined}:{flags:64})}});
  if(action==='help')return json(priv(help(t.game)));
  if(action==='refresh'){await this.host.syncBoard(t);return json({type:6});}
  if(action==='panel'){if(!seated)return json(priv('你没有参加这场对局。'));return json(panelReply());}
  const seen=await this.storage.get('recentInteractions')||[];if(seen.includes(i.id))return json(priv('本次操作已处理。'));
  const simultaneous=bound&&/^choose~\d+~(rock|paper|scissors)$/.test(action)&&t.game==='duel';
  const modal=i.type===5&&bound&&action==='rename_submit';
  if(Number(parts[2])!==t.version&&!simultaneous&&!modal)return json(seated&&bound&&i.type===3?panelReply('对局已更新，刚才的操作未执行。'):priv('对局已更新，请使用最新按钮。'));
  let notice='操作已记录。',response=null;
  try{
   if(action==='join'&&!bound){game.accept(t,id,display);notice='已应战。打开公开面板上的私密操作入口开始行动。';}
   else if(action==='decline'&&!bound){if(t.phase!=='lobby'||t.target!==id)throw Error('只有被邀请的玩家可以拒绝。');game.close(t,'对方拒绝了挑战。');}
   else if(action==='cancel'&&!bound){const admin=(BigInt(i.member.permissions||'0')&40n)!==0n;if(t.phase!=='lobby'||id!==t.owner&&!admin)throw Error('只有邀请发起者或管理员可以取消等待。');game.close(t,'邀请已取消。');}
   else if(action==='surrender'&&bound){if(!seated||t.phase!=='active'||t.game!=='devil_roulette')throw Error('现在不能认输。');return json({type:7,data:{content:'确认认输？对手将获胜，并可选择禁言 3 分钟或改名 7 分钟。',embeds:[],components:[row(button(t,`p~${id}~giveup`,'确认认输',4),button(t,`p~${id}~panel`,'返回游戏'))],allowed_mentions:{parse:[]}}});}
   else if(action==='giveup'&&bound){game.surrender(t,id);notice='已认输。';}
   else if(simultaneous){const [,round,choice]=action.split('~');game.choose(t,id,choice,Number(round));notice='出拳已记录，选择不能修改。';}
   else if(bound&&i.type===3&&['shoot_self','shoot_opponent',...Object.keys(ITEM_DEFS)].includes(action)){
    const result=game.shootOrItem(t,id,action,action==='adrenaline'?i.data.values?.[0]:null);notice=result.reveal||'操作已完成；结果见公开面板。';
   }else if(['mute','rename','rename_submit'].includes(action)){
    if(t.phase!=='settled'||t.winner!==id)throw Error('只有本局胜者可以裁决。');
    if(!t.penaltyCreated){await penaltyRequest(this.env,t.guild,'create',{penalty:t.penalty});t.penaltyCreated=true;}
    if(action==='rename'){
     if(t.penalty.status!=='renamePending'){const p=await penaltyRequest(this.env,t.guild,'rename',{id:t.penalty.id,user:id});t.penalty.status=p.status;t.penalty.renameUntil=p.renameUntil;}
     t.penaltyDue=t.penalty.renameUntil+500;t.penaltyNotice='已选择改名，请在一分钟内提交昵称。';response=renameModal(t,id);
    }else if(action==='mute'){
     const p=await penaltyRequest(this.env,t.guild,'mute',{id:t.penalty.id,user:id});t.penalty.status=p.status;t.penaltyDue=Date.now()+2000;notice='禁言裁决已提交，执行结果会显示在公开面板。';
    }else{
     if(!modal)throw Error('请使用自己的昵称表单。');const nickname=i.data.components?.flatMap(r=>r.components||[]).find(c=>c.custom_id==='nickname')?.value;
     const p=await penaltyRequest(this.env,t.guild,'submit',{id:t.penalty.id,user:id,nickname});t.penalty.status=p.status;t.penaltyDue=Date.now()+2000;notice='昵称已提交，执行结果会显示在公开面板。';
    }
   }else throw Error('无效操作。');
  }catch(e){return json(bound&&i.type===3?panelReply(e.message):priv(e.message));}
  t.version++;if(response)response=renameModal(t,id);await this.save(t,[...seen.slice(-99),i.id]);
  if(response)return json(response);
  if(simultaneous)return json({type:7,data:{content:notice,embeds:[],components:[],attachments:[],allowed_mentions:{parse:[]}}});
  if(modal||action==='mute')return json(priv(notice));
  if(bound)return json(panelReply(notice));
  return json(action==='join'?priv(notice):{type:6});
 }
 async alarm(t){await this.progress(t);await this.host.boards.flush(t,Date.now());await this.host.armAlarm(t);}
}
