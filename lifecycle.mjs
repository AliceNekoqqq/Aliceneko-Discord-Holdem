export const LOBBY_IDLE_MS=5*60*1000;
export const SETTLED_IDLE_MS=10*60*1000;
export const PLAY_IDLE_MS=10*60*1000;
export const OWNER_IDLE_MS=2*60*1000;
export const WARNING_MS=60*1000;
export const waiting=t=>['lobby','settled'].includes(t.phase);
const humans=t=>t.players.filter(p=>!p.bot);

export function initializeLifecycle(t,now=Date.now()){
  if(t.phase==='closed')return false;let changed=false;
  for(const [name,value]of Object.entries({lastActive:now,ownerSeenAt:t.lastActive??now,settledAt:t.phase==='settled'?now:null}))if(t[name]===undefined){t[name]=value;changed=true;}
  return changed;
}
export function idleDeadline(t){
  if(t.phase==='closed')return null;
  const last=t.lastActive;
  return t.phase==='lobby'?last+LOBBY_IDLE_MS:t.phase==='settled'?Math.max(last,t.settledAt??last)+SETTLED_IDLE_MS:last+PLAY_IDLE_MS;
}
export function takeoverAt(t){return waiting(t)&&humans(t).some(p=>p.id!==t.owner)?(t.ownerSeenAt??t.lastActive)+OWNER_IDLE_MS:null;}
export function canTakeover(t,id,now=Date.now()){const at=takeoverAt(t);return at!==null&&now>=at&&id!==t.owner&&humans(t).some(p=>p.id===id);}
export function allActionableHumansTimedOut(t){
  const eligible=humans(t).filter(p=>p.inHand&&!p.folded&&p.stack>0);
  return eligible.length>0&&eligible.every(p=>Number.isFinite(p.timedOutAt)&&p.timedOutAt>=t.lastActive);
}
export function automaticCloseReason(t,now=Date.now()){
  if(t.phase==='closed')return null;
  if(!humans(t).length)return '没有真人留在牌桌，已自动关闭。';
  if(now<idleDeadline(t))return null;
  if(t.phase==='lobby')return '等待发牌期间 5 分钟无人进行有效操作，已自动关闭。';
  if(t.phase==='settled')return '本手结束后 10 分钟无人进行有效操作，已自动关闭。';
  return allActionableHumansTimedOut(t)?'10 分钟无人进行有效操作，且本手可行动的真人均已超时；本手取消，下注原数退回。':null;
}
export function idleWarning(t,now=Date.now()){
  const deadline=idleDeadline(t);if(deadline===null||now<deadline-WARNING_MS||now>=deadline)return null;
  return {deadline,conditional:!waiting(t)};
}
export function nextLifecycleAlarm(t,now=Date.now()){
  if(t.phase==='closed')return null;
  if(automaticCloseReason(t,now))return now+1;
  const deadline=idleDeadline(t),takeover=takeoverAt(t),dates=[];
  if(deadline>now)dates.push(deadline);
  if(deadline>now&&t.idleNoticeFor!==deadline)dates.push(Math.max(now+1,deadline-WARNING_MS));
  if(takeover!==null&&t.takeoverNoticeFor!==takeover)dates.push(Math.max(now+1,takeover));
  return dates.length?Math.min(...dates):null;
}
export function touchOwner(t,id,now=Date.now()){
  if(id!==t.owner||t.phase==='closed')return false;
  t.ownerSeenAt=now;t.takeoverNoticeFor=null;return true;
}
export function effectiveHumanAction(t,previousOwner,now=Date.now()){
  t.lastActive=now;t.idleNoticeFor=null;
  if(t.owner!==previousOwner){t.ownerSeenAt=now;t.takeoverNoticeFor=null;}
}
