// Pure, fixed-seed replay; no wallets, accounts, network calls or live messages.
import {writeFileSync} from 'node:fs';
import {AUCTION_ITEMS,AUCTION_ITEMS_V4,auctionItemChance} from '../tavern-auction-data.mjs';
import {generateAuction,revealAuction,shuffleAuction,estimateAuction,npcAuctionBid,decideAuction,AUCTION_QUALITY_WEIGHTS as weights} from '../tavern-auction.mjs';
const R=100000,N=Number(process.argv[2]||10000),output=process.argv[3];
if(!Number.isSafeInteger(N)||N<100||N>1000000)throw Error('samples must be 100..1000000');
function seeded(seed){let state=seed>>>0;return n=>{let v;const limit=Math.floor(4294967296/n)*n;do{state=(state+0x9e3779b9)>>>0;v=state;v=Math.imul(v^(v>>>16),0x21f0aaad);v=Math.imul(v^(v>>>15),0x735a2d97);v=(v^(v>>>15))>>>0;}while(v>=limit);return v%n;};}
const results=[],started=Date.now();
for(const [model,pool]of [['casino.12',AUCTION_ITEMS_V4],['casino.13',AUCTION_ITEMS]]){
 const skillVersion=2,budget=100*R,fee=R,aggregateCache=new Map();
 const cache=new Map(),estimate=info=>{
  if(info.highCounts){const key=JSON.stringify([info.highCounts,info.highArea]);if(!aggregateCache.has(key))aggregateCache.set(key,estimateAuction(info,R,pool,weights));return aggregateCache.get(key);}
  return info.items.reduce((sum,x)=>{const key=[info.highCount,x.quality,x.width,x.height].join(':');if(!cache.has(key))cache.set(key,estimateAuction({highCount:info.highCount,items:[x]},R,pool,weights));return sum+cache.get(key);},0);
 };
 const policies=[['reference80',(r,v)=>Math.min(budget,Math.floor(v*.8))],['reference95',(r,v)=>Math.min(budget,Math.floor(v*.95))],['maximum',()=>budget],['wait3reference95',(r,v)=>r<3?0:Math.min(budget,Math.floor(v*.95))]];
 for(let ri=0;ri<3;ri++){
  const role=['sophie','gabriella','viktor'][ri],bins=policies.map(()=>[]);let totalValue=0,redBoards=0;
  for(let j=0;j<N;j++){
   const random=seeded((0x7132026+Math.imul(j+1,0x85ebca6b)+Math.imul(ri,0x27d4eb2d))>>>0),items=generateAuction(random,R,pool,weights),total=items.reduce((s,x)=>s+x.value,0),priority=shuffleAuction([0,1,2,3],random),infos=Array.from({length:4},()=>({highCount:null,items:Array.from({length:8},()=>({quality:null,width:null,height:null}))})),stages=[];
   totalValue+=total;redBoards+=items.some(x=>x.quality===5);
   for(let round=1;round<=5;round++){
    [role,'sophie','gabriella','viktor'].forEach((r,i)=>revealAuction(items,infos[i],r,round,random,skillVersion));
    const quotes=infos.slice(1).map((info,i)=>{
     const tape=[],record=n=>{const v=random(n);tape.push([n,v]);return v;};let quote;
     if(record(12)===0)quote=0;else{const factor=[.78,.94,1.08][i]*(.64+round*.06)*(.90+record(21)/100);quote=Math.min(budget,Math.max(1,Math.floor(estimate(info)*factor)));}
     if(j<100){let at=0;const actual=npcAuctionBid(info,round,i,n=>{const pair=tape[at++];if(!pair||pair[0]!==n)throw Error('random tape mismatch');return pair[1];},R,pool,weights,budget);if(actual!==quote)throw Error('cached NPC differs from production');}
     return quote;
    });
    if(j<100&&Math.abs(estimate(infos[0])-estimateAuction(infos[0],R,pool,weights))>.001)throw Error('cached valuation differs from production');
    stages.push({round,quotes,value:estimate(infos[0])});
   }
   policies.forEach(([,choose],pi)=>{for(const s of stages){const bid=choose(s.round,s.value),bids=[bid,...s.quotes],outcome=decideAuction(s.round,bids,priority,budget);if(outcome.done){bins[pi].push({net:((outcome.winner===0?total-outcome.price:0)-fee)/R,won:outcome.winner===0,capTie:bids.filter(v=>v===budget).length>=2});break;}}});
  }
  policies.forEach(([policy],pi)=>{const xs=bins[pi],nets=xs.map(x=>x.net).sort((a,b)=>a-b),mean=nets.reduce((s,x)=>s+x,0)/N,sd=Math.sqrt(nets.reduce((s,x)=>s+(x-mean)**2,0)/(N-1));results.push({model,role,policy,samples:N,meanNetT:mean,ci95:[mean-1.96*sd/Math.sqrt(N),mean+1.96*sd/Math.sqrt(N)],medianNetT:nets[Math.floor(N*.5)],p01NetT:nets[Math.floor(N*.01)],p95NetT:nets[Math.floor(N*.95)],p99NetT:nets[Math.floor(N*.99)],profitRate:xs.filter(x=>x.net>0).length/N,winRate:xs.filter(x=>x.won).length/N,capTieRate:xs.filter(x=>x.capTie).length/N,warehouseMeanT:totalValue/N/R,redWarehouseRate:redBoards/N});});
 }
}
const exactMean=pool=>pool.reduce((s,x)=>s+x.value*auctionItemChance(x,weights[x.quality],pool).slot,0)*8;
const report={qualityWeights:weights,exactWarehouseMeanCoins:{casino12:exactMean(AUCTION_ITEMS_V4),casino13:exactMean(AUCTION_ITEMS)},itemOdds:AUCTION_ITEMS.map(x=>({id:x.id,name:x.name,quality:x.quality,weight:x.dropWeight,...auctionItemChance(x,weights[x.quality])})),samplesPerRoleModel:N,warehouseSamples:N*6,independentSeedGroups:N*3,strategyRollouts:N*24,seedScheme:'SplitMix32 with rejection, 0x7132026 + index*0x85ebca6b + role*0x27d4eb2d',sampleUnit:'independent seed groups; old/new model pairs and policies reuse the same warehouse seed and are correlated',hiddenInformationUsed:false,skillStages:'both versions: round 1 high count; round 2 purple/gold/red counts; round 4 high area',economicsChanged:true,productionParity:'first 100 samples per role/model checked against real estimator and NPC functions with identical random tapes; aggregate estimates use whole-info cache, never per-slot decomposition',seconds:(Date.now()-started)/1000,results};
if(output){const {results,itemOdds,...metadata}=report;writeFileSync(output,JSON.stringify(metadata,null,2).slice(0,-2)+',\n  \"results\": [\n'+results.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ],\n  \"itemOdds\": [\n'+itemOdds.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]\n}\n');}console.log(JSON.stringify({warehouseSamples:report.warehouseSamples,strategyRollouts:report.strategyRollouts,seconds:report.seconds}));
