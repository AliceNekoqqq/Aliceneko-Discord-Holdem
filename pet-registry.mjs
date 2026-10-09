import {validId} from './tavern-catalog.mjs';

// One stable user object owns the immutable adoption-home claim. Guild wallets
// remain separate; cross-guild UI cannot create another pet or another budget.
export async function dispatchPetHome(storage,p){
 if(!validId(p.id)||!validId(p.guild))throw Error('请在服务器内打开自己的伙伴。');
 const owner=await storage.get('petRegistryOwner');
 if(owner&&owner!==p.id)throw Error('伙伴归属不匹配。');
 let guild=await storage.get('petHomeGuild');
 if(p.claim===true&&!guild){await storage.put({petRegistryOwner:p.id,petHomeGuild:p.guild});guild=p.guild;}
 return {guild:guild||null};
}
export async function petHomeRequest(env,{id,guild,claim=false}){
 if(!validId(id)||!validId(guild))throw Error('请在服务器内打开自己的伙伴。');
 const stub=env.TABLES.get(env.TABLES.idFromName(`pet-owner:${id}`));
 const response=await stub.fetch('https://internal',{method:'POST',body:JSON.stringify({op:'petHome',id,guild,claim:claim===true})});
 if(!response.ok)throw Error('伙伴归属暂时无法读取，请稍后重试。');
 const data=await response.json();if(data.error)throw Error(data.error);return data;
}
