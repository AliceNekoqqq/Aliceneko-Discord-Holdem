import { board } from './ui.mjs';

// This queue is the sole writer of existing public table messages. Interactions
// acknowledge without editing the board; the alarm publishes under the table lock.
export class BoardSync {
  constructor(storage,env){this.storage=storage;this.env=env;}
  async schedule(jobs){const dates=Object.values(jobs).map(j=>j.due);if(dates.length)await this.storage.put('boardSyncAt',Math.min(...dates));else await this.storage.delete('boardSyncAt');}
  async queue(t,now=Date.now()){
    if(!t.messageId||!this.env.BOT_TOKEN)return;
    const jobs=await this.storage.get('boardJobs')||{},old=jobs[t.messageId];
    jobs[t.messageId]={epoch:t.epoch,channel:t.channel,body:board(t),due:Math.max(now+250,old?.retryAt||0),attempts:0,retryAt:old?.retryAt||null};
    await this.storage.put('boardJobs',jobs);await this.schedule(jobs);
  }
  async flush(current,now=Date.now()){
    const jobs=await this.storage.get('boardJobs')||{};
    for(const [id,job]of Object.entries(jobs)){
      if(job.due>now)continue;
      const body=current?.epoch===job.epoch&&current.messageId===id?board(current):job.body;
      let response;try{response=await fetch(`https://discord.com/api/v10/channels/${job.channel}/messages/${id}`,{method:'PATCH',headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(2000)});}catch{}
      if(response?.ok||(response&&[400,401,403,404].includes(response.status))){delete jobs[id];continue;}
      job.body=body;job.attempts++;
      if(job.attempts>=3){delete jobs[id];continue;}
      let retry=3000*job.attempts;
      if(response?.status===429){try{const data=await response.json();retry=Math.max(1000,Math.ceil(Number(data.retry_after)*1000)||retry);}catch{}}
      job.retryAt=Date.now()+retry;job.due=job.retryAt;
    }
    if(Object.keys(jobs).length)await this.storage.put('boardJobs',jobs);else await this.storage.delete('boardJobs');
    await this.schedule(jobs);
  }
}
