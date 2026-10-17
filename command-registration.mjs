const endpoint=env=>`https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/commands`;
export async function commandInventory(env,fetcher=fetch,definitions=false){
 if(!env.BOT_TOKEN||!env.DISCORD_APPLICATION_ID)return {ok:false,status:0,names:[]};
 const r=await fetcher(endpoint(env),{headers:{Authorization:`Bot ${env.BOT_TOKEN}`},signal:AbortSignal.timeout(6000)});
 let data;try{data=await r.json();}catch{}
 const ok=r.ok&&Array.isArray(data);
 return {ok,status:r.status,names:ok?data.map(c=>String(c.name)).slice(0,100):[],...(definitions&&ok?{definitions:data}:{})};
}
// Compare only desired fields: Discord adds IDs, versions and optional defaults.
function project(expected,actual){
 if(Array.isArray(expected))return Array.isArray(actual)?actual.map((v,n)=>project(expected[n],v)):actual;
 if(expected&&typeof expected==='object')return Object.fromEntries(Object.entries(expected).map(([k,v])=>{const remote=actual?.[k];if((k==='type'&&v===1&&remote==null)||(k==='required'&&v===false&&remote==null))return [k,v];return [k,project(v,remote)];}));
 return actual;
}
export const sameCommand=(desired,actual)=>Boolean(actual)&&JSON.stringify(desired)===JSON.stringify(project(desired,actual));
export async function registerCommands(env,storage,commands,version,fetcher=fetch){
 if(!env.BOT_TOKEN)return {registered:false};
 if(await storage.get('commandVersion')===version)return {registered:true};
 const previous=await storage.get('commandDiagnostics');
 if(previous?.retryAt>Date.now())return {registered:false,retryAt:previous.retryAt};
 const initial=await commandInventory(env,fetcher,true);
 if(!initial.ok)return {registered:false};
 const pending=commands.filter(c=>!sameCommand(c,initial.definitions.find(d=>d.name===c.name&&(d.type||1)===(c.type||1))));
 pending.sort((a,b)=>Number(b.name==='城市')-Number(a.name==='城市'));
 const failures=[];let retryAt=0;
 // Bound requests and runtime; unchanged commands never consume write quota.
 for(const command of pending.slice(0,2)){
  try{
   const r=await fetcher(endpoint(env),{method:'POST',headers:{Authorization:`Bot ${env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(6000)});
   if(!r.ok){let data;try{data=await r.json();}catch{}failures.push({name:command.name,status:r.status,code:data?.code||null,message:String(data?.message||'Discord rejected command').slice(0,160),fields:JSON.stringify(data?.errors||{}).slice(0,700)});
    if(r.status===429){retryAt=Date.now()+Math.max(60000,Math.ceil(Number(data?.retry_after||r.headers.get('Retry-After')||60)*1000));break;}
   }
  }catch(e){failures.push({name:command.name,status:0,message:e.name});}
 }
 let inventory=initial;try{if(pending.length)inventory=await commandInventory(env,fetcher,true);}catch{}
 const missing=commands.map(c=>c.name).filter(name=>!inventory.names.includes(name));
 const changed=commands.filter(c=>!sameCommand(c,inventory.definitions?.find(d=>d.name===c.name&&(d.type||1)===(c.type||1)))).map(c=>c.name);
 const registered=!failures.length&&inventory.ok&&!missing.length&&!changed.length;
 const diagnostics={version,registered,failures,missing,pending:changed,retryAt,checkedAt:Date.now()};
 await storage.put('commandDiagnostics',diagnostics);
 if(registered)await storage.put('commandVersion',version);else console.warn('discord_command_registration_failed',diagnostics);
 return {registered,missing,failures,retryAt};
}
