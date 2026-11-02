import {Canvas,encodePNG} from './card-image.mjs';
import {prepareNicknameFont} from './nickname-font.mjs';
import {AUCTION_QUALITIES,AUCTION_ROLES} from './tavern-auction.mjs';
import {auctionCatalogPage} from './tavern-auction-data.mjs';
import {prepareAuctionArt,drawAuctionItem} from './tavern-auction-art.mjs';
const f=n=>String(n);
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
 const title='酒馆仓库盲拍',subtitle=ended?revealing?`开仓揭晓 ${session.reveal.count} / 8`:'开仓结果':`第${session.round}轮 / 共5轮`,role=AUCTION_ROLES[session.role].name;
 const last=items?.[session.reveal?.last]||shown.at(-1),subtotal=shown.reduce((n,x)=>n+x.value,0);
 await prepareNicknameFont([title,subtitle,role,unit,'仓库','你的线索','仅显示已知品质与轮廓','轮廓未知','品质未知','白绿蓝紫金红','刚刚揭晓','已揭晓总值','开仓总值','本局净变化','等待开仓','图片与真实价格将在开仓时逐件揭晓','轮廓未知的藏品不显示实际占格','继续揭晓，或一次揭晓全部藏品','品质色与轮廓分别揭示 · 未知区域保持迷雾',...shown.flatMap(x=>[x.name,x.category,caption(x)]),...AUCTION_QUALITIES],env);
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
  if(last.flavor)c.text(caption(last),207,867,17,C.muted);
 }else{
  c.text(ended?'等待开仓':'图片与真实价格将在开仓时逐件揭晓',380,791,23,C.cream,true);
  c.text('?',380,836,30,C.gold,true);
 }
 c.text(ended?`${revealing?'已揭晓总值':'开仓总值'} ${f(subtotal)}${unit}`:'轮廓未知的藏品不显示实际占格',380,925,24,C.gold,true);
 c.text(ended&&!revealing?`本局净变化 ${session.result.net>0?'+':''}${f(session.result.net)}${unit}`:ended?'继续揭晓，或一次揭晓全部藏品':'品质色与轮廓分别揭示 · 未知区域保持迷雾',380,968,17,C.muted,true);
 return png(c);
}
export async function renderAuctionCatalogImage(env,quality=0,page=0){
 const {items,count,pages}=auctionCatalogPage(quality,page),heading=`${AUCTION_QUALITIES[quality]}品质 · ${page+1}/${pages}页 · 本档${count}件`;
 await prepareNicknameFont(['酒馆藏品图鉴','格','常规档竞拍币价值','小额 ×0.25 / 高额 ×3 / 典藏 ×10',heading,...items.flatMap(x=>[x.name,caption(x)])],env);
 const art=await prepareAuctionArt(env),height=200+Math.ceil(items.length/3)*260,c=new Canvas(760,height);c.rect(0,0,760,height,C.bg);
 c.text('酒馆藏品图鉴',380,26,36,C.cream,true);c.text(heading,380,75,21,AUCTION_COLORS[quality],true);c.text('常规档竞拍币价值',380,106,17,C.muted,true);
 items.forEach((item,i)=>{
  const x=20+i%3*244,y=146+Math.floor(i/3)*260;
  frame(c,x,y,232,248,item.quality);drawAuctionItem(c,item.id,x+29,y+22,174,136,art);
  c.text(`${item.width}×${item.height} · ${item.width*item.height}格`,x+10,y+7,13,C.muted);
  c.text(item.name,x+116,y+164,20,C.cream,true);c.text(f(item.value),x+116,y+194,18,AUCTION_COLORS[item.quality],true);
  if(item.flavor){const chars=[...caption(item)];for(let line=0;line<2;line++)c.text(chars.slice(line*14,(line+1)*14).join(''),x+116,y+216+line*16,14,C.muted,true);}
 });
 c.text('小额 ×0.25 / 高额 ×3 / 典藏 ×10',380,height-35,19,C.muted,true);
 return png(c);
}
