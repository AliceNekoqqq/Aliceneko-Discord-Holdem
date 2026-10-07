import { DurableObject } from 'cloudflare:workers';
import * as game from './engine.mjs';
import { computerTurn } from './computer.mjs';
import { board, quickRaises, confirmation, handPanel, panelAction, button, row } from './ui.mjs';
const COMMAND_VERSION='holdem-v1.0.1-beta.1'; // Command schema unchanged in beta.2
const json = (body,status=200)=>Response.json(body,{status});
const privateReply = content=>({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
const help='**Aliceneko 德州扑克 · 虚拟筹码休闲版**\n使用 `/德州 创建` 开桌，点「加入」入座；独自测试用 `/德州 测试`。桌主点「开始下一手」。\n入桌 2000 筹码，小盲 10 / 大盲 20；2～9 人；每次行动 60 秒。\n「我的手牌」仅自己可见。加注填的是**本轮总下注**，支持最小、半池、满池快捷档位。全下与关桌需要确认。\n超时能过牌则过牌，否则弃牌；全下自动处理边池和平局分池。\n筹码归零后可在手牌结束时免费补充；离桌清空该桌筹码。\n桌主可添加/移除电脑陪练，电脑只看自己的底牌和公共牌，自动行动。\n桌主或管理员可关闭牌桌，未完成手牌下注退回。只供娱乐，无充值或兑换。';
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
  async save(t){
    t.computerDue=t.players.some(p=>p.id===t.turn&&p.bot)?Date.now()+1500:null;
    await this.ctx.storage.transaction(async txn=>{await txn.put('table',t);if(t.computerDue||t.deadline)await txn.setAlarm(t.computerDue||t.deadline);else await txn.deleteAlarm();});
  }
  async syncBoard(t){if(t.messageId&&this.env.BOT_TOKEN){try{const r=await discordApi(this.env,`/channels/${t.channel}/messages/${t.messageId}`,'PATCH',board(t),2000);return r.ok;}catch{return false;}}return false;}
  async fetch(request){
    return this.ctx.blockConcurrencyWhile(async()=>{
      const payload=await request.json();
      if(payload.op==='health'){this.ctx.storage.sql.exec('SELECT 1 AS ok').one();return json({ok:true});}
      if(payload.op==='register'){
        if(!this.env.BOT_TOKEN)return json({registered:false});
        if(await this.ctx.storage.get('commandVersion')===COMMAND_VERSION)return json({registered:true});
        try{const r=await discordApi(this.env,`/applications/${this.env.DISCORD_APPLICATION_ID}/commands`,'POST',command);if(r.ok)await this.ctx.storage.put('commandVersion',COMMAND_VERSION);return json({registered:r.ok});}catch{return json({registered:false});}
      }
      let t=await this.ctx.storage.get('table');
      if(payload.op==='bind'){if(t&&t.epoch===payload.epoch&&!t.messageId&&/^\d+$/.test(payload.messageId)){t.messageId=payload.messageId;await this.save(t);this.ctx.waitUntil(this.syncBoard(t));}return json({ok:true});}
      if(payload.op!=='interaction')return new Response('Not found',{status:404});
      const i=payload.interaction,id=i.member?.user?.id;
      if(!id||!i.guild_id)return json(privateReply('请在服务器文字频道内使用。'));
      if(t&&(t.channel!==i.channel_id||t.guild!==i.guild_id))return json(privateReply('频道不匹配。'));
      const admin=(BigInt(i.member?.permissions||'0')&40n)!==0n;
      if(i.type===2){
        if(i.data?.name!=='德州')return json(privateReply('未知指令。'));
        const sub=i.data.options?.[0]?.name;
        if(sub==='帮助')return json(privateReply(help));
        if(sub==='牌桌'){if(t?.messageId)this.ctx.waitUntil(this.syncBoard(t));return json(privateReply(t&&t.phase!=='closed'?(t.messageId?`牌桌：https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId}`:'牌桌正在创建，请稍后再试。'):'当前频道没有牌桌，使用 `/德州 创建`。'));}
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
      const panelMatch=parts[3].match(/^p~(\d+)~(.+)$/);
      const isPanel=!!panelMatch,privateMessage=!!(Number(i.message?.flags)&64);
      if(isPanel&&i.type===5&&panelMatch[2]!=='submit')return json(privateReply('无效的面板表单。'));
      if(isPanel&&(panelMatch[1]!==id||(i.type===3&&!privateMessage)))return json(privateReply('请重新点击公共牌桌上的「手牌 / 操作」。'));
      let action=isPanel?panelMatch[2]:parts[3];
      if(isPanel&&action==='yesallin')action=`yesallin~${id}`;
      const panelReply=(notice='')=>({type:privateMessage?7:4,data:{...handPanel(t,id,notice),...(privateMessage?{}:{flags:64})}});
      if(isPanel&&!t.players.some(p=>p.id===id&&!p.bot))return json(privateReply('你已离开这张牌桌。'));
      if(isPanel&&action==='hide')return json({type:7,data:{content:'底牌已收起。',embeds:[],components:[row(button(t,panelAction(id,'hand'),'展开手牌',1))]}});

      const confirmAction=action.match(/^(yesallin|yesclose)~(\d+)$/);
      if(action==='cancel')return json(isPanel?panelReply('已取消，尚未全下。'):{type:7,data:{content:'已取消。',embeds:[],components:[]}});
      if(confirmAction&&confirmAction[2]!==id)return json(privateReply('这不是你的确认按钮。'));
      if(action==='refresh')return json({type:7,data:board(t)});
      if(action==='help')return json(privateReply(help));
      if(action==='hand'){
        if(!t.players.some(p=>p.id===id&&!p.bot))return json(privateReply('你没有加入这张牌桌。'));
        return json(isPanel?panelReply():{type:4,data:{...handPanel(t,id),flags:64}});
      }
      if(!isPanel&&!confirmAction&&t.messageId&&i.message?.id&&i.message.id!==t.messageId)return json(privateReply('请使用原牌桌消息的按钮。'));
      if(Number(parts[2])!==t.version&&confirmAction?.[1]!=='yesclose'){if(isPanel)return json(panelReply('牌局已更新，刚才的操作未执行。请按最新金额选择。'));if(confirmAction){this.ctx.waitUntil(this.syncBoard(t));return json({type:7,data:{content:'牌局已变化，未执行操作。请回牌桌重新选择。',components:[],embeds:[]}});}return json({type:7,data:{...board(t),content:'牌桌刚刚更新，请按最新金额重新选择操作。'}});}
      // Process expired turns before accepting a player's late action.
      if(t.deadline&&Date.now()>=t.deadline&&confirmAction?.[1]!=='yesclose'){game.timeout(t);t.version++;await this.save(t);if(isPanel){this.ctx.waitUntil(this.syncBoard(t));return json(panelReply('回合已超时，已自动处理。'));}if(confirmAction){this.ctx.waitUntil(this.syncBoard(t));return json({type:7,data:{content:'回合已超时，未执行确认操作。',components:[],embeds:[]}});}return json({type:7,data:board(t)});}
      const seen=await this.ctx.storage.get('recentInteractions')||[];if(seen.includes(i.id))return json(privateReply('这次操作已经处理。'));
      try{
        if(action==='allin'){const l=game.legal(t,id);if(!l.canRaise&&l.maxTotal>t.currentBet)throw Error('本轮未重新开放加注权，只能跟注或弃牌。');const prompt=confirmation(t,id,'allin',`确认投入剩余 **${l.p.stack}** 筹码全下？本轮总下注将为 **${l.maxTotal}**。`);if(isPanel){const data=handPanel(t,id,prompt.data.content);data.components=[row(button(t,panelAction(id,'yesallin'),'确认全下',4),button(t,panelAction(id,'cancel'),'返回手牌'))];return json({type:7,data});}return json(prompt);}
        if(action==='close'){if(id!==t.owner&&!admin)throw Error('只有桌主或管理员可以关闭牌桌。');return json(confirmation(t,id,'close','确认关闭整张牌桌？未完成手牌的下注会退回。'));}
        if(action==='raise'&&i.type===3){
          const limits=game.legal(t,id);if(!limits.canRaise)throw Error('本轮尚未重新开放你的加注权。');
          return json({type:9,data:{custom_id:`h:${t.epoch}:${t.version}:${isPanel?panelAction(id,'submit'):'submit'}`,title:t.currentBet?'加注 · 本轮总下注':'下注 · 本轮总下注',components:[{type:1,components:[{type:4,custom_id:'amount',label:limits.maxTotal<limits.minTotal?`仅可全下：${limits.maxTotal}`:`本轮总额 ${limits.minTotal}～${limits.maxTotal}`,style:1,required:true,min_length:1,max_length:8,value:String(Math.min(limits.minTotal,limits.maxTotal)),placeholder:`已下 ${limits.p.round}，填本轮总额`}]}]}});
        }
        if(action==='join')game.join(t,id);
        else if(action==='leave')game.leave(t,id);
        else if(action==='rebuy')game.rebuy(t,id);
        else if(action==='addbot')game.addComputers(t,id);
        else if(action==='removebots')game.removeComputers(t,id);
        else if(action==='start'){if(id!==t.owner)throw Error('只有桌主可以开始下一手。');if(['lobby','settled'].includes(t.phase))for(const p of t.players)if(p.bot&&p.stack===0)game.rebuy(t,p.id);game.start(t,id);}
        else if(confirmAction?.[1]==='yesclose')game.close(t,id,admin);
        else if(confirmAction?.[1]==='yesallin')game.act(t,id,'allin');
        else if(action.startsWith('quick')){const target=quickRaises(t,id).find(b=>b.action===action)?.target;if(!target)throw Error('当前无法使用这档快捷加注。');game.act(t,id,'raise',target);}
        else if(action==='submit'&&i.type===5){const value=i.data.components?.flatMap(r=>r.components||[]).find(c=>c.custom_id==='amount')?.value?.trim();if(!/^\d{1,8}$/.test(value||''))throw Error('请输入正整数。');game.act(t,id,'raise',Number(value));}
        else if(['fold','check','call','allin'].includes(action)&&i.type===3)game.act(t,id,action);
        else throw Error('未知操作。');
      }catch(error){return json(isPanel?panelReply(error.message):privateReply(error.message));}
      t.version++;t.lastActive=Date.now();if(!isPanel&&!confirmAction&&!t.messageId&&i.message?.id)t.messageId=i.message.id;
      await this.save(t);await this.ctx.storage.put('recentInteractions',[...seen.slice(-99),i.id]);
      if(isPanel){this.ctx.waitUntil(this.syncBoard(t));return json(panelReply('操作已执行。'));}
      if(confirmAction){this.ctx.waitUntil(this.syncBoard(t));return json({type:7,data:{content:confirmAction[1]==='yesclose'?'牌桌已关闭。':'已全下，请回牌桌查看。',components:[],embeds:[]}});}
      return json({type:7,data:board(t)});
    });
  }
  async alarm(){
    await this.ctx.blockConcurrencyWhile(async()=>{const t=await this.ctx.storage.get('table');if(!t||!t.deadline)return;
      if(t.computerDue){if(Date.now()<t.computerDue){await this.ctx.storage.setAlarm(t.computerDue);return;}if(computerTurn(t)){t.version++;await this.save(t);await this.syncBoard(t);return;}}
      if(Date.now()<t.deadline){await this.ctx.storage.setAlarm(t.deadline);return;}
      if(game.timeout(t)){t.version++;await this.save(t);await this.syncBoard(t);}
    });
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
  const stub=env.TABLES.get(env.TABLES.idFromName(`table:${i.guild_id}:${i.channel_id}`));
  const response=await stub.fetch('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:i})});
  const reply=await response.json();if(reply.bindEpoch){const epoch=reply.bindEpoch;delete reply.bindEpoch;ctx.waitUntil(bindOriginal(env,stub,i,epoch));}return json(reply);
}
export default {
  async fetch(request,env,ctx){let response;try{response=await handle(request,env,ctx);}catch{response=json(privateReply('服务暂时繁忙，请稍后重试。'));}
    const headers=new Headers(response.headers);for(const [key,value]of Object.entries({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}))headers.set(key,value);
    return new Response(response.body,{status:response.status,headers});
  },
  async scheduled(event,env,ctx){ctx.waitUntil(env.TABLES.get(env.TABLES.idFromName('system-registration')).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'register'})}));}
};
