import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {TavernService} from './tavern-service.mjs';
import {TavernAuction,generateAuction,estimateAuction,npcAuctionBid} from './tavern-auction.mjs';
import {AUCTION_ITEMS,AUCTION_LARGE_ITEMS,AUCTION_ALL_ITEMS,auctionCatalogPage} from './tavern-auction-data.mjs';
import {AUCTION_WAREHOUSES,AUCTION_REGIONS,regionCatalog} from './tavern-auction-regions.mjs';
import {largeCatalog,largeModel,generateLargeAuction,estimateLargeModel,estimateLargeAuction,largeModelOdds,largeItemChance} from './tavern-auction-large.mjs';
import {layoutAuction} from './tavern-auction-board.mjs';
import {auctionCatalog,auctionData} from './tavern-auction-ui.mjs';
import {renderAuctionImage,renderAuctionCatalogImage,renderAuctionInventoryImage} from './tavern-auction-image.mjs';
import {drawAuctionItem} from './tavern-auction-art.mjs';
import manifest from './auction-art-manifest.mjs';
const R=100000,base={guild:'3',id:'1',channel:'2',name:'Alice'},empty=n=>({highCount:null,items:Array.from({length:n},()=>({quality:null,width:null,height:null}))});
function geometry(items,w,token){const ps=layoutAuction(items,token,w),used=new Set();assert.deepEqual(ps,layoutAuction(items,token,w));ps.forEach((p,i)=>{assert.equal(p.width,items[i].width);assert.equal(p.height,items[i].height);assert(p.x>=0&&p.y>=0&&p.x+p.width<=w.cols&&p.y+p.height<=w.rows);for(let y=p.y;y<p.y+p.height;y++)for(let x=p.x;x<p.x+p.width;x++){const k=x+','+y;assert(!used.has(k));used.add(k);}});return ps;}
function forced(item,w,tier='collection',unit=R){
 const m=largeModel(tier,w),xs=m.featured.filter(x=>x.quality===item.quality),at=xs.findIndex(x=>x.id===item.id);assert(at>=0);const qt=m.weights.slice(0,item.quality).reduce((s,x)=>s+x,0),pick=xs.slice(0,at).reduce((s,x)=>s+x.dropWeight,0);let calls=0;
 return generateLargeAuction(n=>{const i=calls++;return i<2?0:i===2?qt:i===3?pick:0;},unit,tier,w,generateAuction);
}
function fixture(t){const db=new DatabaseSync(':memory:');t.after(()=>db.close());const map=new Map(),storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length)return {toArray:()=>s.all(...a)};s.run(...a);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};const tavern=new TavernService(storage),a=new TavernAuction(tavern,()=>0);tavern._auction=a;const fx=tavern.auctionCurrency;fx.view(base,1000);tavern.sql.exec('UPDATE tavern_members SET balance=20000 WHERE id=?','1');fx.convert({...base,token:fx.view(base,1000).token,direction:'buy',amount:20000},1000);const token=a.view(base,1000).offerToken;a.start({...base,token,role:'gabriella',tier:'collection',presentation:'warehouse'},1000);return {tavern,a,fx,token,storage};}
const raw=e=>JSON.parse(e.tavern.one('SELECT state FROM tavern_auctions WHERE token=?',e.token).state),save=(e,s)=>e.tavern.sql.exec('UPDATE tavern_auctions SET state=? WHERE token=?',JSON.stringify(s),e.token);

test('twelve individually illustrated large collectibles extend the pool without rewriting the original 192',async()=>{
 assert.equal(AUCTION_ALL_ITEMS.length,204);assert.equal(new Set(AUCTION_ALL_ITEMS.map(x=>x.id)).size,204);assert.equal(new Set(AUCTION_ALL_ITEMS.map(x=>x.name)).size,204);assert.deepEqual([6,9,12].map(a=>AUCTION_LARGE_ITEMS.filter(x=>x.width*x.height===a).length),[4,4,4]);
 const hashes=new Set();for(const x of AUCTION_LARGE_ITEMS){assert(x.flavor.length>5);assert(x.value%100!==0);assert(Number.isSafeInteger(x.value));assert(x.dropWeight>0);const r=manifest.items[x.id],bytes=await readFile('public'+r.path);assert.equal(bytes.length,r.bytes);const h=createHash('sha256').update(bytes).digest('hex');assert.equal(h,r.sha256);hashes.add(h);assert.equal(r.size,256);assert.equal(r.bounds.length,4);}assert.equal(hashes.size,12);
 // The preserved expanded atlas and all original PNG records remain byte-identical.
 // PNG encoders can differ across Pillow releases. Compare the actual prior builder
 // and this builder byte-for-byte within the same environment, as on production CI.
 const check=JSON.parse(execFileSync('python',['-c',`
import hashlib,json,runpy,tempfile
from pathlib import Path
root=Path.cwd()
with tempfile.TemporaryDirectory() as folder:
    target=Path(folder)
    (target/'assets').symlink_to(root/'assets',target_is_directory=True)
    old=runpy.run_path(str(root/'test-fixtures/build-auction-art-v3.py'))
    old['build'].__globals__['ROOT']=target
    old['build']()
    files=list((target/'public/art/auction').iterdir())
    for path in files:
        assert path.read_bytes()==(root/'public/art/auction'/path.name).read_bytes(),path.name
    print(json.dumps({'compared':len(files),'atlasHash':hashlib.sha256((target/'public/art/auction/sprites-v3.bin').read_bytes()).hexdigest()}))
`],{encoding:'utf8'}));assert(check.compared>=290);
 const old=await readFile('public'+manifest.previousExpandedAtlas.path);assert.equal(createHash('sha256').update(old).digest('hex'),check.atlasHash);assert(['43123bfe21d34a7f456f36011147a842c1b8d668d4124cbb9b726f14ecc57ff6','09dfb72dd050f0a998337c98bcacd861aa086a46e684263e31e7d77a2cb372a0'].includes(check.atlasHash));
});
test('capacity eligibility is decided before goods and all twelve items are reachable without rerolling quality',()=>{
 const w={...AUCTION_WAREHOUSES[2],count:13};for(const x of AUCTION_LARGE_ITEMS){const items=forced(x,w);assert.equal(items[0].id,x.id);assert.equal(items.filter(x=>x.width*x.height>4).length,1);assert.equal(items.length,13);}
 for(const w of AUCTION_WAREHOUSES)for(let count=w.min;count<=w.max;count++){const m=largeModel('collection',{...w,count}),areas=new Set(m.featured.filter(x=>x.width*x.height>4).map(x=>x.width*x.height));const bins=Math.floor(w.cols/2)*Math.floor(w.rows/2);for(const x of AUCTION_LARGE_ITEMS)assert.equal(areas.has(x.width*x.height),Math.ceil(x.width/2)*Math.ceil(x.height/2)+count-1<=bins);if(!areas.size)assert.equal(m.chance,0);}
 assert.throws(()=>largeModel('small',{...w,count:19}));assert.throws(()=>largeCatalog('__proto__'));
 for(const tier of Object.keys(AUCTION_REGIONS)){const counts=[0,0,0,0,0,0];for(let ticket=0;ticket<1000;ticket++){let i=0;const goods=generateLargeAuction(n=>{const k=i++;return k<2?0:k%2===0?ticket:0;},R,tier,w,generateAuction);goods.forEach(x=>counts[x.quality]++);}assert.deepEqual(counts,AUCTION_REGIONS[tier].quality.map(x=>x*w.count));}
});
test('every eligible large footprint fits with worst-case 2x2 companions on every warehouse/count and token',()=>{
 for(const w of AUCTION_WAREHOUSES)for(let count=w.min;count<=w.max;count++){const s={...w,count},m=largeModel('collection',s);for(const x of m.featured.filter(x=>x.width*x.height>4))for(let seed=0;seed<30;seed++){const items=Array.from({length:count},()=>({width:2,height:2}));items[seed%count]=x;geometry(items,s,String(seed).padStart(16,'0'));}}
 assert.throws(()=>layoutAuction([{width:3,height:3},...Array.from({length:7},()=>({width:2,height:2}))],'test',{cols:8,rows:4}));assert.throws(()=>layoutAuction([{width:3,height:3},{width:3,height:2}],'test',{cols:10,rows:8}));
});
function exhaustive(m){const out=[];const qtotal=m.weights.reduce((s,x)=>s+x,0),prob=(x,pool)=>m.weights[x.quality]/qtotal*x.dropWeight/pool.filter(y=>y.quality===x.quality).reduce((s,y)=>s+y.dropWeight,0);for(let h=-1;h<m.count;h++){const walk=(xs,p)=>{if(xs.length===m.count){out.push({xs,p});return;}const pool=xs.length===h?m.featured:m.ordinary;for(const x of pool)if(m.weights[x.quality])walk([...xs,x],p*prob(x,pool));};walk([],h===-1?1-m.chance:m.chance/m.count);}return out;}
const toy=()=>{const ordinary=Array.from({length:6},(_,q)=>[1,4].map((area,j)=>({id:`r${q}-${j}`,quality:q,width:area===4?2:1,height:area===4?2:1,value:100+q*91+j*37,dropWeight:j+1}))).flat(),featured=ordinary.map(x=>({...x,id:'b'+x.id,width:x.quality===3?3:x.width,height:x.quality===3?2:x.height,value:x.value+111,dropWeight:x.dropWeight+1}));return {count:3,chance:.4,weights:[2,0,0,3,5,0],ordinary,featured};};
const matches=(info,xs)=>info.highCount!==null?xs.filter(x=>x.quality>=3).length===info.highCount&&(!info.highCounts||info.highCounts.every((n,j)=>xs.filter(x=>x.quality===j+3).length===n))&&(info.highArea===undefined||xs.filter(x=>x.quality>=3).reduce((s,x)=>s+x.width*x.height,0)===info.highArea):xs.every((x,i)=>{const c=info.items[i];return(c.quality===null||c.quality===x.quality)&&(c.width===null||c.width===x.width&&c.height===x.height);});
test('mutually exclusive centerpiece valuation and aggregate high-area posterior match ordered exhaustive outcomes',()=>{
 const m=toy(),out=exhaustive(m),cases=[empty(3),{...empty(3),highCount:2},{...empty(3),highCount:2,highCounts:[1,1,0]}];for(const area of [2,5,8,7,10])cases.push({...empty(3),highCount:2,highCounts:[1,1,0],highArea:area});
 const known=empty(3);known.items[0]={quality:3,width:3,height:2};known.items[1]={quality:null,width:2,height:2};cases.push(known);
 for(const info of cases){const valid=out.filter(x=>matches(info,x.xs)),p=valid.reduce((s,x)=>s+x.p,0),v=valid.reduce((s,x)=>s+x.p*x.xs.reduce((s,x)=>s+x.value,0),0);if(!p){assert.throws(()=>estimateLargeModel(info,R,m));continue;}assert(Math.abs(estimateLargeModel(info,R,m)-v/p)<1e-9);Object.defineProperty(info,'hiddenItems',{get(){throw Error('hidden read');}});assert(Math.abs(estimateLargeModel(info,R,m)-v/p)<1e-9);}
 const impossible=empty(3);impossible.items[0]={quality:3,width:3,height:2};impossible.items[1]={quality:3,width:3,height:2};assert.throws(()=>estimateLargeModel(impossible,R,m));
});
test('per-warehouse odds match exhaustive exclusive events and all 204 slot probabilities normalize by quality',()=>{
 const m=toy(),out=exhaustive(m);assert(Math.abs(out.reduce((s,x)=>s+x.p,0)-1)<1e-12);for(const item of [...m.ordinary,...m.featured]){const odds=largeModelOdds(item,m),expect=out.reduce((s,x)=>s+x.p*x.xs.filter(x=>x.id===item.id).length,0),warehouse=out.reduce((s,x)=>s+x.p*Number(x.xs.some(x=>x.id===item.id)),0);assert(Math.abs(odds.expected-expect)<1e-12);assert(Math.abs(odds.warehouse-warehouse)<1e-12);}
 for(const tier of Object.keys(AUCTION_REGIONS))for(let q=0;q<6;q++){const xs=largeCatalog(tier).filter(x=>x.quality===q),p=xs.reduce((s,x)=>s+largeItemChance(x,tier).slot,0);assert(Math.abs(p-AUCTION_REGIONS[tier].quality[q]/1000)<1e-12);for(const x of xs.filter(x=>x.width*x.height>4)){const a=largeItemChance(x,tier);assert(a.warehouse>a.slot);assert(a.warehouse>0);}}
});
test('V6 frozen sessions retain future regional bids, goods, board, escrow and prices after V7',t=>{
 const e=fixture(t),s=raw(e);s.catalogVersion=6;s.dropVersion=3;s.warehouse={...AUCTION_WAREHOUSES[2],count:18};s.items=generateAuction(n=>n-1,s.unit,regionCatalog(s.tier),AUCTION_REGIONS[s.tier].quality,18);s.board=layoutAuction(s.items,e.token,s.warehouse);s.infos=Array.from({length:4},()=>empty(18));s.round=1;s.committed=[s.budget,s.budget,s.budget];save(e,s);
 const cold=new TavernAuction(new TavernService(e.storage),n=>n-1),view=cold.view(base,1001);assert.equal(view.session.catalogSize,192);assert.equal(view.session.estimate,Math.floor(estimateAuction(s.infos[0],s.unit,regionCatalog(s.tier),AUCTION_REGIONS[s.tier].quality)));
 cold.bid({...base,token:e.token,round:1,bid:s.budget},1002);const next=raw(e);assert.deepEqual(next.items,s.items);assert.deepEqual(next.board,s.board);assert.equal(next.budget,s.budget);assert.deepEqual(next.committed,next.infos.slice(1).map((info,i)=>npcAuctionBid(info,2,i,n=>n-1,s.unit,regionCatalog(s.tier),AUCTION_REGIONS[s.tier].quality,s.budget)));
});
test('6/9/12 grid items survive actual settlement, partial reveal, restart, cabinet and idempotent sale',async t=>{
 for(const area of [6,9,12]){const e=fixture(t),s=raw(e),w={...AUCTION_WAREHOUSES[2],count:13},item=AUCTION_LARGE_ITEMS.find(x=>x.width*x.height===area&&(area===6||x.quality===5));s.warehouse=w;s.items=forced(item,w,s.tier,s.unit);s.board=layoutAuction(s.items,e.token,w);s.revealOrder=s.items.map((_,i)=>i);s.opened=0;s.infos=Array.from({length:4},()=>empty(13));s.committed=[0,0,0];save(e,s);const initial=e.a.view(base,1001);assert.equal(initial.session.catalogSize,204);assert.equal(initial.session.items,null);assert.equal(initial.session.result,null);assert.equal(initial.session.estimate,Math.floor(estimateLargeAuction(s.infos[0],s.unit,s.tier,w)));
  e.a.bid({...base,token:e.token,round:1,bid:1},1002);assert.equal(e.a.inventory.view(base,1003).locked,13);const one=e.a.reveal({...base,token:e.token,step:0,all:false},1003);assert.equal(one.session.result.total,undefined);
  const cold=new TavernAuction(new TavernService(e.storage),()=>{throw Error('reroll');}),done=cold.reveal({...base,token:e.token,step:1,all:true},1004);assert.equal(done.session.items.length,13);assert.equal(done.session.result.total,s.items.reduce((v,x)=>v+x.value,0));const inv=cold.inventory,owned=inv.view(base,1004),unit=owned.items.find(x=>x.item.id===item.id);assert(unit);const pick=inv.select({...base,token:owned.token,selected:[unit.id]},1004);inv.place({...base,token:pick.token,slot:0},1005);const cabinet=inv.view(base,1005);assert.equal(cabinet.cabinet[0].item.id,item.id);const display=await renderAuctionInventoryImage(cabinet,undefined,true);assert(display.length>1000);
  inv.remove({...base,token:cabinet.token,slot:0},1006);const v=inv.view(base,1006),selected=inv.select({...base,token:v.token,selected:[unit.id]},1006),quote=inv.quote({...base,token:selected.token},1006),cash=e.fx.balance(base.id);inv.sell({...base,token:quote.token},1007);assert.equal(e.fx.balance(base.id),cash+unit.item.value);assert(inv.sell({...base,token:quote.token},1008).repeated);assert(cold.reveal({...base,token:e.token,step:1,all:true},1008).repeated);
  const view=auctionData(done,'3','1');assert(view.content.length<=2000);const png=await renderAuctionImage(done.session);if(process.env.AUCTION_PREVIEW_DIR){await mkdir(process.env.AUCTION_PREVIEW_DIR,{recursive:true});await writeFile(`${process.env.AUCTION_PREVIEW_DIR}/auction15-${area}-grid.png`,png);await writeFile(`${process.env.AUCTION_PREVIEW_DIR}/auction15-${area}-cabinet.png`,display);}
 }
});
test('new catalogue pages cover 204 goods in every region and stay inside Discord limits with matching images',async()=>{
 for(const tier of Object.keys(AUCTION_REGIONS)){const seen=new Set();for(let q=0;q<6;q++){const {pages}=auctionCatalogPage(q,0,largeCatalog(tier));for(let page=0;page<pages;page++){const view=auctionCatalog('3','1',q,page,tier);assert(view.content.length<=2000,view.content.length);assert(view.components.length<=5);const {items}=auctionCatalogPage(q,page,largeCatalog(tier));for(const x of items){assert(view.content.includes(`**${x.name}**`));seen.add(x.id);}for(const row of view.components)for(const c of row.components)assert(c.custom_id.length<=100);}}assert.equal(seen.size,204);}
 const bytes=await renderAuctionCatalogImage(undefined,5,4,'collection');assert(bytes.length>1000);if(process.env.AUCTION_PREVIEW_DIR){await mkdir(process.env.AUCTION_PREVIEW_DIR,{recursive:true});await writeFile(`${process.env.AUCTION_PREVIEW_DIR}/auction15-red-large-catalog.png`,bytes);}
});
test('large artwork fits its full alpha bounds inside rectangular cells without stretching',()=>{
 const r=manifest.items[AUCTION_LARGE_ITEMS[0].id],data=new Uint8Array(manifest.bytes);for(let y=r.bounds[1];y<r.bounds[3];y++)for(let x=r.bounds[0];x<r.bounds[2];x++){const i=((r.y+y)*manifest.width+r.x+x)*4;data.set([100,120,130,255],i);}const points=[];assert(drawAuctionItem({pixel:(x,y)=>points.push([x,y])},AUCTION_LARGE_ITEMS[0].id,10,20,60,120,data));const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),w=Math.max(...xs)-Math.min(...xs)+1,h=Math.max(...ys)-Math.min(...ys)+1;assert(w<=60&&h<=120);assert(Math.abs(w/h-(r.bounds[2]-r.bounds[0])/(r.bounds[3]-r.bounds[1]))<.03);assert(Math.min(...xs)>=10&&Math.min(...ys)>=20);
});
