import {Canvas,encodePNG,textWidth} from './card-image.mjs';
import {prepareNicknameFont} from './nickname-font.mjs';
import {emojiBitmap,paintEmoji} from './emoji-art.mjs';
import {avatarKey,ACCENTS,normalizedProfile} from './uno-profile.mjs';
import {name,rank} from './liar-engine.mjs';
import {wearsCrown} from './liar-ui.mjs';
const C={bg:[24,17,26],wood:[57,32,39],table:[58,39,47],rose:[215,145,164],gold:[236,195,119],white:[250,237,223],muted:[168,149,151],green:[129,202,160],red:[224,111,114]};
const text=(c,s,x,y,size=24,color=C.white,center=false)=>c.text(s,x,y,size,color,center);
const labels='骗子酒馆卡牌模式等待开局第轮桌牌声称盖下张质疑翻牌轮盘转动安全出局重新发牌最后的酒客获胜你的手牌仅自己可见真牌可用来撒谎等待其他玩家点击下方选择牌盖下准备已准备未准备次下次风险本轮手牌已出完自动更新Joker万能 / / ：';
function circle(c,x,y,r,color){for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r)c.pixel(x+dx,y+dy,color);}
function card(c,value,x,y,w=88,h=120,truth=null){
 c.rect(x+3,y+4,w,h,[12,9,15],9);c.rect(x,y,w,h,truth===true?C.green:truth===false?C.red:C.gold,9);c.rect(x+3,y+3,w-6,h-6,value==null?C.wood:C.white,7);
 if(value==null){c.rect(x+12,y+12,w-24,h-24,C.rose,5);c.rect(x+14,y+14,w-28,h-28,C.wood,4);text(c,'?',x+w/2,y+h/2-21,38,C.rose,true);}
 else {const label=rank(value);text(c,label==='JOKER'?'J':label,x+9,y+7,22,C.wood);text(c,label==='JOKER'?'WILD':label,x+w/2,y+h/2-25,label==='JOKER'?24:46,C.wood,true);}
}
// Explicit projection: do not include hidden cards, chamber positions or stock.
export function publicSnapshot(t){return {epoch:t.epoch,phase:t.phase,handNo:t.handNo,tableRank:t.tableRank,turn:t.turn,winner:t.winner,forced:!!t.forced,pending:t.pending?{actor:t.pending.actor,count:t.pending.count}:null,reveal:t.reveal?{cards:t.reveal.cards,honest:t.reveal.honest,loser:t.reveal.loser,resolved:t.reveal.resolved,dead:t.reveal.dead,forfeit:!!t.reveal.forfeit}:null,seats:t.players.map(p=>({id:p.id,name:name(p),bot:!!p.bot,count:p.cards.length,alive:p.alive,shots:p.shots,ready:!!p.ready,avatar:avatarKey(p),accent:normalizedProfile(p).accent,crown:wearsCrown(t,p)}))};}
export async function renderBoard(t){
 const m=publicSnapshot(t);await prepareNicknameFont([...labels.match(/.{1,40}/gu),'隐藏出牌 / 识破谎言 / 存活到底','点击我的手牌',...m.seats.map(p=>p.name)]);const c=new Canvas(900,640);c.rect(0,0,900,640,C.bg);
 // Bar shelves and warm wall lamps frame the playing area.
 for(let x=38;x<875;x+=62){c.rect(x,35,24,57,[70+x%31,43,48],5);c.rect(x+7,22,10,17,C.gold,3);}c.rect(25,95,850,10,C.wood);c.rect(20,124,860,480,C.wood,28);c.rect(34,138,832,452,C.table,24);
 text(c,'骗子酒馆',450,23,38,C.gold,true);text(c,'LIAR’S DECK',450,76,20,C.rose,true);
 for(let n=0;n<m.seats.length;n++){
  const p=m.seats[n],x=n%2?615:50,y=n<2?164:383,highlight=p.id===m.winner?C.gold:p.id===m.turn?C.green:p.crown?C.gold:ACCENTS[p.accent].color;
  c.rect(x,y,235,185,highlight,16);c.rect(x+3,y+3,229,179,p.alive?C.bg:[39,30,34],14);paintEmoji(c,await emojiBitmap(p.avatar),x+12,y+14,42);
  const title=[...p.name].slice(0,10).join('');text(c,title,x+62,y+19,Math.min(23,155/textWidth(title,1)),p.alive?C.white:C.muted);if(p.crown)text(c,'★',x+32,y-9,23,C.gold,true);
  const status=['lobby','settled'].includes(m.phase)?p.ready||p.bot?'已准备':'未准备':p.alive?`${p.count} 张手牌`:'已出局';text(c,status,x+118,y+71,24,p.alive?C.rose:C.muted,true);
  for(let k=0;k<6;k++){circle(c,x+32+k*34,y+126,11,k<p.shots?p.alive||k<p.shots-1?C.green:C.red:[94,70,76]);}
  text(c,p.alive?`轮盘 ${p.shots} 次 / 1/${6-p.shots}`:'OUT',x+118,y+151,19,p.alive?C.muted:C.red,true);
 }
 const stage=m.phase==='lobby'?'等待开局':m.phase==='active'?`第${m.handNo}轮 / ${m.tableRank}桌`:m.phase==='roulette'?'轮盘转动':m.phase==='intermission'?'重新发牌':m.phase==='settled'?'最后的酒客':'已结束';text(c,stage,450,157,25,C.gold,true);
 const target=m.tableRank==='A'?0:m.tableRank==='K'?6:12;if(m.tableRank)card(c,target,397,213,106,145);
 if(m.pending){for(let k=0;k<m.pending.count;k++)card(c,null,368+k*54,397,62,86);text(c,`声称 ${m.pending.count} 张${m.tableRank}`,450,502,23,C.rose,true);}
 else if(m.reveal?.cards?.length){for(let k=0;k<m.reveal.cards.length;k++)card(c,m.reveal.cards[k],348+k*73,395,65,90,rank(m.reveal.cards[k])===m.tableRank||rank(m.reveal.cards[k])==='JOKER');text(c,m.reveal.resolved?m.reveal.dead?'出局':'安全':m.reveal.honest?'质疑失败':'质疑成功',450,509,24,m.reveal.dead?C.red:C.gold,true);}
 else if(m.winner){const winner=m.seats.find(p=>p.id===m.winner);text(c,[...winner.name].slice(0,10).join(''),450,414,Math.min(26,232/textWidth(winner.name,1)),C.gold,true);text(c,'获胜',450,461,28,C.gold,true);}
 else text(c,'点击我的手牌',450,441,24,C.muted,true);
 text(c,'隐藏出牌 / 识破谎言 / 存活到底',450,609,20,C.muted,true);return encodePNG(c);
}
export async function renderHand(t,id){
 const p=t.players.find(p=>p.id===id);if(!p)return null;await prepareNicknameFont([...labels.match(/.{1,40}/gu),name(p),'隐藏出牌 / 识破谎言 / 存活到底']);const c=new Canvas(900,420);c.rect(0,0,900,420,C.bg);c.rect(20,20,860,380,C.wood,22);
 text(c,`你的手牌 / ${t.tableRank||'等待'}${t.tableRank?'桌':''}`,450,35,30,C.gold,true);text(c,'Joker万能 / 仅自己可见',450,80,21,C.rose,true);
 const n=p.cards.length,step=150,start=(900-n*step)/2;for(let k=0;k<n;k++){const truth=rank(p.cards[k])===t.tableRank||rank(p.cards[k])==='JOKER';card(c,p.cards[k],Math.round(start+k*step+10),130,130,178,truth);text(c,String(k+1),Math.round(start+k*step+75),322,26,C.white,true);text(c,truth?'真牌':'可撒谎',Math.round(start+k*step+75),357,20,truth?C.green:C.rose,true);}
 if(!n)text(c,p.alive?'本轮手牌已出完':'你已出局',450,211,30,C.muted,true);return encodePNG(c);
}
function upload(data,png,filename,description){const body=structuredClone(data);body.embeds[0].image={url:`attachment://${filename}`};body.attachments=[{id:0,filename,description}];const form=new FormData();form.set('payload_json',JSON.stringify(body));form.set('files[0]',png,filename);return form;}
async function prepare(data,signature,filename,existing,render,description){
 if(existing?.signature===signature&&existing.id){const body=structuredClone(data);body.embeds[0].image={url:`attachment://${filename}`};body.attachments=[{id:existing.id,filename}];return {body,signature};}
 try{return {body:upload(data,await render(),filename,description),signature};}catch{return {body:{...data,attachments:[]},signature:null};}
}
export async function boardImageMessage(t,data,existing){if(t.phase==='closed')return {body:{...data,attachments:[]},signature:null};return prepare(data,'liar-board-v1/'+JSON.stringify(publicSnapshot(t)),'liar-table.png',existing,()=>renderBoard(t),'骗子酒馆公开牌桌：座位、手牌数量、轮盘次数、已质疑翻牌；未质疑牌面和危险位保密。');}
export async function imageMessage(t,id,data,existing){const p=t.players.find(p=>p.id===id);if(!p||!data.embeds?.length||!data.components?.some(r=>r.components.some(b=>b.custom_id?.includes(`p~${id}~`))))return {body:{...data,attachments:[]},signature:null};return prepare(data,'liar-hand-v1/'+JSON.stringify([t.epoch,t.handNo,t.tableRank,p.cards,p.alive]),'liar-hand.png',existing,()=>renderHand(t,id),`仅你的牌面：${p.cards.map(rank).join(' / ')}。编号对应私密多选菜单，可选1～3张盖下。`);}
