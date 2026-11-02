import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFile} from 'node:fs/promises';
import {TavernService} from './tavern-service.mjs';
import {TavernAuction,AUCTION_TIERS,AUCTION_MAX_BUDGET,AUCTION_TTL,AUCTION_READY_TTL,auctionRandom,generateAuction,revealAuction,estimateAuction,npcAuctionBid,decideAuction} from './tavern-auction.mjs';
import {AUCTION_RATE as R,EXCHANGE_TTL,EXCHANGE_MAX,TavernAuctionCurrency} from './tavern-auction-currency.mjs';
import {AUCTION_ITEMS} from './tavern-auction-data.mjs';
import {auctionData,auctionRules,auctionCatalog} from './tavern-auction-ui.mjs';
import {currencyData} from './tavern-auction-currency-ui.mjs';
import {answerTavern,immediateTavernReply,tavernDeferredReply,tavernCommand,finishTavern} from './tavern-ui.mjs';
import {renderAuctionImage} from './tavern-auction-image.mjs';
const base={guild:'3',id:'1',channel:'2',name:'Alice'},cash=n=>n*R;
function setup(t,fund=500,initializeCurrency=true){
 const db=new DatabaseSync(':memory:'),map=new Map();t.after(()=>db.close());let calls=0;
 const storage={sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length){const r=s.all(...a);return {toArray:()=>r,one:()=>r[0]};}s.run(...a);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>map.get(k),put:async(k,v)=>map.set(k,v)};
 const tavern=new TavernService(storage),auction=new TavernAuction(tavern,n=>{calls++;return n-1;});tavern._auction=auction;const fx=initializeCurrency?tavern.auctionCurrency:null;
 if(initializeCurrency){fx.view(base,1000);if(fund){const v=fx.view(base,1000);fx.convert({...base,token:v.token,direction:'buy',amount:fund},1001);}}
 return {db,storage,tavern,auction,fx,calls:()=>calls};
}
test('a cold old ready window can fail for insufficient funds without rolling back currency initialization',t=>{
 const e=setup(t,0,false),a=e.auction,token='0123456789abcdef';
 e.tavern.member(base.id,base.name,1000);
 e.tavern.sql.exec("INSERT INTO tavern_auctions(token,user_id,channel,status,created_at) VALUES(?,?,?,'ready',?)",token,base.id,base.channel,1000);
 assert.throws(()=>a.start({...base,token,role:'sophie'},1001),/先用酒馆币兑换/);
 assert.equal(a.view(base,1002).balance,0);
 const fx=e.tavern.auctionCurrency,v=fx.view(base,1003);assert.equal(v.tavernBalance,500);assert.equal(v.auctionBalance,0);
 assert.equal(e.tavern.view(base.id,base.name,1004).member.balance,500);
 assert.equal(e.tavern.one("SELECT COUNT(*) n FROM tavern_ledger WHERE kind LIKE 'auction_%'").n,0);
 fx.convert({...base,token:v.token,direction:'buy',amount:210},1005);
 const started=a.start({...base,token,role:'sophie'},1006);assert.equal(started.balance,0);assert.equal(started.tavernBalance,290);
 assert.equal(a.leave({...base,token,round:1},1007).balance,200*R);
});
function open(a,role='sophie',now=1002){const v=a.view(base,now);return a.start({...base,token:v.offerToken,role},now+1);}
function force(e,token,bids,priority){const r=e.tavern.one('SELECT * FROM tavern_auctions WHERE token=?',token),s=JSON.parse(r.state);s.committed=bids;if(priority)s.priority=priority;e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(s),token);}
const i=(action='auction',extra={})=>({type:3,id:'999',token:'temporary',guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}},message:{flags:64},data:{custom_id:`t:3:1:${action}`},...extra});
const submit=(action,key,value)=>i(action,{type:5,data:{custom_id:`t:3:1:${action}`,components:[{type:1,components:[{type:4,custom_id:key,value}]}]}});
const envFor=s=>({TABLES:{idFromName:n=>n,get:()=>({fetch:async(url,o)=>{try{return Response.json(await s.dispatch(JSON.parse(o.body)));}catch(e){return Response.json({error:e.message});}}})}});
function bounds(d){assert(d.content.length<=2000,`content ${d.content.length}`);assert(d.components.length<=5);for(const r of d.components){assert(r.components.length<=5);for(const c of r.components){assert(c.custom_id.length<=100);assert(c.label.length<=80);}}}
function legacy(e){
 const token=e.auction.view(base,1000).offerToken,items=Array.from({length:8},()=>({...AUCTION_ITEMS[23],value:150})),empty=()=>({highCount:null,items:items.map(()=>({quality:null,width:null,height:null}))});
 const state={role:'sophie',items,round:1,expires:1000+AUCTION_TTL,priority:[0,1,2,3],infos:Array.from({length:4},empty),history:[],committed:[40,50,60]};
 e.tavern.sql.exec("UPDATE tavern_members SET balance=290 WHERE id='1'");
 for(const [kind,amount]of [['fee',-10],['hold',-200]])e.tavern.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`auction:${kind}:${token}`,'1',amount,`auction_${kind}`,'旧版暂存',1000);
 e.tavern.sql.exec("UPDATE tavern_auctions SET status='active',state=? WHERE token=?",JSON.stringify(state),token);return token;
}

test('strict early-win boundaries, integer bids, final ties and all-pass auctions work at the larger scale',()=>{
 for(const [round,bid,second]of [[1,(200*R),(100*R)],[2,(160*R),(100*R)],[3,(130*R),(100*R)],[4,(110*R),(100*R)]]){
  assert.equal(decideAuction(round,[bid,second,0,0],[0,1,2,3]).done,false);
  if(bid<(200*R))assert.equal(decideAuction(round,[bid+1,second,0,0],[0,1,2,3]).winner,0);
 }
 assert.equal(decideAuction(1,[(200*R-1),(100*R-1),0,0],[0,1,2,3]).winner,0);
 assert.equal(decideAuction(5,[(50*R),(50*R),0,0],[1,0,2,3]).winner,1);
 assert.deepEqual(decideAuction(5,[0,0,0,0],[0,1,2,3]),{done:true,winner:null,price:0});
 for(const [r,b,p]of [[0,[0,0,0,0],[0,1,2,3]],[5,[(200*R+1),0,0,0],[0,1,2,3]],[5,[0,0,0,0],[0,1,1,3]]])assert.throws(()=>decideAuction(r,b,p));
 assert.throws(()=>decideAuction(1,[201,0,0,0],[0,1,2,3],200));
});
test('24-item catalog values scale by 100000 while independent generation and unbiased sampling stay intact',()=>{
 assert.equal(AUCTION_ITEMS.length,24);assert.equal(new Set(AUCTION_ITEMS.map(x=>x.id)).size,24);
 assert(generateAuction(n=>n-1).every(x=>x.quality===5&&x.value===cash(150)));assert.equal(AUCTION_ITEMS[0].value,(4*R));
 const original=crypto.getRandomValues;let k=0;try{crypto.getRandomValues=a=>{a[0]=k++?4294967289:4294967295;return a;};assert.equal(auctionRandom(10),9);assert.equal(k,2);}finally{crypto.getRandomValues=original;}
});
test('three information abilities reveal only stated fields and NPCs cannot read private warehouse data or a human bid',()=>{
 const items=AUCTION_ITEMS.slice(0,8),empty=()=>({highCount:null,items:items.map(()=>({quality:null,width:null,height:null}))});
 const sophie=empty();revealAuction(items,sophie,'sophie',1,n=>n-1);assert.equal(sophie.items.filter(x=>x.quality!==null).length,5);assert(sophie.items.every(x=>x.width===null));revealAuction(items,sophie,'sophie',2,n=>n-1);assert.equal(sophie.items.filter(x=>x.quality!==null).length,7);
 const gab=empty();revealAuction(items,gab,'gabriella',1,n=>n-1);assert.equal(gab.items.filter(x=>x.width!==null).length,2);
 const victor=empty();revealAuction([AUCTION_ITEMS[12],AUCTION_ITEMS[16],AUCTION_ITEMS[20],...items.slice(0,5)],victor,'viktor',1);assert.equal(victor.highCount,3);assert(victor.items.every(x=>x.quality===null&&x.width===null));
 const info=empty();assert(Math.abs(estimateAuction(info)-(218.6*R))<0.00001);assert(Math.abs(estimateAuction(info,1)-218.6)<0.00001);
 const poisoned={...info,items:info.items.map(x=>({...x,get value(){throw Error('private read');},get name(){throw Error('private read');}})),get bid(){throw Error('bid read');}};
 assert.equal(npcAuctionBid(info,1,1,n=>n-1),npcAuctionBid(poisoned,1,1,n=>n-1));assert(estimateAuction({...info,highCount:0})<estimateAuction({...info,highCount:8}));
});
test('new wallets start at zero; opening never converts or spends tavern coins implicitly',t=>{
 const e=setup(t,0),v=e.auction.view(base,1002);assert.equal(v.balance,0);assert.equal(v.tavernBalance,500);
 assert.throws(()=>e.auction.start({...base,token:v.offerToken,role:'sophie'},1003),/2,100万/);assert.equal(e.tavern.member('1').balance,500);
 const f=e.fx.view(base,1004);e.fx.convert({...base,token:f.token,direction:'buy',amount:210},1005);
 const s=e.auction.start({...base,token:v.offerToken,role:'sophie'},1006);assert.equal(s.balance,0);assert.equal(s.tavernBalance,290);assert.equal(s.session.currency,'auction');
 assert.equal(e.auction.leave({...base,token:s.session.token,round:1},1007).balance,(200*R));assert.equal(e.tavern.member('1').balance,290);
});
test('auction-coin fees, escrow, resale and receipts settle once across replay and reconstruction',t=>{
 const e=setup(t),a=e.auction,v=a.view(base,1002),p={...base,token:v.offerToken,role:'sophie'},s=a.start(p,1003),token=s.session.token;
 assert.equal(s.balance,(290*R));assert.equal(s.tavernBalance,0);assert.equal(s.session.items,null);const count=e.calls();assert.equal(a.start(p,1004).balance,(290*R));assert.equal(e.calls(),count);
 force(e,token,[(40*R),(50*R),(60*R)]);const bid={...base,token,round:1,bid:(150*R)},r=a.bid(bid,1005);assert.equal(r.balance,(1540*R));assert.equal(r.session.result.net,(1040*R));assert.equal(r.session.result.refund,(50*R));assert.equal(r.session.result.resale,(1200*R));
 const restored=new TavernAuction(new TavernService(e.storage),()=>{throw Error('rerolled');}),again=restored.bid(bid,2000);assert(again.repeated);assert.deepEqual(again.session.result,r.session.result);assert.equal(again.balance,r.balance);
 assert.equal(e.tavern.one("SELECT COUNT(*) n FROM tavern_auction_ledger WHERE kind LIKE 'auction_%'").n,4);assert.equal(e.tavern.member('1').balance,0);assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_daily').n,0);assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_orders').n,0);assert.throws(()=>restored.bid({...bid,bid:(150*R-1)}),/另一报价/);
});
test('five-round bids may decrease and include single auction coins; settlement preserves the exact remainder',t=>{
 const e=setup(t),s=open(e.auction),token=s.session.token;let r;
 for(let round=1;round<=5;round++){force(e,token,[(100*R),(100*R),(100*R)],[0,1,2,3]);r=e.auction.bid({...base,token,round,bid:round===1?(150*R):(100*R+1)},1010+round);}
 assert.equal(r.session.result.price,(100*R+1));assert.equal(r.balance,(1590*R-1));assert.equal(r.session.history.length,5);
 assert(e.auction.bid({...base,token,round:1,bid:(150*R)},2000).repeated);
 const v=e.fx.view(base,2001),out=e.fx.convert({...base,token:v.token,direction:'sell',amount:1589},2002);assert.equal(out.tavernBalance,1589);assert.equal(out.auctionBalance,R-1);
});
test('loss, all-pass, leaving and expiry return escrow to auction coins only',t=>{
 for(const mode of ['loss','pass','leave','expired']){
  const e=setup(t),a=e.auction,s=open(a),token=s.session.token;let r;
  if(mode==='loss'){force(e,token,[(200*R),(40*R),(10*R)]);r=a.bid({...base,token,round:1,bid:(10*R)},1010);}
  if(mode==='pass')for(let round=1;round<=5;round++){force(e,token,[0,0,0]);r=a.bid({...base,token,round,bid:0},1010+round);}
  if(mode==='leave')r=a.leave({...base,token,round:1},1010);
  if(mode==='expired')r=a.view(base,1003+AUCTION_TTL);
  assert.equal(r.balance,(490*R));assert.equal(r.tavernBalance,0);assert.equal(r.session.result.net,-(10*R));assert.equal(r.session.result.refund,(200*R));assert.equal(r.stats.plays,1);
  if(mode==='pass')assert.equal(r.session.result.winner,null);assert.equal(a.view(base,1004+AUCTION_TTL).balance,(490*R));
 }
});
test('owner/channel/guild, opening expiry, budget and active-session constraints cannot be bypassed',async t=>{
 const e=setup(t),a=e.auction,v=a.view(base,1002),p={...base,token:v.offerToken,role:'sophie'},v2=a.view({...base,channel:'4'},1002);
 for(const extra of [{id:'4'},{channel:'4'},{token:'0'.repeat(16)},{role:'fake'}])assert.throws(()=>a.start({...p,...extra},1003));assert.throws(()=>a.start(p,1002+AUCTION_READY_TTL),/过期/);
 const s=a.start(p,1003),token=s.session.token;for(const bid of [-1,(200*R+1),1.5,'10',NaN])assert.throws(()=>a.bid({...base,token,round:1,bid},1004));
 assert.throws(()=>a.bid({...base,channel:'4',token,round:1,bid:(100*R)},1004),/本频道/);assert(a.view({...base,channel:'4'},1004).session.readOnly);
 assert.throws(()=>a.start({...base,channel:'4',token:v2.offerToken,role:'sophie'},1004),/已有一局/);
 force(e,token,[(100*R),(100*R),(100*R)]);a.bid({...base,token,round:1,bid:(100*R)},1005);assert.throws(()=>a.leave({...base,token,round:1},1006),/回合已变化/);
 await e.tavern.dispatch({...base,action:'auctionView'});await assert.rejects(()=>e.tavern.dispatch({...base,guild:'9',action:'auctionView'}),/服务器不匹配/);
 assert.equal(setup(t,0).auction.view(base,1002).balance,0);
});
test('auction entry and settlement failures roll back both state and currency ledger',t=>{
 const e=setup(t),a=e.auction,v=a.view(base,1002),p={...base,token:v.offerToken,role:'sophie'},exec=e.storage.sql.exec;
 e.storage.sql.exec=(q,...args)=>{if(args[3]==='auction_hold')throw Error('disk');return exec(q,...args);};assert.throws(()=>a.start(p,1003),/disk/);e.storage.sql.exec=exec;assert.equal(a.view(base,1004).balance,(500*R));
 const s=a.start(p,1005),token=s.session.token;force(e,token,[(40*R),(50*R),(60*R)]);const before=e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state;
 e.storage.sql.exec=(q,...args)=>{if(args[3]==='auction_sale')throw Error('disk');return exec(q,...args);};assert.throws(()=>a.bid({...base,token,round:1,bid:(150*R)},1006),/disk/);e.storage.sql.exec=exec;
 assert.equal(a.view(base,1007).balance,(290*R));assert.equal(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state,before);assert.equal(a.bid({...base,token,round:1,bid:(150*R)},1008).balance,(1540*R));
});
test('legacy sessions retain tavern-coin escrow, original values, NPC scale, receipts and separate statistics',t=>{
 const e=setup(t,0),token=legacy(e);force(e,token,[100,100,100]);let r=e.auction.bid({...base,token,round:1,bid:100},1001);
 assert.equal(r.session.currency,'tavern');assert.equal(r.session.budget,200);assert.equal(r.tavernBalance,290);assert.equal(r.balance,0);
 const state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);assert(state.committed.every(n=>n<=200));assert.throws(()=>e.auction.bid({...base,token,round:2,bid:(100*R)},1002),/旧版/);
 force(e,token,[40,50,60]);r=e.auction.bid({...base,token,round:2,bid:150},1003);assert.equal(r.tavernBalance,1540);assert.equal(r.balance,0);assert.equal(r.session.result.resale,1200);assert.equal(r.stats.legacyNet,1040);assert.equal(r.stats.net,0);
 const restored=new TavernAuction(new TavernService(e.storage),()=>{throw Error('reroll');});assert.equal(restored.bid({...base,token,round:2,bid:150},1004).tavernBalance,1540);assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n,0);
 const ui=auctionData(r,'3','1');bounds(ui);assert(ui.content.includes('旧局'));assert(ui.content.includes('1,540酒馆币'));
});
test('legacy expiry refunds only the original tavern escrow; retry cannot inflate it',t=>{
 const e=setup(t,0),token=legacy(e),r=e.auction.view(base,1000+AUCTION_TTL);assert.equal(r.tavernBalance,490);assert.equal(r.balance,0);assert.equal(r.session.result.refund,200);assert.equal(e.auction.leave({...base,token,round:1},1001+AUCTION_TTL).tavernBalance,490);
});
test('new-currency full-budget purchase and expired duplicate requests settle once',t=>{
 const e=setup(t),s=open(e.auction),token=s.session.token,state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);state.items=Array.from({length:8},()=>({...AUCTION_ITEMS[0]}));state.committed=[(40*R),(50*R),(60*R)];e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),token);
 const r=e.auction.bid({...base,token,round:1,bid:(200*R)},1004);assert.equal(r.balance,(322*R));assert.equal(r.session.result.refund,0);assert.equal(r.session.result.net,-(178*R));
 const e2=setup(t),v=e2.auction.view(base,1002),p={...base,token:v.offerToken,role:'sophie'},s2=e2.auction.start(p,1003);force(e2,s2.session.token,[(100*R),(100*R),(100*R)]);const b={...base,token:s2.session.token,round:1,bid:(100*R)};e2.auction.bid(b,1004);assert.equal(e2.auction.bid(b,1003+AUCTION_TTL).balance,(490*R));assert.equal(e2.auction.start(p,1004+AUCTION_TTL).balance,(490*R));
});
test('two-way fixed-rate exchanges conserve value exactly, leave dust, survive restarts and are idempotent',t=>{
 const e=setup(t,0),v=e.fx.view(base,1000),p={...base,token:v.token,direction:'buy',amount:210},r=e.fx.convert(p,1001);assert.equal(r.tavernBalance,290);assert.equal(r.auctionBalance,(210*R));assert.equal(r.rate,R);
 const fx=new TavernAuctionCurrency(new TavernService(e.storage));assert(fx.convert(p,1000000).repeated);assert.equal(fx.convert(p,1000001).auctionBalance,(210*R));assert.throws(()=>fx.convert({...p,direction:'sell'},1002),/另一数量/);assert.throws(()=>fx.convert({...p,amount:209},1002),/另一数量/);
 e.storage.transactionSync(()=>e.fx.adjust('1',R-1,'test:dust','test','dust',1002));const s=fx.view(base,1003),out=fx.convert({...base,token:s.token,direction:'sell',amount:210},1004);assert.equal(out.tavernBalance,500);assert.equal(out.auctionBalance,R-1);bounds(currencyData(out,'3','1'));assert(currencyData(out,'3','1').content.includes((R-1).toLocaleString('en-US')));
});
test('exchange failures at the second wallet ledger roll back balances, both ledgers, token and result together',t=>{
 for(const direction of ['buy','sell']){
  const e=setup(t,direction==='buy'?0:210),v=e.fx.view(base,1002),beforeA=v.auctionBalance,beforeT=v.tavernBalance,exec=e.storage.sql.exec;
  e.storage.sql.exec=(q,...a)=>{if(a[3]===`auction_exchange_${direction}`)throw Error('disk');return exec(q,...a);};assert.throws(()=>e.fx.convert({...base,token:v.token,direction,amount:100},1003),/disk/);e.storage.sql.exec=exec;
  const after=e.fx.view(base,1004);assert.equal(after.auctionBalance,beforeA);assert.equal(after.tavernBalance,beforeT);assert.equal(e.tavern.one('SELECT status FROM tavern_auction_exchanges WHERE token=?',v.token).status,'ready');assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n,direction==='buy'?0:1);
  assert.equal(e.fx.convert({...base,token:v.token,direction,amount:100},1005).tavernBalance,beforeT+(direction==='buy'?-100:100));
 }
});
test('invalid, foreign, expired, insufficient and overflowing exchanges never move either currency',async t=>{
 const e=setup(t,0),v=e.fx.view(base,1000),p={...base,token:v.token,direction:'buy',amount:1};
 for(const extra of [{id:'4'},{channel:'4'},{direction:'fake'},{token:'0'.repeat(16)},{amount:0},{amount:-1},{amount:1.1},{amount:'1'},{amount:NaN},{amount:EXCHANGE_MAX+1},{amount:501},{direction:'sell'}])assert.throws(()=>e.fx.convert({...p,...extra},1001));
 assert.throws(()=>e.fx.convert(p,1000+EXCHANGE_TTL),/过期/);assert.equal(e.tavern.member('1').balance,500);assert.equal(e.fx.balance('1'),0);
 e.storage.transactionSync(()=>e.fx.adjust('1',Number.MAX_SAFE_INTEGER,'test:full','test','full',1002));assert.throws(()=>e.fx.convert(p,1003),/超出范围/);assert.equal(e.tavern.member('1').balance,500);
 e.tavern.sql.exec("UPDATE tavern_members SET balance=? WHERE id='1'",Number.MAX_SAFE_INTEGER);assert.throws(()=>e.fx.convert({...p,direction:'sell'},1003),/超出范围/);assert.equal(e.fx.balance('1'),Number.MAX_SAFE_INTEGER);
 await e.tavern.dispatch({...base,action:'auctionExchangeView'});await assert.rejects(()=>e.tavern.dispatch({...base,guild:'9',action:'auctionExchangeView'}),/服务器不匹配/);assert.equal(setup(t,0).fx.view(base).auctionBalance,0);
});
test('escrow is not redeemable; exchanging available coins during a game cannot double-spend its budget',t=>{
 const e=setup(t,210),s=open(e.auction),v=e.fx.view(base,1004);assert.equal(v.auctionBalance,0);assert.throws(()=>e.fx.convert({...base,token:v.token,direction:'sell',amount:1},1005),/竞拍币不足/);
 e.auction.leave({...base,token:s.session.token,round:1},1006);const out=e.fx.convert({...base,token:v.token,direction:'sell',amount:200},1007);assert.equal(out.tavernBalance,490);assert.equal(out.auctionBalance,0);
});
test('auction and currency buttons/modals use owner-bound ephemeral acknowledgements and eight-digit bids',async t=>{
 const e=setup(t),env=envFor(e.tavern),view=await answerTavern(env,i());bounds(view);assert(tavernCommand.options.some(x=>x.name==='竞拍币'));assert(tavernCommand.options.length<=25);
 for(const action of ['auction','auctionExchange']){assert.deepEqual(tavernDeferredReply(i(action,{message:{flags:0},data:{custom_id:`t:3:any:${action}`}})),{type:5,data:{flags:64}});assert.deepEqual(tavernDeferredReply(i(action)),{type:6});}
 const s=await answerTavern(env,i(view.components[0].components[0].custom_id.split(':')[3]));bounds(s);const snap=e.auction.view(base),a=`${snap.session.token}~1`,modal=immediateTavernReply(i(`auctionOffer~${a}`));assert.equal(modal.type,9);assert.equal(modal.data.components[0].components[0].max_length,8);
 const bid=submit(`auctionBid~${a}`,'bid',String(125*R+1));assert.equal(immediateTavernReply(bid),null);assert.deepEqual(tavernDeferredReply(bid),{type:6});bounds(await answerTavern(env,bid));assert.equal(immediateTavernReply(submit(`auctionBid~${a}`,'bid',String(AUCTION_MAX_BUDGET+1))).type,4);
 const exchange=await answerTavern(env,i('auctionExchange'));bounds(exchange);const sell=exchange.components[0].components[1].custom_id.split(':')[3],m=immediateTavernReply(i(sell));assert.equal(m.type,9);const parts=m.data.custom_id.split(':')[3],conversion=submit(parts,'amount','10');assert.equal(immediateTavernReply(conversion),null);assert.deepEqual(tavernDeferredReply(conversion),{type:6});bounds(await answerTavern(env,conversion));
 for(const action of ['auction','auctionExchange',sell])for(const extra of [{member:{user:{id:'4'}}},{guild_id:'9'},{message:{flags:0}},{member:{user:{id:'1',bot:true}}}])assert.equal(immediateTavernReply(i(action,extra)).type,4);
 for(const raw of ['0','-1','1.5','1,000','1e3','1000001'])assert.equal(immediateTavernReply(submit(parts,'amount',raw)).type,4);
 for(const d of [auctionRules('3','1'),auctionCatalog('3','1'),auctionData(e.auction.view(base),'12345678901234567890','12345678901234567890')])bounds(d);
});
test('lost Discord exchange and start responses restore receipts without repeating either wallet movement',async t=>{
 const e=setup(t,0),env={...envFor(e.tavern),DISCORD_APPLICATION_ID:'123'},v=await answerTavern(env,i('auctionExchange')),buy=v.components[0].components[0].custom_id.split(':')[3],modal=immediateTavernReply(i(buy)),p=submit(modal.data.custom_id.split(':')[3],'amount','500');
 t.mock.method(globalThis,'fetch',async()=>{throw Error('network');});await finishTavern(env,p);await finishTavern(env,p);assert.equal(e.fx.balance('1'),(500*R));assert.equal(e.tavern.member('1').balance,0);
 const a=await answerTavern(env,i()),start=a.components[0].components[0].custom_id.split(':')[3];await finishTavern(env,i(start));const before=e.tavern.one("SELECT state FROM tavern_auctions WHERE status='active'").state;await finishTavern(env,i(start));assert.equal(e.fx.balance('1'),(290*R));assert.equal(e.tavern.one("SELECT state FROM tavern_auctions WHERE status='active'").state,before);
});
test('whitelist and PNGs hide unknown prices; revealed large values fit the result image and Discord limits',async t=>{
 const e=setup(t),s=open(e.auction,'viktor'),raw=JSON.stringify(s);for(const word of ['committed','infos','tavern-5-3','始祖秘传配方',String(1200*R),'value'])assert(!raw.includes(word));assert.equal(s.session.items,null);
 const a=await renderAuctionImage(s.session),b=await renderAuctionImage({...s.session,items:AUCTION_ITEMS.slice(0,8)});assert.deepEqual(a,b);assert.deepEqual([...a.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(new DataView(a.buffer).getUint32(16),760);assert.equal(new DataView(a.buffer).getUint32(20),1000);
 for(let round=1;round<=4;round++){force(e,s.session.token,[(100*R),(100*R),(100*R)],[0,1,2,3]);e.auction.bid({...base,token:s.session.token,round,bid:(100*R)},1010+round);}
 force(e,s.session.token,[(100*R),(100*R),(100*R)],[0,1,2,3]);const end=e.auction.bid({...base,token:s.session.token,round:5,bid:(100*R+1)},1020),c=await renderAuctionImage(end.session);assert.notDeepEqual(c,a);assert(c.length<(150*R));bounds(auctionData(end,'12345678901234567890','12345678901234567890'));
 await writeFile('/tmp/tavern-auction-currency-active.png',a);await writeFile('/tmp/tavern-auction-currency-settled.png',c);
});


test('two pre-opened exchange windows share available funds and cannot double-spend across channels',async t=>{
 const e=setup(t,0),a=e.fx.view(base,1000),other={...base,channel:'4'},b=e.fx.view(other,1000);
 const results=await Promise.allSettled([e.tavern.dispatch({...base,action:'auctionExchangeConvert',token:a.token,direction:'buy',amount:400}),e.tavern.dispatch({...other,action:'auctionExchangeConvert',token:b.token,direction:'buy',amount:400})]);
 // Stored windows use the real dispatch clock in this integration check.
 assert(results.every(r=>r.status==='rejected'));assert.equal(e.fx.balance('1'),0);
 const now=Date.now(),c=e.fx.view(base,now),d=e.fx.view(other,now);
 const actual=await Promise.allSettled([e.tavern.dispatch({...base,action:'auctionExchangeConvert',token:c.token,direction:'buy',amount:400}),e.tavern.dispatch({...other,action:'auctionExchangeConvert',token:d.token,direction:'buy',amount:400})]);
 assert.equal(actual.filter(r=>r.status==='fulfilled').length,1);assert.equal(e.fx.balance('1'),(400*R));assert.equal(e.tavern.member('1').balance,100);assert.equal(e.fx.balance('1')+e.tavern.member('1').balance*R,(500*R));
});

test('replaying an old game keeps the current game panel and its unchanged funds, with the saved receipt noted',async t=>{
 const e=setup(t),env=envFor(e.tavern),first=e.auction.view(base),start={...base,token:first.offerToken,role:'sophie'},g1=e.auction.start(start),old=g1.session.token;
 force(e,old,[0,0,0]);const bid={...base,token:old,round:1,bid:1},ended=e.auction.bid(bid);
 const current=e.auction.start({...base,token:ended.offerToken,role:'sophie'}),token=current.session.token;
 const before=e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state,ledger=e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n;
 for(const action of [`auctionBid~${old}~1~1`,`auctionStart~${old}~sophie`,`auctionLeave~${old}~1`]){
  const view=await answerTavern(env,i(action));bounds(view);
  assert(view.content.includes('当前进行中的竞拍'));assert(view.content.includes('上一局已结算'));
  assert(view.components.flatMap(r=>r.components).some(c=>c.custom_id.includes(`auctionBid~${token}~1~`)));
  assert(!view.components.flatMap(r=>r.components).some(c=>c.custom_id.startsWith('t:3:1:auctionStart~')));
  assert.equal(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state,before);
  assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n,ledger);
  assert.equal(e.auction.view(base).balance,current.balance);
 }
 assert.deepEqual(e.auction.bid(bid).session.result,ended.session.result);
});

function funded(t,amount){
 const e=setup(t,0);e.tavern.sql.exec('UPDATE tavern_members SET balance=? WHERE id=?',amount,base.id);
 const v=e.fx.view(base,1000);e.fx.convert({...base,token:v.token,direction:'buy',amount},1001);return e;
}
test('every stake tier freezes proportional goods, information estimates and NPC ceilings without changing the exchange rate',async t=>{
 for(const [tier,config]of Object.entries(AUCTION_TIERS)){
  const e=funded(t,5000),v=e.auction.view(base,1002),p={...base,token:v.offerToken,role:'sophie',tier},s=e.auction.start(p,1003);
  assert.equal(s.session.tier,tier);assert.equal(s.session.budget,config.budget);assert.equal(s.session.fee,config.fee);
  assert.equal(s.balance,5000*R-config.budget-config.fee);assert.equal(s.tavernBalance,0);
  const raw=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',p.token).state);
  assert.equal(raw.unit,R*config.scale);assert(raw.items.every(x=>x.value===150*R*config.scale));
  assert.equal(s.session.estimate,Math.floor(estimateAuction(s.session.info,R*config.scale)));
  assert(raw.committed.every(b=>Number.isSafeInteger(b)&&b>=0&&b<=config.budget));
  assert.equal(e.auction.start(p,1004).balance,s.balance);
  assert.throws(()=>e.auction.start({...p,tier:tier==='small'?'high':'small'},1005),/另一能力或档位/);
  assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n,3);
  for(let round=1;round<=4;round++){
   force(e,p.token,[config.budget,config.budget,config.budget],[0,1,2,3]);
   const next=e.auction.bid({...base,token:p.token,round,bid:config.budget},1005+round);
   assert.equal(next.session.status,'active');
   const state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',p.token).state);
   assert.deepEqual(state.committed,state.infos.slice(1).map((info,j)=>npcAuctionBid(info,round+1,j,n=>n-1,R*config.scale)));
  }
  force(e,p.token,[config.budget,config.budget,config.budget],[0,1,2,3]);
  const end=e.auction.bid({...base,token:p.token,round:5,bid:config.budget},1010);
  bounds(auctionData(end,'12345678901234567890','12345678901234567890'));
  if(tier==='collection')await writeFile('/tmp/tavern-auction-collection-result.png',await renderAuctionImage(end.session));
 }
});
test('large-stake settlement, service restart, retries and bidirectional cashout preserve exact totals and dust',t=>{
 for(const [tier,config]of Object.entries(AUCTION_TIERS)){
  const e=funded(t,5000),v=e.auction.view(base,1002),s=e.auction.start({...base,token:v.offerToken,role:'sophie',tier},1003),token=s.session.token;
  const restored=new TavernAuction(new TavernService(e.storage),()=>{throw Error('unexpected reroll');});
  force(e,token,[0,0,0]);const p={...base,token,round:1,bid:config.budget-1},r=restored.bid(p,1004);
  const expected=5000*R-config.fee-config.budget+1+1200*R*config.scale;
  assert.equal(r.balance,expected);assert.equal(r.session.result.refund,1);assert.equal(r.session.result.net,990*R*config.scale+1);
  assert.deepEqual(restored.bid(p,1005).session.result,r.session.result);
  const fx=e.fx.view(base,1006),amount=Math.floor(expected/R),out=e.fx.convert({...base,token:fx.token,direction:'sell',amount},1007);
  assert.equal(out.tavernBalance,amount);assert.equal(out.auctionBalance,expected%R);
  const back=e.fx.view(base,1008);e.fx.convert({...base,token:back.token,direction:'buy',amount},1009);
  assert.equal(e.fx.balance(base.id),expected);assert.equal(e.tavern.member(base.id).balance,0);
 }
});
test('small-tier fees remain exactly 2.5 tavern coins and failed entry or forged bids do not spend funds',t=>{
 const e=funded(t,53),a=e.auction,v=a.view(base,1002),p={...base,token:v.offerToken,role:'sophie',tier:'small'};
 for(const tier of ['high','collection','invalid','__proto__'])assert.throws(()=>a.start({...p,tier},1003));
 assert.equal(e.fx.balance(base.id),53*R);const s=a.start(p,1004),token=s.session.token;
 assert.equal(s.balance,R/2);const raw=e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state;
 for(const bid of [5000001,200000000,200000001,1.5,NaN])assert.throws(()=>a.bid({...base,token,round:1,bid},1005));
 assert.equal(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state,raw);
 const r=a.leave({...base,token,round:1},1006);assert.equal(r.balance,50.5*R);assert.equal(r.session.result.net,-2.5*R);
 assert.equal(a.leave({...base,token,round:1},1007).balance,r.balance);
});
test('tier selection is free, large modals accept nine digits and references use only disclosed clues',async t=>{
 const e=funded(t,5000),env=envFor(e.tavern),count=e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n;
 for(const tier of Object.keys(AUCTION_TIERS)){
  const menu=await answerTavern(env,i(`auctionTier~${tier}`));bounds(menu);
  assert(menu.components[0].components.every(c=>c.custom_id.endsWith(`~${tier}`)));
 }
 assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n,count);
 const menu=await answerTavern(env,i('auctionTier~collection')),start=menu.components[0].components[0].custom_id.split(':')[3];
 const active=await answerTavern(env,i(start));bounds(active);const s=e.auction.view(base).session;
 const offer=active.components[0].components.at(-1).custom_id.split(':')[3],modal=immediateTavernReply(i(offer));
 assert.equal(modal.type,9);assert.equal(modal.data.components[0].components[0].max_length,9);assert(modal.data.components[0].components[0].label.includes('200000000'));
 const offered=active.components[0].components.slice(0,4).map(c=>Number(c.custom_id.split('~').at(-1)));
 assert.deepEqual(offered,[0,Math.min(s.budget,Math.floor(s.estimate*0.8)),Math.min(s.budget,Math.floor(s.estimate*0.95)),s.budget]);
 const state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',s.token).state);
 state.items=state.items.map(x=>({...x,value:1}));e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),s.token);
 assert.equal(e.auction.view(base).session.estimate,s.estimate);
 const bid=submit(modal.data.custom_id.split(':')[3],'bid','200000000');assert.equal(immediateTavernReply(bid),null);bounds(await answerTavern(env,bid));
 const settled=e.auction.view(base);if(settled.session.status==='active')e.auction.leave({...base,token:s.token,round:settled.session.round});
 const next=await answerTavern(env,i());bounds(next);assert(next.components[0].components.every(c=>c.custom_id.endsWith('~standard')));
 for(const extra of [{member:{user:{id:'4'}}},{guild_id:'9'},{message:{flags:0}}])assert.equal(immediateTavernReply(i('auctionTier~collection',extra)).type,4);
});
test('pre-tier auction-coin sessions retain standard prices, limits, later-round NPC bids and old controls',async t=>{
 const e=setup(t),s=open(e.auction),token=s.session.token,state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
 delete state.tier;delete state.unit;e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),token);
 const before=e.auction.view(base,1004).session,restored=new TavernAuction(e.tavern,n=>n-1);
 assert.equal(restored.start({...base,token,role:'sophie'},1005).session.estimate,before.estimate);
 assert.equal(immediateTavernReply(i(`auctionOffer~${token}~1`)).data.components[0].components[0].max_length,8);
 force(e,token,[100*R,100*R,100*R]);const r=restored.bid({...base,token,round:1,bid:100*R},1006);
 assert.equal(r.session.budget,200*R);assert.equal(r.session.fee,10*R);assert.equal(r.session.tier,'standard');
 const raw=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
 assert.deepEqual(raw.committed,raw.infos.slice(1).map((info,j)=>npcAuctionBid(info,2,j,n=>n-1,R)));
 bounds(await answerTavern(envFor(e.tavern),i(`auctionBid~${token}~1~${100*R}`)));
});
