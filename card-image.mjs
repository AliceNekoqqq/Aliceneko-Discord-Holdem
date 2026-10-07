import { glyphs } from './card-glyphs.mjs';
import { cardsText } from './engine.mjs';

const WIDTH=760,HEIGHT=520;
const C={background:[23,29,43],private:[45,34,51],shared:[27,43,54],white:[255,252,245],ink:[32,39,53],red:[184,48,76],muted:[156,174,192],pink:[240,181,207],blue:[167,215,235],back:[45,62,78],border:[84,109,128]};
const decoded=new Map();
function glyph(char){if(!decoded.has(char)){const [w,h,advance,b64]=glyphs[char];decoded.set(char,{w,h,advance,data:Uint8Array.from(atob(b64),c=>c.charCodeAt(0))});}return decoded.get(char);}
export class Canvas {
  constructor(width=WIDTH,height=HEIGHT){this.width=width;this.height=height;this.pixels=new Uint8Array(width*height*3);this.rect(0,0,width,height,C.background);}
  pixel(x,y,color,alpha=255){if(x<0||y<0||x>=this.width||y>=this.height)return;const index=(y*this.width+x)*3;for(let i=0;i<3;i++)this.pixels[index+i]=Math.round((color[i]*alpha+this.pixels[index+i]*(255-alpha))/255);}
  rect(x,y,w,h,color,radius=0){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++){if(radius){const dx=Math.max(x+radius-i,0,i-(x+w-radius-1)),dy=Math.max(y+radius-j,0,j-(y+h-radius-1));if(dx*dx+dy*dy>radius*radius)continue;}this.pixel(i,j,color);}}
  text(value,x,y,size,color,center=false,rotate=false){const scale=size/48,characters=[...value];const width=characters.reduce((sum,c)=>sum+glyph(c).advance*scale,0);if(center)x-=width/2;let cursor=0;for(const char of characters){const g=glyph(char),w=Math.ceil(g.w*scale),h=Math.ceil(g.h*scale);for(let j=0;j<h;j++)for(let i=0;i<w;i++){const alpha=g.data[Math.min(g.h-1,Math.floor(j/scale))*g.w+Math.min(g.w-1,Math.floor(i/scale))];const px=Math.round(x+cursor+i),py=Math.round(y+j);this.pixel(rotate?Math.round(x-cursor-i):px,rotate?Math.round(y-j):py,color,alpha);}cursor+=g.advance*scale;}return width;}
  card(card,x,y,w,h){
    this.rect(x+2,y+4,w,h,[12,18,28],10);
    if(card==null){this.rect(x,y,w,h,C.border,10);this.rect(x+2,y+2,w-4,h-4,C.back,9);this.rect(x+9,y+9,w-18,h-18,C.border,5);this.rect(x+11,y+11,w-22,h-22,C.back,4);for(let j=y+18;j<y+h-16;j+=13)for(let i=x+18;i<x+w-16;i+=13)this.rect(i,j,3,3,[68,89,105]);return;}
    const suit=Math.floor(card/13),rank=['2','3','4','5','6','7','8','9','10','J','Q','K','A'][card%13],symbol=['♠','♥','♦','♣'][suit],color=suit===1||suit===2?C.red:C.ink;
    this.rect(x,y,w,h,C.white,10);
    const small=w>=130?32:27;
    this.text(rank,x+11,y+12,small,color);this.text(symbol,x+12,y+small+13,small-5,color);
    this.text(symbol,x+w/2,y+h/2-28,w>=130?72:60,color,true);
    this.text(rank,x+w-12,y+h-13,small,color,false,true);this.text(symbol,x+w-13,y+h-small-16,small-5,color,false,true);
  }
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(name,bytes){const result=new Uint8Array(bytes.length+12),view=new DataView(result.buffer);view.setUint32(0,bytes.length);result.set(new TextEncoder().encode(name),4);result.set(bytes,8);let crc=0xffffffff;for(let i=4;i<result.length-4;i++)crc=crcTable[(crc^result[i])&255]^(crc>>>8);view.setUint32(result.length-4,(crc^0xffffffff)>>>0);return result;}
export async function renderCardImage(hole,community=[]){
  if(!Array.isArray(hole)||hole.length!==2||!Array.isArray(community)||community.length>5||[...hole,...community].some(c=>!Number.isInteger(c)||c<0||c>=52)||new Set([...hole,...community]).size!==hole.length+community.length)throw Error('Invalid cards');
  const canvas=new Canvas();
  canvas.rect(16,16,728,236,C.private,14);canvas.text('你的底牌',38,30,26,C.pink);canvas.text('仅你可见',638,34,18,C.pink);
  canvas.card(hole[0],225,60,136,184);canvas.card(hole[1],399,60,136,184);
  canvas.text('1',205,62,20,C.pink);canvas.text('2',552,62,20,C.pink);
  canvas.rect(16,264,728,240,C.shared,14);canvas.text('桌面公共牌',38,282,26,C.blue);canvas.text('所有人共用',620,286,18,C.blue);
  const positions=[64,194,324,454,584];for(let i=0;i<5;i++)canvas.card(community[i],positions[i],317,112,151);
  canvas.text('翻牌',250,481,18,C.muted,true);canvas.text('转牌',510,481,18,C.muted,true);canvas.text('河牌',640,481,18,C.muted,true);
  return encodePNG(canvas);
}
export async function encodePNG(canvas){
  const {width,height}=canvas;
  const scan=new Uint8Array((width*3+1)*height);for(let y=0;y<height;y++)scan.set(canvas.pixels.subarray(y*width*3,(y+1)*width*3),y*(width*3+1)+1);
  const compressed=new Uint8Array(await new Response(new Blob([scan]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header.set([8,2,0,0,0],8);
  return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],{type:'image/png'});
}
export function imageSignature(t,id){const p=t.players.find(p=>p.id===id&&!p.bot);return p?.cards.length===2?`${t.epoch}/${t.handNo}/${p.cards.join(',')}/${t.board.join(',')}`:null;}
// Files only go to the player's ephemeral webhook, never to a public image URL.
export async function imageMessage(t,id,data,existing){
  const signature=imageSignature(t,id);if(!signature||!data.embeds?.length)return {body:{...data,attachments:[]},signature:null};
  const filename=`hand-${t.handNo}.png`,body=structuredClone(data);
  body.embeds[0].image={url:`attachment://${filename}`};
  const compact=()=>{body.embeds[0].description=body.embeds[0].description.replace(/\n底牌：[^\n]*\n公共牌：[^\n]*/,'');};
  if(existing?.signature===signature&&existing.id){compact();body.attachments=[{id:existing.id,filename}];return {body,signature};}
  const p=t.players.find(p=>p.id===id);let png;
  try{png=await renderCardImage(p.cards,t.board);}catch{delete body.embeds[0].image;body.attachments=[];return {body,signature:null};}
  body.attachments=[{id:0,filename,description:`上方仅你可见的底牌：${cardsText(p.cards)}；下方所有人共用的公共牌：${cardsText(t.board)||'尚未发出'}。`}];
  compact();
  const form=new FormData();form.set('payload_json',JSON.stringify(body));form.set('files[0]',png,filename);return {body:form,signature};
}
