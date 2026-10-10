import {answerTavernMap} from './tavern-map-ui.mjs';
import {cleanText} from './tavern-catalog.mjs';
import {tavernRequest} from './tavern-service.mjs';
import {answerRenovation} from './tavern-renovation-ui.mjs';

const mentions={parse:[]};
const row=(...components)=>({type:1,components});
const key=(guild,owner,action)=>`t:${guild}:${owner}:${action}`;
const button=(guild,owner,action,label,style=2)=>({type:2,custom_id:key(guild,owner,action),label:String(label).slice(0,80),style});
const valid=s=>/^\d{1,20}$/.test(String(s||''));
const safe=(s,max=64)=>[...cleanText(String(s||''),max*2).replace(/<@!?&?\d+>/g,'＠').replace(/@/g,'＠').replace(/[<>]/g,'').replace(/[\\`*_~|#\[\](){}!]/g,'')].slice(0,max).join('')||'未命名';
const LOBBY_ACTIONS=new Set(['lobby','lobbyGames','lobbyMenu','lobbyWallet','lobbyCard','lobbyRoom','lobbyMap','lobbyMapHD','lobbySeat','lobbyMove']);
const AREAS={commons:'公共客厅',bar:'吧台边',window:'临河窗边',quiet:'安静角落'};
export const lobbyCommandOption={type:1,name:'大厅',description:'打开红豆粉小酒馆大厅与常用入口'};

export function tavernSceneEmbed(meta={},filename=null){
 const embed={color:0x8d5b43};
 if(typeof meta.title==='string')embed.title=meta.title.slice(0,256);
 if(typeof meta.description==='string')embed.description=meta.description.slice(0,4096);
 if(typeof meta.footer==='string')embed.footer={text:meta.footer.slice(0,2048)};
 if(typeof filename==='string'&&filename)embed.image={url:`attachment://${filename.slice(0,128)}`};
 return embed;
}

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
 if(action==='lobbyMove'){
  if(owner!==u||i.type!==3||!(Number(i.message?.flags)&64)||!Object.hasOwn(AREAS,i.data?.values?.[0]))throw Error('请从自己的位置选择窗口操作。');
  return {g,u,ch,action,publicEntry:false};
 }
 if(owner==='any'){
  if(['lobbyMenu','lobbyWallet','lobbyCard','lobbySeat'].includes(action))return {g,u,ch,action,publicEntry:true};
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
 if(action==='lobbyMapHD')return Number(i.message?.flags)&64?{type:6}:{type:5,data:{flags:64}};
 if(['lobbyMenu','lobbyWallet','lobbyCard','lobbySeat'].includes(action))return {type:5,data:{flags:64}};
 if(i.type===3)return {type:6};
 return {type:5};
}
export function tavernLobbyData(board,guild,owner='any',operations=null,live=null){
 const stage=board.stage;
 const next=board.next,span=next?Math.max(1,next.threshold-stage.threshold):1,progress=next?Math.max(0,Math.min(1,(board.total-stage.threshold)/span)):1,filled=Math.round(progress*5),bar='▰'.repeat(filled)+'▱'.repeat(5-filled);
 const destination=next?`下一阶段 ${safe(next.name,24)} · 还差 ${Math.max(0,next.threshold-board.total)}`:'最高阶段';
 const components=[
  row(button(guild,'any','lobbyMenu','🍵 点单',1),button(guild,'any','lobbyWallet','🪙 钱包'),button(guild,'any','lobbyCard','🦋 常客卡'),button(guild,'any','lobbyRoom','🏮 店内'),button(guild,'any','renoEnter','🔧 共同装修')),
  row(button(guild,'any','opsBoard','👑 今日经营',1),button(guild,'any','opsSeason','🌱 季节菜单'),button(guild,'any','opsActivity','🎉 共同活动'),button(guild,'any','renoHistory~0','📜 贡献历史'),button(guild,'any','renoLeaders','🏅 贡献榜')),
  row(button(guild,'any','lobbyGames','🎮 小游戏'),button(guild,'any','lobbySeat','📍 换个位置'),button(guild,'any','lobbyMap','🗺️ 地图实况',1),button(guild,owner,'lobby','🔄 刷新大厅'),button(guild,'any','lobbyMapHD','🔍 清晰原图'))
 ];
 const crowd=live?`最近30分钟 ${live.visitorCount} 位来客 · ${live.tableCount} 张牌桌`:'地图实况暂不可用';
 const manager=operations?.manager?.name||'等待首位来客';
 const season=operations?.season,activity=operations?.activity;
 const response={content:`🍵 **红豆粉的小酒馆 · 大厅** · ${safe(stage.name,24)}\n👑 今日店长：${safe(manager,32)}${live?'':`\n地图实况暂不可用 · 建设 ${board.total}`}`,
  _mapEmbed:{title:`🏮 ${safe(stage.name,32)} · 店内实况`,description:`${crowd} · 建设 ${board.total} · ${bar} ${Math.round(progress*100)}% · ${destination}`,
   footer:`🌱 ${safe(season?.title||'季节菜单',18)} ${season?.points??0}/${season?.goal??30} · 🎉 ${safe(activity?.title||'共同活动',18)}${activity?.completed?' 已完成':''}`},
  components,allowed_mentions:mentions};
 if(live?.scene)response._mapScene={bytes:Uint8Array.from(atob(live.scene.data),c=>c.charCodeAt(0)),filename:live.scene.filename,mime:live.scene.mime};
 return response;
}
export function tavernLobbyGames(guild){
 const games=[['poker','♠️ 德州'],['uno','🃏 UNO'],['ghost','👻 抽鬼牌'],['liar','🃏 骗子酒馆'],['table','🎴 当前牌桌'],['rogue','🏮 灯下迷城']];
 return {content:'🎮 **小酒馆游戏区**\n牌桌游戏在当前频道游玩；「我的伙伴」打开本人私密养成面板。伙伴每人限一只，同行奖励计入小游戏总日额度。',components:[row(...games.slice(0,3).map(([g,label])=>button(guild,'any',`lobbyPlay~${g}`,label,1))),row(...games.slice(3).map(([g,label])=>button(guild,'any',`lobbyPlay~${g}`,label,1))),row(button(guild,'any','lobbyPet','🐾 我的伙伴',1),button(guild,'any','lobby','返回大厅'))],allowed_mentions:mentions};
}
export async function answerLobby(env,i){
 const p=validate(i);if(p.action==='lobbyGames')return tavernLobbyGames(p.g);
 if(['lobbySeat','lobbyMove'].includes(p.action)){
  const area=i.data?.values?.[0],name=i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'来客';
  if(p.action==='lobbyMove'){const ok=await tavernRequest(env,{guild:p.g,id:p.u,channel:p.ch,name,action:'mapMove',area});if(ok!==true)throw Error('位置暂未变更，请重新选择。');}
  return {content:`📍 **换个位置**${p.action==='lobbyMove'?`\n已选择：${AREAS[area]}`:''}\n选择的位置会显示在大厅地图。参与牌局时优先显示在桌边，离桌后恢复你的选择。`,components:[row({type:3,custom_id:key(p.g,p.u,'lobbyMove'),placeholder:'想坐在哪里？',min_values:1,max_values:1,options:Object.entries(AREAS).map(([value,label])=>({value,label,default:p.action==='lobbyMove'&&value===area}))}),row(button(p.g,p.u,'lobbySeat','重新选择'))],allowed_mentions:mentions};
 }
 if(p.action==='lobbyMap')return answerTavernMap(env,i);
 if(p.action==='lobbyMapHD')return answerTavernMap(env,i,{hd:true});
 if(p.action==='lobbyRoom')return answerRenovation(env,{...i,type:3,message:i.message||{flags:0},data:{custom_id:`t:${p.g}:any:renoBoard~0`}});
 const name=i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'来客';
 const [board,operations]=await Promise.all([
  tavernRequest(env,{guild:p.g,action:'renoBoard'}),
  tavernRequest(env,{guild:p.g,id:p.u,channel:p.ch,name,action:'opsBoard'})
 ]);
 const live=await tavernRequest(env,{guild:p.g,id:p.u,channel:p.ch,name,action:'mapRender',scene:true}).catch(()=>null);
 return tavernLobbyData(board,p.g,p.publicEntry?'any':(i.data?.custom_id?.split(':')[2]||'any'),operations,live);
}



