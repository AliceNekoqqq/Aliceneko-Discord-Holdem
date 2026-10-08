import {UnoRankings} from './uno-rankings.mjs';
import {normalizedProfile} from './uno-profile.mjs';
import {entranceEvent} from './liar-ui.mjs';
export const rankStub=(env,guild)=>env.TABLES.get(env.TABLES.idFromName(`liar-rank:${guild}`));
export class LiarRankings extends UnoRankings {
 constructor(storage,env){super(storage,env,{roleKey:'liarRole',roleName:'👑骗术大师',roleColor:0xe9bc71});}
 async dispatch(payload){if(payload.action==='record'&&(payload.result?.mode!=='round'||payload.result?.players?.length>4||payload.result?.players?.filter(p=>p.won).length!==1))throw Error('无效骗子酒馆战绩。');return super.dispatch(payload);}
}
// Result delivery survives channel closure, replacement and lost responses.
export class LiarRankBridge {
 constructor(host){this.host=host;this.storage=host.ctx.storage;this.env=host.env;}
 async capture(t){if(t.game!=='liar'||!this.env.TABLES)return;
  if(t.result&&await this.storage.get('liarLastResult')!==t.result.id){const jobs=await this.storage.get('liarRankJobs')||[];if(!jobs.some(j=>j.id===t.result.id))jobs.push(t.result);await this.storage.put('liarRankJobs',jobs);await this.storage.put('liarLastResult',t.result.id);await this.storage.put('liarSyncAt',Date.now()+1);}
  if(t.phase!=='closed'&&!await this.storage.get('liarSyncAt'))await this.storage.put('liarSyncAt',Date.now()+1);
 }
 async flush(t){const due=await this.storage.get('liarSyncAt');if(!this.env.TABLES||!due||due>Date.now())return;const jobs=await this.storage.get('liarRankJobs')||[];
  try{
   for(const result of jobs.slice(0,5)){const r=await rankStub(this.env,result.guild).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'liarRank',guild:result.guild,action:'record',result})});const d=await r.json();if(!r.ok||d.error)throw Error('retry');jobs.shift();await this.storage.put('liarRankJobs',jobs);}
   if(t?.game==='liar'&&t.phase!=='closed'){
    const [rankResponse,profileResponse]=await Promise.all([rankStub(this.env,t.guild).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'liarRank',guild:t.guild,action:'crown'})}),this.env.TABLES.get(this.env.TABLES.idFromName(`uno-rank:${t.guild}`)).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'unoRank',guild:t.guild,action:'crown',ids:t.players.filter(p=>!p.bot).map(p=>p.id)})})]);
    const rank=await rankResponse.json(),profiles=await profileResponse.json();if(!rankResponse.ok||!profileResponse.ok||rank.error||profiles.error)throw Error('retry');let changed=t.crown?.id!==rank.crown?.id||t.crown?.choice!==rank.crown?.choice;t.crown=rank.crown;
    for(const p of t.players){const next=profiles.profiles?.[p.id];if(p.bot||!next)continue;const normalized=normalizedProfile(next);if(Object.keys(normalized).some(k=>p[k]!==normalized[k])||JSON.stringify(p.appVictory||null)!==JSON.stringify(next.appVictory||null))changed=true;Object.assign(p,normalized,{appEntrance:next.appEntrance||null,appVictory:next.appVictory||null});if(p.entrancePending){delete p.entrancePending;if(['lobby','settled'].includes(t.phase)){entranceEvent(t,p);changed=true;}}}
    await this.storage.put('table',t);if(changed){await this.host.queuePanels(t);await this.host.boards.queue(t);}
   }
   if(jobs.length)await this.storage.put('liarSyncAt',Date.now()+100);else if(t?.game==='liar'&&t.phase!=='closed')await this.storage.put('liarSyncAt',Date.now()+15000);else await this.storage.delete('liarSyncAt');
  }catch{if(t?.game==='liar'&&t.crown?.validUntil<=Date.now()){t.crown=null;await this.storage.put('table',t);await this.host.boards.queue(t);}await this.storage.put('liarSyncAt',Date.now()+5000);}
 }
}
export const rankingInteraction=i=>i.type===2&&i.data?.name==='骗子酒馆'&&['排行榜','称号'].includes(i.data.options?.[0]?.name)||i.type===3&&i.data?.custom_id?.startsWith('lr:');
const clean=s=>String(s||'玩家').replace(/[\x00-\x1f\\`*_~>|\[\]]/g,'').slice(0,24);
export function rankingData(data,id,guild,menu=false){
 const leader=data.leader,mine=data.mine,button=(action,label,style=2)=>({type:2,custom_id:`lr:${guild}:${menu?id:'any'}:${action}`,label,style});
 const choices={none:'暂不佩戴',title:'👑 游戏称号',role:'👑 Discord身份组'};
 const body=menu?`👑 **骗术大师 · 称号**\n${leader?`当前第一名：**${clean(leader.name)}** · ${leader.wins}胜\n佩戴：${choices[leader.choice]}`:'尚无战绩。'}${leader?.id!==id?'\n只有当前第一名可选择佩戴。':''}`:`🏆 **本服务器骗子酒馆排行榜**\n${data.top.map((p,n)=>`${n+1}. **${clean(p.name)}** · ${p.wins}胜 / ${p.played-p.wins}负 · ${Math.round(100*p.wins/p.played)}%`).join('\n')||'还没有完成的真人对局。'}\n\n${mine?`你排第**${mine.rank}**：${mine.wins}胜 / ${mine.played-mine.wins}负 · 认输${mine.forfeits}次`:'你还没有计入榜单的战绩。'}\n全真人完成局计入，陪练与取消局不计；按胜场、胜率、较早达成该胜场排序。`;
 return {content:body+(menu&&leader?.choice==='role'?`\n${data.role.holder===leader.id&&data.role.assigned?'✅ 身份组已佩戴。':data.role.error?`⚠️ ${data.role.error}`:'⏳ 正在同步身份组。'}`:''),components:[{type:1,components:menu&&leader?.id===id?[button('title','👑 佩戴游戏称号',1),button('role','领取身份组',1),button('none','收起称号'),button('menu','刷新')]:[button('view','刷新排行榜'),button('menu','我的称号',1)]}],allowed_mentions:{parse:[]}};
}
export async function answerRanking(env,i){const id=i.member.user.id;let action=i.data.options?.[0]?.name==='称号'?'menu':'view';if(i.type===3){const parts=i.data.custom_id.split(':');action=parts[3];if(parts.length!==4||parts[1]!==i.guild_id||!['view','menu','title','role','none'].includes(action)||parts[2]!=='any'&&(parts[2]!==id||!(Number(i.message?.flags)&64))||['title','role','none'].includes(action)&&parts[2]!==id)return {content:'请打开自己的 /骗子酒馆 称号。',components:[],allowed_mentions:{parse:[]}};}
 try{const r=await rankStub(env,i.guild_id).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'liarRank',guild:i.guild_id,id,action:['title','role','none'].includes(action)?'equip':'view',choice:action})});const data=await r.json();if(!r.ok||data.error)throw Error(data.error||'排行榜暂时繁忙。');return rankingData(data,id,i.guild_id,action!=='view');}catch(e){return {content:e.message,components:[],allowed_mentions:{parse:[]}};}
}
export async function finishRanking(env,i){const data=await answerRanking(env,i);try{await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${i.token}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});}catch{}}
