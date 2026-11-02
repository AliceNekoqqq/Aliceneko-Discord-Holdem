import {validId} from './tavern-catalog.mjs';
import {AUCTION_ITEMS} from './tavern-auction-data.mjs';
import {AUCTION_RATE} from './tavern-auction-currency.mjs';

export const AUCTION_BUDGET=200*AUCTION_RATE,AUCTION_FEE=10*AUCTION_RATE,AUCTION_TTL=30*60_000,AUCTION_READY_TTL=15*60_000;
export const AUCTION_QUALITIES=Object.freeze(['白','绿','蓝','紫','金','红']);
export const AUCTION_ROLES=Object.freeze({
 sophie:{name:'索菲',skill:'首轮随机获知5件品质，此后每轮再获知2件未知品质。'},
 gabriella:{name:'加布里埃拉',skill:'每轮随机获知2件完全未知藏品的品质与轮廓。'},
 viktor:{name:'维克托',skill:'开局获知紫、金、红品质藏品的合计件数。'}
});
const QUALITY_WEIGHTS=[30,25,20,13,8,4];
const TOKEN=/^[a-f0-9]{16}$/;
export function auctionRandom(n){
 if(!Number.isInteger(n)||n<1||n>0x100000000)throw Error('无效随机范围。');
 const a=new Uint32Array(1),limit=Math.floor(0x100000000/n)*n;
 do{crypto.getRandomValues(a);}while(a[0]>=limit);
 return a[0]%n;
}
export function shuffleAuction(list,random=auctionRandom){
 const a=[...list];for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;
}
export function generateAuction(random=auctionRandom){
 return Array.from({length:8},()=>{
  let ticket=random(100),quality=0;
  while(ticket>=QUALITY_WEIGHTS[quality])ticket-=QUALITY_WEIGHTS[quality++];
  return {...AUCTION_ITEMS[quality*4+random(4)]};
 });
}
export function revealAuction(items,info,role,round,random=auctionRandom){
 if(role==='viktor'){info.highCount=items.filter(x=>x.quality>=3).length;return;}
 const candidates=info.items.map((x,i)=>({x,i})).filter(({x})=>x.quality===null&&(role==='sophie'||x.width===null));
 const count=role==='sophie'&&round===1?5:2;
 for(const {x,i}of shuffleAuction(candidates,random).slice(0,count)){
  x.quality=items[i].quality;
  if(role==='gabriella'){x.width=items[i].width;x.height=items[i].height;}
 }
}
const emptyInfo=()=>({highCount:null,items:Array.from({length:8},()=>({quality:null,width:null,height:null}))});
// This function accepts ONLY an actor's disclosed information. No warehouse/state argument.
export function estimateAuction(info,unit=AUCTION_RATE){
 return info.items.reduce((sum,x)=>{
  const options=AUCTION_ITEMS.filter(c=>(x.quality===null||c.quality===x.quality)&&(x.width===null||c.width===x.width&&c.height===x.height));
  let value=0,weight=0;
  for(const c of options){
   const w=info.highCount===null?QUALITY_WEIGHTS[c.quality]/4:QUALITY_WEIGHTS[c.quality]/4*(c.quality>=3?info.highCount/2:(8-info.highCount)/6);
   value+=c.value*unit/AUCTION_RATE*w;weight+=w;
  }
  return sum+(weight?value/weight:0);
 },0);
}
export function npcAuctionBid(info,round,style,random=auctionRandom,unit=AUCTION_RATE){
 if(random(12)===0)return 0;
 const factor=[0.78,0.94,1.08][style]*(0.64+round*0.06)*(0.90+random(21)/100);
 return Math.min(200*unit,Math.max(1,Math.floor(estimateAuction(info,unit)*factor)));
}
export function decideAuction(round,bids,priority,budget=AUCTION_BUDGET){
 if(!Number.isInteger(round)||round<1||round>5||bids.length!==4||bids.some(b=>!Number.isInteger(b)||b<0||b>budget)||priority.length!==4||new Set(priority).size!==4||priority.some(x=>!Number.isInteger(x)||x<0||x>3))throw Error('无效竞拍回合。');
 const order=[0,1,2,3].sort((a,b)=>bids[b]-bids[a]||priority.indexOf(a)-priority.indexOf(b));
 const first=order[0],second=order[1];
 const done=round===5||bids[first]>0&&bids[first]*10>bids[second]*[20,16,13,11][round-1];
 return {done,winner:done&&bids[first]>0?first:null,price:done?bids[first]:0};
}
export class TavernAuction {
 constructor(tavern,random=auctionRandom){
  this.tavern=tavern;this.sql=tavern.sql;this.storage=tavern.storage;this.random=random;
  // Initialize before a gameplay transaction can roll back schema creation.
  this.tavern.auctionCurrency;
  this.sql.exec("CREATE TABLE IF NOT EXISTS tavern_auctions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,settled_at INTEGER,state TEXT)");
  this.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS tavern_auction_active ON tavern_auctions(user_id) WHERE status='active'");
  this.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS tavern_auction_ready ON tavern_auctions(user_id,channel) WHERE status='ready'");
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_auction_history ON tavern_auctions(user_id,settled_at DESC)');
 }
 validate(p){if(!validId(p.id)||!validId(p.channel))throw Error('请在服务器频道打开自己的仓库盲拍。');}
 load(p){
  this.validate(p);if(!TOKEN.test(p.token||''))throw Error('竞拍窗口无效，请重新打开。');
  const row=this.tavern.one('SELECT * FROM tavern_auctions WHERE token=?',p.token);
  if(!row||row.user_id!==p.id||row.channel!==p.channel)throw Error('这不是你在本频道的竞拍窗口。');
  return row;
 }
 ready(p,now){
  let row=this.tavern.one("SELECT * FROM tavern_auctions WHERE user_id=? AND channel=? AND status='ready'",p.id,p.channel);
  if(row&&row.created_at+AUCTION_READY_TTL<=now){this.sql.exec('DELETE FROM tavern_auctions WHERE token=?',row.token);row=null;}
  if(!row){row={token:crypto.randomUUID().replaceAll('-','').slice(0,16)};this.sql.exec("INSERT INTO tavern_auctions(token,user_id,channel,status,created_at) VALUES(?,?,?,'ready',?)",row.token,p.id,p.channel,now);}
  return row.token;
 }
 save(row,state){row.state=JSON.stringify(state);this.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',row.state,row.token);}
 stage(state){
  const roles=[state.role,'sophie','gabriella','viktor'];
  roles.forEach((role,i)=>revealAuction(state.items,state.infos[i],role,state.round,this.random));
  // Commit opponents before receiving the human's sealed offer, then persist with the round.
  state.committed=state.infos.slice(1).map((info,i)=>npcAuctionBid(info,state.round,i,this.random,state.currency==='auction'?AUCTION_RATE:1));
 }
 present(p,row,now,repeated=false){
  const state=row?.state?JSON.parse(row.state):null,settled=row?.status==='settled';
  const stats=this.tavern.one("SELECT COUNT(*) AS plays,COALESCE(SUM(CASE WHEN json_extract(state,'$.currency')='auction' THEN json_extract(state,'$.result.net') ELSE 0 END),0) AS net,COALESCE(SUM(CASE WHEN json_extract(state,'$.currency') IS NULL THEN json_extract(state,'$.result.net') ELSE 0 END),0) AS legacyNet FROM tavern_auctions WHERE user_id=? AND status='settled'",p.id);
  // Whitelist: hidden catalog identities, prices and opponent information never leave the guild DO.
  return {balance:this.tavern.auctionCurrency.balance(p.id),tavernBalance:this.tavern.one('SELECT balance FROM tavern_members WHERE id=?',p.id).balance,stats,repeated,
   offerToken:!state||settled?this.ready(p,now):null,
   session:state?{currency:state.currency||'tavern',budget:state.budget??200,fee:state.fee??10,token:row.token,channel:row.channel,readOnly:!settled&&row.channel!==p.channel,status:row.status,role:state.role,round:state.round,expires:state.expires,priority:state.priority,history:state.history,result:state.result||null,info:state.infos[0],items:settled?state.items:null}:null};
 }
 view(p,now=Date.now()){
  this.validate(p);let answer;
  this.storage.transactionSync(()=>{
   this.tavern.member(p.id,p.name,now,true);
   let row=this.tavern.one("SELECT * FROM tavern_auctions WHERE user_id=? AND status='active'",p.id);
   if(row&&JSON.parse(row.state).expires<=now)this.forfeit(row,JSON.parse(row.state),now,'expired');
   if(!row)row=this.tavern.one("SELECT * FROM tavern_auctions WHERE user_id=? AND channel=? AND status='settled' ORDER BY settled_at DESC LIMIT 1",p.id,p.channel);
   answer=this.present(p,row,now);
  });return answer;
 }
 start(p,now=Date.now()){
  if(!Object.hasOwn(AUCTION_ROLES,p.role))throw Error('请选择一种信息能力。');let answer;
  this.storage.transactionSync(()=>{
   const row=this.load(p);
   if(row.status!=='ready'){
    const existing=JSON.parse(row.state);
    if(existing.role!==p.role)throw Error('本次开局已选择另一能力，请刷新。');
    if(row.status==='active'&&existing.expires<=now)this.forfeit(row,existing,now,'expired');
    answer=this.present(p,row,now,true);return;
   }
   const active=this.tavern.one("SELECT * FROM tavern_auctions WHERE user_id=? AND status='active'",p.id);
   if(active){if(JSON.parse(active.state).expires<=now)this.forfeit(active,JSON.parse(active.state),now,'expired');else throw Error('你已有一局竞拍，请先恢复或结束该局。');}
   if(row.created_at+AUCTION_READY_TTL<=now)throw Error('开局窗口已过期，请刷新；尚未扣币。');
   if(this.tavern.auctionCurrency.balance(p.id)<AUCTION_BUDGET+AUCTION_FEE)throw Error('需要2,100万竞拍币：2,000万预算及100万入场费，请先用酒馆币兑换。');
   const state={currency:'auction',budget:AUCTION_BUDGET,fee:AUCTION_FEE,role:p.role,items:generateAuction(this.random),round:1,expires:now+AUCTION_TTL,priority:shuffleAuction([0,1,2,3],this.random),infos:Array.from({length:4},emptyInfo),history:[]};
   this.stage(state);
   this.ledger(row,state,'fee',-AUCTION_FEE,'仓库盲拍 · 入场费',now);
   this.ledger(row,state,'hold',-AUCTION_BUDGET,'仓库盲拍 · 暂存竞拍预算',now);
   row.status='active';this.sql.exec("UPDATE tavern_auctions SET status='active' WHERE token=?",p.token);this.save(row,state);
   answer=this.present(p,row,now);
  });return answer;
 }
 ledger(row,state,kind,amount,note,now){
  if(state.currency==='auction')return this.tavern.auctionCurrency.adjust(row.user_id,amount,`auction:${kind}:${row.token}`,`auction_${kind}`,note,now);
  // Legacy sessions keep their original tavern-coin escrow and values, never convert implicitly.
  this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`auction:${kind}:${row.token}`,row.user_id,amount,`auction_${kind}`,note,now);
 }
 settle(row,state,outcome,now,reason){
  const budget=state.budget??200,fee=state.fee??10,newCurrency=state.currency==='auction';
  const total=state.items.reduce((sum,x)=>sum+x.value,0),won=outcome.winner===0,refund=budget-(won?outcome.price:0),resale=won?total:0;
  const balance=(newCurrency?this.tavern.auctionCurrency.balance(row.user_id):this.tavern.one('SELECT balance FROM tavern_members WHERE id=?',row.user_id).balance)+refund+resale;
  if(!Number.isSafeInteger(balance))throw Error('钱包金额异常，竞拍未结算。');
  if(!newCurrency)this.sql.exec('UPDATE tavern_members SET balance=? WHERE id=?',balance,row.user_id);
  if(refund)this.ledger(row,state,'refund',refund,'仓库盲拍 · 未用预算退回',now);
  if(resale)this.ledger(row,state,'sale',resale,'仓库盲拍 · 藏品自动结算',now);
  state.result={winner:outcome.winner,price:outcome.price,total,refund,resale,net:refund+resale-budget-fee,balanceAfter:balance,reason,at:now};
  state.committed=[];row.status='settled';this.sql.exec("UPDATE tavern_auctions SET status='settled',settled_at=? WHERE token=?",now,row.token);this.save(row,state);
 }
 advance(row,state,bid,now,reason='bid'){
  const bids=[bid,...state.committed],outcome=decideAuction(state.round,bids,state.priority,state.budget??200);
  state.history.push({round:state.round,bids,winner:outcome.winner,done:outcome.done});
  if(outcome.done){this.settle(row,state,outcome,now,reason);return;}
  state.round++;this.stage(state);this.save(row,state);
 }
 forfeit(row,state,now,reason){while(row.status==='active')this.advance(row,state,0,now,reason);}
 bid(p,now=Date.now()){
  if(!Number.isInteger(p.bid)||p.bid<0||p.bid>AUCTION_BUDGET||!Number.isInteger(p.round)||p.round<1||p.round>5)throw Error('报价须为0至20,000,000的整数，0表示本轮不出价。');let answer;
  this.storage.transactionSync(()=>{
   const row=this.load(p);if(row.status==='ready')throw Error('请先选择能力开始。');const state=JSON.parse(row.state);
   if(p.bid>(state.budget??200))throw Error(state.currency==='auction'?'报价超出本局竞拍币预算。':'这是旧版酒馆币局，报价上限仍为200酒馆币。');
   const old=state.history.find(x=>x.round===p.round);
   if(old){
    if(old.bids[0]!==p.bid)throw Error('这一轮已提交另一报价，请刷新查看当前回合。');
    if(row.status==='active'&&state.expires<=now)this.forfeit(row,state,now,'expired');
    answer=this.present(p,row,now,true);return;
   }
   if(row.status!=='active'||p.round!==state.round)throw Error('回合已变化，请刷新后报价。');
   if(state.expires<=now){this.forfeit(row,state,now,'expired');answer=this.present(p,row,now);return;}
   this.advance(row,state,p.bid,now);answer=this.present(p,row,now);
  });return answer;
 }
 leave(p,now=Date.now()){
  let answer;this.storage.transactionSync(()=>{
   const row=this.load(p);if(row.status==='ready')throw Error('请先开始竞拍。');const state=JSON.parse(row.state);
   if(row.status==='settled'){answer=this.present(p,row,now,true);return;}
   if(p.round!==state.round)throw Error('回合已变化，请刷新后操作。');
   this.forfeit(row,state,now,state.expires<=now?'expired':'leave');answer=this.present(p,row,now);
  });return answer;
 }
 dispatch(p){if(p.action==='auctionView')return this.view(p);if(p.action==='auctionStart')return this.start(p);if(p.action==='auctionBid')return this.bid(p);if(p.action==='auctionLeave')return this.leave(p);throw Error('无效竞拍操作。');}
}
