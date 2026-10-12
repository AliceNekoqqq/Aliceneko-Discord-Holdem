import {validId,cleanText} from './tavern-catalog.mjs';

// Only a live member lookup in the order's guild may create a gift recipient.
// Neither a nickname nor model-produced data can supply account authority.
export async function verifyGiftRecipient(env,guild,id,payer,fetcher=fetch){
 if(!validId(guild)||!validId(id)||id===env.DISCORD_APPLICATION_ID)throw Error('请选择本服务器的一位真实成员。');
 if(id===payer)return {id,name:'自己',bot:false};
 const r=await fetcher(`https://discord.com/api/v10/guilds/${guild}/members/${id}`,{headers:{Authorization:'Bot '+env.BOT_TOKEN},signal:AbortSignal.timeout(4000)});
 if(!r.ok)throw Error('无法确认收礼人仍在本服务器，请重新选择。');
 const m=await r.json();
 if(String(m.user?.id)!==id||m.user.bot)throw Error('请选择本服务器的一位真实成员。');
 return {id,name:cleanText(m.nick||m.user.global_name||m.user.username,32)||'来客',bot:false};
}
