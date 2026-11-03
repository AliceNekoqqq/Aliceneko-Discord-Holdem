import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AUCTION_ALL_ITEMS,AUCTION_NEW_ITEMS,AUCTION_CURRENT_ITEMS,AUCTION_ITEMS} from './tavern-auction-data.mjs';
import {largeCatalog,largeModel,largeItemChance,generateLargeAuction,estimateLargeAuction} from './tavern-auction-large.mjs';
import {AUCTION_REGIONS,AUCTION_WAREHOUSES} from './tavern-auction-regions.mjs';
import {TavernAuction,generateAuction,npcAuctionBid} from './tavern-auction.mjs';
import {TavernService} from './tavern-service.mjs';
import {layoutAuction} from './tavern-auction-board.mjs';
import art from './auction-art-manifest.mjs';
const R=100000,base={guild:'3',id:'1',channel:'2',name:'Isolated fixture'};
const empty=n=>({highCount:null,items:Array.from({length:n},()=>({quality:null,width:null,height:null}))});
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const map=new Map();
 const storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length)return {toArray:()=>s.all(...a)};s.run(...a);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const tavern=new TavernService(storage),a=new TavernAuction(tavern,n=>n-1);tavern._auction=a;
 const fx=tavern.auctionCurrency;fx.view(base,1000);tavern.sql.exec('UPDATE tavern_members SET balance=20000 WHERE id=?','1');fx.convert({...base,token:fx.view(base,1000).token,direction:'buy',amount:20000},1000);
 const token=a.view(base,1000).offerToken;a.start({...base,token,role:'gabriella',tier:'collection',presentation:'warehouse'},1000);
 return {tavern,a,fx,token,storage};
}

test('V8 adds exactly forty unique natural-price collectibles and preserves the V7 data pool',()=>{
 assert.equal(AUCTION_ALL_ITEMS.length,204);assert.equal(AUCTION_NEW_ITEMS.length,40);assert.equal(AUCTION_CURRENT_ITEMS.length,244);
 assert.equal(new Set(AUCTION_CURRENT_ITEMS.map(x=>x.id)).size,244);assert.equal(new Set(AUCTION_CURRENT_ITEMS.map(x=>x.name)).size,244);
 assert.deepEqual(Array.from({length:6},(_,q)=>AUCTION_NEW_ITEMS.filter(x=>x.quality===q).length),[1,4,9,10,6,10]);
 assert.equal(AUCTION_NEW_ITEMS.filter(x=>x.width*x.height>4).length,8);
 assert.equal(AUCTION_NEW_ITEMS.filter(x=>x.quality===5&&x.width*x.height===1).length,4);
 for(const x of AUCTION_NEW_ITEMS){assert(x.flavor);assert(Number.isSafeInteger(x.value)&&x.value>0&&x.value%100!==0);assert(Number.isInteger(x.dropWeight)&&x.dropWeight>0);}
 for(const tier of Object.keys(AUCTION_REGIONS)){
  assert.equal(largeCatalog(tier,7).length,204);assert.equal(largeCatalog(tier,8).length,244);
  for(const x of largeCatalog(tier,7))assert.deepEqual(largeCatalog(tier,8).find(n=>n.id===x.id),x);
 }
});

test('four-region probabilities normalize for both versions and every new collectible has its own obtainable odds',()=>{
 for(const tier of Object.keys(AUCTION_REGIONS))for(const version of [7,8])for(let quality=0;quality<6;quality++){
  const xs=largeCatalog(tier,version).filter(x=>x.quality===quality);
  assert(Math.abs(xs.reduce((n,x)=>n+largeItemChance(x,tier,version).slot,0)-AUCTION_REGIONS[tier].quality[quality]/1000)<1e-12);
 }
 for(const tier of Object.keys(AUCTION_REGIONS))for(const x of AUCTION_NEW_ITEMS){const p=largeItemChance(x,tier);assert(p.slot>0&&p.warehouse>=p.slot&&p.warehouse<1);}
 const moon=AUCTION_NEW_ITEMS.find(x=>x.name==='一滴月光');
 assert(largeItemChance(moon,'collection').slot>largeItemChance(moon,'small').slot);
 assert(largeItemChance(moon,'standard').slot<largeItemChance(AUCTION_ITEMS.find(x=>x.id==='tavern-5-12'),'standard').slot);
});

test('each new item is reachable through production weighting and all eight large props fit without overlap',()=>{
 for(const tier of Object.keys(AUCTION_REGIONS))for(const target of AUCTION_NEW_ITEMS){
  const warehouse={...AUCTION_WAREHOUSES[2],count:13},m=largeModel(tier,warehouse),large=target.width*target.height>4;
  const xs=(large?m.featured:m.ordinary).filter(x=>x.quality===target.quality),at=xs.findIndex(x=>x.id===target.id);assert(at>=0);
  const qualityTicket=m.weights.slice(0,target.quality).reduce((s,x)=>s+x,0),itemTicket=xs.slice(0,at).reduce((s,x)=>s+x.dropWeight,0);let calls=0;
  const goods=generateLargeAuction(n=>{const i=calls++;return large?(i<2?0:i===2?qualityTicket:i===3?itemTicket:0):(i===0?999:i===1?qualityTicket:i===2?itemTicket:0);},R,tier,warehouse,generateAuction);
  assert.equal(goods[0].id,target.id);assert.equal(goods[0].value,target.value);assert(goods.filter(x=>x.width*x.height>4).length<=1);
  const slots=layoutAuction(goods,'1234567890abcdef',warehouse),occupied=new Set();
  slots.forEach((p,i)=>{assert.equal(p.width,goods[i].width);assert.equal(p.height,goods[i].height);assert(p.x+p.width<=warehouse.cols&&p.y+p.height<=warehouse.rows);for(let y=p.y;y<p.y+p.height;y++)for(let x=p.x;x<p.x+p.width;x++){const key=x+','+y;assert(!occupied.has(key));occupied.add(key);}});
 }
});

test('a saved V7 auction keeps its catalog, prices, estimate and next-round opponent prior after cold restart',t=>{
 const e=fixture(t),state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',e.token).state);
 state.catalogVersion=7;state.dropVersion=4;state.warehouse={...AUCTION_WAREHOUSES[2],count:13};
 state.items=generateLargeAuction(n=>n-1,state.unit,state.tier,state.warehouse,generateAuction,7);
 state.infos=Array.from({length:4},()=>empty(13));state.board=layoutAuction(state.items,e.token,state.warehouse);state.committed=[state.budget,state.budget,state.budget];
 e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),e.token);
 const frozen=JSON.stringify(state.items),cold=new TavernAuction(new TavernService(e.storage),n=>n-1),view=cold.view(base,1001);
 assert.equal(view.session.catalogVersion,7);assert.equal(view.session.catalogSize,204);
 assert.equal(view.session.estimate,Math.floor(estimateLargeAuction(state.infos[0],state.unit,state.tier,state.warehouse,7)));
 assert.deepEqual(JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',e.token).state).committed,state.committed);
 cold.bid({...base,token:e.token,round:1,bid:state.budget},1002);
 const next=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',e.token).state);
 assert.equal(JSON.stringify(next.items),frozen);assert.equal(next.round,2);
 assert.deepEqual(next.committed,next.infos.slice(1).map((info,i)=>npcAuctionBid(info,2,i,n=>n-1,state.unit,largeCatalog(state.tier,7),AUCTION_REGIONS[state.tier].quality,state.budget,clue=>estimateLargeAuction(clue,state.unit,state.tier,state.warehouse,7))));
});

test('all forty new items retain fixed value through acquisition, unlocking, display and idempotent bulk sale',t=>{
 const e=fixture(t),inventory=e.a.inventory,large=AUCTION_NEW_ITEMS.filter(x=>x.width*x.height>4),ordinary=AUCTION_NEW_ITEMS.filter(x=>x.width*x.height<=4),owned=[];
 for(let lot=0;lot<8;lot++){
  const token=(lot+16).toString(16).padStart(16,'0'),items=[large[lot],...ordinary.slice(lot*4,lot*4+4),...AUCTION_ITEMS.slice(0,4)];
  inventory.acquire({token,user_id:base.id},{items,tier:'standard',revealOrder:items.map((_,i)=>i)},1001+lot);
  inventory.unlock(base.id,token,items.map((_,i)=>i));items.slice(0,5).forEach((item,i)=>owned.push({id:`${token}_${i}`,item}));
 }
 assert.equal(new Set(owned.map(x=>x.item.id)).size,40);
 const displayed=owned.find(x=>x.item.width*x.item.height===12);let page=inventory.view(base,1020);
 page=inventory.select({...base,token:page.token,selected:[displayed.id]},1021);
 page=inventory.place({...base,token:page.token,slot:0},1022);assert.equal(page.cabinet[0].item.value,displayed.item.value);
 page=inventory.view(base,1023);
 const quote=inventory.quote({...base,token:page.token,quality:6},1024),expected=owned.reduce((n,x)=>n+(x.id===displayed.id?0:x.item.value),0)+8*AUCTION_ITEMS.slice(0,4).reduce((n,x)=>n+x.value,0),balance=e.fx.balance(base.id);
 assert.equal(quote.count,71);assert.equal(quote.total,expected);
 inventory.sell({...base,token:quote.token},1025);assert.equal(e.fx.balance(base.id),balance+expected);
 inventory.sell({...base,token:quote.token},1026);assert.equal(e.fx.balance(base.id),balance+expected);
 assert.equal(inventory.view(base,1027).cabinet[0].id,displayed.id);
});

test('forty unique transparent PNG sprites extend the atlas while preserving every byte of the V7 atlas',async()=>{
 const hashes=new Set();for(const x of AUCTION_NEW_ITEMS){
  const r=art.items[x.id],png=await readFile('public'+r.path);assert(r.bounds&&r.bounds[2]>r.bounds[0]&&r.bounds[3]>r.bounds[1]);
  assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
  const hash=createHash('sha256').update(png).digest('hex');assert.equal(hash,r.sha256);hashes.add(hash);
 }
 assert.equal(hashes.size,40);assert(art.bytes<25*1024*1024);
 const old=await readFile('public'+art.previousLargeAtlas.path),current=await readFile('public'+art.path);
 assert.equal(current.length,art.bytes);assert(current.subarray(0,old.length).equals(old));
});
