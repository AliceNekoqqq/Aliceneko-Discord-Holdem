import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFile} from 'node:fs/promises';
import {TavernService} from './tavern-service.mjs';
import {TavernAuction,AUCTION_QUALITY_WEIGHTS,AUCTION_LEGACY_WEIGHTS,AUCTION_TIERS,AUCTION_MAX_BUDGET,AUCTION_TTL,AUCTION_READY_TTL,auctionRandom,generateAuction,revealAuction,estimateAuction,npcAuctionBid,decideAuction} from './tavern-auction.mjs';
import {AUCTION_RATE as R,auctionAmount as formatAuctionAmount,EXCHANGE_TTL,EXCHANGE_MAX,TavernAuctionCurrency} from './tavern-auction-currency.mjs';
import {AUCTION_ITEMS,AUCTION_ITEMS_V3,scaleAuctionValue,AUCTION_ITEMS_V2,AUCTION_ITEMS_LEGACY,auctionCatalogPage,auctionCatalogFor} from './tavern-auction-data.mjs';
import {createHash} from 'node:crypto';
import {auctionData,auctionRules,auctionCatalog} from './tavern-auction-ui.mjs';
import {currencyData} from './tavern-auction-currency-ui.mjs';
import {answerTavern,immediateTavernReply,tavernDeferredReply,tavernCommand,finishTavern} from './tavern-ui.mjs';
import {renderAuctionImage,renderAuctionCatalogImage} from './tavern-auction-image.mjs';
import {layoutAuction} from './tavern-auction-board.mjs';
import {readFile} from 'node:fs/promises';
import auctionArt from './auction-art-manifest.mjs';
const base={guild:'3',id:'1',channel:'2',name:'Alice'},cash=n=>n*R;
const FUND=2000*R,BUDGET=AUCTION_TIERS.standard.budget,FEE=AUCTION_TIERS.standard.fee,TERMINAL=AUCTION_ITEMS.at(-1).value,TOTAL=8*TERMINAL;
function setup(t,fund=2000,initializeCurrency=true){
 const db=new DatabaseSync(':memory:'),map=new Map();t.after(()=>db.close());let calls=0;
 const storage={sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length){const r=s.all(...a);return {toArray:()=>r,one:()=>r[0]};}s.run(...a);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>map.get(k),put:async(k,v)=>map.set(k,v)};
 const tavern=new TavernService(storage),auction=new TavernAuction(tavern,n=>{calls++;return n-1;});tavern._auction=auction;const fx=initializeCurrency?tavern.auctionCurrency:null;
 if(initializeCurrency){fx.view(base,1000);if(fund>500)tavern.sql.exec('UPDATE tavern_members SET balance=? WHERE id=?',fund,base.id);if(fund){const v=fx.view(base,1000);fx.convert({...base,token:v.token,direction:'buy',amount:fund},1001);}}
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
 fx.convert({...base,token:v.token,direction:'buy',amount:101},1005);
 const started=a.start({...base,token,role:'sophie'},1006);assert.equal(started.balance,0);assert.equal(started.tavernBalance,399);
 assert.equal(a.leave({...base,token,round:1},1007).balance,100*R);
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
test('192-item catalog values scale by 100000 while independent generation and unbiased sampling stay intact',()=>{
 assert.equal(AUCTION_ITEMS.length,192);assert.equal(new Set(AUCTION_ITEMS.map(x=>x.id)).size,192);
 assert(generateAuction(n=>n-1,R,AUCTION_ITEMS_V3).every(x=>x.quality===5&&x.value===cash(150)));assert.equal(AUCTION_ITEMS_V3[0].value,(4*R));
 const original=crypto.getRandomValues;let k=0;try{crypto.getRandomValues=a=>{a[0]=k++?4294967289:4294967295;return a;};assert.equal(auctionRandom(10),9);assert.equal(k,2);}finally{crypto.getRandomValues=original;}
});
test('red rarity is exactly 1 percent per item, with the removed tickets moved to gold and the estimator updated',()=>{
 assert.deepEqual(AUCTION_QUALITY_WEIGHTS,[30,25,20,13,11,1]);
 for(const weights of [AUCTION_QUALITY_WEIGHTS,AUCTION_LEGACY_WEIGHTS]){
  const counts=[0,0,0,0,0,0];
  for(let ticket=0;ticket<100;ticket++){let calls=0;for(const item of generateAuction(()=>calls++%2===0?ticket:0,R,AUCTION_ITEMS,weights))counts[item.quality]++;}
  assert.deepEqual(counts,weights.map(x=>x*8));
 }
 const info={highCount:null,items:Array.from({length:8},()=>({quality:null,width:null,height:null}))};
 assert(Math.abs(estimateAuction(info,R,AUCTION_ITEMS_V3)/R-208.4)<1e-9);
 assert(Math.abs(estimateAuction(info,R,AUCTION_ITEMS_V3,AUCTION_LEGACY_WEIGHTS)/R-218.6)<1e-9);
 assert.equal(AUCTION_QUALITY_WEIGHTS.slice(3).reduce((a,b)=>a+b),25);
 assert(Math.abs(estimateAuction({...info,highCount:8},R,AUCTION_ITEMS_V3)/R-498.4)<1e-9);
});
test('pre-rarity 72-item sessions preserve their original prior, committed quotes and future NPC bids',t=>{
 const e=setup(t),opened=open(e.auction),token=opened.session.token;
 assert.equal(opened.session.dropVersion,2);
 const state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
 delete state.inventoryVersion;delete state.skillVersion;delete state.dropVersion;state.catalogVersion=2;state.budget=200*R;state.items=Array.from({length:8},()=>({...AUCTION_ITEMS[0]}));
 const clues=(count,shape=false)=>({highCount:null,items:state.items.map((_,i)=>({quality:i<count?0:null,width:shape&&i<count?1:null,height:shape&&i<count?1:null}))});
 state.infos=[clues(5),clues(5),clues(2,true),{...clues(0),highCount:0}];state.committed=[100*R,100*R,100*R];
 e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),token);
 const before=e.auction.view(base,1004);assert.equal(before.session.dropVersion,1);assert.equal(before.session.catalogSize,72);
 assert.equal(before.session.estimate,Math.floor(estimateAuction(state.infos[0],R,AUCTION_ITEMS_V2,AUCTION_LEGACY_WEIGHTS)));
 assert(auctionData(before,'3','1').content.includes('本局沿用旧掉率：红4% / 金8%'));
 assert.deepEqual(JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state).committed,state.committed);
 const next=e.auction.bid({...base,token,round:1,bid:100*R},1005);assert.equal(next.session.status,'active');
 const raw=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
 const expected=raw.infos.slice(1).map((info,j)=>npcAuctionBid(info,2,j,n=>n-1,R,AUCTION_ITEMS_V2,AUCTION_LEGACY_WEIGHTS));
 assert.deepEqual(raw.committed,expected);
 assert.notDeepEqual(raw.committed,raw.infos.slice(1).map((info,j)=>npcAuctionBid(info,2,j,n=>n-1,R)));
 assert.deepEqual(raw.items,state.items);
});
test('the 192-item pool follows the inspected source proportions and preserves quality means without changing drops',async()=>{
 assert.deepEqual(AUCTION_ITEMS_V3.slice(0,72),AUCTION_ITEMS_V2);
 assert.equal(auctionCatalogFor(1),AUCTION_ITEMS_LEGACY);assert.equal(auctionCatalogFor(2),AUCTION_ITEMS_V2);assert.equal(auctionCatalogFor(3),AUCTION_ITEMS_V3);
 const reference=JSON.parse(await readFile(new URL('./docs/casino/BIDKING_POOL_REFERENCE.json',import.meta.url)));
 assert.equal(reference.collection_quality_counts.reduce((s,n)=>s+n),684);
 const quotas=reference.collection_quality_counts.map(n=>n*192/684),target=quotas.map(Math.floor);
 const ranked=quotas.map((n,q)=>({q,rest:n-target[q]})).sort((a,b)=>b.rest-a.rest||a.q-b.q);
 for(let n=0,left=192-target.reduce((a,b)=>a+b);n<left;n++)target[ranked[n].q]++;
 assert.deepEqual(target,[28,26,29,29,28,52]);
 const seen=new Set(),tickets=[0,30,55,75,88,99];
 for(let q=0;q<6;q++){
  const pool=AUCTION_ITEMS_V3.filter(x=>x.quality===q),old=AUCTION_ITEMS_V2.filter(x=>x.quality===q);
  assert.equal(pool.length,target[q]);assert.equal(pool.reduce((s,x)=>s+x.value,0)/pool.length,old.reduce((s,x)=>s+x.value,0)/old.length);
  for(let slot=0;slot<pool.length;slot++){let calls=0;for(const item of generateAuction(()=>calls++%2===0?tickets[q]:slot,R,AUCTION_ITEMS_V3))seen.add(item.id);}
 }
 assert.equal(seen.size,192);assert.equal(new Set(AUCTION_ITEMS_V3.map(x=>x.name)).size,192);
 assert.equal(Math.max(...AUCTION_ITEMS_V3.map(x=>x.value))/R,300);assert.equal(AUCTION_ITEMS_V3.filter(x=>x.value===300*R).length,1);
 for(const x of AUCTION_ITEMS_V3.slice(72)){assert(x.flavor&&[...x.flavor].length<=18);assert(!('visual'in x));assert(!('pack'in x));assert(Number.isSafeInteger(x.value));}
});
test('casino.8 games with red 1 percent retain the 72-item footprint prior and future sealed bids',t=>{
 const e=setup(t),s=open(e.auction,'gabriella'),token=s.session.token;
 const state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state),item=AUCTION_ITEMS_V2.find(x=>x.quality===2&&x.width===1&&x.height===2);
 delete state.inventoryVersion;delete state.skillVersion;state.catalogVersion=2;state.budget=200*R;state.items=Array.from({length:8},()=>({...item}));state.infos=Array.from({length:4},()=>({highCount:null,items:state.items.map(x=>({quality:x.quality,width:x.width,height:x.height}))}));state.committed=[100*R,100*R,100*R];
 e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),token);
 const before=e.auction.view(base,1004);assert.equal(before.session.catalogSize,72);assert.equal(before.session.dropVersion,2);assert.equal(before.session.estimate,176*R);
 assert.notEqual(before.session.estimate,Math.floor(estimateAuction(state.infos[0])));
 const ledger=e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n;
 e.auction.bid({...base,token,round:1,bid:100*R},1005);
 const next=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
 assert.deepEqual(next.committed,next.infos.slice(1).map((info,j)=>npcAuctionBid(info,2,j,n=>n-1,R,AUCTION_ITEMS_V2)));
 assert.deepEqual(next.items,state.items);assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n,ledger);
});
test('expansion preserves quality/footprint probabilities and conditional means while adding genuine price variance',()=>{
 assert.deepEqual(AUCTION_ITEMS_V2.slice(0,24),AUCTION_ITEMS_LEGACY);
 const weights=[30,25,20,13,8,4];let oldMean=0,newMean=0,oldSecond=0,newSecond=0;
 for(let q=0;q<6;q++){
  const old=AUCTION_ITEMS_LEGACY.filter(x=>x.quality===q),now=AUCTION_ITEMS_V2.filter(x=>x.quality===q);
  assert.equal(now.length,12);
  for(const [w,h] of [[1,1],[1,2],[2,2]]){
   const a=old.filter(x=>x.width===w&&x.height===h),b=now.filter(x=>x.width===w&&x.height===h);
   assert.equal(a.length/old.length,b.length/now.length);
   assert.equal(a.reduce((s,x)=>s+x.value,0)/a.length,b.reduce((s,x)=>s+x.value,0)/b.length);
  }
  for(const [pool,key]of [[old,'old'],[now,'new']]){
   const mean=pool.reduce((s,x)=>s+x.value/R,0)/pool.length,second=pool.reduce((s,x)=>s+(x.value/R)**2,0)/pool.length;
   if(key==='old'){oldMean+=mean*weights[q]/100;oldSecond+=second*weights[q]/100;}else{newMean+=mean*weights[q]/100;newSecond+=second*weights[q]/100;}
  }
 }
 assert.equal(oldMean,newMean);assert(Math.abs(newMean*8-218.6)<1e-9);assert(newSecond>oldSecond);
 assert.equal(Math.min(...AUCTION_ITEMS_V2.map(x=>x.value))/R,3);assert.equal(Math.max(...AUCTION_ITEMS_V2.map(x=>x.value))/R,180);
 for(const x of AUCTION_ITEMS.slice(24)){assert(x.flavor&&[...x.flavor].length<=18);assert(!Object.hasOwn(x,'visual'));}
 const seen=new Set();for(const ticket of [0,30,55,75,88,99])for(let slot=0;slot<12;slot++){let n=0;for(const x of generateAuction(limit=>n++%2===0?ticket:slot,R,AUCTION_ITEMS_V2))seen.add(x.id);}
 assert.equal(seen.size,72);
});
test('all quality pages cover 192 items once, retain old controls and reject invalid pages',async t=>{
 const e=setup(t),env=envFor(e.tavern),seen=new Set();
 for(let q=0;q<6;q++){
  const {pages,count}=auctionCatalogPage(q);assert.equal(count,[28,26,29,29,28,52][q]);
  for(let page=0;page<pages;page++){
   const view=auctionCatalog('3','1',q,page);bounds(view);
   for(const item of AUCTION_ITEMS){if(view.content.includes(`**${item.name}**`)){assert(!seen.has(item.id));seen.add(item.id);}}
   const response=await answerTavern(env,i(`auctionCatalog~${q}~${page}`));bounds(response);assert(response._mapScene.bytes.length>1000);
   assert.equal(response._mapScene.filename,`tavern-auction-catalog-${q}-${page}.png`);
  }
  bounds(await answerTavern(env,i(`auctionCatalog~${q}`)));
  assert.equal(immediateTavernReply(i(`auctionCatalog~${q}~${pages}`)).type,4);
 }
 assert.equal(seen.size,192);
 for(const action of ['auctionCatalog~6','auctionCatalog~-1','auctionCatalog~00','auctionCatalog~1~x','auctionCatalog~5~5','auctionRulesx','auctionCatalogx'])assert.equal(immediateTavernReply(i(action)).type,4);
 for(const extra of [{member:{user:{id:'4'}}},{guild_id:'9'},{message:{flags:0}}])assert.equal(immediateTavernReply(i('auctionCatalog~5~4',extra)).type,4);
 assert.throws(()=>auctionCatalog('3','1',6));assert.throws(()=>auctionCatalog('3','1','1'));assert.throws(()=>auctionCatalog('3','1',1,3));
});
test('three information abilities reveal only stated fields and NPCs cannot read private warehouse data or a human bid',()=>{
 const items=AUCTION_ITEMS.slice(0,8),empty=()=>({highCount:null,items:items.map(()=>({quality:null,width:null,height:null}))});
 const sophie=empty();revealAuction(items,sophie,'sophie',1,n=>n-1);assert.equal(sophie.items.filter(x=>x.quality!==null).length,5);assert(sophie.items.every(x=>x.width===null));revealAuction(items,sophie,'sophie',2,n=>n-1);assert.equal(sophie.items.filter(x=>x.quality!==null).length,7);
 const gab=empty();revealAuction(items,gab,'gabriella',1,n=>n-1);assert.equal(gab.items.filter(x=>x.width!==null).length,2);
 const victor=empty();revealAuction([AUCTION_ITEMS[12],AUCTION_ITEMS[16],AUCTION_ITEMS[20],...items.slice(0,5)],victor,'viktor',1);assert.equal(victor.highCount,3);assert(victor.items.every(x=>x.quality===null&&x.width===null));
 const info=empty();assert(Math.abs(estimateAuction(info,R,AUCTION_ITEMS_V3)-(208.4*R))<0.00001);assert(Math.abs(estimateAuction(info,1,AUCTION_ITEMS_V3)-208.4)<0.00001);
 const poisoned={...info,items:info.items.map(x=>({...x,get value(){throw Error('private read');},get name(){throw Error('private read');}})),get bid(){throw Error('bid read');}};
 assert.equal(npcAuctionBid(info,1,1,n=>n-1),npcAuctionBid(poisoned,1,1,n=>n-1));assert(estimateAuction({...info,highCount:0})<estimateAuction({...info,highCount:8}));
});
test('new wallets start at zero; opening never converts or spends tavern coins implicitly',t=>{
 const e=setup(t,0),v=e.auction.view(base,1002);assert.equal(v.balance,0);assert.equal(v.tavernBalance,500);
 assert.throws(()=>e.auction.start({...base,token:v.offerToken,role:'sophie'},1003),/1,010万/);assert.equal(e.tavern.member('1').balance,500);
 const f=e.fx.view(base,1004);e.fx.convert({...base,token:f.token,direction:'buy',amount:101},1005);
 const s=e.auction.start({...base,token:v.offerToken,role:'sophie'},1006);assert.equal(s.balance,0);assert.equal(s.tavernBalance,399);assert.equal(s.session.currency,'auction');
 assert.equal(e.auction.leave({...base,token:s.session.token,round:1},1007).balance,(100*R));assert.equal(e.tavern.member('1').balance,399);
});
test('auction-coin fees, escrow, retained inventory and receipts settle once across replay and reconstruction',t=>{
 const e=setup(t),a=e.auction,v=a.view(base,1002),p={...base,token:v.offerToken,role:'sophie'},s=a.start(p,1003),token=s.session.token;
 assert.equal(s.balance,(FUND-BUDGET-FEE));assert.equal(s.tavernBalance,0);assert.equal(s.session.items,null);const count=e.calls();assert.equal(a.start(p,1004).balance,(FUND-BUDGET-FEE));assert.equal(e.calls(),count);
 force(e,token,[(4*R),(5*R),(6*R)]);const bid={...base,token,round:1,bid:(15*R)},r=a.bid(bid,1005);assert.equal(r.balance,(FUND-16*R));assert.equal(r.session.result.net,(TOTAL-16*R));assert.equal(r.session.result.refund,(BUDGET-15*R));assert.equal(r.session.result.resale,0);
 const restored=new TavernAuction(new TavernService(e.storage),()=>{throw Error('rerolled');}),again=restored.bid(bid,2000);assert(again.repeated);assert.deepEqual(again.session.result,r.session.result);assert.equal(again.balance,r.balance);
 assert.equal(e.tavern.one("SELECT COUNT(*) n FROM tavern_auction_ledger WHERE kind LIKE 'auction_%'").n,3);assert.equal(e.tavern.member('1').balance,0);assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_daily').n,0);assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_orders').n,0);assert.throws(()=>restored.bid({...bid,bid:(15*R-1)}),/另一报价/);
});
test('five-round bids may decrease and include single auction coins; settlement preserves the exact remainder',t=>{
 const e=setup(t),s=open(e.auction),token=s.session.token;let r;
 for(let round=1;round<=5;round++){force(e,token,[(10*R),(10*R),(10*R)],[0,1,2,3]);r=e.auction.bid({...base,token,round,bid:round===1?(15*R):(10*R+1)},1010+round);}
 assert.equal(r.session.result.price,(10*R+1));assert.equal(r.balance,(FUND-11*R-1));assert.equal(r.session.history.length,5);
 assert(e.auction.bid({...base,token,round:1,bid:(15*R)},2000).repeated);
 const v=e.fx.view(base,2001),out=e.fx.convert({...base,token:v.token,direction:'sell',amount:Math.floor((FUND-11*R-1)/R)},2002);assert.equal(out.tavernBalance,Math.floor((FUND-11*R-1)/R));assert.equal(out.auctionBalance,(FUND-11*R-1)%R);
});
test('loss, all-pass, leaving and expiry return escrow to auction coins only',t=>{
 for(const mode of ['loss','pass','leave','expired']){
  const e=setup(t),a=e.auction,s=open(a),token=s.session.token;let r;
  if(mode==='loss'){force(e,token,[(20*R),(4*R),R]);r=a.bid({...base,token,round:1,bid:R},1010);}
  if(mode==='pass')for(let round=1;round<=5;round++){force(e,token,[0,0,0]);r=a.bid({...base,token,round,bid:0},1010+round);}
  if(mode==='leave')r=a.leave({...base,token,round:1},1010);
  if(mode==='expired')r=a.view(base,1003+AUCTION_TTL);
  assert.equal(r.balance,(FUND-FEE));assert.equal(r.tavernBalance,0);assert.equal(r.session.result.net,-FEE);assert.equal(r.session.result.refund,BUDGET);assert.equal(r.stats.plays,1);
  if(mode==='pass')assert.equal(r.session.result.winner,null);assert.equal(a.view(base,1004+AUCTION_TTL).balance,(FUND-FEE));
 }
});
test('owner/channel/guild, opening expiry, budget and active-session constraints cannot be bypassed',async t=>{
 const e=setup(t),a=e.auction,v=a.view(base,1002),p={...base,token:v.offerToken,role:'sophie'},v2=a.view({...base,channel:'4'},1002);
 for(const extra of [{id:'4'},{channel:'4'},{token:'0'.repeat(16)},{role:'fake'}])assert.throws(()=>a.start({...p,...extra},1003));assert.throws(()=>a.start(p,1002+AUCTION_READY_TTL),/过期/);
 const s=a.start(p,1003),token=s.session.token;for(const bid of [-1,(BUDGET+1),1.5,'10',NaN])assert.throws(()=>a.bid({...base,token,round:1,bid},1004));
 assert.throws(()=>a.bid({...base,channel:'4',token,round:1,bid:(10*R)},1004),/本频道/);assert(a.view({...base,channel:'4'},1004).session.readOnly);
 assert.throws(()=>a.start({...base,channel:'4',token:v2.offerToken,role:'sophie'},1004),/已有一局/);
 force(e,token,[(10*R),(10*R),(10*R)]);a.bid({...base,token,round:1,bid:(10*R)},1005);assert.throws(()=>a.leave({...base,token,round:1},1006),/回合已变化/);
 await e.tavern.dispatch({...base,action:'auctionView'});await assert.rejects(()=>e.tavern.dispatch({...base,guild:'9',action:'auctionView'}),/服务器不匹配/);
 assert.equal(setup(t,0).auction.view(base,1002).balance,0);
});
test('auction entry and settlement failures roll back both state and currency ledger',t=>{
 const e=setup(t),a=e.auction,v=a.view(base,1002),p={...base,token:v.offerToken,role:'sophie'},exec=e.storage.sql.exec;
 e.storage.sql.exec=(q,...args)=>{if(args[3]==='auction_hold')throw Error('disk');return exec(q,...args);};assert.throws(()=>a.start(p,1003),/disk/);e.storage.sql.exec=exec;assert.equal(a.view(base,1004).balance,FUND);
 const s=a.start(p,1005),token=s.session.token;force(e,token,[(4*R),(5*R),(6*R)]);const before=e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state;
 e.storage.sql.exec=(q,...args)=>{if(q.startsWith('INSERT INTO tavern_auction_inventory('))throw Error('disk');return exec(q,...args);};assert.throws(()=>a.bid({...base,token,round:1,bid:(15*R)},1006),/disk/);e.storage.sql.exec=exec;
 assert.equal(a.view(base,1007).balance,(FUND-BUDGET-FEE));assert.equal(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state,before);assert.equal(a.bid({...base,token,round:1,bid:(15*R)},1008).balance,(FUND-16*R));
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
 const e=setup(t),s=open(e.auction),token=s.session.token,state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);state.items=Array.from({length:8},()=>({...AUCTION_ITEMS[0]}));state.committed=[(4*R),(5*R),(6*R)];e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),token);
 const r=e.auction.bid({...base,token,round:1,bid:BUDGET},1004);assert.equal(r.balance,(FUND-BUDGET-FEE));assert.equal(r.session.result.refund,0);assert.equal(r.session.result.net,(8*AUCTION_ITEMS[0].value-BUDGET-FEE));
 const e2=setup(t),v=e2.auction.view(base,1002),p={...base,token:v.offerToken,role:'sophie'},s2=e2.auction.start(p,1003);force(e2,s2.session.token,[(10*R),(10*R),(10*R)]);const b={...base,token:s2.session.token,round:1,bid:(10*R)};e2.auction.bid(b,1004);assert.equal(e2.auction.bid(b,1003+AUCTION_TTL).balance,(FUND-FEE));assert.equal(e2.auction.start(p,1004+AUCTION_TTL).balance,(FUND-FEE));
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
 const e=setup(t,101),s=open(e.auction),v=e.fx.view(base,1004);assert.equal(v.auctionBalance,0);assert.throws(()=>e.fx.convert({...base,token:v.token,direction:'sell',amount:1},1005),/竞拍币不足/);
 e.auction.leave({...base,token:s.session.token,round:1},1006);const out=e.fx.convert({...base,token:v.token,direction:'sell',amount:100},1007);assert.equal(out.tavernBalance,499);assert.equal(out.auctionBalance,0);
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
 const a=await answerTavern(env,i('auctionTier~small')),start=a.components[0].components[0].custom_id.split(':')[3];await finishTavern(env,i(start));const before=e.tavern.one("SELECT state FROM tavern_auctions WHERE status='active'").state;await finishTavern(env,i(start));assert.equal(e.fx.balance('1'),(474.75*R));assert.equal(e.tavern.one("SELECT state FROM tavern_auctions WHERE status='active'").state,before);
});
test('whitelist and PNGs hide unknown prices; revealed large values fit the result image and Discord limits',async t=>{
 const e=setup(t),s=open(e.auction,'viktor'),raw=JSON.stringify(s);for(const word of ['committed','infos','tavern-5-3','始祖秘传配方',String(120*R),'value'])assert(!raw.includes(word));assert.equal(s.session.items,null);
 const a=await renderAuctionImage(s.session),b=await renderAuctionImage({...s.session,items:AUCTION_ITEMS.slice(0,8)});assert.deepEqual(a,b);assert.deepEqual([...a.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(new DataView(a.buffer).getUint32(16),760);assert.equal(new DataView(a.buffer).getUint32(20),1000);
 for(let round=1;round<=4;round++){force(e,s.session.token,[(10*R),(10*R),(10*R)],[0,1,2,3]);e.auction.bid({...base,token:s.session.token,round,bid:(10*R)},1010+round);}
 force(e,s.session.token,[(10*R),(10*R),(10*R)],[0,1,2,3]);const end=e.auction.bid({...base,token:s.session.token,round:5,bid:(10*R+1)},1020),c=await renderAuctionImage(end.session);assert.notDeepEqual(c,a);assert(c.length<(15*R));bounds(auctionData(end,'12345678901234567890','12345678901234567890'));
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
  const e=funded(t,20000),v=e.auction.view(base,1002),p={...base,token:v.offerToken,role:'sophie',tier},s=e.auction.start(p,1003);
  assert.equal(s.session.tier,tier);assert.equal(s.session.budget,config.budget);assert.equal(s.session.fee,config.fee);
  assert.equal(s.balance,20000*R-config.budget-config.fee);assert.equal(s.tavernBalance,0);
  const raw=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',p.token).state);
  assert.equal(raw.unit,R*config.scale);assert(raw.items.every(x=>x.value===scaleAuctionValue(TERMINAL,R*config.scale)));
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
test('new maximum-value collections settle above 32-bit amounts and cash out exact balances only once',async t=>{
 const e=funded(t,20000),v=e.auction.view(base,1002),p={...base,token:v.offerToken,role:'sophie',tier:'collection'};
 e.auction.start(p,1003);const row=e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',p.token),state=JSON.parse(row.state);
 const top=AUCTION_ITEMS.reduce((a,b)=>a.value>b.value?a:b);state.items=Array.from({length:8},()=>({...top,value:top.value*10}));state.board=layoutAuction(state.items,p.token);state.committed=[0,0,0];
 e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),p.token);
 const bid={...base,token:p.token,round:1,bid:1},end=e.auction.bid(bid,1004),ledger=e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n;
 assert.equal(end.session.result.total,top.value*80);assert.equal(end.balance,20000*R-AUCTION_TIERS.collection.fee-1);bounds(auctionData(end,'3','1'));
 const restored=new TavernAuction(new TavernService(e.storage),()=>{throw Error('rerolled');});assert.deepEqual(restored.bid(bid,1005).session.result,end.session.result);
 assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n,ledger);
 const fx=e.fx.view(base,1006),out=e.fx.convert({...base,token:fx.token,direction:'sell',amount:Math.floor(end.balance/R)},1007);
 assert.equal(out.tavernBalance,Math.floor(end.balance/R));assert.equal(out.auctionBalance,end.balance%R);
 await writeFile('/tmp/auction9-max-receipt.png',await renderAuctionImage(end.session));
});
test('large-stake settlement, service restart, retries and bidirectional cashout preserve exact totals and dust',t=>{
 for(const [tier,config]of Object.entries(AUCTION_TIERS)){
  const e=funded(t,20000),v=e.auction.view(base,1002),s=e.auction.start({...base,token:v.offerToken,role:'sophie',tier},1003),token=s.session.token;
  const restored=new TavernAuction(new TavernService(e.storage),()=>{throw Error('unexpected reroll');});
  force(e,token,[0,0,0]);const p={...base,token,round:1,bid:config.budget-1},r=restored.bid(p,1004);
  const expected=20000*R-config.fee-config.budget+1;
  assert.equal(r.balance,expected);assert.equal(r.session.result.refund,1);assert.equal(r.session.result.net,8*scaleAuctionValue(TERMINAL,R*config.scale)-config.fee-config.budget+1);
  assert.deepEqual(restored.bid(p,1005).session.result,r.session.result);
  const fx=e.fx.view(base,1006),amount=Math.floor(expected/R),out=e.fx.convert({...base,token:fx.token,direction:'sell',amount},1007);
  assert.equal(out.tavernBalance,amount);assert.equal(out.auctionBalance,expected%R);
  const back=e.fx.view(base,1008);e.fx.convert({...base,token:back.token,direction:'buy',amount},1009);
  assert.equal(e.fx.balance(base.id),expected);assert.equal(e.tavern.member(base.id).balance,0);
 }
});
test('small-tier fees remain exactly 0.25 tavern coins and failed entry or forged bids do not spend funds',t=>{
 const e=funded(t,26),a=e.auction,v=a.view(base,1002),p={...base,token:v.offerToken,role:'sophie',tier:'small'};
 for(const tier of ['high','collection','invalid','__proto__'])assert.throws(()=>a.start({...p,tier},1003));
 assert.equal(e.fx.balance(base.id),26*R);const s=a.start(p,1004),token=s.session.token;
 assert.equal(s.balance,R*.75);const raw=e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state;
 for(const bid of [2500001,100000000,200000001,1.5,NaN])assert.throws(()=>a.bid({...base,token,round:1,bid},1005));
 assert.equal(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state,raw);
 const r=a.leave({...base,token,round:1},1006);assert.equal(r.balance,25.75*R);assert.equal(r.session.result.net,-.25*R);
 assert.equal(a.leave({...base,token,round:1},1007).balance,r.balance);
});
test('tier selection is free, large modals accept nine digits and references use only disclosed clues',async t=>{
 const e=funded(t,20000),env=envFor(e.tavern),count=e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n;
 for(const tier of Object.keys(AUCTION_TIERS)){
  const menu=await answerTavern(env,i(`auctionTier~${tier}`));bounds(menu);
  assert(menu.components[0].components.every(c=>c.custom_id.endsWith(`~${tier}`)));
 }
 assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n,count);
 const menu=await answerTavern(env,i('auctionTier~collection')),start=menu.components[0].components[0].custom_id.split(':')[3];
 const active=await answerTavern(env,i(start));bounds(active);const s=e.auction.view(base).session;
 const offer=active.components[0].components.at(-1).custom_id.split(':')[3],modal=immediateTavernReply(i(offer));
 assert.equal(modal.type,9);assert.equal(modal.data.components[0].components[0].max_length,9);assert(modal.data.components[0].components[0].label.includes('100000000'));
 const offered=active.components[0].components.slice(0,4).map(c=>Number(c.custom_id.split('~').at(-1)));
 assert.deepEqual(offered,[0,Math.min(s.budget,Math.floor(s.estimate*0.8)),Math.min(s.budget,Math.floor(s.estimate*0.95)),s.budget]);
 const state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',s.token).state);
 state.items=state.items.map(x=>({...x,value:1}));e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),s.token);
 assert.equal(e.auction.view(base).session.estimate,s.estimate);
 const bid=submit(modal.data.custom_id.split(':')[3],'bid','100000000');assert.equal(immediateTavernReply(bid),null);bounds(await answerTavern(env,bid));
 const settled=e.auction.view(base);if(settled.session.status==='active')e.auction.leave({...base,token:s.token,round:settled.session.round});
 const pending=e.auction.view(base);if(pending.session.reveal&&!pending.session.reveal.complete)e.auction.reveal({...base,token:s.token,step:pending.session.reveal.count,all:true});
 const next=await answerTavern(env,i());bounds(next);assert(next.components[0].components.every(c=>c.custom_id.endsWith('~standard')));
 for(const extra of [{member:{user:{id:'4'}}},{guild_id:'9'},{message:{flags:0}}])assert.equal(immediateTavernReply(i('auctionTier~collection',extra)).type,4);
});
test('pre-tier auction-coin sessions retain standard prices, limits, later-round NPC bids and old controls',async t=>{
 const e=setup(t),s=open(e.auction),token=s.session.token,state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
 delete state.inventoryVersion;delete state.skillVersion;delete state.tier;delete state.unit;delete state.catalogVersion;state.budget=200*R;state.fee=10*R;delete state.dropVersion;state.items=generateAuction(n=>n-1,R,AUCTION_ITEMS_LEGACY);e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),token);
 const before=e.auction.view(base,1004).session,restored=new TavernAuction(e.tavern,n=>n-1);
 assert.equal(before.catalogSize,24);assert.deepEqual(JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state).committed,state.committed);
 assert.equal(restored.start({...base,token,role:'sophie'},1005).session.estimate,before.estimate);
 assert.equal(immediateTavernReply(i(`auctionOffer~${token}~1`)).data.components[0].components[0].max_length,8);
 force(e,token,[100*R,100*R,100*R]);const r=restored.bid({...base,token,round:1,bid:100*R},1006);
 assert.equal(r.session.budget,200*R);assert.equal(r.session.fee,10*R);assert.equal(r.session.tier,'standard');
 const raw=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
 assert.deepEqual(raw.committed,raw.infos.slice(1).map((info,j)=>npcAuctionBid(info,2,j,n=>n-1,R,AUCTION_ITEMS_LEGACY,AUCTION_LEGACY_WEIGHTS)));
 bounds(await answerTavern(envFor(e.tavern),i(`auctionBid~${token}~1~${100*R}`)));
});

test('warehouse layouts are fixed, in bounds and non-overlapping across mixed shapes',()=>{
 for(let seed=0;seed<2000;seed++){
  const items=Array.from({length:8},(_,i)=>AUCTION_ITEMS[(seed*13+i*7)%AUCTION_ITEMS.length]),layout=layoutAuction(items,String(seed)),cells=new Set();
  assert.deepEqual(layout,layoutAuction(items,String(seed)));
  layout.forEach((p,i)=>{
   assert.equal(p.width,items[i].width);assert.equal(p.height,items[i].height);
   assert(p.x>=0&&p.y>=0&&p.x+p.width<=8&&p.y+p.height<=6);
   for(let dy=0;dy<p.height;dy++)for(let dx=0;dx<p.width;dx++){const cell=(p.y+dy)*8+p.x+dx;assert(!cells.has(cell));cells.add(cell);}
  });
 }
});
test('quality-only and count-only clues never disclose hidden footprints or identities in the warehouse board',t=>{
 for(const role of ['sophie','gabriella','viktor']){
  const e=setup(t),s=open(e.auction,role),slots=s.session.board.slots;
  if(role==='viktor')assert(slots.every(x=>x===null));
  else assert.equal(slots.filter(Boolean).length,role==='sophie'?5:2);
  if(role==='sophie')assert(slots.filter(Boolean).every(x=>x.width===null&&x.height===null));
  if(role==='gabriella')assert(slots.filter(Boolean).every(x=>x.width===2&&x.height===2));
  assert.equal(s.session.items,null);assert(!JSON.stringify(s).includes('tavern-5-3'));
 }
});
function cinematic(e,role='sophie'){
 const v=e.auction.view(base,1002);return e.auction.start({...base,token:v.offerToken,role,presentation:'warehouse'},1003);
}
test('opening settles funds once, progressively discloses only opened objects and survives restart and duplicate clicks',t=>{
 const e=setup(t),s=cinematic(e),token=s.session.token;force(e,token,[4*R,5*R,6*R]);
 assert.equal(s.session.catalogSize,192);assert(!JSON.stringify(s).includes('flavor'));
 const end=e.auction.bid({...base,token,round:1,bid:15*R},1004),wallet=e.fx.balance(base.id),ledger=e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n;
 assert.equal(wallet,FUND-16*R);assert.equal(end.balance,null);assert.equal(end.session.reveal.count,0);assert(end.session.items.every(x=>x===null));
 for(const key of ['total','resale','net','balanceAfter'])assert(!Object.hasOwn(end.session.result,key));
 assert.equal(end.stats.net,0);const raw=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
 const positions=s.session.board.slots;const opened=e.auction.reveal({...base,token,step:0,all:false},1005);
 assert.equal(opened.session.reveal.count,1);assert.equal(opened.session.items.filter(Boolean).length,1);assert.equal(e.auction.reveal({...base,token,step:0,all:false},1006).session.reveal.count,1);
 assert.equal(opened.session.items.filter(Boolean)[0].flavor,'正经方案不行，就用这个。');
 assert.throws(()=>e.auction.reveal({...base,token,step:3,all:false},1007),/进度已变化/);
 for(const extra of [{id:'4'},{channel:'4'},{step:-1},{all:'yes'}])assert.throws(()=>e.auction.reveal({...base,token,step:1,all:false,...extra},1008));
 const restored=new TavernAuction(new TavernService(e.storage),()=>{throw Error('reroll');});let result;
 for(let step=1;step<8;step++){
  result=restored.reveal({...base,token,step,all:false},1010+step);
  assert.equal(result.session.reveal.count,step+1);assert.equal(result.session.items.filter(Boolean).length,step+1);
  result.session.board.slots.forEach((p,i)=>{if(positions[i]){assert.equal(p.x,positions[i].x);assert.equal(p.y,positions[i].y);}});
 }
 assert(result.session.reveal.complete);assert.equal(result.balance,wallet);assert.equal(result.session.result.net,TOTAL-16*R);assert.equal(result.session.result.total,TOTAL);
 assert.deepEqual(result.session.result,raw.result);assert.equal(result.stats.net,TOTAL-16*R);
 assert.deepEqual(restored.reveal({...base,token,step:0,all:true},1100).session.result,result.session.result);
 assert.equal(e.fx.balance(base.id),wallet);assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n,ledger);
});
test('warehouse UI next/all controls stay private, do not spoil results and produce 192 individual item images',async t=>{
 const e=setup(t),env=envFor(e.tavern),start=await answerTavern(env,i()),s=await answerTavern(env,i(start.components[0].components[0].custom_id.split(':')[3]));bounds(s);
 const active=e.auction.view(base),token=active.session.token;assert.equal(e.auction.reveal instanceof Function,true);
 await writeFile('/tmp/auction9-clues.png',await renderAuctionImage(active.session));
 assert.throws(()=>e.auction.reveal({...base,token,step:0,all:false}),/结束后/);
 force(e,token,[0,0,0]);const view=await answerTavern(env,i(`auctionBid~${token}~1~1`));bounds(view);
 assert(view.content.includes('开仓揭晓 0 / 8'));assert(!view.content.includes('本局净变化'));assert(!view.content.includes('始祖秘传配方'));
 const unopened=e.auction.view(base),a=await renderAuctionImage(unopened.session),hidden=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state).items;
 const b=await renderAuctionImage({...unopened.session,items:hidden});assert.deepEqual(a,b);
 const next=view.components[0].components[0].custom_id.split(':')[3];
 for(const extra of [{member:{user:{id:'4'}}},{guild_id:'9'},{message:{flags:0}}])assert.equal(immediateTavernReply(i(next,extra)).type,4);
 bounds(await answerTavern(env,i(next)));const first=e.auction.view(base);assert.equal(first.session.reveal.count,1);
 bounds(await answerTavern(env,i(next)));assert.equal(e.auction.view(base).session.reveal.count,1);
 await writeFile('/tmp/auction9-first-reveal.png',await renderAuctionImage(first.session));
 const all=`auctionReveal~${token}~1~all`;bounds(await answerTavern(env,i(all)));const done=e.auction.view(base);assert(done.session.reveal.complete);
 await writeFile('/tmp/auction9-open.png',await renderAuctionImage(done.session));
 const catalog=await answerTavern(env,i('auctionCatalog'));bounds(catalog);assert(catalog._mapScene.bytes.length>1000);
 await writeFile('/tmp/auction9-catalog.png',await renderAuctionCatalogImage());
 assert.equal(Object.keys(auctionArt.items).length,192);const signatures=new Set();
 for(const item of AUCTION_ITEMS){const record=auctionArt.items[item.id];assert(record);const bytes=await readFile(new URL('.'+record.path, new URL('./public/',import.meta.url)));assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);signatures.add(Buffer.from(bytes).toString('hex'));}
 assert.equal(signatures.size,192);
 const legacyAtlas=await readFile(new URL('./public/art/auction/sprites-v1.bin',import.meta.url)),legacyRed=await readFile(new URL('./public/art/auction/tavern-5-3-v1.png',import.meta.url));
 assert.equal(createHash('sha256').update(legacyAtlas).digest('hex'),'7aa7b328c729f325ba93b6459d203fbb4b98a3224b588b37a0c7624ad5391455');
 assert.equal(createHash('sha256').update(legacyRed).digest('hex'),'21652ddc510e20315fd15c7ea2e7477bbd8c03fb9b012d30e95d15f0e859917b');
 const previousAtlas=await readFile(new URL('./public/art/auction/sprites-v2.bin',import.meta.url));
 assert.equal(createHash('sha256').update(previousAtlas).digest('hex'),'792f0888fe084e93144fcc58dbf1ed1348ebf2830b6017cc3fcc2d4ab5cf88b2');
});

test('repriced catalog preserves all identities, has natural tails and increases average value with occupied area',async()=>{
 assert.equal(auctionCatalogFor(4),AUCTION_ITEMS);assert.equal(auctionCatalogFor(3),AUCTION_ITEMS_V3);
 const priceFile=JSON.parse(await readFile(new URL('./assets/auction-art/prices-v1.json',import.meta.url)));
 assert.equal(priceFile.items.length,192);assert.equal(new Set(priceFile.items.map(x=>x.id)).size,192);
 for(let i=0;i<192;i++){const {value,...identity}=AUCTION_ITEMS[i],{value:oldValue,...oldIdentity}=AUCTION_ITEMS_V3[i];assert.deepEqual(identity,oldIdentity);assert(Number.isSafeInteger(value)&&value>0);assert.equal(value,priceFile.items[i].value);}
 assert(AUCTION_ITEMS.filter(x=>x.value%100000!==0).length>185);assert.equal(formatAuctionAmount(0.00001),'0.00001');
 for(let q=0;q<6;q++){
  const means=[1,2,4].map(area=>{const xs=AUCTION_ITEMS.filter(x=>x.quality===q&&x.width*x.height===area);return xs.reduce((s,x)=>s+x.value,0)/xs.length;});
  assert(means[0]<means[1]&&means[1]<means[2],`area ordering for quality ${q}`);
 }
 const high=AUCTION_ITEMS.filter(x=>x.quality===5);assert(Math.max(...high.map(x=>x.value))/Math.min(...high.map(x=>x.value))>10);
});
test('every repriced item scales to whole coins and disclosed shape estimates use the same rounded values',()=>{
 const tickets=[0,30,55,75,88,99];
 for(const config of Object.values(AUCTION_TIERS))for(let q=0;q<6;q++){
  const pool=AUCTION_ITEMS.filter(x=>x.quality===q);
  for(let j=0;j<pool.length;j++){
   let call=0;const item=generateAuction(()=>call++%2?j:tickets[q],R*config.scale)[0];
   assert.equal(item.id,pool[j].id);assert.equal(item.value,Math.floor(pool[j].value*config.scale));assert(Number.isSafeInteger(item.value));
  }
  for(const [width,height]of [[1,1],[1,2],[2,2]]){
   const xs=pool.filter(x=>x.width===width&&x.height===height),info={highCount:null,items:[{quality:q,width,height}]};
   assert(Math.abs(estimateAuction(info,R*config.scale)-xs.reduce((s,x)=>s+Math.floor(x.value*config.scale),0)/xs.length)<.001);
  }
 }
});
test('unconfirmed jackpot risk is discounted for both sides only in version 4, without reading hidden objects',()=>{
 const info={highCount:null,items:Array.from({length:8},()=>({quality:null,width:null,height:null}))};
 const arithmetic=AUCTION_ITEMS.reduce((sum,x)=>sum+x.value*AUCTION_QUALITY_WEIGHTS[x.quality]/AUCTION_ITEMS.filter(y=>y.quality===x.quality).length/100,0)*8;
 assert(estimateAuction(info)<arithmetic);assert(Math.abs(estimateAuction(info,R,AUCTION_ITEMS_V3)-208.4*R)<.001);
 const red={highCount:null,items:[{quality:5,width:null,height:null}]},xs=AUCTION_ITEMS.filter(x=>x.quality===5);
 assert(Math.abs(estimateAuction(red)-xs.reduce((s,x)=>s+x.value,0)/xs.length)<.001);
 const poisoned={...info,get actualItems(){throw Error('secret');},get bid(){throw Error('secret');}};
 assert.equal(estimateAuction(poisoned),estimateAuction(info));
 assert.equal(npcAuctionBid({...red,items:Array(8).fill(red.items[0])},5,2,n=>n-1),AUCTION_TIERS.standard.budget);
});
test('casino.9 sessions retain old prices, escrow limits, future NPC quotes and receipts after repricing',t=>{
 const e=setup(t),started=open(e.auction),token=started.session.token;assert.equal(started.session.catalogVersion,4);
 const state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
 delete state.inventoryVersion;delete state.skillVersion;state.catalogVersion=3;state.budget=200*R;state.fee=10*R;state.items=generateAuction(n=>n-1,R,AUCTION_ITEMS_V3);state.committed=[100*R,100*R,100*R];
 e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),token);
 e.tavern.sql.exec('UPDATE tavern_auction_wallets SET balance=balance+? WHERE user_id=?',BUDGET+FEE-210*R,base.id);
 e.tavern.sql.exec('UPDATE tavern_auction_ledger SET amount=? WHERE id=?',-200*R,`auction:hold:${token}`);
 e.tavern.sql.exec('UPDATE tavern_auction_ledger SET amount=? WHERE id=?',-10*R,`auction:fee:${token}`);
 const old=e.auction.view(base,1004);assert.equal(old.session.budget,200*R);assert(Math.abs(old.session.estimate-estimateAuction(state.infos[0],R,AUCTION_ITEMS_V3))<1);
 e.auction.bid({...base,token,round:1,bid:100*R},1005);
 const next=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
 assert.deepEqual(next.items,state.items);assert.deepEqual(next.committed,next.infos.slice(1).map((info,i)=>npcAuctionBid(info,2,i,n=>n-1,R,AUCTION_ITEMS_V3,AUCTION_QUALITY_WEIGHTS,200*R)));
 force(e,token,[40*R,50*R,60*R]);const bid={...base,token,round:2,bid:150*R},done=e.auction.bid(bid,1006);assert.equal(done.session.result.total,1200*R);assert.equal(done.balance,FUND+1040*R);
 assert.deepEqual(e.auction.bid(bid,1007).session.result,done.session.result);
});
test('odd small-tier item prices settle, replay and exchange with exact retained dust',t=>{
 const e=funded(t,26),v=e.auction.view(base,1002);e.auction.random=()=>0;const s=e.auction.start({...base,token:v.offerToken,role:'sophie',tier:'small'},1003),token=s.session.token;
 const row=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);assert.equal(row.items[0].value,Math.floor(AUCTION_ITEMS[0].value/4));assert.notEqual(AUCTION_ITEMS[0].value%4,0);
 force(e,token,[0,0,0]);const bid={...base,token,round:1,bid:1},done=e.auction.bid(bid,1004),expected=26*R-.25*R-1+8*Math.floor(AUCTION_ITEMS[0].value/4);
 assert.equal(done.balance,26*R-.25*R-1);assert.deepEqual(e.auction.bid(bid,1005).session.result,done.session.result);
 const inventory=e.auction.inventory,owned=inventory.view(base,1005),quote=inventory.quote({...base,token:owned.token,quality:6},1005),sale=inventory.sell({...base,token:quote.token},1005);assert.equal(sale.balance,expected);assert(Number.isSafeInteger(sale.balance));
 const fx=e.fx.view(base,1006),out=e.fx.convert({...base,token:fx.token,direction:'sell',amount:Math.floor(expected/R)},1007);assert.equal(out.auctionBalance,expected%R);
});

test('new collection quotes stop at 100M while historical 200M games still accept, settle and replay their saved ceiling',t=>{
 const fresh=funded(t,3000),fv=fresh.auction.view(base,1002),ns=fresh.auction.start({...base,token:fv.offerToken,role:'sophie',tier:'collection'},1003);
 assert.equal(ns.session.budget,100000000);const balance=fresh.fx.balance(base.id),ledger=fresh.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n;
 assert.throws(()=>fresh.auction.bid({...base,token:ns.session.token,round:1,bid:100000001},1004),/超出本局/);assert.equal(fresh.fx.balance(base.id),balance);assert.equal(fresh.tavern.one('SELECT COUNT(*) n FROM tavern_auction_ledger').n,ledger);
 const e=funded(t,5000),v=e.auction.view(base,1002),opened=e.auction.start({...base,token:v.offerToken,role:'sophie',tier:'collection'},1003),token=opened.session.token;
 const state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state),oldBudget=2000*R,oldFee=100*R;
 e.tavern.sql.exec('UPDATE tavern_auction_wallets SET balance=balance+? WHERE user_id=?',state.budget+state.fee-oldBudget-oldFee,base.id);
 delete state.inventoryVersion;delete state.skillVersion;state.catalogVersion=3;state.budget=oldBudget;state.fee=oldFee;state.items=generateAuction(n=>n-1,10*R,AUCTION_ITEMS_V3);
 e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),token);
 e.tavern.sql.exec('UPDATE tavern_auction_ledger SET amount=? WHERE id=?',-oldBudget,`auction:hold:${token}`);e.tavern.sql.exec('UPDATE tavern_auction_ledger SET amount=? WHERE id=?',-oldFee,`auction:fee:${token}`);
 const modal=immediateTavernReply(i(`auctionOffer~${token}~1~200000000`));assert.equal(modal.type,9);assert.equal(modal.data.components[0].components[0].max_length,9);
 const submitOld=submit(modal.data.custom_id.split(':')[3],'bid','200000000');assert.equal(immediateTavernReply(submitOld),null);
 let done;for(let round=1;round<=5;round++){force(e,token,[oldBudget,oldBudget,oldBudget],[0,1,2,3]);done=e.auction.bid({...base,token,round,bid:oldBudget},1004+round);}
 assert.equal(done.session.result.total,12000*R);assert.equal(done.balance,14900*R);const bid={...base,token,round:5,bid:oldBudget};assert.deepEqual(e.auction.bid(bid,1010).session.result,done.session.result);
});

test('versioned Viktor clues unlock only aggregate counts on round 2 and aggregate area on round 4',()=>{
 const items=[0,1,2,3,3,4,4,5].map((q,i)=>({...AUCTION_ITEMS.find(x=>x.quality===q&&x.width*x.height===[1,2,4][i%3]),name:`hidden-${i}`,value:987654321+i}));
 const info={highCount:null,items:items.map(()=>({quality:null,width:null,height:null}))},old=structuredClone(info);
 for(let round=1;round<=5;round++){
  revealAuction(items,info,'viktor',round,()=>{throw Error('aggregate skill must not draw randomness');},2);
  revealAuction(items,old,'viktor',round);
  assert.equal(info.highCount,5);assert.deepEqual(Object.keys(old).sort(),['highCount','items']);
  assert.deepEqual(Object.keys(info).sort(),round===1?['highCount','items']:round<4?['highCount','highCounts','items']:['highArea','highCount','highCounts','items']);
  if(round>=2)assert.deepEqual(info.highCounts,[2,2,1]);
  if(round>=4)assert.equal(info.highArea,items.slice(3).reduce((s,x)=>s+x.width*x.height,0));
  assert(info.items.every(x=>x.quality===null&&x.width===null&&x.height===null));
  assert(!JSON.stringify(info).includes('hidden-'));assert(!JSON.stringify(info).includes('987654'));
 }
});
test('aggregate area valuation matches exhaustive conditional pricing after per-item rounding in every tier',()=>{
 const pool=Array.from({length:6},(_,quality)=>[1,2,4,4].map((area,j)=>({quality,width:area===4?2:1,height:area===1?1:2,value:101+quality*137+j*59}))).flat();
 const empty=()=>Array.from({length:8},()=>({quality:null,width:null,height:null}));
 for(const {scale}of Object.values(AUCTION_TIERS)){
  const unit=R*scale,counts=[1,1,1],totals=new Map();
  for(const purple of pool.filter(x=>x.quality===3))for(const gold of pool.filter(x=>x.quality===4))for(const red of pool.filter(x=>x.quality===5)){
   const xs=[purple,gold,red],area=xs.reduce((s,x)=>s+x.width*x.height,0),d=totals.get(area)||{sum:0,count:0};
   d.sum+=xs.reduce((s,x)=>s+scaleAuctionValue(x.value,unit),0);d.count++;totals.set(area,d);
  }
  const low=5*[0,1,2].reduce((s,q)=>s+AUCTION_QUALITY_WEIGHTS[q]/75*pool.filter(x=>x.quality===q).reduce((v,x)=>v+scaleAuctionValue(x.value,unit),0)/4,0);
  for(const [highArea,d]of totals){
   const info={highCount:3,highCounts:counts,highArea,items:empty()};
   assert(Math.abs(estimateAuction(info,unit,pool)-low-d.sum/d.count)<1e-8);
   assert.equal(estimateAuction({...info,hiddenWarehouse:[{value:999999999}]},unit,pool),estimateAuction(info,unit,pool));
  }
  const split={highCount:3,highCounts:counts,items:empty()},highMean=pool.filter(x=>x.quality>=3).reduce((s,x)=>s+scaleAuctionValue(x.value,unit),0)/4;
  assert(Math.abs(estimateAuction(split,unit,pool)-low-highMean)<1e-8);
 }
});
test('aggregate clues handle zero and eight high items and reject impossible count or area states',()=>{
 const info={highCount:0,highCounts:[0,0,0],highArea:0,items:Array.from({length:8},()=>({quality:null,width:null,height:null}))};
 assert(Number.isFinite(estimateAuction(info)));
 const red=AUCTION_ITEMS.filter(x=>x.quality===5&&x.width*x.height===4),expected=8*red.reduce((s,x)=>s+x.value,0)/red.length;
 assert(Math.abs(estimateAuction({...info,highCount:8,highCounts:[0,0,8],highArea:32})-expected)<.001);
 for(const extra of [{highCounts:[-1,1,0]},{highCounts:[0,0,9],highCount:9},{highCounts:[0,0,1]},{highArea:1},{highCounts:[1,0,0],highCount:1,highArea:3},{highArea:0.5},{highCounts:[0,0]}])assert.throws(()=>estimateAuction({...info,...extra}),/线索/);
});
test('new players and NPCs share progressive skills while unversioned saved games keep old future quotes and text',t=>{
 for(const old of [false,true]){
  const e=setup(t),opened=open(e.auction,'viktor'),token=opened.session.token;
  let state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
  assert.equal(opened.session.skillVersion,2);if(old){delete state.inventoryVersion;delete state.skillVersion;}
  // A zero-high warehouse makes area 0 explicit, not an absent clue; force equal bids to reach each round.
  state.items=state.items.map(()=>({...AUCTION_ITEMS.find(x=>x.quality===0)}));state.infos.forEach(x=>x.highCount=null);
  e.auction.stage(state);e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),token);
  const before=e.auction.view(base,1004);assert.equal(before.session.skillVersion,old?1:2);
  const savedQuotes=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state).committed;
  e.auction.view(base,1005);assert.deepEqual(JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state).committed,savedQuotes);
  for(let round=1;round<=5;round++){
   const view=e.auction.view(base,1010+round),info=view.session.info,text=auctionData(view,'3','1');bounds(text);
   assert.equal(view.session.skillVersion,old?1:2);assert.equal(text.content.includes('第2轮分辨'),!old);
   assert.equal('highCounts'in info,!old&&round>=2);assert.equal('highArea'in info,!old&&round>=4);
   if(!old&&round>=2)assert(text.content.includes('紫 **0件** · 金 **0件** · 红 **0件**'));
   if(!old&&round>=4)assert(text.content.includes('合计 **0格**'));
   state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state);
   assert.deepEqual(state.infos[0],state.infos[3]);assert.equal(view.session.items,null);assert.equal(view.session.committed,undefined);
   assert.deepEqual(state.committed,state.infos.slice(1).map((info,j)=>npcAuctionBid(info,round,j,n=>n-1,R,AUCTION_ITEMS,AUCTION_QUALITY_WEIGHTS,BUDGET)));
   force(e,token,[BUDGET,BUDGET,BUDGET]);e.auction.bid({...base,token,round,bid:BUDGET},1020+round);
  }
 }
});
