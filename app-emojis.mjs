// Application-owned public emoji metadata; bot credentials never enter cache or responses.
export const cleanEmojis=items=>Array.isArray(items)?items.filter(e=>typeof e?.id==='string'&&/^\d{1,20}$/.test(e.id)&&/^[\p{L}\p{N}_]{2,32}$/u.test(e?.name||'')&&e.available!==false).map(e=>({id:e.id,name:e.name,animated:!!e.animated})).filter((e,n,a)=>a.findIndex(x=>x.id===e.id)===n).slice(0,2000):[];
export const emojiMarkup=e=>cleanEmojis([e]).length?`<${e.animated?'a':''}:${e.name}:${e.id}>`:'';
export const emojiImage=e=>cleanEmojis([e]).length?`https://cdn.discordapp.com/emojis/${e.id}.${e.animated?'gif':'png'}?size=96`:null;
export class AppEmojis {
 constructor(storage,env){this.storage=storage;this.env=env;}
 async get(now=Date.now()){
  const old=await this.storage.get('applicationEmojis')||{items:[],updatedAt:0,nextAt:0};
  if(old.nextAt>now)return old;
  try{if(!this.env.BOT_TOKEN||!/^\d+$/.test(this.env.DISCORD_APPLICATION_ID||''))throw Error('not configured');const r=await fetch(`https://discord.com/api/v10/applications/${this.env.DISCORD_APPLICATION_ID}/emojis`,{headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`},signal:AbortSignal.timeout(3000)});
   if(!r.ok){const data=r.status===429?await r.json().catch(()=>({})):{};const nextAt=now+Math.min(3600000,Math.max(60000,Math.ceil(Number(data.retry_after)*1000)||60000));const cached={...old,nextAt,status:'unavailable'};await this.storage.put('applicationEmojis',cached);return cached;}
   const data=await r.json();if(!Array.isArray(data.items))throw Error('invalid response');const value={items:cleanEmojis(data.items),updatedAt:now,nextAt:now+300000,status:'ok'};await this.storage.put('applicationEmojis',value);return value;
  }catch{const cached={...old,nextAt:now+60000,status:'unavailable'};await this.storage.put('applicationEmojis',cached);return cached;}
 }
}
export async function applicationCatalog(env){
 if(!env.TABLES)return {items:[],status:'unavailable'};
 try{const stub=env.TABLES.get(env.TABLES.idFromName('system-emojis'));const r=await stub.fetch('https://internal',{method:'POST',body:JSON.stringify({op:'appEmojis'})});if(!r.ok)throw Error('unavailable');const data=await r.json();return {...data,items:cleanEmojis(data.items)};}catch{return {items:[],status:'unavailable'};}
}
