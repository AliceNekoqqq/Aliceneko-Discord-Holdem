import {tavernRequest} from './tavern-service.mjs';
const button=(guild,action,label,style=2)=>({type:2,custom_id:`t:${guild}:any:${action}`,label,style});
export async function answerTavernMap(env,i){
 const guild=i.guild_id,id=i.member?.user?.id,name=i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'来客';
 const map=await tavernRequest(env,{guild,id,name,channel:i.channel_id,action:'mapRender'});
 const bytes=Uint8Array.from(atob(map.png),c=>c.charCodeAt(0));
 return {content:`🗺️ **红豆粉的小酒馆 · 店内实况**\n最近30分钟 **${map.visitorCount}位来客** · **${map.tableCount}张牌桌** · **${map.recentOrders.orderCount}份已上桌**\n按酒馆互动和公开牌桌生成；席位是示意，客流不等于Discord在线人数。点击刷新查看最新实况。`,components:[{type:1,components:[button(guild,'lobbyMap','🗺️ 刷新实况',1),button(guild,'lobbyMenu','🍵 去吧台'),button(guild,'lobbyGames','🎮 去游戏区'),button(guild,'renoEnter','🔧 添置陈设'),button(guild,'lobby','🏡 返回大厅')]}],allowed_mentions:{parse:[]},_mapImage:bytes};
}
