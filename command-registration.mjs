const endpoint=env=>`https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/commands`;
export async function commandInventory(env,fetcher=fetch){
 if(!env.BOT_TOKEN||!env.DISCORD_APPLICATION_ID)return {ok:false,status:0,names:[]};
 const r=await fetcher(endpoint(env),{headers:{Authorization:`Bot ${env.BOT_TOKEN}`},signal:AbortSignal.timeout(6000)});
 let data;try{data=await r.json();}catch{}
 const ok=r.ok&&Array.isArray(data);
 return {ok,status:r.status,names:ok?data.map(c=>String(c.name)).slice(0,100):[]};
}
export async function registerCommands(env,storage,commands,version,fetcher=fetch){
 if(!env.BOT_TOKEN)return {registered:false};
 if(await storage.get('commandVersion')===version)return {registered:true};
 const failures=[];
 await Promise.all(commands.map(async command=>{
  try{
   const r=await fetcher(endpoint(env),{method:'POST',headers:{Authorization:`Bot ${env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(6000)});
   if(!r.ok){let data;try{data=await r.json();}catch{}failures.push({name:command.name,status:r.status,code:data?.code||null,message:String(data?.message||'Discord rejected command').slice(0,160),fields:JSON.stringify(data?.errors||{}).slice(0,700)});}
  }catch(e){failures.push({name:command.name,status:0,message:e.name});}
 }));
 let inventory={ok:false,names:[]};try{inventory=await commandInventory(env,fetcher);}catch{}
 const missing=commands.map(c=>c.name).filter(name=>!inventory.names.includes(name));
 const registered=!failures.length&&inventory.ok&&!missing.length;
 const diagnostics={version,registered,failures,missing,checkedAt:Date.now()};
 await storage.put('commandDiagnostics',diagnostics);
 if(registered)await storage.put('commandVersion',version);else console.warn('discord_command_registration_failed',diagnostics);
 return {registered,missing,failures};
}
