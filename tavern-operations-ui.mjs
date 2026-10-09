import {cleanText} from './tavern-catalog.mjs';
import {tavernRequest} from './tavern-service.mjs';

const mentions={parse:[]};
const row=(...components)=>({type:1,components});
const cid=(g,o,a)=>`t:${g}:${o}:${a}`;
const button=(g,o,a,label,style=2,disabled=false)=>({type:2,custom_id:cid(g,o,a),label:String(label).slice(0,80),style,disabled});
const valid=s=>/^\d{1,20}$/.test(String(s||''));
const safe=(s,max=48)=>[...cleanText(String(s||''),max*3).replace(/<@!?&?\d+>/g,'＠').replace(/@/g,'＠').replace(/[<>]/g,'').replace(/[\\`*_~|#\[\](){}!]/g,'')].slice(0,max).join('')||'未命名';
const fmt=x=>x?.length?x.join('\n'):'暂无记录。';
const ownAction=a=>a==='opsEnter'||a.startsWith('opsSet~')||a.startsWith('opsVote~')||a.startsWith('opsClaim~');
export function operationsInteraction(i){return [3,5].includes(i.type)&&String(i.data?.custom_id||'').startsWith('t:')&&String(i.data.custom_id).split(':')[3]?.startsWith('ops');}
function validate(i){
 const g=i.guild_id,u=i.member?.user?.id,ch=i.channel_id;if(!valid(g)||!valid(u)||!valid(ch))throw Error('请在服务器文字频道内使用经营功能。');
 const ps=String(i.data?.custom_id||'').split(':');if(ps.length!==4||ps[0]!=='t'||ps[1]!==g)throw Error('经营面板已失效，请重新打开。');
 const [,,owner,action]=ps;if(!/^ops(?:Board|Season|Activity|Enter|Set~|Vote~|Claim~)/.test(action))throw Error('经营操作无效。');
 const priv=!!(Number(i.message?.flags)&64);
 if(owner==='any'){if(!['opsBoard','opsSeason','opsActivity','opsEnter'].includes(action))throw Error('公开面板只允许浏览经营信息或打开自己的私密面板。');}
 else if(owner!==u)throw Error('这是另一位来客的私密经营面板。');
 if(ownAction(action)&&action!=='opsEnter'&&(!priv||owner!==u))throw Error('请从本人私密经营面板进行操作。');
 if(action==='opsEnter'&&owner!=='any'&&owner!==u)throw Error('只能打开自己的私密经营面板。');
 return {g,u,ch,owner,action,priv};
}
export function immediateOperationsReply(i){if(!operationsInteraction(i))return null;try{validate(i);return null;}catch(e){return {type:4,data:{content:e.message,flags:64,allowed_mentions:mentions}};}}
export function operationsDeferredReply(i){if(!operationsInteraction(i))return null;const p=String(i.data.custom_id).split(':'),owner=p[2],a=p[3],priv=!!(Number(i.message?.flags)&64);if(a==='opsEnter')return {type:5,data:{flags:64}};if(['opsBoard','opsSeason','opsActivity'].includes(a))return i.type===3?{type:6}:{type:5};if(owner===i.member?.user?.id&&priv)return i.type===3?{type:6}:{type:5,data:{flags:64}};return {type:5,data:{flags:64}};}
function selected(board,field,list,textField='name'){const value=board.settings?.[field];return (list||[]).find(x=>x.id===value)?.[textField]||'尚未设置';}
function bannerLines(b){return [`👑 **今日一日店长** · ${b.manager?`${safe(b.manager.name,48)} (<@${String(b.manager.id||'').replace(/\D/g,'').slice(0,20)}>)`:'今日暂缺，等候首位来客'}`,`📅 ${safe(b.day,16)} · 每日 00:00（北京时间）换任`];}
export function operationsBanner(board){return `${bannerLines(board).join('\n')}\n${safe(selected(board,'welcome',board.choices?.welcomes,'text'),120)}`;}
function publicBoard(b,g){const settings=b.settings||{},choices=b.choices||{},season=b.season||{},activity=b.activity||{};return {content:`${operationsBanner(b)}\n\n**今日推荐** ${safe(selected(b,'recommendation',choices.recommendations))} · **氛围** ${safe(selected(b,'ambience',choices.ambiences))}\n\n🌱 **季节研发** ${season.points||0}/${season.goal||30} · ${safe(season.title||'本月研发')}${season.unlocked?' · 已解锁':''}\n🎉 **共同活动** ${safe(activity.title||'今日活动')} · ${activity.gameCount||0}/${activity.gameGoal||0} 局，${activity.orderGuests||0}/${activity.orderGoal||0} 位品鉴者${activity.completed?' · 已完成':''}`,components:[row(button(g,'any','opsSeason','🌱 季节研发'),button(g,'any','opsActivity','🎉 共同活动'),button(g,'any','opsEnter','我的经营面板',1),button(g,'any','lobby','🏡 返回大厅'))],allowed_mentions:mentions};}
function seasonPage(b,g){const s=b.season||{},choices=s.options||[],winner=choices.find(x=>x.id===s.selected);const lines=choices.map((x,n)=>`${n+1}. ${safe(x.emoji||'🍹',4)} **${safe(x.name)}** · ${x.votes||0} 票${x.description?` · ${safe(x.description,80)}`:''}`);const contributors=(s.contributors||[]).slice(0,12).map(x=>safe(x.name));return {content:`🌱 **${safe(s.title||'季节研发')}** · ${safe(b.day,16)}\n研发进度 **${s.points||0}/${s.goal||30}**${s.unlocked?' · 已解锁':''}${winner?`\n本月选定新品：${safe(winner.name)} · ${winner.price||''}币`:''}\n每局合格游戏 +1 研发分；每位客人每日首份付费点单 +1；累计 30 分解锁。投票只决定新品，不增加研发分。\n\n**共同候选**\n${fmt(lines)}\n\n**参与研发的来客**\n${fmt(contributors)}`,components:[row(button(g,'any','opsEnter','我的经营面板',1),button(g,'any','opsBoard','返回经营看板'),button(g,'any','lobby','🏡 返回大厅'))],allowed_mentions:mentions};}
function activityPage(b,g){const a=b.activity||{},people=(a.participants||[]).slice(0,12).map(x=>safe(x.name));return {content:`🎉 **今日共同活动** · ${safe(b.day,16)}\n**${safe(a.title||'今日活动')}**${a.completed?' · 已完成':''}\n🎮 游戏 ${a.gameCount||0}/${a.gameGoal||0} 局 · 🍵 付费点单 ${a.orderGuests||0}/${a.orderGoal||0} 位\n\n**参与来客**\n${fmt(people)}\n\n${a.completed?'参与过活动的来客可在私密面板领取非货币纪念章。':'继续一起玩游戏或点单；达成后可领取一次非货币纪念章。'}`,components:[row(button(g,'any','opsEnter','我的经营面板',1),button(g,'any','opsBoard','返回经营看板'),button(g,'any','lobby','🏡 返回大厅'))],allowed_mentions:mentions};}
function select(g,u,action,placeholder,items,current){return {type:3,custom_id:cid(g,u,action),placeholder:placeholder.slice(0,100),min_values:1,max_values:1,options:(items||[]).slice(0,25).map(x=>({label:`${x.emoji||''} ${safe(x.name||x.text,80)}`.trim().slice(0,100),value:String(x.id).slice(0,100),description:safe(x.description||x.scene||x.text||'',100),...(x.id===current?{default:true}:{})}))};}
function privatePage(b,g,u){const m=b.mine||{},settings=b.settings||{},choices=b.choices||{},components=[];if(m.isManager){const c=choices;components.push(row(select(g,u,`opsSet~${b.day}~recommendation`,'设置今日推荐',c.recommendations,settings.recommendation)));components.push(row(select(g,u,`opsSet~${b.day}~ambience`,'设置今日氛围',c.ambiences,settings.ambience)));components.push(row(select(g,u,`opsSet~${b.day}~welcome`,'设置欢迎语',c.welcomes,settings.welcome)));}
 const s=b.season||{};if(!s.unlocked&&s.options?.length)components.push(row(select(g,u,`opsVote~${safe(s.month||'',8)}`,'为季节新品投一票',s.options,m.vote?.candidate)));
 const a=b.activity||{};const claimed=!!m.claimed,participated=!!m.participated;components.push(row(button(g,u,`opsClaim~${b.day}`,claimed?'✅ 已领取纪念章':participated?'🏅 领取纪念章':'🏅 参与活动后可领取',1,claimed||!participated||!a.completed),button(g,'any','opsBoard','公开经营看板'),button(g,u,'lobby','🏡 返回大厅')));
 const stamps=(m.stamps||[]).slice(0,5).map(x=>`🏅 ${safe(x.day,16)} · ${safe(x.title,40)}`);const manager=m.isManager?`\n\n**今日店长设置**\n推荐：${safe(selected(b,'recommendation',choices.recommendations))} · 氛围：${safe(selected(b,'ambience',choices.ambiences))}\n欢迎语：${safe(selected(b,'welcome',choices.welcomes,'text'),100)}`:'';
 return {content:`🔒 **我的私密经营面板** · ${safe(b.day,16)}${manager}\n\n${s.unlocked?'本月季节新品已解锁。':s.month?`本月研发：${s.points||0}/${s.goal||30} · 每人每月一票。`:'暂时没有开放中的季节投票。'}\n共同活动：${a.completed?'已完成':'进行中'} · ${participated?'你已参与':'你尚未参与'}\n\n**我的纪念章档案**\n${fmt(stamps)}`,components,allowed_mentions:mentions};}
async function call(env,p){return tavernRequest(env,p);}
export async function answerOperations(env,i){const p=validate(i),name=i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'来客',base={guild:p.g,id:p.u,name};let a=p.action;
 if(a==='opsEnter'){const b=await call(env,{...base,action:'opsBoard',privateView:true});return privatePage(b,p.g,p.u);}
 if(a==='opsBoard'||a==='opsSeason'||a==='opsActivity'){const b=await call(env,{...base,action:'opsBoard',privateView:false});return a==='opsSeason'?seasonPage(b,p.g):a==='opsActivity'?activityPage(b,p.g):publicBoard(b,p.g);}
 if(a.startsWith('opsSet~')){const [,day,field]=a.split('~'),value=i.data.values?.[0];if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||!['recommendation','ambience','welcome'].includes(field)||!value)throw Error('请选择当天有效的经营选项。');const b=await call(env,{...base,action:'opsSet',day,field,value});return privatePage(b,p.g,p.u);}
 if(a.startsWith('opsVote~')){const month=a.slice(8),candidate=i.data.values?.[0];if(!/^\d{6}$/.test(month)||Number(month.slice(4))<1||Number(month.slice(4))>12||!candidate)throw Error('请选择当前月份的季节候选。');const b=await call(env,{...base,action:'opsVote',month,candidate});return privatePage(b,p.g,p.u);}
 if(a.startsWith('opsClaim~')){const day=a.slice(9);if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('纪念章按钮已过期，请重新打开面板。');const b=await call(env,{...base,action:'opsClaim',day});return privatePage(b,p.g,p.u);}
 throw Error('请重新打开经营面板。');}
