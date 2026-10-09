import {Canvas,encodePNG} from './card-image.mjs';
import {prepareNicknameFont} from './nickname-font.mjs';

const W=1000,H=760;
const C={wall:[87,57,64],wall2:[111,74,76],wood:[151,91,67],wood2:[187,127,88],floor:[247,225,201],floor2:[241,212,187],pink:[218,133,158],pale:[255,246,233],ink:[79,55,55],muted:[130,93,87],green:[104,145,107],water:[143,201,206],lamp:[255,202,111],bot:[165,144,178],white:[255,255,250],table:[121,75,71]};
const rounded=(c,x,y,w,h,r,color)=>c.rect(x,y,w,h,color,r);
const label=(c,s,x,y,n=17,color=C.ink,center=false)=>c.text(s,x,y,n,color,center);
const safe=(value,max=18)=>[...String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim()].slice(0,max).join('')||'来客';
const roomName=s=>safe(s?.room?.name||'小酒馆',22);
const gameName={poker:'德州',uno:'UNO',ghost:'抽鬼牌',liar:'骗子酒馆'};
const phaseName={lobby:'等候中',waiting:'等候中',active:'游戏中',playing:'游戏中',in_progress:'游戏中',settled:'已结束',finished:'已结束',closed:'已结束'};
const timeCN=at=>{const d=new Date(at);if(!Number.isFinite(d.getTime()))return '未知时间';const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);return `${parts.find(p=>p.type==='hour')?.value}时${parts.find(p=>p.type==='minute')?.value}分`;};

function drawPlant(c,x,y){c.rect(x+12,y+23,18,23,[183,118,83],5);for(const [dx,dy,col] of [[0,10,[93,139,103]],[19,0,[116,159,109]],[35,13,[83,128,96]]])c.rect(x+dx,y+dy,15,18,col,8);}
function drawLamp(c,x,y){c.rect(x-2,y,4,18,C.wood);c.rect(x-11,y+15,22,5,C.wood,2);c.rect(x-13,y-6,26,16,C.lamp,8);}
function ambience(at){const d=new Date(at);if(!Number.isFinite(d.getTime()))return {word:'暖灯相伴',night:false};const h=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(d));return h>=6&&h<17?{word:'河光正好',night:false}:h>=17&&h<20?{word:'暮色渐浓',night:false}:{word:'星月河窗',night:true};}
function drawChip(c,x,y,name,bot=false){c.rect(x-25,y-25,50,50,bot?C.bot:C.pink,25);c.rect(x-20,y-20,40,40,bot?C.pale:C.white,20);c.rect(x-3,y-18,6,6,bot?C.bot:C.pink,3);c.rect(x-3,y+12,6,6,bot?C.bot:C.pink,3);label(c,safe(name,7),x,y-6,12,C.ink,true);if(bot){c.rect(x+12,y+12,24,12,C.bot,6);label(c,'电脑',x+24,y+13,8,C.white,true);}}

function drawTable(c,table,x,y,index){
 c.rect(x-74,y-39,148,78,C.table,35);c.rect(x-69,y-34,138,68,[141,93,77],30);label(c,gameName[table.game]||'游戏',x,y-8,table.game==='liar'?12:14,C.white,true);
 const players=Array.isArray(table.players)?table.players.slice(0,8):[];const spots=[[0,-49],[54,-35],[76,0],[54,35],[0,49],[-54,35],[-76,0],[-54,-35]];
 players.forEach((p,i)=>drawChip(c,x+spots[i][0],y+spots[i][1],p.name,p.bot));
 label(c,phaseName[table.phase]||'开放中',x,y+24,11,[255,232,208],true);
}

export async function renderTavernMap(snapshot={}){
 const s=snapshot&&typeof snapshot==='object'?snapshot:{};
 const tables=Array.isArray(s.tables)?s.tables:[],visitors=Array.isArray(s.visitors)?s.visitors:[];
 const seatsSeen=new Set();const tablePeople=[];
 for(const t of tables.slice(0,4))for(const p of Array.isArray(t?.players)?t.players:[]){const key=String(p?.id??`anon-${tablePeople.length}`);if(seatsSeen.has(key))continue;seatsSeen.add(key);tablePeople.push({id:key,name:safe(p?.name),bot:!!p?.bot});}
 const seen=new Set(seatsSeen),guests=[];
 for(const p of visitors){const key=String(p?.id??'');if(!key||seen.has(key))continue;seen.add(key);guests.push({id:key,name:safe(p?.name),kind:p?.kind});}
 const realCount=Math.max(0,Number.isFinite(Number(s.visitorCount))?Math.floor(Number(s.visitorCount)):guests.length);
 const mood=ambience(s.at),crowd=realCount===0?'安静打烊':realCount<=3?'三三两两':realCount<=8?'热闹聊天':'满屋话声';
 const assetNames=Array.isArray(s.room?.assets)?s.room.assets.map(a=>String(a?.name||'')):[];
 const hasSofa=assetNames.some(n=>/沙发|sofa/i.test(n));
 const names=[roomName(s),safe(s.operations?.manager?.name||'暂无',12),...tablePeople.map(p=>p.name),...guests.map(p=>p.name),'河畔窗边','吧台','窗边','公共客厅','游戏区','入口','德州','抽鬼牌','骗子酒馆','游戏','等候中','游戏中','已结束','开放中','最近30分钟来客','席位示意','来客','游戏桌','订单','今日店长','暂无','电脑','另有','位来客','桌','暖灯相伴','河光正好','暮色渐浓','星月河窗','安静打烊','三三两两','热闹聊天','满屋话声','北京时间','点单','热茶','红豆粉','未知时间','时','分','装饰','Lv',...assetNames];
 await prepareNicknameFont(names);
 const c=new Canvas(W,H);
 // Warm, quiet base room. Walls and common fixtures are part of the base tavern.
 c.rect(0,0,W,H,C.wall);rounded(c,16,16,968,728,24,C.wall2);rounded(c,35,35,930,690,14,C.floor);
 for(let y=42;y<720;y+=56)c.rect(39,y,922,2,C.floor2);
 for(let x=48;x<950;x+=68)c.rect(x,42,2,680,C.floor2);
 // Window and river along the upper-left wall.
 rounded(c,51,49,255,113,12,[229,190,155]);rounded(c,58,56,241,99,8,C.water);c.rect(177,56,4,99,[233,224,205]);c.rect(58,104,241,3,[233,224,205]);
 if(mood.night){c.rect(58,56,241,48,[47,72,104]);c.rect(86,72,4,4,[255,244,195],2);c.rect(138,84,4,4,[255,244,195],2);c.rect(249,67,4,4,[255,244,195],2);c.rect(263,72,10,10,[255,237,185],5);}
 for(let i=0;i<5;i++)c.rect(67+i*48,68+(i%2)*13,25,4,[179,225,218],2);
 label(c,'河畔窗边',180,169,13,C.muted,true);
 // Bar counter and service area.
 rounded(c,690,46,263,156,12,[233,206,179]);label(c,'吧台',821,56,19,C.ink,true);
 rounded(c,714,91,216,67,12,C.wood);rounded(c,720,96,204,54,9,C.wood2);c.rect(728,163,188,15,[117,71,61],5);rounded(c,778,67,86,19,8,[255,230,205]);label(c,'红豆粉',821,70,10,C.ink,true);
 if(assetNames.length){const a=s.room.assets[0];rounded(c,778,190,175,22,8,[236,214,190]);label(c,`装饰 ${safe(a.name,8)} ${a.level?`Lv${a.level}`:''}`,865,194,10,C.ink,true);}
 for(let i=0;i<4;i++){c.rect(739+i*48,172,30,18,[201,158,119],7);c.rect(748+i*48,184,12,12,C.wood,3);}
 // Public areas have simple shared seating; purchased sofa artwork appears only if owned.
 rounded(c,320,55,345,133,15,[250,236,218]);label(c,'窗边',492,72,16,C.muted,true);rounded(c,360,102,265,50,22,[202,158,138]);c.rect(389,157,206,8,C.wood,4);
 rounded(c,56,226,330,235,17,[250,236,218]);label(c,'公共客厅',221,238,18,C.muted,true);
 if(hasSofa){rounded(c,109,301,225,91,31,[210,151,151]);rounded(c,123,311,196,39,18,[228,181,174]);}
 else {c.rect(105,328,214,17,C.wood,5);c.rect(117,345,8,27,C.wood,3);c.rect(299,345,8,27,C.wood,3);c.rect(172,393,92,11,C.wood2,4);c.rect(180,404,6,21,C.wood,2);c.rect(250,404,6,21,C.wood,2);}
 rounded(c,410,222,557,458,18,[250,236,218]);label(c,'游戏区',688,234,16,C.muted,true);
 // Main doorway.
 rounded(c,53,629,119,83,8,[225,197,169]);rounded(c,72,624,82,90,30,C.wood);rounded(c,81,635,64,79,25,[210,160,116]);c.rect(128,670,5,5,C.lamp,3);label(c,'入口',112,709,13,C.muted,true);
 drawPlant(c,304,214);drawPlant(c,923,624);drawLamp(c,407,204);drawLamp(c,674,204);drawLamp(c,620,640);
 // Tea service is a small room detail, not a purchased fixture or NPC.
 c.rect(871,121,16,4,[255,230,205],2);c.rect(873,111,12,12,[245,220,184],5);c.rect(885,114,6,7,[245,220,184],3);c.rect(875,106,8,5,C.wood,2);
 c.rect(890,124,10,9,[255,244,226],3);c.rect(892,132,6,3,C.wood,2);
 // Real game participants get their table first. A lone real player remains lone.
 const placements=[[511,337],[816,337],[511,520],[816,520]];
 tables.slice(0,4).forEach((t,i)=>drawTable(c,t||{},placements[i][0],placements[i][1],i));
 if(tables.length>4){const remaining=tables.length-4;rounded(c,589,608,151,36,14,[237,211,187]);label(c,`另有 ${remaining} 桌`,664,618,14,C.ink,true);}
 // Show a bounded, deterministic scatter of remaining actual visitors only.
 const spots=[[88,275],[183,275],[289,275],[88,433],[183,433],[289,433],[438,610],[535,610],[884,610],[893,466],[437,466],[535,610],[884,275],[887,535],[441,535],[534,275],[80,535],[305,535],[940,535],[441,608],[890,608],[343,608],[538,466],[940,608]];
 const max=spots.length,shown=guests.slice(0,max);
 shown.forEach((p,i)=>{const [x,y]=spots[i];if(p.kind==='order'&&x>690&&x<950&&y<220)return;drawChip(c,x,y,p.name,false);});
 const overflow=Math.max(0,guests.length-shown.length);
 if(overflow){rounded(c,62,576,152,36,13,[255,246,233]);label(c,`另有 ${overflow} 位来客`,138,586,13,C.ink,true);}
 // Header is printed last for consistent visual hierarchy.
 rounded(c,24,22,952,46,14,[92,58,61]);label(c,roomName(s),46,34,21,[255,242,226]);label(c,`${timeCN(s.at)} 北京时间`,904,37,13,[255,225,207],true);
 rounded(c,23,682,954,59,15,[92,58,61]);
 const manager=s.operations?.manager?.name?safe(s.operations.manager.name,12):'暂无';
 label(c,'最近30分钟来客  席位示意',42,692,14,[255,226,207]);label(c,`${mood.word}  ${crowd}`,830,692,12,[255,226,207],true);
 label(c,`来客 ${realCount}`,42,716,13,C.white);label(c,`游戏桌 ${Math.max(0,Number(s.tableCount)||0)}`,217,716,13,C.white);
 label(c,`订单 ${Math.max(0,Number(s.recentOrders?.orderCount)||0)}`,406,716,13,C.white);label(c,`今日店长 ${manager}`,579,716,13,C.white);
 const blob=await encodePNG(c);return new Uint8Array(await blob.arrayBuffer());
}
