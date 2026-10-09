import {tavernRequest} from './tavern-service.mjs';
const button=(guild,action,label,style=2)=>({type:2,custom_id:`t:${guild}:any:${action}`,label,style});
export async function answerTavernMap(env,i){
 const guild=i.guild_id,id=i.member?.user?.id,name=i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'来客';
 const map=await tavernRequest(env,{guild,id,name,channel:i.channel_id,action:'mapRender',scene:true});
 const scene=map.scene?{bytes:Uint8Array.from(atob(map.scene.data),c=>c.charCodeAt(0)),filename:map.scene.filename,mime:map.scene.mime}:null;
 return {content:`🗺️ **红豆粉的小酒馆 · 店内实况**\n最近30分钟 **${map.visitorCount}位来客** · **${map.tableCount}张牌桌** · **${map.recentOrders.orderCount}份已上桌**\n点单前往吧台；通过大厅「换个位置」选择区域，参与牌局时显示在桌边。区域内席位是示意，客流不等于Discord在线人数。`,components:[{type:1,components:[button(guild,'lobbyMap','🗺️ 刷新实况',1),button(guild,'lobbyMenu','🍵 去吧台'),button(guild,'lobbyGames','🎮 去游戏区'),button(guild,'renoEnter','🔧 添置陈设'),button(guild,'lobby','🏡 返回大厅')]}],allowed_mentions:{parse:[]},_mapScene:scene};
}

