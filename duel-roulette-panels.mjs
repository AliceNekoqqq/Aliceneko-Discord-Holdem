// Automatic duel/roulette delivery. Credentials use PrivatePanels' encrypted store.
// SPDX-License-Identifier: AGPL-3.0-only
import {panel} from './duel-roulette-ui.mjs';
import {RouletteShotMessages} from './roulette-shot-messages.mjs';
const TTL=14*60*1000;
const roundKey=(t,id,s)=>t.phase!=='active'?`end:${t.lastRound?.round||t.round||0}`:t.game==='duel'?`round:${t.round}`:id===t.turn?`turn:${t.panelTurn||0}`:s?.panel&&s.delivered?s.delivered:'watch';
export class DuelPanels {
 constructor(parent){this.parent=parent;this.storage=parent.storage;this.env=parent.env;}
 get shots(){return this.shotMessages??=new RouletteShotMessages(this.storage,this.env);}
 async remember(t,i,reply){
  const id=i.member?.user?.id;
  if(!i.token||!this.env.BOT_TOKEN||!id||!t.players.some(p=>p.id===id)||reply.type===9||i.type===5)return false;
  const records=await this.parent.read();let s=records[id];
  if(!s||s.epoch!==t.epoch)s=records[id]={epoch:t.epoch,retire:s?.panel?[s.panel]:[]};
  if(!s.panel||s.panel.expires<=Date.now()){delete s.panel;delete s.delivered;delete s.attempted;}
  s.send={token:i.token,expires:Date.now()+TTL,owner:id,private:true};
  const own=String(i.data?.custom_id||'').split(':')[3]?.startsWith(`p~${id}~`);
  const action=String(i.data?.custom_id||'').split(':')[3]?.split('~').slice(2).join('~');
  if(own&&action==='details')s.view='details';else if(own)s.view='panel';
  const privateReply=reply.type===4&&(reply.data?.flags&64)||reply.type===7&&(Number(i.message?.flags)&64);
  const controls=reply.data?.components?.flatMap(r=>r.components||[])||[];
  if(privateReply&&(own||controls.some(c=>c.custom_id?.includes(`:p~${id}~`)))){
   s.panel={...s.send,ref:'@original',id:reply.type===7?i.message?.id:null,version:t.version};
   // A choice acknowledgement belongs to the previous round, even when it resolves it.
   if(t.game==='duel'?(!own||!String(i.data.custom_id).includes('~choose~')):(!own||String(i.data.custom_id).endsWith('~panel')))s.delivered=roundKey(t,id,s);
  }
  await this.parent.write(records);return true;
 }
 async publicResult(t){
  if(!this.env.BOT_TOKEN)return false;
  let retry=await this.cleanupRounds(t);
  if(t.game==='devil_roulette'){
   if(!t.winner||!['settled','closed'].includes(t.phase))return retry;
   return await this.publishRound(t,{round:'end',summary:t.log.slice(-3).join('\n')})||retry;
  }
  if(!t.lastRound)return retry;
  for(const result of t.roundResults||[t.lastRound])retry=await this.publishRound(t,result)||retry;
  return retry;
 }
 async publishRound(t,result){
  const key=`${t.epoch}:${result.round}`,records=await this.storage.get('duelRoundNotices')||{};
  let job=records[key];
  if(job?.key===key&&(job.sent||job.attempts>=3))return !!(job.messageId&&!job.deleted&&(job.deleteAttempts||0)<3);
  if(job?.retryAt>Date.now())return true;
  job=job?.key===key?job:{key,attempts:0};job.attempts++;
  records[key]=job;await this.storage.put('duelRoundNotices',Object.fromEntries(Object.entries(records).slice(-14)));
  const end=t.phase!=='active'&&(t.game==='devil_roulette'||result.round===t.lastRound.round)?`\n${t.winner?'🏆 '+t.players.find(p=>p.id===t.winner)?.name+' 获胜。':'本场已结束。'}`:'';
  const link=t.messageId?`\n[查看对局与裁决](https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId})`:'';
  try{
   const title=t.game==='devil_roulette'?'🔫 恶魔轮盘 · 对局结果':`⚔️ 死斗 · 第 ${result.round} 轮结果`;
   const r=await fetch(`https://discord.com/api/v10/channels/${t.channel}/messages`,{method:'POST',headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({content:`${title}\n${result.summary}${end}${link}`,nonce:key,enforce_nonce:true,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(2000)});
   if(r.ok){
    if(t.game==='duel'){
     const data=await r.json();if(!/^\d{1,20}$/.test(data?.id||''))throw Error('Missing result message ID');
     Object.assign(job,{messageId:data.id,channel:t.channel,expiresAt:Date.now()+10000,final:t.phase!=='active',deleteAttempts:0});
     const due=await this.storage.get('duelRoundCleanupAt');await this.storage.put('duelRoundCleanupAt',Math.min(due||Infinity,job.expiresAt));
    }
    job.sent=true;
   }else if([400,401,403,404].includes(r.status))job.attempts=3;
   else if(r.status===429){try{job.retryAt=Date.now()+Math.max(3000,Number((await r.json()).retry_after||3)*1000);}catch{}}
  }catch{}
  await this.storage.put('duelRoundNotices',Object.fromEntries(Object.entries(records).slice(-14)));return !!(job.messageId&&!job.deleted&&(job.deleteAttempts||0)<3)||!job.sent&&job.attempts<3;
 }
 async cleanupRounds(t){
  const records=await this.storage.get('duelRoundNotices')||{},now=Date.now();let pending=false;
  for(const job of Object.values(records)){
   if(!job.messageId||job.deleted||(job.deleteAttempts||0)>=3)continue;
   const ended=!job.key.startsWith(`${t?.epoch}:`)||t?.phase!=='active'&&!job.final;
   if((!ended&&job.expiresAt>now)||job.deleteRetryAt>now){pending=true;continue;}
   job.deleteAttempts=(job.deleteAttempts||0)+1;await this.storage.put('duelRoundNotices',records);
   const r=await this.shots.request(job,'DELETE');
   if(r.ok||r.status===404){job.deleted=true;delete job.deleteRetryAt;}
   else {if([400,401,403].includes(r.status))job.deleteAttempts=3;job.deleteRetryAt=Date.now()+r.retry;if(job.deleteAttempts<3)pending=true;}
  }
  await this.storage.put('duelRoundNotices',records);
  const due=Object.values(records).filter(j=>j.messageId&&!j.deleted&&(j.deleteAttempts||0)<3).map(j=>Math.max(now+1,j.deleteRetryAt||j.expiresAt));
  if(due.length)await this.storage.put('duelRoundCleanupAt',Math.min(...due));else await this.storage.delete('duelRoundCleanupAt');
  return pending;
 }
 async sync(t){
  let retry=await this.publicResult(t);retry=await this.shots.sync(t)||retry;const records=await this.parent.read();
  for(const [id,s] of Object.entries(records)){
   if(s.epoch!==t.epoch||!t.players.some(p=>p.id===id))continue;
   if(t.phase==='lobby')continue;
   const key=roundKey(t,id,s),notice=t.game==='duel'&&t.lastRound?`上一轮结果：${t.lastRound.summary}`:'';
   if(s.delivered!==key&&s.send?.expires>Date.now()&&s.attempted!==key){
    s.view='panel';
    // POST timeouts are ambiguous: record before sending and never duplicate that round.
    s.attempted=key;await this.parent.write(records);
    const sent=await this.parent.api(s.send,'POST',panel(t,id,notice));
    if(sent?.id){
     if(s.panel)s.retire.push(s.panel);
     s.panel={...s.send,ref:sent.id,id:sent.id,version:t.version};s.delivered=key;s.failures=0;
    }
   }else if(s.delivered===key&&s.panel?.expires>Date.now()&&s.panel.version!==t.version&&(s.failedVersion!==t.version||s.failures<3)){
    if(s.failedVersion!==t.version)s.failures=0;
    const data=panel(t,id,notice,s.view==='details');delete data.flags;
    if(await this.parent.api(s.panel,'PATCH',data,s.panel.ref)){s.panel.version=t.version;s.failures=0;delete s.failedVersion;}else {s.failedVersion=t.version;s.failures=(s.failures||0)+1;if(s.failures<3)retry=true;}
   }
   const pending=[];
   for(const old of s.retire||[]){if(old.expires>Date.now()&&!await this.parent.api(old,'PATCH',{content:t.game==='duel'?'本轮已结束，请使用最新出拳面板。':'操作面板已更新，请使用最新面板。',embeds:[],components:[],attachments:[],allowed_mentions:{parse:[]}},old.ref)){old.failures=(old.failures||0)+1;if(old.failures<3)pending.push(old);}}
   s.retire=pending.slice(-5);if(pending.length)retry=true;
  }
  await this.parent.write(records);return retry;
 }
 async prune(t){
  const records=await this.parent.read();let reconnect=false;
  for(const s of Object.values(records))if(s.panel?.expires<=Date.now()){
   delete s.panel;delete s.delivered;delete s.attempted;
   if(s.epoch===t.epoch&&s.send?.expires>Date.now())reconnect=true;
  }
  await this.parent.write(records);if(reconnect)await this.storage.put('privateSyncAt',Date.now()+1);
 }
}
