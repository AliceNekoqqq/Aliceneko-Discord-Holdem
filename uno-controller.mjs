import * as game from './uno-engine.mjs';
import {board,handPanel,HELP,button,row,management,sortedCards,PAGE_SIZE,socialMenu,label} from './uno-ui.mjs';
import {EMOTES,sendEmote,expireEmote} from './uno-social.mjs';
const json=body=>Response.json(body);
const privateReply=content=>({type:4,data:{content:/^\p{Extended_Pictographic}/u.test(content)?content:`🦋 ${content}`,flags:64,allowed_mentions:{parse:[]}}});
export class UnoController {
 constructor(host){this.host=host;this.ctx=host.ctx;this.env=host.env;}
 async dispatch(payload,t){
  const i=payload.interaction,id=i.member?.user?.id,admin=(BigInt(i.member?.permissions||'0')&40n)!==0n;
  if(!id||!i.guild_id)return json(privateReply('请在服务器文字频道使用。'));
  if(t&&(t.guild!==i.guild_id||t.channel!==i.channel_id))return json(privateReply('频道不匹配。'));
  if(t?.game==='uno'&&t.idleDeadline&&Date.now()>=t.idleDeadline){game.close(t,t.owner,true);t.version++;await this.host.save(t);await this.host.queuePanels(t);await this.host.syncBoard(t);}
  const displayName=(i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'').replace(/[\r\n\x00-\x1f]/g,' ').slice(0,24);
  if(t?.game==='uno'&&displayName){const p=t.players.find(p=>p.id===id&&!p.bot);if(p)p.name=displayName;}
  if(i.type===2){
   const sub=i.data.options?.[0]?.name;
   if(i.data.name==='uno'&&sub==='帮助')return json(privateReply(HELP));
   if(sub==='牌桌')return json(privateReply(t&&t.phase!=='closed'?(t.messageId?`当前${t.game==='uno'?' UNO':'德州'}牌桌：https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId}`:'牌桌正在创建，请稍候。'):'当前频道没有牌桌。'));
   if(i.data.name!=='uno')return json(privateReply('当前频道已有 UNO 牌桌；先关桌再创建德州。'));
   if(!['创建','测试'].includes(sub))return json(privateReply(HELP));
   if(!this.env.BOT_TOKEN)return json(privateReply('机器人尚未配置完成。'));
   if(t&&t.phase!=='closed')return json(privateReply(`当前频道已有${t.game==='uno'?' UNO':'德州'}牌桌，请使用「牌桌」指令。`));
   if(await this.ctx.storage.get('createdInteraction')===i.id)return json(privateReply('本次创建已处理。'));
   const options=i.data.options[0].options||[];
   try{t=game.newTable(id,i.channel_id,i.guild_id,options.find(o=>o.name==='模式')?.value||'round');if(sub==='测试')game.addComputers(t,id,options.find(o=>o.name==='电脑数量')?.value??(t.mode==='teams'?3:2));}catch(e){return json(privateReply(e.message));}
   if(displayName)t.players[0].name=displayName;await this.host.save(t);await this.ctx.storage.put('createdInteraction',i.id);return json({type:4,data:board(t),bindEpoch:t.epoch});
  }
  if(t?.game!=='uno'||t.phase==='closed')return json(privateReply('UNO 牌桌已关闭，请重新创建。'));
  const parts=(i.data?.custom_id||'').split(':');if(i.type!==3||parts.length!==4||parts[0]!=='u'||parts[1]!==t.epoch)return json(privateReply('旧牌桌按钮无效，请打开当前牌桌。'));
  const social=parts[3].match(/^s~(\d+)~(.+)$/),isPrivate=!!(Number(i.message?.flags)&64);
  if(social&&(social[1]!==id||!isPrivate))return json(privateReply('请打开自己的互动菜单。'));
  const panel=parts[3].match(/^p~(\d+)~(.+)$/),manager=parts[3].match(/^m~(\d+)~(.+)$/),action=panel?panel[2]:manager?manager[2]:social?social[2]:parts[3];
  if(panel&&(panel[1]!==id||!isPrivate))return json(privateReply('请从公共牌桌打开自己的「手牌 / 操作」。'));
  if(manager&&(manager[1]!==id||!isPrivate))return json(privateReply('请打开自己的牌桌管理。'));
  const seated=t.players.some(p=>p.id===id&&!p.bot);
  const panelReply=(notice='')=>({type:6,panelData:handPanel(t,id,notice)});
  const forfeiture=action.match(/^giveup~(\d+)~(\d+)$/);
  if(forfeiture&&(forfeiture[1]!==id||!isPrivate))return json(privateReply('请使用自己的认输确认。'));
  if(forfeiture&&Number(forfeiture[2])!==t.handNo)return json(privateReply('🔄 已经换局，旧认输确认未执行。'));
  const prompt=action.match(/^(color|yesclose)~(\d+)(?:~(\d+)~(red|yellow|green|blue))?$/);
  if(prompt&&(prompt[2]!==id||!isPrivate))return json(privateReply('这不是你的操作提示。'));
  if(action==='social'||social){
   if(!seated)return json(privateReply('🪑 先加入牌桌，才能和大家互动哦。'));
   if(!social&&t.messageId&&i.message?.id!==t.messageId)return json(privateReply('请从当前公共牌桌打开互动。'));
   if(action==='social')return json({type:4,data:{...socialMenu(t,id),flags:64}});
   const [kind,hand,target,key]=action.split('~');
   if(!/^\d+$/.test(hand||'')||Number(hand)!==t.handNo)return json(privateReply('🔄 已经换局啦，请重新打开互动菜单。'));
   if(kind==='target'){const selected=i.data.values?.[0];if(selected===id||!t.players.some(p=>p.id===selected))return json(privateReply('🎯 对方已离桌，请重新选择玩家。'));return json({type:7,data:socialMenu(t,id,selected)});}
   if(kind!=='say')return json(privateReply('请选择菜单里的互动。'));
   const seen=await this.ctx.storage.get('recentInteractions')||[];
   if(seen.includes(i.id))return json({type:7,data:{content:'✅ 这句已经送到牌桌啦！',components:[],allowed_mentions:{parse:[]}}});
   try{sendEmote(t,id,target,key,Number(hand));}catch(e){return json(privateReply(e.message));}
   await this.ctx.storage.put('table',t);await this.ctx.storage.put('recentInteractions',[...seen.slice(-99),i.id]);await this.host.syncBoard(t);
   return json({type:7,data:{content:`${EMOTES[key].emoji} 已对 **${label(t,target)}** 说：${EMOTES[key].text}\n💬 公共桌面会显示双方互动，继续出牌吧！`,components:[],allowed_mentions:{parse:[]}}});
  }
  if(action==='help')return json(privateReply(HELP));
  if(action==='manage')return json({type:4,data:{...management(t,id,admin),flags:64}});
  if(action==='refresh'){await this.host.syncBoard(t);return json({type:6});}
  if(action==='hand'||action==='jumpmenu'||action==='locate'||action.startsWith('page~')){
   if(!seated)return json(privateReply('请先加入牌桌。'));
   if(action.startsWith('page~')){const page=Number(action.slice(5));if(!panel||!Number.isInteger(page)||page<0||page>10)return json(privateReply('无效页码。'));t.pages??={};t.pages[id]=page;await this.ctx.storage.put('table',t);}
   if(action==='locate'){if(!panel)return json(privateReply('请从自己的手牌操作。'));const p=t.players.find(p=>p.id===id),card=game.legalCards(t,id)[0];if(card!==undefined){t.pages??={};t.pages[id]=Math.floor(sortedCards(p).indexOf(card)/PAGE_SIZE);await this.ctx.storage.put('table',t);}}
   if(panel)return json(panelReply());
   return json({type:4,data:{...handPanel(t,id),flags:64}});
  }
  if(action==='surrender'){if(!seated||t.phase!=='active'||t.players.find(p=>p.id===id).surrendered)return json(privateReply('🏳️ 只能在进行中的本局认输。'));return json({type:4,data:{content:'🏳️ **这局先歇会儿？**\n认输后本局不能继续出牌，已收到的罚牌会先收下，其他玩家继续。全真人对局完成后计一次负场；2v2 队友仍可继续，你本人不获得胜场。下一局可重新参战。',flags:64,components:[row(button(t,`giveup~${id}~${t.handNo}`,'🏳️ 确认本局认输',4))],allowed_mentions:{parse:[]}}});}
  if(action==='close'){if(id!==t.owner&&!admin)return json(privateReply('只有桌主或管理员可关桌。'));return json({type:4,data:{content:'🌙 准备收摊吗？确认关闭 UNO 牌桌，未完成本局不计分。',flags:64,components:[row(button(t,`yesclose~${id}`,'确认关桌',4))],allowed_mentions:{parse:[]}}});}
  if(!panel&&!manager&&!prompt&&!forfeiture&&t.messageId&&i.message?.id!==t.messageId)return json(privateReply('请使用当前公共牌桌。'));
  if(Number(parts[2])!==t.version&&prompt?.[1]!=='yesclose'&&!forfeiture&&!(panel&&action.startsWith('jump~')))return json(panel?panelReply('🔄 牌局跑在前面啦：刚才操作未执行，请按当前手牌选择。'):privateReply('🔄 牌局已更新，操作未执行，请回牌桌重新选择。'));
  if(t.idleDeadline&&Date.now()>=t.idleDeadline){game.close(t,t.owner,true);t.version++;await this.host.save(t);await this.host.syncBoard(t);return json(privateReply('牌桌已因长时间无人操作关闭。'));}
  if(t.deadline&&Date.now()>=t.deadline&&prompt?.[1]!=='yesclose'){game.timeout(t);t.version++;await this.host.save(t);await this.host.queuePanels(t);await this.host.syncBoard(t);return json(panel?panelReply('⏰ 回合超时，已自动处理，下一棒继续！'):privateReply('⏰ 回合超时啦，请查看当前牌桌。'));}
  const seen=await this.ctx.storage.get('recentInteractions')||[];if(seen.includes(i.id))return json(privateReply('本次操作已处理。'));
  let reveal=null;
  try{
   if(action==='join'){game.join(t,id);if(displayName)t.players.find(p=>p.id===id).name=displayName;}else if(action==='leave')game.leave(t,id);else if(action==='start')game.start(t,id);
   else if(action.startsWith('rule~')&&manager){const [,key,value]=action.split('~');game.configure(t,id,key,key==='jumpIn'?(value==='true'?true:value==='false'?false:null):value);}
   else if(action.startsWith('jump~')&&panel){const [,key,value]=action.split('~');if(!/^\d{1,3}$/.test(value||''))throw Error('无效抢出牌。');game.jump(t,id,Number(value),key);}
   else if(forfeiture)game.surrender(t,id);
   else if(action==='addbot')game.addComputers(t,id);else if(action==='removebots')game.removeComputers(t,id);
   else if(action==='draw'&&panel)game.draw(t,id);else if(action==='pass'&&panel)game.pass(t,id);
   else if(action==='uno')game.declareUno(t,id);else if(action==='catch')game.catchUno(t,id);
   else if(action==='accept'&&panel)game.accept(t,id);else if(action==='challenge'&&panel)reveal=game.challenge(t,id);
   else if(action.startsWith('opening~')&&panel)game.chooseOpeningColor(t,id,action.slice(8));
   else if(action==='play'&&panel||action.startsWith('card~')&&panel){const value=action.startsWith('card~')?action.slice(5):i.data.values?.[0];if(!/^\d{1,3}$/.test(value||''))throw Error('请选择有效牌。');const card=Number(value);if(!game.playable(t,id,card))throw Error('现在不能出这张牌。');if(!game.face(card).color){t.selectedWild={id,card};await this.ctx.storage.put('table',t);return json(panelReply());}game.play(t,id,card);}
   else if(action==='change'&&panel){t.selectedWild=null;await this.ctx.storage.put('table',t);return json(panelReply());}
   else if(action.startsWith('pickcolor~')&&panel){const [,card,color]=action.split('~');if(t.selectedWild?.id!==id||t.selectedWild.card!==Number(card))throw Error('请先选择自己的万能牌。');game.play(t,id,Number(card),color);}
   else if(prompt?.[1]==='color')game.play(t,id,Number(prompt[3]),prompt[4]);
   else if(prompt?.[1]==='yesclose')game.close(t,id,admin);else throw Error('无效操作。');
  }catch(e){return json(panel&&seated?panelReply(e.message):privateReply(e.message));}
  t.version++;t.lastActive=Date.now();if(t.phase!=='closed')t.idleDeadline=Date.now()+(t.phase==='lobby'?600000:900000);
  await this.host.save(t);await this.ctx.storage.put('recentInteractions',[...seen.slice(-99),i.id]);await this.host.syncBoard(t);
  if(reveal)return json({type:4,data:{flags:64,content:`🕵️ **质疑${reveal.success?'成功':'失败'}**\n+4 出牌者出牌前的手牌（仅你可见）：\n${reveal.cards.map(game.cardName).join('、')}\n当时颜色：${game.COLOR_NAMES[reveal.previousColor]}。${reveal.success?`对方摸累计 ${reveal.penalty} 张，你继续行动。`:`你摸 ${reveal.total} + 2 = ${reveal.penalty} 张并跳过。`}`,allowed_mentions:{parse:[]}}});
  if(forfeiture)return json({type:7,data:{content:'🏳️ 已认输，本局休息，下一局再来！',components:[],embeds:[],attachments:[],allowed_mentions:{parse:[]}}});
  if(prompt)return json({type:7,data:{content:prompt[1]==='yesclose'?'🌙 UNO 牌桌已关闭，下次再战！':'🎴 已出牌，去看看自动更新的手牌吧！',embeds:[],components:[],attachments:[]}});
  if(panel&&t.phase!=='closed'&&seated)return json(panelReply('✅ 操作已执行，精彩继续！'));
  if(manager)return json({type:7,data:t.players.some(p=>p.id===id)&&t.phase!=='closed'?management(t,id,admin):{content:t.phase==='closed'?'牌桌已关闭。':'你已离桌。',components:[],embeds:[],attachments:[]}});
  return json({type:6});
 }
 async alarm(t){const now=Date.now();let changed=false;
  if(t.idleDeadline&&t.idleDeadline<=now){game.close(t,t.owner,true);changed=true;}
  else if(t.deadline&&t.deadline<=now)changed=game.timeout(t);
  else if(game.expireJump(t,now))changed=true;
  else if(t.computerJumpDue&&t.computerJumpDue<=now)changed=game.computerJump(t);
  else if(t.computerDue&&t.computerDue<=now)changed=game.computerTurn(t);
  if(changed){t.version++;await this.host.save(t);await this.host.queuePanels(t);await this.host.syncBoard(t);}
  if(expireEmote(t,now)){await this.ctx.storage.put('table',t);await this.host.syncBoard(t);}
  if((await this.ctx.storage.get('privateExpiry'))<=now){await this.host.panels.prune(t);await this.host.armAlarm(t);return true;}
  const syncAt=await this.ctx.storage.get('privateSyncAt');if(syncAt&&syncAt<=now){await this.ctx.storage.delete('privateSyncAt');if(await this.host.panels.sync(t))await this.ctx.storage.put('privateSyncAt',Date.now()+3000);await this.host.armAlarm(t);return true;}
  await this.host.armAlarm(t);
 }
}
