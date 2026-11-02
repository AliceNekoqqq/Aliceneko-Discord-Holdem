import {Canvas,encodePNG} from './card-image.mjs';
import {prepareNicknameFont} from './nickname-font.mjs';
import {SLOT_SYMBOLS} from './tavern-slots.mjs';

const C={bg:[30,18,31],wine:[89,36,57],rose:[173,91,117],gold:[231,187,115],cream:[255,245,224],ink:[70,37,52],muted:[190,152,166],green:[110,189,149]};
function circle(c,x,y,r,color){for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++)if(i*i+j*j<=r*r)c.pixel(x+i,y+j,color);}
function line(c,x,y,xx,yy,color,w=3){const n=Math.max(Math.abs(xx-x),Math.abs(yy-y));for(let i=0;i<=n;i++)c.rect(Math.round(x+(xx-x)*i/n),Math.round(y+(yy-y)*i/n),w,w,color);}
function icon(c,id,x,y){
 if(id==='cherry'){line(c,x-21,y-8,x+5,y-43,[76,125,72],4);line(c,x+20,y-8,x+5,y-43,[76,125,72],4);circle(c,x-22,y+10,22,[188,47,78]);circle(c,x+22,y+10,22,[216,67,94]);circle(c,x-28,y+1,6,[252,167,171]);circle(c,x+17,y+1,6,[252,167,171]);}
 if(id==='beer'){c.rect(x-32,y-26,64,76,[231,163,55],8);c.rect(x+30,y-15,19,46,[219,183,122],7);c.rect(x+36,y-7,6,29,C.cream);for(let j=-24;j<=24;j+=16)circle(c,x+j,y-27,16,C.cream);c.rect(x-17,y-6,6,41,[255,216,135],3);}
 if(id==='bean'){for(const [xx,yy]of [[-21,14],[19,-10]]){circle(c,x+xx,y+yy,24,[144,54,76]);circle(c,x+xx+10,y+yy-10,18,[164,64,89]);line(c,x+xx-5,y+yy-8,x+xx+6,y+yy+11,[221,143,150],4);}}
 if(id==='bell'){circle(c,x,y-15,31,[239,186,77]);c.rect(x-31,y-13,62,35,[239,186,77],4);c.rect(x-42,y+17,84,12,[212,148,49],6);circle(c,x,y+35,9,[212,148,49]);circle(c,x,y-49,7,C.gold);}
 if(id==='diamond'){for(let yy=-30;yy<=38;yy++){const half=yy<0?40:Math.round(40*(38-yy)/38);c.rect(x-half,y+yy,half*2+1,1,yy<0?[140,211,224]:[74,168,194]);}line(c,x-39,y-1,x+39,y-1,[224,254,255],3);line(c,x-17,y-30,x,y+37,[224,254,255],3);line(c,x+17,y-30,x,y+37,[224,254,255],3);}
 if(id==='butterfly'){circle(c,x-24,y-15,25,[198,149,222]);circle(c,x+24,y-15,25,[198,149,222]);circle(c,x-19,y+21,19,[159,113,194]);circle(c,x+19,y+21,19,[159,113,194]);c.rect(x-4,y-26,8,66,C.ink,4);line(c,x,y-23,x-14,y-45,C.ink,3);line(c,x,y-23,x+14,y-45,C.ink,3);}
}
export async function renderSlotsImage(result,env){
 const title='红豆老虎机',labels=['单人娱乐城','选择金额开始','返还本金','本局未中奖','三连中奖','返还','倍'];
 await prepareNicknameFont([title,...labels,...SLOT_SYMBOLS.map(s=>s.name)],env);
 const c=new Canvas(840,460);c.rect(0,0,840,460,C.bg);
 c.rect(24,20,792,418,C.gold,24);c.rect(28,24,784,410,C.wine,21);
 for(let x=54;x<800;x+=36){circle(c,x,43,4,C.cream);circle(c,x,413,4,C.gold);}
 c.text(title,420,62,43,C.cream,true);c.text('单人娱乐城',420,116,18,C.gold,true);
 c.rect(71,157,698,190,[47,24,40],16);
 const ids=result?.symbols||['cherry','bean','butterfly'];
 ids.forEach((id,i)=>{const x=86+i*229;c.rect(x,171,210,160,C.gold,11);c.rect(x+3,174,204,154,C.cream,8);icon(c,id,x+105,244);c.text(SLOT_SYMBOLS.find(s=>s.id===id).name,x+105,300,17,C.ink,true);});
 const label=result?(result.kind==='triple'?`三连中奖  /  ${result.multiplier}倍`:result.kind==='pair'?'返还本金':'本局未中奖'):'选择金额开始';
 c.text(label,420,365,27,result?.kind==='triple'?C.gold:C.cream,true);
 const png=await encodePNG(c);return new Uint8Array(await png.arrayBuffer());
}
