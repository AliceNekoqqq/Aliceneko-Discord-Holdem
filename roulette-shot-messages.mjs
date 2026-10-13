// Public, temporary shot receipts. No shell intelligence or credentials are stored.
// SPDX-License-Identifier: AGPL-3.0-only
import {label} from './duel-roulette-model.mjs';
const valid=id=>/^\d{1,20}$/.test(id||'');
export class RouletteShotMessages {
 constructor(storage,env){this.storage=storage;this.env=env;}
 async request(job,method){
  try{
   const r=await fetch(`https://discord.com/api/v10/channels/${job.channel}/messages${method==='DELETE'?'/'+job.messageId:''}`,{method,headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(job.body)}:{}),signal:AbortSignal.timeout(2000)});
   let data;try{if(r.status!==204)data=await r.json();}catch{}
   return {ok:r.ok,status:r.status,data,retry:Math.max(3000,Number(data?.retry_after||3)*1000)};
  }catch{return {ok:false,status:0,retry:3000};}
 }
 receipt(t,event){
  const actor=label(t.players.find(p=>p.id===event.actor)),target=label(t.players.find(p=>p.id===event.target));
  return {content:'',embeds:[{title:event.automatic?'⏱️ 超时自动开枪':'🔫 开枪结果',description:`**${actor}** → **${target}**\n${event.hit?'💥 **实弹命中**':'💨 **空弹**'}`,color:event.hit?0xc45c58:0x6b8399,fields:[{name:'伤害',value:`${event.damage} 点`,inline:true},{name:`${target} · 剩余生命`,value:`${event.hp}/4`,inline:true}],footer:{text:'回合切换后自动清理'}}],components:[],allowed_mentions:{parse:[]},nonce:`${t.epoch}s${event.id}`,enforce_nonce:true};
 }
 async save(jobs){await this.storage.put('rouletteShotMessages',jobs);}
 async sync(t){
  if(!this.env.BOT_TOKEN)return false;
  const jobs=await this.storage.get('rouletteShotMessages')||{},now=Date.now();let retry=false;
  for(const event of t.game==='devil_roulette'?t.shotEvents||[]:[]){
   if(event.turn!==(t.panelTurn||0))continue;
   const key=`${t.epoch}:${event.id}`;
   if(!jobs[key])jobs[key]={epoch:t.epoch,turn:event.turn,channel:t.channel,body:this.receipt(t,event),createdAt:now,attempts:0,deleteAttempts:0};
  }
  for(const [key,job] of Object.entries(jobs)){
   const stale=t.game!=='devil_roulette'||job.epoch!==t.epoch||job.turn!==(t.panelTurn||0);
   if(job.retryAt>now){retry=true;continue;}
   // An uncertain POST is retried with the same enforce_nonce, including when
   // cleanup must first recover its message ID. Never revive very old unknown sends.
   if(!job.messageId){
    if(job.attempts>=3||stale&&now-job.createdAt>120000){job.failed=true;continue;}
    job.attempts++;await this.save(jobs);const r=await this.request(job,'POST');
    if(r.ok&&valid(r.data?.id)){job.messageId=r.data.id;delete job.retryAt;}
    else {if([400,401,403,404].includes(r.status))job.attempts=3;job.retryAt=Date.now()+r.retry;if(job.attempts<3)retry=true;continue;}
   }
   if(stale&&job.messageId&&!job.deleted&&job.deleteAttempts<3){
    job.deleteAttempts++;await this.save(jobs);const r=await this.request(job,'DELETE');
    if(r.ok||r.status===404){job.deleted=true;delete job.retryAt;}
    else {if([400,401,403].includes(r.status))job.deleteAttempts=3;job.retryAt=Date.now()+r.retry;if(job.deleteAttempts<3)retry=true;}
   }
  }
  // Tombstones prevent old persisted events from reposting. Keep recent receipts
  // plus every outstanding known message until its bounded cleanup completes.
  const entries=Object.entries(jobs),done=entries.filter(([,j])=>j.deleted||j.failed||j.attempts>=3&&!j.messageId);
  const keep=new Set(done.slice(-32).map(([k])=>k));
  await this.save(Object.fromEntries(entries.filter(([k,j])=>keep.has(k)||!done.some(([d])=>d===k))));return retry;
 }
}
