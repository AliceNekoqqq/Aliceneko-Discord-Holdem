// Pure, fixed-seed replay; no wallets, accounts, network calls or live messages.
import {writeFileSync} from 'node:fs';
import {largeCatalog,largeModel,largeModelOdds,largeItemChance,generateLargeAuction,estimateLargeAuction} from '../tavern-auction-large.mjs';
import {scaleAuctionValue} from '../tavern-auction-data.mjs';
import {AUCTION_REGIONS,AUCTION_WAREHOUSES,regionCatalog,regionItemChance,drawAuctionWarehouse} from '../tavern-auction-regions.mjs';
import {generateAuction,revealAuction,shuffleAuction,estimateAuction,npcAuctionBid,decideAuction,AUCTION_TIERS,NPC_BID_AGGRESSION} from '../tavern-auction.mjs';
const R=100000,N=Number(process.argv[2]||1000),output=process.argv[3];
if(!Number.isSafeInteger(N)||N<100||N>1000000)throw Error('samples must be 100..1000000');
function seeded(seed){let state=seed>>>0;return n=>{let v;const limit=Math.floor(4294967296/n)*n;do{state=(state+0x9e3779b9)>>>0;v=state;v=Math.imul(v^(v>>>16),0x21f0aaad);v=Math.imul(v^(v>>>15),0x735a2d97);v=(v^(v>>>15))>>>0;}while(v>=limit);return v%n;};}
const results=[],started=Date.now();
for(const [regionIndex,model]of Object.keys(AUCTION_REGIONS).entries()){
 const pool=largeCatalog(model),weights=AUCTION_REGIONS[model].quality,unit=R*AUCTION_TIERS[model].scale,skillVersion=2,budget=AUCTION_TIERS[model].budget,fee=AUCTION_TIERS[model].fee,aggregateCache=new Map();
 let currentWarehouse;
 const estimate=info=>{
  if(info.highCount!==null){const key=JSON.stringify([currentWarehouse.id,currentWarehouse.count,info.highCount,info.highCounts,info.highArea]);if(!aggregateCache.has(key))aggregateCache.set(key,estimateLargeAuction(info,unit,model,currentWarehouse));return aggregateCache.get(key);}
  return estimateLargeAuction(info,unit,model,currentWarehouse);
 };
 const policies=[['reference80',(r,v)=>Math.min(budget,Math.floor(v*.8))],['reference95',(r,v)=>Math.min(budget,Math.floor(v*.95))],['maximum',()=>budget],['wait3reference95',(r,v)=>r<3?0:Math.min(budget,Math.floor(v*.95))]];
 for(let ri=0;ri<3;ri++){
  const role=['sophie','gabriella','viktor'][ri],bins=policies.map(()=>[]);let totalValue=0,redBoards=0,totalCount=0;const sizes={small:0,medium:0,large:0};
  for(let j=0;j<N;j++){
   const random=seeded((0x7142026+Math.imul(j+1,0x85ebca6b)+Math.imul(ri,0x27d4eb2d)+Math.imul(regionIndex,0x165667b1))>>>0),warehouse=drawAuctionWarehouse(model,random),items=generateLargeAuction(random,unit,model,warehouse,generateAuction),total=items.reduce((s,x)=>s+x.value,0),priority=shuffleAuction([0,1,2,3],random),infos=Array.from({length:4},()=>({highCount:null,items:Array.from({length:items.length},()=>({quality:null,width:null,height:null}))})),stages=[];
   currentWarehouse=warehouse;totalValue+=total;totalCount+=items.length;sizes[warehouse.id]++;redBoards+=items.some(x=>x.quality===5);
   for(let round=1;round<=5;round++){
    [role,'sophie','gabriella','viktor'].forEach((r,i)=>revealAuction(items,infos[i],r,round,random,skillVersion));
    const quotes=infos.slice(1).map((info,i)=>{
     const tape=[],record=n=>{const v=random(n);tape.push([n,v]);return v;};let quote;
     if(record(12)===0)quote=0;else{const factor=[.78,.94,1.08][i]*(.64+round*.06)*(.90+record(21)/100)*NPC_BID_AGGRESSION;quote=Math.min(budget,Math.max(1,Math.floor(estimate(info)*factor)));}
     if(j<100){let at=0;const actual=npcAuctionBid(info,round,i,n=>{const pair=tape[at++];if(!pair||pair[0]!==n)throw Error('random tape mismatch');return pair[1];},unit,pool,weights,budget,info=>estimateLargeAuction(info,unit,model,warehouse));if(actual!==quote)throw Error('cached NPC differs from production');}
     return quote;
    });
    if(j<100&&Math.abs(estimate(infos[0])-estimateLargeAuction(infos[0],unit,model,warehouse))>.001)throw Error('cached valuation differs from production');
    stages.push({round,quotes,value:estimate(infos[0])});
   }
   policies.forEach(([,choose],pi)=>{for(const s of stages){const bid=choose(s.round,s.value),bids=[bid,...s.quotes],outcome=decideAuction(s.round,bids,priority,budget);if(outcome.done){bins[pi].push({net:((outcome.winner===0?total-outcome.price:0)-fee)/R,won:outcome.winner===0,capTie:bids.filter(v=>v===budget).length>=2});break;}}});
  }
  policies.forEach(([policy],pi)=>{const xs=bins[pi],nets=xs.map(x=>x.net).sort((a,b)=>a-b),mean=nets.reduce((s,x)=>s+x,0)/N,sd=Math.sqrt(nets.reduce((s,x)=>s+(x-mean)**2,0)/(N-1));results.push({model,role,policy,samples:N,meanNetT:mean,ci95:[mean-1.96*sd/Math.sqrt(N),mean+1.96*sd/Math.sqrt(N)],medianNetT:nets[Math.floor(N*.5)],p01NetT:nets[Math.floor(N*.01)],p95NetT:nets[Math.floor(N*.95)],p99NetT:nets[Math.floor(N*.99)],profitRate:xs.filter(x=>x.net>0).length/N,winRate:xs.filter(x=>x.won).length/N,capTieRate:xs.filter(x=>x.capTie).length/N,warehouseMeanT:totalValue/N/R,redWarehouseRate:redBoards/N,itemCountMean:totalCount/N,warehouseSizeCounts:sizes});});
 }
}
const regionSummary=Object.entries(AUCTION_REGIONS).map(([tier,profile])=>{
 const pool=largeCatalog(tier),unit=R*AUCTION_TIERS[tier].scale,meanCount=AUCTION_WAREHOUSES.reduce((s,w,i)=>s+profile.size[i]/10000*(w.min+w.max)/2,0),mixture=p=>AUCTION_WAREHOUSES.reduce((s,w,i)=>s+profile.size[i]/10000*Array.from({length:w.max-w.min+1},(_,j)=>-Math.expm1((w.min+j)*Math.log1p(-p))).reduce((a,b)=>a+b,0)/(w.max-w.min+1),0);
 const previousPool=largeCatalog(tier,7),previousExactWarehouseMeanCoins=meanCount*previousPool.reduce((s,x)=>s+scaleAuctionValue(x.value,unit)*largeItemChance(x,tier,7).slot,0);
 return {tier,previousExactWarehouseMeanCoins,qualityPercent:profile.quality.map(x=>x/10),size:profile.size,rarityMultipliers:profile.rare,meanCount,exactWarehouseMeanCoins:meanCount*pool.reduce((s,x)=>s+scaleAuctionValue(x.value,unit)*largeItemChance(x,tier).slot,0),anyRedWarehouseChance:mixture(profile.quality[5]/1000),anyLargeWarehouseChance:pool.filter(x=>x.width*x.height>4).reduce((s,x)=>s+largeItemChance(x,tier).warehouse,0),rareOdds:['tavern-5-12','tavern-5-34','tavern-5-3'].map(id=>({id,...largeItemChance(pool.find(x=>x.id===id),tier)}))};
});
const nonMaximumCapTie=Math.max(...results.filter(x=>x.policy!=='maximum').map(x=>x.capTieRate));
const report={version:'casino.17-v8-expansion',catalogVersion:8,catalogSize:244,npcAggression:NPC_BID_AGGRESSION,samplesPerRegionRole:N,warehouseSamples:N*12,distinctSeedGroups:N*12,strategyRollouts:N*48,seedScheme:'SplitMix32 with rejection; fixed seed plus disjoint region/role/index salts',sampleUnit:'one warehouse seed per region/role/index; policy results reuse the same warehouse and are correlated',hiddenInformationUsed:false,skillStages:'all regions: high count round 1, quality counts round 2, high area round 4',productionParity:'first 100 samples per role and region checked against full production estimator and NPC random tapes; all aggregate-count clues cached by warehouse and whole actor information; mutually exclusive feature hypotheses used for every slot estimate',nonMaximumCapTie,capTieGate:.15,economicsChanged:true,regionSummary,seconds:(Date.now()-started)/1000,results};
if(output){const {results,regionSummary,...metadata}=report;writeFileSync(output,JSON.stringify(metadata,null,2).slice(0,-2)+',\n  "regionSummary": [\n'+regionSummary.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ],\n  "results": [\n'+results.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]\n}\n');}
console.log(JSON.stringify({warehouses:report.warehouseSamples,strategies:report.strategyRollouts,capTie:nonMaximumCapTie,seconds:report.seconds}));
if(nonMaximumCapTie>.15)throw Error('non-maximum policy cap ties exceed the predeclared 15% gate');
