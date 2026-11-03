import {Canvas,encodePNG,textWidth} from './card-image.mjs';
import {prepareNicknameFont} from './nickname-font.mjs';
import {AUCTION_QUALITIES,AUCTION_ROLES,AUCTION_TIERS} from './tavern-auction.mjs';
import {auctionCatalogPage} from './tavern-auction-data.mjs';
import {largeCatalog} from './tavern-auction-large.mjs';
import {prepareAuctionArt,drawAuctionItem} from './tavern-auction-art.mjs';
const f=n=>String(n),fitName=(name,size,width)=>Math.min(size,width/Math.max(1,textWidth(name,1)));
export const AUCTION_COLORS=[[203,198,193],[116,182,139],[106,172,214],[182,135,214],[237,192,102],[245,91,127]];
const C={bg:[19,22,24],panel:[34,38,40],inner:[25,29,32],gold:[233,194,128],cream:[246,239,221],muted:[158,164,167],fog:[39,44,48]};
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v*(1-t)+b[i]*t));
// Use the font's supported clause separator instead of missing full-width marks.
const caption=item=>(item.flavor||'').replace(/[，；：]/g,' · ').replace(/[！？]/g,c=>c==='！'?'!':'?');
function frame(c,x,y,w,h,quality,last=false){
 const col=quality===null?C.muted:AUCTION_COLORS[quality];
 c.rect(x,y,w,h,col,3);c.rect(x+2,y+2,w-4,h-4,mix(C.inner,col,quality===null?0:0.12),2);
 c.rect(x+2,y+2,w-4,3,col);
 if(last)c.rect(x+5,y+h-5,w-10,2,C.cream);
}
async function png(c){return new Uint8Array(await (await encodePNG(c)).arrayBuffer());}
export async function renderAuctionImage(session,env){
 const ended=session.status==='settled',revealing=ended&&session.reveal&&!session.reveal.complete;
 const items=ended?session.items.map((item,i)=>!session.reveal||session.reveal.indices.includes(i)?item:null):null,shown=(items||[]).filter(Boolean),info=session.info,unit=session.currency==='tavern'?'酒馆币':'竞拍币';
 const title='酒馆仓库盲拍',subtitle=ended?revealing?`开仓揭晓 ${session.reveal.count} / ${session.reveal.total}`:'开仓结果':`第${session.round}轮 / 共5轮`,role=AUCTION_ROLES[session.role].name;
 const boardLabel=session.warehouse?`${session.warehouse.name} · ${session.board.cols*session.board.rows}格板 · ${info.items.length}件藏品`:'';
 const last=items?.[session.reveal?.last]||shown.at(-1),subtotal=shown.reduce((n,x)=>n+x.value,0);
 await prepareNicknameFont([title,subtitle,role,unit,boardLabel,'仓库','你的线索','仅显示已知品质与轮廓','轮廓未知','品质未知','白绿蓝紫金红','刚刚揭晓','已揭晓总值','开仓总值','本局净变化','本局盈亏 · 含藏品价值','等待开仓','图片与真实价格将在开仓时逐件揭晓','轮廓未知的藏品不显示实际占格','继续揭晓，或一次揭晓全部藏品','品质色与轮廓分别揭示 · 未知区域保持迷雾',...shown.flatMap(x=>[x.name,x.category,caption(x)]),...AUCTION_QUALITIES],env);
 const art=shown.length?await prepareAuctionArt(env):null,c=new Canvas(760,1000);
 c.rect(0,0,760,1000,C.bg);c.rect(24,24,712,4,C.gold);
 c.text(title,380,48,39,C.cream,true);c.text(`${subtitle}  /  ${role}`,380,103,24,C.gold,true);
 c.text(boardLabel||(ended?'仓库':'你的线索 · 仅显示已知品质与轮廓'),380,149,18,C.muted,true);
 const board=session.board,cols=board?.cols??8,rows=board?.rows??6,cell=Math.min(80,Math.floor(480/rows)),left=(760-cols*cell)/2,top=190+(480-rows*cell)/2;
 c.rect(left-12,top-12,cols*cell+24,rows*cell+24,[104,78,62],10);c.rect(left-6,top-6,cols*cell+12,rows*cell+12,C.inner,6);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  c.rect(left+x*cell+1,top+y*cell+1,cell-2,cell-2,[66,55,67],3);
  c.rect(left+x*cell+2,top+y*cell+2,cell-4,cell-4,C.fog,3);
  c.rect(left+x*cell+cell/2-4,top+y*cell+cell/2-4,3,3,[68,60,77],1);
 }
 for(let i=0;i<info.items.length;i++){
  const p=board?.slots[i];if(!p)continue;
  const item=items?.[i],clue=info.items[i],quality=item?item.quality:clue.quality;
  // A quality-only clue marks ONE cell; never use the hidden item's real footprint.
  const x=left+p.x*cell+4,y=top+p.y*cell+4,w=(p.width??1)*cell-8,h=(p.height??1)*cell-8;
  frame(c,x,y,w,h,quality,session.reveal?.last===i);
  if(item)drawAuctionItem(c,item.id,x+4,y+4,w-8,h-8,art);
  else c.text('?',x+w/2,y+h/2-14,30,quality===null?C.muted:AUCTION_COLORS[quality],true);
  c.rect(x+3,y+3,23,22,C.bg,4);c.text(String(i+1),x+15,y+5,17,C.cream,true);
 }
 AUCTION_QUALITIES.forEach((q,i)=>{c.rect(63+i*106,699,12,12,AUCTION_COLORS[i],3);c.text(q+'品质',83+i*106,695,17,AUCTION_COLORS[i]);});
 c.rect(40,736,680,160,C.panel,12);
 if(last){
  frame(c,54,750,128,128,last.quality,true);drawAuctionItem(c,last.id,60,756,116,116,art);
  c.text(revealing?'刚刚揭晓':AUCTION_QUALITIES[last.quality]+'品质',207,752,19,AUCTION_COLORS[last.quality]);
  c.text(last.name,207,787,28,C.cream);c.text(`${f(last.value)}${unit}`,207,833,24,C.gold);
  if(last.flavor)c.text(caption(last),207,867,17,C.muted);
 }else{
  c.text(ended?'等待开仓':'图片与真实价格将在开仓时逐件揭晓',380,791,23,C.cream,true);
  c.text('?',380,836,30,C.gold,true);
 }
 c.text(ended?`${revealing?'已揭晓总值':'开仓总值'} ${f(subtotal)}${unit}`:'轮廓未知的藏品不显示实际占格',380,925,24,C.gold,true);
 c.text(ended&&!revealing?`${session.result.inventory?'本局盈亏 · 含藏品价值':'本局净变化'} ${session.result.net>0?'+':''}${f(session.result.net)}${unit}`:ended?'继续揭晓，或一次揭晓全部藏品':'品质色与轮廓分别揭示 · 未知区域保持迷雾',380,968,17,C.muted,true);
 return png(c);
}
export async function renderAuctionInventoryImage(data,env,cabinet=false){
 const units=cabinet?Array.from({length:6},(_,slot)=>data.cabinet.find(x=>x.display_slot===slot)||null):data.items;
 const title=cabinet?'我的藏品展示柜':'个人藏品仓库',sub=cabinet?'六格珍藏 · 留住喜欢的藏品':`第${(data.page??0)+1}页 · 拍得时价值`,foot=cabinet?'藏品陈列中 · 先撤下再出售':'多选出售 / 按品质批卖 / 收藏陈列';
 await prepareNicknameFont([title,sub,foot,'竞拍币','空位','待陈列','格','已选','展示中','已开仓','藏品尚未入库','拍中并开仓后可在这里收藏','陈列总值','本页藏品总值',...units.filter(Boolean).flatMap(x=>[x.item.name,caption(x.item)]),...AUCTION_QUALITIES],env);
 const art=units.some(Boolean)?await prepareAuctionArt(env):null,height=cabinet?1000:1120,c=new Canvas(760,height);
 c.rect(0,0,760,height,[24,22,23]);
 for(let y=0;y<height;y+=13)c.rect(0,y,760,1,[29,26,26]);
 c.rect(26,24,708,3,C.gold);c.text(title,380,44,36,C.cream,true);c.text(sub,380,94,20,C.gold,true);
 if(cabinet){
  // A wooden outer case, individual glass bays, brass labels and lit plinths.
  c.rect(25,145,710,742,[88,61,44],10);c.rect(36,156,688,720,[47,38,33],6);
  for(let r=0;r<2;r++){
   const top=172+r*344;
   for(let col=0;col<3;col++){
    const index=r*3+col,unit=units[index],x=50+col*224,item=unit?.item;
    c.rect(x,top,212,317,[144,106,67],6);c.rect(x+3,top+3,206,311,[24,29,31],3);
    c.rect(x+8,top+8,196,3,[233,203,138]);c.rect(x+12,top+18,188,220,[35,39,40],3);
    for(let h=0;h<20;h++)c.rect(x+18+h,top+29+h,2,74,[48,53,55]);
    c.rect(x+16,top+216,180,13,[75,64,49],3);c.rect(x+16,top+229,180,4,[164,126,77]);
    if(item){
     drawAuctionItem(c,item.id,x+21,top+39,170,170,art);
     c.rect(x+19,top+244,174,2,AUCTION_COLORS[item.quality]);
     c.text(item.name,x+106,top+254,fitName(item.name,18,192),C.cream,true);c.text(`${item.width*item.height}格 · ${AUCTION_QUALITIES[item.quality]}品质`,x+106,top+281,15,AUCTION_COLORS[item.quality],true);
     c.text(f(item.value),x+106,top+297,14,C.gold,true);
    }else{c.text('待陈列',x+106,top+114,22,C.muted,true);c.text('空位',x+106,top+267,19,C.muted,true);}
    c.rect(x+9,top+10,31,25,[77,62,42],3);c.text(String(index+1),x+24,top+12,17,C.gold,true);
   }
   c.rect(41,top+321,678,10,[133,92,53],2);c.rect(41,top+331,678,3,[197,150,91]);
  }
 }else{
  units.forEach((unit,i)=>{
   const item=unit.item,x=20+i%3*244,y=153+Math.floor(i/3)*285,selected=data.selected?.includes(unit.id);
   frame(c,x,y,232,263,item.quality,selected);drawAuctionItem(c,item.id,x+31,y+32,170,151,art);
   c.text(`${i+1} · ${item.width}×${item.height} · ${item.width*item.height}格`,x+12,y+10,14,C.muted);
   c.text(item.name,x+116,y+186,fitName(item.name,20,214),C.cream,true);c.text(f(item.value),x+116,y+216,18,AUCTION_COLORS[item.quality],true);
   c.text(selected?'已选':unit.display_slot!==null?'展示中':AUCTION_QUALITIES[item.quality]+'品质',x+116,y+245,14,selected?C.gold:C.muted,true);
  });
  if(!units.length){c.text('藏品尚未入库',380,424,29,C.cream,true);c.text('拍中并开仓后可在这里收藏',380,474,21,C.muted,true);}
 }
 const total=units.filter(Boolean).reduce((s,x)=>s+x.item.value,0);
 c.text(`${cabinet?'陈列总值':'本页藏品总值'} ${f(total)}竞拍币`,380,height-72,22,C.gold,true);c.text(foot,380,height-29,18,C.muted,true);
 return png(c);
}
export async function renderAuctionCatalogImage(env,quality=0,page=0,tier='standard'){
 const {items,count,pages}=auctionCatalogPage(quality,page,largeCatalog(tier)),heading=`${AUCTION_QUALITIES[quality]}品质 · ${page+1}/${pages}页 · 本档${count}件`;
 await prepareNicknameFont(['酒馆藏品图鉴','格',`${AUCTION_TIERS[tier].name}区竞拍币价值`,'小额 ×0.25 / 高额 ×3 / 典藏 ×10',heading,...items.flatMap(x=>[x.name,caption(x),x.rarity])],env);
 const art=await prepareAuctionArt(env),height=200+Math.ceil(items.length/3)*260,c=new Canvas(760,height);c.rect(0,0,760,height,C.bg);
 c.text('酒馆藏品图鉴',380,26,36,C.cream,true);c.text(heading,380,75,21,AUCTION_COLORS[quality],true);c.text(`${AUCTION_TIERS[tier].name}区竞拍币价值`,380,106,17,C.muted,true);
 items.forEach((item,i)=>{
  const x=20+i%3*244,y=146+Math.floor(i/3)*260;
  frame(c,x,y,232,248,item.quality);drawAuctionItem(c,item.id,x+29,y+22,174,136,art);
  c.text(`${item.width}×${item.height} · ${item.width*item.height}格`,x+10,y+7,13,C.muted);c.text(item.rarity,x+163,y+7,13,C.gold);
  c.text(item.name,x+116,y+164,fitName(item.name,20,214),C.cream,true);c.text(f(Math.floor(item.value*AUCTION_TIERS[tier].scale)),x+116,y+194,18,AUCTION_COLORS[item.quality],true);
  if(item.flavor){const chars=[...caption(item)];for(let line=0;line<2;line++)c.text(chars.slice(line*14,(line+1)*14).join(''),x+116,y+216+line*16,14,C.muted,true);}
 });
 c.text('小额 ×0.25 / 高额 ×3 / 典藏 ×10',380,height-35,19,C.muted,true);
 return png(c);
}
