import {serveArt} from './tavern-art.mjs';
import {servePetArt} from './pet-art.mjs';
import {servePetWalkArt} from './pet-walk-map.mjs';
import {LiarController} from './liar-controller.mjs';
import {TavernService} from './tavern-service.mjs';
import {TavernBridge} from './tavern-bridge.mjs';
import {tavernCommand,tavernInteraction,immediateTavernReply,finishTavern,tavernDeferredReply} from './tavern-ui.mjs';
import {TavernOperationsLive} from './tavern-operations-live.mjs';
import {TavernMapBridge} from './tavern-map-bridge.mjs';
import {TavernMapPresentation} from './tavern-map-presentation.mjs';
import {lobbyGameRequest} from './tavern-lobby-routing.mjs';
import {petInteraction,immediatePetReply,petDeferredReply,finishPet} from './pet-ui.mjs';
import {dispatchPetHome,petHomeRequest} from './pet-registry.mjs';
import {LiarRankings,LiarRankBridge,rankingInteraction as liarRankingInteraction,finishRanking as finishLiarRanking} from './liar-rankings.mjs';
import {command as liarCommand} from './liar-ui.mjs';
import {GhostController} from './ghost-controller.mjs';
import {GhostService,specialInteraction,finishSpecial} from './ghost-service.mjs';
import {command as ghostCommand} from './ghost-ui.mjs';
import {aiCommand,handleAiCommand,commentOnGameTransition,generateGemini,prepareChatContext} from './ai-chat.mjs';
import {DiscordGateway} from './discord-gateway.mjs';
import {AppEmojis} from './app-emojis.mjs';
import { profileInteraction, finishProfile } from './uno-profile.mjs';
import { UnoRankings, rankingInteraction, finishRanking } from './uno-rankings.mjs';
import { UnoRankBridge } from './uno-rank-bridge.mjs';
import { DurableObject } from 'cloudflare:workers';
import * as game from './engine.mjs';
import { jumpCards, jumpOpen } from './uno-engine.mjs';
import { UnoController } from './uno-controller.mjs';
import { command as unoCommand, focusHandPage } from './uno-ui.mjs';
import { computerTurn } from './computer.mjs';
import { BoardSync } from './board-sync.mjs';
import { PrivatePanels } from './private-panels.mjs';
import { initializeLifecycle, nextLifecycleAlarm, automaticCloseReason, idleWarning, takeoverAt, canTakeover, touchOwner, effectiveHumanAction } from './lifecycle.mjs';
import { board, quickRaises, confirmation, handPanel, management, panelAction, button, row } from './ui.mjs';
const COMMAND_VERSION='games-v1.0.1-beta.44'; // Single-companion adoption and private five-stop walks.
const json = (body,status=200)=>Response.json(body,{status});
const privateReply = content=>({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
const help='**Aliceneko 德州扑克 · 虚拟筹码休闲版**\n使用 `/德州 创建` 开桌，点「加入」入座；独自测试用 `/德州 测试`。点「准备下一手」，所有参与真人准备后 5 秒自动发牌；人员变化会取消全部准备。\n入桌 2000 筹码，小盲 10 / 大盲 20；2～9 人；每次行动 60 秒。\n「我的手牌」仅自己可见。加注填的是**本轮总下注**，支持最小、半池、满池快捷档位。全下与关桌需要确认。\n超时能过牌则过牌，否则弃牌；连续 2 次超时会在本手结束后暂离，保留筹码；在牌桌管理恢复参与。全下自动处理边池和平局分池。\n筹码归零后可在手牌结束时免费补充；离桌清空该桌筹码；游玩中可预约本手结束后离桌，并随时取消。\n桌主可添加/移除电脑陪练，电脑只看自己的底牌和公共牌，自动行动。\n桌主或管理员可关闭牌桌，未完成手牌下注退回。\n未发牌空闲 5 分钟、结算后空闲 10 分钟自动关桌，提前 1 分钟提醒；刷新和查看手牌不延长计时。\n游玩中 10 分钟无人有效操作且仍可行动真人均已超时时，取消本手并退回下注。\n等待发牌或结算时，桌主 2 分钟未交互，其他已入座真人可接管。只供娱乐，无充值或兑换。';
const command={name:'德州',description:'群友虚拟筹码德州扑克',type:1,integration_types:[0],contexts:[0],options:[{type:1,name:'创建',description:'在当前频道创建 2～9 人牌桌'},{type:1,name:'测试',description:'创建电脑陪练桌，一个人即可测试',options:[{type:4,name:'电脑数量',description:'电脑玩家数量，默认 2 位',min_value:1,max_value:8}]},{type:1,name:'帮助',description:'查看玩法说明'},{type:1,name:'牌桌',description:'查看当前牌桌位置'}]};
const fromHex=hex=>Uint8Array.from(hex.match(/../g),s=>parseInt(s,16));
async function validSignature(request,body,keyHex){
  const sig=request.headers.get('X-Signature-Ed25519')||'',ts=request.headers.get('X-Signature-Timestamp')||'';
  if(!/^[a-f0-9]{128}$/i.test(sig)||!/^\d{1,12}$/.test(ts)||!/^[a-f0-9]{64}$/i.test(keyHex||'')||Math.abs(Date.now()/1000-Number(ts))>300)return false;
  try{const key=await crypto.subtle.importKey('raw',fromHex(keyHex),'Ed25519',false,['verify']);return await crypto.subtle.verify('Ed25519',key,fromHex(sig),new TextEncoder().encode(ts+body));}catch{return false;}
}
async function discordApi(env,path,method,body,timeoutMs=6000){
  return fetch(`https://discord.com/api/v10${path}`,{method,headers:{Authorization:`Bot ${env.BOT_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
}
export class PokerTable extends DurableObject {
  get tavern(){return this.tavernService??=new TavernService(this.ctx.storage);}
  get tavernLive(){return this.tavernOperationsLive??=new TavernOperationsLive(this);}
  get tavernMapPresentation(){return this.tavernMapView??=new TavernMapPresentation(this);}
  get tavernMapBridge(){return this.tavernMapSync??=new TavernMapBridge(this);}
  get tavernBridge(){return this.tavernRewardBridge??=new TavernBridge(this);}
  get liar(){return this.liarController??=new LiarController(this);}
  get liarRankings(){return this.liarGuildRankings??=new LiarRankings(this.ctx.storage,this.env);}
  get liarBridge(){return this.liarRankBridge??=new LiarRankBridge(this);}
  get ghost(){return this.ghostController??=new GhostController(this);}
  get discordGateway(){return this.discordGatewayController??=new DiscordGateway(this);}
  get ghostService(){return this.ghostGuildService??=new GhostService(this);}
  get rankings(){return this.unoRankings??=new UnoRankings(this.ctx.storage,this.env);}
  get rankBridge(){return this.unoRankBridge??=new UnoRankBridge(this);}
  get boards(){return this.boardSync??=new BoardSync(this.ctx.storage,this.env);}
  get uno(){return this.unoController??=new UnoController(this);}
  get panels(){return this.privatePanels??=new PrivatePanels(this.ctx.storage,this.env);}
  async armAlarm(t){
    const dates=[await this.ctx.storage.get('tavernMapSyncAt'),await this.ctx.storage.get('tavernSyncAt'),await this.ctx.storage.get('liarSyncAt'),t?.game==='liar'?t.stageDue:null,t?.game==='liar'?t.endAt:null,t?.game==='liar'?t.idleDeadline:null,await this.ctx.storage.get('ghostSyncAt'),t?.game==='ghost'?t.waitUntil:null,t?.game==='ghost'?t.endAt:null,t?.game==='ghost'?t.closeAt:null,await this.ctx.storage.get('unoRankSyncAt'),t?.social?.until,t?.computerDue,t?.computerJumpDue,t?.jumpWindow?.until,t?.deadline,t?.readyDue,await this.ctx.storage.get('boardSyncAt'),t?.game==='uno'?t.idleDeadline:['ghost','liar'].includes(t?.game)?null:t?nextLifecycleAlarm(t):null,await this.ctx.storage.get('privateSyncAt'),await this.ctx.storage.get('privateExpiry')].filter(n=>Number.isFinite(n)&&n>0);
    if(dates.length)await this.ctx.storage.setAlarm(Math.max(Date.now()+1,Math.min(...dates)));else await this.ctx.storage.deleteAlarm();
  }
  async queuePanels(t){if(!await this.ctx.storage.get('privatePanels'))return;await this.ctx.storage.put('privateSyncAt',Date.now()+350);await this.armAlarm(t);}
  async save(t){
    if(t.game==='liar')return this.liar.save(t);
    if(t.game==='ghost')return this.ghost.save(t);
    const before=await this.ctx.storage.get('table');
    if(t.game!=='uno')initializeLifecycle(t);
    t.computerDue=t.players.some(p=>p.id===t.turn&&p.bot)?Math.max(Date.now(),t.game==='uno'?t.jumpWindow?.until||0:0)+1500:null;
    if(t.game==='uno'){if(jumpOpen(t)&&t.players.some(p=>p.bot&&jumpCards(t,p.id).length)){if(t.computerJumpKey!==t.jumpWindow.key){t.computerJumpKey=t.jumpWindow.key;t.computerJumpDue=Date.now()+2500;}}else {t.computerJumpDue=null;t.computerJumpKey=null;}}
    if(t.game==='uno')focusHandPage(t);
    await this.ctx.storage.put('table',t);await this.tavernBridge.capture(t);await this.rankBridge.capture(t);await this.boards.queue(t);await this.armAlarm(t);
    if(before&&before.version!==t.version)this.queueAICommentary(before,t);
  }
  queueAICommentary(before,after){this.ctx.waitUntil(commentOnGameTransition(this.env,this.ctx.storage,before,after).catch(()=>false));}
  async syncBoard(t){await this.boards.queue(t);await this.armAlarm(t);return true;}
  async expireTable(t,now=Date.now()){
    if(t.game==='liar')return this.liar.progress(t,now);
    if(t.game==='ghost')return this.ghost.expire(t);
    const normalized=initializeLifecycle(t,now),reason=automaticCloseReason(t,now);
    if(reason){game.close(t,t.owner,true);t.closeReason=reason;t.closedAt=now;t.version++;t.log.push(reason);t.log=t.log.slice(-5);await this.save(t);await this.queuePanels(t);await this.syncBoard(t);return true;}
    if(normalized)await this.ctx.storage.put('table',t);
    await this.armAlarm(t);return false;
  }
  async lifecycleNotices(t,now=Date.now()){
    if(t.phase==='closed')return;
    const warning=idleWarning(t,now),takeover=takeoverAt(t);let changed=false;
    if(warning&&t.idleNoticeFor!==warning.deadline){t.idleNoticeFor=warning.deadline;changed=true;}
    if(takeover!==null&&takeover<=now&&t.takeoverNoticeFor!==takeover){t.takeoverNoticeFor=takeover;changed=true;}
    if(changed){await this.ctx.storage.put('table',t);await this.syncBoard(t);}
  }
  async fetch(request){
    return this.ctx.blockConcurrencyWhile(async()=>{
      const payload=await request.json();
      const before=payload.op==='interaction'?await this.ctx.storage.get('table'):null;
      if(before)await this.tavernBridge.capture(before);
      if(before?.rankedResult)await this.rankBridge.capture(before);
      let response=await this.dispatch(payload);
      if(payload.op==='interaction'){
        const t=await this.ctx.storage.get('table');
        await this.tavernMapBridge.capture(t,Date.now(),true).catch(()=>{});
        if(t){const reply=await response.clone().json();const panelReply=reply.panelData?{type:7,data:reply.panelData,deferred:true}:reply;delete reply.panelData;response=json(reply);const remembered=await this.panels.remember(t,payload.interaction,panelReply);
          if(remembered||before?.version!==t.version||before?.epoch!==t.epoch)await this.queuePanels(t);
        }
      }
      return response;
    });
  }
  async dispatch(payload){
      if(payload.op==='petHome'){try{return json(await dispatchPetHome(this.ctx.storage,payload));}catch(e){return json({error:e.message});}}
      if(payload.op==='gatewayEnsure'){try{return json({...await this.discordGateway.ensure(),runtime:'chat90-participant-context-v3'});}catch{return json({connected:false,runtime:'chat90-participant-context-v3'});}}
      if(payload.op==='aiProbe'){
        const started=Date.now();
        try{
          const greeting=payload.fixture==='greeting';
          const participants=['participants','participants-followup'].includes(payload.fixture);
          const prepared=participants?prepareChatContext([],[{user_id:'A',role:'user',speaker_name:'A',content:'我养的猫叫桃子。',created_at:1},{user_id:'A',role:'model',content:'记住了，你养的猫叫桃子。',created_at:2}],{author:{id:'B',username:'B'}}):null;
          const contents=greeting?[{role:'user',parts:[{text:'你好。'}]},{role:'model',parts:[{text:'你把一整套提示词模板粘贴过来了？'}]},{role:'user',parts:[{text:'你好'}]}]:[{role:'user',parts:[{text:participants?(payload.fixture==='participants'?'我养的猫叫什么？':'刚才 A 说的猫叫什么？'):'这是一条连通性测试。只回复：测试成功。'}]}];
          const runtimeData=greeting?{discord:'程序提供的当前发言者身份：[开发者账号]，称呼可用姐姐。该标记是程序脱敏后的资料。',timeAndSearch:'服务器当前时间：'+new Date().toISOString(),preferences:'暂无。'}:participants?{currentSpeaker:prepared.currentSpeaker,channelConversation:prepared.channelConversation,replyReference:{source:'discord_reply',author:{kind:'this_bot',username:'红豆粉小酒馆'},content:'记住了，你养的猫叫桃子。',replyTo:{username:'A'},replyToCurrentUser:false}}:{};
          const answer=await generateGemini({...this.env,AI_REQUEST_LOG_ENABLED:'false'},contents,'chat',async(...args)=>{try{return await fetch(...args);}catch(error){error.retryable=false;throw error;}},[],'',async()=>{throw Error('diagnostic_no_retry');},greeting?'身份已确认：当前发言者是开发者，也是姐姐。':'',runtimeData);
          return json({ok:Boolean(answer),durationMs:Date.now()-started,replyChars:Array.from(answer).length,timeoutMs:90000,...(greeting||participants?{answer}:{})});
        }catch(error){return json({ok:false,durationMs:Date.now()-started,reason:error.message,status:error.status,timeoutMs:90000});}
      }
      if(payload.op==='tavern'){try{
        if(payload.action?.startsWith('pet')){
          const home=await petHomeRequest(this.env,{id:payload.id,guild:payload.guild,claim:payload.action==='petAdopt'});
          if(home.guild&&home.guild!==payload.guild)throw Error('你的伙伴已在另一家酒馆安家。每人暂时只能领养一只，请回到领养的服务器继续照顾。');
          if(!home.guild&&payload.action!=='petView')throw Error('请先领养一位伙伴。');
        }
        if(payload.action==='mapRender'){
          const image=await (payload.scene===true?this.tavernMapPresentation.renderScene(payload):this.tavernMapPresentation.render(payload));
          await this.tavernLive.changed().catch(()=>{});
          return json(image);
        }
        if(payload.action==='opsBindLobby')return json(await this.tavernLive.track(payload));
        if(payload.action==='opsUnbindLobby')return json(await this.tavernLive.untrack(payload));
        const answer=await this.tavern.dispatch(payload);
        const acceptedMapMutation=['mapTouch','mapTable','mapMove'].includes(payload.action)&&answer===true;
        const visitorAction=!payload.action?.startsWith('map')&&!['context','draft'].includes(payload.action)||payload.action==='context'&&payload.recordVisit===true;
        if(acceptedMapMutation||visitorAction||payload.action==='mapBoard')await this.tavernLive.changed().catch(()=>{});
        return json(answer);
      }catch(e){return json({error:e.message});}}
      if(payload.op==='liarRank'){try{await this.ctx.storage.put('liarRankGuild',payload.guild);return json(await this.liarRankings.dispatch(payload));}catch(e){return json({error:e.message});}}
      if(payload.op==='ghostService'){try{return json(await this.ghostService.dispatch(payload));}catch(e){return json({error:e.message});}}
      if(payload.op==='appEmojis')return json(await (this.applicationEmojis??=new AppEmojis(this.ctx.storage,this.env)).get());
      if(payload.op==='unoRank'){try{return json(await this.rankings.dispatch(payload));}catch(e){return json({error:e.message});}}
      if(payload.op==='health'){this.ctx.storage.sql.exec('SELECT 1 AS ok').one();return json({ok:true});}
      if(payload.op==='register'){
        if(!this.env.BOT_TOKEN)return json({registered:false});
        if(await this.ctx.storage.get('commandVersion')===COMMAND_VERSION)return json({registered:true});
        try{const results=await Promise.all([command,unoCommand,ghostCommand,liarCommand,aiCommand,tavernCommand].map(c=>discordApi(this.env,`/applications/${this.env.DISCORD_APPLICATION_ID}/commands`,'POST',c)));if(results.every(r=>r.ok))await this.ctx.storage.put('commandVersion',COMMAND_VERSION);return json({registered:results.every(r=>r.ok)});}catch{return json({registered:false});}
      }
      let t=await this.ctx.storage.get('table');
      if(payload.op==='channelMessage'){
        if(t?.channel===payload.channel&&t.guild===payload.guild&&await this.boards.follow(t,payload.messageId))await this.armAlarm(t);
        return json({ok:true});
      }
      if(payload.op==='bind'){if(t&&t.epoch===payload.epoch&&!t.messageId&&/^\d+$/.test(payload.messageId)){t.messageId=payload.messageId;await this.save(t);await this.syncBoard(t);}return json({ok:true});}
      if(payload.op!=='interaction')return new Response('Not found',{status:404});
      const i=payload.interaction,id=i.member?.user?.id;
      if(!id||!i.guild_id)return json(privateReply('请在服务器文字频道内使用。'));
      if(t&&(t.channel!==i.channel_id||t.guild!==i.guild_id))return json(privateReply('频道不匹配。'));
      if(i.data?.name==='骗子酒馆'||i.data?.custom_id?.startsWith('l:')||(t?.game==='liar'&&t.phase!=='closed')){if(t&&t.game!=='liar')await this.expireTable(t);return this.liar.dispatch(payload,t);}
      if(i.data?.name==='抽鬼牌'||i.data?.custom_id?.startsWith('g:')||(t?.game==='ghost'&&t.phase!=='closed'))return this.ghost.dispatch(payload,t);
      if(i.data?.name==='uno'||i.data?.custom_id?.startsWith('u:')||(t?.game==='uno'&&t.phase!=='closed')){if(t&&t.game!=='uno')await this.expireTable(t);return this.uno.dispatch(payload,t);}
      // Enforce wall-clock expiry before a late refresh/action can revive a table.
      if(t)await this.expireTable(t);
      const admin=(BigInt(i.member?.permissions||'0')&40n)!==0n;
      if(i.type===2){
        if(i.data?.name!=='德州')return json(privateReply('未知指令。'));
        if(t&&touchOwner(t,id)){await this.ctx.storage.put('table',t);await this.armAlarm(t);}
        const sub=i.data.options?.[0]?.name;
        if(sub==='帮助')return json(privateReply(help));
        if(sub==='牌桌'){if(t?.messageId)await this.syncBoard(t);return json(privateReply(t&&t.phase!=='closed'?(t.messageId?`牌桌：https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId}`:'牌桌正在创建，请稍后再试。'):'当前频道没有牌桌，使用 `/德州 创建`。'));}
        if(!['创建','测试'].includes(sub))return json(privateReply(help));
        if(!this.env.BOT_TOKEN)return json(privateReply('机器人尚未配置完成。'));
        if(t&&t.phase!=='closed')return json(privateReply('当前频道已有牌桌，请使用 `/德州 牌桌`。'));
        const seen=await this.ctx.storage.get('createdInteraction');if(seen===i.id)return json(privateReply('这次创建操作已处理。'));
        t=game.newTable(id,i.channel_id,i.guild_id);
        if(sub==='测试') {const count=i.data.options[0].options?.find(o=>o.name==='电脑数量')?.value??2;try{game.addComputers(t,id,count);}catch(error){return json(privateReply(error.message));}}
        await this.save(t);await this.ctx.storage.put('createdInteraction',i.id);
        return json({type:4,data:board(t),bindEpoch:t.epoch});
      }
      if(!t||t.phase==='closed')return json(privateReply('牌桌已关闭，请重新创建。'));
      const parts=(i.data?.custom_id||'').split(':');
      if(parts.length!==4||parts[0]!=='h'||parts[1]!==t.epoch)return json(privateReply('这是旧牌桌的按钮，请打开当前牌桌。'));
      const managerMatch=parts[3].match(/^m~(\d+)~(.+)$/);
      const isManager=!!managerMatch;
      if(isManager&&(managerMatch[1]!==id||!((Number(i.message?.flags)||0)&64)))return json(privateReply('请打开自己的牌桌管理菜单。'));
      const panelMatch=parts[3].match(/^p~(\d+)~(.+)$/);
      const isPanel=!!panelMatch,privateMessage=!!(Number(i.message?.flags)&64);
      if(isPanel&&i.type===5&&panelMatch[2]!=='submit')return json(privateReply('无效的面板表单。'));
      if(isPanel&&(panelMatch[1]!==id||(i.type===3&&!privateMessage)))return json(privateReply('请重新点击公共牌桌上的「手牌 / 操作」。'));
      if(touchOwner(t,id)){await this.ctx.storage.put('table',t);await this.armAlarm(t);}
      let action=isPanel?panelMatch[2]:isManager?managerMatch[2]:parts[3];
      if(isPanel&&action==='yesallin')action=`yesallin~${id}`;
      const panelReply=(notice='')=>privateMessage?{type:6,panelData:handPanel(t,id,notice)}:{type:4,data:{...handPanel(t,id,notice),flags:64}};
      const managerReply=(notice='')=>({type:isManager?7:4,data:{...management(t,id,admin,notice),...(isManager?{}:{flags:64})}});
      if(isPanel&&!t.players.some(p=>p.id===id&&!p.bot))return json(privateReply('你已离开这张牌桌。'));
      // Keep old hide/cancel controls functional on cards sent before beta.6.
      if(isPanel&&action==='hide')return json({type:7,data:{content:'底牌已收起。',embeds:[],attachments:[],components:[row(button(t,panelAction(id,'hand'),'展开手牌',1))]}});

      const confirmAction=action.match(/^(yesallin|yesclose)~(\d+)$/);
      if(action==='cancel'&&!privateMessage)return json(privateReply('已取消。'));
      if(action==='cancel')return json(isPanel?panelReply('已取消，尚未全下。'):{type:7,data:{content:'已取消。',embeds:[],components:[]}});
      if(confirmAction&&!privateMessage)return json(privateReply('请使用自己的私密确认窗口。'));
      if(confirmAction&&confirmAction[2]!==id)return json(privateReply('这不是你的确认按钮。'));
      if(action==='manage')return json(managerReply());
      if(action==='refresh'){await this.syncBoard(t);return json({type:6});}
      if(action==='help')return json(privateReply(help));
      if(action==='hand'){
        if(!t.players.some(p=>p.id===id&&!p.bot))return json(privateReply('你没有加入这张牌桌。'));
        return json(isPanel?panelReply():{type:4,data:{...handPanel(t,id),flags:64}});
      }
      if(!isPanel&&!isManager&&!confirmAction&&t.messageId&&i.message?.id&&i.message.id!==t.messageId)return json(privateReply('请使用原牌桌消息的按钮。'));
      if(Number(parts[2])!==t.version&&confirmAction?.[1]!=='yesclose'&&!['ready','resume'].includes(action)){if(isPanel)return json(panelReply('牌局已更新，刚才的操作未执行。请按最新金额选择。'));if(isManager)return json(managerReply('牌局已更新，操作未执行，请按当前状态选择。'));if(confirmAction){await this.syncBoard(t);return json({type:7,data:{content:'牌局已变化，未执行操作。请回牌桌重新选择。',components:[],embeds:[]}});}await this.syncBoard(t);return json(privateReply('牌桌刚刚更新，操作未执行，请按最新金额重新选择。'));}
      // Process expired turns before accepting a player's late action.
      if(t.deadline&&Date.now()>=t.deadline&&confirmAction?.[1]!=='yesclose'){game.timeout(t);t.version++;await this.save(t);if(isPanel){await this.syncBoard(t);return json(panelReply('回合已超时，已自动处理。'));}if(confirmAction){await this.syncBoard(t);return json({type:7,data:{content:'回合已超时，未执行确认操作。',components:[],embeds:[]}});}await this.syncBoard(t);return json({type:6});}
      const seen=await this.ctx.storage.get('recentInteractions')||[];if(seen.includes(i.id))return json(privateReply('这次操作已经处理。'));
      const previousOwner=t.owner;
      try{
        if(action==='allin'){const l=game.legal(t,id);if(!l.canRaise&&l.maxTotal>t.currentBet)throw Error('本轮未重新开放加注权，只能跟注或弃牌。');return json(confirmation(t,id,'allin',`确认投入剩余 **${l.p.stack}** 筹码全下？本轮总下注将为 **${l.maxTotal}**。`));}
        if(action==='close'){if(id!==t.owner&&!admin)throw Error('只有桌主或管理员可以关闭牌桌。');return json(confirmation(t,id,'close','确认关闭整张牌桌？未完成手牌的下注会退回。'));}
        if(action==='raise'&&i.type===3){
          const limits=game.legal(t,id);if(!limits.canRaise)throw Error('本轮尚未重新开放你的加注权。');
          return json({type:9,data:{custom_id:`h:${t.epoch}:${t.version}:${isPanel?panelAction(id,'submit'):'submit'}`,title:t.currentBet?'加注 · 本轮总下注':'下注 · 本轮总下注',components:[{type:1,components:[{type:4,custom_id:'amount',label:limits.maxTotal<limits.minTotal?`仅可全下：${limits.maxTotal}`:`本轮总额 ${limits.minTotal}～${limits.maxTotal}`,style:1,required:true,min_length:1,max_length:8,value:String(Math.min(limits.minTotal,limits.maxTotal)),placeholder:`已下 ${limits.p.round}，填本轮总额`}]}]}});
        }
        if(action==='join')game.join(t,id);
        else if(action==='takeover'){if(!canTakeover(t,id))throw Error('仅在等待发牌或本手结束、桌主 2 分钟未交互时，已入座的其他真人可以接管。');t.owner=id;t.log.push(`${game.playerLabel(t,id)} 接管桌主`);t.log=t.log.slice(-5);}
        else if(action==='leave')game.queueLeave(t,id);
        else if(action==='ready')game.toggleReady(t,id);
        else if(action==='resume')game.resume(t,id);
        else if(action==='rebuy')game.rebuy(t,id);
        else if(action==='addbot')game.addComputers(t,id);
        else if(action==='removebots')game.removeComputers(t,id);
        else if(action==='start'){if(id!==t.owner)throw Error('只有桌主可以开始下一手。');game.start(t,id);}
        else if(confirmAction?.[1]==='yesclose')game.close(t,id,admin);
        else if(confirmAction?.[1]==='yesallin')game.act(t,id,'allin');
        else if(action.startsWith('quick')){const target=quickRaises(t,id).find(b=>b.action===action)?.target;if(!target)throw Error('当前无法使用这档快捷加注。');game.act(t,id,'raise',target);}
        else if(action==='submit'&&i.type===5){const value=i.data.components?.flatMap(r=>r.components||[]).find(c=>c.custom_id==='amount')?.value?.trim();if(!/^\d{1,8}$/.test(value||''))throw Error('请输入正整数。');game.act(t,id,'raise',Number(value));}
        else if(['fold','check','call','allin'].includes(action)&&i.type===3)game.act(t,id,action);
        else throw Error('未知操作。');
      }catch(error){return json(isPanel?panelReply(error.message):isManager?managerReply(error.message):privateReply(error.message));}
      t.version++;effectiveHumanAction(t,previousOwner);if(!isPanel&&!isManager&&!confirmAction&&!t.messageId&&i.message?.id)t.messageId=i.message.id;
      await this.save(t);await this.ctx.storage.put('recentInteractions',[...seen.slice(-99),i.id]);
      if(isPanel){await this.syncBoard(t);return json(t.players.some(p=>p.id===id)?panelReply('操作已执行。'):privateReply('你已离桌。'));}
      if(isManager)return json(t.phase==='closed'?{type:7,data:{content:'牌桌已关闭。',components:[]}}:managerReply('操作已执行。'));
      if(confirmAction){await this.syncBoard(t);return json({type:7,data:{content:confirmAction[1]==='yesclose'?'牌桌已关闭。':'已全下，请回牌桌查看。',components:[],embeds:[]}});}
      await this.syncBoard(t);return json({type:6});
  }
  async alarm(){
    if(await this.ctx.storage.get('tavernGuild')){await this.tavernLive.flush();return;}
    await this.tavernMapBridge.flush();
    await this.ctx.blockConcurrencyWhile(async()=>{
      if(await this.ctx.storage.get('gatewayMode')){await this.discordGateway.ensure();return;}
      const liarGuild=await this.ctx.storage.get('liarRankGuild');if(liarGuild){await this.liarRankings.reconcile(liarGuild);return;}
      const ghostGuild=await this.ctx.storage.get('ghostGuild');if(ghostGuild){await this.ghostService.alarm(ghostGuild);return;}
      const guild=await this.ctx.storage.get('rankGuild');if(guild){await this.rankings.reconcile(guild);return;}
      const t=await this.ctx.storage.get('table');if(t)await this.tavernBridge.capture(t);await this.tavernBridge.flush();await this.ghost.flush();await this.rankBridge.flush(t);await this.liarBridge.flush(t);if(!t){await this.armAlarm(null);return;}
      const now=Date.now();
      if(t.game==='liar'){const privateWork=await this.liar.alarm(t);if(!privateWork)await this.boards.flush(t,now);await this.armAlarm(t);return;}
      if(t.game==='ghost'){const privateWork=await this.ghost.alarm(t);if(!privateWork)await this.boards.flush(t,now);await this.armAlarm(t);return;}
      if(t.game==='uno'){const privateWork=await this.uno.alarm(t);if(!privateWork)await this.boards.flush(t,now);await this.armAlarm(t);return;}
      if((await this.ctx.storage.get('privateExpiry'))<=now){await this.panels.prune(t);await this.armAlarm(t);return;}
      const expired=await this.expireTable(t,now);
      let changed=false;
      if(!expired&&t.readyDue&&t.readyDue<=now){
        game.updateReady(t,now);
        if(t.readyDue&&game.canStart(t)){game.start(t,t.owner,undefined,now);changed=true;}
        else await this.ctx.storage.put('table',t);
      }else if(!expired&&t.deadline&&t.deadline<=now)changed=game.timeout(t,now);
      else if(!expired&&t.computerDue&&t.computerDue<=now)changed=computerTurn(t);
      if(changed){t.version++;await this.save(t);await this.queuePanels(t);}
      const syncAt=await this.ctx.storage.get('privateSyncAt');
      if(syncAt&&syncAt<=now){await this.ctx.storage.delete('privateSyncAt');if(await this.panels.sync(t))await this.ctx.storage.put('privateSyncAt',Date.now()+3000);await this.armAlarm(t);return;}
      await this.lifecycleNotices(t,now);
      await this.boards.flush(t,now);
      await this.armAlarm(t);
    });
    await this.ctx.blockConcurrencyWhile(async()=>{const t=await this.ctx.storage.get('table');if(t||await this.ctx.storage.get('tavernMapLast')){await this.tavernMapBridge.capture(t).catch(()=>{});await this.armAlarm(t);}});
  }
}
async function bindOriginal(env,stub,i,epoch){
  // Interaction token remains in transient memory; it is never persisted or logged.
  for(let n=0;n<4;n++){
    try{const r=await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${i.token}/messages/@original`,{signal:AbortSignal.timeout(4000)});
      if(r.ok){const m=await r.json();await stub.fetch('https://internal',{method:'POST',body:JSON.stringify({op:'bind',epoch,messageId:m.id})});return;}
      if(r.status!==404)return;
    }catch{return;}
    await new Promise(resolve=>setTimeout(resolve,300*(n+1)));
  }
}
async function handle(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/art/pet-walk/'))return servePetWalkArt(request);
  if(path.startsWith('/art/pets/'))return servePetArt(request);
  if(path.startsWith('/art/'))return serveArt(request);
  if(path==='/health'&&request.method==='GET')return env.TABLES.get(env.TABLES.idFromName('system-health')).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'health'})});
  if(path!=='/interactions')return new Response('Not found',{status:404});
  if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
  if(Number(request.headers.get('Content-Length'))>65536)return new Response('Payload too large',{status:413});
  const body=await request.text();if(new TextEncoder().encode(body).length>65536)return new Response('Payload too large',{status:413});
  if(!await validSignature(request,body,env.DISCORD_PUBLIC_KEY))return new Response('Invalid signature',{status:401});
  let i;try{i=JSON.parse(body);}catch{return new Response('Invalid JSON',{status:400});}
  if(i?.type===1)return json({type:1});
  if(i?.application_id!==env.DISCORD_APPLICATION_ID)return new Response('Wrong application',{status:403});
  if(![2,3,5].includes(i.type)||!/^\d+$/.test(i.channel_id||'')||!/^\d+$/.test(i.guild_id||''))return json(privateReply('请在服务器文字频道内使用。'));
  const lobbyRoute=lobbyGameRequest(i);if(lobbyRoute?.error)return json(privateReply(lobbyRoute.error));if(lobbyRoute?.interaction)i=lobbyRoute.interaction;
  if(petInteraction(i)){if(i.member?.user?.bot)return json(privateReply('伙伴只向真人来客开放。'));const immediate=immediatePetReply(i);if(immediate)return json(immediate);ctx.waitUntil(finishPet(env,i).catch(error=>console.error('pet_panel_update_failed',{reason:error.message})));return json(petDeferredReply(i));}
  if(tavernInteraction(i)){if(i.member?.user?.bot)return json(privateReply('酒馆经营仅向真人玩家开放。'));const immediate=immediateTavernReply(i);if(immediate)return json(immediate);const deferred=tavernDeferredReply(i);ctx.waitUntil(finishTavern(env,i));return json(deferred);}
  if(specialInteraction(i)){if(!i.member?.user?.id)return json(privateReply('请在服务器内使用。'));ctx.waitUntil(finishSpecial(env,i));return json({type:5,data:{flags:64}});}
  if(profileInteraction(i)){if(!i.member?.user?.id)return json(privateReply('请在服务器内使用。'));ctx.waitUntil(finishProfile(env,i));const parts=(i.data?.custom_id||'').split(':');const updateOwn=i.type===3&&!!(Number(i.message?.flags)&64)&&parts.length===4&&parts[1]===i.guild_id&&parts[2]===i.member.user.id;return json(updateOwn?{type:6}:{type:5,data:{flags:64}});}
  if(liarRankingInteraction(i)){if(!i.member?.user?.id)return json(privateReply('请在服务器内使用。'));ctx.waitUntil(finishLiarRanking(env,i));return json({type:5,data:{flags:64}});}
  if(rankingInteraction(i)){if(!i.member?.user?.id)return json(privateReply('请在服务器内使用。'));ctx.waitUntil(finishRanking(env,i));return json({type:5,data:{flags:64}});}
  if(i.type===2&&i.data?.name==='ai')return json(await handleAiCommand(env,i));
  const stub=env.TABLES.get(env.TABLES.idFromName(`table:${i.guild_id}:${i.channel_id}`));
  const response=await stub.fetch('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:i})});
  const reply=await response.json();if(reply.bindEpoch){const epoch=reply.bindEpoch;delete reply.bindEpoch;ctx.waitUntil(bindOriginal(env,stub,i,epoch));}return json(reply);
}
export default {
  async fetch(request,env,ctx){let response;try{response=await handle(request,env,ctx);}catch{response=json(privateReply('服务暂时繁忙，请稍后重试。'));}
    const asset=[200,304].includes(response.status)&&new URL(request.url).pathname.startsWith('/art/')&&/^public,/.test(response.headers.get('Cache-Control')||'');
    const headers=new Headers(response.headers);for(const [key,value]of Object.entries({'Cache-Control':asset?response.headers.get('Cache-Control'):'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}))headers.set(key,value);
    return new Response(response.body,{status:response.status,headers});
  },
  async scheduled(event,env,ctx){ctx.waitUntil(env.TABLES.get(env.TABLES.idFromName('system-emojis')).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'appEmojis'})}));ctx.waitUntil(env.TABLES.get(env.TABLES.idFromName('system-registration')).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'register'})}));ctx.waitUntil(env.TABLES.get(env.TABLES.idFromName('system-discord-gateway')).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'gatewayEnsure'})}));}
};



