import test from 'node:test';
import assert from 'node:assert/strict';
import {AUCTION_THEMES,themedPool,chooseAuctionTheme,initializePublicAuction,publicAuctionInfo,auctionInfoWithPublic} from './tavern-auction-themes.mjs';
import {estimateAuctionEvidence} from './tavern-auction-evidence.mjs';
import {largeModel,largeCatalog,largeModelOdds,largeItemChance,generateLargeAuction,estimateLargeAuction} from './tavern-auction-large.mjs';
import {AUCTION_WAREHOUSES,AUCTION_REGIONS} from './tavern-auction-regions.mjs';
import {generateAuction} from './tavern-auction.mjs';
const empty=n=>({highCount:null,items:Array.from({length:n},()=>({quality:null,width:null,height:null}))});
const random=seed=>n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};

test('themes preserve prices, IDs and quality probabilities while actually changing category weights',()=>{
 const original=largeCatalog('standard',8),snapshot=JSON.stringify(original);
 for(const theme of AUCTION_THEMES){
  const pool=themedPool(original,theme.id);assert.strictEqual(themedPool(original,theme.id),pool);
  for(let i=0;i<pool.length;i++){assert.equal(pool[i].id,original[i].id);assert.equal(pool[i].value,original[i].value);assert.equal(pool[i].dropWeight,original[i].dropWeight*(theme.categories.includes(original[i].category)?3:1));}
  for(const tier of Object.keys(AUCTION_REGIONS)){
   const m=largeModel(tier,{...AUCTION_WAREHOUSES[2],count:13,themeId:theme.id},9);
   for(let q=0;q<6;q++)assert(Math.abs(largeCatalog(tier,9,theme.id).filter(x=>x.quality===q).reduce((s,x)=>s+largeModelOdds(x,m).expected/m.count,0)-m.weights[q]/1000)<1e-10);
  }
 }
 assert.equal(JSON.stringify(original),snapshot);assert.throws(()=>chooseAuctionTheme('bad',random(1)),/主题/);
 assert.equal(chooseAuctionTheme('arts',()=>{throw Error('reroll');}),'arts');
});
test('random-theme catalogue odds are the exact mean of four selectable themes',()=>{
 const x=largeCatalog('standard').find(x=>x.quality===5);
 for(const tier of Object.keys(AUCTION_REGIONS)){
  const all=largeItemChance(x,tier,9),each=AUCTION_THEMES.map(t=>largeItemChance(x,tier,9,t.id));
  for(const key of ['slot','within','warehouse'])assert.equal(all[key],each.reduce((s,p)=>s+p[key],0)/4);
 }
});
test('public clues progress once per round and their projection contains no identities, values or future clues',()=>{
 const state={catalogVersion:9,round:1,items:[{id:'hidden-a',name:'secret',quality:5,width:3,height:2,value:123456,category:'收藏'},{id:'hidden-b',quality:1,width:1,height:2,value:777,category:'日用'}],board:[{x:0,y:0},{x:4,y:2}]};
 initializePublicAuction(state);const privateInfo=empty(2),before=JSON.stringify(privateInfo);
 for(let r=1;r<=5;r++){
  state.round=r;const p=publicAuctionInfo(state);assert.equal(p.clues.length,r);assert.deepEqual(publicAuctionInfo(structuredClone(state)),p);
  const text=JSON.stringify(p);for(const key of ['hidden-a','secret','123456','publicOrder'])assert(!text.includes(key));
  assert.equal(p.items[0].quality,r>=2?5:null);assert.equal(p.items[0].width,r>=3?3:null);
  assert.equal(p.items[1].category,r>=4?'日用':null);assert.equal(p.items[1].quality,r>=5?1:null);
  const merged=auctionInfoWithPublic(privateInfo,p);assert.equal(merged.maxQuality,5);assert.equal(merged.items[1].category,p.items[1].category);
 }
 assert.equal(JSON.stringify(privateInfo),before);state.catalogVersion=8;assert.equal(publicAuctionInfo(state),null);delete state.catalogVersion;assert.equal(publicAuctionInfo(state),null);
});

function tiny(){
 const ordinary=[],featured=[];for(let q=0;q<6;q++)for(let k=0;k<2;k++){
  ordinary.push({quality:q,width:1+k,height:1,category:k?'B':'A',dropWeight:k?3:1,value:1000*(q+1)+k*333});
  featured.push({quality:q,width:k?2:3,height:2,category:k?'B':'A',dropWeight:k?1:2,value:5000*(q+1)+k*777});
 }
 return {count:3,weights:[40,25,18,10,5,2],ordinary,featured,chance:.4};
}
function outcomes(m){
 const all=[],pick=pool=>pool.map(x=>({x,p:m.weights[x.quality]/100*x.dropWeight/pool.filter(y=>y.quality===x.quality).reduce((s,y)=>s+y.dropWeight,0)}));
 for(let h=-1;h<3;h++){
  const prior=h===-1?1-m.chance:m.chance/3,pools=Array.from({length:3},(_,i)=>pick(h===i?m.featured:m.ordinary));
  for(const a of pools[0])for(const b of pools[1])for(const c of pools[2])all.push({xs:[a.x,b.x,c.x],p:prior*a.p*b.p*c.p});
 }return all;
}
function matches(info,xs){
 if(info.maxQuality!=null && Math.max(...xs.map(x=>x.quality))!==info.maxQuality)return false;
 if(info.items.some((c,i)=>c.quality!=null&&c.quality!==xs[i].quality || c.width!=null&&(c.width!==xs[i].width||c.height!==xs[i].height)||c.category!=null&&c.category!==xs[i].category))return false;
 const high=xs.filter(x=>x.quality>=3);
 if(info.highCount!==null && high.length!==info.highCount)return false;
 if(info.highCounts && info.highCounts.some((c,i)=>c!==xs.filter(x=>x.quality===i+3).length))return false;
 return info.highArea===undefined||high.reduce((s,x)=>s+x.width*x.height,0)===info.highArea;
}
test('public max quality, item clues and aggregate skill appraisal match ordered exhaustive outcomes',()=>{
 const m=tiny(),all=outcomes(m),cases=[empty(3)];
 for(const top of [0,2,5])cases.push({...empty(3),maxQuality:top});
 for(const idx of [38,1080,1720,3240,5010,6800]){
  const xs=all[idx].xs,high=xs.filter(x=>x.quality>=3),pub=empty(3);
  pub.maxQuality=Math.max(...xs.map(x=>x.quality));pub.items[0]={quality:xs[0].quality,width:xs[0].width,height:xs[0].height};pub.items[2].category=xs[2].category;
  cases.push(pub,{...pub,highCount:high.length},{...pub,highCount:high.length,highCounts:[3,4,5].map(q=>high.filter(x=>x.quality===q).length)},{...pub,highCount:high.length,highCounts:[3,4,5].map(q=>high.filter(x=>x.quality===q).length),highArea:high.reduce((s,x)=>s+x.width*x.height,0)});
 }
 for(const info of cases){
  const valid=all.filter(x=>matches(info,x.xs)),p=valid.reduce((s,x)=>s+x.p,0),v=valid.reduce((s,x)=>s+x.p*x.xs.reduce((s,x)=>s+x.value,0),0),expected=v/p;
  const actual=estimateAuctionEvidence(info,100000,m);assert(Math.abs(actual-expected)<1e-6,JSON.stringify({info,actual,expected}));
 }
});
test('all themes and roles yield finite appraisal as public information advances',()=>{
 for(const theme of AUCTION_THEMES)for(const tier of Object.keys(AUCTION_REGIONS)){
  const warehouse={...AUCTION_WAREHOUSES[2],count:18,themeId:theme.id},items=generateLargeAuction(random(27),100000,tier,warehouse,generateAuction,9),
   state={catalogVersion:9,round:1,items,board:items.map((_,i)=>({x:i%5,y:Math.floor(i/5)}))};initializePublicAuction(state);
  for(let r=1;r<=5;r++){
   state.round=r;const plain=empty(18),high=items.filter(x=>x.quality>=3),aggregate={...empty(18),highCount:high.length};
   if(r>=2)aggregate.highCounts=[3,4,5].map(q=>high.filter(x=>x.quality===q).length);
   if(r>=4)aggregate.highArea=high.reduce((s,x)=>s+x.width*x.height,0);
   for(const raw of [plain,aggregate]){const info=auctionInfoWithPublic(raw,publicAuctionInfo(state));const value=estimateLargeAuction(info,100000,tier,warehouse,9);assert(Number.isFinite(value)&&value>=0);}
  }
 }
});
