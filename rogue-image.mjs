import { Canvas, encodePNG } from './card-image.mjs';
import { prepareNicknameFont } from './nickname-font.mjs';
import { PROFESSIONS } from './rogue-content-v09.mjs';
import { enemyImageCue } from './rogue-enemy-guide.mjs';
import { getCatalog } from './rogue-content-v14.mjs';
import { legalCards } from './rogue-battle.mjs';
import { cardGroups, cardEffectLines, cardWarnings, unavailableReason, battleHints } from './rogue-card-guide.mjs';
import {connectedPlanFor,routeAnchor,routeSupplyLines,routeNodeReference} from './rogue-route-view.mjs';
import {nextNodeIds,reachableNodeIds} from './rogue-route-graph.mjs';
import { glyphs } from './card-glyphs.mjs';

const W=960, H=800;
const UI_GLYPHS=[...new Set([...'灯下迷城全程路线当前幕第站遭遇精英奇遇商铺营地未知当前位置已完成当前可选未抵达暂不可选敌方迎战旅人回合第一阶段第二阶段意图生命护盾护甲灼烧屏障能量出牌手牌可出牌当前不可用已强化抽牌弃牌灯狐锻值等待行动技巧牌路径仅标记已选路线·×…：/'] )];
const K={bg:[13,25,43],panel:[23,43,65],panel2:[30,54,77],line:[67,97,119],cream:[250,238,210],muted:[163,187,198],gold:[242,190,91],gold2:[255,218,137],blue:[61,125,160],green:[90,170,122],gray:[91,110,124],red:[202,91,82],white:[255,250,235],ink:[18,34,50]};
const WOOD=[91,58,43],WOOD_DARK=[57,39,34],WOOD_GOLD=[161,112,66];
const rect=(c,x,y,w,h,col,r=0)=>c.rect(Math.round(x),Math.round(y),Math.round(w),Math.round(h),col,r);
function circle(c,x,y,r,col){x=Math.round(x);y=Math.round(y);r=Math.round(r);for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++)if(xx*xx+yy*yy<=r*r)c.pixel(x+xx,y+yy,col);}
function line(c,x1,y1,x2,y2,col,width=3){const n=Math.max(1,Math.ceil(Math.hypot(x2-x1,y2-y1)));for(let i=0;i<=n;i++){const x=Math.round(x1+(x2-x1)*i/n),y=Math.round(y1+(y2-y1)*i/n);rect(c,x-width/2,y-width/2,width,width,col);}}
const PUNCTUATION=new Map([['①','1号'],['②','2号'],['③','3号'],['，',' '],['。','.'],['；',' / '],['：',' '],['、',' / '],['（',' '],['）',' '],['·',' '],['×','x'],['→',' '],['≤','至多'],['与','和']]);
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
 const connected=Boolean(connectedPlanFor(run,act)),anchor=connected?routeAnchor(run,plan):null;
 const reachable=new Set(connected?reachableNodeIds(plan,anchor):[]),nextIds=new Set(connected?nextNodeIds(plan,anchor):[]);
 const live=run.act===act&&run.phase==='ROUTE'&&run.room?.type==='route'?new Map((run.room.nodes||[]).map(n=>[n.id,n])):new Map();
 const columns=(plan.nodes||[]).map((nodes,i)=>(nodes||[]).map((base,j)=>{
  const node=live.get(base.id)||base,station=(act-1)*5+i,done=run.completed>station,chosen=selected.has(base.id),current=chosen&&!done,choiceAllowed=!Array.isArray(run.room?.choices)||run.room.choices.includes(base.id),available=live.has(base.id)&&node.available===true&&choiceAllowed&&(!connected||nextIds.has(base.id));
  const outside=connected&&!chosen&&run.act>=act&&(done||run.act>act||!reachable.has(base.id));
  return {id:base.id,type:base.type,name:short(getName(base,catalog),8),status:chosen&&done?'completed':current?'current':available?'available':outside?'unreachable':'future',chosen,reachable:!connected||reachable.has(base.id),dangerous:Boolean(base.dangerous),mark:connected?routeNodeReference(plan,base.id)?.mark:null,disabled:outside||live.has(base.id)&&(!choiceAllowed||node.available===false)};
 }));
 const bossId=plan.bossId||run.bosses?.[act-1];
 const bossChosen=selected.has(`a${act}s5boss`),bossDone=run.completed>=(act-1)*5+5;
 const boss={id:`a${act}s5boss`,type:'boss',name:short(catalog.enemies[bossId]?.name||'Boss',8),status:bossChosen&&bossDone?'completed':bossChosen?'current':'future'};
 return {act,name:catalog.acts?.[act-1]?.name||`第 ${act} 幕`,known:true,columns,boss,connected,edges:connected?plan.edges.map(e=>({...e})):[],anchor,supplies:connected?routeSupplyLines(run,plan):[]};
}
export function describeRogueImage(run,view='auto'){
 const mode=view==='auto'?(run?.phase==='BATTLE'&&run?.battle?'battle':'map'):view;
 if(mode==='battle'){
  const b=run?.battle||{},catalog=getCatalog(run?.catalogVersion||run?.ruleVersion),profession=catalog.professions?.[b.professionId||run?.professionId]||PROFESSIONS[b.professionId||run?.professionId],enemy=catalog.enemies[b.enemyId];
  const playable=new Set(Array.isArray(b?.hand)?legalCards(b).map(e=>e.uid):[]);
  const playLimit=catalog.player?.playLimit,cards=(b?.hand||[]).map(e=>{const def=cardDefinition(e,catalog),groups=cardGroups(def),effects=cardEffectLines(def),warnings=cardWarnings(e,def,b.hp);return {id:e.uid,name:catalog.cards[e.cardId]?.name||e.cardId,cost:def.cost??0,playable:playable.has(e.uid),categories:groups.map(g=>({label:g.label,color:[...g.color]})),effects,warnings,reason:unavailableReason(b,def,playLimit,playable,e.uid)};});
  return {mode:'battle',act:run?.act??1,turn:b?.turn??0,playLimit,profession:profession?.name||'旅人',enemy:enemy?.name||b?.enemyId||'敌人',intent:b.intent,cards,hints:[...(enemyImageCue(b)?[enemyImageCue(b)]:[]),...battleHints(b,cards.map(e=>cardDefinition((b.hand||[]).find(h=>h.uid===e.id)||{},catalog)),playLimit)],enemyHp:b?.enemyHp??0,enemyMaxHp:b?.enemyMaxHp??0,playerHp:b?.hp??run?.hp??0,playerMaxHp:b?.maxHp??0};
 }
 const all=mode==='all'||mode==='overview';
 const catalog=getCatalog(run?.catalogVersion||run?.ruleVersion);
 return {mode:'map',act:run?.act??1,phase:run?.phase??'ROUTE',acts:(all?[1,2,3]:[run?.act??1]).map(a=>routeModel(run,a,catalog))};
}
function nodeColor(status){return status==='completed'?K.green:status==='available'||status==='current'?K.gold:K.gray;}
function node(c,n,x,y,w=142,h=83){const col=nodeColor(n.status),muted=['future','unreachable'].includes(n.status);rect(c,x,y,w,h,n.status==='unreachable'?[20,34,47]:muted?[29,46,62]:K.panel2,10);rect(c,x,y,w,4,n.dangerous&&n.status==='available'?K.red:col,4);if(h<50){text(c,short(`${n.mark||''}${n.name}`,8),x+w/2,y+9,15,muted?K.muted:K.cream,true);return;}circle(c,x+17,y+21,6,col);const label=n.status==='current'?'当前位置':`${n.mark||''}${n.dangerous?'危险':labelType(n)}`;text(c,label,x+30,y+13,15,muted?K.muted:K.gold2);text(c,n.name,x+w/2,y+39,17,muted?K.muted:K.cream,true);if(n.disabled)text(c,n.status==='unreachable'?'支路外':'暂不可选',x+w/2,y+62,13,K.muted,true);}
async function mapImage(run,view,env){
 const model=describeRogueImage(run,view),all=model.acts.length===3;
 const names=['①②③','支路外','危险','沿连线规划','亮线为当前可走支路','营地与商店位置见上方提示',...model.acts.flatMap(a=>a.supplies||[]),'灯下迷城','三幕行程','路线节点只表示走过明确记录的选择','已完成','当前可选','未抵达','第 1 站','第 2 站','第 3 站','第 4 站','Boss','暂不可选','旧存档未保存地图；当前没有可见路线选项。','当前路线选项','路径仅标记已选路线',String(run?.phase||''),String(run?.hp??'—')+' HP',...model.acts.flatMap(a=>[a.name,...(a.columns||[]).flatMap(col=>col.map(n=>n.name)),...(a.visible||[]).map(n=>n.name),a.boss?.name||''])];await prepGlyphs([...names,...UI_GLYPHS],env);
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
  // New rules draw only saved edges. Old maps retain their stage links.
  for(let col=0;col<4;col++){
   const prev=a.columns[col]||[],next=col===3?[a.boss]:(a.columns[col+1]||[]);
   for(let row=0;row<prev.length;row++)for(let nr=0;nr<next.length;nr++){
    const fromNode=prev[row],toNode=next[nr];
    if(a.connected&&!a.edges.some(e=>e.from===fromNode.id&&e.to===toNode.id))continue;
    const active=a.connected&&fromNode.id===a.anchor&&toNode.status==='available';
    const edgeColor=active?K.gold:a.connected&&!fromNode.reachable?[31,44,56]:[48,70,88];
    const toRow=col===3?0:nr,fromX=x0+col*colGap+cardW,fromY=nodeY(col,row)+(all?17:39),toX=x0+(col+1)*colGap,toY=nodeY(col+1,toRow)+(all?17:39);
    line(c,fromX,fromY,toX,toY,edgeColor,active?3:2);
   }
  }
  const recorded=(run.path||[]).filter(p=>p.act===a.act).sort((u,v)=>(u.slot??0)-(v.slot??0));
  const pos=new Map();for(let col=0;col<4;col++)(a.columns[col]||[]).forEach((n,row)=>pos.set(n.id,[x0+col*colGap+cardW/2,nodeY(col,row)+(all?17:39),n.status]));pos.set(a.boss.id,[x0+4*colGap+cardW/2,nodeY(4,0)+(all?17:39),a.boss.status]);
  for(let i=1;i<recorded.length;i++){const from=pos.get(recorded[i-1].nodeId),to=pos.get(recorded[i].nodeId);if(from&&to){const col=(from[2]==='completed'&&to[2]==='completed')?K.green:K.gold;line(c,from[0],from[1],to[0],to[1],col,4);}}
  for(let col=0;col<4;col++)for(let row=0;row<(a.columns[col]||[]).length;row++)node(c,a.columns[col][row],x0+col*colGap,nodeY(col,row),cardW,all?34:82);
  node(c,a.boss,x0+4*colGap,nodeY(4,0),cardW,all?34:82);
  if(!all&&a.connected){text(c,a.supplies[0]||'',x0,y+413,16,K.cream);text(c,a.supplies[1]||'',x0,y+440,15,K.muted);}
  if(!all){text(c,'第 1 站',x0+70,y+48,13,K.muted,true);text(c,'第 2 站',x0+244,y+48,13,K.muted,true);text(c,'第 3 站',x0+418,y+48,13,K.muted,true);text(c,'第 4 站',x0+592,y+48,13,K.muted,true);text(c,'Boss',x0+766,y+48,13,K.muted,true);}
 }
 const ly=all?738:675;rect(c,34,ly,892,55,[18,36,54],11);const legend=[['已完成',K.green],['当前可选',K.gold],['未抵达',K.gray]];legend.forEach(([s,col],i)=>{circle(c,65+i*170,ly+27,7,col);text(c,s,81+i*170,ly+18,17,K.cream);});text(c,model.acts.some(a=>a.connected)?'亮线为当前可走支路':'路径仅标记已选路线',570,ly+18,15,K.muted);
 return encodePNG(c);
}
function intentLabel(i){if(!i)return '等待行动';if(i.kind==='charge'&&i.chargeBreak)return '蓄力 本轮不攻击';const name=i.label||({attack:'攻击',guard:'护盾',burn:'灼烧',cleanse:'净火',heal:'恢复',charge:'蓄力',thorns:'反伤',conditional:'条件反制'})[i.kind]||i.kind;const amount=i.kind==='attack'?` ${i.value??0}×${i.hits??1}`:i.kind!=='conditional'&&Number.isFinite(i.value)?` ${i.value}`:'';return short(name,12)+amount;}
function intentDetail(i){if(!i)return '';if(i.kind==='conditional')return `首张含直接伤害的牌: ${intentLabel(i.onAttack)} / 否则: ${intentLabel(i.onOther)}`;if(i.kind==='charge')return i.next && i.next.kind!=='attack'?`下轮：${intentLabel(i.next)}`:`下轮：${i.next?.value??i.value}×${i.next?.hits??i.hits??1} 攻击`;return '';}
function cardDefinition(entity,catalog){const base=catalog.cards[entity.cardId]||{};return entity.upgraded?{...base,...base.upgrade}:base;}
function wrapLine(value,maxChars){const chars=[...String(value)];const lines=[];while(chars.length)lines.push(chars.splice(0,maxChars).join(''));return lines;}
function prepGlyphs(names,env){const chars=[...new Set(names.flatMap(s=>[...rawImageText(s)]))];return prepareNicknameFont(chars,env);}
function rgbaText(c,value,x,y,size,color,maxChars){wrapLine(value,maxChars).forEach((s,i)=>text(c,s,x,y+i*(size+2),size,color));}
function silhouette(c,x,y,profession,enemy=false,role='普通',enemyId=''){
 const accent=enemy?(role==='Boss'?K.red:role==='精英'?[220,131,78]:[124,146,162]):K.gold;
 const shadow=enemy?(role==='Boss'?[86,43,48]:[66,73,79]):[126,87,43];
 const highlight=enemy?(role==='Boss'?[246,143,118]:[200,218,222]):[255,222,157];
 const stroke=(x1,y1,x2,y2,width)=>{line(c,x1,y1,x2,y2,shadow,width+5);line(c,x1,y1,x2,y2,accent,width);};
 rect(c,x-43,y+49,86,10,[9,18,29],6);
 if(enemy&&role==='Boss'){line(c,x-16,y-59,x-29,y-82,shadow,8);line(c,x+16,y-59,x+29,y-82,shadow,8);}
 if(!enemy){line(c,x+25,y-22,x+49,y-69,[91,77,66],7);line(c,x+24,y-24,x+47,y-69,[198,185,155],3);circle(c,x+49,y-69,9,[134,96,55]);circle(c,x+49,y-69,6,K.gold2);}
 stroke(x-15,y+13,x-20,y+53,11);stroke(x+15,y+13,x+20,y+53,11);
 stroke(x-16,y-10,x-35,y+15,8);stroke(x+16,y-10,x+35,y+15,8);
 rect(c,x-28,y-26,56,59,shadow,13);rect(c,x-23,y-23,46,52,accent,11);
 rect(c,x-21,y+5,42,9,shadow,3);rect(c,x-17,y+5,34,4,highlight,2);
 line(c,x,y-14,x,y+22,shadow,4);line(c,x-1,y-13,x-1,y+19,highlight,1);
 circle(c,x,y-46,24,shadow);circle(c,x,y-48,20,accent);circle(c,x-6,y-55,4,highlight);
 if(enemy){circle(c,x-7,y-48,3,role==='Boss'?[255,213,151]:K.ink);circle(c,x+7,y-48,3,role==='Boss'?[255,213,151]:K.ink);line(c,x-13,y-57,x-3,y-58,shadow,2);line(c,x+3,y-58,x+13,y-57,shadow,2);if(role==='精英'){rect(c,x-28,y-26,56,8,highlight,3);rect(c,x-26,y+16,52,7,shadow,3);}if(role==='Boss'){line(c,x-17,y-63,x-28,y-81,accent,5);line(c,x+17,y-63,x+28,y-81,accent,5);}}
 else{
  const marks={traveler:[222,185,116],warden:[153,177,193],brewer:[201,130,101],messenger:[168,208,211],smith:[196,174,116],medic:[160,196,151],tamer:[206,166,118],forger:[189,125,84]},mark=marks[profession]||K.gold2;
  if(['warden','smith','forger'].includes(profession)){rect(c,x-31,y-26,62,10,shadow,5);rect(c,x-27,y-26,54,5,mark,3);}
  if(profession==='brewer'){circle(c,x-25,y-15,10,shadow);circle(c,x-25,y-15,7,mark);}
  if(profession==='messenger'){rect(c,x-9,y-20,20,23,shadow,3);rect(c,x-6,y-18,14,17,mark,2);}
  if(profession==='medic'){circle(c,x,y-1,8,shadow);circle(c,x,y-1,5,[223,229,192]);}
  if(profession==='tamer'){circle(c,x+40,y+15,15,shadow);circle(c,x+40,y+15,11,[210,166,111]);circle(c,x+49,y+7,5,K.cream);}
  line(c,x-9,y-39,x+8,y-39,highlight,2);
 }
}
async function battleImage(run,env){
 const b=run?.battle||{},catalog=getCatalog(run?.catalogVersion||run?.ruleVersion),enemy=catalog.enemies[b.enemyId]||{},profession=catalog.professions?.[b.professionId||run?.professionId]||PROFESSIONS[b.professionId||run?.professionId]||PROFESSIONS.traveler;
 const model=describeRogueImage(run,'battle'),hand=b.hand||[],playLimit=model.playLimit??catalog.player?.playLimit??0;
 const names=[profession.name,enemy.phaseName||'',enemy.name||'敌人',enemy.role||'普通','回合','第一阶段','第二阶段','敌方意图','本回合意图','护甲','屏障','灼烧','生命','护盾','能量','出牌','手牌','抽牌','弃牌','强化+','先读意图，再选手牌。','完整效果见下方说明','可出牌','不可用',intentLabel(b.intent),intentDetail(b.intent),...model.hints,...model.cards.flatMap(q=>[q.name,'#'+q.id,String(q.cost),q.reason,...q.effects,...q.warnings,...q.categories.map(g=>g.label)])];
 await prepGlyphs([...names,...UI_GLYPHS],env);
 const F={headline:24,title:20,body:17,meta:15,small:14};
 const c=new Canvas(W,H);rect(c,0,0,W,H,K.bg);circle(c,480,303,205,[19,39,58]);
 title(c,'第 '+(run?.act??1)+' 幕 · 第 '+(run?.slot??1)+' 站',short(profession.name,7)+' 迎战 '+short(enemy.name||'敌人',8),'回合 '+(b.turn??0)+'  ·  '+(b.enemyPhase===2?'第二阶段':'第一阶段'));
 rect(c,31,112,898,332,K.panel,18);rect(c,34,115,892,4,[47,75,96],3);rect(c,34,440,892,2,[44,67,83],2);
 line(c,480,128,480,430,K.line,2);circle(c,480,129,4,K.gold);circle(c,480,429,4,K.gold);
 line(c,52,123,466,123,[83,111,128],1);line(c,494,123,908,123,[111,89,63],1);
 rect(c,57,132,86,27,[39,58,75],8);circle(c,70,145,4,[167,180,183]);text(c,'敌方',82,137,F.meta,K.muted);
 text(c,enemy.role||'普通',435,137,F.meta,K.gold2,false);
 circle(c,268,276,78,[27,48,66]);circle(c,268,276,70,[31,55,73]);
 silhouette(c,268,276,b.professionId,true,enemy.role,b.enemyId);
 text(c,enemy.name||'敌人',268,353,F.title,K.cream,true);
 rect(c,104,391,328,21,[10,20,31],8);bar(c,108,395,320,13,b.enemyHp,b.enemyMaxHp,K.red);
 text(c,String(b.enemyHp??0)+' / '+String(b.enemyMaxHp??0),268,414,F.meta,K.muted,true);
 rect(c,507,130,397,121,[18,36,53],12);rect(c,507,130,397,4,K.gold,4);
 text(c,'本回合意图',526,139,F.small,K.gold2);
 text(c,intentLabel(b.intent),526,161,F.headline,K.cream);
 if(intentDetail(b.intent))rgbaText(c,intentDetail(b.intent),526,193,F.small,K.muted,25);
 const enemyStats=[['护甲',b.enemyArmor,K.blue],['屏障',b.enemyShield,K.blue],['灼烧',b.enemyBurn,K.red]].filter(s=>s[1]);
 let sx=526;for(const [label,value,color] of enemyStats){const caption=label+' '+value,pw=Math.max(74,[...caption].length*F.small+18);if(sx+pw>892)break;rect(c,sx,226,pw,23,[34,53,69],7);text(c,caption,sx+8,230,F.small,color);sx+=pw+7;}
 if(b.enemyPhase===2&&enemy.phaseName){rect(c,523,256,184,24,[69,43,48],7);text(c,enemy.phaseName,534,260,F.small,K.gold2);}
 circle(c,563,354,65,[38,51,58]);circle(c,563,354,58,[48,61,66]);
 silhouette(c,563,378,b.professionId,false);
 text(c,profession.name,641,280,F.title,K.cream);
 rect(c,641,304,255,20,[11,22,32],8);bar(c,645,308,247,12,b.hp,b.maxHp,K.green);
 text(c,'生命 '+String(b.hp??run?.hp??0)+' / '+String(b.maxHp??'—'),641,331,F.body,K.cream);
 line(c,641,354,896,354,[63,88,104],1);
 text(c,'护盾 '+String(b.shield??0)+'    灼烧 '+String(b.burn??0),641,360,F.meta,K.blue);
 text(c,'能量 '+String(b.energy??0)+'    出牌 '+String(b.plays??0)+' / '+String(playLimit),641,386,F.body,K.gold2);
 if(b.professionId==='tamer'||b.petHp)text(c,'灯狐 '+String(b.petHp??0),641,412,F.meta,K.gold2);
 if(b.professionId==='forger'||b.forge)text(c,'锻值 '+String(b.forge??0),780,412,F.meta,K.gold2);
 rect(c,31,462,898,292,[122,77,49],18);rect(c,38,469,884,278,[31,35,43],13);
 line(c,49,468,911,468,[172,125,76],2);line(c,49,746,911,746,[78,55,44],2);
 for(const x of [52,908])for(const y of [474,740]){circle(c,x,y,5,[219,178,111]);circle(c,x,y,2,[255,225,154]);}
 text(c,'手牌',51,477,F.headline,K.cream);
 text(c,'抽牌 '+String(b.draw?.length??0)+'   弃牌 '+String(b.discard?.length??0),690,481,F.meta,K.muted);
 text(c,model.hints[0]||'先读意图，再选手牌。',51,500,F.meta,K.gold2);
 const count=hand.length,cardW=count?Math.min(164,Math.floor(852/count)):164,gap=count>5?6:8,total=count*cardW+Math.max(0,count-1)*gap,start=480-total/2;
 hand.forEach((e,i)=>{
  const card=model.cards.find(q=>q.id===e.uid),def=cardDefinition(e,catalog),x=Math.round(start+i*(cardW+gap)),y=520,w=cardW,h=204,play=card?.playable===true;
  const border=play?[145,108,58]:[72,88,102],face=play?[28,52,72]:[35,47,59];
  rect(c,x+3,y+5,w,h,[8,17,28],10);rect(c,x,y,w,h,face,10);rect(c,x+1,y+1,w-2,5,play?K.gold:K.gray,5);line(c,x+1,y+2,x+w-2,y+2,border,2);line(c,x+1,y+2,x+1,y+h-2,border,2);line(c,x+w-2,y+2,x+w-2,y+h-2,border,2);line(c,x+1,y+h-2,x+w-2,y+h-2,border,2);
  circle(c,x+22,y+24,17,play?K.gold:[91,108,120]);circle(c,x+22,y+24,13,play?K.gold2:[112,128,139]);text(c,card?.cost??0,x+22,y+14,F.body,K.ink,true);
  text(c,'#'+e.uid,x+45,y+17,F.small,play?K.gold2:K.muted);
  if(e.upgraded){rect(c,x+w-51,y+10,43,21,[100,81,49],6);text(c,'强化+',x+w-47,y+13,F.small,K.gold2);}
  text(c,short(card?.name||def.name||e.cardId,7),x+w/2,y+42,F.title,play?K.cream:K.muted,true);
  line(c,x+9,y+65,x+w-9,y+65,play?[71,95,111]:[64,78,89],1);
  let cx=x+9;for(const group of (card?.categories||[]).slice(0,2)){const chipW=Math.max(42,[...group.label].length*F.small+14);if(cx+chipW>x+w-8)break;rect(c,cx,y+70,chipW,22,group.color,7);text(c,group.label,cx+7,y+74,F.small,K.ink);cx+=chipW+6;}
  const maxChars=Math.max(6,Math.floor((w-34)/F.small));
  const lines=(card?.effects||[]).slice(0,3).flatMap(effect=>wrapLine(effect,maxChars)).slice(0,3);
  lines.forEach((entry,index)=>{const yy=y+101+index*17;circle(c,x+12,yy+5,2,play?K.gold:K.gray);text(c,entry,x+20,yy,F.small,play?K.white:K.muted);});
  const warning=(card?.warnings||[]).find(value=>value!=='已强化');
  if(warning){const warningLimit=Math.max(5,Math.floor((w-28)/F.small));text(c,short(warning,warningLimit),x+11,y+153,F.small,K.red);}
  const state=card?.reason||'可出牌',stateWidth=Math.max(46,w-18);
  rect(c,x+9,y+176,stateWidth,21,play?[27,61,51]:[72,49,47],7);
  text(c,short(state,Math.max(4,Math.floor((stateWidth-14)/F.small))),x+w/2,y+179,F.small,play?K.green:[239,172,139],true);
 });
 text(c,'完整效果见下方说明',480,728,F.small,K.gold2,true);
 return encodePNG(c);
}
export async function renderRogueImage(run,{view='auto',env}={}){const mode=view==='auto'?(run?.phase==='BATTLE'&&run?.battle?'battle':'map'):view;return mode==='battle'?battleImage(run,env):mapImage(run,mode,env);}
