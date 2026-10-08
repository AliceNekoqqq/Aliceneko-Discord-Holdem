import {board} from './liar-ui.mjs';
import {boardImageMessage} from './liar-image.mjs';

// Only Liar's Tavern follows the channel tail. All writes run under the table lock.
export class LiarLive {
  constructor(storage,env){this.storage=storage;this.env=env;}
  async request(channel,id,method,body){
    const multipart=body instanceof FormData;
    return fetch(`https://discord.com/api/v10/channels/${channel}/messages${id?`/${id}`:''}`,{
      method,headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`,...(multipart?{}:{'Content-Type':'application/json'})},
      ...(body?{body:multipart?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(2500)
    });
  }
  async cleanup(){
    const pending=await this.storage.get('liarRetiredBoards')||[];const remaining=[];
    for(const entry of pending){
      try{
        const r=await this.request(entry.channel,entry.id,'DELETE');
        if(r.ok||r.status===404)continue;
        // Without deletion permission the old card becomes a harmless link.
        const cleared=await this.request(entry.channel,entry.id,'PATCH',{
          content:`牌桌已移到最新消息：https://discord.com/channels/${entry.guild}/${entry.channel}/${entry.latest}`,
          embeds:[],components:[],attachments:[],allowed_mentions:{parse:[]}
        });
        if(cleared.ok||cleared.status===404)continue;
      }catch{}
      remaining.push(entry);
    }
    if(remaining.length)await this.storage.put('liarRetiredBoards',remaining.slice(-8));
    else await this.storage.delete('liarRetiredBoards');
    return remaining.length>0;
  }
  async publish(t,job){
    const data=board(t),signature=JSON.stringify(data),last=await this.storage.get('liarLiveBoard');
    const move=job.bump||last?.epoch!==t.epoch||last?.signature!==signature;
    const prepared=await boardImageMessage(t,data,move?null:(await this.storage.get('boardImages')||{})[t.messageId]);
    const old=t.messageId;
    if(move){
      // Stable nonce deduplicates an ambiguous timeout, including after restart.
      if(!job.nonce||job.nonceSignature!==signature){
        const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${t.epoch}/${old}/${signature}`)));
        job.nonce=String(new DataView(hash.buffer).getBigUint64(0)&0x7fffffffffffffffn);
        job.nonceSignature=signature;
        const jobs=await this.storage.get('boardJobs')||{};jobs[old]=job;await this.storage.put('boardJobs',jobs);
      }
      if(prepared.body instanceof FormData){const payload=JSON.parse(prepared.body.get('payload_json'));payload.nonce=job.nonce;payload.enforce_nonce=true;prepared.body.set('payload_json',JSON.stringify(payload));}
      else Object.assign(prepared.body,{nonce:job.nonce,enforce_nonce:true});
    }
    let r=await this.request(t.channel,move?null:old,move?'POST':'PATCH',prepared.body);
    if(prepared.body instanceof FormData&&[400,413,415].includes(r.status))r=await this.request(t.channel,move?null:old,move?'POST':'PATCH',{
      ...data,attachments:[],...(move?{nonce:job.nonce,enforce_nonce:true}:{})
    });
    if(!r.ok)return r;
    const sent=await r.clone().json();
    if(move&&!/^\d+$/.test(sent.id||''))throw Error('Missing published board ID');
    if(move){
      t.messageId=sent.id;
      await this.storage.put('table',t);
      const pending=await this.storage.get('liarRetiredBoards')||[];
      if(old!==sent.id)pending.push({id:old,latest:sent.id,channel:t.channel,guild:t.guild});
      await this.storage.put('liarRetiredBoards',pending);
    }
    await this.storage.put('liarLiveBoard',{epoch:t.epoch,signature,at:Date.now(),id:t.messageId});
    const images=await this.storage.get('boardImages')||{};delete images[old];
    const image=sent.attachments?.[0];if(image?.id&&prepared.signature)images[t.messageId]={id:image.id,signature:prepared.signature};
    await this.storage.put('boardImages',Object.fromEntries(Object.entries(images).slice(-3)));
    return r;
  }
}
