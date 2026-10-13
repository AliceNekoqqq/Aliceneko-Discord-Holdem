// Worker session layer for the ManageBot game rules. SPDX-License-Identifier: AGPL-3.0-only
import {DevilState,ITEM_DEFS,SURRENDER_MIN_HP} from './devil-roulette-engine.mjs';
export const TYPES=['duel','devil_roulette'];
export const isDuelRoulette=t=>TYPES.includes(t?.game);
export const label=p=>String(p?.name||'玩家').replace(/[\x00-\x1f\\`*_~>|\[\]]/g,'').slice(0,24);
export const CHOICES={rock:'✊ 石头',scissors:'✌️ 剪刀',paper:'✋ 布'};
export const settings=type=>type==='duel'?{wait:60000,turn:30000,decision:30000,mute:3,rename:5}:{wait:120000,turn:62000,decision:60000,mute:5,rename:10};
const push=(t,text)=>{t.log=[...(t.log||[]),text].slice(-7);};
const roundResult=(t,summary)=>{t.lastRound={round:t.round,summary};t.roundResults=[...(t.roundResults||[]),t.lastRound].slice(-7);};
export function create(type,owner,channel,guild,name,target=null,now=Date.now()){
 if(!TYPES.includes(type))throw Error('无效游戏。');
 return {game:type,epoch:crypto.randomUUID().replaceAll('-','').slice(0,16),version:0,owner,channel,guild,target,phase:'lobby',players:[{id:owner,name,bot:false}],waitUntil:now+settings(type).wait,deadline:null,turn:null,handNo:0,log:[],createdAt:now,penaltyDue:null};
}
export function accept(t,id,name,now=Date.now(),rng=null){
 if(t.phase!=='lobby'||now>=t.waitUntil)throw Error('邀请已结束。');
 if(id===t.owner)throw Error('请等待另一位玩家应战。');
 if(t.target&&id!==t.target)throw Error('这是给指定玩家的挑战。');
 t.players.push({id,name,bot:false});t.phase='active';t.waitUntil=null;t.handNo=1;
 if(t.game==='duel'){t.scores=Object.fromEntries(t.players.map(p=>[p.id,0]));t.choices={};t.round=1;push(t,'死斗开始，双方私密出拳。');}
 else {const state=new DevilState(t.players.map(p=>p.id),{rng,alternateFirstTurn:true});t.state=state.serialize();t.turn=state.currentPlayerId;t.panelTurn=0;push(t,'已装填弹巢，双方获得道具。');}
 t.deadline=now+settings(t.game).turn;
}
export const resolveChoices=(a,b)=>a===b?0:({rock:'scissors',scissors:'paper',paper:'rock'}[a]===b?1:-1);
export function close(t,reason){t.phase='closed';t.closeReason=reason;t.deadline=null;t.waitUntil=null;t.turn=null;t.penaltyDue=null;push(t,reason);}
export function settle(t,winner,reason,now=Date.now(),surrender=false){
 t.phase='settled';t.winner=winner;t.loser=t.players.find(p=>p.id!==winner).id;t.turn=null;t.deadline=null;
 const cfg=settings(t.game);t.penalty={id:`${t.epoch}:1`,guild:t.guild,winner,loser:t.loser,game:t.game,until:now+cfg.decision,muteMinutes:surrender?3:cfg.mute,renameMinutes:surrender?7:cfg.rename,autoMuteMinutes:cfg.mute,status:'pending'};
 t.penaltyDue=now+1;push(t,`${label(t.players.find(p=>p.id===winner))} 获胜 · ${reason}`);
}
export function resolveRound(t,now=Date.now()){
 const picked=t.players.filter(p=>t.choices[p.id]);
 if(!picked.length){roundResult(t,'双方均未出拳，本场取消，无惩罚。');close(t,t.lastRound.summary);return;}
 let winner=null;
 if(picked.length===1){winner=picked[0].id;push(t,`第 ${t.round} 轮：对方超时，${label(picked[0])} 得 1 分。`);}
 else {const [a,b]=t.players,result=resolveChoices(t.choices[a.id],t.choices[b.id]);winner=result===0?null:result===1?a.id:b.id;push(t,`第 ${t.round} 轮：${label(a)} ${CHOICES[t.choices[a.id]]} / ${label(b)} ${CHOICES[t.choices[b.id]]} · ${winner?`${label(t.players.find(p=>p.id===winner))} 得分`:'平局'}`);}
 roundResult(t,t.log.at(-1));
 if(winner)t.scores[winner]++;
 if(winner&&t.scores[winner]>=2){settle(t,winner,'先赢两轮',now);return;}
 if(t.round>=7){close(t,'七轮后仍未分出胜负，本场取消，无惩罚。');return;}
 t.round++;t.choices={};t.deadline=now+30000;
}
export function choose(t,id,choice,round,now=Date.now()){
 if(t.phase!=='active'||t.game!=='duel'||t.round!==round||now>=t.deadline)throw Error('本轮已结束，请打开最新面板。');
 if(!t.players.some(p=>p.id===id)||!Object.hasOwn(CHOICES,choice))throw Error('无效出拳。');
 if(t.choices[id])throw Error('本轮已出拳，不能修改。');
 t.choices[id]=choice;if(Object.keys(t.choices).length===2)resolveRound(t,now);
}
export function shootOrItem(t,id,action,stealKey=null,now=Date.now(),timeout=false){
 if(t.phase!=='active'||t.game!=='devil_roulette'||now>=t.deadline&&!timeout)throw Error('回合已结束，请打开最新面板。');
 const s=DevilState.restore(t.state);
 if(action==='adrenaline'&&(!stealKey||!s._stealableItems(id).includes(stealKey)))throw Error('请选择对手当前持有的可偷取道具。');
 const result=s.apply(action,id,{expectedToken:t.state.turnToken,stealKey});
 if(s.currentPlayerId!==t.turn||result.reloaded)t.panelTurn=(t.panelTurn||0)+1;
 t.state=s.serialize();t.turn=s.currentPlayerId;t.deadline=now+62000;
 const who=label(t.players.find(p=>p.id===id));
 let line;
 if(action.startsWith('shoot_'))line=`${who} 向${action==='shoot_self'?'自己':'对手'}开枪：${result.hit?`实弹，${result.damage} 点伤害`:'空弹'}`;
 else line=`${who} 使用 ${ITEM_DEFS[action]?.name||action}${result.stolenKey?`，偷取 ${ITEM_DEFS[result.stolenKey].name}`:''}${result.healed?`，回复 ${result.healed} 点生命`:''}${result.lostHp?`，失去 ${result.lostHp} 点生命`:''}${result.ejected?`，弹出${result.ejectedLive?'实弹':'空弹'}`:''}`;
 // Private shell intelligence must never enter the public log.
 push(t,line);if(result.reloaded)push(t,'空仓重新装填，补发道具并交替先手。');
 if(result.gameEnded)settle(t,result.gameWinnerId,'对手生命归零',now);
 return result;
}
export function surrender(t,id,now=Date.now()){
 if(t.game!=='devil_roulette'||t.phase!=='active'||!t.players.some(p=>p.id===id))throw Error('现在不能认输。');
 if(t.state.hp[id]<=SURRENDER_MIN_HP)throw Error('生命仅剩 2 点或更低时，必须继续本局。');
 settle(t,t.players.find(p=>p.id!==id).id,'对手认输',now,true);
}
export function expire(t,now=Date.now()){
 if(!isDuelRoulette(t)||t.phase==='closed')return false;
 if(t.phase==='lobby'&&now>=t.waitUntil){close(t,'邀请超时，无人应战。');return true;}
 if(t.phase==='active'&&now>=t.deadline){if(t.game==='duel')resolveRound(t,now);else {const id=t.turn;shootOrItem(t,id,'shoot_opponent',null,now,true);push(t,'上一回合超时，已自动向对手开枪。');}return true;}
 return false;
}
