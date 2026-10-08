import {validId} from './tavern-catalog.mjs';

const games={
 poker:{name:'德州',subcommand:'创建'},
 uno:{name:'uno',subcommand:'创建'},
 ghost:{name:'抽鬼牌',subcommand:'等待对手'},
 liar:{name:'骗子酒馆',subcommand:'创建'},
 table:{name:'德州',subcommand:'牌桌'}
};

/**
 * Resolve a public lobby button to the existing game command path. `null`
 * means this is not a lobby-play button; `{error}` is a recognized but invalid
 * lobby button; `{interaction}` is a shallow clone retaining Discord's
 * signed actor, id, token, guild, channel and application fields.
 */
export function lobbyGameRequest(i){
 const customId=i?.data?.custom_id;
 if(typeof customId!=='string'||!customId.includes('lobbyPlay'))return null;
 const parts=customId.split(':');
 if(i.type!==3||parts.length!==4||parts[0]!=='t'||!parts[3].startsWith('lobbyPlay~'))return {error:'大厅按钮格式无效，请重新打开大厅。'};
 const [,boundGuild,owner,action]=parts;
 if(!validId(i.guild_id)||!validId(i.channel_id)||!validId(i.member?.user?.id))return {error:'请在服务器文字频道内使用大厅按钮。'};
 if(boundGuild!==i.guild_id)return {error:'大厅按钮不属于当前服务器。'};
 const userId=i.member.user.id;
 if(owner!=='any'&&owner!==userId)return {error:'这是另一位玩家的大厅按钮。'};
 if(i.member.user.bot)return {error:'机器人不能通过大厅按钮开局。'};
 const gameKey=action.slice('lobbyPlay~'.length),route=Object.hasOwn(games,gameKey)?games[gameKey]:null;
 if(!route||gameKey.includes('~'))return {error:'这个大厅游戏入口无效，请重新打开大厅。'};
 return {interaction:{...i,type:2,data:{name:route.name,options:[{name:route.subcommand}]}}};
}
