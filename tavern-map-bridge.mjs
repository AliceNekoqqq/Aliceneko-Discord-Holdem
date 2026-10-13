import {validId,displayText} from './tavern-catalog.mjs';
import {tavernRequest} from './tavern-service.mjs';

const JOB='tavernMapJob',LAST='tavernMapLast',DUE='tavernMapSyncAt',RETRIES='tavernMapRetries';
// One coalescing public snapshot per channel; never export cards or account preferences.
export class TavernMapBridge {
 constructor(host){this.host=host;this.storage=host.ctx.storage;this.env=host.env;}
 async capture(t,now=Date.now(),activity=false){
  if(!this.env.TABLES)return;
  const prior=await this.storage.get(LAST);
  if(!t){if(!prior||prior.closed)return;t={...prior.snapshot,phase:'closed',players:[]};}
  if(!validId(t.guild)||!validId(t.channel)||typeof t.epoch!=='string')return;
  const snapshot={guild:t.guild,channel:t.channel,epoch:t.epoch,game:t.game||'poker',phase:t.phase||'waiting',closed:t.phase==='closed',players:(t.players||[]).slice(0,9).map(p=>({id:p.id,name:displayText(p.name)||'来客',bot:!!p.bot}))};
  const signature=JSON.stringify(snapshot);
  if(prior?.signature===signature&&(!activity||now-prior.at<60000))return;
  const at=Math.max(now,(prior?.at||0)+1),job={...snapshot,at,expires:at+1800000};
  await this.storage.put({[LAST]:{signature,at,closed:job.closed,snapshot},[JOB]:job,[DUE]:await this.storage.get(DUE)||now+2000,[RETRIES]:0});
  await this.host.armAlarm?.(t);
 }
 async flush(now=Date.now()){
  const due=await this.storage.get(DUE);if(!due||due>now)return;
  const job=await this.storage.get(JOB);if(!job){await this.storage.delete(DUE);return;}
  try{
   await tavernRequest(this.env,{...job,action:'mapTable'});
   const latest=await this.storage.get(JOB);
   if(latest?.at===job.at&&latest.epoch===job.epoch){await this.storage.delete(JOB);await this.storage.delete(DUE);await this.storage.delete(RETRIES);}
  }catch{
   const latest=await this.storage.get(JOB);if(latest?.at!==job.at||latest.epoch!==job.epoch)return;
   const tries=(await this.storage.get(RETRIES)||0)+1;
   if(tries>3){await this.storage.delete(JOB);await this.storage.delete(DUE);await this.storage.delete(RETRIES);return;}
   await this.storage.put({[RETRIES]:tries,[DUE]:now+5000*2**(tries-1)});
  }
 }
}

