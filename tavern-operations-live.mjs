import {dayKey,validId} from './tavern-catalog.mjs';
import {tavernLobbyData} from './tavern-lobby.mjs';

const STATE='tavernLobbyLive';
const tomorrow=now=>Math.floor((now+28800000)/86400000)*86400000+86400000-28800000;
const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data))))).map(n=>n.toString(16).padStart(2,'0')).join('');

// One bounded list per guild. No interaction tokens, private pages or periodic polling.
export class TavernOperationsLive {
 constructor(host){this.host=host;this.storage=host.ctx.storage;this.env=host.env;}
 data(guild,now=Date.now()){
  return tavernLobbyData(this.host.tavern.renovation.board(),guild,'any',this.host.tavern.operations.board(null,now));
 }
 async arm(state,now=Date.now()){
  if(!state?.boards?.length){await this.storage.deleteAlarm();return;}
  const due=Math.min(tomorrow(now),state.due||Infinity);
  await this.storage.setAlarm(Math.max(now+1,due));
 }
 async track(p,now=Date.now()){
  const guild=await this.storage.get('tavernGuild');
  if(guild!==p.guild||!validId(p.channel)||!validId(p.message))throw Error('大厅消息无效。');
  const state=await this.storage.get(STATE)||{boards:[],day:dayKey(now)};
  const signature=await digest(this.data(guild,now));
  const other=state.boards.filter(x=>x.channel!==p.channel);
  state.boards=[{channel:p.channel,message:p.message,signature},...other].slice(0,5);
  state.target=signature;
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
  const signature=await digest(this.data(guild,now));
  if(signature===state.target)return;
  state.target=signature;state.due=state.due||now+2000;state.retries=0;
  await this.storage.put(STATE,state);await this.arm(state,now);
 }
 async flush(now=Date.now()){
  // Serialize storage snapshots, but allow interactions while Discord is in flight.
  const snapshot=await this.host.ctx.blockConcurrencyWhile(async()=>{
   const state=await this.storage.get(STATE);
   if(!state?.boards?.length){await this.arm(state,now);return null;}
   if(state.day===dayKey(now)&&(!state.due||state.due>now)){await this.arm(state,now);return null;}
   const guild=await this.storage.get('tavernGuild'),data=this.data(guild,now),signature=await digest(data);
   state.day=dayKey(now);state.target=signature;state.retries=(state.retries||0)+1;
   state.due=state.retries<=3?now+10000*2**(state.retries-1):null;
   await this.storage.put(STATE,state);await this.arm(state,now);
   return {state,guild,data,signature};
  });
  if(!snapshot)return;
  const {state,guild,data,signature}=snapshot,results=new Map();let retryMs=10000;
  for(const b of state.boards){
   if(b.signature===signature)continue;
   let status='failed';
   try{
    const r=await fetch(`https://discord.com/api/v10/channels/${b.channel}/messages/${b.message}`,{method:'PATCH',headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({...data,embeds:[],attachments:[]}),signal:AbortSignal.timeout(5000)});
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
   const fresh=await digest(this.data(guild,now));latest.target=fresh;
   const stale=latest.boards.some(b=>b.signature!==fresh);
   if(!stale){latest.due=null;latest.retries=0;}
   else if(fresh!==signature){latest.due=now+2000;latest.retries=0;}
   else if(latest.retries<=3)latest.due=now+Math.max(retryMs,10000*2**(latest.retries-1));
   await this.storage.put(STATE,latest);await this.arm(latest,now);
  });
 }
}
