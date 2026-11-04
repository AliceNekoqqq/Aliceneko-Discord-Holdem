// Paired pure replays: no users, wallets, network, messages or production writes.
import {writeFileSync} from 'node:fs';
import {generateAuction,revealAuction,AUCTION_ROLES,AUCTION_TIERS,npcAuctionBid,decideAuction,shuffleAuction} from '../tavern-auction.mjs';
import {drawAuctionWarehouse} from '../tavern-auction-regions.mjs';
import {generateLargeAuction,estimateLargeAuction} from '../tavern-auction-large.mjs';
import {AUCTION_THEMES,initializePublicAuction,publicAuctionInfo,auctionInfoWithPublic} from '../tavern-auction-themes.mjs';
import {layoutAuction} from '../tavern-auction-board.mjs';
const samples=Number(process.argv[2]||24),output=process.argv[3];
if(!Number.isSafeInteger(samples)||samples<4||samples>1000)throw Error('samples must be 4..1000 per region/theme');
const roles=Object.keys(AUCTION_ROLES),empty=n=>({highCount:null,items:Array.from({length:n},()=>({quality:null,width:null,height:null}))});
function seeded(seed){let state=seed>>>0;return n=>{let v;const limit=Math.floor(4294967296/n)*n;do{state=(state+0x9e3779b9)>>>0;v=state;v=Math.imul(v^(v>>>16),0x21f0aaad);v=Math.imul(v^(v>>>15),0x735a2d97);v=(v^(v>>>15))>>>0;}while(v>=limit);return v%n;};}
const metrics=new Map(),results=[];
const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
const visibleFields=info=>info.items.reduce((n,x)=>n+['quality','width','category'].filter(k=>x[k]!=null).length,0);
let boards=0,noLarge=0,finite=0;
for(const [ti,tier] of Object.keys(AUCTION_TIERS).entries())for(const [hi,theme] of AUCTION_THEMES.entries())for(let j=0;j<samples;j++){
 const seed=(0x5112026+Math.imul(ti+1,0x85ebca6b)+Math.imul(hi+1,0x27d4eb2d)+Math.imul(j+1,0x165667b1))>>>0,
  rng=seeded(seed),warehouse={...drawAuctionWarehouse(tier,rng),themeId:theme.id},unit=100000*AUCTION_TIERS[tier].scale,
  items=generateLargeAuction(rng,unit,tier,warehouse,generateAuction,9),total=items.reduce((s,x)=>s+x.value,0),
  priority=shuffleAuction([0,1,2,3],rng),state={catalogVersion:9,warehouse,items,board:layoutAuction(items,String(seed),warehouse)},
  {budget,fee}=AUCTION_TIERS[tier];initializePublicAuction(state);boards++;noLarge+=!items.some(x=>x.width*x.height>4);
 for(const version of [2,3]){
  const actors=[...roles,'sophie','gabriella','viktor'].map((role,i)=>({role,info:empty(items.length),random:seeded(seed+Math.imul(i+1,0x12345))})),stages=[];
  for(let round=1;round<=5;round++){
   state.round=round;const shared=publicAuctionInfo(state),publicFields=visibleFields({items:shared.items}),estimates=[];
   for(const [ai,a] of actors.entries()){
    revealAuction(items,a.info,a.role,round,a.random,version,shared);
    const info=auctionInfoWithPublic(a.info,shared),value=estimateLargeAuction(info,unit,tier,warehouse,9);
    if(!Number.isFinite(value)||value<0)throw Error('invalid estimate');finite++;estimates.push(value);
    if(ai>=roles.length)continue;
    const key=[tier,version,a.role,round].join(':'),m=metrics.get(key)||{tier,version,role:a.role,round,errors:[],privateFields:[]};
    m.errors.push(Math.abs(value-total)/total);m.privateFields.push(visibleFields(info)-publicFields);metrics.set(key,m);
   }
   const bids=actors.slice(roles.length).map((a,i)=>npcAuctionBid(a.info,round,i,seeded(seed+round*100+i),unit,undefined,undefined,budget,()=>estimates[roles.length+i]));
   stages.push({estimates:estimates.slice(0,roles.length),bids});
  }
  for(const [ri,role]of roles.entries())for(const wait of [0,3]){
   let d,round;
   for(round=1;round<=5;round++){
    const s=stages[round-1],bid=round<=wait?0:Math.min(budget,Math.floor(s.estimates[ri]*.95));
    d=decideAuction(round,[bid,...s.bids],priority,budget);if(d.done)break;
   }
   const key=[tier,version,role,wait].join(':'),r=results.find(x=>x.key===key)||{key,tier,version,role,policy:wait?'waitUntil4ref95':'ref95',games:0,wins:0,profitable:0,net:0,roundSum:0};
   if(!r.games)results.push(r);r.games++;r.roundSum+=round;r.wins+=d.winner===0;
   const net=(d.winner===0?total-d.price:0)-fee;r.profitable+=net>0;r.net+=net;
  }
 }
}
const report={method:'Paired V2/V3 on identical V9 warehouses; independent actor RNG; NPCs use own clues only; ref95 and wait-until-4 policies. Synthetic strategy evidence, not human balance acceptance.',samplesPerTierTheme:samples,boards,noLarge,finiteEstimates:finite,
 information:[...metrics.values()].map(({errors,privateFields,...m})=>({...m,medianRelativeError:median(errors),meanPrivateFields:privateFields.reduce((s,x)=>s+x,0)/privateFields.length})),
 games:results.map(({key,net,roundSum,...r})=>({...r,winRate:r.wins/r.games,profitRate:r.profitable/r.games,meanNet:net/r.games,meanLastRound:roundSum/r.games}))};
if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const summary=roles.map(role=>({role,versions:[2,3].map(version=>{
 const a=report.information.filter(x=>x.role===role&&x.version===version&&x.round===2),b=report.games.filter(x=>x.role===role&&x.version===version&&x.policy==='ref95');
 return {version,round2MedianError:median(a.map(x=>x.medianRelativeError)),meanWinRate:b.reduce((s,x)=>s+x.winRate,0)/b.length};
})}));
console.log(JSON.stringify({boards,noLarge,finiteEstimates:finite,summary}));
