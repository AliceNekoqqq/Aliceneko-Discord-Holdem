import {Canvas,encodePNG} from './card-image.mjs';
import {prepareNicknameFont} from './nickname-font.mjs';
import {AUCTION_QUALITIES,AUCTION_ROLES} from './tavern-auction.mjs';
const colors=[[203,198,193],[116,182,139],[106,172,214],[182,135,214],[237,192,102],[225,108,126]];
const C={bg:[29,23,32],panel:[54,39,52],inner:[38,30,41],gold:[233,194,128],cream:[255,242,219],muted:[180,163,177]};
export async function renderAuctionImage(session,env){
 const ended=session.status==='settled',items=session.items,info=session.info;
 const title='酒馆仓库盲拍',subtitle=ended?'开仓清单':`第${session.round}轮 / 共5轮`,role=AUCTION_ROLES[session.role].name;
 const labels=[title,subtitle,role,'品质未知','轮廓未知','轮廓','格','品质','仅显示你的线索','开仓总值','币','自动结算',...AUCTION_QUALITIES,...(items||[]).flatMap(x=>[x.name,x.category])];
 await prepareNicknameFont(labels,env);
 const c=new Canvas(760,1000);c.rect(0,0,760,1000,C.bg);c.rect(24,24,712,4,C.gold);
 c.text(title,380,47,42,C.cream,true);c.text(`${subtitle}  /  ${role}`,380,108,23,C.gold,true);
 for(let i=0;i<8;i++){
  const x=28+(i%2)*360,y=160+Math.floor(i/2)*185,a=ended?items[i]:info.items[i],quality=a.quality,col=quality===null?C.muted:colors[quality];
  c.rect(x,y,344,171,col,13);c.rect(x+2,y+2,340,167,C.panel,12);
  c.text(`${i+1}  ${quality===null?'品质未知':AUCTION_QUALITIES[quality]+'品质'}`,x+18,y+13,25,col);
  if(ended){
   c.text(a.name,x+18,y+52,25,C.cream);
   c.text(`${a.category}  /  ${a.width}×${a.height} / ${a.width*a.height}格`,x+18,y+93,19,C.muted);
   c.text(`${a.value}币`,x+18,y+128,25,C.gold);
  }else if(a.width!==null){
   const cell=27,left=x+25,top=y+65;
   for(let yy=0;yy<a.height;yy++)for(let xx=0;xx<a.width;xx++)c.rect(left+xx*cell,top+yy*cell,cell-3,cell-3,col,3);
   c.text(`轮廓 ${a.width}×${a.height}`,x+125,y+70,22,C.cream);
   c.text(`${a.width*a.height}格`,x+125,y+108,20,C.muted);
  }else{
   c.text('?',x+37,y+65,58,C.muted);c.text('轮廓未知',x+125,y+91,23,C.muted);
  }
 }
 c.text(ended?`开仓总值 ${session.result.total}币`:'仅显示你的线索',380,923,27,C.gold,true);
 c.text(ended?'藏品价值为本局固定酒馆币结算价':'品质与轮廓分别揭示 / 未知部分不提前显示',380,966,17,C.muted,true);
 const png=await encodePNG(c);return new Uint8Array(await png.arrayBuffer());
}
