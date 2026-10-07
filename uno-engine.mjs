// Classic 108-card deck with explicitly labelled stacking, numeric jump-in and 2v2 variants.
export const COLORS=['red','yellow','green','blue'];
export const COLOR_NAMES={red:'红',yellow:'黄',green:'绿',blue:'蓝'};
export const TURN_MS=60000;
export const JUMP_MS=5000;
export const DEFAULT_RULES=Object.freeze({stacking:'mixed',jumpIn:true});
// Missing settings mean an existing table keeps its previous rules until redealt.
export const rulesOf=t=>({stacking:['none','same','mixed'].includes(t.rules?.stacking)?t.rules.stacking:'none',jumpIn:t.rules?.jumpIn===true});
export const seatLimit=t=>t.mode==='teams'?4:10;
export const teamOf=(t,id)=>t.mode==='teams'?t.players.findIndex(p=>p.id===id)%2:null;
export const teamName=team=>team===0?'红队':'蓝队';
export const penaltyCount=t=>t.pending?.count??(t.pending?.kind==='draw2'?2:t.pending?.kind==='draw4'?4:0);
export const jumpOpen=(t,now=Date.now())=>t.phase==='active'&&!!t.jumpWindow&&t.jumpWindow.until>now;
export function configure(t,id,key,value){waiting(t);if(id!==t.owner)throw Error('只有桌主可调整玩法。');if(t.mode==='match'&&t.handNo)throw Error('积分赛开始后规则固定。');
 if(key==='stacking'&&!['none','same','mixed'].includes(value)||key==='jumpIn'&&typeof value!=='boolean'||!['stacking','jumpIn'].includes(key))throw Error('无效玩法设置。');t.rules={...rulesOf(t),[key]:value};
}
function resetTeamScore(t){if(t.mode==='teams')t.teamScores=[0,0];}

export function face(card){
  if(!Number.isInteger(card)||card<0||card>=108)throw Error('无效牌。');
  if(card>=100)return {color:null,value:card<104?'wild':'draw4'};
  const n=card%25;return {color:COLORS[Math.floor(card/25)],value:n===0?0:n<=18?Math.ceil(n/2):['skip','reverse','draw2'][Math.floor((n-19)/2)]};
}
export const symbol=v=>({skip:'跳过',reverse:'反转',draw2:'+2',wild:'变色',draw4:'+4'})[v]??String(v);
export const cardName=c=>{const f=face(c);return `${f.color?COLOR_NAMES[f.color]+'色 ':'万能 '}${symbol(f.value)}`;};
export const points=c=>{const f=face(c);return typeof f.value==='number'?f.value:f.color?20:50;};
export function shuffle(cards){for(let i=cards.length-1;i>0;i--){let n;const range=i+1,limit=Math.floor(0x100000000/range)*range;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);const j=n%range;[cards[i],cards[j]]=[cards[j],cards[i]];}return cards;}
export function newTable(owner,channel,guild,mode='round'){
  if(!['round','match','teams'].includes(mode))throw Error('无效模式。');
  return {game:'uno',epoch:crypto.randomUUID().replaceAll('-','').slice(0,12),version:0,owner,channel,guild,phase:'lobby',mode,rules:{...DEFAULT_RULES},teamScores:mode==='teams'?[0,0]:null,players:[{id:owner,cards:[],score:0}],deck:[],discard:[],color:null,direction:1,turn:null,handNo:0,dealer:-1,pending:null,drawn:null,armed:null,unoOpportunity:null,log:[],lastActive:Date.now(),idleDeadline:Date.now()+600000,deadline:null};
}
const player=(t,id)=>{const p=t.players.find(p=>p.id===id);if(!p)throw Error('请先加入牌桌。');return p;};
const waiting=t=>{if(!['lobby','settled'].includes(t.phase))throw Error('请等本局结束后操作。');};
export const playerLabel=(t,id)=>{const p=t.players.find(p=>p.id===id);return p?.bot?p.name:/^\d+$/.test(id||'')?`<@${id}>`:'玩家';};
function event(t,kind,actor,details={}){const item={kind,actor,...details,seq:(t.eventSeq||0)+1,hand:t.handNo,at:Date.now()};t.eventSeq=item.seq;t.events=[...(t.events||[]),item].slice(-6);t.lastAction=item;if(kind==='play')t.lastPlay=item;return item;}
const note=(t,message)=>{t.log.push(message);t.log=t.log.slice(-6);};
const next=(t,id=t.turn,steps=1)=>{const i=t.players.findIndex(p=>p.id===id);return t.players[(i+t.direction*steps+t.players.length*4)%t.players.length].id;};
function setTurn(t,id){t.turn=id;t.drawn=null;t.armed=null;t.selectedWild=null;t.deadline=Date.now()+TURN_MS;}
function take(t,id,count){const p=player(t,id),out=[];for(let i=0;i<count;i++){
  if(!t.deck.length){const top=t.discard.pop();t.deck=shuffle(t.discard.splice(0));if(top!==undefined)t.discard.push(top);}
  if(!t.deck.length)break;const c=t.deck.pop();p.cards.push(c);out.push(c);
 }if(p.cards.length!==1&&t.unoOpportunity?.player===id)t.unoOpportunity=null;return out;}
export function join(t,id){waiting(t);if(t.players.some(p=>p.id===id))throw Error('你已入座。');if(t.players.length>=seatLimit(t))throw Error(`牌桌已满（${seatLimit(t)} 人）。`);if(t.mode==='match'&&t.handNo)throw Error('积分赛开始后不能中途加入。');t.players.push({id,cards:[],score:0});resetTeamScore(t);}
export function leave(t,id){waiting(t);player(t,id);t.players=t.players.filter(p=>p.id!==id);resetTeamScore(t);if(!t.players.some(p=>!p.bot)){close(t,t.owner,true);return;}if(t.owner===id)t.owner=t.players.find(p=>!p.bot).id;}
export function addComputers(t,id,count=1){waiting(t);if(id!==t.owner)throw Error('只有桌主可添加电脑。');if(!Number.isInteger(count)||count<1||count>seatLimit(t)-1||t.players.length+count>seatLimit(t))throw Error(`最多 ${seatLimit(t)} 位玩家。`);if(t.mode==='match'&&t.handNo)throw Error('积分赛开始后不能更换参赛者。');for(let n=0;n<count;n++){let serial=1;while(t.players.some(p=>p.id===`uno-cpu-${serial}`))serial++;t.players.push({id:`uno-cpu-${serial}`,name:`电脑 ${serial}`,bot:true,cards:[],score:0});}resetTeamScore(t);}
export function removeComputers(t,id){waiting(t);if(id!==t.owner)throw Error('只有桌主可移除电脑。');if(t.mode==='match'&&t.handNo)throw Error('积分赛开始后不能更换参赛者。');t.players=t.players.filter(p=>!p.bot);resetTeamScore(t);}
export function start(t,id){waiting(t);if(id!==t.owner)throw Error('只有桌主可开始。');if(t.mode==='teams'&&t.players.length!==4)throw Error('2v2 组队需要恰好四位玩家，可添加电脑。');if(t.players.length<2)throw Error('至少需要 2 人，可添加电脑陪练。');if(t.matchWinner)throw Error('积分赛已结束，请关桌后创建新赛。');
  t.rules??={...DEFAULT_RULES};t.handNo++;t.dealer=t.handNo===1?shuffle(t.players.map((_,i)=>i))[0]:(t.dealer+1)%t.players.length;t.deck=shuffle(Array.from({length:108},(_,i)=>i));t.discard=[];t.direction=1;t.color=null;t.pending=null;t.drawn=null;t.armed=null;t.unoOpportunity=null;t.winner=null;t.winningTeam=null;t.roundPoints=0;t.log=[];t.events=[];t.lastAction=null;t.lastPlay=null;t.lastJump=null;t.jumpWindow=null;t.computerJumpDue=null;t.jumpSerial=0;t.pages={};t.selectedWild=null;t.phase='active';
  for(const p of t.players)p.cards=[];for(let n=0;n<7;n++)for(let j=1;j<=t.players.length;j++)take(t,t.players[(t.dealer+j)%t.players.length].id,1);
  let top=t.deck.pop();while(face(top).value==='draw4'){t.deck.unshift(top);shuffle(t.deck);top=t.deck.pop();}t.discard.push(top);const f=face(top);t.color=f.color;setTurn(t,t.players[(t.dealer+1)%t.players.length].id);
  if(f.value==='reverse'){t.direction=-1;setTurn(t,t.players[t.dealer].id);}
  else if(f.value==='skip')setTurn(t,next(t));
  else if(f.value==='draw2'){take(t,t.turn,2);setTurn(t,next(t));}
  else if(f.value==='wild')t.pending={kind:'openingColor',victim:t.turn};
  note(t,`第 ${t.handNo} 局开始；每人 7 张。`);event(t,'start',id,{card:top,color:t.color});
}
function requireTurn(t,id){player(t,id);if(t.phase!=='active'||t.turn!==id)throw Error('还没轮到你。');}
function beginAction(t){t.unoOpportunity=null;t.selectedWild=null;}
export function stackable(t,id,card){const p=t.players.find(p=>p.id===id),pending=t.pending,mode=rulesOf(t).stacking;
 if(t.phase!=='active'||t.turn!==id||pending?.victim!==id||!['draw2','draw4'].includes(pending?.kind)||pending.finisher||mode==='none'||!p?.cards.includes(card))return false;
 const value=face(card).value;return mode==='same'?value===pending.kind:pending.kind==='draw2'?['draw2','draw4'].includes(value):value==='draw4';
}
export function playable(t,id,card){const p=t.players.find(p=>p.id===id);if(t.phase!=='active'||t.turn!==id||jumpOpen(t)||!p?.cards.includes(card)||(t.drawn!==null&&t.drawn!==card))return false;if(t.pending)return stackable(t,id,card);const f=face(card),top=face(t.discard.at(-1));return !f.color||f.color===t.color||f.value===top.value;}
export function legalCards(t,id){return (t.players.find(p=>p.id===id)?.cards||[]).filter(c=>playable(t,id,c));}
export function jumpCards(t,id,now=Date.now()){
 if(!rulesOf(t).jumpIn||!jumpOpen(t,now)||t.pending||t.jumpWindow.card!==t.discard.at(-1))return [];const top=face(t.discard.at(-1));if(typeof top.value!=='number')return [];
 return (t.players.find(p=>p.id===id)?.cards||[]).filter(c=>{const f=face(c);return f.color===top.color&&f.value===top.value;});
}
function clearJump(t){t.jumpWindow=null;t.computerJumpDue=null;t.computerJumpKey=null;}
function openJump(t,card){clearJump(t);if(!rulesOf(t).jumpIn||t.phase!=='active'||t.pending||typeof face(card).value!=='number'||face(card).value===0)return;
 t.jumpSerial=(t.jumpSerial||0)+1;t.jumpWindow={key:`${t.handNo}-${t.jumpSerial}`,card,until:Date.now()+JUMP_MS};t.deadline+=JUMP_MS;
}
export function expireJump(t,now=Date.now()){if(!t.jumpWindow||t.jumpWindow.until>now)return false;clearJump(t);return true;}
export function jump(t,id,card,key){player(t,id);if(t.jumpWindow?.key!==key||!jumpCards(t,id).includes(card))throw Error('抢出窗口已变化或结束，刚才抢出未执行。');const from=t.turn,declared=player(t,id).cards.length===2;clearJump(t);t.turn=id;t.drawn=null;t.armed=declared?id:null;t.pending=null;play(t,id,card,undefined,{jump:true,from});}
export function computerJump(t){if(!jumpOpen(t))return false;for(const p of t.players){if(!p.bot)continue;const card=jumpCards(t,p.id)[0];if(card!==undefined){jump(t,p.id,card,t.jumpWindow.key);return true;}}return false;}
function settle(t,id){const p=player(t,id);t.phase='settled';t.winner=id;t.winningTeam=teamOf(t,id);t.roundPoints=t.players.filter(x=>t.mode==='teams'?teamOf(t,x.id)!==t.winningTeam:x.id!==id).reduce((s,x)=>s+x.cards.reduce((a,c)=>a+points(c),0),0);
 if(t.mode==='teams'){t.teamScores??=[0,0];t.teamScores[t.winningTeam]+=t.roundPoints;}else p.score+=t.roundPoints;
 if(t.mode==='match'&&p.score>=500)t.matchWinner=id;t.turn=null;t.pending=null;t.drawn=null;t.armed=null;t.unoOpportunity=null;t.deadline=null;clearJump(t);t.idleDeadline=Date.now()+900000;note(t,`${playerLabel(t,id)} 出完手牌，${t.mode==='teams'?teamName(t.winningTeam):'本人'}获得 ${t.roundPoints} 分。`);event(t,'settle',id,{points:t.roundPoints,team:t.winningTeam});}
export function play(t,id,card,color,options={}){requireTurn(t,id);if(!playable(t,id,card))throw Error('这张牌现在不能出；摸牌后只能出刚摸到的牌。');const p=player(t,id),f=face(card);if(!f.color&&!COLORS.includes(color))throw Error('请选择后续颜色。');
  const previousPenalty=t.pending,declared=t.armed===id,oldColor=t.color,handBefore=[...p.cards],illegal=f.value==='draw4'&&p.cards.some(c=>face(c).color===oldColor);
  clearJump(t);beginAction(t);p.cards.splice(p.cards.indexOf(card),1);t.discard.push(card);t.color=f.color||color;t.drawn=null;t.armed=null;
  if(p.cards.length===1&&!declared)t.unoOpportunity={player:id};note(t,`${playerLabel(t,id)}打出 ${cardName(card)}${declared?' · UNO!':''}`);
  if(f.value==='reverse')t.direction*=-1;
  let target=next(t,id);if(f.value==='skip'||(f.value==='reverse'&&t.players.length===2))target=next(t,id,2);
  const amount=f.value==='draw2'?2:f.value==='draw4'?4:0,total=amount+(previousPenalty?penaltyCount(t):0);
  const played=event(t,'play',id,{card,color:t.color,uno:declared,jump:!!options.jump,from:options.from||null,stacked:!!previousPenalty,stackTotal:total||null,skipped:f.value==='skip'||(f.value==='reverse'&&t.players.length===2)?next(t,id):null});
  if(options.jump)t.lastJump=played;
  if(f.value==='draw2'||f.value==='draw4'){
    target=next(t,id);t.pending={kind:f.value,count:total,chain:[...(previousPenalty?.chain||[]),{actor:id,card,amount}],offender:id,victim:target,illegal,handBefore: f.value==='draw4'?handBefore:undefined,previousColor:oldColor,finisher:p.cards.length===0?id:null};setTurn(t,target);return;
  }
  if(!p.cards.length){settle(t,id);return;}setTurn(t,target);openJump(t,card);
}
export function chooseOpeningColor(t,id,color){requireTurn(t,id);if(t.pending?.kind!=='openingColor'||!COLORS.includes(color))throw Error('现在无需选择开局颜色。');t.color=color;t.pending=null;t.deadline=Date.now()+TURN_MS;event(t,'color',id,{color});}
export function draw(t,id){requireTurn(t,id);if(jumpOpen(t))throw Error('抢出响应窗口中，请稍候再摸牌。');clearJump(t);if(t.pending)throw Error('请先处理加牌或选择颜色。');if(t.drawn!==null)throw Error('你已摸牌，请出刚摸到的牌或结束回合。');beginAction(t);t.armed=null;const out=take(t,id,1);note(t,`${playerLabel(t,id)}摸 1 张。`);if(out.length&&playable(t,id,out[0])){t.drawn=out[0];t.deadline=Date.now()+TURN_MS;}else setTurn(t,next(t));event(t,'draw',id,{count:out.length,canPlay:t.turn===id&&t.drawn!==null});return out;}
export function pass(t,id){requireTurn(t,id);if(t.pending||t.drawn===null)throw Error('只能在摸到可出牌后选择保留。');beginAction(t);setTurn(t,next(t));note(t,`${playerLabel(t,id)}保留刚摸到的牌，结束回合。`);event(t,'pass',id);}
export function accept(t,id){requireTurn(t,id);const p=t.pending;if(!p||!['draw2','draw4'].includes(p.kind)||p.victim!==id)throw Error('现在没有加牌惩罚。');const count=penaltyCount(t);beginAction(t);const actual=take(t,id,count).length;t.pending=null;note(t,`${playerLabel(t,id)}接受 ${count} 张并跳过回合。`);event(t,'accept',id,{count,actual});if(p.finisher){settle(t,p.finisher);return;}setTurn(t,next(t,id));}
export function challenge(t,id){requireTurn(t,id);const p=t.pending;if(p?.kind!=='draw4'||p.victim!==id)throw Error('只有承受 +4 的玩家可质疑。');const count=penaltyCount(t);beginAction(t);const revealed=[...p.handBefore];t.pending=null;const penalty=p.illegal?count:count+2;
 if(p.illegal){take(t,p.offender,penalty);note(t,`${playerLabel(t,id)}质疑成功：${playerLabel(t,p.offender)}罚摸 ${penalty} 张。`);event(t,'challenge',id,{success:true,target:p.offender,count:penalty});setTurn(t,id);}
 else{take(t,id,penalty);note(t,`${playerLabel(t,id)}质疑失败，摸 ${penalty} 张并跳过回合。`);event(t,'challenge',id,{success:false,target:p.offender,count:penalty});if(p.finisher)settle(t,p.finisher);else setTurn(t,next(t,id));}
 return {success:p.illegal,cards:revealed,previousColor:p.previousColor,penalty,total:count};
}
export function declareUno(t,id){const p=player(t,id);if(t.phase!=='active')throw Error('本局尚未进行。');if(t.unoOpportunity?.player===id&&p.cards.length===1){t.unoOpportunity=null;note(t,`${playerLabel(t,id)}补喊 UNO！`);event(t,'uno',id);return;}
  if(t.turn!==id||p.cards.length!==2||(t.pending&&!legalCards(t,id).length))throw Error('请在轮到自己且剩两张时宣告，或在漏喊后立即补喊。');t.armed=id;note(t,`${playerLabel(t,id)}已准备 UNO 宣告。`);event(t,'uno',id);
}
export function catchUno(t,id){player(t,id);const o=t.unoOpportunity;if(t.phase!=='active'||!o||o.player===id||player(t,o.player).cards.length!==1)throw Error('目前没有可抓的漏喊 UNO。');take(t,o.player,2);t.unoOpportunity=null;note(t,`${playerLabel(t,id)}抓到 ${playerLabel(t,o.player)}漏喊 UNO，罚摸 2 张。`);event(t,'catch',id,{target:o.player,count:2});}
export function close(t,id,admin=false){if(id!==t.owner&&!admin)throw Error('只有桌主或管理员可关桌。');t.phase='closed';t.turn=null;t.deadline=null;t.idleDeadline=null;t.pending=null;clearJump(t);t.deck=[];t.discard=[];for(const p of t.players)p.cards=[];t.armed=null;t.unoOpportunity=null;}
export function timeout(t){if(t.phase!=='active'||!t.deadline||Date.now()<t.deadline)return false;const id=t.turn;
  if(t.pending?.kind==='openingColor')chooseOpeningColor(t,id,bestColor(player(t,id).cards));else if(t.pending)accept(t,id);else if(t.drawn!==null)pass(t,id);else {draw(t,id);if(t.turn===id&&t.drawn!==null)pass(t,id);}note(t,`${playerLabel(t,id)}超时，已自动处理。`);event(t,'timeout',id);return true;}
export function bestColor(cards){return COLORS.reduce((best,c)=>cards.filter(x=>face(x).color===c).length>cards.filter(x=>face(x).color===best).length?c:best,COLORS[0]);}
export function computerTurn(t){const p=t.players.find(p=>p.id===t.turn&&p.bot);if(!p||t.phase!=='active'||jumpOpen(t))return false;
  if(t.unoOpportunity&&t.unoOpportunity.player!==p.id)catchUno(t,p.id);
  if(t.pending?.kind==='openingColor')chooseOpeningColor(t,p.id,bestColor(p.cards));else{
    const available=legalCards(t,p.id).filter(c=>face(c).value!=='draw4'||!p.cards.some(x=>face(x).color===t.color));
    const card=available.sort((a,b)=>points(b)-points(a))[0];
    if(card!==undefined){if(p.cards.length===2)declareUno(t,p.id);play(t,p.id,card,bestColor(p.cards));}
    else if(t.pending)accept(t,p.id);else if(t.drawn!==null)pass(t,p.id);else draw(t,p.id);
  }return true;
}
