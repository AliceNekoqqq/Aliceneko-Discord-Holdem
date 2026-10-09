import {validId} from './tavern-catalog.mjs';

// Adoption claims are isolated by guild, matching the guild-scoped pet profile.
// The former global key is intentionally left untouched for compatibility.
export async function dispatchPetHome(storage,p){
 if(!validId(p.id)||!validId(p.guild))throw Error('请在服务器内打开自己的伙伴。');
 const owner=await storage.get('petRegistryOwner');
 let guild=await storage.get('petHomeGuild');
 if(Boolean(owner)!==Boolean(guild))throw Error('伙伴归属不匹配。');
 if(owner&&owner!==p.id)throw Error('伙伴归属不匹配。');
 if(guild&&guild!==p.guild)throw Error('伙伴服务器归属不匹配。');
 if(p.claim===true&&!owner&&!guild){await storage.put({petRegistryOwner:p.id,petHomeGuild:p.guild});guild=p.guild;}
 return {guild:guild||null};
}
export async function petHomeRequest(env,{id,guild,claim=false}){
 if(!validId(id)||!validId(guild))throw Error('请在服务器内打开自己的伙伴。');
 const stub=env.TABLES.get(env.TABLES.idFromName(`pet-owner:${guild}:${id}`));
 const response=await stub.fetch('https://internal',{method:'POST',body:JSON.stringify({op:'petHome',id,guild,claim:claim===true})});
 if(!response.ok)throw Error('伙伴归属暂时无法读取，请稍后重试。');
 const data=await response.json();if(data.error)throw Error(data.error);return data;
}
