import {Canvas,encodePNG} from './card-image.mjs';
import {prepareNicknameFont} from './nickname-font.mjs';
import {TAVERN_BUILDING} from './tavern-building.mjs';

export const TAVERN_SCENE_VERSION='riverside-equipment-v3';
const W=1000,H=760;
const C={ink:[73,48,48],muted:[127,87,78],cream:[249,229,202],cream2:[239,211,179],walnut:[116,70,55],walnut2:[158,100,69],wood2:[185,132,91],wood3:[211,164,119],woodLine:[125,76,57],brick:[94,61,62],brickLight:[135,86,78],berry:[218,133,158],river:[124,190,198],riverDeep:[65,117,137],green:[84,130,92],gold:[240,185,94],white:[255,247,231],shade:[55,38,45],blue:[114,151,168]};
const label=(c,s,x,y,n=13,color=C.ink,center=true)=>c.text(s,x,y,n,color,center);
const safe=(v,max=14)=>[...String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim()].slice(0,max).join('')||'';
const marker=(v)=>safe(v,1)||'客';
const gameName={poker:'德州',uno:'UNO',ghost:'抽鬼牌',liar:'骗子酒馆'};
const phaseName={lobby:'等待中',waiting:'等待中',active:'游戏中',playing:'游戏中',in_progress:'游戏中',settled:'已结束',finished:'已结束',closed:'已结束'};
const atHour=at=>{const d=new Date(at);if(!Number.isFinite(d.getTime()))return 12;return Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(d));};
const {width:BUILDING_W,depth:BUILDING_D}=TAVERN_BUILDING.footprint;
const {originX,baseY,scaleX,scaleY,scaleZ}=TAVERN_BUILDING.projection;
const project=(x,y,z=0)=>[Math.round(originX+(x-y)*scaleX),Math.round(baseY+(x+y)*scaleY-z*scaleZ)];
function polygon(c,pts,color){const ys=pts.map(p=>p[1]),min=Math.max(0,Math.floor(Math.min(...ys))),max=Math.min(c.height-1,Math.ceil(Math.max(...ys)));for(let y=min;y<=max;y++){const xs=[];for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [x1,y1]=pts[i],[x2,y2]=pts[j];if((y1<=y&&y2>y)||(y2<=y&&y1>y))xs.push(x1+(y-y1)*(x2-x1)/(y2-y1));}xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2)for(let x=Math.max(0,Math.ceil(xs[i]));x<=Math.min(c.width-1,Math.floor(xs[i+1]));x++)c.pixel(x,y,color);}}
const quad=(c,points,color)=>polygon(c,points.map(([x,y,z=0])=>project(x,y,z)),color);
function cuboid(c,x,y,w,d,h,top=C.wood2,side=C.walnut){const p=[[x,y,0],[x+w,y,0],[x+w,y+d,0],[x,y+d,0]],t=p.map(([a,b])=>project(a,b,h));quad(c,[p[1],p[2],p[2].map((v,i)=>i===2?h:v),[p[1][0],p[1][1],h]],side);quad(c,[p[2],p[3],[p[3][0],p[3][1],h],[p[2][0],p[2][1],h]],C.brickLight);polygon(c,t,top);}
function dot(c,x,y,r,color){c.rect(Math.round(x-r),Math.round(y-r),r*2,r*2,color,r);}
function line(c,a,b,color,width=2){const dx=b[0]-a[0],dy=b[1]-a[1],n=Math.max(Math.abs(dx),Math.abs(dy));for(let i=0;i<=n;i++){const x=a[0]+dx*i/n,y=a[1]+dy*i/n;c.rect(Math.round(x-width/2),Math.round(y-width/2),width,width,color);}}
function drawRoom(c,hour){
 c.rect(0,0,W,H,[82,55,59]);c.rect(12,12,W-24,H-24,[125,82,75],22);c.rect(21,21,W-42,H-42,[240,217,188],16);
 // North river beyond the cutaway wall.
 const river=[project(0,-148),project(BUILDING_W,-148),project(BUILDING_W,-24),project(0,-24)];polygon(c,river,hour<6||hour>=20?C.riverDeep:C.river);
 for(let i=0;i<14;i++){const x=35+i*58,yy=-112+(i%3)*17;line(c,project(x,yy),project(x+30,yy),[166,211,205],2);}
 const nw=project(0,0),ne=project(BUILDING_W,0),se=project(BUILDING_W,BUILDING_D),sw=project(0,BUILDING_D),seBottom=project(BUILDING_W,BUILDING_D,-70),swBottom=project(0,BUILDING_D,-70);
 polygon(c,[sw,se,seBottom,swBottom],C.brick);polygon(c,[ne,se,seBottom,project(BUILDING_W,0,-70)],C.walnut);polygon(c,[nw,ne,project(BUILDING_W,0,-70),project(0,0,-70)],C.brickLight);
 quad(c,[[0,0],[BUILDING_W,0],[BUILDING_W,BUILDING_D],[0,BUILDING_D]],C.cream);
 // Honey-colored plank lines and subtle room zones.
 for(let y=22;y<BUILDING_D;y+=24){line(c,project(0,y),project(BUILDING_W,y),[235,205,172],1);const offset=((y/24|0)%2)*38;for(let x=offset;x<BUILDING_W;x+=88)line(c,project(x,y),project(x,Math.min(BUILDING_D,y+24)),[242,219,191],1);}
 quad(c,[[15,120],[335,120],[335,415],[15,415]],[246,225,199]);quad(c,[[365,120],[827,120],[827,442],[365,442]],[248,230,207]);
 // Long north windows with visible timber mullions, deep frames, and warm interior sills.
 for(let x=38;x<BUILDING_W-25;x+=98){const a=project(x,4,57),b=project(Math.min(x+74,BUILDING_W-8),4,57),d=project(Math.min(x+74,BUILDING_W-8),4,14),e=project(x,4,14);polygon(c,[a,b,d,e],hour<6||hour>=20?[48,75,105]:[129,194,199]);line(c,a,b,C.walnut2,7);line(c,e,d,[223,190,150],5);line(c,a,e,[231,203,169],4);line(c,b,d,[231,203,169],4);line(c,project(x+37,4,57),project(x+37,4,14),[245,218,179],2);}
 // River side sill and old street-facing entrance cut into the front wall.
 line(c,project(8,0,4),project(BUILDING_W-8,0,4),C.walnut2,9);
 // A proper curved arch, cut through the south-facing street wall.
 const arch=(cx,r,base,zspring,peak)=>{const pts=[project(cx-r,BUILDING_D,-2),project(cx+r,BUILDING_D,-2),project(cx+r,BUILDING_D,zspring)];for(let i=0;i<=16;i++){const a=i*Math.PI/16;pts.push(project(cx+r*Math.cos(a),BUILDING_D,zspring+(peak-zspring)*Math.sin(a)));}return pts;};
 polygon(c,arch(185,54,0,52,91),C.walnut);polygon(c,arch(185,42,0,43,73),[186,123,81]);dot(c,...project(214,BUILDING_D,26),3,C.gold);
 // East service wall and small separate back-kitchen counter.
 cuboid(c,715,28,120,82,24,[232,204,171],C.brick);label(c,'后厨',...project(775,50,27),20,C.ink);
 cuboid(c,746,135,88,205,35,C.walnut2,C.walnut);quad(c,[[748,138],[831,138],[831,340],[748,340]],C.cream2);cuboid(c,760,178,58,120,48,[177,113,78],C.walnut);label(c,'吧台',...project(789,160,52),21,C.white);
 // West commons built-in benches and north window seat are simple base furnishings.
 cuboid(c,42,216,160,24,25,C.walnut2,C.walnut);cuboid(c,42,216,18,88,23,C.walnut,C.walnut);cuboid(c,184,216,18,88,23,C.walnut,C.walnut);cuboid(c,112,320,118,27,20,C.walnut2,C.walnut);
 cuboid(c,245,38,225,28,22,[183,129,111],C.walnut);
 // Warm wall torches plus a pink butterfly mark on an inner timber beam.
 for(const [x,y] of [[370,110],[585,112],[612,392],[307,399]]){const p=project(x,y,42);c.rect(p[0]-2,p[1],4,22,C.walnut,2);dot(c,p[0],p[1],7,C.gold);}
 const beam1=project(270,110,43),beam2=project(675,110,43);line(c,beam1,beam2,C.walnut,6);dot(c,...project(462,110,46),5,C.berry);dot(c,...project(469,110,46),5,C.berry);dot(c,...project(465,110,48),3,C.cream);
}
function drawPlant(c,x,y,level=1){const p=project(x,y,24);cuboid(c,x-10,y-8,20,17,16,[175,114,83],C.walnut);for(const [dx,dy,col] of [[-8,-17,[80,133,87]],[3,-27,[108,151,91]],[12,-15,[72,119,81]],...(level>1?[[18,-26,[84,130,92]]]:[])])dot(c,p[0]+dx,p[1]+dy,7,col);}
function drawFurnitureTop(c,x,y,w,d,z,color=C.wood2){quad(c,[[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]],color);line(c,project(x+5,y+8,z+1),project(x+w-5,y+8,z+1),C.wood3,2);line(c,project(x+10,y+d/2,z+1),project(x+w-8,y+d/2,z+1),C.woodLine,1);}
function drawStool(c,x,y,color=C.wood3){cuboid(c,x-3,y-3,6,6,14,C.walnut,C.walnut);cuboid(c,x-3,y+7,6,6,14,C.walnut,C.walnut);drawFurnitureTop(c,x-13,y-9,26,18,17,color);}
function drawFixture(c,a){const id=a.id,def=TAVERN_BUILDING.fixtures[id];if(!def)return;const {x,y,shape}=def,level=Math.max(1,Math.min(9,Number(a.level)||1)),p=project(x,y,0),pink=C.berry,wood=level>1?C.wood3:C.wood2;
 switch(shape){
 case'coffee':cuboid(c,x-14,y-10,28,20,34,C.brickLight,C.walnut);c.rect(p[0]-10,p[1]-29,20,13,C.ink,2);dot(c,p[0]-4,p[1]-19,3,C.cream);line(c,[p[0]+9,p[1]-26],[p[0]+12,p[1]-17],C.gold,2);break;
 case'oven':cuboid(c,x-20,y-14,40,28,28,C.cream2,C.walnut);c.rect(p[0]-13,p[1]-28,26,15,C.ink,2);c.rect(p[0]-9,p[1]-24,18,7,C.gold,1);line(c,[p[0]-10,p[1]-31],[p[0]+10,p[1]-31],C.walnut,2);break;
 case'blender':cuboid(c,x-9,y-8,18,16,12,C.berry,C.walnut);c.rect(p[0]-7,p[1]-34,14,21,C.blue,3);c.rect(p[0]-5,p[1]-24,10,9,C.berry,2);c.rect(p[0]-9,p[1]-36,18,4,C.cream,1);break;
 case'icecream':cuboid(c,x-14,y-12,28,24,38,C.cream2,C.walnut);c.rect(p[0]-8,p[1]-33,16,9,C.blue,2);line(c,[p[0],p[1]-22],[p[0],p[1]-14],C.walnut,3);dot(c,p[0],p[1]-10,5,C.white);break;
 case'table':for(const [xx,yy] of [[-27,-20],[22,-20],[-27,15],[22,15]])cuboid(c,x+xx,y+yy,5,5,22,C.walnut,C.walnut);drawFurnitureTop(c,x-34,y-25,68,50,25,wood);break;
 case'seat':cuboid(c,x-12,y-6,5,5,13,C.walnut,C.walnut);cuboid(c,x+24,y-6,5,5,13,C.walnut,C.walnut);drawFurnitureTop(c,x-16,y-12,48,22,16,level>1?pink:C.wood3);cuboid(c,x-16,y-11,48,6,24,C.walnut2,C.walnut);break;
 case'shelf':cuboid(c,x-13,y-6,4,4,47,C.walnut,C.walnut);cuboid(c,x+9,y-6,4,4,47,C.walnut,C.walnut);for(let i=0;i<3;i++){drawFurnitureTop(c,x-18,y-7+i*12,36,15,18+i*10,C.walnut2);for(let j=0;j<Math.min(4,level+1);j++)c.rect(p[0]-14+j*7,p[1]-35+i*11,4,8,[C.berry,C.green,C.gold,C.blue][j%4]);}break;
 case'rack':cuboid(c,x-3,y-3,6,6,40,C.walnut2,C.walnut);line(c,[p[0]-17,p[1]-38],[p[0]+17,p[1]-38],C.walnut,4);for(let i=0;i<Math.min(level,4);i++){const xx=p[0]-12+i*8;line(c,[xx,p[1]-39],[xx,p[1]-31],C.gold,2);dot(c,xx,p[1]-27,4,i%2?C.berry:C.blue);}break;
 case'counter':case'case':case'tea':{for(const xx of [-22,17])cuboid(c,x+xx,y-17,5,5,21,C.walnut,C.walnut);drawFurnitureTop(c,x-28,y-22,56,44,23,wood);if(shape==='case'){c.rect(p[0]-20,p[1]-37,40,13,[217,236,226],3);for(let i=0;i<Math.min(level,4);i++)dot(c,p[0]-12+i*8,p[1]-31,3,C.gold);}else if(shape==='tea'){c.rect(p[0]-18,p[1]-36,36,11,C.cream2,3);dot(c,p[0]-8,p[1]-31,5,C.berry);dot(c,p[0]+8,p[1]-31,5,C.white);for(let i=0;i<Math.min(level,3);i++)line(c,[p[0]-5+i*6,p[1]-38],[p[0]-3+i*6,p[1]-48],[255,246,224],2);}else{c.rect(p[0]-17,p[1]-35,34,8,C.brickLight,2);for(let i=0;i<Math.min(level,4);i++)dot(c,p[0]-11+i*7,p[1]-32,2,C.gold);}break;}
 case'lamp':line(c,[p[0],p[1]-8],[p[0],p[1]-42-Math.min(level,3)*3],C.walnut,3);dot(c,p[0],p[1]-45-Math.min(level,3)*3,9,C.gold);dot(c,p[0],p[1]-45-Math.min(level,3)*3,5,C.white);if(level>1)line(c,[p[0]-10,p[1]-42],[p[0]+10,p[1]-42],C.berry,2);break;
 case'lantern':for(let i=0;i<Math.min(level,4);i++){const xx=p[0]-17+i*12;line(c,[xx,p[1]-8],[xx,p[1]-31],C.walnut,1);c.rect(xx-5,p[1]-38,10,14,i%2?C.berry:C.gold,3);}break;
 case'sign':cuboid(c,x-20,y-7,40,14,22,[208,115,146],C.walnut);c.rect(p[0]-12,p[1]-31,24,7,C.white,3);break;
 case'frame':cuboid(c,x-16,y-5,32,10,26,[214,179,132],C.walnut);line(c,[p[0]-9,p[1]-23],[p[0]+8,p[1]-35],C.river,3);line(c,[p[0]-8,p[1]-24],[p[0]+9,p[1]-25],C.green,2);break;
 case'vase':dot(c,p[0],p[1]-12,7,[188,132,123]);for(let i=0;i<Math.min(level,3);i++)line(c,[p[0],p[1]-17],[p[0]-6+i*6,p[1]-31],C.green,2);break;
 case'board':cuboid(c,x-18,y-7,36,14,32,[82,96,76],C.walnut);for(let i=0;i<Math.min(level,3);i++)line(c,[p[0]-9,p[1]-23+i*5],[p[0]+8,p[1]-23+i*5],C.cream,1);break;
 case'clock':dot(c,p[0],p[1]-20,12,[186,143,99]);dot(c,p[0],p[1]-20,8,C.cream);line(c,[p[0],p[1]-20],[p[0]+5,p[1]-25],C.ink,1);dot(c,p[0],p[1]-20,2,C.ink);break;
 case'gramophone':cuboid(c,x-12,y-12,24,24,15,C.walnut2,C.walnut);line(c,[p[0],p[1]-15],[p[0]+9,p[1]-29],C.gold,2);for(let i=0;i<Math.min(level,3);i++)line(c,[p[0]+7-i*2,p[1]-29-i*2],[p[0]+11-i*2,p[1]-32-i*2],C.brickLight,1);break;
 case'plant':drawPlant(c,x,y,level);break;case'bell':line(c,[p[0],p[1]-5],[p[0],p[1]-22],C.walnut,2);dot(c,p[0],p[1]-25,6,C.gold);break;
 case'seating':drawStool(c,x-15,y+8,level>1?pink:C.wood3);drawStool(c,x+18,y+8,level>1?pink:C.wood3);cuboid(c,x-16,y-20,32,5,23,C.walnut2,C.walnut);drawFurnitureTop(c,x-20,y-22,40,22,26,level>1?pink:wood);break;
 case'speaker':cuboid(c,x-10,y-10,20,20,30,C.walnut2,C.walnut);dot(c,p[0],p[1]-28,5,C.ink);dot(c,p[0],p[1]-28,2,C.gold);break;
 case'fan':dot(c,p[0],p[1]-22,11,C.blue);for(let i=0;i<Math.min(level+1,5);i++){const a=i*Math.PI*2/Math.min(level+1,5);line(c,[p[0],p[1]-22],[p[0]+Math.cos(a)*9,p[1]-22+Math.sin(a)*9],C.cream,2);}break;
 case'deck':quad(c,[[x-70,y-20],[x+70,y-20],[x+70,y+20],[x-70,y+20]],wood);for(let i=-2;i<=2;i++)line(c,project(x-65,y+i*8,1),project(x+65,y+i*8,1),C.woodLine,1);break;
 }
 // A compact brass inlay marks the upgrade tier without adding another label to the map.
 const pips=Math.min(level,5);for(let i=0;i<pips;i++)dot(c,p[0]+(i-(pips-1)/2)*5,p[1]+13,2,C.gold);
}
function drawTable(c,table,x,y,used){const p=project(x,y,0);for(const [xx,yy] of [[-42,-25],[35,-25],[-42,18],[35,18]])cuboid(c,x+xx,y+yy,7,7,22,C.walnut,C.walnut);drawFurnitureTop(c,x-48,y-30,96,60,24,C.wood2);for(let i=0;i<3;i++)line(c,project(x-38,y-20+i*20,25),project(x+38,y-20+i*20,25),i===1?C.woodLine:C.wood3,1);const seats=[[x,y-45],[x+54,y-24],[x+57,y+18],[x,y+43],[x-56,y+18],[x-55,y-22],[x+24,y-48],[x-25,y+48]],avatarOffsets=[[-65,-64],[-22,-80],[22,-80],[65,-64],[72,12],[34,62],[-34,62],[-72,12]];seats.forEach(([sx,sy],i)=>drawStool(c,sx,sy,i%2?C.wood3:C.berry));const allPlayers=Array.isArray(table?.players)?table.players:[],players=allPlayers.slice(0,8),game=table?(gameName[table.game]||'牌桌'):'空桌',phase=table?(phaseName[table.phase]||'等待中'):'',gameWidth=[...game].length*22,phaseWidth=[...phase].length*18,w=Math.max(66,gameWidth,phaseWidth)+20,h=table?56:34,tagY=p[1]-32;c.rect(p[0]-w/2,tagY-h/2,w,h,table?[255,247,231]:[255,229,237],10);label(c,game,p[0],tagY-(table?23:17),22,C.ink);if(table)label(c,phase,p[0],tagY+5,18,C.ink);players.forEach((person,i)=>{const q=[p[0]+avatarOffsets[i][0],p[1]+avatarOffsets[i][1]],r=14;dot(c,q[0],q[1],r,person.bot?[173,148,180]:C.berry);dot(c,q[0],q[1]-1,r-5,C.white);label(c,marker(person.name),q[0],q[1]-10,18,C.ink);});allPlayers.forEach((person,index)=>used.add(String(person?.id??`anon-${table?.channel||'table'}-${index}`)));}
function timeText(at){const d=new Date(at);if(!Number.isFinite(d.getTime()))return '时间未知';const p=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).replace(':','时');return `${p}分 北京时间`;}
async function renderTavernCanvas(snapshot={},env){
 const s=snapshot&&typeof snapshot==='object'?snapshot:{},allTables=Array.isArray(s.tables)?s.tables:[],visitors=Array.isArray(s.visitors)?s.visitors:[],assets=Array.isArray(s.room?.assets)?s.room.assets:[],used=new Set(),tables=Array(4).fill(null);
 allTables.forEach((table,index)=>{const raw=table?.displaySlot,slot=raw===undefined?index:(raw===null?-1:(Number.isInteger(Number(raw))?Number(raw):-1));if(slot>=0&&slot<4&&!tables[slot])tables[slot]=table;});
 // All active table players are occupied, including overflow tables with no visible anchor.
 const occupiedPlayers=new Set();allTables.forEach((table,ti)=>(Array.isArray(table?.players)?table.players:[]).forEach((p,pi)=>occupiedPlayers.add(String(p?.id??`anon-${table?.channel||ti}-${pi}`))));
 const visitorCount=Math.max(0,Number.isFinite(Number(s.visitorCount))?Math.floor(Number(s.visitorCount)):visitors.length),hour=atHour(s.at),ambient=hour>=6&&hour<17?'河光正好':hour>=17&&hour<20?'暮色渐浓':'星月河窗';
 const manager=s.operations?.manager?.name?safe(s.operations.manager.name,8):'暂无';
 const tableCount=Math.max(0,Number(s.tableCount)||0),gameOverflow=allTables.filter((t,i)=>{const raw=t?.displaySlot,n=raw===undefined?i:(raw===null?-1:Number(raw));return !Number.isInteger(n)||n<0||n>3;}).reduce((n,t)=>n+(Array.isArray(t?.players)?t.players.filter(p=>!p?.bot).length:0),0);
 const areaNames={bar:'吧台',window:'窗边',quiet:'静谧角',commons:'客厅'};
 const texts=[safe(s.room?.name||'红豆粉的小酒馆',18),timeText(s.at),ambient,'客厅','窗边','静谧角','吧台','后厨','空桌','德州','UNO','抽鬼牌','骗子酒馆','等待中','游戏中','已结束','今日店长',`近30分钟来客 ${visitorCount}  ·  游戏桌 ${tableCount}`,manager,`游戏区另有 ${gameOverflow} 位玩家`,...visitors.slice(0,40).map(p=>marker(p.name)),...allTables.flatMap(t=>(Array.isArray(t?.players)?t.players:[]).slice(0,8).map(p=>marker(p.name)))];await prepareNicknameFont(texts,env);
 const c=new Canvas(W,H);drawRoom(c,hour);
 // Fixed tables; live table snapshots occupy their canonical anchors, empty anchors stay explicitly empty.
 TAVERN_BUILDING.anchors.tables.forEach((a,i)=>drawTable(c,tables[i],a.x,a.y,used));
 // Installed fixtures only; IDs, levels and donor labels come directly from public room assets.
 for(const a of assets){const id=typeof a.item==='string'?a.item:a.id||a.item?.id;drawFixture(c,{...a,id,name:a.name||a.item_name,founder:a.founder});}
 const areaTag=(text,x,y,width)=>{c.rect(x-width/2,y-4,width,34,[255,244,226],12);label(c,text,x,y+2,24,C.ink);};
 areaTag('客厅',283,330,86);areaTag('窗边',440,215,86);areaTag('静谧角',333,518,130);
 const visitorIds=new Set(),byArea={bar:[],window:[],quiet:[],commons:[]};const hiddenGameIds=new Set(allTables.filter(t=>!tables.includes(t)).flatMap(t=>(Array.isArray(t?.players)?t.players:[]).filter(p=>!p?.bot).map(p=>String(p.id))));for(const v of visitors.slice(0,40)){const id=String(v?.id??'');if(!id||occupiedPlayers.has(id)||visitorIds.has(id))continue;visitorIds.add(id);const area=v?.location?.area;if(area==='game'){hiddenGameIds.add(id);continue;}const key=Object.hasOwn(byArea,area)?area:'commons';byArea[key].push(v);if(visitorIds.size>=40)break;}
 for(const [area,list] of Object.entries(byArea)){const def=TAVERN_BUILDING.visitorAreas[area],sorted=list.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));sorted.slice(0,def.capacity).forEach((g,i)=>{const [wx,wy]=def.seats[i],p=project(wx,wy,18);dot(c,p[0],p[1],15,C.berry);dot(c,p[0],p[1]-1,11,C.white);label(c,marker(g.name),p[0],p[1]-8,16,C.ink);});if(sorted.length>def.capacity){const [wx,wy]=def.seats.at(-1),p=project(wx+18,wy+16,5);const text=`${areaNames[area]} +${sorted.length-def.capacity}`;c.rect(p[0]-55,p[1]-3,110,27,[255,244,226],9);label(c,text,p[0],p[1]+1,16,C.ink);}}
 const hiddenGamePlayers=hiddenGameIds.size;if(hiddenGamePlayers){const p=project(445,430,5);c.rect(p[0]-110,p[1]-3,220,29,[255,244,226],10);label(c,`游戏区另有 ${hiddenGamePlayers} 位玩家`,p[0],p[1]+1,18,C.ink);}
 c.rect(22,22,956,56,[89,57,61],14);label(c,safe(s.room?.name||'红豆粉的小酒馆',18),278,36,24,C.white);label(c,ambient,819,39,19,[255,226,204]);c.rect(22,679,956,58,[89,57,61],14);label(c,`近30分钟来客 ${visitorCount}  ·  游戏桌 ${tableCount}`,338,694,21,C.white);c.rect(655,690,300,34,[115,75,77],11);label(c,'今日店长',710,695,18,[255,226,204]);label(c,manager,853,695,19,C.white);
 return c;
}
export async function renderTavernMap(snapshot={},env){const canvas=await renderTavernCanvas(snapshot,env),blob=await encodePNG(canvas);return new Uint8Array(await blob.arrayBuffer());}
const SPECIAL_GIF_COLORS=[[249,229,202],[239,211,179],[116,70,55],[158,100,69],[94,61,62],[135,86,78],[218,133,158],[124,190,198],[65,117,137],[240,185,94],[73,48,48],[55,38,45],[82,55,59],[125,82,75],[255,247,231],[84,130,92],[200,237,232],[255,226,145],[255,249,231]];
const GIF_GLINT=16,GIF_LAMP=17,GIF_STEAM=18;
function paletteFor(pixels){const counts=new Map();for(let p=0;p<pixels.length;p+=3){const key=(pixels[p]<<16)|(pixels[p+1]<<8)|pixels[p+2];counts.set(key,(counts.get(key)||0)+1);}const colors=[],seen=new Set();const add=key=>{if(seen.has(key)||colors.length>=256)return;seen.add(key);colors.push([(key>>16)&255,(key>>8)&255,key&255]);};for(const rgb of SPECIAL_GIF_COLORS)add((rgb[0]<<16)|(rgb[1]<<8)|rgb[2]);for(const [key] of [...counts].sort((a,b)=>b[1]-a[1])){add(key);if(colors.length===256)break;}while(colors.length<256)colors.push([0,0,0]);const lut=new Map();for(const key of counts.keys()){const r=(key>>16)&255,g=(key>>8)&255,b=key&255;let best=0,bestD=Infinity;for(let i=0;i<colors.length;i++){const dr=r-colors[i][0],dg=g-colors[i][1],db=b-colors[i][2],d=2*dr*dr+4*dg*dg+3*db*db;if(d<bestD){bestD=d;best=i;if(d===0)break;}}lut.set(key,best);}const rgb=new Uint8Array(768);colors.forEach((col,i)=>rgb.set(col,i*3));return {lut,rgb};}
function gifFrame(pixels,sourceW,left,top,w,h,phase,hasTea,lut){const idx=new Uint8Array(w*h);for(let i=0;i<idx.length;i++){const x=left+i%w,y=top+Math.floor(i/w),p=(y*sourceW+x)*3,key=(pixels[p]<<16)|(pixels[p+1]<<8)|pixels[p+2];idx[i]=lut.get(key)??0;}if(phase){
 // Sparkle points are selected in canonical world coordinates, then projected into the river.
 for(let i=0;i<15;i++){const wx=35+i*56,wy=-112+(i%3)*15+((phase+i)%3)*2,[sx,sy]=project(wx,wy);for(let dx=0;dx<7;dx++){const x=sx+dx,y=sy+((i+phase)%2),rx=x-left,ry=y-top;if(rx>=0&&ry>=0&&rx<w&&ry<h)idx[ry*w+rx]=GIF_GLINT;}}
 // Small warm pulses at built-in lamps; their geometry stays fixed while brightness shifts.
 for(const [wx,wy] of [[370,110],[585,112],[612,392],[307,399]]){const [sx,sy]=project(wx,wy,42);for(let dx=-2;dx<=2;dx++){const x=sx+dx+((phase%2)?1:-1),y=sy+((dx*dx+phase)%3)-1,rx=x-left,ry=y-top;if(rx>=0&&ry>=0&&rx<w&&ry<h)idx[ry*w+rx]=GIF_LAMP;}}
 if(hasTea){const [sx,sy]=project(765,58);for(let dy=22;dy<=43;dy++){const x=sx+((phase+Math.floor(dy/7))%3)-1,y=sy-dy,rx=x-left,ry=y-top;if(rx>=0&&ry>=0&&rx<w&&ry<h)idx[ry*w+rx]=GIF_STEAM;}}
 }const data=[];let dict,next,size,acc=0,bits=0;const emit=code=>{acc|=code<<bits;bits+=size;while(bits>=8){data.push(acc&255);acc>>>=8;bits-=8;}};const reset=()=>{dict=new Map();next=258;size=9;};reset();emit(256);let prefix=idx[0];for(let i=1;i<idx.length;i++){const k=idx[i],key=(prefix<<8)|k;if(dict.has(key)){prefix=dict.get(key);continue;}emit(prefix);if(next<4096){dict.set(key,next++);if(next===(1<<size)+1&&size<12)size++;}else{emit(256);reset();}prefix=k;}emit(prefix);emit(257);if(bits)data.push(acc&255);const blocks=[];for(let i=0;i<data.length;i+=255)blocks.push(Math.min(255,data.length-i),...data.slice(i,i+255));blocks.push(0);return new Uint8Array(blocks);}
export async function renderTavernScene(snapshot={},options={},env){const c=await renderTavernCanvas(snapshot,env);if(options.animated===false){const b=await encodePNG(c);return {filename:'tavern-scene.png',bytes:new Uint8Array(await b.arrayBuffer()),mime:'image/png'};}const parts=[new TextEncoder().encode('GIF89a')],h=new Uint8Array(7),v=new DataView(h.buffer);v.setUint16(0,W,true);v.setUint16(2,H,true);h.set([0xf7,0,0],4);parts.push(h);const palette=paletteFor(c.pixels);parts.push(palette.rgb,new Uint8Array([0x21,0xff,0x0b,...new TextEncoder().encode('NETSCAPE2.0'),3,1,0,0,0]));const assets=Array.isArray(snapshot?.room?.assets)?snapshot.room.assets:[],hasTea=assets.some(a=>(typeof a.item==='string'?a.item:a.id||a.item?.id)==='tea_station');for(let f=0;f<4;f++){const left=f?260:0,top=f?130:0,fw=f?720:W,fh=f?350:H;parts.push(new Uint8Array([0x21,0xf9,4,0,5,0,0,0,0x2c,left&255,left>>8,top&255,top>>8,fw&255,fw>>8,fh&255,fh>>8,0,8]),gifFrame(c.pixels,W,left,top,fw,fh,f,hasTea,palette.lut));}parts.push(new Uint8Array([0x3b]));const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let off=0;for(const p of parts){bytes.set(p,off);off+=p.length;}if(bytes.length>1_000_000)throw Error('Tavern scene exceeds 1 MB budget');return {filename:'tavern-scene.gif',bytes,mime:'image/gif'};}
