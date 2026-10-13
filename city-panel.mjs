import {FLOWER_COPY,FLOWER_PLACE_DESCRIPTION} from './flower-copy.mjs';
const asset='https://discord-holdem.aliceneko.workers.dev/art/flowers/shop-background.jpg';
export function flowerPublicPanel(guild,p){return {content:'',allowed_mentions:{parse:[]},embeds:[{title:`🌷 ${p.street} · ${p.name}`,description:`${p.description||FLOWER_PLACE_DESCRIPTION}\n\n**沈清禾**\n${FLOWER_COPY.npc.welcome}\n\n${p.open===false?'休息中 · 暂停购买':'营业中 · 点击下方查看花束'}`,color:0x849b79,image:{url:asset}}],components:[{type:1,components:[{type:2,custom_id:`fp:${guild}:${p.channelId}:menu`,label:'查看花束',style:1,disabled:p.open===false},{type:2,custom_id:`fp:${guild}:${p.channelId}:gifts`,label:'我的礼物',style:2}]}]};}
// One publisher per city object serializes concurrent refreshes; nonce covers uncertain POSTs.
export class CityPanel {
 constructor(storage,service,env,fetcher=fetch){this.storage=storage;this.service=service;this.env=env;this.fetcher=fetcher;this.pending=Promise.resolve();}
 publish(q){const task=this.pending.then(()=>this.upsert(q));this.pending=task.catch(()=>{});return task;}
 async request(path,method,body){return this.fetcher(`https://discord.com/api/v10${path}`,{method,headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});}
 async upsert({guild,channel,create=true}){
  const p=(await this.service.config()).places[channel],key=`city:panel:${channel}`,record=await this.storage.get(key);
  if(!p||p.kind!=='flower'){
   if(record){const r=await this.request(`/channels/${channel}/messages/${record.messageId}`,'PATCH',{content:'此处的花店面板已停用。',embeds:[],components:[],allowed_mentions:{parse:[]}});if(!r.ok&&r.status!==404)throw Error('无法停用原花店面板，请检查频道权限。');await this.storage.delete(key);}
   if(create)throw Error('请先在花店主频道绑定类型「花店」。');return null;
  }
  const body=flowerPublicPanel(guild,p);let r;
  if(record){r=await this.request(`/channels/${channel}/messages/${record.messageId}`,'PATCH',body);if(r.ok)return {messageId:record.messageId,updated:true};if(r.status!==404)throw Error('无法更新常驻面板，请检查机器人频道权限。');}
  if(!create)return null;
  r=await this.request(`/channels/${channel}/messages`,'POST',{...body,nonce:`fp${channel}`,enforce_nonce:true});
  if(!r.ok)throw Error('无法发布常驻面板，请给机器人查看频道、发送消息和嵌入链接权限。');
  const m=await r.json();if(!/^\d{1,20}$/.test(m.id||''))throw Error('面板发送结果未知，请稍后再次使用 /城市 面板 核验。');
  await this.storage.put(key,{messageId:m.id});return {messageId:m.id,updated:false};
 }
}
