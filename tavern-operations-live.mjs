import {dayKey,validId} from './tavern-catalog.mjs';
import {tavernLobbyData,tavernSceneEmbed} from './tavern-lobby.mjs';

const STATE='tavernLobbyLive';
const tomorrow=now=>Math.floor((now+28800000)/86400000)*86400000+86400000-28800000;
const nextAmbience=now=>{const bj=now+28800000,d=new Date(bj),base=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-28800000;return [6,17,20].map(h=>base+h*3600000).filter(t=>t>now).sort((a,b)=>a-b)[0]||base+30*3600000;};
const lightKey=now=>{const hour=new Date(now+28800000).getUTCHours();return hour<6||hour>=20?'night':hour>=17?'dusk':'day';};
const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data))))).map(n=>n.toString(16).padStart(2,'0')).join('');

// One bounded list per guild. No interaction tokens, private pages or periodic polling.
export class TavernOperationsLive {
 constructor(host){this.host=host;this.storage=host.ctx.storage;this.env=host.env;}
 async data(guild,now=Date.now(),channel=null){
  const operations=this.host.tavern.operations.board(null,now),room=this.host.tavern.renovation.board();
  const map=this.host.tavern?.map?.board(now),live=map?{visitorCount:map.visitorCount,tableCount:map.tableCount}:null;
  const data=tavernLobbyData(room,guild,'any',operations,live);
  if(map)data._liveState={light:lightKey(now),visitors:map.visitors.map(v=>({id:v.id,name:v.name,kind:v.kind,location:v.location})),tables:map.tables.map(t=>({at:t.at,displaySlot:t.displaySlot,game:t.game,phase:t.phase,players:t.players.map(p=>({id:p.id,name:p.name,bot:p.bot}))})),room:{name:room.stage.name,level:room.stage.level,assets:room.assets.map(a=>({id:a.id||a.item?.id||a.item,level:a.level,name:a.name||a.levelName}))},operations:this.host.tavern.operations.scene(now)};
  return data;
 }
 async renderData(data,guild,now,channel){
  if(!channel||!this.host.tavernMapPresentation)return data;
  try{const image=await this.host.tavernMapPresentation.renderScene({id:guild,channel,passive:true},now);data._mapScene={filename:image.scene.filename,mime:image.scene.mime,bytes:Uint8Array.from(atob(image.scene.data),c=>c.charCodeAt(0))};}catch{}
  return data;
 }
 async arm(state,now=Date.now()){
  const ugcDue=Math.min(this.host.tavern?.ugc?.nextExpiry?.(now)||Infinity,await this.storage.get('redPacketRefundDue')||Infinity);
  if(!state?.boards?.length){if(Number.isFinite(ugcDue))await this.storage.setAlarm(Math.max(now+1,ugcDue));else await this.storage.deleteAlarm();return;}
  const due=Math.min(tomorrow(now),nextAmbience(now),state.due||Infinity,state.expiryDue||Infinity,ugcDue);
  await this.storage.setAlarm(Math.max(now+1,due));
 }
 async track(p,now=Date.now()){
  const guild=await this.storage.get('tavernGuild');
  if(guild!==p.guild||!validId(p.channel)||!validId(p.message))throw Error('大厅消息无效。');
  const state=await this.storage.get(STATE)||{boards:[],day:dayKey(now)};
  const data=await this.data(guild,now,p.channel),signature=await digest(data);
  const other=state.boards.filter(x=>x.channel!==p.channel);
  state.boards=[{channel:p.channel,message:p.message,signature},...other].slice(0,5);
  state.target=signature;
  state.expiryDue=await this.nextExpiry(now);
  state.ambienceDue=nextAmbience(now);
  await this.storage.put(STATE,state);await this.arm(state,now);return {tracked:true};
 }
 async untrack(p,now=Date.now()){
  const state=await this.storage.get(STATE);if(!state)return {tracked:false};
  state.boards=state.boards.filter(b=>b.channel!==p.channel||b.message!==p.message);
  await this.storage.put(STATE,state);await this.arm(state,now);return {tracked:false};
 }
 async changed(now=Date.now()){
  const state=await this.storage.get(STATE);if(!state?.boards?.length)return;
  const guild=await this.storage.get('tavernGuild');
  const signature=await digest(await this.data(guild,now,state.boards[0].channel));
  state.expiryDue=await this.nextExpiry(now);
  if(signature===state.target){await this.storage.put(STATE,state);await this.arm(state,now);return;}
  state.target=signature;state.due=state.due||now+2000;state.retries=0;
  await this.storage.put(STATE,state);await this.arm(state,now);
 }
 async flush(now=Date.now()){
  // Serialize storage snapshots, but allow interactions while Discord is in flight.
  const snapshot=await this.host.ctx.blockConcurrencyWhile(async()=>{
   const state=await this.storage.get(STATE);
   if(!state?.boards?.length){await this.arm(state,now);return null;}
   if(state.day===dayKey(now)&&(!state.due||state.due>now)&&(!state.expiryDue||state.expiryDue>now)&&(!state.ambienceDue||state.ambienceDue>now)){await this.arm(state,now);return null;}
   const guild=await this.storage.get('tavernGuild'),data=await this.data(guild,now,state.boards[0].channel),signature=await digest(data);
   state.day=dayKey(now);state.target=signature;state.retries=(state.retries||0)+1;
   state.due=state.retries<=3?now+10000*2**(state.retries-1):null;
   state.expiryDue=await this.nextExpiry(now);
   state.ambienceDue=nextAmbience(now);
   await this.storage.put(STATE,state);await this.arm(state,now);
   return {state,guild,data,signature};
  });
  if(!snapshot)return;
  const {state,guild,data,signature}=snapshot,results=new Map();let retryMs=10000;
  const payload=await this.renderData(data,guild,now,state.boards[0]?.channel);
  for(const b of state.boards){
   if(b.signature===signature)continue;
   let status='failed';
   try{
    const body=this.discordBody(payload),multipart=body instanceof FormData;
    const r=await fetch(`https://discord.com/api/v10/channels/${b.channel}/messages/${b.message}`,{method:'PATCH',headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`,...(multipart?{}:{'Content-Type':'application/json'})},body:multipart?body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
    if(r.ok)status='ok';
    else if([403,404].includes(r.status))status='gone';
    else if(r.status===429){const body=await r.json().catch(()=>({}));retryMs=Math.max(retryMs,Math.min(900000,(Number(body.retry_after)||10)*1000));}
   }catch{}
   results.set(`${b.channel}:${b.message}`,status);
  }
  await this.host.ctx.blockConcurrencyWhile(async()=>{
   const latest=await this.storage.get(STATE);if(!latest)return;
   latest.boards=latest.boards.filter(b=>results.get(`${b.channel}:${b.message}`)!=='gone');
   for(const b of latest.boards)if(results.get(`${b.channel}:${b.message}`)==='ok')b.signature=signature;
   const freshData=await this.data(guild,now,latest.boards[0]?.channel),fresh=await digest(freshData);latest.target=fresh;latest.expiryDue=await this.nextExpiry(now);
   const stale=latest.boards.some(b=>b.signature!==fresh);
   if(!stale){latest.due=null;latest.retries=0;}
   else if(fresh!==signature){latest.due=now+2000;latest.retries=0;}
   else if(latest.retries<=3)latest.due=now+Math.max(retryMs,10000*2**(latest.retries-1));
   await this.storage.put(STATE,latest);await this.arm(latest,now);
  });
 }
 async nextExpiry(now=Date.now()){
  return this.host.tavern?.map?.nextExpiry(now)||null;
 }
 discordBody(data){
  const body={...data};delete body._mapScene;delete body._mapEmbed;delete body._liveState;body.embeds=[];body.attachments=[];
  const scene=data._mapScene;if(!scene){if(data._mapEmbed)body.embeds=[tavernSceneEmbed(data._mapEmbed)];return body;}
  const filename=scene.filename||'tavern-scene.png',bytes=scene.bytes instanceof Uint8Array?scene.bytes:new Uint8Array(scene.bytes||[]);
  body.embeds=[tavernSceneEmbed(data._mapEmbed,filename)];body.attachments=[{id:0,filename,description:'红豆粉小酒馆实时地图，按最近来客与公开牌桌生成'}];
  const form=new FormData();form.set('payload_json',JSON.stringify(body));form.set('files[0]',new Blob([bytes],{type:scene.mime||'image/png'}),filename);return form;
 }
}
