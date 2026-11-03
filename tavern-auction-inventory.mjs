import {validId} from './tavern-catalog.mjs';
export const INVENTORY_PAGE=9,DISPLAY_SLOTS=6,SALE_LIMIT=500,INVENTORY_TTL=15*60_000;
const TOKEN=/^[a-f0-9]{16}$/,ITEM=/^[a-f0-9]{16}_[0-7]$/;
const token=()=>crypto.randomUUID().replaceAll('-','').slice(0,16);
export class TavernAuctionInventory {
 constructor(tavern){
  this.tavern=tavern;this.sql=tavern.sql;this.storage=tavern.storage;
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_auction_inventory(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source TEXT NOT NULL,position INTEGER NOT NULL,item TEXT NOT NULL,tier TEXT NOT NULL,acquired_at INTEGER NOT NULL,revealed INTEGER NOT NULL DEFAULT 0,sold_at INTEGER,display_slot INTEGER,UNIQUE(source,position))');
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_auction_inventory_owner ON tavern_auction_inventory(user_id,sold_at,revealed,acquired_at DESC)');
  this.sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS tavern_auction_display_slot ON tavern_auction_inventory(user_id,display_slot) WHERE sold_at IS NULL AND display_slot IS NOT NULL');
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_auction_inventory_windows(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,channel TEXT NOT NULL,kind TEXT NOT NULL,created_at INTEGER NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT \'ready\',receipt TEXT)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_auction_inventory_window_age ON tavern_auction_inventory_windows(kind,status,created_at)');
 }
 validate(p){if(!validId(p.id)||!validId(p.channel))throw Error('请从本人的私密藏品面板操作。');}
 // Called inside the auction's settlement/reveal transaction; never recalculate catalog prices.
 acquire(row,state,now){
  state.items.forEach((item,i)=>{
   if(!Number.isSafeInteger(item.value)||item.value<0)throw Error('藏品价值异常，未完成结算。');
   this.sql.exec('INSERT INTO tavern_auction_inventory(id,user_id,source,position,item,tier,acquired_at,revealed) VALUES(?,?,?,?,?,?,?,?)',`${row.token}_${i}`,row.user_id,row.token,i,JSON.stringify(item),state.tier||'standard',now,state.revealOrder?0:1);
  });
 }
 unlock(user,source,indices){for(const i of indices)this.sql.exec('UPDATE tavern_auction_inventory SET revealed=1 WHERE user_id=? AND source=? AND position=?',user,source,i);}
 window(p,kind,body,now){
  this.sql.exec("DELETE FROM tavern_auction_inventory_windows WHERE (kind='page' OR status='ready') AND created_at<?",now-24*60*60_000);
  const key=token();this.sql.exec('INSERT INTO tavern_auction_inventory_windows(token,user_id,channel,kind,created_at,body) VALUES(?,?,?,?,?,?)',key,p.id,p.channel,kind,now,JSON.stringify(body));return key;
 }
 load(p,kind,now){
  this.validate(p);if(!TOKEN.test(p.token||''))throw Error('藏品窗口失效，请刷新。');
  const r=this.tavern.one('SELECT * FROM tavern_auction_inventory_windows WHERE token=?',p.token);
  if(!r||r.user_id!==p.id||r.channel!==p.channel||r.kind!==kind)throw Error('这不是你在本频道的藏品窗口。');
  if(r.status!=='done'&&r.created_at+INVENTORY_TTL<=now)throw Error('藏品窗口已过期，请刷新；尚未出售。');
  return {...r,body:JSON.parse(r.body)};
 }
 units(user,ids){
  return this.tavern.rows('SELECT * FROM tavern_auction_inventory WHERE user_id=? AND sold_at IS NULL AND revealed=1 AND id IN (SELECT value FROM json_each(?))',user,JSON.stringify(ids)).map(r=>({...r,item:JSON.parse(r.item)}));
 }
 summary(p){
  const x=this.tavern.one('SELECT COUNT(*) count,COALESCE(SUM(CASE WHEN revealed=1 THEN 1 ELSE 0 END),0) visible,COALESCE(SUM(CASE WHEN revealed=1 THEN json_extract(item,\'$.value\') ELSE 0 END),0) value,COALESCE(SUM(CASE WHEN display_slot IS NOT NULL THEN 1 ELSE 0 END),0) displayed FROM tavern_auction_inventory WHERE user_id=? AND sold_at IS NULL',p.id);
  const cabinet=this.tavern.rows('SELECT * FROM tavern_auction_inventory WHERE user_id=? AND sold_at IS NULL AND revealed=1 AND display_slot IS NOT NULL ORDER BY display_slot',p.id).map(r=>({...r,item:JSON.parse(r.item)}));
  const pending=this.tavern.one("SELECT token,channel,json_extract(state,'$.opened') opened FROM tavern_auctions WHERE user_id=? AND status='settled' AND json_extract(state,'$.inventoryVersion')=1 AND json_extract(state,'$.result.winner')=0 AND json_extract(state,'$.opened')<8 ORDER BY settled_at DESC LIMIT 1",p.id);
  return {balance:this.tavern.auctionCurrency.balance(p.id),count:x.visible,locked:x.count-x.visible,value:x.value,displayed:x.displayed,cabinet,pending};
 }
 page(p,now,existing=null){
  const summary=this.summary(p),pages=Math.max(1,Math.ceil(summary.count/INVENTORY_PAGE)),page=Math.min(Math.max(0,p.page??0),pages-1);
  const ids=existing?.body.ids??this.tavern.rows('SELECT id FROM tavern_auction_inventory WHERE user_id=? AND sold_at IS NULL AND revealed=1 ORDER BY acquired_at DESC,id LIMIT ? OFFSET ?',p.id,INVENTORY_PAGE,page*INVENTORY_PAGE).map(x=>x.id);
  const selected=existing?.body.selected??[],key=existing?.token??this.window(p,'page',{page,ids,selected},now),items=this.units(p.id,ids).sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
  return {...summary,mode:'inventory',token:key,page,pages,items,selected:selected.filter(id=>items.some(x=>x.id===id)),receipt:p.receipt??null,repeated:!!p.repeated};
 }
 view(p,now=Date.now()){
  this.validate(p);if(p.page!==undefined&&(!Number.isInteger(p.page)||p.page<0||p.page>100000))throw Error('无效藏品页码。');
  let answer;this.storage.transactionSync(()=>{this.tavern.member(p.id,p.name,now,true);answer=this.page(p,now);});return answer;
 }
 select(p,now=Date.now()){
  let answer;this.storage.transactionSync(()=>{
   const r=this.load(p,'page',now),ids=p.selected;
   if(!Array.isArray(ids)||ids.length>INVENTORY_PAGE||new Set(ids).size!==ids.length||ids.some(id=>!ITEM.test(id)||!r.body.ids.includes(id))||this.units(p.id,ids).length!==ids.length)throw Error('藏品选择已变化，请刷新。');
   r.body.selected=ids;this.sql.exec('UPDATE tavern_auction_inventory_windows SET body=? WHERE token=?',JSON.stringify(r.body),r.token);
   answer=this.page({...p,page:r.body.page},now,r);
  });return answer;
 }
 menu(p,now=Date.now()){
  let answer;this.storage.transactionSync(()=>{const r=this.load(p,'page',now);answer=this.page({...p,page:r.body.page},now,r);});return answer;
 }
 quote(p,now=Date.now()){
  this.validate(p);let answer;this.storage.transactionSync(()=>{
   const r=this.load(p,'page',now);let ids;
   if(p.quality===undefined)ids=r.body.selected;
   else{
    if(!Number.isInteger(p.quality)||p.quality<0||p.quality>6)throw Error('请选择有效品质。');
    ids=this.tavern.rows('SELECT id FROM tavern_auction_inventory WHERE user_id=? AND sold_at IS NULL AND revealed=1 AND display_slot IS NULL AND (?=6 OR json_extract(item,\'$.quality\')=?) ORDER BY acquired_at,id LIMIT ?',p.id,p.quality,p.quality,SALE_LIMIT).map(x=>x.id);
   }
   const items=this.units(p.id,ids);
   if(!ids.length||items.length!==ids.length)throw Error('没有可卖藏品，或选择已变化。');
   if(items.some(x=>x.display_slot!==null))throw Error('展示中的藏品请先撤下，再出售。');
   const total=items.reduce((s,x)=>s+x.item.value,0);if(!Number.isSafeInteger(total))throw Error('出售金额超出范围。');
   const body={ids,total,page:r.body.page,quality:p.quality??null},key=this.window(p,'sale',body,now);
   const summary=this.summary(p);answer={...summary,ownedCount:summary.count,mode:'sale',token:key,count:ids.length,total,items:items.slice(0,INVENTORY_PAGE),quality:body.quality,expires:now+INVENTORY_TTL};
  });return answer;
 }
 sell(p,now=Date.now()){
  let answer;this.storage.transactionSync(()=>{
   const r=this.load(p,'sale',now);
   if(r.status==='done'){answer=this.page({...p,page:r.body.page,receipt:JSON.parse(r.receipt),repeated:true},now);return;}
   const items=this.units(p.id,r.body.ids);
   if(items.length!==r.body.ids.length||items.some(x=>x.display_slot!==null)||items.reduce((s,x)=>s+x.item.value,0)!==r.body.total)throw Error('藏品已售出或正在展示，本次未出售；请刷新。');
   const balance=this.tavern.auctionCurrency.adjust(p.id,r.body.total,`auction:inventory-sale:${r.token}`,'inventory_sale',`手动出售${items.length}件藏品`,now);
   this.sql.exec('UPDATE tavern_auction_inventory SET sold_at=? WHERE user_id=? AND id IN (SELECT value FROM json_each(?))',now,p.id,JSON.stringify(r.body.ids));
   const receipt={count:items.length,total:r.body.total,balance,at:now};
   this.sql.exec("UPDATE tavern_auction_inventory_windows SET status='done',receipt=? WHERE token=?",JSON.stringify(receipt),r.token);
   answer=this.page({...p,page:r.body.page,receipt},now);
  });return answer;
 }
 place(p,now=Date.now()){
  let answer;this.storage.transactionSync(()=>{
   const r=this.load(p,'page',now);
   if(!Number.isInteger(p.slot)||p.slot<0||p.slot>=DISPLAY_SLOTS||r.body.selected.length!==1)throw Error('请先选择一件藏品，再指定展示位置。');
   const [unit]=this.units(p.id,r.body.selected);if(!unit)throw Error('藏品已变化，请刷新。');
   this.sql.exec('UPDATE tavern_auction_inventory SET display_slot=NULL WHERE user_id=? AND display_slot=?',p.id,p.slot);
   this.sql.exec('UPDATE tavern_auction_inventory SET display_slot=? WHERE user_id=? AND id=?',p.slot,p.id,unit.id);
   answer=this.page({...p,page:r.body.page},now);
  });return answer;
 }
 remove(p,now=Date.now()){
  let answer;this.storage.transactionSync(()=>{
   this.load(p,'page',now);if(!Number.isInteger(p.slot)||p.slot<0||p.slot>=DISPLAY_SLOTS)throw Error('无效展示位置。');
   this.sql.exec('UPDATE tavern_auction_inventory SET display_slot=NULL WHERE user_id=? AND display_slot=?',p.id,p.slot);
   answer=this.page(p,now);
  });return answer;
 }
 dispatch(p){
  if(p.action==='auctionInventoryView')return this.view(p);
  if(p.action==='auctionInventorySelect')return this.select(p);
  if(p.action==='auctionInventoryMenu')return this.menu(p);
  if(p.action==='auctionInventoryQuote')return this.quote(p);
  if(p.action==='auctionInventorySell')return this.sell(p);
  if(p.action==='auctionInventoryPlace')return this.place(p);
  if(p.action==='auctionInventoryRemove')return this.remove(p);
  throw Error('无效藏品操作。');
 }
}
