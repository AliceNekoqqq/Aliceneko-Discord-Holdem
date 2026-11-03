import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {TavernService} from './tavern-service.mjs';
import {TavernAuction,AUCTION_TIERS} from './tavern-auction.mjs';
import {AUCTION_ITEMS} from './tavern-auction-data.mjs';
import {INVENTORY_TTL,SALE_LIMIT} from './tavern-auction-inventory.mjs';
import {auctionData} from './tavern-auction-ui.mjs';
import {inventoryData} from './tavern-auction-inventory-ui.mjs';
import {renderAuctionInventoryImage} from './tavern-auction-image.mjs';
import {answerTavern,immediateTavernReply,tavernDeferredReply} from './tavern-ui.mjs';
const base={guild:'3',id:'1',channel:'2',name:'Alice'},R=100000,now=Date.now();
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const map=new Map(),storage={get:async key=>map.get(key),put:async(key,value)=>map.set(key,value),sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length)return {toArray:()=>s.all(...a)};s.run(...a);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const x=fn();db.exec('COMMIT');return x;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const tavern=new TavernService(storage),auction=new TavernAuction(tavern,n=>n===10000?0:n-1);tavern._auction=auction;
 const fx=tavern.auctionCurrency;fx.view(base,now);tavern.sql.exec('UPDATE tavern_members SET balance=? WHERE id=?',20000,base.id);fx.convert({...base,token:fx.view(base,now).token,direction:'buy',amount:20000},now);
 return {db,storage,tavern,auction,inventory:auction.inventory,fx};
}
function win(e,{cinematic=false,tier='standard',old=false}={}){
 const p={...base,token:e.auction.view(base,now).offerToken,role:'sophie',tier,...(cinematic?{presentation:'warehouse'}:{})},s=e.auction.start(p,now),raw=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',p.token).state);
 if(old)delete raw.inventoryVersion;raw.committed=[0,0,0];e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(raw),p.token);
 const result=e.auction.bid({...base,token:p.token,round:1,bid:1},now);return {token:p.token,result,raw};
}
function chosen(e,ids){const v=e.inventory.view(base,now);return e.inventory.select({...base,token:v.token,selected:ids??[v.items[0].id]},now);}
const click=(action,values)=>({type:3,guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}},message:{flags:64},data:{custom_id:`t:3:1:${action}`,...(values?{values,component_type:3}:{component_type:2})}});
const envFor=e=>({TABLES:{idFromName:n=>n,get:()=>({fetch:async(url,o)=>{try{return Response.json(await e.tavern.dispatch(JSON.parse(o.body)));}catch(error){return Response.json({error:error.message});}}})}});
function bounds(view){assert(view.content.length<=2000,`content ${view.content.length}`);assert(view.components.length<=5);for(const row of view.components){assert(row.components.length<=5);for(const c of row.components){assert(c.custom_id.length<=100);if(c.label)assert(c.label.length<=80);if(c.options){assert(c.options.length<=25);for(const o of c.options){assert(o.label.length<=100);assert(o.value.length<=100);assert(o.description===undefined||o.description.length<=100);}}}}}

test('winning retains exactly eight immutable instances, refunds cash only, survives restart and never remints on replay',t=>{
 const e=fixture(t),before=e.fx.balance('1'),{token,result,raw}=win(e),total=raw.items.reduce((s,x)=>s+x.value,0),v=e.inventory.view(base,now);
 assert.equal(result.balance,before-R-1);assert.equal(result.session.inventoryVersion,1);assert.equal(result.session.result.resale,0);assert.equal(result.session.result.cashNet,-R-1);assert.equal(result.session.result.net,total-R-1);assert.equal(result.session.result.inventoryValue,total);
 assert.equal(v.count,8);assert.equal(v.locked,0);assert.equal(v.value,total);assert.equal(new Set(v.items.map(x=>x.id)).size,8);assert(v.items.every(x=>x.item.value===raw.items[0].value));
 assert.equal(e.tavern.one("SELECT COUNT(*) n FROM tavern_auction_ledger WHERE kind='auction_sale'").n,0);
 const restored=new TavernAuction(new TavernService(e.storage));assert.equal(restored.inventory.view(base,now).count,8);assert(restored.bid({...base,token,round:1,bid:1},now).repeated);assert.equal(restored.inventory.view(base,now).count,8);
 assert(auctionData(result,'3','1').content.includes('现金变化'));assert(auctionData(result,'3','1').content.includes('8件藏品已存入个人仓库'));
});
test('pending openings cannot leak through inventory, sale quotes, totals or later auctions; each revealed item unlocks once',t=>{
 const e=fixture(t),a=win(e,{cinematic:true}),before=e.inventory.view(base,now);
 assert.equal(before.count,0);assert.equal(before.value,0);assert.equal(before.locked,8);assert.equal(before.pending.token,a.token);assert(!JSON.stringify(before).includes('始祖秘传配方'));assert.throws(()=>e.inventory.quote({...base,token:before.token,quality:6},now),/没有可卖/);
 const b=win(e),view=e.auction.view(base,now);assert.equal(view.stats.net,b.result.session.result.net);assert.equal(e.inventory.view(base,now).locked,8);
 const one=e.auction.reveal({...base,token:a.token,step:0,all:false},now);assert.equal(one.session.reveal.count,1);assert.equal(e.inventory.view(base,now).count,9);e.auction.reveal({...base,token:a.token,step:0,all:false},now);assert.equal(e.inventory.view(base,now).count,9);
 const pending=e.inventory.view({...base,channel:'4'},now);assert.equal(pending.pending.channel,'2');assert.equal(pending.locked,7);
 e.auction.reveal({...base,token:a.token,step:1,all:true},now);assert.equal(e.inventory.view(base,now).locked,0);assert.equal(e.inventory.view(base,now).count,16);
});
test('single and multi-item sale quotes freeze the selection and credit once, including duplicate confirmations after expiry',t=>{
 const e=fixture(t);win(e);const v=e.inventory.view(base,now),ids=v.items.slice(0,3).map(x=>x.id),selected=e.inventory.select({...base,token:v.token,selected:ids},now),q=e.inventory.quote({...base,token:selected.token},now);
 e.inventory.select({...base,token:selected.token,selected:[v.items[3].id]},now);
 const before=e.fx.balance('1'),sold=e.inventory.sell({...base,token:q.token,total:1},now);assert.equal(sold.receipt.count,3);assert.equal(sold.balance,before+q.total);assert.equal(sold.count,5);
 const again=e.inventory.sell({...base,token:q.token},now+INVENTORY_TTL+1);assert(again.repeated);assert.equal(again.balance,sold.balance);assert.equal(again.count,5);
 const one=chosen(e),quote=e.inventory.quote({...base,token:one.token},now),done=e.inventory.sell({...base,token:quote.token},now);assert.equal(done.receipt.count,1);assert.equal(done.count,4);
 assert.equal(e.tavern.one("SELECT COUNT(*) n FROM tavern_auction_ledger WHERE kind='inventory_sale'").n,2);
});
test('display replacement returns the original item, display stock is protected from bulk sales, and stale quotes cannot sell it',t=>{
 const e=fixture(t);win(e);const v=e.inventory.view(base,now),first=chosen(e,[v.items[0].id]),q=e.inventory.quote({...base,token:first.token},now);
 let cabinet=e.inventory.place({...base,token:first.token,slot:0},now);assert.equal(cabinet.displayed,1);assert.equal(cabinet.cabinet[0].id,v.items[0].id);
 assert.throws(()=>e.inventory.sell({...base,token:q.token},now),/正在展示/);assert.throws(()=>e.inventory.quote({...base,token:first.token},now),/先撤下/);
 const second=chosen(e,[v.items[1].id]);cabinet=e.inventory.place({...base,token:second.token,slot:0},now);assert.equal(cabinet.count,8);assert.equal(cabinet.cabinet[0].id,v.items[1].id);assert.equal(e.inventory.units('1',[v.items[0].id])[0].display_slot,null);
 const all=e.inventory.quote({...base,token:cabinet.token,quality:6},now);assert.equal(all.count,7);const sold=e.inventory.sell({...base,token:all.token},now);assert.equal(sold.count,1);assert.equal(sold.displayed,1);
 const removed=e.inventory.remove({...base,token:sold.token,slot:0},now);assert.equal(removed.displayed,0);assert.equal(removed.count,1);const final=e.inventory.quote({...base,token:removed.token,quality:6},now);assert.equal(final.count,1);
});
test('overlapping sale windows, expired windows and forged owners or selections never double-spend stock',async t=>{
 const e=fixture(t);win(e);const a=chosen(e),b=chosen(e),qa=e.inventory.quote({...base,token:a.token},now),qb=e.inventory.quote({...base,token:b.token},now);
 e.inventory.sell({...base,token:qa.token},now);const cash=e.fx.balance('1');assert.throws(()=>e.inventory.sell({...base,token:qb.token},now),/已售出/);assert.equal(e.fx.balance('1'),cash);
 const good=chosen(e),q=e.inventory.quote({...base,token:good.token},now);assert.throws(()=>e.inventory.sell({...base,token:q.token},now+INVENTORY_TTL+1),/过期/);
 for(const extra of [{id:'4'},{channel:'4'},{token:'0'.repeat(16)}])assert.throws(()=>e.inventory.sell({...base,token:q.token,...extra},now));
 for(const ids of [['bogus'],[good.items[0].id,good.items[0].id],Array(10).fill(good.items[0].id)])assert.throws(()=>e.inventory.select({...base,token:good.token,selected:ids},now));
 await e.tavern.dispatch({...base,action:'auctionInventoryView'});await assert.rejects(()=>e.tavern.dispatch({...base,guild:'9',action:'auctionInventoryView'}),/服务器不匹配/);
 assert.equal(e.fx.balance('1'),cash);
});
test('inventory insertion and sale failures atomically roll back cash, stock, ledger, auction state and quote receipts',t=>{
 const e=fixture(t),s=e.auction.start({...base,token:e.auction.view(base,now).offerToken,role:'sophie'},now),token=s.session.token,raw=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);raw.committed=[0,0,0];e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(raw),token);
 const exec=e.storage.sql.exec,before=e.fx.balance('1');let inserted=0;
 e.storage.sql.exec=(q,...args)=>{if(q.startsWith('INSERT INTO tavern_auction_inventory(')&&++inserted===4)throw Error('disk');return exec(q,...args);};assert.throws(()=>e.auction.bid({...base,token,round:1,bid:1},now),/disk/);e.storage.sql.exec=exec;
 assert.equal(e.fx.balance('1'),before);assert.equal(e.inventory.view(base,now).count,0);assert.equal(e.auction.view(base,now).session.status,'active');e.auction.bid({...base,token,round:1,bid:1},now);
 const chosenView=chosen(e),q=e.inventory.quote({...base,token:chosenView.token},now),balance=e.fx.balance('1'),ledgers=e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n;
 e.storage.sql.exec=(sql,...args)=>{if(sql.startsWith('UPDATE tavern_auction_inventory SET sold_at'))throw Error('disk');return exec(sql,...args);};assert.throws(()=>e.inventory.sell({...base,token:q.token},now),/disk/);e.storage.sql.exec=exec;
 assert.equal(e.fx.balance('1'),balance);assert.equal(e.inventory.view(base,now).count,8);assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n,ledgers);assert.equal(e.tavern.one('SELECT status FROM tavern_auction_inventory_windows WHERE token=?',q.token).status,'ready');assert.equal(e.inventory.sell({...base,token:q.token},now).count,7);
});
test('old autosale sessions remain unchanged and never grant collectible duplicates',t=>{
 const e=fixture(t),before=e.fx.balance('1'),{result,raw,token}=win(e,{old:true}),total=raw.items.reduce((s,x)=>s+x.value,0);
 assert.equal(result.balance,before-R-1+total);assert.equal(result.session.result.resale,total);assert.equal(result.session.result.inventory,undefined);assert.equal(e.inventory.view(base,now).count,0);e.auction.bid({...base,token,round:1,bid:1},now);assert.equal(e.inventory.view(base,now).count,0);
});
test('stored prices survive every stake tier, exact dust and amounts beyond 32 bits through sale and bidirectional cashout',t=>{
 for(const tier of Object.keys(AUCTION_TIERS)){
  const e=fixture(t),{raw,result}=win(e,{tier}),v=e.inventory.view(base,now),q=e.inventory.quote({...base,token:v.token,quality:6},now),total=raw.items.reduce((s,x)=>s+x.value,0);assert.equal(q.total,total);
  const sold=e.inventory.sell({...base,token:q.token},now);assert.equal(sold.balance,result.balance+total);assert(Number.isSafeInteger(sold.balance));
  const x=e.fx.view(base,now),amount=Math.floor(sold.balance/R),exchange=e.fx.convert({...base,token:x.token,direction:'sell',amount},now);assert.equal(exchange.auctionBalance,sold.balance%R);assert.equal(exchange.tavernBalance,amount);
 }
});
test('quality bulk quotes cover more than one page, exclude exhibits and explicitly cap each immutable batch at 500',t=>{
 const e=fixture(t);win(e);const seed=e.inventory.view(base,now).items[0],white=AUCTION_ITEMS.find(x=>x.quality===0),gold=AUCTION_ITEMS.find(x=>x.quality===4);
 for(let j=0;j<510;j++)e.tavern.sql.exec('INSERT INTO tavern_auction_inventory(id,user_id,source,position,item,tier,acquired_at,revealed) VALUES(?,?,?,?,?,?,?,1)',`fixture-${j}`,'1',`fixture-${j}`,0,JSON.stringify(j===509?gold:white),'standard',now);
 const v=e.inventory.view(base,now),whiteQ=e.inventory.quote({...base,token:v.token,quality:0},now);assert.equal(whiteQ.count,SALE_LIMIT);assert.equal(whiteQ.total,SALE_LIMIT*white.value);const sold=e.inventory.sell({...base,token:whiteQ.token},now);assert.equal(sold.count,18);assert(sold.pages>1);
 const rest=e.inventory.quote({...base,token:sold.token,quality:0},now);assert.equal(rest.count,9);assert.equal(e.inventory.quote({...base,token:sold.token,quality:4},now).count,1);assert.equal(e.inventory.view({...base,page:999},now).page,1);
});

test('private inventory controls support select/sell/confirm and cabinet placement through the real UI dispatch',async t=>{
 const e=fixture(t);win(e);const env=envFor(e);let view=await answerTavern(env,click('auctionInventory~0'));bounds(view);assert(view._mapScene.bytes.length>1000);
 let select=view.components[0].components[0],ids=select.options.slice(0,2).map(x=>x.value);view=await answerTavern(env,click(select.custom_id.split(':')[3],ids));bounds(view);assert(view.content.includes('已选 2件'));
 view=await answerTavern(env,click(view.components[1].components[0].custom_id.split(':')[3]));bounds(view);assert(view.content.includes('确认出售 2件'));const confirm=view.components[0].components[0].custom_id.split(':')[3];
 view=await answerTavern(env,click(confirm));bounds(view);const cash=e.fx.balance('1');assert(view.content.includes('出售完成'));view=await answerTavern(env,click(confirm));assert.equal(e.fx.balance('1'),cash);assert(view.content.includes('没有重复入账'));
 select=view.components[0].components[0];view=await answerTavern(env,click(select.custom_id.split(':')[3],[select.options[0].value]));view=await answerTavern(env,click(view.components[1].components[1].custom_id.split(':')[3]));bounds(view);assert(view.content.includes('选择位置'));
 view=await answerTavern(env,click(view.components[0].components[0].custom_id.split(':')[3]));bounds(view);assert(view.content.includes('已陈列 **1/6件**'));
 for(const extra of [{member:{user:{id:'4'}}},{guild_id:'9'},{message:{flags:0}}])assert.equal(immediateTavernReply({...click(confirm),...extra}).type,4);
 assert.equal(tavernDeferredReply(click('auctionInventory~0')).type,6);for(const action of ['auctionInventory~-1','auctionInvPlace~123~9','auctionInvConfirm~no','auctionInventory~1000000'])assert.equal(immediateTavernReply(click(action)).type,4);
 view=await answerTavern(env,click('auctionInventory~0'));view=await answerTavern(env,click(view.components[1].components[2].custom_id.split(':')[3]));bounds(view);const bulk=view.components[0].components[0];view=await answerTavern(env,click(bulk.custom_id.split(':')[3],['6']));assert(view.content.includes('含红'));bounds(view);
});
test('inventory and six-bay cabinet render distinct real collection images, including empty and fully populated views',async t=>{
 const e=fixture(t);win(e);const rows=e.inventory.view(base,now).items;
 // Only the preview fixture changes species, preserving the real acquired-instance schema and renderer path.
 const qs=[0,1,2,3,4,5,5,4];for(let j=0;j<8;j++)e.tavern.sql.exec('UPDATE tavern_auction_inventory SET item=? WHERE id=?',JSON.stringify(AUCTION_ITEMS.find(x=>x.quality===qs[j]&&x.width*x.height===[1,2,4][j%3])),rows[j].id);
 for(let slot=0;slot<6;slot++){const v=chosen(e,[rows[slot+2].id]);e.inventory.place({...base,token:v.token,slot},now);}
 const data=e.inventory.view(base,now),inventory=await renderAuctionInventoryImage(data),cabinet=await renderAuctionInventoryImage(data,undefined,true),empty=await renderAuctionInventoryImage({...data,cabinet:[],displayed:0},undefined,true);
 assert.notDeepEqual(cabinet,empty);assert.notDeepEqual(inventory,cabinet);for(const image of [inventory,cabinet,empty]){assert.equal(new DataView(image.buffer).getUint32(16),760);assert(image.length>1000);}
 for(const mode of ['inventory','cabinet','place','bulk'])bounds(inventoryData(data,'12345678901234567890','12345678901234567890',mode));
 if(process.env.AUCTION_PREVIEW_DIR){await mkdir(process.env.AUCTION_PREVIEW_DIR,{recursive:true});for(const [name,bytes] of [['inventory',inventory],['cabinet',cabinet],['cabinet-empty',empty]])await writeFile(join(process.env.AUCTION_PREVIEW_DIR,`auction12-${name}.png`),bytes);}
});
