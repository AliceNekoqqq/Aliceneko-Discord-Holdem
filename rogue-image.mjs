import { Canvas, encodePNG } from './card-image.mjs';
import { prepareNicknameFont } from './nickname-font.mjs';
import { PROFESSIONS } from './rogue-content-v08.mjs';
import { getCatalog } from './rogue-content-v08.mjs';
import { legalCards } from './rogue-battle.mjs';
import { cardGroups, cardEffectLines, cardWarnings, unavailableReason, battleHints } from './rogue-card-guide.mjs';
import { glyphs } from './card-glyphs.mjs';

const W=960, H=800;
const UI_GLYPHS=[...new Set([...'灯下迷城全程路线当前幕第站遭遇精英奇遇商铺营地未知当前位置已完成当前可选未抵达暂不可选敌方迎战旅人回合第一阶段第二阶段意图生命护盾护甲灼烧屏障能量出牌手牌可出牌当前不可用已强化抽牌弃牌灯狐锻值等待行动技巧牌路径仅标记已选路线·×…：/'] )];
const K={bg:[13,25,43],panel:[23,43,65],panel2:[30,54,77],line:[67,97,119],cream:[250,238,210],muted:[163,187,198],gold:[242,190,91],gold2:[255,218,137],blue:[61,125,160],green:[90,170,122],gray:[91,110,124],red:[202,91,82],white:[255,250,235],ink:[18,34,50]};
const WOOD=[91,58,43],WOOD_DARK=[57,39,34],WOOD_GOLD=[161,112,66];
const rect=(c,x,y,w,h,col,r=0)=>c.rect(Math.round(x),Math.round(y),Math.round(w),Math.round(h),col,r);
function circle(c,x,y,r,col){x=Math.round(x);y=Math.round(y);r=Math.round(r);for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++)if(xx*xx+yy*yy<=r*r)c.pixel(x+xx,y+yy,col);}
function line(c,x1,y1,x2,y2,col,width=3){const n=Math.max(1,Math.ceil(Math.hypot(x2-x1,y2-y1)));for(let i=0;i<=n;i++){const x=Math.round(x1+(x2-x1)*i/n),y=Math.round(y1+(y2-y1)*i/n);rect(c,x-width/2,y-width/2,width,width,col);}}
const PUNCTUATION=new Map([['，',' '],['。','.'],['；',' / '],['：',' '],['、',' / '],['（',' '],['）',' '],['·',' '],['×','x'],['→',' '],['≤','至多'],['与','和']]);
const rawImageText=value=>[...String(value??'')].map(ch=>PUNCTUATION.get(ch)??ch).join('').replace(/\s+/g,' ').trim();
export function normalizeRogueImageText(value){return [...rawImageText(value)].filter(ch=>glyphs[ch]).join('');}
function text(c,s,x,y,size,color=K.cream,center=false){c.text(normalizeRogueImageText(s),Math.round(x),Math.round(y),size,color,center);}
function short(s,n=9){const a=[...String(s??'')];return a.length>n?a.slice(0,n-1).join('')+'…':a.join('');}
function pct(hp,max){return max>0?Math.max(0,Math.min(1,hp/max)):0;}
function bar(c,x,y,w,h,value,max,color){rect(c,x,y,w,h,[10,21,34],4);rect(c,x,y,Math.round(w*pct(value,max)),h,color,4);}
function title(c,kicker,main,meta=''){text(c,kicker.toUpperCase(),34,23,17,K.gold);text(c,main,34,49,34,K.cream);if(meta)text(c,meta,670,59,17,K.muted,false);rect(c,32,91,896,2,K.line);}
function labelType(node){return ({normal:'遭遇',elite:'精英',event:'奇遇',shop:'商铺',camp:'营地',boss:'Boss'})[node.type]??'未知';}
function getName(node,catalog){return node?.title||catalog.enemies[node?.enemyId]?.name||catalog.events?.find(e=>e.eventId===node?.eventId)?.title||labelType(node);}
function routeModel(run,act,catalog){
 const plan=Array.isArray(run?.mapPlan)?run.mapPlan.find(p=>p.act===act):null;
 if(!plan){const visible=run?.act===act&&run?.room?.type==='route'&&Array.isArray(run.room.nodes)?run.room.nodes.map(n=>{const allowed=n.available===true&&(!Array.isArray(run.room.choices)||run.room.choices.includes(n.id));return {id:n.id,type:n.type,name:short(getName(n,catalog),8),status:allowed?'available':'future',disabled:!allowed};}):[];return {act,name:catalog.acts?.[act-1]?.name||`第 ${act} 幕`,known:false,visible};}
 const path=(run.path||[]).filter(p=>p.act===act),selected=new Map(path.map(p=>[p.nodeId,p.slot]));
 const live=run.act===act&&run.phase==='ROUTE'&&run.room?.type==='route'?new Map((run.room.nodes||[]).map(n=>[n.id,n])):new Map();
 const columns=(plan.nodes||[]).map((nodes,i)=>(nodes||[]).map((base,j)=>{
  const node=live.get(base.id)||base,station=(act-1)*5+i,done=run.completed>station,chosen=selected.has(base.id),current=chosen&&!done,choiceAllowed=!Array.isArray(run.room?.choices)||run.room.choices.includes(base.id),available=live.has(base.id)&&node.available===true&&choiceAllowed;
  return {id:base.id,type:base.type,name:short(getName(base,catalog),8),status:chosen&&done?'completed':current?'current':available?'available':'future',chosen,disabled:live.has(base.id)&&(!choiceAllowed||node.available===false)};
 }));
 const bossId=plan.bossId||run.bosses?.[act-1];
 const bossChosen=selected.has(`a${act}s5boss`),bossDone=run.completed>=(act-1)*5+5;
 const boss={id:`a${act}s5boss`,type:'boss',name:short(catalog.enemies[bossId]?.name||'Boss',8),status:bossChosen&&bossDone?'completed':bossChosen?'current':'future'};
 return {act,name:catalog.acts?.[act-1]?.name||`第 ${act} 幕`,known:true,columns,boss};
}
export function describeRogueImage(run,view='auto'){
 const mode=view==='auto'?(run?.phase==='BATTLE'&&run?.battle?'battle':'map'):view;
 if(mode==='battle'){
  const b=run?.battle||{},catalog=getCatalog(run?.catalogVersion||run?.ruleVersion),profession=catalog.professions?.[b.professionId||run?.professionId]||PROFESSIONS[b.professionId||run?.professionId],enemy=catalog.enemies[b.enemyId];
  const playable=new Set(Array.isArray(b?.hand)?legalCards(b).map(e=>e.uid):[]);
  const playLimit=catalog.player?.playLimit,cards=(b?.hand||[]).map(e=>{const def=cardDefinition(e,catalog),groups=cardGroups(def),effects=cardEffectLines(def),warnings=cardWarnings(e,def,b.hp);return {id:e.uid,name:catalog.cards[e.cardId]?.name||e.cardId,cost:def.cost??0,playable:playable.has(e.uid),categories:groups.map(g=>({label:g.label,color:[...g.color]})),effects,warnings,reason:unavailableReason(b,def,playLimit,playable,e.uid)};});
  return {mode:'battle',act:run?.act??1,turn:b?.turn??0,playLimit,profession:profession?.name||'旅人',enemy:enemy?.name||b?.enemyId||'敌人',intent:b.intent,cards,hints:battleHints(b,cards.map(e=>cardDefinition((b.hand||[]).find(h=>h.uid===e.id)||{},catalog)),playLimit),enemyHp:b?.enemyHp??0,enemyMaxHp:b?.enemyMaxHp??0,playerHp:b?.hp??run?.hp??0,playerMaxHp:b?.maxHp??0};
 }
 const all=mode==='all'||mode==='overview';
 const catalog=getCatalog(run?.catalogVersion||run?.ruleVersion);
 return {mode:'map',act:run?.act??1,phase:run?.phase??'ROUTE',acts:(all?[1,2,3]:[run?.act??1]).map(a=>routeModel(run,a,catalog))};
}
function nodeColor(status){return status==='completed'?K.green:status==='available'||status==='current'?K.gold:K.gray;}
function node(c,n,x,y,w=142,h=83){const col=nodeColor(n.status);rect(c,x,y,w,h,n.status==='future'?[29,46,62]:K.panel2,10);rect(c,x,y,w,4,col,4);if(h<50){text(c,n.name,x+w/2,y+9,15,n.status==='future'?K.muted:K.cream,true);return;}circle(c,x+17,y+21,6,col);text(c,n.status==='current'?'当前位置':labelType(n),x+30,y+13,15,n.status==='future'?K.muted:K.gold2);text(c,n.name,x+w/2,y+39,19,n.status==='future'?K.muted:K.cream,true);if(n.disabled)text(c,'暂不可选',x+w/2,y+62,13,K.muted,true);}
async function mapImage(run,view){
 const model=describeRogueImage(run,view),all=model.acts.length===3;
 const names=['灯下迷城','三幕行程','路线节点只表示走过明确记录的选择','已完成','当前可选','未抵达','第 1 站','第 2 站','第 3 站','第 4 站','Boss','暂不可选','旧存档未保存地图；当前没有可见路线选项。','当前路线选项','路径仅标记已选路线',String(run?.phase||''),String(run?.hp??'—')+' HP',...model.acts.flatMap(a=>[a.name,...(a.columns||[]).flatMap(col=>col.map(n=>n.name)),...(a.visible||[]).map(n=>n.name),a.boss?.name||''])];await prepGlyphs([...names,...UI_GLYPHS]);
 const c=new Canvas(W,H);rect(c,0,0,W,H,K.bg);
 // Quiet lantern glow and skyline marks frame the route board.
 circle(c,862,59,22,[60,74,83]);circle(c,862,59,12,K.gold);circle(c,868,54,10,K.bg);
 title(c,all?'灯下迷城 · 全程路线':'灯下迷城 · 当前幕',all?'三幕行程':`第 ${model.act} 幕 · ${model.acts[0]?.name||'城中'}`,`${run?.phase||''}  ·  ${run?.hp??'—'} HP`);
 const acts=all?model.acts:model.acts;const top=all?119:126,actH=all?190:486;
 for(let ai=0;ai<acts.length;ai++){
  const a=acts[ai],y=top+ai*(actH+13);rect(c,25,y,910,actH,K.panel,14);text(c,`ACT ${a.act}`,45,y+15,15,K.gold);text(c,a.name,111,y+12,21,K.cream);
  if(!a.known){
   if(a.visible?.length){text(c,'当前路线选项',48,y+55,16,K.gold);const w=Math.min(190,Math.floor(850/a.visible.length)),gap=12,start=55;for(let i=0;i<a.visible.length;i++)node(c,a.visible[i],start+i*(w+gap),y+103,w,83);}
   else text(c,'旧存档未保存地图；当前没有可见路线选项。',55,y+90,22,K.muted);
   continue;
  }
  const x0=49, colGap=174, cardW=142, nodeY=(col,row)=>y+(all?56:76)+row*(all?40:104);
  // Muted links show the option stages; colored links are only recorded choices.
  for(let col=0;col<4;col++){
   const prev=a.columns[col]||[],next=col===3?[a.boss]:(a.columns[col+1]||[]);
   for(let row=0;row<prev.length;row++)for(let nr=0;nr<next.length;nr++){
    const toRow=col===3?0:nr,fromX=x0+col*colGap+cardW,fromY=nodeY(col,row)+(all?17:39),toX=x0+(col+1)*colGap,toY=nodeY(col+1,toRow)+(all?17:39);
    line(c,fromX,fromY,toX,toY,[48,70,88],2);
   }
  }
  const recorded=(run.path||[]).filter(p=>p.act===a.act).sort((u,v)=>(u.slot??0)-(v.slot??0));
  const pos=new Map();for(let col=0;col<4;col++)(a.columns[col]||[]).forEach((n,row)=>pos.set(n.id,[x0+col*colGap+cardW/2,nodeY(col,row)+(all?17:39),n.status]));pos.set(a.boss.id,[x0+4*colGap+cardW/2,nodeY(4,0)+(all?17:39),a.boss.status]);
  for(let i=1;i<recorded.length;i++){const from=pos.get(recorded[i-1].nodeId),to=pos.get(recorded[i].nodeId);if(from&&to){const col=(from[2]==='completed'&&to[2]==='completed')?K.green:K.gold;line(c,from[0],from[1],to[0],to[1],col,4);}}
  for(let col=0;col<4;col++)for(let row=0;row<(a.columns[col]||[]).length;row++)node(c,a.columns[col][row],x0+col*colGap,nodeY(col,row),cardW,all?34:82);
  node(c,a.boss,x0+4*colGap,nodeY(4,0),cardW,all?34:82);
  if(!all){text(c,'第 1 站',x0+70,y+48,13,K.muted,true);text(c,'第 2 站',x0+244,y+48,13,K.muted,true);text(c,'第 3 站',x0+418,y+48,13,K.muted,true);text(c,'第 4 站',x0+592,y+48,13,K.muted,true);text(c,'Boss',x0+766,y+48,13,K.muted,true);}
 }
 const ly=all?738:675;rect(c,34,ly,892,55,[18,36,54],11);const legend=[['已完成',K.green],['当前可选',K.gold],['未抵达',K.gray]];legend.forEach(([s,col],i)=>{circle(c,65+i*170,ly+27,7,col);text(c,s,81+i*170,ly+18,17,K.cream);});text(c,'路径仅标记已选路线',590,ly+18,15,K.muted);
 return encodePNG(c);
}
function intentLabel(i){if(!i)return '等待行动';const name=i.label||({attack:'攻击',guard:'护盾',burn:'灼烧',cleanse:'净火',heal:'恢复',charge:'蓄力',thorns:'反伤',conditional:'条件反制'})[i.kind]||i.kind;const amount=i.kind==='attack'?` ${i.value??0}×${i.hits??1}`:i.kind!=='conditional'&&Number.isFinite(i.value)?` ${i.value}`:'';return short(name,12)+amount;}
function intentDetail(i){if(!i)return '';if(i.kind==='conditional')return `首张含直接伤害的牌: ${intentLabel(i.onAttack)} / 否则: ${intentLabel(i.onOther)}`;if(i.kind==='charge')return `下轮：${i.next?.value??i.value}×${i.next?.hits??i.hits??1} 攻击`;return '';}
function cardDefinition(entity,catalog){const base=catalog.cards[entity.cardId]||{};return entity.upgraded?{...base,...base.upgrade}:base;}
function wrapLine(value,maxChars){const chars=[...String(value)];const lines=[];while(chars.length)lines.push(chars.splice(0,maxChars).join(''));return lines;}
function prepGlyphs(names){const chars=[...new Set(names.flatMap(s=>[...rawImageText(s)]))];return prepareNicknameFont(chars);}
function rgbaText(c,value,x,y,size,color,maxChars){wrapLine(value,maxChars).forEach((s,i)=>text(c,s,x,y+i*(size+2),size,color));}
function silhouette(c,x,y,profession,enemy=false,role='普通',enemyId=''){
 const accent=enemy?(role==='Boss'?K.red:role==='精英'?[220,131,78]:[124,146,162]):K.gold;
 circle(c,x,y-45,22,accent);rect(c,x-22,y-27,44,62,accent,13);line(c,x-16,y-12,x-38,y+18,accent,10);line(c,x+16,y-12,x+38,y+18,accent,10);line(c,x-12,y+28,x-20,y+57,accent,12);line(c,x+12,y+28,x+20,y+57,accent,12);
 if(!enemy){
  const marks={traveler:[222,185,116],warden:[153,177,193],brewer:[201,130,101],messenger:[168,208,211],smith:[196,174,116],medic:[160,196,151],tamer:[206,166,118],forger:[189,125,84]},mark=marks[profession]||K.gold2;
  if(['warden','smith','forger'].includes(profession))rect(c,x-32,y-29,64,9,mark,5);
  if(profession==='brewer')circle(c,x-25,y-15,9,[198,110,85]);if(profession==='messenger')rect(c,x-8,y-19,20,22,mark,2);if(profession==='medic')circle(c,x,y-1,7,[223,229,192]);
  if(profession==='tamer'){circle(c,x+40,y+15,13,[210,166,111]);circle(c,x+49,y+7,5,K.cream);}
  line(c,x+24,y-26,x+49,y-69,[193,180,151],4);circle(c,x+49,y-69,7,K.gold2);
 } else {circle(c,x-8,y-51,3,K.ink);circle(c,x+8,y-51,3,K.ink);if(role==='Boss'){line(c,x-18,y-68,x-30,y-91,accent,6);line(c,x+18,y-68,x+30,y-91,accent,6);}else if(role==='精英'){rect(c,x-34,y-24,68,10,accent,4);rect(c,x-30,y+15,60,9,accent,4);}const seed=[...String(enemyId)].reduce((n,ch)=>n+ch.charCodeAt(0),0);if(seed%2)line(c,x-18,y-62,x-29,y-77,accent,4);}
}
async function battleImage(run){
 const b=run?.battle||{},catalog=getCatalog(run?.catalogVersion||run?.ruleVersion),enemy=catalog.enemies[b.enemyId]||{},profession=catalog.professions?.[b.professionId||run?.professionId]||PROFESSIONS[b.professionId||run?.professionId]||PROFESSIONS.traveler;
 const model=describeRogueImage(run,'battle'),hand=b.hand||[],playLimit=model.playLimit??catalog.player?.playLimit??0;
 const names=[profession.name,enemy.phaseName||'',enemy.name||'敌人',enemy.role||'普通','回合','第二阶段','第一阶段','意图',intentLabel(b.intent),intentDetail(b.intent),'护甲','屏障','灼烧','旅人','生命','护盾','灯狐','锻值','能量','出牌','手牌','抽牌','弃牌','已强化','完整效果见下方文字',...model.hints,...model.cards.flatMap(q=>[q.name,`#${q.id}`,String(q.cost),q.reason,...q.effects,...q.warnings,...q.categories.map(g=>g.label)])];await prepGlyphs([...names,...UI_GLYPHS]);
 const c=new Canvas(W,H);rect(c,0,0,W,H,K.bg);circle(c,480,303,205,[19,39,58]);
 title(c,`第 ${run?.act??1} 幕 · 第 ${run?.slot??1} 站`,`${short(profession.name,7)} 迎战 ${short(enemy.name||'敌人',8)}`,`回合 ${b.turn??0}  ·  ${b.enemyPhase===2?'第二阶段':'第一阶段'}`);
 rect(c,31,112,898,332,K.panel,18);line(c,480,128,480,430,K.line,2);
 text(c,'敌方',70,133,17,K.muted);text(c,enemy.role||'普通',434,133,16,K.gold2,false);silhouette(c,268,276,b.professionId,true,enemy.role,b.enemyId);
 text(c,enemy.name||'敌人',268,354,25,K.cream,true);bar(c,105,394,326,15,b.enemyHp,b.enemyMaxHp,K.red);text(c,`${b.enemyHp??0} / ${b.enemyMaxHp??0}`,268,414,16,K.muted,true);
 text(c,'意图',523,137,17,K.gold);text(c,intentLabel(b.intent),523,163,21,K.cream);if(intentDetail(b.intent))rgbaText(c,intentDetail(b.intent),523,193,12,K.muted,28);if(b.enemyArmor)text(c,`护甲 ${b.enemyArmor}`,523,228,16,K.blue);if(b.enemyShield)text(c,`屏障 ${b.enemyShield}`,650,228,16,K.blue);if(b.enemyBurn)text(c,`灼烧 ${b.enemyBurn}`,790,228,16,K.red);
 if(b.enemyPhase===2&&enemy.phaseName)text(c,enemy.phaseName,523,256,17,K.gold2);
 silhouette(c,563,378,b.professionId,false);text(c,profession.name,615,294,16,K.muted);bar(c,615,320,278,17,b.hp,b.maxHp,K.green);text(c,`生命 ${b.hp??run?.hp??0} / ${b.maxHp??'—'}`,615,347,16,K.cream);text(c,`护盾 ${b.shield??0}   灼烧 ${b.burn??0}`,615,375,15,K.blue);text(c,`能量 ${b.energy??0}   出牌 ${b.plays??0}/${playLimit}`,615,402,15,K.gold2);
 if(b.professionId==='tamer'||b.petHp)text(c,`灯狐 ${b.petHp??0}`,615,423,14,K.gold2);if(b.professionId==='forger'||b.forge)text(c,`锻值 ${b.forge??0}`,785,423,14,K.gold2);
 rect(c,31,462,898,292,WOOD,18);rect(c,39,470,882,276,[31,35,43],13);line(c,48,466,912,466,WOOD_GOLD,2);line(c,48,750,912,750,WOOD_DARK,2);for(const x of [57,904])for(const y of [469,747])circle(c,x,y,3,[205,164,109]);
 text(c,'手牌',51,477,21,K.cream);text(c,`抽牌 ${b.draw?.length??0}   弃牌 ${b.discard?.length??0}`,690,481,15,K.muted);text(c,model.hints[0]||'先读意图，再选择手牌。',51,498,13,K.gold2);
 const cardW=Math.min(160,Math.floor(850/Math.max(hand.length,1))),gap=hand.length>5?5:12,total=hand.length*cardW+(hand.length-1)*gap,start=480-total/2;
 hand.forEach((e,i)=>{
  const card=model.cards.find(q=>q.id===e.uid),def=cardDefinition(e,catalog),x=Math.round(start+i*(cardW+gap)),y=520,w=cardW,h=202,play=card?.playable===true;
  rect(c,x+3,y+5,w,h,[8,17,28],10);rect(c,x,y,w,h,play?K.panel2:[35,48,60],10);rect(c,x,y,w,5,play?K.gold:K.gray,5);circle(c,x+21,y+23,15,play?K.gold:K.gray);text(c,card?.cost??0,x+21,y+14,16,K.ink,true);text(c,`#${e.uid}`,x+43,y+16,13,play?K.gold2:K.muted);
  if(e.upgraded){rect(c,x+w-47,y+10,39,19,[110,91,53],6);text(c,'强化+',x+w-43,y+12,11,K.gold2);}
  text(c,short(card?.name||def.name||e.cardId,8),x+w/2,y+37,15,play?K.cream:K.muted,true);
  let cx=x+8;for(const group of (card?.categories||[]).slice(0,2)){const chipW=Math.max(34,[...group.label].length*12+12);rect(c,cx,y+58,chipW,19,group.color,6);text(c,group.label,cx+6,y+61,11,K.ink);cx+=chipW+5;}
  const effects=card?.effects||[];let ey=y+84;for(const effect of effects.slice(0,3)){for(const entry of wrapLine(effect,Math.max(8,Math.floor((w-18)/11)))){text(c,entry,x+9,ey,11,play?K.white:K.muted);ey+=13;}}
  let ry=Math.max(y+135,ey+3);for(const warning of (card?.warnings||[]).filter(v=>v!=='已强化'))for(const entry of wrapLine(warning,Math.max(8,Math.floor((w-18)/10)))){text(c,entry,x+9,ry,10,K.red);ry+=12;}
  if(card?.reason)rgbaText(c,card.reason,x+9,y+177,10,[232,181,143],Math.max(8,Math.floor((w-18)/10)));else text(c,'可出牌',x+w-57,y+178,11,K.green);
 });
 text(c,'完整效果见下方文字',480,727,12,K.gold2,true);
 return encodePNG(c);
}
export async function renderRogueImage(run,{view='auto'}={}){const mode=view==='auto'?(run?.phase==='BATTLE'&&run?.battle?'battle':'map'):view;return mode==='battle'?battleImage(run):mapImage(run,mode);}
