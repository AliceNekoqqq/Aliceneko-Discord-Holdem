import {UnoRankings,rankedRound} from './uno-rankings.mjs';
import {DECIDE_MS} from './ghost-engine.mjs';
const validId=s=>/^\d+$/.test(s||'');
const clean=s=>String(s||'玩家').replace(/[\x00-\x1f\\`*_~>|\[\]]/g,'').slice(0,24);
export class GhostService {
 constructor(host){this.host=host;this.storage=host.ctx.storage;this.env=host.env;this.rank=new UnoRankings(this.storage,this.env,{roleKey:'ghostRole',roleName:'👻鬼王',roleColor:0xa58bff});}
 async api(path,method='GET',body){const r=await fetch(`https://discord.com/api/v10${path}`,{method,headers:{Authorization:`Bot ${this.env.BOT_TOKEN}`,'Content-Type':'application/json','X-Audit-Log-Reason':encodeURIComponent('抽鬼牌临时昵称惩罚 / 自动恢复')},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(3500)});if(!r.ok){const e=Error(r.status===403?'机器人无法修改这位玩家的昵称：请检查管理昵称权限及身份组层级。':r.status===404?'这位玩家已离开服务器。':'Discord 暂时繁忙，请稍后重试。');e.status=r.status;throw e;}return r.status===204?null:r.json();}
 async record(guild,result){if(!rankedRound(result)||result.guild!==guild||result.players?.length!==2||result.players.filter(p=>p.won).length!==1||!/^[-a-zA-Z0-9]+:1$/.test(result.id||'')||!Number.isSafeInteger(result.at))throw Error('无效结果。');const recorded=await this.rank.record(guild,result);for(const p of result.players)this.rank.sql.exec("UPDATE uno_stats SET choice='role' WHERE id=?",p.id);
 const records=await this.storage.get('ghostPenalties')||{};
 if(!records[result.id]&&result.at+DECIDE_MS>Date.now()){records[result.id]={id:result.id,winner:result.players.find(p=>p.won).id,loser:result.players.find(p=>!p.won).id,until:result.at+DECIDE_MS,status:'pending'};await this.storage.put('ghostPenalties',records);}
 await this.storage.put('ghostGuild',guild);await this.queueRole();await this.arm();return recorded;
 }
 async queueRole(force=false){const role=await this.storage.get('ghostRole')||{},leader=this.rank.leader(),desired=leader?.choice==='role'?leader.id:null;
 const settled=(role.holder??null)===desired&&(!desired||role.id&&role.renamed&&role.assigned);
 if(settled&&!role.error||role.blocked&&!force){await this.storage.delete('ghostRoleDue');await this.storage.delete('ghostRoleForce');return;}
 // Existing retries keep their backoff; only an explicit refresh can force permission recovery.
 if(force){await this.storage.put('ghostRoleForce',true);await this.storage.put('ghostRoleDue',Date.now());}
 else if(!await this.storage.get('ghostRoleDue'))await this.storage.put('ghostRoleDue',Date.now());
 }
 async arm(){const records=await this.storage.get('ghostPenalties')||{},dates=[];for(const p of Object.values(records)){if(p.status==='pending')dates.push(p.until);if(['applying','active','restoring'].includes(p.status))dates.push(p.retryAt||p.restoreAt);}
 const roleDue=await this.storage.get('ghostRoleDue');if(roleDue)dates.push(roleDue);if(dates.length)await this.storage.setAlarm(Math.max(Date.now()+1,Math.min(...dates)));else await this.storage.deleteAlarm();}
 async submit(guild,id,resultId,nickname){const records=await this.storage.get('ghostPenalties')||{},p=records[resultId];
 if(!p||p.winner!==id)throw Error('只有本局胜者可以给本局输家指定昵称。');if(p.status!=='pending')throw Error(p.status==='expired'?'惩罚已过期。':'本局改名已提交，不能重复使用。');if(p.until<=Date.now()){p.status='expired';await this.storage.put('ghostPenalties',records);await this.arm();throw Error('3 分钟思考时间已到，惩罚过期。');}
 const nick=String(nickname||'').trim();if(!nick||nick.length>32||/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(nick))throw Error('请输入 1～32 字的正常昵称。');
 if(Object.values(records).some(q=>q.id!==p.id&&q.loser===p.loser&&['applying','active','restoring'].includes(q.status)))throw Error('输家已有昵称惩罚正在生效，暂时不能叠加；可在思考期限内重试。');
 const member=await this.api(`/guilds/${guild}/members/${p.loser}`);
 // Recheck the deadline after network I/O, then persist recovery intent BEFORE PATCH.
 if(p.until<=Date.now())throw Error('3 分钟思考时间已到，惩罚过期。');p.original=member.nick??null;p.nickname=nick;p.status='applying';p.startedAt=Date.now();p.restoreAt=p.startedAt+300000;p.retryAt=Date.now()+3000;
 await this.storage.put('ghostPenalties',records);await this.storage.put('ghostGuild',guild);await this.arm();
 try{await this.api(`/guilds/${guild}/members/${p.loser}`,'PATCH',{nick});p.status='active';delete p.retryAt;await this.storage.put('ghostPenalties',records);await this.arm();return `🎭 已为输家设置昵称「${nick}」，5 分钟后自动恢复。`;}
 catch(e){p.error=e.message;if(e.status===403||e.status===404||e.status===400){p.status='failed';delete p.retryAt;}await this.storage.put('ghostPenalties',records);await this.arm();throw e;}
 }
 async alarm(guild){const now=Date.now(),records=await this.storage.get('ghostPenalties')||{},before=JSON.stringify(records);for(const p of Object.values(records)){
 if(p.status==='pending'&&p.until<=now){p.status='expired';continue;}
 if(!['applying','active','restoring'].includes(p.status)||(p.retryAt||p.restoreAt)>now)continue;
 try{const member=await this.api(`/guilds/${guild}/members/${p.loser}`);
 if(p.status==='applying'&&p.restoreAt>now){if(member.nick!==p.nickname)await this.api(`/guilds/${guild}/members/${p.loser}`,'PATCH',{nick:p.nickname});p.status='active';delete p.retryAt;}
 else {p.status='restoring';await this.storage.put('ghostPenalties',records);if(member.nick===p.nickname)await this.api(`/guilds/${guild}/members/${p.loser}`,'PATCH',{nick:p.original});p.status=member.nick===p.nickname?'restored':'externally_changed';delete p.retryAt;}
 delete p.error;delete p.retries;
 }catch(e){p.error=e.message;if(e.status===404){p.status='left';delete p.retryAt;}else {p.retries=(p.retries||0)+1;p.retryAt=Date.now()+Math.min(900000,Math.max([401,403].includes(e.status)?300000:60000,60000*2**Math.min(p.retries-1,4)));}}
 }
 // Retain live recovery tasks; retired decisions need no private nickname history.
 for(const [id,p]of Object.entries(records))if(!['pending','applying','active','restoring'].includes(p.status)&&p.until<now-3600000)delete records[id];
 if(JSON.stringify(records)!==before)await this.storage.put('ghostPenalties',records);
 const roleDue=await this.storage.get('ghostRoleDue');
 if(roleDue&&roleDue<=Date.now()){
 const force=!!await this.storage.get('ghostRoleForce');await this.storage.delete('ghostRoleForce');
 const {retryAt}=await this.rank.reconcile(guild,force);
 if(retryAt)await this.storage.put('ghostRoleDue',retryAt);else await this.storage.delete('ghostRoleDue');
 }
 await this.arm();
 }
 async dispatch(p){if(!validId(p.guild))throw Error('无效服务器。');if(await this.storage.get('ghostGuild')!==p.guild)await this.storage.put('ghostGuild',p.guild);if(p.action==='record')return this.record(p.guild,p.result);if(p.action==='submit')return {content:await this.submit(p.guild,p.id,p.resultId,p.nickname)};await this.queueRole(true);await this.arm();return this.rank.view(p.id);}
}
export const serviceStub=(env,guild)=>env.TABLES.get(env.TABLES.idFromName(`ghost-rank:${guild}`));
export function specialInteraction(i){return i.type===2&&i.data?.name==='抽鬼牌'&&i.data.options?.[0]?.name==='排行榜'||i.type===5&&i.data?.custom_id?.startsWith('gp:');}
export async function finishSpecial(env,i){let content;try{const id=i.member.user.id,parts=(i.data.custom_id||'').split(':'),modal=i.type===5;if(modal&&(parts.length!==4||parts[1]!==i.guild_id||parts[2]!==id||!/^[-a-zA-Z0-9]+$/.test(parts[3])))throw Error('这不是你的改名窗口。');const payload=modal?{action:'submit',id,resultId:`${parts[3]}:1`,nickname:i.data.components?.flatMap(r=>r.components||[]).find(c=>c.custom_id==='nickname')?.value}:{action:'view',id};const response=await serviceStub(env,i.guild_id).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'ghostService',guild:i.guild_id,...payload})}),data=await response.json();if(data.error)throw Error(data.error);
 if(modal)content=data.content;else {content='👻 **抽鬼牌 · 本服务器排行榜**\n'+(data.top?.length?data.top.map((p,n)=>`${['🥇','🥈','🥉'][n]||`${n+1}.`} **${clean(p.name)}** · ${p.wins} 胜 / ${p.played-p.wins} 负 · ${Math.round(p.wins/p.played*100)}%`).join('\n'):'榜单还没有对局，来一场双人快局吧！')+(data.mine?`\n\n你排第 **${data.mine.rank}** 名 · ${data.mine.wins} 胜 / ${data.mine.played-data.mine.wins} 负`:'\n\n你还没有已完成的对局。')+`\n\n👻鬼王：${data.leader?clean(data.leader.name):'虚位以待'} · 按胜场、胜率、较早达成胜场排序。`+(data.role?.error?`\n身份组状态：${data.role.error}`:'\n榜首自动获得身份组；易主时先收回再授予。');}
 }catch(e){content=`👻 ${e.message}`;}try{await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${encodeURIComponent(i.token)}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,components:[],embeds:[],allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(5000)});}catch{}}

