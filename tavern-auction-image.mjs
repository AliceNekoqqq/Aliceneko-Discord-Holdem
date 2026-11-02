import {Canvas,encodePNG} from './card-image.mjs';
import {prepareNicknameFont} from './nickname-font.mjs';
import {AUCTION_QUALITIES,AUCTION_ROLES} from './tavern-auction.mjs';
import {AUCTION_ITEMS} from './tavern-auction-data.mjs';
import {prepareAuctionArt,drawAuctionItem} from './tavern-auction-art.mjs';
const f=n=>n>=100000000?`${Math.floor(n/100000000)}亿${n%100000000?`${n%100000000/10000}万`:''}`:n>=10000?`${n/10000}万`:String(n);
export const AUCTION_COLORS=[[203,198,193],[116,182,139],[106,172,214],[182,135,214],[237,192,102],[245,91,127]];
const C={bg:[26,21,30],panel:[53,38,48],inner:[33,28,39],gold:[233,194,128],cream:[255,242,219],muted:[159,147,165],fog:[43,39,52]};
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v*(1-t)+b[i]*t));
function frame(c,x,y,w,h,quality,last=false){
 const col=quality===null?C.muted:AUCTION_COLORS[quality];
 if(quality>=4)for(let n=5;n>=1;n--)c.rect(x-n,y-n,w+2*n,h+2*n,mix(C.bg,col,(6-n)*0.065),10);
 c.rect(x,y,w,h,col,8);c.rect(x+2,y+2,w-4,h-4,mix(C.inner,col,quality===null?0:0.17),7);
 if(quality===5||last)for(const [sx,sy]of [[x+8,y+8],[x+w-10,y+h-10]]){c.rect(sx-3,sy,7,1,C.cream);c.rect(sx,sy-3,1,7,C.cream);}
}
async function png(c){return new Uint8Array(await (await encodePNG(c)).arrayBuffer());}
export async function renderAuctionImage(session,env){
 const ended=session.status==='settled',revealing=ended&&session.reveal&&!session.reveal.complete;
 const items=ended?session.items.map((item,i)=>!session.reveal||session.reveal.indices.includes(i)?item:null):null,shown=(items||[]).filter(Boolean),info=session.info,unit=session.currency==='tavern'?'酒馆币':'竞拍币';
 const title='酒馆仓库盲拍',subtitle=ended?revealing?`开仓揭晓 ${session.reveal.count} / 8`:'开仓结果':`第${session.round}轮 / 共5轮`,role=AUCTION_ROLES[session.role].name;
 const last=items?.[session.reveal?.last]||shown.at(-1),subtotal=shown.reduce((n,x)=>n+x.value,0);
 await prepareNicknameFont([title,subtitle,role,unit,'仓库','你的线索','仅显示已知品质与轮廓','轮廓未知','品质未知','白绿蓝紫金红','刚刚揭晓','已揭晓总值','开仓总值','本局净变化','等待开仓','图片与真实价格将在开仓时逐件揭晓','轮廓未知的藏品不显示实际占格','继续揭晓，或一次揭晓全部藏品','品质色与轮廓分别揭示 · 未知区域保持迷雾',...shown.flatMap(x=>[x.name,x.category]),...AUCTION_QUALITIES],env);
 const art=shown.length?await prepareAuctionArt(env):null,c=new Canvas(760,1000);
 c.rect(0,0,760,1000,C.bg);c.rect(24,24,712,4,C.gold);
 c.text(title,380,48,39,C.cream,true);c.text(`${subtitle}  /  ${role}`,380,103,24,C.gold,true);
 c.text(ended?'仓库':'你的线索 · 仅显示已知品质与轮廓',380,149,18,C.muted,true);
 const left=60,top=190,cell=80,board=session.board;
 c.rect(left-12,top-12,664,504,[104,78,62],10);c.rect(left-6,top-6,652,492,C.inner,6);
 for(let y=0;y<6;y++)for(let x=0;x<8;x++){
  c.rect(left+x*cell+1,top+y*cell+1,78,78,[66,55,67],3);
  c.rect(left+x*cell+2,top+y*cell+2,76,76,C.fog,3);
  c.rect(left+x*cell+36,top+y*cell+36,3,3,[68,60,77],1);
 }
 for(let i=0;i<8;i++){
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
 }else{
  c.text(ended?'等待开仓':'图片与真实价格将在开仓时逐件揭晓',380,791,23,C.cream,true);
  c.text('?',380,836,30,C.gold,true);
 }
 c.text(ended?`${revealing?'已揭晓总值':'开仓总值'} ${f(subtotal)}${unit}`:'轮廓未知的藏品不显示实际占格',380,925,24,C.gold,true);
 c.text(ended&&!revealing?`本局净变化 ${session.result.net>0?'+':''}${f(session.result.net)}${unit}`:ended?'继续揭晓，或一次揭晓全部藏品':'品质色与轮廓分别揭示 · 未知区域保持迷雾',380,968,17,C.muted,true);
 return png(c);
}
export async function renderAuctionCatalogImage(env){
 await prepareNicknameFont(['酒馆藏品图鉴','常规档竞拍币价值','小额 ×0.25 / 高额 ×3 / 典藏 ×10','白绿蓝紫金红',...AUCTION_QUALITIES,...AUCTION_ITEMS.map(x=>x.name)],env);
 const art=await prepareAuctionArt(env),c=new Canvas(760,1400);c.rect(0,0,760,1400,C.bg);
 c.text('酒馆藏品图鉴',380,34,36,C.cream,true);c.text('常规档竞拍币价值',380,88,19,C.gold,true);
 AUCTION_ITEMS.forEach((item,i)=>{
  const x=22+i%4*184,y=130+Math.floor(i/4)*202;
  frame(c,x,y,166,186,item.quality);drawAuctionItem(c,item.id,x+8,y+16,150,122,art);
  c.text(item.name,x+83,y+139,17,C.cream,true);c.text(f(item.value),x+83,y+165,16,AUCTION_COLORS[item.quality],true);
 });
 c.text('小额 ×0.25 / 高额 ×3 / 典藏 ×10',380,1360,19,C.muted,true);
 return png(c);
}
