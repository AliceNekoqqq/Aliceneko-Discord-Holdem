import {validId} from './tavern-catalog.mjs';

export const SLOT_BETS=Object.freeze([10,20,50]);
export const SLOT_SYMBOLS=Object.freeze([
 {id:'cherry',name:'樱桃',emoji:'🍒',weight:3,triple:4},
 {id:'beer',name:'啤酒',emoji:'🍺',weight:2,triple:10},
 {id:'bean',name:'红豆',emoji:'🫘',weight:2,triple:15},
 {id:'bell',name:'铃铛',emoji:'🔔',weight:1,triple:30},
 {id:'diamond',name:'钻石',emoji:'💎',weight:1,triple:50},
 {id:'butterfly',name:'蝴蝶',emoji:'🦋',weight:1,triple:100}
].map(Object.freeze));
export const SLOT_STOPS=Object.freeze(SLOT_SYMBOLS.flatMap(s=>Array(s.weight).fill(s.id)));
export const SLOT_TTL=15*60_000;
export const SLOT_COOLDOWN=2500;

// Ten equally likely stops per independent reel. Reject the biased tail.
export function slotRandomStop(fill=a=>crypto.getRandomValues(a)){
 const a=new Uint32Array(1),limit=4294967290;
 do{fill(a);}while(a[0]>=limit);
 return a[0]%10;
}
export function evaluateSlots(symbols){
 if(!Array.isArray(symbols)||symbols.length!==3||symbols.some(id=>!SLOT_SYMBOLS.some(s=>s.id===id)))throw Error('无效老虎机结果。');
 if(symbols.every(id=>id===symbols[0]))return {kind:'triple',multiplier:SLOT_SYMBOLS.find(s=>s.id===symbols[0]).triple};
 return new Set(symbols).size===2?{kind:'pair',multiplier:1}:{kind:'none',multiplier:0};
}

export class TavernSlots {
 constructor(tavern,randomStop=slotRandomStop){
  this.tavern=tavern;this.sql=tavern.sql;this.storage=tavern.storage;this.randomStop=randomStop;
  this.sql.exec("CREATE TABLE IF NOT EXISTS tavern_slots (token TEXT PRIMARY KEY,user_id TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ready',created_at INTEGER NOT NULL,settled_at INTEGER,result TEXT)");
  this.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS tavern_slots_ready ON tavern_slots(user_id,channel) WHERE status='ready'");
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_slots_history ON tavern_slots(user_id,settled_at DESC)');
 }
 validate(p){if(!validId(p.id)||!validId(p.channel))throw Error('请在服务器内打开自己的老虎机。');}
 ready(id,channel,now){
  let ready=this.tavern.one("SELECT token,created_at FROM tavern_slots WHERE user_id=? AND channel=? AND status='ready'",id,channel);
  if(ready&&ready.created_at+SLOT_TTL<=now){this.sql.exec('DELETE FROM tavern_slots WHERE token=?',ready.token);ready=null;}
  if(!ready){ready={token:crypto.randomUUID().replaceAll('-','').slice(0,16),created_at:now};this.sql.exec('INSERT INTO tavern_slots(token,user_id,channel,created_at) VALUES(?,?,?,?)',ready.token,id,channel,now);}
  return ready.token;
 }
 snapshot(id,token,result=null,repeated=false){
  const member=this.tavern.one('SELECT balance FROM tavern_members WHERE id=?',id);
  const stats=this.tavern.one("SELECT COUNT(*) AS plays,COALESCE(SUM(json_extract(result,'$.bet')),0) AS wagered,COALESCE(SUM(json_extract(result,'$.payout')),0) AS returned FROM tavern_slots WHERE user_id=? AND status='settled'",id);
  return {token,balance:member?.balance??null,result,repeated,stats:{...stats,net:stats.returned-stats.wagered}};
 }
 view(p,now=Date.now()){
  this.validate(p);let token;
  this.storage.transactionSync(()=>{this.tavern.member(p.id,p.name,now,true);token=this.ready(p.id,p.channel,now);});
  const last=this.tavern.one("SELECT result FROM tavern_slots WHERE user_id=? AND channel=? AND status='settled' ORDER BY settled_at DESC LIMIT 1",p.id,p.channel);
  return this.snapshot(p.id,token,last?JSON.parse(last.result):null);
 }
 spin(p,now=Date.now()){
  this.validate(p);
  if(!SLOT_BETS.includes(p.bet)||!/^[-a-f0-9]{16}$/.test(p.token||''))throw Error('请从老虎机面板选择10、20或50币。');
  let answer;
  this.storage.transactionSync(()=>{
   const round=this.tavern.one('SELECT * FROM tavern_slots WHERE token=?',p.token);
   if(!round||round.user_id!==p.id||round.channel!==p.channel)throw Error('这不是你的老虎机窗口，请重新打开。');
   if(round.status==='settled'){
    const result=JSON.parse(round.result);
    if(result.bet!==p.bet)throw Error('本局已按另一金额结算，请刷新面板。');
    answer=this.snapshot(p.id,result.nextToken,result,true);return;
   }
   if(round.created_at+SLOT_TTL<=now)throw Error('老虎机窗口已过期，请重新打开，尚未扣币。');
   const last=this.tavern.one("SELECT settled_at FROM tavern_slots WHERE user_id=? AND status='settled' ORDER BY settled_at DESC LIMIT 1",p.id);
   if(last&&now-last.settled_at<SLOT_COOLDOWN)throw Error('本局刚刚结束，请稍候再转。');
   const member=this.tavern.one('SELECT balance FROM tavern_members WHERE id=?',p.id);
   if(!member||member.balance<p.bet)throw Error('酒馆币不足，请选择较低金额或返回钱包。');
   const symbols=Array.from({length:3},()=>{const n=this.randomStop();if(!Number.isInteger(n)||n<0||n>=10)throw Error('老虎机暂时不可用，尚未扣币。');return SLOT_STOPS[n];});
   const outcome=evaluateSlots(symbols),payout=p.bet*outcome.multiplier,balance=member.balance-p.bet+payout;
   if(!Number.isSafeInteger(balance))throw Error('钱包金额异常，尚未扣币。');
   this.sql.exec('UPDATE tavern_members SET balance=? WHERE id=?',balance,p.id);
   this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`slots:bet:${p.token}`,p.id,-p.bet,'slots_bet','老虎机 · 本局投入',now);
   if(payout)this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`slots:return:${p.token}`,p.id,payout,'slots_return','老虎机 · 返还（含本金）',now);
   // Release the unique pending slot before creating the next round, all atomic.
   this.sql.exec("UPDATE tavern_slots SET status='settled',settled_at=? WHERE token=?",now,p.token);
   const nextToken=this.ready(p.id,p.channel,now);
   const result={id:p.token,bet:p.bet,symbols,...outcome,payout,net:payout-p.bet,balanceAfter:balance,at:now,nextToken};
   this.sql.exec('UPDATE tavern_slots SET result=? WHERE token=?',JSON.stringify(result),p.token);
   answer=this.snapshot(p.id,nextToken,result);
  });
  return answer;
 }
 dispatch(p){if(p.action==='slotsView')return this.view(p);if(p.action==='slotsSpin')return this.spin(p);throw Error('无效老虎机操作。');}
}
