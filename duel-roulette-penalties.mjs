// Persistent guild-scoped punishment outbox. SPDX-License-Identifier: AGPL-3.0-only
const ID=/^\d{1,20}$/;
const LIVE=['prepareRename','applyingRename','activeRename','restoringRename'];
export const penaltyStub=(env,guild)=>env.TABLES.get(env.TABLES.idFromName(`duel-roulette-penalties:${guild}`));
export async function penaltyRequest(env,guild,action,data){const r=await penaltyStub(env,guild).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'duelRoulettePenalty',guild,action,...data})});const answer=await r.json();if(!r.ok||answer.error)throw Error(answer.error||'惩罚服务暂时繁忙。');return answer;}
const summary=p=>p?{id:p.id,status:p.status,until:p.until,renameUntil:p.renameUntil,notice:p.notice||null,retryAt:p.retryAt||null}:null;
export class DuelRoulettePenalties {
 constructor(host){this.storage=host.ctx.storage;this.env=host.env;}
 async arm(records){records??=await this.storage.get('duelRoulettePenalties')||{};const dates=Object.values(records).flatMap(p=>p.status==='pending'?[p.until]:p.status==='renamePending'?[p.renameUntil]:['prepareRename','applyingRename','applyingMute','restoringRename'].includes(p.status)?[p.retryAt]:p.status==='activeRename'?[p.restoreAt]:[]).filter(Number.isFinite);if(dates.length)await this.storage.setAlarm(Math.max(Date.now()+1,Math.min(...dates)));else await this.storage.deleteAlarm();}
 async save(records,guild){await this.storage.put({duelRoulettePenalties:records,duelRoulettePenaltyGuild:guild});await this.arm(records);}
 async dispatch(q){
  if(!ID.test(q.guild||''))throw Error('无效服务器。');const records=await this.storage.get('duelRoulettePenalties')||{};
  if(q.action==='create'){
   const p=q.penalty;if(!p||!/^[-a-zA-Z0-9]{16}:1$/.test(p.id||'')||p.guild!==q.guild||!ID.test(p.winner)||!ID.test(p.loser)||p.winner===p.loser||!['duel','devil_roulette'].includes(p.game)||![3,5].includes(p.muteMinutes)||![5,7,10].includes(p.renameMinutes)||![3,5].includes(p.autoMuteMinutes)||!Number.isSafeInteger(p.until))throw Error('无效惩罚记录。');
   if(!records[p.id]){records[p.id]={...p,status:'pending'};await this.save(records,q.guild);}return summary(records[p.id]);
  }
  const p=records[q.id];if(!p)return null;if(q.action==='view')return summary(p);
  if(q.user!==p.winner)throw Error('只有本局胜者可以裁决。');
  const now=Date.now();
  if(q.action==='rename'&&p.status==='pending'&&now<p.until){p.status='renamePending';p.renameUntil=now+60000;await this.save(records,q.guild);return summary(p);}
  if(q.action==='mute'&&p.status==='pending'&&now<p.until){this.queueMute(p,now,p.muteMinutes);await this.save(records,q.guild);return summary(p);}
  if(q.action==='submit'&&p.status==='renamePending'&&now<p.renameUntil){
   const nick=String(q.nickname||'').trim();if(!nick||[...nick].length>32||/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(nick))throw Error('请输入 1～32 字的正常昵称。');
   if(Object.values(records).some(x=>x.id!==p.id&&x.loser===p.loser&&LIVE.includes(x.status)))throw Error('输家已有昵称惩罚正在生效，请稍后重试。');
   p.nickname=nick;p.status='prepareRename';p.retryAt=now+1;await this.save(records,q.guild);return summary(p);
  }
  throw Error('裁决已提交或窗口已到期。');
 }
 queueMute(p,now,minutes){p.status='applyingMute';p.timeoutUntil=now+minutes*60000;p.retryAt=now+1;p.appliedMinutes=minutes;}
 async api(guild,user,method='GET',body){
  const r=await fetch(`https://discord.com/api/v10/guilds/${guild}/members/${user}`,{method,headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`,'Content-Type':'application/json','X-Audit-Log-Reason':encodeURIComponent('死斗 / 恶魔轮盘败者惩罚及自动恢复')},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(3500)});
  if(!r.ok){const e=Error(r.status===403?'机器人权限或身份组层级不足，惩罚未能执行。':r.status===404?'玩家已离开服务器。':'Discord 请求失败，正在重试。');e.status=r.status;throw e;}return r.status===204?null:r.json();
 }
 async alarm(guild){
  const records=await this.storage.get('duelRoulettePenalties')||{},now=Date.now();let processed=0;
  for(const p of Object.values(records)){
   if(p.status==='pending'&&p.until<=now)this.queueMute(p,now,p.autoMuteMinutes);
   if(p.status==='renamePending'&&p.renameUntil<=now){p.status='expired';p.notice='昵称未在一分钟内提交，改名惩罚已过期。';}
   if(!(['prepareRename','applyingRename','applyingMute','restoringRename'].includes(p.status)&&p.retryAt<=now||p.status==='activeRename'&&p.restoreAt<=now))continue;
   if(processed++>=3){if(p.status==='activeRename')p.status='restoringRename';p.retryAt=now+1000;continue;}
   try{
    if(p.status==='applyingMute'){
     // A fixed target timestamp makes retries idempotent and never extends a timeout.
     const member=await this.api(guild,p.loser);const existing=Date.parse(member.communication_disabled_until||'')||0;
     if(p.timeoutUntil<=Date.now()){p.status='expired';p.notice='禁言时段已结束，未重复延长。';}
     else {if(existing<p.timeoutUntil)await this.api(guild,p.loser,'PATCH',{communication_disabled_until:new Date(p.timeoutUntil).toISOString()});p.status='applied';p.notice=`已禁言 ${p.appliedMinutes} 分钟。`;}
    }else if(p.status==='prepareRename'){
     const member=await this.api(guild,p.loser);p.original=member.nick??null;p.restoreAt=Date.now()+p.renameMinutes*60000;p.status='applyingRename';p.retryAt=Date.now()+1;
     await this.save(records,guild); // Recovery intent commits before changing Discord.
     await this.api(guild,p.loser,'PATCH',{nick:p.nickname});p.status='activeRename';p.notice=`临时昵称已生效，${p.renameMinutes} 分钟后自动恢复。`;
    }else if(p.status==='applyingRename'&&p.restoreAt>Date.now()){
     const member=await this.api(guild,p.loser);
     if(member.nick!==p.nickname&&(member.nick??null)!==p.original){p.status='externallyChanged';p.notice='昵称已被另外修改，保留当前昵称，不再覆盖。';}
     else {if(member.nick!==p.nickname)await this.api(guild,p.loser,'PATCH',{nick:p.nickname});p.status='activeRename';p.notice=`临时昵称已生效，${p.renameMinutes} 分钟后自动恢复。`;}
    }else{
     p.status='restoringRename';p.retryAt=Date.now()+1;await this.save(records,guild);
     const member=await this.api(guild,p.loser);if(member.nick===p.nickname)await this.api(guild,p.loser,'PATCH',{nick:p.original});p.status=member.nick===p.nickname?'restored':'externallyChanged';p.notice=member.nick===p.nickname?'临时昵称已自动恢复。':'昵称已被另外修改，保留当前昵称。';
    }
    delete p.retryAt;delete p.retries;
   }catch(e){
    p.notice=e.message;
    const restoring=p.status==='restoringRename'||p.status==='activeRename';
    if(e.status===404||[400,401,403].includes(e.status)&&!restoring){p.status='failed';delete p.retryAt;}
    else {p.retries=(p.retries||0)+1;p.retryAt=Date.now()+Math.min(900000,10000*2**Math.min(p.retries,6));if(p.status==='activeRename')p.status='restoringRename';}
   }
   await this.save(records,guild);
  }
  for(const [id,p] of Object.entries(records))if(['applied','failed','expired','restored','externallyChanged'].includes(p.status)&&p.until<now-86400000)delete records[id];
  await this.save(records,guild);
 }
}
