// Fixed phrases only. Social actions never change turns, deadlines or card state.
export const EMOTES=Object.freeze({
 next:{emoji:'👉',text:'轮到你了',short:'轮到你',tone:'next'},
 attack:{emoji:'😏',text:'接招吧！',short:'接招吧',tone:'attack'},
 thanks:{emoji:'🥰',text:'谢谢你呀',short:'谢谢你',tone:'thanks'},
 watch:{emoji:'👀',text:'盯上你了',short:'盯上你',tone:'watch'},
 clap:{emoji:'👏',text:'这波漂亮！',short:'漂亮',tone:'clap'}
});
export const EMOTE_MS=8000,EMOTE_COOLDOWN=8000,EMOTE_TABLE_COOLDOWN=1500;
export function activeEmote(t,now=Date.now()){
 const e=t.social;if(t.phase==='closed'||!e||e.hand!==t.handNo||e.until<=now||!EMOTES[e.key])return null;
 if(!t.players.some(p=>p.id===e.actor)||!t.players.some(p=>p.id===e.target))return null;
 return {actor:e.actor,target:e.target,key:e.key,until:e.until};
}
export function sendEmote(t,id,target,key,hand,now=Date.now()){
 if(t.phase==='closed')throw Error('🪑 牌桌已经收摊啦，请重新开桌。');
 if(!t.players.some(p=>p.id===id&&!p.bot))throw Error('🪑 先加入牌桌，才能和大家互动哦。');
 if(hand!==t.handNo)throw Error('🔄 已经换局啦，请重新打开互动菜单。');
 if(target===id||!t.players.some(p=>p.id===target))throw Error('🎯 请选择仍在座的另一位玩家。');
 if(!Object.hasOwn(EMOTES,key))throw Error('💬 请选择菜单里的表情。');
 const last=t.emoteCooldown?.[id];if(Number.isFinite(last)&&now-last<EMOTE_COOLDOWN)throw Error(`🫧 歇口气，${Math.ceil((EMOTE_COOLDOWN-now+last)/1000)} 秒后再来一句。`);
 if(t.social&&now-(t.social.until-EMOTE_MS)<EMOTE_TABLE_COOLDOWN)throw Error('💬 上一句还热乎，稍等一下再接话。');
 t.emoteCooldown=Object.fromEntries(t.players.filter(p=>!p.bot).map(p=>[p.id,p.id===id?now:t.emoteCooldown?.[p.id]]).filter(([,v])=>Number.isFinite(v)));
 t.social={actor:id,target,key,hand:t.handNo,until:now+EMOTE_MS};return activeEmote(t,now);
}
export function expireEmote(t,now=Date.now()){if(!t.social||t.social.until>now&&activeEmote(t,now))return false;t.social=null;return true;}
export function recordRoundInteraction(t,e){
 if(e.kind!=='play'&&e.kind!=='accept'&&e.kind!=='challenge')return;
 const stats=t.roundInteractions??={jumps:{},steals:{},counterattacks:0,maxRelay:null};
 if(e.kind==='play'){
  if(e.jump){stats.jumps[e.actor]=(stats.jumps[e.actor]||0)+1;if(e.from&&e.from!==e.actor){const pair=`${e.actor}|${e.from}`;stats.steals[pair]=(stats.steals[pair]||0)+1;}}
  if(e.stacked)stats.counterattacks++;
  if(e.stackTotal>0&&e.stackTotal>=(stats.maxRelay?.count||0))stats.maxRelay={id:e.relayId,count:e.stackTotal,actor:e.actor,target:e.target,absorbed:null};
 }else if(stats.maxRelay&&e.relayId===stats.maxRelay.id){stats.maxRelay.absorbed=e.kind==='accept'?e.actor:e.success?e.target:e.actor;}
}
