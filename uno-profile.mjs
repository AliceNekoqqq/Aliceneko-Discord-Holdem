// Public cosmetic profile only. Stored by user in the existing guild rankings DO.
export const AVATARS=Object.freeze({
 butterfly:{emoji:'🦋',name:'蝴蝶'},cat:{emoji:'🐱',name:'猫猫'},fox:{emoji:'🦊',name:'狐狸'},rabbit:{emoji:'🐰',name:'兔兔'},panda:{emoji:'🐼',name:'熊猫'},bear:{emoji:'🐻',name:'小熊'},wolf:{emoji:'🐺',name:'狼'},owl:{emoji:'🦉',name:'猫头鹰'},penguin:{emoji:'🐧',name:'企鹅'},frog:{emoji:'🐸',name:'青蛙'},flower:{emoji:'🌸',name:'樱花'},star:{emoji:'⭐',name:'星星'},ghost:{emoji:'👻',name:'小幽灵'},robot:{emoji:'🤖',name:'机器人'},moon:{emoji:'🌙',name:'月亮'},fire:{emoji:'🔥',name:'火焰'},unicorn:{emoji:'🦄',name:'独角兽'},octopus:{emoji:'🐙',name:'章鱼'}
});
export const ACCENTS=Object.freeze({rose:{name:'莓粉',color:[242,173,209],background:[70,41,59]},lavender:{name:'浅紫',color:[203,185,255],background:[53,44,77]},sky:{name:'晴空',color:[157,217,250],background:[35,59,77]},peach:{name:'蜜桃',color:[255,202,159],background:[77,52,39]},silver:{name:'月白',color:[224,230,239],background:[51,59,72]}});
export const normalizedProfile=p=>({avatar:Object.hasOwn(AVATARS,p?.avatar)?p.avatar:'butterfly',accent:Object.hasOwn(ACCENTS,p?.accent)?p.accent:'rose'});
export const avatarKey=p=>p?.bot?'robot':normalizedProfile(p).avatar;
export const avatarEmoji=p=>AVATARS[avatarKey(p)].emoji;
export class UnoProfiles {
 constructor(sql){this.sql=sql;sql.exec("CREATE TABLE IF NOT EXISTS uno_profiles (id TEXT PRIMARY KEY, avatar TEXT NOT NULL DEFAULT 'butterfly', accent TEXT NOT NULL DEFAULT 'rose')");}
 get(id){return normalizedProfile(this.sql.exec('SELECT avatar,accent FROM uno_profiles WHERE id=?',id).toArray()[0]);}
 set(id,key,value){if(!/^\d+$/.test(id||''))throw Error('请在服务器内打开自己的个人设置。');if(!['avatar','accent','reset'].includes(key))throw Error('请选择个人设置里的选项。');if(key==='reset'){this.sql.exec('DELETE FROM uno_profiles WHERE id=?',id);return this.get(id);}if(!Object.hasOwn(key==='avatar'?AVATARS:ACCENTS,value))throw Error('请选择列表里的形象或配色。');const old=this.get(id),p={...old,[key]:value};this.sql.exec('INSERT INTO uno_profiles (id,avatar,accent) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET avatar=excluded.avatar,accent=excluded.accent',id,p.avatar,p.accent);return p;}
 forPlayers(ids){if(!Array.isArray(ids)||ids.length>10)throw Error('无效座位列表。');return Object.fromEntries(ids.filter(id=>/^\d+$/.test(id)).map(id=>[id,this.get(id)]));}
}
export function profileData(profile,id,guild,notice=''){
 const p=normalizedProfile(profile),avatar=AVATARS[p.avatar],accent=ACCENTS[p.accent];const custom=action=>`v:${guild}:${id}:${action}`;
 return {content:`🎭 **我的牌桌形象**\n${notice?notice+'\n':''}当前形象：${avatar.emoji} ${avatar.name} · 名牌：${accent.name}\n选择后自动保存，在本服务器各 UNO 牌桌约15秒内同步；下次入座也会记住。\n👑 大王选择佩戴游戏称号后，头像加王冠、名牌变金色，保留自己的 emoji。`,components:[
  {type:1,components:[{type:3,custom_id:custom('avatar'),placeholder:'选一个座位 emoji',min_values:1,max_values:1,options:Object.entries(AVATARS).map(([value,a])=>({label:a.name,emoji:{name:a.emoji},value,default:value===p.avatar}))}]},
  {type:1,components:[{type:3,custom_id:custom('accent'),placeholder:'选择个人名牌配色',min_values:1,max_values:1,options:Object.entries(ACCENTS).map(([value,a])=>({label:a.name,value,default:value===p.accent}))}]},
  {type:1,components:[{type:2,custom_id:`r:${guild}:${id}:menu`,label:'👑 大王称号',style:2},{type:2,custom_id:custom('reset'),label:'恢复默认形象',style:2},{type:2,custom_id:custom('open'),label:'刷新设置',style:2}]}
 ],embeds:[{description:'Emoji artwork: [Twemoji](https://github.com/jdecked/twemoji) · [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)'}],attachments:[],allowed_mentions:{parse:[]}};
}
export const profileInteraction=i=>i.type===2&&i.data?.name==='uno'&&i.data.options?.[0]?.name==='个人设置'||i.type===3&&i.data?.custom_id?.startsWith('v:');
export async function answerProfile(env,i){
 const id=i.member?.user?.id;let action='open',value;
 if(i.type===3){const parts=i.data.custom_id.split(':');if(parts.length!==4||parts[1]!==i.guild_id||!['open','avatar','accent','reset'].includes(parts[3]))return {content:'🔄 请重新打开 `/uno 个人设置`。',components:[],allowed_mentions:{parse:[]}};
  action=parts[3];if(parts[2]!=='any'&&(parts[2]!==id||!(Number(i.message?.flags)&64))||parts[2]==='any'&&action!=='open')return {content:'🔒 请打开自己的个人设置，不能修改其他玩家。',components:[],allowed_mentions:{parse:[]}};
  value=i.data.values?.[0];if(['avatar','accent'].includes(action)&&i.data.values?.length!==1)return {content:'请选择一个形象或配色。',components:[],allowed_mentions:{parse:[]}};
 }
 try{const stub=env.TABLES.get(env.TABLES.idFromName(`uno-rank:${i.guild_id}`));const r=await stub.fetch('https://internal',{method:'POST',body:JSON.stringify({op:'unoRank',guild:i.guild_id,id,action:'profile',key:action,value})});if(!r.ok)throw Error('个人设置暂时繁忙，请重试。');const data=await r.json();if(data.error)throw Error(data.error);return profileData(data.profile,id,i.guild_id,action==='open'?'':'✅ 已保存，座位会自动更新。');}catch(e){return {content:`🦋 ${e.message}`,components:[],allowed_mentions:{parse:[]}};}
}
export async function finishProfile(env,i){const data=await answerProfile(env,i);try{await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${i.token}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});}catch{} }
