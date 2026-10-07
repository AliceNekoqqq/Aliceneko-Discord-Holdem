import { Canvas, encodePNG } from './card-image.mjs';
import * as game from './uno-engine.mjs';
import { pageCards } from './uno-ui.mjs';
const palette={red:[222,77,110],yellow:[239,185,58],green:[57,172,135],blue:[71,135,212]},white=[255,251,246],ink=[27,34,49],pink=[242,173,209];
function line(c,x1,y1,x2,y2,color,width=3){const steps=Math.max(Math.abs(x2-x1),Math.abs(y2-y1));for(let i=0;i<=steps;i++){const x=Math.round(x1+(x2-x1)*i/steps),y=Math.round(y1+(y2-y1)*i/steps);c.rect(x,y,width,width,color);}}
function plus(c,x,y,s,color){c.rect(x-s,y-3,s*2,6,color);c.rect(x-3,y-s,6,s*2,color);}
function butterfly(c,x,y,color){for(let yy=-9;yy<=9;yy++)for(let xx=-13;xx<=13;xx++){if((xx*xx/169+yy*yy/81)<1&&Math.abs(xx)>Math.abs(yy)/3+2)c.pixel(x+xx,y+yy,color);}c.rect(x-1,y-7,2,17,color);}
export function paintCard(c,card,x,y,w=128,h=172,enabled=false){
 const f=game.face(card),base=f.color?palette[f.color]:ink;
 c.rect(x-4,y-4,w+8,h+8,enabled?[114,241,176]:[57,66,87],13);c.rect(x,y,w,h,white,10);c.rect(x+4,y+4,w-8,h-8,base,8);
 // Four quadrant wild cards, a tilted bright oval, and a small butterfly brand.
 if(!f.color){c.rect(x+10,y+10,(w-20)/2,(h-20)/2,palette.red,4);c.rect(x+w/2,y+10,(w-20)/2,(h-20)/2,palette.blue,4);c.rect(x+10,y+h/2,(w-20)/2,(h-20)/2,palette.yellow,4);c.rect(x+w/2,y+h/2,(w-20)/2,(h-20)/2,palette.green,4);}
 for(let j=20;j<h-20;j++)for(let i=12;i<w-12;i++){const dx=i-w/2+(j-h/2)*0.18,dy=j-h/2;if(dx*dx/((w*.39)**2)+dy*dy/((h*.37)**2)<1)c.pixel(x+i,y+j,white);}
 const cx=x+w/2,cy=y+h/2,fg=f.color?base:ink;
 if(typeof f.value==='number'){c.text(String(f.value),cx,cy-34,62,fg,true);c.text(String(f.value),x+10,y+12,20,white);c.text(String(f.value),x+w-12,y+h-12,20,white,false,true);if([6,9].includes(f.value))c.rect(cx-15,cy+26,30,3,fg);}
 else if(f.value==='skip'){for(let j=-26;j<=26;j++)for(let i=-26;i<=26;i++){const d=i*i+j*j;if(d<676&&d>400)c.pixel(Math.round(cx+i),Math.round(cy+j),fg);}line(c,cx-19,cy+19,cx+19,cy-19,fg,5);}
 else if(f.value==='reverse'){line(c,cx-22,cy-13,cx+20,cy-13,fg,6);line(c,cx+9,cy-24,cx+20,cy-13,fg,6);line(c,cx+9,cy-2,cx+20,cy-13,fg,6);line(c,cx+20,cy+13,cx-22,cy+13,fg,6);line(c,cx-11,cy+2,cx-22,cy+13,fg,6);line(c,cx-11,cy+24,cx-22,cy+13,fg,6);}
 else if(f.value==='wild'){const s=22;c.rect(cx-s,cy-s,s,s,palette.red,3);c.rect(cx,cy-s,s,s,palette.blue,3);c.rect(cx-s,cy,s,s,palette.yellow,3);c.rect(cx,cy,s,s,palette.green,3);}
 else{plus(c,cx-19,cy,12,fg);c.text(f.value==='draw2'?'2':'4',cx+17,cy-30,54,fg,true);}
 if(typeof f.value!=='number')butterfly(c,x+19,y+20,white);
}
export async function renderUnoImage(t,id){const {cards,page,pages}=pageCards(t,id),legal=game.legalCards(t,id),height=280+Math.ceil(cards.length/5)*207,c=new Canvas(760,Math.max(300,height));
 c.rect(16,16,728,238,[37,34,53],14);c.text('ALICENEKO / UNO',38,32,24,pink);c.text('TABLE',38,78,18,[164,199,218]);
 if(t.discard.length)paintCard(c,t.discard.at(-1),300,68,116,166);
 if(t.color){c.rect(466,88,30,30,palette[t.color],8);c.text(t.color.toUpperCase(),513,91,21,white);}
 c.text(`HAND ${t.handNo}`,466,147,18,pink);c.text(`PAGE ${page+1} / ${pages}`,466,189,18,[164,199,218]);
 for(let i=0;i<cards.length;i++){const x=33+i%5*143,y=292+Math.floor(i/5)*207;c.text(String(page*20+i+1),x+64,y-28,20,legal.includes(cards[i])?[114,241,176]:pink,true);paintCard(c,cards[i],x,y,120,164,legal.includes(cards[i]));}
 return encodePNG(c);
}
export async function imageMessage(t,id,data,existing){const p=t.players.find(p=>p.id===id&&!p.bot);if(!p?.cards.length||!data.embeds?.length)return {body:{...data,attachments:[]},signature:null};
 const page=pageCards(t,id),signature=`${t.epoch}/${t.handNo}/${page.page}/${p.cards.join(',')}/${t.discard.at(-1)}/${t.color}/${game.legalCards(t,id).join(',')}`,filename=`uno-${t.handNo}-p${page.page+1}.png`,body=structuredClone(data);body.embeds[0].image={url:`attachment://${filename}`};
 if(existing?.signature===signature&&existing.id){body.attachments=[{id:existing.id,filename}];return {body,signature};}
 try{const png=await renderUnoImage(t,id);body.attachments=[{id:0,filename,description:`你的 UNO 手牌第 ${page.page+1} 页，绿框可出，编号对应菜单。`}];const form=new FormData();form.set('payload_json',JSON.stringify(body));form.set('files[0]',png,filename);return {body:form,signature};}catch{delete body.embeds[0].image;body.attachments=[];return {body,signature:null};}
}
