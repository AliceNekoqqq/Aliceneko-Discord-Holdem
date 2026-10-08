import {board as liarBoard} from './liar-ui.mjs';
import {LiarLive} from './liar-live.mjs';
import {boardImageMessage as liarImage} from './liar-image.mjs';
import {board as ghostBoard} from './ghost-ui.mjs';
import {boardImageMessage as ghostImage} from './ghost-image.mjs';
import { board as pokerBoard } from './ui.mjs';
import { board as unoBoard } from './uno-ui.mjs';
import { boardImageMessage } from './uno-image.mjs';
const board=t=>(t.game==='liar'?liarBoard:t.game==='ghost'?ghostBoard:t.game==='uno'?unoBoard:pokerBoard)(t);

// This queue is the sole writer of existing public table messages. Interactions
// acknowledge without editing the board; the alarm publishes under the table lock.
export class BoardSync {
  constructor(storage,env){this.storage=storage;this.env=env;this.liar=new LiarLive(storage,env);}
  async schedule(jobs){const dates=Object.values(jobs).map(j=>j.due);if(dates.length)await this.storage.put('boardSyncAt',Math.min(...dates));else await this.storage.delete('boardSyncAt');}
  async queue(t,now=Date.now()){
    if(!t.messageId||!this.env.BOT_TOKEN)return;
    const jobs=await this.storage.get('boardJobs')||{},old=jobs[t.messageId];
    jobs[t.messageId]={epoch:t.epoch,channel:t.channel,body:{...board(t),...(['uno','ghost','liar'].includes(t.game)?{attachments:[]}: {})},due:Math.max(now+250,old?.retryAt||0),attempts:t.game==='liar'?old?.attempts||0:0,retryAt:old?.retryAt||null,...(t.game==='liar'?{bump:!!old?.bump,...(old?.nonceSignature===JSON.stringify(board(t))?{nonce:old.nonce,nonceSignature:old.nonceSignature}:{})}:{})};
    await this.storage.put('boardJobs',jobs);await this.schedule(jobs);
  }
  async flush(current,now=Date.now()){
    const jobs=await this.storage.get('boardJobs')||{};
    for(const [id,job]of Object.entries(jobs)){
      if(job.due>now)continue;
      const live=current?.epoch===job.epoch&&current.messageId===id,body=live?board(current):job.body;
      if(live&&current.game==='liar'){
        let r;try{r=await this.liar.publish(current,job);}catch{}
        if(r?.ok||(r&&[400,401,403,404].includes(r.status))){delete jobs[id];continue;}
        job.attempts++;
        if(job.attempts>=3){delete jobs[id];continue;}
        let delay=3000*job.attempts;
        if(r?.status===429){try{delay=Math.max(1000,Math.ceil(Number((await r.json()).retry_after)*1000)||delay);}catch{}}
        job.retryAt=Date.now()+delay;job.due=job.retryAt;continue;
      }
      const images=await this.storage.get('boardImages')||{};
      const prepared=live&&current.game==='liar'?await liarImage(current,body,images[id]):live&&current.game==='ghost'?await ghostImage(current,body,images[id]):live&&current.game==='uno'?await boardImageMessage(current,body,images[id]):{body,signature:null};
      const send=data=>fetch(`https://discord.com/api/v10/channels/${job.channel}/messages/${id}`,{method:'PATCH',headers:data instanceof FormData?{Authorization:`Bot ${this.env.BOT_TOKEN}`}:{Authorization:`Bot ${this.env.BOT_TOKEN}`,'Content-Type':'application/json'},body:data instanceof FormData?data:JSON.stringify(data),signal:AbortSignal.timeout(2000)});
      let response;try{response=await send(prepared.body);if(prepared.body instanceof FormData&&[400,413,415].includes(response.status))response=await send({...body,attachments:[]});}catch{}
      if(response?.ok){let data;try{data=await response.json();}catch{}const attachment=data?.attachments?.[0];if(attachment?.id&&prepared.signature)images[id]={id:attachment.id,signature:prepared.signature};else delete images[id];await this.storage.put('boardImages',Object.fromEntries(Object.entries(images).slice(-3)));}
      if(response?.ok||(response&&[400,401,403,404].includes(response.status))){delete jobs[id];continue;}
      job.body=body;job.attempts++;
      if(job.attempts>=3){delete jobs[id];continue;}
      let retry=3000*job.attempts;
      if(response?.status===429){try{const data=await response.json();retry=Math.max(1000,Math.ceil(Number(data.retry_after)*1000)||retry);}catch{}}
      job.retryAt=Date.now()+retry;job.due=job.retryAt;
    }
    if(Object.keys(jobs).length)await this.storage.put('boardJobs',jobs);else await this.storage.delete('boardJobs');
    await this.schedule(jobs);
    if(current?.game==='liar'){
      const retry=await this.liar.cleanup();
      if(retry)await this.storage.put('boardSyncAt',Math.min((await this.storage.get('boardSyncAt'))||Infinity,Date.now()+5000));
    }
  }
  async follow(t,messageId,now=Date.now()){
    if(t?.game!=='liar'||t.phase==='closed'||!t.messageId||messageId===t.messageId||!/^\d+$/.test(messageId||''))return false;
    // Replayed older Gateway messages cannot move a newer table backwards.
    if(BigInt(messageId)<=BigInt(t.messageId))return false;
    const previous=(await this.storage.get('boardJobs')||{})[t.messageId];
    await this.queue(t,now);const jobs=await this.storage.get('boardJobs'),job=jobs?.[t.messageId];if(!job)return false;
    job.bump=true;const last=await this.storage.get('liarLiveBoard');
    job.due=Math.max(Math.min(job.due,previous?.due||Infinity),job.retryAt||0,last?.epoch===t.epoch?(last.at||0)+2500:0);
    await this.storage.put('boardJobs',jobs);await this.schedule(jobs);return true;
  }
}
