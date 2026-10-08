import {beginTavernRound,noteTavernAction} from './tavern-catalog.mjs';
export const TURN_MS = 60000;
export const BUYIN = 2000;
const fail = text => { throw new Error(text); };
const live = t => t.players.filter(p => p.inHand && !p.folded);
const movable = t => live(t).filter(p => p.stack > 0);
export const cardText = c => ['♠','♥','♦','♣'][Math.floor(c/13)] + ['2','3','4','5','6','7','8','9','10','J','Q','K','A'][c%13];
export const cardsText = cards => cards.map(cardText).join(' ');
export function newTable(owner, channel, guild, epoch = crypto.randomUUID()) {
  const now=Date.now();return {owner,channel,guild,epoch,version:0,players:[player(owner)],phase:'lobby',handNo:0,dealer:-1,board:[],pot:0,currentBet:0,minRaise:20,turn:null,deadline:null,messageId:null,log:['牌桌已创建'],result:[],lastActive:now,ownerSeenAt:now,settledAt:null};
}
function player(id) { return {id,stack:BUYIN,inHand:false,folded:false,round:0,total:0,cards:[],actedAt:null,pending:false,timeoutStreak:0,away:false,ready:false,leaveAfterHand:false}; }
export const playerLabel = (t,id) => t.players.find(p=>p.id===id)?.bot ? `🤖 电脑${id.split(':')[1]}` : `<@${id}>`;
function note(t,text) { t.log.push(text); t.log=t.log.slice(-5); }
export const participants=t=>t.players.filter(p=>!p.away&&!p.leaveAfterHand&&(p.stack>0||p.bot));
export const canStart=t=>participants(t).length>=2&&participants(t).some(p=>!p.bot);
export function resetReady(t){for(const p of t.players)p.ready=false;t.readyDue=null;}
export function updateReady(t,now=Date.now()){
  const eligible=participants(t),humans=eligible.filter(p=>!p.bot);
  if(!['lobby','settled'].includes(t.phase)||eligible.length<2||!humans.length||humans.some(p=>!p.ready))t.readyDue=null;
  else t.readyDue??=now+5000;
}
export function toggleReady(t,id,now=Date.now()){
  if(!['lobby','settled'].includes(t.phase))fail('本手还没结束。');
  const p=t.players.find(p=>p.id===id&&!p.bot);if(!p||p.away||p.stack<=0)fail('请先入座、恢复参与或补充筹码。');
  p.ready=!p.ready;updateReady(t,now);note(t,`${playerLabel(t,id)} ${p.ready?'已准备':'取消准备'}`);
}
export function resume(t,id){
  if(!['lobby','settled'].includes(t.phase))fail('本手结束后才能恢复参与。');
  const p=t.players.find(p=>p.id===id&&!p.bot);if(!p?.away)fail('你目前没有暂离。');
  p.away=false;p.awayAfterHand=false;p.timeoutStreak=0;resetReady(t);note(t,`${playerLabel(t,id)} 恢复参与`);
}
export function queueLeave(t,id){
  const p=t.players.find(p=>p.id===id&&!p.bot);if(!p)fail('你没有加入牌桌。');
  if(['lobby','settled'].includes(t.phase)){leave(t,id);return;}
  if(t.phase==='closed')fail('牌桌已关闭。');
  p.leaveAfterHand=!p.leaveAfterHand;note(t,`${playerLabel(t,id)} ${p.leaveAfterHand?'预约本手结束后离桌':'取消预约离桌'}`);
}
function removeSeats(t,ids,now=Date.now()){
  const old=t.players,anchor=t.dealer;t.players=old.filter(p=>!ids.includes(p.id));
  t.dealer=-1;
  if(anchor>=0&&t.players.length)for(let n=0;n<old.length;n++){const p=old[(anchor-n+old.length)%old.length],index=t.players.indexOf(p);if(index>=0){t.dealer=index;break;}}
  if(ids.includes(t.owner)){t.owner=t.players.find(p=>!p.bot)?.id||null;t.ownerSeenAt=now;t.takeoverNoticeFor=null;}
  resetReady(t);
}
export function addComputers(t,id,count=1) {
  if(id!==t.owner) fail('只有桌主可以添加电脑玩家。');
  if(!['lobby','settled'].includes(t.phase)) fail('请等本手结束后再添加电脑。');
  if(!Number.isInteger(count)||count<1||count>8||t.players.length+count>9) fail('牌桌最多 9 个座位，请减少电脑数量。');
  for(let n=0;n<count;n++) {let seat=1;while(t.players.some(p=>p.id===`cpu:${seat}`))seat++;t.players.push({...player(`cpu:${seat}`),bot:true});}
  resetReady(t);
  note(t,`添加 ${count} 位电脑陪练`);
}
export function removeComputers(t,id) {
  if(id!==t.owner) fail('只有桌主可以移除电脑玩家。');
  if(!['lobby','settled'].includes(t.phase)) fail('请等本手结束后再移除电脑。');
  removeSeats(t,t.players.filter(p=>p.bot).map(p=>p.id));note(t,'电脑玩家已离桌');
}
export function join(t,id) {
  if(t.phase==='closed') fail('牌桌已关闭，请重新创建。');
  if(t.players.some(p=>p.id===id)) fail('你已经在牌桌上。');
  if(t.players.length>=9) fail('牌桌已满，最多 9 人。');
  if(!['lobby','settled'].includes(t.phase)) fail('请等本手结束后再加入。');
  t.players.push(player(id));resetReady(t);note(t,`<@${id}> 加入牌桌`);
}
export function leave(t,id) {
  if(!['lobby','settled'].includes(t.phase)) fail('请等本手结束后再离桌。');
  if(!t.players.some(p=>p.id===id)) fail('你没有加入牌桌。');
  removeSeats(t,[id]);
  if(!t.players.some(p=>!p.bot)) close(t,t.owner);note(t,`<@${id}> 离桌`);
}
export function rebuy(t,id) {
  if(!['lobby','settled'].includes(t.phase)) fail('本手结束后才能补充筹码。');
  const p=t.players.find(p=>p.id===id);if(!p) fail('请先加入牌桌。');
  if(p.stack!==0) fail('筹码耗尽后才能免费补充。');p.stack=BUYIN;resetReady(t);note(t,`${playerLabel(t,id)} 补充 ${BUYIN} 筹码`);
}
export function close(t,id,admin=false) {
  if(id!==t.owner&&!admin) fail('只有桌主或管理员可以关闭牌桌。');
  // Return every uncompleted bet so closing cannot award a pot selectively.
  if(!['lobby','settled','closed'].includes(t.phase)) for(const p of t.players) {p.stack+=p.total;p.total=0;p.round=0;}
  t.phase='closed';t.pot=0;t.turn=null;t.deadline=null;t.computerDue=null;t.deck=[];resetReady(t);
  for(const p of t.players) p.cards=[];note(t,'牌桌已关闭；未完成手牌的下注已退回');
}
function nextSeat(t,from,predicate) {
  for(let n=1;n<=t.players.length;n++) {const i=(from+n+t.players.length)%t.players.length;if(predicate(t.players[i]))return i;}return -1;
}
function pay(t,p,amount) { const chips=Math.min(amount,p.stack);p.stack-=chips;p.round+=chips;p.total+=chips;t.pot+=chips;return chips; }
export function shuffledDeck(random = () => {const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0];}) {
  const deck=Array.from({length:52},(_,i)=>i);
  for(let i=51;i>0;i--) {const n=i+1,limit=2**32-(2**32%n);let v;do{v=random();}while(v>=limit);const j=v%n;[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;
}
export function start(t,id,deck=shuffledDeck(),now=Date.now()) {
  if(id!==t.owner) fail('只有桌主可以开始下一手。');
  if(!['lobby','settled'].includes(t.phase)) fail('本手还没结束。');
  if(!canStart(t)) fail('至少需要 2 位参与玩家，其中至少一位有筹码的真人。');
  if(deck.length!==52||new Set(deck).size!==52||deck.some(c=>!Number.isInteger(c)||c<0||c>51)) fail('牌组不完整。');
  for(const p of t.players)if(p.bot&&p.stack===0&&!p.away)p.stack=BUYIN;
  beginTavernRound(t,now);t.tavernResult=null;
  resetReady(t);t.deck=[...deck];t.board=[];t.pot=0;t.result=[];t.pots=[];t.settlements=[];t.showdown=[];t.handNo++;t.phase='preflop';t.currentBet=20;t.minRaise=20;t.settledAt=null;
  for(const p of t.players){const playing=p.stack>0&&!p.away&&!p.leaveAfterHand;Object.assign(p,{startStack:p.stack,inHand:playing,folded:false,round:0,total:0,cards:[],actedAt:null,pending:playing,timedOutAt:null,awayAfterHand:false});}
  t.dealer=nextSeat(t,t.dealer,p=>p.inHand);
  t.dealerId=t.players[t.dealer].id;
  const sb=live(t).length===2?t.dealer:nextSeat(t,t.dealer,p=>p.inHand);
  const bb=nextSeat(t,sb,p=>p.inHand);
  t.smallBlindId=t.players[sb].id;t.bigBlindId=t.players[bb].id;
  for(let round=0;round<2;round++) {let seat=t.dealer;for(let count=0;count<live(t).length;count++){seat=nextSeat(t,seat,p=>p.inHand);t.players[seat].cards.push(t.deck.pop());}}
  pay(t,t.players[sb],10);pay(t,t.players[bb],20);
  for(const p of t.players) if(p.stack===0) p.pending=false;
  note(t,`第 ${t.handNo} 手 · 小盲 ${playerLabel(t,t.players[sb].id)} / 大盲 ${playerLabel(t,t.players[bb].id)}`);
  advance(t,bb,now);
}
export function legal(t,id) {
  const p=t.players.find(p=>p.id===id);
  if(!p||!p.inHand||p.folded||p.stack===0||t.turn!==id) fail('现在不是你的行动回合。');
  const canRaise=p.actedAt===null||t.currentBet-p.actedAt>=t.minRaise;
  return {p,call:Math.max(0,t.currentBet-p.round),canRaise,minTotal:t.currentBet+t.minRaise,maxTotal:p.round+p.stack};
}
export function act(t,id,kind,target,now=Date.now(),automatic=false) {
  const {p,call,canRaise,minTotal,maxTotal}=legal(t,id);const seat=t.players.indexOf(p);
  if(kind==='fold') {p.folded=true;p.pending=false;note(t,`${playerLabel(t,id)} 弃牌`);}
  else if(kind==='check'||kind==='call') {
    if(kind==='check'&&call>0) fail('需要跟注，不能过牌。');
    const amount=pay(t,p,call);p.pending=false;p.actedAt=t.currentBet;note(t,`${playerLabel(t,id)} ${amount?'跟注 '+amount:'过牌'}`);
  } else if(kind==='raise'||kind==='allin') {
    const to=kind==='allin'?maxTotal:target;
    if(!Number.isSafeInteger(to)||to<=p.round||to>maxTotal) fail('加注金额必须是可用筹码范围内的整数。');
    if(to<=t.currentBet) {if(kind!=='allin')fail('加注总额必须高于当前下注。');pay(t,p,to-p.round);p.pending=false;p.actedAt=t.currentBet;note(t,`${playerLabel(t,id)} 全下跟注`);}
    else {
      if(!canRaise) fail('这次短全下未重新开放你的加注权，只能跟注或弃牌。');
      if(to<minTotal&&to!==maxTotal) fail(`本轮总下注至少 ${minTotal}；不足时只能全下。`);
      const increase=to-t.currentBet,full=increase>=t.minRaise;pay(t,p,to-p.round);t.currentBet=to;if(full)t.minRaise=increase;
      for(const other of movable(t)) if(other!==p&&(full||other.round<t.currentBet))other.pending=true;
      p.pending=false;p.actedAt=to;note(t,`${playerLabel(t,id)} ${kind==='allin'?'全下':'加注至'} ${to}`);
    }
  } else fail('未知操作。');
  if(!p.bot&&!automatic){noteTavernAction(t,id);p.timedOutAt=null;p.timeoutStreak=0;p.awayAfterHand=false;t.lastActive=now;}
  advance(t,seat,now);
}
function advance(t,seat,now) {
  if(live(t).length===1) {awardPots(t,null);finish(t,now);return;}
  const active=movable(t);
  // Nobody can bet into a dry side pot. The last player still owes a call, if any.
  if(active.length===1&&active[0].round>=t.currentBet) active[0].pending=false;
  const next=nextSeat(t,seat,p=>p.inHand&&!p.folded&&p.stack>0&&p.pending);
  if(next!==-1) {t.turn=t.players[next].id;t.deadline=now+(t.players[next].awayAfterHand?0:TURN_MS);return;}
  if(t.phase==='river') {showdown(t,now);return;}
  t.deck.pop(); // burn before each street
  if(t.phase==='preflop') {t.board.push(t.deck.pop(),t.deck.pop(),t.deck.pop());t.phase='flop';}
  else {t.board.push(t.deck.pop());t.phase=t.phase==='flop'?'turn':'river';}
  t.currentBet=0;t.minRaise=20;
  for(const p of t.players) {p.round=0;p.actedAt=null;p.pending=p.inHand&&!p.folded&&p.stack>0;}
  if(movable(t).length<=1) for(const p of t.players)p.pending=false;
  note(t,`${{flop:'翻牌',turn:'转牌',river:'河牌'}[t.phase]}：${cardsText(t.board)}`);
  advance(t,t.dealer,now);
}
export const HAND_NAMES=['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
export function rankFive(cards) {
  const ranks=cards.map(c=>c%13+2).sort((a,b)=>b-a);const counts=new Map();for(const r of ranks)counts.set(r,(counts.get(r)||0)+1);
  const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);const unique=[...new Set(ranks)];
  const flush=cards.every(c=>Math.floor(c/13)===Math.floor(cards[0]/13));
  let straight=0;if(unique.length===5){if(unique[0]-unique[4]===4)straight=unique[0];else if(unique.join(',')==='14,5,4,3,2')straight=5;}
  if(flush&&straight)return [8,straight];if(groups[0][1]===4)return [7,groups[0][0],groups[1][0]];
  if(groups[0][1]===3&&groups[1][1]===2)return [6,groups[0][0],groups[1][0]];
  if(flush)return [5,...ranks];if(straight)return [4,straight];
  if(groups[0][1]===3)return [3,groups[0][0],...groups.slice(1).map(g=>g[0])];
  if(groups[0][1]===2&&groups[1][1]===2)return [2,...groups.slice(0,2).map(g=>g[0]).sort((a,b)=>b-a),groups[2][0]];
  if(groups[0][1]===2)return [1,groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)];return [0,...ranks];
}
export function compare(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const diff=(a[i]||0)-(b[i]||0);if(diff)return diff;}return 0;}
export function bestSeven(cards){let best=null,chosen=null;for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){const five=[cards[a],cards[b],cards[c],cards[d],cards[e]],rank=rankFive(five);if(!best||compare(rank,best)>0){best=rank;chosen=five;}}return {rank:best,cards:chosen};}
export const rankSeven=cards=>bestSeven(cards).rank;
export function describeRank(rank){
  const r=n=>['','','2','3','4','5','6','7','8','9','10','J','Q','K','A'][n],kick=values=>values.map(r).join('、');
  switch(rank[0]){
    case 0:return `高牌 ${r(rank[1])} · 比较 ${kick(rank.slice(1))}`;
    case 1:return `一对 ${r(rank[1])} · 踢脚 ${kick(rank.slice(2))}`;
    case 2:return `两对 ${r(rank[1])}/${r(rank[2])} · 踢脚 ${r(rank[3])}`;
    case 3:return `三条 ${r(rank[1])} · 踢脚 ${kick(rank.slice(2))}`;
    case 4:return `顺子 · ${r(rank[1])} 最大`;
    case 5:return `同花 · 比较 ${kick(rank.slice(1))}`;
    case 6:return `葫芦 · 三张 ${r(rank[1])} 带两张 ${r(rank[2])}`;
    case 7:return `四条 ${r(rank[1])} · 踢脚 ${r(rank[2])}`;
    case 8:return `同花顺 · ${r(rank[1])} 最大`;
  }
}
export function showdown(t,now=Date.now()) {
  const hands=new Map(live(t).map(p=>[p.id,bestSeven([...p.cards,...t.board])]));
  awardPots(t,hands);
  t.showdown=live(t).map(p=>({id:p.id,label:playerLabel(t,p.id),cards:[...p.cards],best:[...hands.get(p.id).cards],rank:HAND_NAMES[hands.get(p.id).rank[0]],detail:describeRank(hands.get(p.id).rank)}));finish(t,now);
}
function awardPots(t,hands){
  const levels=[...new Set(t.players.map(p=>p.total).filter(n=>n>0))].sort((a,b)=>a-b);let previous=0,index=0;t.result=[];t.pots=[];
  for(const level of levels){const contributors=t.players.filter(p=>p.total>=level);const amount=(level-previous)*contributors.length;previous=level;
    if(contributors.length===1){const p=contributors[0];p.stack+=amount;t.pots.push({name:'未跟注退回',amount,winners:[{id:p.id,label:playerLabel(t,p.id),amount}],reason:'超过其他玩家下注的部分原数退回'});continue;}
    const eligible=contributors.filter(p=>p.inHand&&!p.folded);if(!eligible.length)fail('底池没有有效玩家。');
    let best=null;if(hands)for(const p of eligible){const rank=hands.get(p.id).rank;if(!best||compare(rank,best)>0)best=rank;}
    const winners=eligible.filter(p=>!hands||compare(hands.get(p.id).rank,best)===0).sort((a,b)=>((t.players.indexOf(a)-t.dealer-1+t.players.length)%t.players.length)-((t.players.indexOf(b)-t.dealer-1+t.players.length)%t.players.length));
    const pot={name:index++===0?'主池':`边池 ${index-1}`,amount,winners:[],reason:hands?describeRank(best):'其余玩家弃牌',split:winners.length>1};
    const share=Math.floor(amount/winners.length);let remainder=amount%winners.length;
    for(const p of winners){const chips=share+(remainder-->0?1:0);p.stack+=chips;pot.winners.push({id:p.id,label:playerLabel(t,p.id),amount:chips});t.result.push(`${playerLabel(t,p.id)} 获得 ${chips}（${pot.name} · ${hands?HAND_NAMES[best[0]]:'其余玩家弃牌'}）`);}
    t.pots.push(pot);
  }
}
function finish(t,now){
  t.phase='settled';t.settledAt=now;t.turn=null;t.deadline=null;t.deck=[];resetReady(t);
  t.settlements=t.players.filter(p=>p.inHand).map(p=>({id:p.id,label:playerLabel(t,p.id),net:p.stack-(p.startStack??p.stack)}));
  // Preserve public completion before queued leavers are removed from the table.
  t.tavernResult={id:`${t.epoch}:${t.handNo}`,guild:t.guild,at:now,players:t.players.filter(p=>p.inHand).map(p=>({id:p.id,name:p.name||'玩家',bot:!!p.bot,won:p.stack>(p.startStack??p.stack),surrendered:false}))};
  for(const p of t.players){p.pending=false;p.round=0;p.total=0;if(p.awayAfterHand&&!p.leaveAfterHand){p.away=true;note(t,`${playerLabel(t,p.id)} 连续超时，已暂离；恢复后才会参与下一手`);}}
  const departing=t.players.filter(p=>p.leaveAfterHand).map(p=>p.id);if(departing.length){removeSeats(t,departing,now);note(t,'已执行预约离桌');}
  if(!t.players.some(p=>!p.bot)){close(t,t.owner,true);t.closeReason='所有真人已离桌，牌桌自动关闭。';}
  else note(t,'本手结束，准备后可自动开始下一手');
}
export function timeout(t,now=Date.now()){if(t.turn&&t.deadline<=now){const {call,p}=legal(t,t.turn);if(!p.bot){p.timedOutAt=now;p.timeoutStreak=(p.timeoutStreak||0)+1;if(p.timeoutStreak>=2)p.awayAfterHand=true;}act(t,t.turn,call?'fold':'check',null,now,true);note(t,'上一位玩家行动超时，已自动处理');return true;}return false;}
