import {AUCTION_LARGE_ITEMS,AUCTION_EXPANDED_LARGE_ITEMS,scaleAuctionValue} from './tavern-auction-data.mjs';
import {AUCTION_REGIONS,AUCTION_WAREHOUSES,regionCatalog} from './tavern-auction-regions.mjs';
const FEATURE_TICKETS=Object.freeze({small:150,standard:250,high:400,collection:550}),cache=new Map(),statsCache=new WeakMap();
const groups=pool=>Array.from({length:6},(_,q)=>pool.filter(x=>x.quality===q));
const sumWeight=xs=>xs.reduce((s,x)=>s+x.dropWeight,0);
const weightedMean=(xs,unit,cap=false)=>xs.reduce((s,x)=>s+scaleAuctionValue(cap&&x.quality===5?Math.min(x.value,2000000):x.value,unit)*x.dropWeight,0)/sumWeight(xs);
const makeLargePools=catalog=>Object.freeze(Object.fromEntries(Object.entries(AUCTION_REGIONS).map(([tier,r])=>[tier,Object.freeze(catalog.map(x=>Object.freeze({...x,dropWeight:x.dropWeight*({'稀有':r.rare[0],'极稀有':r.rare[1],'传世':r.rare[2]}[x.rarity]??1)})))])));
const legacyPools=makeLargePools(AUCTION_LARGE_ITEMS),expandedPools=makeLargePools(AUCTION_EXPANDED_LARGE_ITEMS);
const largePools=(tier,version)=> (version>=8?expandedPools:legacyPools)[tier];
export function largeCatalog(tier='standard',version=8){return [...regionCatalog(tier,version),...largePools(tier,version)];}
export function largeModel(tier,warehouse,version=8){
 const reference=AUCTION_WAREHOUSES.find(x=>x.id===warehouse.id);
 if(!reference||reference.cols!==warehouse.cols||reference.rows!==warehouse.rows||!Number.isInteger(warehouse.count)||warehouse.count<reference.min||warehouse.count>reference.max)throw Error('仓库容量配置异常。');
 const key=[version,tier,warehouse.id,warehouse.count].join(':');if(cache.has(key))return cache.get(key);
 const ordinary=regionCatalog(tier,version),bins=Math.floor(warehouse.cols/2)*Math.floor(warehouse.rows/2),eligible=largePools(tier,version).filter(x=>Math.ceil(x.width/2)*Math.ceil(x.height/2)+warehouse.count-1<=bins);
 const og=groups(ordinary),bg=groups(eligible),featured=bg.flatMap((xs,q)=>xs.length?xs:og[q]);
 const model=Object.freeze({count:warehouse.count,weights:AUCTION_REGIONS[tier].quality,ordinary,featured:Object.freeze(featured),chance:eligible.length?FEATURE_TICKETS[tier]/1000:0});
 cache.set(key,model);return model;
}
export function generateLargeAuction(random,unit,tier,warehouse,generator,version=8){
 const m=largeModel(tier,warehouse,version),selected=m.chance&&random(1000)<m.chance*1000?random(m.count):-1;
 return Array.from({length:m.count},(_,i)=>generator(random,unit,i===selected?m.featured:m.ordinary,m.weights,1)[0]);
}
function slotStats(clue,pool,weights,unit){
 const totals=groups(pool).map(sumWeight),total=weights.reduce((s,w)=>s+w,0);let likelihood=0,value=0;
 for(const x of pool){if(clue.quality!==null&&clue.quality!==x.quality||clue.width!==null&&(clue.width!==x.width||clue.height!==x.height))continue;
  const p=weights[x.quality]/total*x.dropWeight/totals[x.quality];likelihood+=p;value+=p*scaleAuctionValue(clue.quality===null&&x.quality===5?Math.min(x.value,2000000):x.value,unit);
 }return {p:likelihood,v:likelihood?value/likelihood:0};
}
function areaDistribution(counts,ordinary,featured,featureQuality,unit){
 let dp=new Map([[0,{p:1,v:0}]]);
 counts.forEach((count,i)=>{const q=i+3;
  for(let k=0;k<count;k++){
   const pool=q===featureQuality&&k===0?featured[q]:ordinary[q],total=sumWeight(pool),bins=new Map();
   for(const x of pool){const area=x.width*x.height,g=bins.get(area)||{p:0,v:0};g.p+=x.dropWeight/total;g.v+=x.dropWeight/total*scaleAuctionValue(x.value,unit);bins.set(area,g);}
   const next=new Map();for(const [area,d]of dp)for(const [a,g]of bins){const n=next.get(area+a)||{p:0,v:0};n.p+=d.p*g.p;n.v+=d.v*g.p+d.p*g.v;next.set(area+a,n);}dp=next;
  }
 });return dp;
}
export function estimateLargeModel(info,unit,m){
 const n=info.items.length;if(n!==m.count)throw Error('仓库件数线索异常。');
 if(info.highCount!==null){
  const high=info.highCount,counts=info.highCounts,low=n-high,ordinary=groups(m.ordinary),featured=groups(m.featured),weights=m.weights;
  if(!Number.isInteger(high)||high<0||high>n||info.items.some(x=>x.quality!==null||x.width!==null||x.height!==null))throw Error('大件聚合线索异常。');
  if(counts!==undefined&&(counts.length!==3||counts.some(x=>!Number.isInteger(x)||x<0)||counts.reduce((s,x)=>s+x,0)!==high))throw Error('大件品质数量异常。');
  const means=(pools,cap)=>pools.map(xs=>weightedMean(xs,unit,cap)),r=means(ordinary,counts===undefined),b=means(featured,counts===undefined),mix=(values,qs)=>qs.reduce((s,q)=>s+values[q]*weights[q],0)/qs.reduce((s,q)=>s+weights[q],0),rl=mix(r,[0,1,2]),bl=mix(b,[0,1,2]);
  const regularHigh=counts?counts.reduce((s,c,i)=>s+c*r[i+3],0):high*mix(r,[3,4,5]),deltaHigh=counts?counts.reduce((s,c,i)=>s+c*(b[i+3]-r[i+3]),0):high*(mix(b,[3,4,5])-mix(r,[3,4,5]));
  if(info.highArea===undefined)return regularHigh+low*rl+m.chance/n*(deltaHigh+low*(bl-rl));
  if(!counts||!Number.isInteger(info.highArea)||info.highArea<high)throw Error('大件总格线索异常。');
  let probability=0,value=0;
  const add=(prior,q,lowValue)=>{if(!prior)return;const d=areaDistribution(counts,ordinary,featured,q,unit).get(info.highArea);if(!d)return;probability+=prior*d.p;value+=prior*(d.v+d.p*lowValue);};
  add(1-m.chance,-1,low*rl);add(m.chance*low/n,-1,low*rl+bl-rl);counts.forEach((c,i)=>add(m.chance*c/n,i+3,low*rl));
  if(!probability)throw Error('大件总格线索不匹配。');return value/probability;
 }
 const cached=(clue,featured)=>{let cache=statsCache.get(m);if(!cache){cache=new Map();statsCache.set(m,cache);}const key=[unit,featured,clue.quality,clue.width,clue.height].join(':');if(!cache.has(key)){const s=slotStats(clue,featured?m.featured:m.ordinary,m.weights,unit);if(s.p&&cache.size<4096)cache.set(key,s);else return s;}return cache.get(key);};
 const ordinary=info.items.map(x=>cached(x,false)),featured=info.items.map(x=>cached(x,true));let probability=0,value=0;
 for(let h=-1;h<n;h++){
  let p=h===-1?1-m.chance:m.chance/n,v=0;if(!p)continue;
  for(let i=0;i<n;i++){const s=i===h?featured[i]:ordinary[i];p*=s.p;v+=s.v;if(!p)break;}
  probability+=p;value+=p*v;
 }if(!probability)throw Error('大件轮廓线索不匹配。');return value/probability;
}
export const estimateLargeAuction=(info,unit,tier,warehouse,version=8)=>estimateLargeModel(info,unit,largeModel(tier,warehouse,version));
export function largeModelOdds(item,m){
 const itemProbability=pool=>{const xs=pool.filter(x=>x.quality===item.quality),x=xs.find(x=>x.id===item.id);return x?m.weights[item.quality]/m.weights.reduce((s,x)=>s+x,0)*x.dropWeight/sumWeight(xs):0;};
 const r=itemProbability(m.ordinary),b=itemProbability(m.featured),expected=m.count*r+m.chance*(b-r),none=-Math.expm1(m.count*Math.log1p(-r)),featured=-Math.expm1((m.count-1)*Math.log1p(-r)+Math.log1p(-b));
 return {expected,warehouse:(1-m.chance)*none+m.chance*featured};
}
export function largeItemChance(item,tier='standard',version=8){
 item=largeCatalog(tier,version).find(x=>x.id===item.id);if(!item)throw Error('藏品不在区域图鉴中。');
 let count=0,expected=0,warehouse=0;
 AUCTION_WAREHOUSES.forEach((w,i)=>{for(let n=w.min;n<=w.max;n++){
  const prior=AUCTION_REGIONS[tier].size[i]/10000/(w.max-w.min+1),odds=largeModelOdds(item,largeModel(tier,{...w,count:n},version));count+=prior*n;expected+=prior*odds.expected;warehouse+=prior*odds.warehouse;
 }});const slot=expected/count,quality=AUCTION_REGIONS[tier].quality[item.quality]/1000;return {slot,within:slot/quality,warehouse};
}
