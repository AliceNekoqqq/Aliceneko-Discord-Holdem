import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {TavernService} from './tavern-service.mjs';
import {TavernAuction,AUCTION_TIERS,AUCTION_QUALITY_WEIGHTS,generateAuction,estimateAuction,npcAuctionBid} from './tavern-auction.mjs';
import {AUCTION_ITEMS,auctionItemChance} from './tavern-auction-data.mjs';
import {AUCTION_REGIONS,AUCTION_WAREHOUSES,regionCatalog,regionItemChance,drawAuctionWarehouse} from './tavern-auction-regions.mjs';
import {layoutAuction} from './tavern-auction-board.mjs';
import {auctionData,auctionCatalog,auctionRules} from './tavern-auction-ui.mjs';
import {answerTavern,immediateTavernReply} from './tavern-ui.mjs';
import {renderAuctionImage} from './tavern-auction-image.mjs';
const base={guild:'3',id:'1',channel:'2',name:'Alice'},R=100000,now=Date.now();
function seeded(seed){let value=seed>>>0;return n=>{const max=Math.floor(4294967296/n)*n;let x;do{value=(Math.imul(value,1664525)+1013904223)>>>0;x=value;}while(x>=max);return x%n;};}
function fixture(t,tier='standard',size=2,count=18,varied=false,role='viktor'){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const map=new Map(),storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length)return {toArray:()=>s.all(...a)};s.run(...a);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const tavern=new TavernService(storage),sample=seeded(714+size);let call=0;
 const random=n=>{call++;if(call===1){assert.equal(n,10000);return AUCTION_REGIONS[tier].size.slice(0,size).reduce((s,x)=>s+x,0);}if(call===2)return count-AUCTION_WAREHOUSES[size].min;return varied?sample(n):n-1;};
 const auction=new TavernAuction(tavern,random);tavern._auction=auction;const fx=tavern.auctionCurrency;fx.view(base,now);tavern.sql.exec('UPDATE tavern_members SET balance=20000 WHERE id=?','1');fx.convert({...base,token:fx.view(base,now).token,direction:'buy',amount:20000},now);
 const token=auction.view(base,now).offerToken,started=auction.start({...base,token,tier,role,presentation:'warehouse'},now);
 return {db,storage,tavern,auction,inventory:auction.inventory,fx,token,started,calls:()=>call};
}
function win(e){const raw=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',e.token).state);raw.committed=[0,0,0];e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(raw),e.token);return e.auction.bid({...base,token:e.token,round:1,bid:1},now);}
function bounds(view){assert(view.content.length<=2000,`content ${view.content.length}`);assert(view.components.length<=5);for(const row of view.components){assert(row.components.length<=5);for(const c of row.components){assert(c.custom_id.length<=100);if(c.label)assert(c.label.length<=80);}}}
const click=action=>({type:3,guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}},message:{flags:64},data:{custom_id:`t:3:1:${action}`,component_type:2}});
const envFor=e=>({TABLES:{idFromName:n=>n,get:()=>({fetch:async(url,o)=>{try{return Response.json(await e.tavern.dispatch(JSON.parse(o.body)));}catch(error){return Response.json({error:error.message});}}})}});

test('four regions preserve exact quality totals while both red and every rare red become more likely',()=>{
 const tiers=Object.keys(AUCTION_REGIONS),tickets=[0,99];
 for(const tier of tiers){const r=AUCTION_REGIONS[tier],pool=regionCatalog(tier),counts=[0,0,0,0,0,0];assert.equal(r.quality.reduce((s,x)=>s+x),1000);assert.equal(r.size.reduce((s,x)=>s+x),10000);
  for(let ticket=0;ticket<1000;ticket++){let k=0;for(const item of generateAuction(()=>k++%2===0?ticket:0,R,pool,r.quality,6))counts[item.quality]++;}assert.deepEqual(counts,r.quality.map(x=>x*6));
  for(let q=0;q<6;q++)assert(Math.abs(pool.filter(x=>x.quality===q).reduce((s,x)=>s+regionItemChance(x,tier).slot,0)-r.quality[q]/1000)<1e-12);
 }
 for(const item of AUCTION_ITEMS.filter(x=>x.quality===5&&['稀有','极稀有','传世'].includes(x.rarity))){const p=tiers.map(t=>regionItemChance(item,t));for(let i=1;i<p.length;i++){assert(p[i].slot>p[i-1].slot,item.id);assert(p[i].within>p[i-1].within,item.id);assert(p[i].warehouse>p[i-1].warehouse,item.id);}}
 assert.throws(()=>regionCatalog('__proto__'));assert.throws(()=>regionItemChance({id:'fake'},'small'));
});
test('warehouse lottery covers every ticket and every count boundary without drawing items from capacity',()=>{
 for(const tier of Object.keys(AUCTION_REGIONS)){
  const counts=[0,0,0];for(let ticket=0;ticket<10000;ticket++){let k=0;const w=drawAuctionWarehouse(tier,()=>k++===0?ticket:0);counts[AUCTION_WAREHOUSES.findIndex(x=>x.id===w.id)]++;}assert.deepEqual(counts,AUCTION_REGIONS[tier].size);
  for(let i=0;i<3;i++){const s=AUCTION_WAREHOUSES[i],ticket=AUCTION_REGIONS[tier].size.slice(0,i).reduce((a,b)=>a+b,0);for(let count=s.min;count<=s.max;count++){let k=0;const w=drawAuctionWarehouse(tier,()=>k++===0?ticket:count-s.min);assert.equal(w.count,count);assert.equal(w.cols*w.rows,[32,48,80][i]);assert(w.count*4<=w.cols*w.rows);}}
 }
 const item=AUCTION_ITEMS.find(x=>x.id==='tavern-5-12');for(const tier of Object.keys(AUCTION_REGIONS)){
  const p=regionItemChance(item,tier),expected=AUCTION_WAREHOUSES.reduce((sum,s,i)=>sum+AUCTION_REGIONS[tier].size[i]/10000*Array.from({length:s.max-s.min+1},(_,j)=>1-(1-p.slot)**(s.min+j)).reduce((a,b)=>a+b,0)/(s.max-s.min+1),0);
  assert(Math.abs(p.warehouse-expected)<1e-14);assert(Math.abs(regionItemChance(item,tier,18).warehouse-(1-(1-p.slot)**18))<1e-14);
 }
});
test('thousands of random and all-large-footprint layouts fit each physical board and survive token replay',()=>{
 for(const w of AUCTION_WAREHOUSES)for(let seed=0;seed<250;seed++){
  const n=w.min+seed%(w.max-w.min+1),items=seed%2?generateAuction(seeded(seed),R,AUCTION_ITEMS,AUCTION_QUALITY_WEIGHTS,n):Array.from({length:n},()=>({width:2,height:2})),token=String(seed).padStart(16,'0');
  const positions=layoutAuction(items,token,w),cells=new Set();assert.deepEqual(positions,layoutAuction(items,token,w));assert.equal(positions.length,n);
  positions.forEach((p,i)=>{assert.equal(p.width,items[i].width);assert.equal(p.height,items[i].height);assert(p.x>=0&&p.y>=0&&p.x+p.width<=w.cols&&p.y+p.height<=w.rows);for(let y=p.y;y<p.y+p.height;y++)for(let x=p.x;x<p.x+p.width;x++){const key=`${x},${y}`;assert(!cells.has(key));cells.add(key);}});
 }
});
test('variable-count aggregate clues and hidden-count priors match exhaustive weighted outcomes in all regions',()=>{
 const pool=Array.from({length:6},(_,quality)=>[1,2,4].map((area,j)=>({quality,width:area===4?2:1,height:area===1?1:2,value:101+quality*139+j*61,dropWeight:[2,3,7][j]}))).flat(),mean=q=>pool.filter(x=>x.quality===q).reduce((s,x)=>s+x.value*x.dropWeight,0)/12;
 for(const count of [6,12,18])for(const tier of Object.keys(AUCTION_REGIONS)){
  const weights=AUCTION_REGIONS[tier].quality,lowMass=weights.slice(0,3).reduce((s,x)=>s+x,0),highMass=1000-lowMass,low=(count-2)*[0,1,2].reduce((s,q)=>s+mean(q)*weights[q]/lowMass,0),items=Array.from({length:count},()=>({quality:null,width:null,height:null})),outcomes=new Map();
  for(const a of pool.filter(x=>x.quality===3))for(const b of pool.filter(x=>x.quality===5)){const area=a.width*a.height+b.width*b.height,p=a.dropWeight*b.dropWeight,d=outcomes.get(area)||{sum:0,p:0};d.sum+=p*(a.value+b.value);d.p+=p;outcomes.set(area,d);}
  for(const [highArea,d]of outcomes)assert(Math.abs(estimateAuction({highCount:2,highCounts:[1,0,1],highArea,items},R,pool,weights)-low-d.sum/d.p)<1e-9);
  const hidden=estimateAuction({highCount:2,items},R,pool,weights),expect=low+2*[3,4,5].reduce((s,q)=>s+mean(q)*weights[q]/highMass,0);assert(Math.abs(hidden-expect)<1e-9);
 }
});
test('18-item opening never truncates inventory or leaks totals at item 8; double-digit assets can sell/display after restart',t=>{
 const e=fixture(t,'collection',2,18),initial=e.started.session;assert.equal(initial.itemCount,18);assert.equal(initial.catalogVersion,6);assert.equal(initial.board.rows,8);assert.equal(initial.info.items.length,18);assert.equal(initial.items,null);const cash=e.fx.balance('1'),calls=e.calls();
 const repeated=e.auction.start({...base,token:e.token,role:'viktor',tier:'collection',presentation:'warehouse'},now);assert(repeated.repeated);assert.equal(e.calls(),calls);assert.equal(repeated.balance,cash);
 win(e);assert.equal(e.inventory.view(base,now).locked,18);
 for(let step=0;step<17;step++){const view=e.auction.reveal({...base,token:e.token,step,all:false},now);assert.equal(view.session.reveal.count,step+1);assert.equal(view.stats.net,0);assert.equal(view.balance,null);assert.equal(view.session.result.total,undefined);bounds(auctionData(view,'3','1'));}
 const after17=e.inventory.view(base,now);assert.equal(after17.count,17);assert.equal(after17.locked,1);assert.equal(after17.pending.opened,17);
 const restored=new TavernAuction(new TavernService(e.storage),()=>{throw Error('reroll');}),done=restored.reveal({...base,token:e.token,step:17,all:false},now);assert.equal(done.session.reveal.total,18);assert.equal(done.stats.net,done.session.result.net);assert.equal(done.session.items.length,18);assert(auctionData(done,'3','1').content.includes('18件藏品已存入'));bounds(auctionData(done,'3','1'));
 assert(restored.reveal({...base,token:e.token,step:17,all:false},now).repeated);const inv=restored.inventory,one=inv.view({...base,page:1},now),unit=one.items.find(x=>x.position===17);assert(unit);
 const selected=inv.select({...base,token:one.token,selected:[unit.id]},now),quote=inv.quote({...base,token:selected.token},now),before=e.fx.balance('1'),sold=inv.sell({...base,token:quote.token},now);assert.equal(sold.count,17);assert.equal(sold.balance,before+unit.item.value);assert(inv.sell({...base,token:quote.token},now).repeated);
 const v=inv.view(base,now),last=v.items.find(x=>x.position===16),pick=inv.select({...base,token:v.token,selected:[last.id]},now);assert.equal(inv.place({...base,token:pick.token,slot:5},now).displayed,1);
 const bulk=inv.quote({...base,token:inv.view(base,now).token,quality:6},now);assert.equal(bulk.count,16);const all=inv.sell({...base,token:bulk.token},now);assert.equal(all.count,1);assert.equal(all.displayed,1);
 assert.throws(()=>restored.reveal({...base,token:e.token,step:19,all:true},now));
});
test('small and medium warehouses finish exactly at their own count, with correct pending state and cash-only refunds',t=>{
 for(const [size,count]of [[0,6],[1,12]]){const e=fixture(t,'standard',size,count),before=e.fx.balance('1');win(e);const pending=e.inventory.view(base,now);assert.equal(pending.locked,count);assert.equal(e.fx.balance('1'),before+AUCTION_TIERS.standard.budget-1);
  const done=e.auction.reveal({...base,token:e.token,step:0,all:true},now);assert.equal(done.session.reveal.count,count);const v=e.inventory.view(base,now);assert.equal(v.count,count);assert.equal(v.pending,null);assert.equal(v.locked,0);assert.equal(v.value,done.session.result.total);assert.equal(done.stats.net,done.session.result.net);}
});
test('casino.13 sessions continue their frozen eight-item pool, layout and future bids after regional updates',t=>{
 for(const role of ['sophie','gabriella','viktor']){
  const e=fixture(t,'high',0,8),state=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',e.token).state);state.catalogVersion=5;state.dropVersion=2;delete state.warehouse;state.role=role;state.items=generateAuction(n=>n-1,state.unit,AUCTION_ITEMS);state.board=layoutAuction(state.items,e.token);state.infos=Array.from({length:4},()=>({highCount:null,items:Array.from({length:8},()=>({quality:null,width:null,height:null}))}));e.auction.stage(state);const saved=structuredClone(state.committed);e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),e.token);
  const view=e.auction.view(base,now);assert.equal(view.session.itemCount,8);assert.equal(view.session.board.rows,6);assert.equal(view.session.estimate,Math.floor(estimateAuction(state.infos[0],state.unit,AUCTION_ITEMS)));assert.deepEqual(JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',e.token).state).committed,saved);
  state.committed=[state.budget,state.budget,state.budget];e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(state),e.token);e.auction.bid({...base,token:e.token,round:1,bid:state.budget},now);const after=JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',e.token).state);
  assert.deepEqual(after.board,state.board);assert.deepEqual(after.items,state.items);assert.deepEqual(after.committed,after.infos.slice(1).map((info,j)=>npcAuctionBid(info,2,j,n=>n-1,state.unit,AUCTION_ITEMS,AUCTION_QUALITY_WEIGHTS,state.budget)));
 }
});
test('regional catalog and 18-item private UI controls fit Discord, validate region switches and restore the last opening',async t=>{
 bounds(auctionRules('3','1'));for(const tier of Object.keys(AUCTION_REGIONS))for(let q=0;q<6;q++)for(let page=0;page<Math.ceil(regionCatalog(tier).filter(x=>x.quality===q).length/12);page++){const view=auctionCatalog('3','1',q,page,tier);bounds(view);assert.equal(view.components.length,5);assert(view.content.includes('大小仓分布'));}
 const e=fixture(t,'collection',2,18),env=envFor(e);let view=await answerTavern(env,click('auctionCatalog~5~1~collection'));bounds(view);assert(view.content.includes('典藏区'));assert(view._mapScene.bytes.length>1000);
 for(const action of ['auctionCatalog~5~1~evil','auctionReveal~'+e.token+'~19~all'])assert.equal(immediateTavernReply(click(action)).type,4);
 win(e);for(let step=0;step<17;step++)e.auction.reveal({...base,token:e.token,step,all:false},now);
 view=await answerTavern(env,click('auctionInventory~0'));const resume=view.components.flatMap(x=>x.components).find(x=>x.custom_id?.includes('auctionReveal'));assert(resume.custom_id.includes('~17~next'));assert.equal(immediateTavernReply({...click(resume.custom_id.split(':')[3]),member:{user:{id:'4'}}}).type,4);
 view=await answerTavern(env,click(resume.custom_id.split(':')[3]));bounds(view);assert(view.content.includes('18件藏品已存入'));
});
test('actual small medium and large board renderers produce readable distinct geometry and all opened goods',async t=>{
 const images=[];for(const [size,count]of [[0,8],[1,12],[2,18]]){const e=fixture(t,'collection',size,count,true,'gabriella');win(e);const done=e.auction.reveal({...base,token:e.token,step:0,all:true},now),bytes=await renderAuctionImage(done.session);images.push(bytes);assert.equal(new DataView(bytes.buffer).getUint32(16),760);assert(bytes.length>1000);if(process.env.AUCTION_PREVIEW_DIR){await mkdir(process.env.AUCTION_PREVIEW_DIR,{recursive:true});await writeFile(join(process.env.AUCTION_PREVIEW_DIR,`auction14-${AUCTION_WAREHOUSES[size].id}.png`),bytes);}}
 assert.notDeepEqual(images[0],images[1]);assert.notDeepEqual(images[1],images[2]);
});
