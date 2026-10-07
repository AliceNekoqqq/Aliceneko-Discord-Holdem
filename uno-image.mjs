import { Canvas, encodePNG } from './card-image.mjs';
import { glyphs } from './card-glyphs.mjs';
import {EMOTES,activeEmote} from './uno-social.mjs';
import * as game from './uno-engine.mjs';
import { pageCards, PAGE_SIZE } from './uno-ui.mjs';
const palette={red:[222,77,110],yellow:[239,185,58],green:[57,172,135],blue:[71,135,212]},white=[255,251,246],ink=[27,34,49],pink=[242,173,209];
function line(c,x1,y1,x2,y2,color,width=3){const steps=Math.max(Math.abs(x2-x1),Math.abs(y2-y1));for(let i=0;i<=steps;i++){const x=Math.round(x1+(x2-x1)*i/steps),y=Math.round(y1+(y2-y1)*i/steps);c.rect(x,y,width,width,color);}}
function plus(c,x,y,s,color){c.rect(x-s,y-3,s*2,6,color);c.rect(x-3,y-s,6,s*2,color);}
function butterfly(c,x,y,color){for(let yy=-9;yy<=9;yy++)for(let xx=-13;xx<=13;xx++){if((xx*xx/169+yy*yy/81)<1&&Math.abs(xx)>Math.abs(yy)/3+2)c.pixel(x+xx,y+yy,color);}c.rect(x-1,y-7,2,17,color);}
export function paintCard(c,card,x,y,w=128,h=172,enabled=false){
 const f=game.face(card),base=f.color?palette[f.color]:ink;
 c.rect(x-4,y-4,w+8,h+8,enabled==='jump'?[255,209,102]:enabled?[114,241,176]:[57,66,87],13);c.rect(x,y,w,h,white,10);c.rect(x+4,y+4,w-8,h-8,base,8);
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
export async function renderUnoImage(t,id){
 const {cards,page,pages}=pageCards(t,id),legal=game.legalCards(t,id),jumps=game.jumpCards(t,id),own=t.phase==='active'&&t.turn===id,c=new Canvas(760,100+Math.max(1,Math.ceil(cards.length/5))*203);
 c.rect(16,16,728,64,[37,34,53],14);c.text('你的手牌',34,29,27,pink);c.text('仅你可见',594,31,20,pink);
 c.text(jumps.length?'金框抢出':game.jumpOpen(t)?'抢出等候':own?'绿框可出':'灰框等候',208,34,20,jumps.length?[255,209,102]:own?[114,241,176]:[164,199,218]);c.text(`第 ${page+1}/${pages} 页`,416,34,20,white);
 for(let i=0;i<cards.length;i++){const x=33+i%5*143,y=118+Math.floor(i/5)*203;c.text(String(page*PAGE_SIZE+i+1),x+60,y-27,20,jumps.includes(cards[i])?[255,209,102]:legal.includes(cards[i])?[114,241,176]:pink,true);paintCard(c,cards[i],x,y,120,164,jumps.includes(cards[i])?'jump':legal.includes(cards[i]));}
 return encodePNG(c);
}
function withImage(data,filename){const body=structuredClone(data);body.embeds[0].image={url:`attachment://${filename}`};return body;}
function upload(body,png,filename,description){body.attachments=[{id:0,filename,description}];const form=new FormData();form.set('payload_json',JSON.stringify(body));form.set('files[0]',png,filename);return form;}
export async function imageMessage(t,id,data,existing){
 const p=t.players.find(p=>p.id===id&&!p.bot);if(!p?.cards.length||!data.embeds?.length)return {body:{...data,attachments:[]},signature:null};
 const page=pageCards(t,id),legal=game.legalCards(t,id),jumps=game.jumpCards(t,id),signature=`${t.epoch}/${t.handNo}/${page.page}/${p.cards.join(',')}/${legal.join(',')}/${t.phase==='active'&&t.turn===id}/${jumps.join(',')}/${game.jumpOpen(t)}`,filename=`uno-${t.handNo}-p${page.page+1}.png`,body=withImage(data,filename);
 const compact=()=>{body.embeds[0].fields=body.embeds[0].fields?.filter(f=>f.name!=='手牌文字');};
 if(existing?.signature===signature&&existing.id){compact();body.attachments=[{id:existing.id,filename}];return {body,signature};}
 try{const png=await renderUnoImage(t,id);compact();return {body:upload(body,png,filename,`你的 UNO 手牌第 ${page.page+1} 页，绿框可出，金框可抢出：`+page.cards.map((c,n)=>`${page.page*PAGE_SIZE+n+1}. ${game.cardName(c)}${jumps.includes(c)?'（可抢出）':legal.includes(c)?'（可出）':''}`).join('；')),signature};}
 catch{delete body.embeds[0].image;body.attachments=[];return {body,signature:null};}
}
// A separate public renderer receives only the visible discard card and color.
// Player hands, draw piles and challenge snapshots never reach it.
export async function renderBoardImage(card,color,jumped=false){
 const c=new Canvas(760,264);if(jumped)c.rect(10,10,740,244,[255,209,102],18);c.rect(16,16,728,232,jumped?[55,42,30]:[27,43,54],14);paintCard(c,card,48,39,138,184);
 c.text(jumped?'抢出成功':'桌面公共牌',226,39,28,jumped?[255,209,102]:[164,199,218]);c.text('UNO',226,84,20,pink);
 if(color){c.rect(226,130,30,30,palette[color],8);c.text(`当前${game.COLOR_NAMES[color]}色`,273,129,30,white);}
 else c.text('等候颜色',226,130,30,white);
 c.text('所有人可见',226,198,18,[164,199,218]);return encodePNG(c);
}
// Project only public facts before rendering or caching. No card identities from
// players, draw piles, selected wilds or +4 challenge snapshots enter this model.
export function publicTableSnapshot(t,now=Date.now()){
 const jumping=game.jumpOpen(t,now),active=t.phase==='active';
 return {epoch:t.epoch,hand:t.handNo,phase:t.phase,mode:t.mode,direction:t.direction,
  card:t.discard?.at(-1)??null,color:t.color||null,jumping,
  turn:active?t.turn:null,penalty:active?game.penaltyCount(t):0,
  last:t.lastPlay?{actor:t.lastPlay.actor,jump:!!t.lastPlay.jump}:null,
  social:activeEmote(t,now),
  focus:active&&['draw2','draw4'].includes(t.pending?.kind)?{kind:'penalty',actor:t.pending.offender,target:t.pending.victim,value:game.penaltyCount(t)}:t.lastPlay?.jump?{kind:'jump',actor:t.lastPlay.actor,target:t.lastPlay.from===t.lastPlay.actor?null:t.lastPlay.from,value:0}:null,
  seats:t.players.map((p,i)=>({id:p.id,seat:i+1,name:p.name||`玩家 ${i+1}`,count:p.cards.length,
   team:t.mode==='teams'?i%2:null,owner:p.id===t.owner,bot:!!p.bot,
   winner:t.phase==='settled'&&(t.mode==='teams'?i%2===t.winningTeam:p.id===t.winner)}))};
}
export function seatLayout(count){
 if(!Number.isInteger(count)||count<0||count>10)throw Error('Invalid seat count');
 return Array.from({length:count},(_,i)=>{const angle=-Math.PI/2+i*2*Math.PI/count;
  return {x:Math.round(480+355*Math.cos(angle)),y:Math.round(430+274*Math.sin(angle)),angle};});
}
const gold=[255,209,102],mint=[114,241,176],muted=[164,185,199];
function ellipse(c,cx,cy,rx,ry,color){
 for(let y=Math.ceil(cy-ry);y<=cy+ry;y++){const dx=Math.floor(rx*Math.sqrt(Math.max(0,1-((y-cy)/ry)**2)));c.rect(cx-dx,y,2*dx+1,1,color);}
}
function arrow(c,x,y,angle,color){const a=13;line(c,Math.round(x-Math.cos(angle)*a),Math.round(y-Math.sin(angle)*a),Math.round(x+Math.cos(angle)*a),Math.round(y+Math.sin(angle)*a),color,3);
 for(const side of [-1,1])line(c,Math.round(x+Math.cos(angle)*a),Math.round(y+Math.sin(angle)*a),Math.round(x+Math.cos(angle)*3+Math.cos(angle+side*Math.PI/2)*9),Math.round(y+Math.sin(angle)*3+Math.sin(angle+side*Math.PI/2)*9),color,3);
}
// Nicknames may use any script or emoji. The compact atlas cannot represent all
// of them; retain an unambiguous seat label and the full name in the embed/alt text.
function imageName(seat){const name=[...seat.name].slice(0,11).join('');return [...name].every(ch=>glyphs[ch])?name:`玩家 ${seat.seat}`;}
function fitText(c,text,x,y,size,maxWidth,color,center=false){
 const width=[...text].reduce((n,ch)=>n+glyphs[ch][2]*size/48,0);
 c.text(text,x,y,Math.min(size,size*maxWidth/Math.max(1,width)),color,center);
}
export async function renderTableImage(model){
 const c=new Canvas(960,820),positions=seatLayout(model.seats.length),active=model.phase==='active';
 c.rect(18,18,924,62,[37,34,53],15);c.text('UNO',38,34,29,pink);
 c.text(`第 ${model.hand} 局`,136,35,24,white);if(model.social){const e=EMOTES[model.social.key],a=model.seats.find(s=>s.id===model.social.actor),b=model.seats.find(s=>s.id===model.social.target);if(a&&b)fitText(c,`${a.seat}号对${b.seat}号 ${e.short}`,462,37,21,226,[140,222,237]);}c.text(model.mode==='teams'?'2v2 组队':'公共牌桌',704,35,24,muted);
 ellipse(c,480,430,407,317,[65,82,93]);ellipse(c,480,430,399,309,[17,44,48]);ellipse(c,480,430,386,296,[23,56,58]);
 for(let i=0;i<positions.length;i++){const a=positions[i].angle+Math.PI/Math.max(1,positions.length),x=480+355*Math.cos(a),y=430+274*Math.sin(a);arrow(c,Math.round(x),Math.round(y),a+model.direction*Math.PI/2,muted);}
 const status=model.jumping?'全桌抢出窗口':active?model.penalty?`累计罚牌 +${model.penalty}`:'等待出牌':model.phase==='lobby'?'等待加入发牌':'本局结束';
 c.rect(304,280,352,284,[20,35,46],18);
 fitText(c,status,480,299,25,318,model.jumping?gold:active?mint:pink,true);
 if(model.card!==null){paintCard(c,model.card,330,344,114,158,model.last?.jump?'jump':false);
  c.text(model.last?.jump?'抢出成功':'桌面公共牌',462,352,21,model.last?.jump?gold:muted);
  const who=model.seats.find(s=>s.id===model.last?.actor);
  if(who){fitText(c,`${who.seat}号 ${imageName(who)}`,462,389,20,180,pink);c.text('刚出牌',462,418,18,pink);}
  if(model.color){c.rect(464,457,22,22,palette[model.color],5);c.text(`${game.COLOR_NAMES[model.color]}色`,500,458,21,white);}
 }else{c.text('尚未发牌',480,392,28,muted,true);}
 c.text(model.direction===1?'顺时针':'逆时针',480,530,20,muted,true);
 for(let i=0;i<model.seats.length;i++){
  const s=model.seats[i],{x:cx,y:cy}=positions[i],x=cx-87,y=cy-51,current=active&&model.turn===s.id,
   stroke=s.winner?gold:current?(model.jumping?gold:mint):s.team!==null?palette[s.team===0?'red':'blue']:[72,92,111];
  const reacting=model.social&&(model.social.actor===s.id||model.social.target===s.id);if(reacting)c.rect(x-9,y-9,192,120,[140,222,237],20);
  c.rect(x-5,y-5,184,112,stroke,17);c.rect(x,y,174,102,current?[30,64,59]:[29,39,54],13);
  const title=s.winner?'胜者':current?(model.jumping?'下一位':model.penalty?'处理罚牌':'行动中'):s.owner?'桌主':s.bot?'电脑':s.team===0?'红队':s.team===1?'蓝队':'玩家';
  c.text(String(s.seat),x+12,y+10,22,stroke);c.text(title,x+48,y+12,18,current||s.winner?stroke:muted);
  fitText(c,imageName(s),cx,y+39,22,150,white,true);
  c.text(model.phase==='lobby'?'等待':`${s.count} 张${s.count===1?' UNO':''}`,cx,y+73,19,s.count===1?gold:muted,true);
  if(reacting){paintReaction(c,cx+62,y+20,EMOTES[model.social.key].tone,model.social.target===s.id);}
  if(model.focus?.actor===s.id||model.focus?.target===s.id){const receiving=model.focus.target===s.id;c.rect(x+10,y-27,154,23,receiving?[96,64,42]:[79,43,67],7);fitText(c,model.focus.kind==='penalty'?receiving?`接力累计 +${model.focus.value}`:'反手加码':receiving?'回合被抢走':'抢出成功',cx,y-24,17,145,receiving?gold:pink,true);}
  if(s.team!==null)c.rect(x+153,y+12,9,17,palette[s.team===0?'red':'blue'],3);
  if(model.last?.actor===s.id)c.rect(x+15,y+101,144,5,model.last.jump?gold:pink,2);
 }
 c.text('绿框行动 / 金框下一位或胜者 / 粉条刚出牌',480,764,19,muted,true);
 c.text('座位固定 / 玩家姓名见座次 / 箭头为出牌方向',480,790,17,muted,true);
 return encodePNG(c);
}
export async function boardImageMessage(t,data,existing){
 if(t.phase==='closed'||!t.players?.length)return {body:{...data,attachments:[]},signature:null};
 const model=publicTableSnapshot(t),signature=JSON.stringify(model),filename='uno-table.png',body=withImage(data,filename);
 if(existing?.signature===signature&&existing.id){body.attachments=[{id:existing.id,filename}];return {body,signature};}
 const seats=model.seats.map(s=>`${s.seat}号 ${s.name}，${s.count}张${model.turn===s.id?model.jumping?'，抢出后下一位':'，当前行动者':''}${s.team!==null?`，${s.team===0?'红':'蓝'}队`:''}`).join('；');
 const reaction=model.social?`互动：${model.seats.find(s=>s.id===model.social.actor)?.name}对${model.seats.find(s=>s.id===model.social.target)?.name}说${EMOTES[model.social.key].emoji}${EMOTES[model.social.key].text}。`:'';
 const alt=`${reaction}UNO 座次：${seats}。${model.direction===1?'顺':'逆'}时针；${model.jumping?'全桌抢出窗口；':''}${model.card!==null?`公共牌 ${game.cardName(model.card)}，当前${game.COLOR_NAMES[model.color]||'待选'}色。`:''}`;
 try{return {body:upload(body,await renderTableImage(model),filename,alt.slice(0,1024)),signature};}
 catch{delete body.embeds[0].image;body.attachments=[];return {body,signature:null};}
}

// Small native bitmap reaction badges avoid runtime fonts or external image requests.
function paintReaction(c,x,y,tone,receiving){
 ellipse(c,x,y,16,16,receiving?[140,222,237]:[255,209,102]);
 const dark=[27,34,49];if(tone==='watch'){ellipse(c,x-6,y,5,7,white);ellipse(c,x+6,y,5,7,white);c.rect(x-4,y-1,3,4,dark);c.rect(x+8,y-1,3,4,dark);return;}
 if(tone==='next'){arrow(c,x-1,y,0,dark);return;}
 c.rect(x-8,y-5,4,3,dark);c.rect(x+5,y-5,4,3,dark);
 if(tone==='attack'){line(c,x-7,y+5,x+7,y+2,dark,2);}else{line(c,x-7,y+3,x-3,y+7,dark,2);line(c,x-3,y+7,x+3,y+7,dark,2);line(c,x+3,y+7,x+7,y+3,dark,2);}
 if(tone==='thanks'){c.rect(x-11,y+1,4,3,pink);c.rect(x+9,y+1,4,3,pink);}
 if(tone==='clap'){c.rect(x-19,y-9,2,7,white);c.rect(x+19,y-9,2,7,white);}
}
