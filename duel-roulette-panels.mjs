// Automatic duel round delivery. Credentials use PrivatePanels' encrypted store.
// SPDX-License-Identifier: AGPL-3.0-only
import {panel} from './duel-roulette-ui.mjs';
const TTL=14*60*1000;
const roundKey=t=>t.phase==='active'?`round:${t.round}`:`end:${t.lastRound?.round||t.round||0}`;
export class DuelPanels {
 constructor(parent){this.parent=parent;this.storage=parent.storage;this.env=parent.env;}
 async remember(t,i,reply){
  const id=i.member?.user?.id;
  if(!i.token||!this.env.BOT_TOKEN||!id||!t.players.some(p=>p.id===id)||reply.type===9||i.type===5)return false;
  const records=await this.parent.read();let s=records[id];
  if(!s||s.epoch!==t.epoch)s=records[id]={epoch:t.epoch,retire:s?.panel?[s.panel]:[]};
  s.send={token:i.token,expires:Date.now()+TTL,owner:id,private:true};
  const own=String(i.data?.custom_id||'').split(':')[3]?.startsWith(`p~${id}~`);
  const privateReply=reply.type===4&&(reply.data?.flags&64)||reply.type===7&&(Number(i.message?.flags)&64);
  const controls=reply.data?.components?.flatMap(r=>r.components||[])||[];
  if(privateReply&&(own||controls.some(c=>c.custom_id?.includes(`:p~${id}~`)))){
   s.panel={...s.send,ref:'@original',id:reply.type===7?i.message?.id:null,version:t.version};
   // A choice acknowledgement belongs to the previous round, even when it resolves it.
   if(!own||!String(i.data.custom_id).includes('~choose~'))s.delivered=roundKey(t);
  }
  await this.parent.write(records);return true;
 }
 async publicResult(t){
  if(!t.lastRound||!this.env.BOT_TOKEN)return false;
  let retry=false;
  for(const result of t.roundResults||[t.lastRound])retry=await this.publishRound(t,result)||retry;
  return retry;
 }
 async publishRound(t,result){
  const key=`${t.epoch}:${result.round}`,records=await this.storage.get('duelRoundNotices')||{};
  let job=records[key];
  if(job?.key===key&&(job.sent||job.attempts>=3))return false;
  if(job?.retryAt>Date.now())return true;
  job=job?.key===key?job:{key,attempts:0};job.attempts++;
  records[key]=job;await this.storage.put('duelRoundNotices',Object.fromEntries(Object.entries(records).slice(-14)));
  const end=t.phase!=='active'&&result.round===t.lastRound.round?`\n${t.winner?'🏆 '+t.players.find(p=>p.id===t.winner)?.name+' 获胜。':'本场已结束。'}`:'';
  const link=t.messageId?`\n[查看对局与裁决](https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId})`:'';
  try{
   const r=await fetch(`https://discord.com/api/v10/channels/${t.channel}/messages`,{method:'POST',headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({content:`⚔️ 死斗 · 第 ${result.round} 轮结果\n${result.summary}${end}${link}`,nonce:key,enforce_nonce:true,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(2000)});
   if(r.ok)job.sent=true;else if([400,401,403,404].includes(r.status))job.attempts=3;
   else if(r.status===429){try{job.retryAt=Date.now()+Math.max(3000,Number((await r.json()).retry_after||3)*1000);}catch{}}
  }catch{}
  await this.storage.put('duelRoundNotices',Object.fromEntries(Object.entries(records).slice(-14)));return !job.sent&&job.attempts<3;
 }
 async sync(t){
  let retry=await this.publicResult(t);const records=await this.parent.read();
  for(const [id,s] of Object.entries(records)){
   if(s.epoch!==t.epoch||!t.players.some(p=>p.id===id))continue;
   if(t.phase==='lobby')continue;
   const key=roundKey(t),notice=t.lastRound?`上一轮结果：${t.lastRound.summary}`:'';
   if(s.delivered!==key&&s.send?.expires>Date.now()&&s.attempted!==key){
    // POST timeouts are ambiguous: record before sending and never duplicate that round.
    s.attempted=key;await this.parent.write(records);
    const sent=await this.parent.api(s.send,'POST',panel(t,id,notice));
    if(sent?.id){
     if(s.panel)s.retire.push(s.panel);
     s.panel={...s.send,ref:sent.id,id:sent.id,version:t.version};s.delivered=key;s.failures=0;
    }
   }else if(s.delivered===key&&s.panel?.expires>Date.now()&&s.panel.version!==t.version){
    const data=panel(t,id,notice);delete data.flags;
    if(await this.parent.api(s.panel,'PATCH',data,s.panel.ref)){s.panel.version=t.version;s.failures=0;}else {s.failures=(s.failures||0)+1;if(s.failures<3)retry=true;}
   }
   const pending=[];
   for(const old of s.retire||[]){if(old.expires>Date.now()&&!await this.parent.api(old,'PATCH',{content:'本轮已结束，请使用最新出拳面板。',embeds:[],components:[],attachments:[],allowed_mentions:{parse:[]}},old.ref))pending.push(old);}
   s.retire=pending.slice(-5);if(pending.length)retry=true;
  }
  await this.parent.write(records);return retry;
 }
 async prune(t){await this.parent.write(await this.parent.read());}
}
