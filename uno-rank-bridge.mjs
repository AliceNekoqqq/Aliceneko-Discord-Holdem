// Durable per-channel outbox; guild standings deduplicate result IDs after any retry.
export class UnoRankBridge {
 constructor(host){this.host=host;this.storage=host.ctx.storage;this.env=host.env;}
 async capture(t){if(!this.env.TABLES||t.game!=='uno')return;
  if(t.rankedResult&&await this.storage.get('lastRankQueued')!==t.rankedResult.id){const jobs=await this.storage.get('unoRankJobs')||[];if(!jobs.some(j=>j.id===t.rankedResult.id))jobs.push(t.rankedResult);await this.storage.put('unoRankJobs',jobs);await this.storage.put('lastRankQueued',t.rankedResult.id);await this.storage.put('unoRankSyncAt',Date.now()+1);}
  if(t.phase!=='closed'&&!await this.storage.get('unoRankSyncAt'))await this.storage.put('unoRankSyncAt',Date.now()+1);
 }
 async flush(t){if(!this.env.TABLES)return;const due=await this.storage.get('unoRankSyncAt');if(!due||due>Date.now())return;
  const jobs=await this.storage.get('unoRankJobs')||[];let crown=null,profiles=null;
  try{for(const result of jobs.slice(0,10)){const r=await this.env.TABLES.get(this.env.TABLES.idFromName(`uno-rank:${result.guild}`)).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'unoRank',guild:result.guild,action:'record',result})});if(!r.ok)throw Error('retry');const answer=await r.json();if(answer.error)throw Error('retry');crown=answer.crown;jobs.shift();await this.storage.put('unoRankJobs',jobs);}
   if(t?.game==='uno'&&t.phase!=='closed'){const r=await this.env.TABLES.get(this.env.TABLES.idFromName(`uno-rank:${t.guild}`)).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'unoRank',guild:t.guild,action:'crown',ids:t.players.filter(p=>!p.bot).map(p=>p.id)})});if(!r.ok)throw Error('retry');const data=await r.json();if(data.error)throw Error('retry');crown=data.crown;profiles=data.profiles;}
   if(t?.game==='uno'){const old=t.crown;t.crown=crown;let changed=false;for(const p of t.players||[]){const next=profiles?.[p.id];if(!p.bot&&next){if(p.avatar!==next.avatar||p.accent!==next.accent)changed=true;p.avatar=next.avatar;p.accent=next.accent;}}await this.storage.put('table',t);if(changed||old?.id!==crown?.id||old?.choice!==crown?.choice){await this.host.queuePanels(t);await this.host.syncBoard(t);}}
   if(jobs.length)await this.storage.put('unoRankSyncAt',Date.now()+100);else if(t?.game==='uno'&&t.phase!=='closed')await this.storage.put('unoRankSyncAt',Date.now()+15000);else await this.storage.delete('unoRankSyncAt');
  }catch{if(t?.game==='uno'&&t.crown?.validUntil<=Date.now()){t.crown=null;await this.storage.put('table',t);await this.host.queuePanels(t);await this.host.syncBoard(t);}await this.storage.put('unoRankSyncAt',Date.now()+5000);}
 }
}
