import {generateGemini} from './ai-chat.mjs';

export const WELCOME_TARGET=Object.freeze({guild:'1556735402692583454',channel:'1560315540982071386'});
const PREFIX='memberWelcome:pending:',MAX_AGE=10*60*1000;
const cleanName=s=>Array.from(String(s||'新朋友').replace(/[\u0000-\u001f\u007f<>@`]/g,' ').trim()).slice(0,40).join('');
export function welcomeText(text){
 const s=String(text||'').replace(/<[^>]*>|@everyone|@here/g,'').replace(/@/g,'').replace(/[\r\n]+/g,' ').trim();
 return Array.from(s).slice(0,100).join('')||'欢迎来到这里，找个舒服的位置坐下，慢慢认识大家吧。';
}

// Pending jobs survive a gateway restart. A sending job is never blindly resent:
// Discord may have accepted the message before the connection was interrupted.
export class MemberWelcome {
 constructor(host,{generate=generateGemini,fetcher=(...a)=>fetch(...a),clock=Date.now}={}){
  this.host=host;this.storage=host.ctx.storage;this.env=host.env;
  this.generate=generate;this.fetcher=fetcher;this.clock=clock;this.running=null;
 }
 async enqueue(member){
  const now=this.clock(),joined=Date.parse(member?.joined_at),id=member?.user?.id;
  if(member?.guild_id!==WELCOME_TARGET.guild||member?.user?.bot||!/^\d{17,20}$/.test(id||'')||!Number.isFinite(joined)||joined>now+60000||now-joined>MAX_AGE)return false;
  const receipt=`memberWelcome:last:${id}`,key=PREFIX+id;
  const accepted=await this.storage.transaction(async tx=>{
   const last=await tx.get(receipt);if(last>=joined)return false;
   await tx.put(receipt,joined);
   await tx.put(key,{id,joined,created:now,name:cleanName(member.nick||member.user.global_name||member.user.username),status:'pending',attempts:0});
   return true;
  });
  if(accepted)this.flush();return accepted;
 }
 flush(){
  if(this.running||typeof this.storage.list!=='function')return this.running;
  this.running=this.drain().catch(e=>console.warn('member_welcome_failed',{reason:e.name})).finally(()=>{this.running=null;});
  this.host.ctx.waitUntil(this.running);return this.running;
 }
 async drain(){
  const jobs=await this.storage.list({prefix:PREFIX,limit:10});
  for(const [key,job]of jobs){
   const now=this.clock();
   if(now-job.created>MAX_AGE||job.status==='sending'){await this.storage.delete(key);continue;}
   if(job.retryAt>now)continue;
   if(!job.text){
    let text='';try{
     text=await this.generate(this.env,[{role:'user',parts:[{text:JSON.stringify({event:'new_member_join',displayName:job.name})}]}],'welcome');
    }catch(e){console.warn('member_welcome_generation_failed',{reason:e.name});}
    if((await this.storage.get(`memberWelcome:last:${job.id}`))!==job.joined)continue;
    job.text=welcomeText(text);job.status='ready';await this.storage.put(key,job);
   }
   // A rejoin may have superseded this job while generation was awaiting I/O.
   if((await this.storage.get(`memberWelcome:last:${job.id}`))!==job.joined)continue;
   const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${WELCOME_TARGET.guild}:${job.id}:${job.joined}`));
   const nonce=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
   job.status='sending';job.attempts++;await this.storage.put(key,job);
   try{
    const r=await this.fetcher(`https://discord.com/api/v10/channels/${WELCOME_TARGET.channel}/messages`,{
     method:'POST',headers:{Authorization:'Bot '+this.env.BOT_TOKEN,'Content-Type':'application/json'},
     body:JSON.stringify({content:`<@${job.id}> ${job.text}`,allowed_mentions:{parse:[],users:[job.id]},nonce,enforce_nonce:true}),signal:AbortSignal.timeout(10000)
    });
    if(r.status===429&&job.attempts<3){const data=await r.json().catch(()=>({}));job.status='ready';job.retryAt=this.clock()+Math.min(300000,Math.max(1000,Number(data.retry_after||60)*1000));if((await this.storage.get(key))?.joined===job.joined)await this.storage.put(key,job);continue;}
    if(!r.ok)console.warn('member_welcome_delivery_failed',{status:r.status});
   }catch(e){console.warn('member_welcome_delivery_unknown',{reason:e.name});}
   // Replayed events remain suppressed by the per-member joined timestamp.
   if((await this.storage.get(key))?.joined===job.joined)await this.storage.delete(key);
  }
 }
}
