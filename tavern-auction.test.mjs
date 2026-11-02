import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFile} from 'node:fs/promises';
import {TavernService} from './tavern-service.mjs';
import {TavernAuction,AUCTION_TTL,AUCTION_READY_TTL,AUCTION_ROLES,auctionRandom,generateAuction,revealAuction,estimateAuction,npcAuctionBid,decideAuction} from './tavern-auction.mjs';
import {AUCTION_ITEMS} from './tavern-auction-data.mjs';
import {auctionData,auctionRules,auctionCatalog} from './tavern-auction-ui.mjs';
import {answerTavern,immediateTavernReply,tavernDeferredReply,tavernCommand,finishTavern} from './tavern-ui.mjs';
import {renderAuctionImage} from './tavern-auction-image.mjs';
const base={guild:'3',id:'1',channel:'2',name:'Alice'};
function setup(t,random=n=>n-1){
 const db=new DatabaseSync(':memory:'),map=new Map();t.after(()=>db.close());let calls=0;
 const storage={sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length){const r=s.all(...a);return {toArray:()=>r,one:()=>r[0]};}s.run(...a);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>map.get(k),put:async(k,v)=>map.set(k,v)};
 const tavern=new TavernService(storage),auction=new TavernAuction(tavern,n=>{calls++;return random(n);});tavern._auction=auction;
 return {db,storage,tavern,auction,calls:()=>calls};
}
function open(a,role='sophie',now=1000){const v=a.view(base,now);return a.start({...base,token:v.offerToken,role},now+1);}
function force(e,token,bids,priority){const r=e.tavern.one('SELECT * FROM tavern_auctions WHERE token=?',token),s=JSON.parse(r.state);s.committed=bids;if(priority)s.priority=priority;e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(s),token);}
const i=(action='auction',extra={})=>({type:3,id:'999',token:'temporary',guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}},message:{flags:64},data:{custom_id:`t:3:1:${action}`},...extra});
const envFor=s=>({TABLES:{idFromName:n=>n,get:()=>({fetch:async(url,o)=>{try{return Response.json(await s.dispatch(JSON.parse(o.body)));}catch(e){return Response.json({error:e.message});}}})}});
function bounds(d){assert(d.content.length<=2000,`content ${d.content.length}`);assert(d.components.length<=5);for(const r of d.components){assert(r.components.length<=5);for(const c of r.components){assert(c.custom_id.length<=100);assert(c.label.length<=80);}}}

test('strict early-win boundaries, late ties and all-pass auctions follow the frozen contract',()=>{
 for(const [round,bid,second]of [[1,200,100],[2,160,100],[3,130,100],[4,110,100]]){
  assert.equal(decideAuction(round,[bid,second,0,0],[0,1,2,3]).done,false);
  if(bid<200)assert.equal(decideAuction(round,[bid+1,second,0,0],[0,1,2,3]).winner,0);
 }
 assert.equal(decideAuction(1,[199,99,0,0],[0,1,2,3]).winner,0);
 assert.equal(decideAuction(4,[50,50,0,0],[1,0,2,3]).done,false);
 assert.equal(decideAuction(5,[50,50,0,0],[1,0,2,3]).winner,1);
 assert.deepEqual(decideAuction(5,[0,0,0,0],[0,1,2,3]),{done:true,winner:null,price:0});
 for(const [r,b,p]of [[0,[0,0,0,0],[0,1,2,3]],[5,[201,0,0,0],[0,1,2,3]],[5,[0,0,0,0],[0,1,1,3]]])assert.throws(()=>decideAuction(r,b,p));
});
test('catalog generation has eight independent bounded items; crypto sampler rejects the tail',()=>{
 assert.equal(AUCTION_ITEMS.length,24);assert.equal(new Set(AUCTION_ITEMS.map(x=>x.id)).size,24);
 const items=generateAuction(n=>n-1);assert.equal(items.length,8);assert(items.every(x=>x.quality===5&&x.value===150));
 const original=crypto.getRandomValues;let k=0;
 try{crypto.getRandomValues=a=>{a[0]=k++?4294967289:4294967295;return a;};assert.equal(auctionRandom(10),9);assert.equal(k,2);}finally{crypto.getRandomValues=original;}
});
test('all three referenced abilities reveal only their stated fields and accumulate across rounds',()=>{
 const items=AUCTION_ITEMS.slice(0,8),empty=()=>({highCount:null,items:Array.from({length:8},()=>({quality:null,width:null,height:null}))});
 const sophie=empty();revealAuction(items,sophie,'sophie',1,n=>n-1);assert.equal(sophie.items.filter(x=>x.quality!==null).length,5);assert(sophie.items.every(x=>x.width===null));
 revealAuction(items,sophie,'sophie',2,n=>n-1);assert.equal(sophie.items.filter(x=>x.quality!==null).length,7);
 const gab=empty();revealAuction(items,gab,'gabriella',1,n=>n-1);assert.equal(gab.items.filter(x=>x.width!==null).length,2);assert.equal(gab.items.filter(x=>x.quality!==null).length,2);
 const victor=empty();revealAuction([AUCTION_ITEMS[12],AUCTION_ITEMS[16],AUCTION_ITEMS[20],...items.slice(0,5)],victor,'viktor',1);assert.equal(victor.highCount,3);assert(victor.items.every(x=>x.quality===null&&x.width===null));
});
test('NPC estimates use only disclosed fields; hidden item identities and player offer cannot affect the same observations',()=>{
 const info={highCount:null,items:Array.from({length:8},()=>({quality:null,width:null,height:null}))};
 assert(Math.abs(estimateAuction(info)-218.6)<0.00001);
 const poisoned={...info,items:info.items.map(x=>({...x,get value(){throw Error('private value read');},get name(){throw Error('private identity read');},get id(){throw Error('private id read');}})),get warehouse(){throw Error('private warehouse read');},get bid(){throw Error('player offer read');}};
 assert.equal(npcAuctionBid(info,1,1,n=>n-1),npcAuctionBid(poisoned,1,1,n=>n-1));
 const low={...info,highCount:0},high={...info,highCount:8};assert(estimateAuction(low)<estimateAuction(high));
});
test('entry is charged once; winning escrow, sale, ledgers and restart recovery settle exactly once',t=>{
 const e=setup(t),a=e.auction,v=a.view(base,1000);assert.equal(v.balance,500);assert.equal(v.session,null);
 const p={...base,token:v.offerToken,role:'sophie'},s=a.start(p,1001),token=s.session.token;assert.equal(s.balance,290);assert.equal(s.session.items,null);assert.equal(s.offerToken,null);
 const count=e.calls();assert.equal(a.start(p,1002).balance,290);assert.equal(e.calls(),count);
 force(e,token,[40,50,60]);const bid={...base,token,round:1,bid:150},r=a.bid(bid,1003);assert.equal(r.balance,1540);assert.equal(r.session.result.net,1040);assert.equal(r.session.result.refund,50);assert.equal(r.session.result.resale,1200);
 const restored=new TavernAuction(new TavernService(e.storage),()=>{throw Error('rerolled');});const replay=restored.bid(bid,3000);assert(replay.repeated);assert.deepEqual(replay.session.result,r.session.result);assert.equal(replay.balance,1540);
 assert.equal(e.tavern.one("SELECT COUNT(*) n FROM tavern_ledger WHERE kind LIKE 'auction_%'").n,4);assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_daily').n,0);assert.equal(e.tavern.one('SELECT COUNT(*) n FROM tavern_orders').n,0);
 assert.throws(()=>restored.bid({...bid,bid:149},3001),/另一报价/);
});
test('five rounds allow lower new totals; stale and contradictory offers cannot alter the current stage',t=>{
 const e=setup(t),a=e.auction,s=open(a),token=s.session.token;let r;
 for(let round=1;round<=5;round++){
  force(e,token,[100,100,100],[0,1,2,3]);r=a.bid({...base,token,round,bid:round===1?150:100},1001+round);
  if(round<5)assert.equal(r.session.round,round+1);
 }
 assert.equal(r.session.result.price,100);assert.equal(r.session.result.winner,0);assert.equal(r.session.history.length,5);assert.equal(r.balance,1590);
 const old=a.bid({...base,token,round:1,bid:150},2000);assert(old.repeated);assert.equal(old.balance,r.balance);assert.equal(old.session.history.length,5);
});
test('loss, complete pass, leaving and expiry refund the right budget and never create an extra fee',t=>{
 for(const mode of ['loss','pass','leave','expired']){
  const e=setup(t),a=e.auction,s=open(a),token=s.session.token;let r;
  if(mode==='loss'){force(e,token,[200,40,10]);r=a.bid({...base,token,round:1,bid:10},1010);}
  if(mode==='pass')for(let round=1;round<=5;round++){force(e,token,[0,0,0]);r=a.bid({...base,token,round,bid:0},1010+round);}
  if(mode==='leave')r=a.leave({...base,token,round:1},1010);
  if(mode==='expired')r=a.view(base,1001+AUCTION_TTL);
  assert.equal(r.balance,490);assert.equal(r.session.result.net,-10);assert.equal(r.session.result.refund,200);assert.equal(r.stats.plays,1);
  if(mode==='pass')assert.equal(r.session.result.winner,null);
  if(mode==='expired')assert.equal(r.session.result.reason,'expired');
  assert.equal(a.view(base,1002+AUCTION_TTL).balance,490);
  assert.equal(e.tavern.one("SELECT COUNT(*) n FROM tavern_ledger WHERE kind='auction_fee'").n,1);
 }
});
test('foreign ownership, channels, guilds, expired opening, invalid prices and insufficient funds are rejected without charges',async t=>{
 const e=setup(t),a=e.auction,v=a.view(base,1000),p={...base,token:v.offerToken,role:'sophie'};
 for(const extra of [{id:'4'},{channel:'4'},{token:'0'.repeat(16)},{role:'fake'}])assert.throws(()=>a.start({...p,...extra},1001));
 assert.throws(()=>a.start(p,1000+AUCTION_READY_TTL),/过期/);assert.equal(e.tavern.member('1').balance,500);
 e.tavern.sql.exec("UPDATE tavern_members SET balance=209 WHERE id='1'");assert.throws(()=>a.start(p,1001),/210/);e.tavern.sql.exec("UPDATE tavern_members SET balance=500 WHERE id='1'");
 const s=a.start(p,1001),token=s.session.token;for(const bid of [-1,201,1.5,'10',NaN])assert.throws(()=>a.bid({...base,token,round:1,bid},1002));
 assert.throws(()=>a.bid({...base,channel:'4',token,round:1,bid:100},1002),/本频道/);
 const elsewhere=a.view({...base,channel:'4'},1002);assert(elsewhere.session.readOnly);assert.equal(elsewhere.offerToken,null);
 const other=a.view({...base,channel:'5'},1002);assert.equal(other.balance,290);assert.equal(other.session.token,token);
 await e.tavern.dispatch({...base,action:'auctionView'});await assert.rejects(()=>e.tavern.dispatch({...base,guild:'9',action:'auctionView'}),/服务器不匹配/);
 const another=setup(t);assert.equal(another.auction.view(base,1000).balance,500);
});
test('a second pre-opened channel cannot start a second active game, and stale leave cannot skip a new round',t=>{
 const e=setup(t),a=e.auction,v=a.view(base,1000),v2=a.view({...base,channel:'4'},1000),s=a.start({...base,token:v.offerToken,role:'sophie'},1001),token=s.session.token;
 assert.throws(()=>a.start({...base,channel:'4',token:v2.offerToken,role:'sophie'},1002),/已有一局/);
 force(e,token,[100,100,100]);a.bid({...base,token,round:1,bid:100},1003);
 assert.throws(()=>a.leave({...base,token,round:1},1004),/回合已变化/);assert.equal(a.view(base,1004).session.round,2);assert.equal(a.view(base,1004).balance,290);
});
test('entry or settlement failure rolls back money, ledgers, status and disclosed state together',t=>{
 const e=setup(t),a=e.auction,v=a.view(base,1000),p={...base,token:v.offerToken,role:'sophie'},exec=e.storage.sql.exec;
 e.storage.sql.exec=(q,...args)=>{if(args[3]==='auction_hold')throw Error('disk');return exec(q,...args);};
 assert.throws(()=>a.start(p,1001),/disk/);e.storage.sql.exec=exec;assert.equal(a.view(base,1002).balance,500);assert.equal(e.tavern.one("SELECT COUNT(*) n FROM tavern_ledger WHERE kind LIKE 'auction_%'").n,0);
 const s=a.start(p,1003),token=s.session.token;force(e,token,[40,50,60]);const before=e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state;
 e.storage.sql.exec=(q,...args)=>{if(args[3]==='auction_sale')throw Error('disk');return exec(q,...args);};
 assert.throws(()=>a.bid({...base,token,round:1,bid:150},1004),/disk/);e.storage.sql.exec=exec;
 assert.equal(a.view(base,1005).balance,290);assert.equal(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token).state,before);assert.equal(e.tavern.one("SELECT COUNT(*) n FROM tavern_ledger WHERE kind='auction_refund'").n,0);
 assert.equal(a.bid({...base,token,round:1,bid:150},1006).balance,1540);
});
test('response whitelist never exports hidden item identity, price, opponents info or committed bids',t=>{
 const e=setup(t),s=open(e.auction,'viktor'),raw=JSON.stringify(s);
 for(const word of ['committed','infos','tavern-5-3','始祖秘传配方','1200','value'])assert(!raw.includes(word));
 assert.equal(s.session.info.highCount,8);assert(s.session.info.items.every(x=>x.quality===null&&x.width===null));assert.equal(s.session.items,null);
});
test('Discord buttons, modal and ownership route with private acknowledgements and bounded content',async t=>{
 const e=setup(t),env=envFor(e.tavern),v=await answerTavern(env,i());bounds(v);assert.equal(tavernCommand.options.filter(o=>o.name==='仓库盲拍').length,1);assert(tavernCommand.options.length<=25);
 assert.deepEqual(tavernDeferredReply(i('auction',{message:{flags:0},data:{custom_id:'t:3:any:auction'}})),{type:5,data:{flags:64}});
 assert.deepEqual(tavernDeferredReply(i()),{type:6});
 const start=v.components[0].components[0].custom_id.split(':')[3],s=await answerTavern(env,i(start));bounds(s);const snap=e.auction.view(base),a=`${snap.session.token}~1`;
 const modal=immediateTavernReply(i(`auctionOffer~${a}`));assert.equal(modal.type,9);assert.equal(modal.data.custom_id,`t:3:1:auctionBid~${a}`);
 const submit=i(`auctionBid~${a}`,{type:5,data:{custom_id:`t:3:1:auctionBid~${a}`,components:[{type:1,components:[{type:4,custom_id:'bid',value:'125'}]}]}});
 assert.equal(immediateTavernReply(submit),null);assert.deepEqual(tavernDeferredReply(submit),{type:6});bounds(await answerTavern(env,submit));
 const invalid=structuredClone(submit);invalid.data.components[0].components[0].value='201';assert.equal(immediateTavernReply(invalid).type,4);
 for(const bad of [i('auction',{member:{user:{id:'4'}}}),i('auction',{message:{flags:0}}),i('auction',{guild_id:'9'}),i('auction',{member:{user:{id:'1',bot:true}}}),i(`auctionBid~${a}~201`),i('auction',{type:5})])assert.equal(immediateTavernReply(bad).type,4);
 for(const d of [auctionRules('3','1'),auctionCatalog('3','1'),auctionData({...e.auction.view(base),balance:0},'3','1')])bounds(d);
 const huge=i('auction',{guild_id:'12345678901234567890',member:{user:{id:'12345678901234567890'}}});const d=auctionData(e.auction.view(base),huge.guild_id,huge.member.user.id);bounds(d);
});
test('lost Discord delivery restores the sealed round without double debit and image output never leaks an unknown warehouse',async t=>{
 const e=setup(t),env={...envFor(e.tavern),DISCORD_APPLICATION_ID:'123'},v=await answerTavern(env,i()),start=v.components[0].components[0].custom_id.split(':')[3];
 t.mock.method(globalThis,'fetch',async()=>{throw Error('network');});await finishTavern(env,i(start));const snap=e.auction.view(base),state=e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',snap.session.token).state;await finishTavern(env,i(start));assert.equal(e.auction.view(base).balance,290);assert.equal(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',snap.session.token).state,state);
 const a=await renderAuctionImage(snap.session),b=await renderAuctionImage({...snap.session,items:AUCTION_ITEMS.slice(0,8)});assert.deepEqual(a,b);assert.deepEqual([...a.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(new DataView(a.buffer).getUint32(16),760);assert.equal(new DataView(a.buffer).getUint32(20),1000);
 force(e,snap.session.token,[40,50,60]);const end=e.auction.bid({...base,token:snap.session.token,round:1,bid:150}),c=await renderAuctionImage(end.session);assert.notDeepEqual(c,a);assert(c.length<150000);bounds(auctionData(end,'3','1'));
 await writeFile('/tmp/tavern-auction-active.png',a);await writeFile('/tmp/tavern-auction-settled.png',c);
});

test('full-budget purchase and expired retry release exactly one escrow, including zero unused budget',t=>{
 const e=setup(t),a=e.auction,s=open(a),token=s.session.token;
 const row=e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',token),state=JSON.parse(row.state);state.items=Array.from({length:8},()=>({...AUCTION_ITEMS[0]}));state.committed=[40,50,60];e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),token);
 const loss=a.bid({...base,token,round:1,bid:200},1002);assert.equal(loss.session.result.refund,0);assert.equal(loss.session.result.resale,32);assert.equal(loss.session.result.net,-178);assert.equal(loss.balance,322);
 const e2=setup(t),a2=e2.auction,v=a2.view(base,1000),p={...base,token:v.offerToken,role:'sophie'},v2=a2.start(p,1001);force(e2,v2.session.token,[100,100,100]);
 a2.bid({...base,token:v2.session.token,round:1,bid:100},1002);
 const restored=a2.start(p,1001+AUCTION_TTL);assert.equal(restored.session.status,'settled');assert.equal(restored.session.result.reason,'expired');assert.equal(restored.balance,490);assert.equal(a2.start(p,2000+AUCTION_TTL).balance,490);
 const e3=setup(t),s3=open(e3.auction);force(e3,s3.session.token,[100,100,100]);const b={...base,token:s3.session.token,round:1,bid:100};e3.auction.bid(b,1002);assert.equal(e3.auction.bid(b,1001+AUCTION_TTL).session.result.reason,'expired');
});
