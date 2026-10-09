import {RENOVATION_ITEMS} from './tavern-renovation-catalog.mjs';
import {cleanText} from './tavern-catalog.mjs';
import {tavernRequest} from './tavern-service.mjs';
import {answerRenovation} from './tavern-renovation-ui.mjs';
import {operationsBanner} from './tavern-operations-ui.mjs';

const mentions={parse:[]};
const row=(...components)=>({type:1,components});
const key=(guild,owner,action)=>`t:${guild}:${owner}:${action}`;
const button=(guild,owner,action,label,style=2)=>({type:2,custom_id:key(guild,owner,action),label:String(label).slice(0,80),style});
const valid=s=>/^\d{1,20}$/.test(String(s||''));
const safe=(s,max=64)=>[...cleanText(String(s||''),max*2).replace(/<@!?&?\d+>/g,'＠').replace(/@/g,'＠').replace(/[<>]/g,'').replace(/[\\`*_~|#\[\](){}!]/g,'')].slice(0,max).join('')||'未命名';
const LOBBY_ACTIONS=new Set(['lobby','lobbyGames','lobbyMenu','lobbyWallet','lobbyCard','lobbyRoom']);
export const lobbyCommandOption={type:1,name:'大厅',description:'打开红豆粉小酒馆大厅与常用入口'};

export function tavernLobbyInteraction(i){
 if(![3,5].includes(i.type)||!i.data?.custom_id?.startsWith('t:'))return false;
 const action=String(i.data.custom_id).split(':')[3]||'';
 return LOBBY_ACTIONS.has(action);
}
export function tavernLobbyCommand(i){return i.type===2&&i.data?.name==='酒馆'&&i.data.options?.[0]?.name==='大厅';}
function validate(i){
 const g=i.guild_id,u=i.member?.user?.id,ch=i.channel_id;
 if(!valid(g)||!valid(u)||!valid(ch))throw Error('请在服务器文字频道内使用酒馆大厅。');
 if(tavernLobbyCommand(i))return {g,u,ch,action:'lobby'};
 const p=String(i.data?.custom_id||'').split(':');if(p.length!==4||p[0]!=='t'||p[1]!==g)throw Error('大厅面板已失效，请重新打开。');
 const owner=p[2],action=p[3];if(!LOBBY_ACTIONS.has(action))throw Error('这个大厅操作暂不可用。');
 if(owner==='any'){
  if(['lobbyMenu','lobbyWallet','lobbyCard'].includes(action))return {g,u,ch,action,publicEntry:true};
 }else if(owner!==u)throw Error('这是另一位来客的大厅面板，请打开自己的酒馆大厅。');
 if(['lobbyMenu','lobbyWallet','lobbyCard'].includes(action))throw Error('请从公开大厅打开自己的私密面板。');
 return {g,u,ch,action,publicEntry:false};
}
export function immediateLobbyReply(i){
 if(!tavernLobbyInteraction(i)&&!tavernLobbyCommand(i))return null;
 try{validate(i);return null;}catch(e){return {type:4,data:{content:e.message,flags:64,allowed_mentions:mentions}};}
}
export function lobbyDeferredReply(i){
 if(tavernLobbyCommand(i))return {type:5};
 if(!tavernLobbyInteraction(i))return null;
 const p=String(i.data.custom_id).split(':'),action=p[3];
 if(['lobbyMenu','lobbyWallet','lobbyCard'].includes(action))return {type:5,data:{flags:64}};
 if(i.type===3)return {type:6};
 return {type:5};
}
export function tavernLobbyData(board,guild,owner='any',operations=null){
 const stage=board.stage,assets=[...(board.assets||[])].sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0));
 const latestAssets=assets.slice(0,3).map(a=>{const item=RENOVATION_ITEMS.find(x=>x.id===(typeof a.item==='string'?a.item:a.item?.id));const scene=item?.levels?.[(a.level||1)-1]?.scene;return `${item?.emoji||'🪑'} **${safe(item?.name||a.item,32)}** Lv.${a.level}「${safe(a.levelName||a.name,24)}」${scene?` · ${safe(scene,48)}`:''}`;});
 const recent=(board.recent||[]).slice(0,3).map(x=>`${safe(x.donor_name||x.name,32)} · ${safe(x.item_name||RENOVATION_ITEMS.find(it=>it.id===x.item)?.name||x.item,32)} Lv.${x.level}「${safe(x.name,24)}」 · ${x.kind==='upgrade'?'升级':'购置'}`);
 const next=board.next,span=next?Math.max(1,next.threshold-stage.threshold):1,progress=next?Math.max(0,Math.min(1,(board.total-stage.threshold)/span)):1,filled=Math.round(progress*10),bar='▰'.repeat(filled)+'▱'.repeat(10-filled);
 const destination=next?`下一阶段 **${safe(next.name,32)}** · 还差 **${Math.max(0,next.threshold-board.total)}** 建设值`:'已达到最高阶段';
 const prose=(latestAssets[0]||stage.description||'店里亮着暖灯，吧台留着空位，欢迎慢慢坐下。');
 const components=[
  row(button(guild,'any','lobbyMenu','🍵 吧台点单',1),button(guild,'any','lobbyWallet','🪙 我的钱包'),button(guild,'any','lobbyCard','🦋 常客卡'),button(guild,'any','lobbyRoom','🏮 店内'),button(guild,'any','renoEnter','🔧 共同装修')),
  row(button(guild,'any','renoHistory~0','📜 捐赠档案'),button(guild,'any','renoLeaders','🏅 贡献榜'),button(guild,'any','lobbyGames','🎮 小游戏'),button(guild,owner,'lobby','🔄 刷新大厅')),
  row(button(guild,'any','opsBoard','👑 今日经营',1),button(guild,'any','opsSeason','🌱 季节菜单'),button(guild,'any','opsActivity','🎉 共同活动'))
 ];
 const daily=operations?`${operationsBanner(operations)}\n🌱 ${safe(operations.season.title,24)}研发 ${operations.season.points}/${operations.season.goal}${operations.season.unlocked?' · 新品已上菜单':''} · 🎉 ${safe(operations.activity.title,24)}${operations.activity.completed?'已完成':''}\n\n`:'';
 return {content:`${daily}🍵 **红豆粉的小酒馆 · 大厅**\n${safe(stage.name,32)} · ${safe(prose,120)}\n\n**共同建设** ${board.total}（餐饮 ${board.consumption} + 装修 ${board.direct}）\n${bar} ${Math.round(progress*100)}% · ${destination}\n\n**最近落地**\n${latestAssets.join('\n')||'还没有玩家添置的陈设，来一起装修吧。'}\n\n**最近捐赠**\n${recent.join('\n')||'还没有主动装修出资；每一笔确认出资都会留下记录。'}`,components,allowed_mentions:mentions};
}
export function tavernLobbyGames(guild){
 const games=[['poker','♠️ 德州'],['uno','🃏 UNO'],['ghost','👻 抽鬼牌'],['liar','🃏 骗子酒馆'],['table','🎴 当前牌桌']];
 return {content:'🎮 **小酒馆游戏区**\n选择一款游戏，打开当前频道的牌桌。小游戏奖励按既有规则结算。',components:[row(...games.map(([g,label])=>button(guild,'any',`lobbyPlay~${g}`,label,1))),row(button(guild,'any','lobby','返回大厅'))],allowed_mentions:mentions};
}
export async function answerLobby(env,i){
 const p=validate(i);if(p.action==='lobbyGames')return tavernLobbyGames(p.g);
 if(p.action==='lobbyRoom')return answerRenovation(env,{...i,type:3,message:i.message||{flags:0},data:{custom_id:`t:${p.g}:any:renoBoard~0`}});
 const board=await tavernRequest(env,{guild:p.g,action:'renoBoard'});
 const operations=await tavernRequest(env,{guild:p.g,id:p.u,name:i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'来客',action:'opsBoard'});
 return tavernLobbyData(board,p.g,p.publicEntry?'any':(i.data?.custom_id?.split(':')[2]||'any'),operations);
}
