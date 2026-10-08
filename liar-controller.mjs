import * as game from './liar-engine.mjs';
import {board,handPanel,management,confirmation,social,HELP,row,button} from './liar-ui.mjs';
const json=body=>Response.json(body),priv=content=>({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
export class LiarController {
 constructor(host){this.host=host;this.storage=host.ctx.storage;this.env=host.env;}
 async save(t){const before=await this.storage.get('table');t.computerDue=t.phase==='active'&&t.players.some(p=>p.id===t.turn&&p.bot)?before?.phase===t.phase&&before?.turn===t.turn&&before?.computerDue?before.computerDue:Date.now()+1800:null;await this.storage.put('table',t);await this.host.liarBridge.capture(t);await this.host.boards.queue(t);await this.host.armAlarm(t);if(before&&before.version!==t.version)this.host.queueAICommentary(before,t);}
 async progress(t,now=Date.now()){
  if(t?.game!=='liar')return false;let changed=game.expire(t,now);if(!changed)changed=game.advance(t,undefined,now);if(!changed)changed=game.timeout(t,now);if(changed){t.version++;await this.save(t);await this.host.queuePanels(t);}return changed;
 }
 async dispatch(payload,t){const i=payload.interaction,id=i.member.user.id,display=i.member.nick||i.member.user.global_name||i.member.user.username||'玩家';await this.progress(t);const admin=(BigInt(i.member.permissions||'0')&40n)!==0n;
  if(i.type===2){const sub=i.data.options?.[0]?.name;if(i.data.name==='骗子酒馆'&&sub==='帮助')return json(priv(HELP));if(sub==='牌桌')return json(priv(t&&t.phase!=='closed'?(t.messageId?`牌桌：https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId}`:'牌桌正在创建。'):'当前频道没有牌桌。'));
   if(i.data.name!=='骗子酒馆')return json(priv('当前频道已有骗子酒馆牌桌。'));if(!['创建','测试'].includes(sub))return json(priv(HELP));if(!this.env.BOT_TOKEN)return json(priv('机器人尚未配置完成。'));if(t&&t.phase!=='closed')return json(priv('当前频道已有牌桌，请先结束牌桌。'));if(await this.storage.get('createdInteraction')===i.id)return json(priv('本次创建已处理。'));
   t=game.create(id,i.channel_id,i.guild_id,display);if(sub==='测试'){const count=i.data.options[0].options?.find(o=>o.name==='电脑数量')?.value??2;try{game.addBots(t,id,count);}catch(e){return json(priv(e.message));}}await this.save(t);await this.storage.put('createdInteraction',i.id);return json({type:4,data:board(t),bindEpoch:t.epoch});
  }
  if(t?.game!=='liar'||t.phase==='closed')return json(priv('这张酒馆牌桌已结束，请重新开局。'));const parts=String(i.data?.custom_id||'').split(':');if(i.type!==3||parts.length!==4||parts[0]!=='l'||parts[1]!==t.epoch)return json(priv('这是旧牌桌的按钮，请使用当前牌桌。'));
  const privateMessage=!!(Number(i.message?.flags)&64),bound=parts[3].match(/^([pmcs])~(\d+)~(.+)$/);if(bound&&(bound[2]!==id||!privateMessage))return json(priv('请打开自己的私密操作窗口。'));if(!bound&&t.messageId&&i.message?.id!==t.messageId)return json(priv('请使用原牌桌消息上的按钮。'));
  const action=bound?bound[3]:parts[3],p=t.players.find(p=>p.id===id&&!p.bot);if(p)p.name=display;
  const panelReply=notice=>({type:6,panelData:handPanel(t,id,notice)}),managerReply=notice=>({type:bound?.[1]==='m'?7:4,data:{...management(t,id,admin,notice),...(bound?.[1]==='m'?{}:{flags:64})}});
  if(action==='help')return json(priv(HELP));if(action==='refresh'){await this.host.syncBoard(t);return json({type:6});}
  if(action==='hand'){if(!p)return json(priv('你没有加入这张牌桌。'));return json(bound?.[1]==='p'?panelReply():{type:4,data:{...handPanel(t,id),flags:64}});}
  if(action==='manage')return json(managerReply());if(action==='social'){if(!p)return json(priv('请先加入牌桌。'));return json({type:4,data:social(t,id)});}
  const isPanel=bound?.[1]==='p',isManager=bound?.[1]==='m',isConfirm=bound?.[1]==='c',isSocial=bound?.[1]==='s';
  if(Number(parts[2])!==t.version&&!['join','ready'].includes(action))return json(isPanel&&p?panelReply('牌局刚刚变化，操作未执行。请按最新手牌选择。'):isManager?managerReply('牌局已更新，请重新选择。'):priv('牌局刚刚变化，操作未执行。请使用最新按钮。'));
  const seen=await this.storage.get('recentInteractions')||[];if(seen.includes(i.id))return json(priv('这次操作已处理。'));let notice='操作已执行。',effective=true;
  try{
   if(action==='surrender'&&isManager){if(!p?.alive||!['active','roulette','intermission'].includes(t.phase))throw Error('现在不能认输。');return json({type:4,data:confirmation(t,id,'giveup')});}
   if(action==='close'&&isManager){if(id!==t.owner&&!admin)throw Error('只有桌主或管理员可以结束牌桌。');return json({type:4,data:confirmation(t,id,'yesclose')});}
   if(action==='join'&&!bound){game.join(t,id,display);notice='已入座，准备后开局。';}
   else if(action==='ready'&&!bound)game.ready(t,id);
   else if(action==='start'&&!bound)game.start(t,id);
   else if(action==='addbot'&&isManager)game.addBots(t,id);
   else if(action==='removebots'&&isManager)game.removeBots(t,id);
   else if(action==='leave'&&isManager)game.leave(t,id);
   else if(action==='yesclose'&&isConfirm){if(id!==t.owner&&!admin)throw Error('只有桌主或管理员可以结束牌桌。');game.close(t,'桌主或管理员结束了牌桌。');notice='牌桌已结束。';}
   else if(action==='giveup'&&isConfirm){game.forfeit(t,id);notice='已认输，可旁观到本局结束。';}
   else if(action==='play'&&isPanel){const values=i.data.values;if(!Array.isArray(values)||values.some(v=>!/^\d$/.test(v)))throw Error('请选择手牌菜单中的1～3张牌。');game.play(t,id,values.map(Number));notice='已盖牌；牌面不会向其他玩家公开。';}
   else if(action==='believe'&&isPanel){game.believe(t,id);notice='你相信上一手，现在选择自己的牌盖下。';}
   else if(action==='challenge'&&(!bound||isPanel)){game.challenge(t,id);notice='已质疑，牌桌正在翻牌并揭晓轮盘。';}
   else if(isSocial){if(!p||!['active','roulette','intermission'].includes(t.phase))throw Error('本局没有可互动的酒客。');const text=['我很镇定，真的。','盯着你的眼睛看……','碰个杯，待会见真章。','这手牌，我可不信。'][Number(action)];if(!text)throw Error('无效互动。');if(t.socialLastAt&&Date.now()-t.socialLastAt<8000)throw Error('稍等一会，让其他酒客说句话。');t.socialLastAt=Date.now();t.events=[...t.events,{actor:id,text}].slice(-3);effective=false;notice='互动已显示在原牌桌。';}
   else throw Error('无效操作。');
  }catch(e){return json(isPanel&&p?panelReply(e.message):isManager?managerReply(e.message):priv(e.message));}
  if(effective&&t.phase!=='closed')game.touch(t);if(effective)t.version++;await this.save(t);await this.storage.put('recentInteractions',[...seen.slice(-99),i.id]);await this.host.queuePanels(t);
  if(isConfirm||isSocial)return json({type:7,data:{content:notice,components:[],embeds:[],attachments:[],allowed_mentions:{parse:[]}}});if(isPanel&&p)return json(panelReply(notice));if(isManager)return json(t.phase==='closed'||!t.players.some(p=>p.id===id)?{type:7,data:{content:notice,components:[],embeds:[],attachments:[],allowed_mentions:{parse:[]}}}:managerReply(notice));
  // Establish an explicitly private original reply before automatic hand updates.
  if(['join','ready','start'].includes(action))return json({type:4,data:handPanel(t,id,notice)});
  return json({type:6});
 }
 async alarm(t){const now=Date.now();await this.progress(t,now);if(t.phase==='active'&&t.computerDue&&t.computerDue<=now&&game.computerTurn(t,undefined,now)){t.version++;await this.save(t);await this.host.queuePanels(t);}
  // A due board update wins over private work so animation states reach the table.
  const boardDue=await this.storage.get('boardSyncAt');if(boardDue&&boardDue<=now){await this.host.boards.flush(t,now);return true;}
  const expiry=await this.storage.get('privateExpiry');if(expiry&&expiry<=now){await this.host.panels.prune(t);return true;}const due=await this.storage.get('privateSyncAt');if(due&&due<=now){await this.storage.delete('privateSyncAt');if(await this.host.panels.sync(t))await this.storage.put('privateSyncAt',Date.now()+2000);return true;}return false;
 }
}
