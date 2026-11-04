import test from 'node:test';
import assert from 'node:assert/strict';
import {revealAuction,auctionRoleSkill} from './tavern-auction.mjs';
import {auctionInfoWithPublic} from './tavern-auction-themes.mjs';
import {estimateAuctionEvidence} from './tavern-auction-evidence.mjs';
const empty=n=>({highCount:null,items:Array.from({length:n},()=>({quality:null,width:null,height:null}))});
const goods=Array.from({length:8},(_,i)=>({quality:i%6,width:i===7?3:1,height:i===7?2:1,category:i%2?'机械':'日用',value:999999,name:'hidden'}));
const pub=(n,fields={})=>({top:5,items:Array.from({length:n},(_,i)=>({quality:null,width:null,height:null,category:null,...fields[i]}))});
const max=n=>n-1;

test('V3 breadth and precision spend each reveal on useful information rather than public duplicates',()=>{
 const shared=pub(8,{0:{quality:0,width:1,height:1},1:{quality:1,width:1,height:1}});
 for(const role of ['sophie','gabriella']){
  const info=empty(8);revealAuction(goods,info,role,2,max,3,shared);
  assert.equal(info.items[0].quality,null);assert.equal(info.items[1].quality,null);
  assert.equal(info.items.filter(x=>x.quality!==null).length,2);
 }
 const info=empty(8);info.items[0].quality=0;
 revealAuction(goods,info,'gabriella',2,max,3,shared);
 assert.equal(info.items[0].width,null);
 const partial=pub(8,{0:{quality:0}}),one=empty(8);
 revealAuction(goods,one,'gabriella',2,max,3,partial);
 assert.equal(one.items[0].width,1);assert.equal(one.items[0].quality,0);
});

test('Zhou follows one prop without leaking identity, and falls back to an ordinary prop when no large one exists',()=>{
 for(const items of [goods,goods.slice(0,7)]){
  const info=empty(items.length),shared=pub(items.length);
  revealAuction(items,info,'zhou',1,max,3,shared);
  assert.equal(info.focus,items.length-1);assert.equal(info.largeAbsent,items.length===7);
  const focus=info.focus;assert.equal(info.items[focus].width,items[focus].width);
  assert.equal(info.items[focus].category,undefined);
  revealAuction(items,info,'zhou',2,max,3,shared);
  assert.equal(info.items[focus].quality,items[focus].quality);
  assert.equal(info.items[focus].category,undefined);
  revealAuction(items,info,'zhou',3,max,3,shared);
  assert.equal(info.items[focus].category,items[focus].category);
  const projected=auctionInfoWithPublic(info,shared);
  assert.equal(projected.focus,focus);assert.equal(projected.largeAbsent,info.largeAbsent);
  assert(!JSON.stringify(projected).includes('999999'));assert(!JSON.stringify(projected).includes('hidden'));
 }
});

test('an already-public focus appraisal converts to another unknown quality and never changes public information',()=>{
 const info=empty(8),shared=pub(8,{7:{quality:1}}),before=JSON.stringify(shared);
 revealAuction(goods,info,'zhou',1,max,3,shared);
 const count=info.items.filter(x=>x.quality!==null).length;
 revealAuction(goods,info,'zhou',2,max,3,shared);
 assert.equal(info.items.filter(x=>x.quality!==null).length,count+1);
 assert.equal(info.items[7].quality,null);assert.equal(JSON.stringify(shared),before);
});

test('Lucia combines private categories with the theme, then discloses all remaining qualities only on round five',()=>{
 const info=empty(8),shared=pub(8,{0:{quality:0}});
 revealAuction(goods,info,'lucia',1,max,3,shared);
 assert.equal(info.items[0].quality,null);assert.equal(info.items[1].category,goods[1].category);
 const combined=auctionInfoWithPublic(info,shared);assert.equal(combined.items[1].category,goods[1].category);
 for(let r=2;r<=4;r++)revealAuction(goods,info,'lucia',r,max,3,shared);
 assert(info.items.some(x=>x.quality===null));
 revealAuction(goods,info,'lucia',5,max,3,shared);
 assert(auctionInfoWithPublic(info,shared).items.every(x=>x.quality!==null));
 assert.equal(info.items.filter(x=>x.category!==undefined).length,4);
 assert(info.items.every(x=>x.width===null));
});

test('V2 future reveals and descriptions retain their original rules after V3 is introduced',()=>{
 const shared=pub(8,{0:{quality:0,width:1,height:1}});
 const sophie=empty(8);revealAuction(goods,sophie,'sophie',2,max,2,shared);
 assert.equal(sophie.items[0].quality,0);
 const zhou=empty(7);revealAuction(goods.slice(0,7),zhou,'zhou',1,max,2,shared);
 assert.equal(zhou.focus,undefined);assert(zhou.items.every(x=>x.width===null));
 const lucia=empty(8);revealAuction(goods,lucia,'lucia',1,max,2,shared);
 assert(lucia.items.every(x=>x.category===undefined));
 assert(!auctionRoleSkill('lucia',2).includes('类别'));assert(auctionRoleSkill('lucia',3).includes('类别'));
 assert(auctionRoleSkill('viktor',1).includes('合计'));assert(!auctionRoleSkill('viktor',1).includes('第2轮'));
});

test('private category and absent-large evidence match an exhaustive model including small featured fallback items',()=>{
 const ordinary=[{quality:0,width:1,height:1,category:'A',value:100,dropWeight:1},{quality:0,width:2,height:1,category:'B',value:400,dropWeight:1}],
  featured=[{quality:0,width:3,height:2,category:'A',value:900,dropWeight:1},{quality:0,width:1,height:1,category:'B',value:700,dropWeight:1}],
  m={count:2,weights:[1,0,0,0,0,0],ordinary,featured,chance:.6},all=[];
 for(let h=-1;h<2;h++)for(const a of (h===0?featured:ordinary))for(const b of (h===1?featured:ordinary))all.push({xs:[a,b],p:(h<0?.4:.3)/4});
 for(const absent of [false,true])for(const category of ['A','B']){
  const info=empty(2);info.items[0].category=category;if(absent)info.largeAbsent=true;
  const valid=all.filter(x=>x.xs[0].category===category&&(!absent||x.xs.every(y=>y.width*y.height<=4))),p=valid.reduce((s,x)=>s+x.p,0),
   value=valid.reduce((s,x)=>s+x.p*x.xs.reduce((s,y)=>s+y.value,0),0)/p;
  assert(Math.abs(estimateAuctionEvidence(info,100000,m)-value)<1e-9);
 }
});
