import {cityRequest,validId,CITY_VERSION} from './city-service.mjs';
const kinds={public:'公共地点',tavern:'小酒馆',shop:'店铺',home:'住宅'};
const sub=(name,description,options)=>({type:1,name,description,...(options?{options}:{})});
export const cityCommand={name:'城市',description:'街道、地点与角色扮演地图',type:1,integration_types:[0],contexts:[0],options:[
 sub('地图','查看你可以访问的已登记地点',[{type:4,name:'页码',description:'地图页码，每页20个地点',min_value:1,max_value:10}]),sub('地点','查看当前频道的地点与场景'),sub('位置','查看自己的角色位置'),sub('进入','进入当前地点，或指定一个已登记频道',[{type:7,name:'频道',description:'要进入的地点频道',channel_types:[0,5]}]),sub('离开','结束当前角色场景'),
 sub('绑定','管理员：将当前频道登记为城市地点',[
 {type:3,name:'名称',description:'地点名称',required:true,max_length:80},{type:3,name:'街道',description:'所属街道名称',required:true,max_length:80},
 {type:3,name:'类型',description:'地点类型',choices:Object.entries(kinds).map(([value,name])=>({name,value}))},{type:3,name:'描述',description:'地点外观、用途等背景资料',max_length:600}]),
 sub('解绑','管理员：移除当前频道的地点登记',[{type:5,name:'确认',description:'确认移除登记（不会删除Discord频道）',required:true}])
]};
export const cityInteraction=i=>i.type===2&&i.data?.name==='城市';
export function canManage(member){try{return (BigInt(member?.permissions||'0')&40n)!==0n;}catch{return false;}}
export function canView(channel,guild,member,roles){
 if(!Array.isArray(member?.roles))return false;
 const mine=new Set([guild,...member.roles]),owner=member.user?.id;
 let p=0n;try{
  for(const role of roles)if(mine.has(role.id))p|=BigInt(role.permissions);
  if(p&8n)return true;
  const changes=channel.permission_overwrites||[];
  const apply=o=>{if(o)p=(p&~BigInt(o.deny||'0'))|BigInt(o.allow||'0');};
  apply(changes.find(o=>o.id===guild));let deny=0n,allow=0n;
  for(const o of changes)if(Number(o.type)===0&&o.id!==guild&&mine.has(o.id)){deny|=BigInt(o.deny||'0');allow|=BigInt(o.allow||'0');}
  p=(p&~deny)|allow;apply(changes.find(o=>Number(o.type)===1&&o.id===owner));return Boolean(p&1024n);
 }catch{return false;}
}
async function discord(env,path){
 const r=await fetch(`https://discord.com/api/v10${path}`,{headers:{Authorization:`Bot ${env.BOT_TOKEN}`},signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw Error('无法读取频道资料，请检查机器人频道权限后重试。');return r.json();
}
export async function resolveCityChannel(env,guild,channel){
 const c=await discord(env,`/channels/${channel}`);if(String(c.guild_id)!==guild)throw Error('请使用本服务器的频道。');
 if(![0,5,10,11,12].includes(c.type))throw Error('请在文字频道或文字子区使用城市功能。');
 return {channel:c.id,parent:[10,11,12].includes(c.type)?c.parent_id:null,thread:[10,11,12].includes(c.type)};
}
async function visiblePlaces(env,i,places){
 const [channels,roles,guild]=await Promise.all([discord(env,`/guilds/${i.guild_id}/channels`),discord(env,`/guilds/${i.guild_id}/roles`),discord(env,`/guilds/${i.guild_id}`)]);
 return places.filter(p=>{const c=channels.find(c=>c.id===p.channelId);return c&&(guild.owner_id===i.member.user.id||canView(c,i.guild_id,i.member,roles));});
}
const answer=content=>({content,flags:64,allowed_mentions:{parse:[]}});
export async function cityData(env,i){
 const guild=String(i.guild_id||''),user=String(i.member?.user?.id||''),channel=String(i.channel_id||'');
 if(!validId(guild)||!validId(user)||!validId(channel)||i.member.user.bot)throw Error('请在服务器内使用城市功能。');
 const s=i.data.options?.[0],action=s?.name,opts=Object.fromEntries((s?.options||[]).map(o=>[o.name,o.value]));
 if(['绑定','解绑'].includes(action)&&!canManage(i.member))throw Error('登记地点需要「管理服务器」权限。');
 if(action==='绑定'){
  const resolved=await resolveCityChannel(env,guild,channel);if(resolved.thread)throw Error('请在主文字频道登记地点；子区会继承该地点并拥有独立场景。');
  const p=await cityRequest(env,guild,{action:'bind',place:{channelId:channel,name:opts['名称'],street:opts['街道'],kind:opts['类型']||'public',description:opts['描述']}});
  return answer(`已登记：**${p.street} · ${p.name}**\n类型：${kinds[p.kind]}\n${p.description||'可以再次使用绑定命令补充地点描述。'}\n玩家可用 /城市 地点 或 /城市 进入 开始场景。`);
 }
 if(action==='解绑'){if(opts['确认']!==true)throw Error('未移除，请将确认选项设为是。');await cityRequest(env,guild,{action:'unbind',channel});await cityRequest(env,guild,{action:'clear',placeId:channel});return answer('已移除当前频道的地点登记。');}
 if(action==='离开'){await cityRequest(env,guild,{action:'leave',user});return answer('你已离开当前角色场景。再次在已登记地点 @红豆粉或使用 /城市 进入，可以继续。');}
 const config=await cityRequest(env,guild,{action:'config'});
 if(action==='地图'){
  const visible=await visiblePlaces(env,i,Object.values(config.places));if(!visible.length)return answer('目前没有你可以访问的已登记地点。管理员可在地点频道使用 /城市 绑定。');
  const page=Math.min(Math.max(1,Number(opts['页码'])||1),Math.ceil(visible.length/20));
  const groups=new Map();for(const p of visible.slice((page-1)*20,page*20)){if(!groups.has(p.street))groups.set(p.street,[]);groups.get(p.street).push(p);}
  const lines=[`**城市地图 · ${CITY_VERSION} · ${page}/${Math.ceil(visible.length/20)}页**`];for(const [street,ps]of groups){lines.push(`\n**${street}**`);for(const p of ps)lines.push(`· <#${p.channelId}> — ${p.name}（${kinds[p.kind]}）`);}
  // Page at 20 locations so the sum of all embeds stays below Discord's 6000-char limit.
  const chunks=[];let chunk='';for(const line of lines){if((chunk+'\n'+line).length>3500){chunks.push(chunk);chunk='';}chunk+=(chunk?'\n':'')+line;}if(chunk)chunks.push(chunk);
  return {...answer('选择频道后，使用 /城市 进入 开始场景。'),embeds:chunks.map(description=>({description,color:0x9275ab}))};
 }
 if(action==='位置'){
  const p=await cityRequest(env,guild,{action:'position',user});if(!p)return answer('你目前没有角色位置。去一个已登记地点使用 /城市 进入。');
  const place=config.places[p.placeId];const visible=await visiblePlaces(env,i,[place]);if(!visible.length)return answer('原地点已不可访问，请进入一个新的地点。');
  return answer(`角色位置：**${place.street} · ${place.name}**\n${p.status==='away'?'暂离（30分钟未互动）':'正在场景中'}\n所在地点：<#${p.placeId}>${p.sceneId!==p.placeId?'\n场景在该地点的子区内。':''}`);
 }
 if(!['进入','地点'].includes(action))throw Error('请使用城市命令的一个子功能。');
 const target=String(opts['频道']||channel);if(target!==channel){const p=config.places[target];if(!p||!(await visiblePlaces(env,i,[p])).length)throw Error('目标地点未登记或你无权访问。');}
 const resolved=await resolveCityChannel(env,guild,target),place=config.places[resolved.channel]||config.places[resolved.parent];if(!place)return answer('这个频道尚未登记为城市地点。管理员可以使用 /城市 绑定。');
 if(action==='进入')await cityRequest(env,guild,{action:'context',...resolved,user});
 return answer(`**${place.street} · ${place.name}**\n${place.description||'此地点暂未填写场景描述。'}\n${resolved.thread?'当前子区是该地点内的独立场景。\n':''}${action==='进入'?'已更新你的角色位置。\n':''}地点：<#${place.channelId}>\n在这里 @红豆粉时，会使用当前地点的背景；店铺类型登记暂不自动开通新商品或店员。`);
}
export async function finishCity(env,i){
 let data;try{data=await cityData(env,i);}catch(e){data=answer(e.message||'城市功能暂时不可用，请重试。');}
 const r=await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${i.token}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});
 if(!r.ok)console.warn('city_panel_delivery_failed',{status:r.status});
}
export async function cityChatContext(env,message){
 if(!env?.TABLES)return null;
 const guild=String(message.guild_id),channel=String(message.channel_id);
 const config=await cityRequest(env,guild,{action:'config'});
 if(!Object.keys(config?.places||{}).length)return null;
 const resolved=config.places[channel]?{channel,parent:null}:await resolveCityChannel(env,guild,channel);
 return cityRequest(env,guild,{action:'context',...resolved,user:String(message.author.id)});
}
