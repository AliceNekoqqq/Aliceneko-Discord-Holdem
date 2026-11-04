// Fixed-seed diagnostic: fixture values classify red warehouses; quotes use disclosed clues only.
import {writeFileSync} from 'node:fs';
import {generateAuction,revealAuction,npcAuctionBid,AUCTION_TIERS} from '../tavern-auction.mjs';
import {drawAuctionWarehouse} from '../tavern-auction-regions.mjs';
import {generateLargeAuction,largeCatalog,estimateLargeAuction} from '../tavern-auction-large.mjs';
import {AUCTION_THEMES,initializePublicAuction,publicAuctionInfo,auctionInfoWithPublic} from '../tavern-auction-themes.mjs';
import {layoutAuction} from '../tavern-auction-board.mjs';
const samples=4096,quoteSamples=128,old={small:4000000,standard:7000000,high:11000000,collection:17000000},
 proposed=Object.fromEntries(Object.entries(AUCTION_TIERS).map(([k,v])=>[k,v.budget])),scales=Object.fromEntries(Object.entries(AUCTION_TIERS).map(([k,v])=>[k,v.scale]));
function seeded(seed){let s=seed>>>0;return n=>{const max=Math.floor(4294967296/n)*n;let x;do{s=(s+0x9e3779b9)>>>0;x=s;x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);x=(x^(x>>>15))>>>0;}while(x>=max);return x%n;};}
const quantile=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)*p)];
const result=[];
for(const [ti,tier] of Object.keys(old).entries()){
 const reds=[],metrics={rounds:0,redRounds:0,oldAllNpcAtCap:0,newAllNpcAtCap:0,oldRedAllNpcAtCap:0,newRedAllNpcAtCap:0,oldPlayerAtCap:0,newPlayerAtCap:0};
 for(let j=0;j<samples;j++){
  const seed=(0x2842026+Math.imul(ti+1,0x85ebca6b)+Math.imul(j+1,0x165667b1))>>>0,rng=seeded(seed),
   warehouse={...drawAuctionWarehouse(tier,rng),themeId:AUCTION_THEMES[j%4].id},unit=100000*scales[tier],
   items=generateLargeAuction(rng,unit,tier,warehouse,generateAuction,9),red=items.some(x=>x.quality===5),total=items.reduce((n,x)=>n+x.value,0);
  if(red)reds.push(total);if(j>=quoteSamples)continue;
  const state={catalogVersion:9,warehouse,items,board:layoutAuction(items,String(seed),warehouse)},
   actors=['sophie','sophie','gabriella','viktor'].map((role,i)=>({role,info:{highCount:null,items:items.map(()=>({quality:null,width:null,height:null}))},rng:seeded(seed+i*1397)}));
  initializePublicAuction(state);
  for(let round=1;round<=5;round++){
   state.round=round;const pub=publicAuctionInfo(state);const estimates=actors.map(a=>{revealAuction(items,a.info,a.role,round,a.rng,3,pub);return estimateLargeAuction(auctionInfoWithPublic(a.info,pub),unit,tier,warehouse,9);});
   if(estimates.some(x=>!Number.isFinite(x)||x<0))throw Error('invalid estimate');
   const quotes=budget=>actors.slice(1).map((a,i)=>npcAuctionBid(a.info,round,i,seeded(seed+round*100+i),unit,largeCatalog(tier,9,warehouse.themeId),undefined,budget,()=>estimates[i+1]));
   const before=quotes(old[tier]),after=quotes(proposed[tier]),allBefore=before.every(x=>x===old[tier]),allAfter=after.every(x=>x===proposed[tier]);
   metrics.rounds++;metrics.redRounds+=red;metrics.oldAllNpcAtCap+=allBefore;metrics.newAllNpcAtCap+=allAfter;metrics.oldRedAllNpcAtCap+=red&&allBefore;metrics.newRedAllNpcAtCap+=red&&allAfter;
   metrics.oldPlayerAtCap+=estimates[0]*.95>=old[tier];metrics.newPlayerAtCap+=estimates[0]*.95>=proposed[tier];
  }
 }
 result.push({tier,samples,oldBudget:old[tier],newBudget:proposed[tier],redSamples:reds.length,redP50:quantile(reds,.5),redP90:quantile(reds,.9),redP95:quantile(reds,.95),
  oldCapBelowActualRed:reds.filter(v=>v>old[tier]).length/reds.length,newCapBelowActualRed:reds.filter(v=>v>proposed[tier]).length/reds.length,...metrics});
}
const report={method:'4096 independent SplitMix32 rejection-sampled warehouse seeds per tier; themes rotate equally. First128 per tier paired across unchanged clue plans and quote RNG. Round diagnostics include later hypothetical rounds even if a real match could close earlier, not win rates or profit guarantees.',fixtureValuesUsedOnlyForClassification:true,opponentsUseOwnDisclosedInfoOnly:true,result};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
