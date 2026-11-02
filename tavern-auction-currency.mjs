import {validId} from './tavern-catalog.mjs';
export const AUCTION_RATE=100_000;
export const EXCHANGE_TTL=5*60_000,EXCHANGE_MAX=1_000_000;
export const auctionAmount=n=>Number(n).toLocaleString('en-US');
export class TavernAuctionCurrency {
 constructor(tavern){
  this.tavern=tavern;this.sql=tavern.sql;this.storage=tavern.storage;
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_auction_wallets(user_id TEXT PRIMARY KEY,balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_auction_ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,amount INTEGER NOT NULL,kind TEXT NOT NULL,note TEXT NOT NULL,at INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_auction_ledger_user ON tavern_auction_ledger(user_id,at DESC)');
  this.sql.exec("CREATE TABLE IF NOT EXISTS tavern_auction_exchanges(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ready',created_at INTEGER NOT NULL,result TEXT)");
  this.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS tavern_auction_exchange_ready ON tavern_auction_exchanges(user_id,channel) WHERE status='ready'");
 }
 validate(p){if(!validId(p.id)||!validId(p.channel))throw Error('请在服务器频道打开自己的竞拍币兑换面板。');}
 balance(id){return this.tavern.one('SELECT balance FROM tavern_auction_wallets WHERE user_id=?',id)?.balance||0;}
 // Called inside the parent synchronous transaction, including its ledger and immutable receipt.
 adjust(id,delta,key,kind,note,now){
  const next=this.balance(id)+delta;
  if(!Number.isSafeInteger(delta)||!Number.isSafeInteger(next)||next<0)throw Error(next<0?'竞拍币不足，请先兑换。':'竞拍币金额超出范围。');
  this.sql.exec('INSERT INTO tavern_auction_wallets(user_id,balance) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET balance=excluded.balance',id,next);
  this.sql.exec('INSERT INTO tavern_auction_ledger VALUES(?,?,?,?,?,?)',key,id,delta,kind,note,now);return next;
 }
 ready(p,now){
  let r=this.tavern.one("SELECT token,created_at FROM tavern_auction_exchanges WHERE user_id=? AND channel=? AND status='ready'",p.id,p.channel);
  if(r&&r.created_at+EXCHANGE_TTL<=now){this.sql.exec('DELETE FROM tavern_auction_exchanges WHERE token=?',r.token);r=null;}
  if(!r){r={token:crypto.randomUUID().replaceAll('-','').slice(0,16)};this.sql.exec('INSERT INTO tavern_auction_exchanges(token,user_id,channel,created_at) VALUES(?,?,?,?)',r.token,p.id,p.channel,now);}return r.token;
 }
 snapshot(p,now,result=null,repeated=false){return {token:this.ready(p,now),rate:AUCTION_RATE,tavernBalance:this.tavern.one('SELECT balance FROM tavern_members WHERE id=?',p.id).balance,auctionBalance:this.balance(p.id),result,repeated,ledger:this.tavern.rows('SELECT amount,kind,note,at FROM tavern_auction_ledger WHERE user_id=? ORDER BY at DESC LIMIT 5',p.id)};}
 view(p,now=Date.now()){
  this.validate(p);let answer;this.storage.transactionSync(()=>{
   this.tavern.member(p.id,p.name,now,true);
   const last=this.tavern.one("SELECT result FROM tavern_auction_exchanges WHERE user_id=? AND channel=? AND status='done' ORDER BY created_at DESC LIMIT 1",p.id,p.channel);
   answer=this.snapshot(p,now,last?JSON.parse(last.result):null);
  });return answer;
 }
 convert(p,now=Date.now()){
  this.validate(p);
  if(!['buy','sell'].includes(p.direction)||!Number.isInteger(p.amount)||p.amount<1||p.amount>EXCHANGE_MAX||!/^[a-f0-9]{16}$/.test(p.token||''))throw Error('兑换数量须为1至1,000,000的整数，按酒馆币数量填写。');
  let answer;this.storage.transactionSync(()=>{
   const r=this.tavern.one('SELECT * FROM tavern_auction_exchanges WHERE token=?',p.token);
   if(!r||r.user_id!==p.id||r.channel!==p.channel)throw Error('这不是你在本频道的兑换窗口。');
   if(r.status==='done'){
    const old=JSON.parse(r.result);if(old.direction!==p.direction||old.tavernAmount!==p.amount)throw Error('这次兑换已经按另一数量或方向完成，请刷新。');
    answer=this.snapshot(p,now,old,true);return;
   }
   if(r.created_at+EXCHANGE_TTL<=now)throw Error('兑换窗口已过期，请刷新；尚未兑换。');
   const tavernDelta=p.direction==='buy'?-p.amount:p.amount,auctionDelta=-tavernDelta*AUCTION_RATE;
   const balance=this.tavern.one('SELECT balance FROM tavern_members WHERE id=?',p.id)?.balance;
   if(balance===undefined||balance+tavernDelta<0)throw Error('酒馆币不足，尚未兑换。');
   if(!Number.isSafeInteger(balance+tavernDelta))throw Error('酒馆币金额超出范围，尚未兑换。');
   const auctionBalance=this.adjust(p.id,auctionDelta,`auction:exchange:${p.token}`,`exchange_${p.direction}`,p.direction==='buy'?'酒馆币换入竞拍币':'竞拍币换回酒馆币',now);
   this.sql.exec('UPDATE tavern_members SET balance=? WHERE id=?',balance+tavernDelta,p.id);
   this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`auction:exchange:${p.token}`,p.id,tavernDelta,`auction_exchange_${p.direction}`,p.direction==='buy'?`兑换${auctionAmount(p.amount*AUCTION_RATE)}竞拍币`:`兑回${auctionAmount(p.amount)}酒馆币`,now);
   const result={direction:p.direction,tavernAmount:p.amount,auctionAmount:p.amount*AUCTION_RATE,rate:AUCTION_RATE,tavernAfter:balance+tavernDelta,auctionAfter:auctionBalance,at:now};
   this.sql.exec("UPDATE tavern_auction_exchanges SET status='done',result=? WHERE token=?",JSON.stringify(result),p.token);
   answer=this.snapshot(p,now,result);
  });return answer;
 }
 dispatch(p){if(p.action==='auctionExchangeView')return this.view(p);if(p.action==='auctionExchangeConvert')return this.convert(p);throw Error('无效竞拍币兑换操作。');}
}
