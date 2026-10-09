import {Canvas,encodePNG} from './card-image.mjs';
import {prepareNicknameFont} from './nickname-font.mjs';
export const WALK_MAP_SIZE={width:960,height:520};
export const WALK_NODES=Object.freeze([
 {id:'lamp-alley',name:'灯巷',x:150,y:164},
 {id:'bakery',name:'面包铺',x:462,y:142},
 {id:'drain',name:'排水沟',x:798,y:184},
 {id:'fork',name:'岔路口',x:660,y:378},
 {id:'tavern-porch',name:'酒馆门廊',x:246,y:380},
]);
const C={paper:[251,241,222],ink:[87,65,64],rose:[216,130,154],visited:[111,145,122],future:[193,179,156],cream:[255,253,245],river:[164,209,208],wood:[139,101,78],brick:[189,132,118],leaf:[183,196,157],road:[224,207,177],gold:[244,204,126]};
function circle(c,x,y,r,col){x=Math.round(x);y=Math.round(y);r=Math.round(r);for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++)if(xx*xx+yy*yy<=r*r)c.pixel(x+xx,y+yy,col);}
function line(c,a,b,col,w=4,dashed=false){const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));for(let k=0;k<=n;k++){if(dashed&&Math.floor(k/14)%2)continue;circle(c,a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n,w/2,col);}}
function rect(c,x,y,w,h,col,r=0){c.rect(Math.round(x),Math.round(y),Math.round(w),Math.round(h),col,r);}
function roof(c,x,y,w,h){for(let j=0;j<h;j++)rect(c,x-w/2-j,y+j,w+j*2,1,C.brick);}
function building(c,n){const x=n.x,y=n.y-62;
 if(n.id==='lamp-alley'){rect(c,x-53,y+12,62,47,C.brick,4);roof(c,x-22,y,46,13);rect(c,x-46,y+23,14,20,C.gold,2);line(c,[x+25,y+55],[x+25,y-10],C.wood,5);circle(c,x+25,y-10,17,[249,228,182]);circle(c,x+25,y-10,10,C.gold);}
 if(n.id==='bakery'){rect(c,x-60,y+8,120,52,C.wood,5);rect(c,x-53,y+16,106,39,C.cream,2);for(let j=0;j<7;j++)rect(c,x-60+j*18,y-2,18,17,j%2?C.rose:C.cream,3);for(let j=0;j<3;j++){circle(c,x-28+j*27,y+39,11,C.gold);line(c,[x-32+j*27,y+35],[x-26+j*27,y+42],C.wood,2);}}
 if(n.id==='drain'){line(c,[x-65,y+12],[x+65,y+55],C.river,20);rect(c,x-42,y+20,88,15,C.wood,3);for(let j=0;j<5;j++)line(c,[x-35+j*18,y+14],[x-35+j*18,y+40],C.cream,3);line(c,[x+24,y+58],[x+46,y+55],C.cream,6);}
 if(n.id==='fork'){line(c,[x,y+58],[x,y+23],C.wood,5);line(c,[x,y+26],[x-48,y+1],C.road,13);line(c,[x,y+26],[x+48,y+1],C.road,13);rect(c,x-43,y+5,37,13,C.wood,2);rect(c,x+5,y-5,39,13,C.wood,2);}
 if(n.id==='tavern-porch'){rect(c,x-65,y-10,130,68,C.brick,4);roof(c,x,y-29,110,20);rect(c,x-52,y+1,28,22,C.gold,3);rect(c,x+24,y+1,28,22,C.gold,3);rect(c,x-17,y+20,34,40,C.wood,16);rect(c,x-10,y+25,20,35,C.gold,8);circle(c,x-56,y+41,7,C.gold);circle(c,x+56,y+41,7,C.gold);}
}
export async function renderPetWalkMap(state=0){
 if(state!=='done'&&(!Number.isInteger(state)||state<0||state>=5))throw new RangeError('Unknown walk map state');
 const names=WALK_NODES.map(n=>n.name),legend=['雨后旧街','同行地图','已走过','当前位置','待抵达','返程完成'];await prepareNicknameFont([...names,...legend]);
 const c=new Canvas(960,520);rect(c,0,0,960,520,C.paper);rect(c,18,18,924,484,C.cream,22);rect(c,29,29,902,462,C.paper,18);
 for(let k=0;k<100;k++){const x=40+(k*89)%875,y=88+(k*43)%380;circle(c,x,y,k%3===0?3:1,[239,225,198]);}
 // Fixed scenery gives five stops a coherent neighborhood; state changes only progress markers.
 for(let k=0;k<930;k+=14){const yy=72+Math.sin(k/110)*8;line(c,[k,yy],[k+14,72+Math.sin((k+14)/110)*8],C.river,20);}
 for(const [x,y] of [[70,308],[390,302],[882,337],[451,415]]){circle(c,x,y,22,C.leaf);circle(c,x-12,y+8,14,C.leaf);line(c,[x,y+18],[x,y+35],C.wood,4);}
 c.text('雨后旧街',47,36,30,C.ink);c.text('同行地图',774,36,26,C.ink);
 for(let i=1;i<5;i++){const a=WALK_NODES[i-1],b=WALK_NODES[i];line(c,[a.x,a.y],[b.x,b.y],C.road,18);line(c,[a.x,a.y],[b.x,b.y],state==='done'||i<=state?C.visited:C.future,5,!(state==='done'||i<=state));}
 for(let i=0;i<5;i++){
  const n=WALK_NODES[i],current=state===i,visited=state==='done'||i<state,col=current?C.rose:visited?C.visited:C.future;
  building(c,n);if(current)circle(c,n.x,n.y,26,C.gold);circle(c,n.x,n.y,20,col);circle(c,n.x,n.y,15,C.cream);c.text(String(i+1),n.x,n.y-13,28,col,true);
  const width=n.name.length*32+26;rect(c,n.x-width/2,n.y+27,width,42,C.cream,10);c.text(n.name,n.x,n.y+32,32,C.ink,true);
 }
 const labels=state==='done'?[[390,'返程完成',C.visited]]:[[180,'已走过',C.visited],[405,'当前位置',C.rose],[660,'待抵达',C.future]];
 for(const [x,label,col] of labels){circle(c,x,472,7,col);c.text(label,x+17,458,26,C.ink);}
 return encodePNG(c);
}
