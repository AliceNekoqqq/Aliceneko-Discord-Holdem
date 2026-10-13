import {rewardSnapshot} from './tavern-catalog.mjs';
import {tavernRequest} from './tavern-service.mjs';
// Only public outcomes and activity counts enter this durable outbox, never hands.
export class TavernBridge {
 constructor(host){this.host=host;this.storage=host.ctx.storage;this.env=host.env;}
 async capture(t){
  if(!this.env.TABLES)return;const r=rewardSnapshot(t);if(!r||r.players.some(p=>p.bot))return;
  const key=`${r.game}:${r.id}`;if(await this.storage.get('tavernLastQueued')===key)return;
  const jobs=await this.storage.get('tavernJobs')||[];if(!jobs.some(j=>`${j.game}:${j.id}`===key))jobs.push(r);
  // Queue and marker commit together; a restart cannot lose a completed round.
  await this.storage.put({tavernJobs:jobs,tavernLastQueued:key,tavernSyncAt:await this.storage.get('tavernSyncAt')||Date.now()+1});
 }
 async flush(now=Date.now()){
  const due=await this.storage.get('tavernSyncAt');if(!due||due>now)return;
  const jobs=await this.storage.get('tavernJobs')||[];
  try{
   for(const result of jobs.slice(0,3)){await tavernRequest(this.env,{guild:result.guild,action:'reward',result});jobs.shift();await this.storage.put('tavernJobs',jobs);}
   await this.storage.delete('tavernRetries');if(jobs.length)await this.storage.put('tavernSyncAt',Date.now()+100);else {await this.storage.delete('tavernJobs');await this.storage.delete('tavernSyncAt');}
  }catch{const retries=(await this.storage.get('tavernRetries')||0)+1;await this.storage.put('tavernRetries',retries);await this.storage.put('tavernSyncAt',Date.now()+Math.min(900000,5000*2**Math.min(retries-1,8)));}
 }
}

