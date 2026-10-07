import { handPanel, button, row, panelAction } from './ui.mjs';
import { imageMessage } from './card-image.mjs';

const TTL=14*60*1000;
const encode=s=>new TextEncoder().encode(s);
const pack=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
const unpack=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const retired=()=>({content:'这张手牌卡已结束，请查看下方最新一手。',embeds:[],components:[],attachments:[],allowed_mentions:{parse:[]}});

// Continuation credentials are encrypted at rest and discarded before Discord's
// 15-minute expiry. They never enter table state, UI, source or logs.
export class PrivatePanels {
  constructor(storage,env){this.storage=storage;this.env=env;}
  async key(){return this.cryptoKey??=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encode(`holdem/private-panels/v1/${this.env.BOT_TOKEN}`)),'AES-GCM',false,['encrypt','decrypt']);}
  async read(){
    const saved=await this.storage.get('privatePanels');if(!saved)return {};
    try{return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unpack(saved.iv)},await this.key(),unpack(saved.data))));}catch{return {};}
  }
  async write(records){
    const now=Date.now(),expires=[];
    for(const [id,s] of Object.entries(records)){
      if(s.send?.expires<=now)delete s.send;
      if(s.panel?.expires<=now)delete s.panel;
      s.retire=(s.retire||[]).filter(p=>p.expires>now);
      if(!s.send&&!s.panel&&!s.retire.length){delete records[id];continue;}
      for(const x of [s.send,s.panel,...s.retire])if(x)expires.push(x.expires);
    }
    if(!expires.length){await this.storage.delete('privatePanels');await this.storage.delete('privateExpiry');return;}
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await this.key(),encode(JSON.stringify(records)));
    await this.storage.put('privatePanels',{iv:pack(iv),data:pack(data)});
    await this.storage.put('privateExpiry',Math.min(...expires));
  }
  async prune(t){
    const records=await this.read();
    await Promise.all(Object.entries(records).map(async([id,s])=>{
      if(s.panel&&s.panel.expires<=Date.now()&&Date.now()-s.panel.expires<45000){
        const components=s.epoch===t?.epoch&&t.phase!=='closed'&&t.players.some(p=>p.id===id&&!p.bot)?[row(button(t,panelAction(id,'hand'),'重新启用自动手牌',1))]:[];
        await this.api({...s.panel,expires:Date.now()+1500},'PATCH',{content:'自动手牌连接已到期，旧底牌已收起。点击下方按钮重新启用。',embeds:[],components,attachments:[],allowed_mentions:{parse:[]}},s.panel.ref);
      }
    }));
    await this.write(records);
  }
  async remember(t,i,reply){
    const id=i.member?.user?.id;
    if(!i.token||!this.env.BOT_TOKEN||!id||!t.players.some(p=>p.id===id&&!p.bot)||t.phase==='closed')return false;
    const records=await this.read();let s=records[id];
    if(!s||s.epoch!==t.epoch){s={epoch:t.epoch,retire:s?.panel?[s.panel]:[]};records[id]=s;}
    s.send={token:i.token,expires:Date.now()+TTL};s.failures=0;
    const actions=reply.data?.components?.flatMap(r=>r.components||[])||[];
    const panelReply=actions.some(b=>b.custom_id?.includes(`:p~${id}~`));
    const privateReply=reply.type===4&&(reply.data?.flags&64)||reply.type===7&&(i.message?.flags&64);
    if(panelReply&&privateReply){
      const sourceId=reply.type===7?i.message?.id:null;
      if(s.panel&&(!sourceId||(s.panel.id&&s.panel.id!==sourceId)))s.retire.push(s.panel);
      s.panel={...s.send,ref:'@original',id:sourceId,hand:t.handNo,version:t.version};
      s.hidden=reply.data.content==='底牌已收起。';
      // Initial HTTP acknowledgements stay fast and text-only. Enrich that exact
      // private reply afterwards so a confirmation is never replaced by navigation.
      if(!s.hidden&&t.players.find(p=>p.id===id).cards.length===2){s.panel.pending=structuredClone(reply.data);delete s.panel.pending.flags;}
    }
    s.retire=s.retire.slice(-5);
    await this.write(records);return true;
  }
  async api(credential,method,body,ref){
    if(!credential||credential.expires<=Date.now())return null;
    const path=`https://discord.com/api/v10/webhooks/${this.env.DISCORD_APPLICATION_ID}/${encodeURIComponent(credential.token)}${ref?`/messages/${ref}`:''}`;
    const multipart=body instanceof FormData;
    try{let r=await fetch(path,{method,headers:multipart?{}:{'Content-Type':'application/json'},body:multipart?body:JSON.stringify(body),signal:AbortSignal.timeout(multipart?2000:1000)});
      // Explicit file rejection is safe to retry as text. A timeout is ambiguous,
      // so never issue an immediate second POST in that case.
      if(multipart&&[400,403,413,415].includes(r.status)){const fallback=JSON.parse(body.get('payload_json'));for(const embed of fallback.embeds||[])delete embed.image;fallback.attachments=[];r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(fallback),signal:AbortSignal.timeout(1000)});}
      if(!r.ok)return null;return r.status===204?{}:await r.json();}catch{return null;}
  }
  async sync(t){
    const records=await this.read();let retry=false;
    await Promise.all(Object.entries(records).map(async([id,s])=>{
      const eligible=s.epoch===t.epoch&&t.phase!=='closed'&&t.players.some(p=>p.id===id&&!p.bot);
      if(!eligible&&s.panel){s.retire.push(s.panel);delete s.panel;delete s.send;}
      const newHand=eligible&&s.panel&&s.panel.hand!==t.handNo;
      if(newHand){s.retire.push(s.panel);delete s.panel;s.hidden=false;}
      const pending=[];
      await Promise.all((s.retire||[]).map(async p=>{if(p.expires>Date.now()&&!await this.api(p,'PATCH',retired(),p.ref))pending.push(p);}));
      s.retire=pending;
      let failed=pending.length>0;
      if(eligible){
        if(!s.panel&&s.send?.expires>Date.now()){
          const data=handPanel(t,id,t.handNo?'新的一手已发牌，这是你本手的两张底牌。':'已入座，发牌后会自动显示你的底牌。');
          const prepared=await imageMessage(t,id,{...data,flags:64});
          const sent=await this.api(s.send,'POST',prepared.body);
          if(sent?.id){s.panel={...s.send,ref:sent.id,id:sent.id,hand:t.handNo,version:t.version,image:sent.attachments?.[0]?.id?{id:sent.attachments[0].id,signature:prepared.signature}:null};s.hidden=false;}else failed=true;
        }else if(s.panel?.expires>Date.now()&&(s.panel.version!==t.version||s.panel.pending)){
          const data=s.hidden?{content:'底牌已收起。',embeds:[],attachments:[],components:[row(button(t,panelAction(id,'hand'),'展开手牌',1))],allowed_mentions:{parse:[]}}:s.panel.version===t.version&&s.panel.pending?s.panel.pending:handPanel(t,id);
          const prepared=await imageMessage(t,id,data,s.panel.image);
          const updated=await this.api(s.panel,'PATCH',prepared.body,s.panel.ref);
          if(updated){s.panel.version=t.version;delete s.panel.pending;if(updated.id)s.panel.id=updated.id;s.panel.image=updated.attachments?.[0]?.id?{id:updated.attachments[0].id,signature:prepared.signature}:null;}else failed=true;
        }
      }
      s.failures=failed?(s.failures||0)+1:0;
      if(failed&&s.failures<3)retry=true;
    }));
    await this.write(records);return retry;
  }
}
