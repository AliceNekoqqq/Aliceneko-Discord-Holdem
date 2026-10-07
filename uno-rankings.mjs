import {applicationCatalog} from './app-emojis.mjs';
import {UnoProfiles} from './uno-profile.mjs';
// Guild-wide, durable and idempotent UNO standings. No private card data enters this store.
const clean=s=>String(s||'玩家').replace(/[\x00-\x1f\\`*_~>|\[\]]/g,'').slice(0,24);
const order='wins DESC, CAST(wins AS REAL)/played DESC, last_win ASC, id ASC';
export const wearsCrown=(t,id,now=Date.now())=>t.crown?.id===id&&t.crown?.choice==='title'&&t.crown.validUntil>now;
export function rankedRound(result){return !!result&&['round','match','teams'].includes(result.mode)&&Array.isArray(result.players)&&result.players.length>=2&&result.players.length<=10&&result.players.every(p=>!p.bot&&/^\d+$/.test(p.id))&&new Set(result.players.map(p=>p.id)).size===result.players.length&&result.players.some(p=>p.won&&!p.surrendered);}
export class UnoRankings {
 constructor(storage,env){this.storage=storage;this.sql=storage.sql;this.env=env;this.profiles=new UnoProfiles(this.sql);
  this.sql.exec('CREATE TABLE IF NOT EXISTS uno_results (id TEXT PRIMARY KEY, at INTEGER NOT NULL)');
  this.sql.exec("CREATE TABLE IF NOT EXISTS uno_stats (id TEXT PRIMARY KEY, name TEXT NOT NULL, wins INTEGER NOT NULL DEFAULT 0, played INTEGER NOT NULL DEFAULT 0, forfeits INTEGER NOT NULL DEFAULT 0, last_win INTEGER NOT NULL DEFAULT 0, choice TEXT NOT NULL DEFAULT 'none')");
 }
 leader(){return this.sql.exec(`SELECT * FROM uno_stats WHERE wins>0 ORDER BY ${order} LIMIT 1`).toArray()[0]||null;}
 crown(){const p=this.leader();return p?{id:p.id,choice:p.choice,validUntil:Date.now()+45000}:null;}
 async record(guild,r){
  if(!rankedRound(r)||r.guild!==guild||!/^[-a-zA-Z0-9]+:\d+$/.test(r.id||'')||!Number.isSafeInteger(r.at))return {counted:false,crown:this.crown()};
  let counted=false;
  this.storage.transactionSync(()=>{
   if(this.sql.exec('SELECT id FROM uno_results WHERE id=?',r.id).toArray().length)return;
   this.sql.exec('INSERT INTO uno_results (id,at) VALUES (?,?)',r.id,r.at);
   for(const p of r.players){const win=p.won&&!p.surrendered?1:0;this.sql.exec(`INSERT INTO uno_stats (id,name,wins,played,forfeits,last_win) VALUES (?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, wins=uno_stats.wins+excluded.wins, played=uno_stats.played+1, forfeits=uno_stats.forfeits+excluded.forfeits, last_win=CASE WHEN excluded.wins=1 THEN MAX(uno_stats.last_win,excluded.last_win) ELSE uno_stats.last_win END`,p.id,clean(p.name),win,p.surrendered?1:0,win?r.at:0);}
   counted=true;
  });
  if(counted)await this.scheduleRole(guild);
  return {counted,crown:this.crown()};
 }
 async scheduleRole(guild){await this.storage.put('rankGuild',guild);await this.storage.setAlarm(Date.now()+1);}
 async view(id){const top=this.sql.exec(`SELECT * FROM uno_stats ORDER BY ${order} LIMIT 10`).toArray();const mine=this.sql.exec(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY ${order}) AS rank FROM uno_stats) WHERE id=?`,id).toArray()[0]||null;return {top,mine,leader:this.leader(),role:await this.storage.get('unoRole')||{}};}
 async equip(guild,id,choice){if(!['none','title','role'].includes(choice))throw Error('请选择称号菜单里的选项。');if(this.leader()?.id!==id)throw Error('👑 只有当前排行榜第一名可以佩戴；再赢几局，王冠就在前面！');this.sql.exec('UPDATE uno_stats SET choice=? WHERE id=?',choice,id);await this.scheduleRole(guild);await this.reconcile(guild,true);return this.view(id);}
 async api(path,method,body){const r=await fetch(`https://discord.com/api/v10${path}`,{method,headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});if(!r.ok){const e=Error([401,403].includes(r.status)?'身份组操作被拒绝：请检查 bot 的管理身份组权限及角色层级。':r.status===404?'身份组或成员已不存在，请重试。':'Discord 暂时繁忙，稍后自动重试。');e.status=r.status;e.permanent=[401,403].includes(r.status);throw e;}return r.status===204?null:r.json();}
 async reconcile(guild,force=false){
  const state=await this.storage.get('unoRole')||{},leader=this.leader(),desired=leader?.choice==='role'?leader.id:null;
  if(state.holder===desired&&(!desired||state.id&&state.renamed&&state.assigned)){if(state.error){state.error=null;await this.storage.put('unoRole',state);}await this.storage.deleteAlarm();return;}
  if(state.blocked&&!force){await this.storage.deleteAlarm();return;}
  try{
   // Remove the old king first. Never grant a second holder if removal fails.
   if(state.holder&&state.holder!==desired){try{await this.api(`/guilds/${guild}/members/${state.holder}/roles/${state.id}`,'DELETE');}catch(e){if(!e.message.includes('已不存在'))throw e;}state.holder=null;state.assigned=false;await this.storage.put('unoRole',state);}
   if(desired){
    if(!state.id){
     // A unique provisional name makes a timed-out POST recoverable without creating duplicates.
     if(!state.creationName){state.creationName=`UNO 大王 · ${crypto.randomUUID().slice(0,8)}`;state.postAttempted=false;await this.storage.put('unoRole',state);}
     if(state.postAttempted){const roles=await this.api(`/guilds/${guild}/roles`,'GET');const found=roles.find(r=>r.name===state.creationName&&String(r.permissions)==='0'&&!r.managed);if(!found)throw Error('身份组创建结果待确认，请稍后重试。');state.id=found.id;}
     else {state.postAttempted=true;await this.storage.put('unoRole',state);try{const role=await this.api(`/guilds/${guild}/roles`,'POST',{name:state.creationName,permissions:'0',color:0xFFD166,mentionable:false,hoist:false});state.id=role.id;}catch(e){if(e.status>=400&&e.status<500)state.postAttempted=false;throw e;}}
     await this.storage.put('unoRole',state);
    }
    if(!state.renamed){await this.api(`/guilds/${guild}/roles/${state.id}`,'PATCH',{name:'UNO 大王'});state.renamed=true;await this.storage.put('unoRole',state);}
    state.holder=desired;state.assigned=false;await this.storage.put('unoRole',state);
    await this.api(`/guilds/${guild}/members/${desired}/roles/${state.id}`,'PUT');state.assigned=true;
   }
   state.error=null;state.blocked=false;state.retries=0;await this.storage.put('unoRole',state);await this.storage.deleteAlarm();
  }catch(e){state.error=e.message;state.blocked=!!e.permanent;state.retries=(state.retries||0)+1;await this.storage.put('unoRole',state);if(state.blocked)await this.storage.deleteAlarm();else await this.storage.setAlarm(Date.now()+Math.min(300000,5000*2**Math.min(state.retries,6)));}
 }
 async dispatch(payload){const {guild,action,id}=payload;if(!/^\d+$/.test(guild||''))throw Error('无效服务器。');await this.storage.put('rankGuild',guild);if(action==='record')return this.record(guild,payload.result);if(action==='crown'){const profiles=this.profiles.forPlayers(payload.ids||[]),catalog=await applicationCatalog(this.env);for(const p of Object.values(profiles)){p.appEntrance=catalog.items.find(e=>e.id===p.entranceApp)||null;p.appVictory=catalog.items.find(e=>e.id===p.victoryApp)||null;}return {crown:this.crown(),profiles};}if(action==='profile'){const catalog=await applicationCatalog(this.env),parts=String(payload.key).match(/^(app|set)~(entranceApp|victoryApp)~(\d+)$/);const key=parts?.[1]==='set'?parts[2]:payload.key;const profile=payload.key==='open'||parts?.[1]==='app'?this.profiles.get(id):this.profiles.set(id,key,payload.value,catalog.items);return {profile,catalog:catalog.items,catalogStatus:catalog.status};}if(action==='equip')return this.equip(guild,id,payload.choice);return this.view(id);}
}
const mentions={parse:[]};
const choiceText=choice=>({none:'暂不佩戴',title:'👑 游戏称号',role:'👑 Discord 身份组'})[choice]||'暂不佩戴';
export function rankingData(data,id,guild,menu=false){
 const leader=data.leader,mine=data.mine;
 const lines=data.top.map((p,n)=>`${['🥇','🥈','🥉'][n]||`${n+1}.`} **${clean(p.name)}** · ${p.wins} 胜 / ${p.played-p.wins} 负 · ${Math.round(100*p.wins/p.played)}%`);
 const content=menu?`👑 **UNO 大王 · 王冠衣帽间**\n${leader?`当前第一名：**${clean(leader.name)}** · ${leader.wins} 胜\n佩戴选择：${choiceText(leader.choice)}`:'王冠虚位以待，先赢下一局真人对战吧！'}${leader?.id!==id?'\n只有当前第一名可选择佩戴。':''}`:`🏆 **本服务器 UNO 排行榜**\n${lines.join('\n')||'还没有战绩，约朋友来争第一吧！'}\n\n${mine?`🦋 你排第 **${mine.rank}**：${mine.wins} 胜 / ${mine.played-mine.wins} 负 · 认输 ${mine.forfeits} 次`:'🦋 你还没有计入榜单的对局。'}\n👑 ${leader?`现任大王：**${clean(leader.name)}** · ${choiceText(leader.choice)}`:'首胜即有机会戴上王冠！'}\n\n只累计本版本起、全真人的已完成局；认输计负场，2v2 未认输胜队各记一胜。按胜场、胜率、较早达成该胜场排序。`;
 const button=(action,label,style=2)=>({type:2,custom_id:`r:${guild}:${menu?id:'any'}:${action}`,label,style});
 const components=[{type:1,components:menu&&leader?.id===id?[button('title','👑 佩戴游戏称号',1),button('role','👑 领取身份组',1),button('none','收起王冠'),button('menu','刷新')]:[button('view','🏆 刷新排行榜'),button('menu','👑 我的称号',1)]}];
 return {content:content+(menu&&leader?.choice==='role'?`\n${data.role.holder===leader.id&&data.role.assigned?'✅ UNO 大王身份组已佩戴。':data.role.error?`⚠️ ${data.role.error} 可点「领取身份组」重试，或改选游戏称号。`:'⏳ 身份组正在同步；bot 需有管理身份组权限，且该身份组低于 bot 最高角色。'}`:data.role.error&&data.role.holder?`\n⚠️ 旧大王身份组尚未收回：${data.role.error}`:''),components,allowed_mentions:mentions};
}
export function rankingInteraction(i){return i.type===2&&i.data?.name==='uno'&&['排行榜','称号'].includes(i.data.options?.[0]?.name)||i.type===3&&i.data?.custom_id?.startsWith('r:');}
export async function answerRanking(env,i){
 let action=i.data.options?.[0]?.name==='称号'?'menu':'view',bound='any';const id=i.member?.user?.id;
 if(i.type===3){const parts=i.data.custom_id.split(':');if(parts.length!==4||parts[1]!==i.guild_id||!['view','menu','title','role','none'].includes(parts[3]))return {content:'🔄 请重新打开 `/uno 排行榜`。',components:[],allowed_mentions:mentions};bound=parts[2];action=parts[3];if(bound!=='any'&&(bound!==id||!(Number(i.message?.flags)&64)))return {content:'🔒 请打开自己的 `/uno 称号`。',components:[],allowed_mentions:mentions};if(['title','role','none'].includes(action)&&bound!==id)return {content:'请使用自己的称号菜单。',allowed_mentions:mentions};}
 const stub=env.TABLES.get(env.TABLES.idFromName(`uno-rank:${i.guild_id}`));
 try{const r=await stub.fetch('https://internal',{method:'POST',body:JSON.stringify({op:'unoRank',guild:i.guild_id,id,action:['title','role','none'].includes(action)?'equip':'view',choice:action})});if(!r.ok)throw Error('排行榜暂时繁忙，请重试。');const data=await r.json();if(data.error)throw Error(data.error);return rankingData(data,id,i.guild_id,action!=='view');}catch(e){return {content:`🦋 ${e.message}`,components:[],allowed_mentions:mentions};}
}
export async function finishRanking(env,i){const data=await answerRanking(env,i);try{await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${i.token}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});}catch{} }
