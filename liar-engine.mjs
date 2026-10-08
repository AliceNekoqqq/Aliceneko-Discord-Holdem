// Classic Liar's Deck adapted for Discord. Hidden cards/chambers stay in the DO.
export const TURN_MS=60000,LOBBY_MS=600000,IDLE_MS=900000,MAX_MS=1800000,SETTLED_MS=900000;
export const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const pick=(n,rng)=>Math.floor(rng()*n);
export const rank=c=>c<6?'A':c<12?'K':c<18?'Q':'JOKER';
export const cardName=c=>rank(c)==='JOKER'?'🃏 Joker':rank(c);
export const name=p=>String(p?.name||'玩家').replace(/[\x00-\x1f\\`*_~>|\[\]]/g,'').slice(0,24);
export const living=t=>t.players.filter(p=>p.alive);
const log=(t,line)=>{t.log=[...t.log,line].slice(-5);};
function shuffle(cards,rng){for(let n=cards.length-1;n>0;n--){const k=pick(n+1,rng);[cards[k],cards[n]]=[cards[n],cards[k]];}return cards;}
function seat(id,nick,bot=false){return {id,name:nick,bot,alive:true,cards:[],shots:0,chamber:null,forfeit:false,timeouts:0,entrancePending:!bot};}
export function create(owner,channel,guild,nick,now=Date.now()){
 return {game:'liar',epoch:crypto.randomUUID().replaceAll('-','').slice(0,16),version:0,owner,channel,guild,phase:'lobby',players:[seat(owner,nick)],handNo:0,tableRank:null,turn:null,pending:null,discard:[],stock:[],reveal:null,lastAction:null,log:[],lastActive:now,idleDeadline:now+LOBBY_MS,deadline:null,stageDue:null,endAt:null,computerDue:null,readyDue:null,winner:null,result:null,events:[]};
}
export function join(t,id,nick,now=Date.now()){
 if(!['lobby','settled'].includes(t.phase))throw Error('本局进行中，请等待结算。');
 if(t.players.some(p=>p.id===id))throw Error('你已经入座。');if(t.players.length>=4)throw Error('酒馆已满，最多4人。');t.players.push(seat(id,nick));t.readyDue=null;t.players.forEach(p=>p.ready=false);touch(t,now);log(t,`${name(t.players.at(-1))} 入座。`);
}
export function leave(t,id,now=Date.now()){
 if(!['lobby','settled'].includes(t.phase))throw Error('本局进行中，请使用认输。');const p=t.players.find(p=>p.id===id&&!p.bot);if(!p)throw Error('你没有入座。');t.players=t.players.filter(p=>p.id!==id);if(t.owner===id)t.owner=t.players.find(p=>!p.bot)?.id;t.players.forEach(p=>p.ready=false);t.readyDue=null;touch(t,now);if(!t.owner)close(t,'所有真人已离桌。');
}
export function addBots(t,id,count=1,now=Date.now()){
 if(id!==t.owner||!['lobby','settled'].includes(t.phase))throw Error('桌主可在等待或结算时管理陪练。');if(!Number.isInteger(count)||count<1||count>3||t.players.length+count>4)throw Error('最多4个座位，请选择1～3位电脑。');
 for(let n=0;n<count;n++){let k=1;while(t.players.some(p=>p.id===`bot-${k}`))k++;t.players.push(seat(`bot-${k}`,`酒客${k}`,true));}t.readyDue=null;t.players.forEach(p=>p.ready=false);touch(t,now);
}
export function removeBots(t,id,now=Date.now()){if(id!==t.owner||!['lobby','settled'].includes(t.phase))throw Error('桌主可在等待或结算时管理陪练。');t.players=t.players.filter(p=>!p.bot);t.readyDue=null;t.players.forEach(p=>p.ready=false);touch(t,now);}
export function touch(t,now=Date.now()){t.lastActive=now;t.idleDeadline=now+(['lobby','settled'].includes(t.phase)?t.phase==='lobby'?LOBBY_MS:SETTLED_MS:IDLE_MS);}
function event(t,kind,actor,extra={}){t.lastAction={kind,actor,seq:(t.lastAction?.seq||0)+1,...extra};}
export function close(t,reason){t.phase='closed';t.closeReason=reason;t.turn=null;t.deadline=null;t.idleDeadline=null;t.stageDue=null;t.readyDue=null;t.endAt=null;t.computerDue=null;}
export function ready(t,id,now=Date.now()){
 if(!['lobby','settled'].includes(t.phase))throw Error('本局尚未结束。');const p=t.players.find(p=>p.id===id&&!p.bot);if(!p)throw Error('请先入座。');p.ready=!p.ready;touch(t,now);t.readyDue=t.players.length>=2&&t.players.every(p=>p.bot||p.ready)?now+5000:null;
}
export function start(t,id,rng=random,now=Date.now()){
 if(id!==t.owner||!['lobby','settled'].includes(t.phase)||t.players.length<2||t.players.length>4)throw Error('桌主可在至少2人入座后开局。');
 for(const p of t.players){Object.assign(p,{alive:true,cards:[],shots:0,chamber:pick(6,rng)+1,forfeit:false,timeouts:0,ready:false});}
 t.result=null;t.winner=null;t.readyDue=null;t.endAt=now+MAX_MS;t.startedAt=now;t.eliminations=[];t.matchNo=(t.matchNo||0)+1;t.handNo=0;touch(t,now);deal(t,t.players[pick(t.players.length,rng)].id,rng,now);
}
function nextAlive(t,from,predicate=()=>true){const n=t.players.findIndex(p=>p.id===from);for(let k=1;k<=t.players.length;k++){const p=t.players[(n+k)%t.players.length];if(p.id!==from&&p.alive&&predicate(p))return p;}return null;}
function deal(t,first,rng,now){
 const alive=living(t);if(alive.length<2)return finish(t,now);
 const deck=shuffle(Array.from({length:20},(_,i)=>i),rng);t.players.forEach(p=>p.cards=p.alive?deck.splice(0,5):[]);t.stock=deck;t.discard=[];t.pending=null;t.forced=false;t.reveal=null;t.stageDue=null;t.phase='active';t.handNo++;t.tableRank=['A','K','Q'][pick(3,rng)];t.turn=alive.some(p=>p.id===first)?first:alive[0].id;t.deadline=now+TURN_MS;event(t,'start',t.turn,{rank:t.tableRank});log(t,`第${t.handNo}轮 · ${t.tableRank}桌，${name(t.players.find(p=>p.id===t.turn))} 先出牌。`);
}
function acting(t,id){const p=t.players.find(p=>p.id===id);if(t.phase!=='active'||t.turn!==id||!p?.alive)throw Error('现在不是你的回合。');return p;}
export function play(t,id,indices,now=Date.now()){
 const p=acting(t,id);if(t.forced)throw Error('只剩一人持牌，必须质疑上一手。');
 if(!Array.isArray(indices)||indices.length<1||indices.length>3||new Set(indices).size!==indices.length||indices.some(n=>!Number.isInteger(n)||n<0||n>=p.cards.length))throw Error('请选择自己手中的1～3张牌。');
 const cards=indices.map(n=>p.cards[n]);if(t.pending)t.discard.push(...t.pending.cards);for(const n of [...indices].sort((a,b)=>b-a))p.cards.splice(n,1);
 t.pending={actor:id,cards,count:cards.length,rank:t.tableRank};t.reveal=null;t.forced=living(t).filter(q=>q.cards.length).length<=1;
 const next=nextAlive(t,id,q=>q.cards.length)||nextAlive(t,id);if(!next)throw Error('没有可行动玩家。');t.turn=next.id;t.deadline=now+TURN_MS;p.timeouts=0;event(t,'play',id,{count:cards.length,rank:t.tableRank});log(t,`${name(p)} 盖下${cards.length}张「${t.tableRank}」，轮到${name(next)}。`);
}
export function believe(t,id,now=Date.now()){
 const p=acting(t,id);if(!t.pending)throw Error('没有待质疑的牌，请直接出牌。');if(t.forced)throw Error('只剩一人持牌，必须质疑上一手。');if(!p.cards.length)throw Error('本轮没有手牌。');t.discard.push(...t.pending.cards);t.pending=null;p.timeouts=0;event(t,'believe',id);log(t,`${name(p)} 相信上一手，准备出牌。`); // Same turn; choosing believe does not extend its deadline.
}
export function challenge(t,id,now=Date.now()){
 const challenger=acting(t,id);const last=t.pending;if(!last||last.actor===id)throw Error('没有可质疑的上一手。');const honest=last.cards.every(c=>rank(c)===t.tableRank||rank(c)==='JOKER');const loser=honest?id:last.actor;challenger.timeouts=0;
 t.reveal={actor:last.actor,challenger:id,cards:[...last.cards],honest,loser,resolved:false,dead:null};t.discard.push(...last.cards);t.pending=null;t.phase='roulette';t.turn=null;t.deadline=null;t.computerDue=null;t.stageDue=now+2200;t.nextFirst=loser;event(t,'challenge',id,{actor:last.actor,honest,loser,cards:[...t.reveal.cards]});log(t,`${name(t.players.find(p=>p.id===id))} 质疑！翻出 ${t.reveal.cards.map(cardName).join(' / ')}：${honest?'是真话，质疑者':'抓到谎言，出牌者'}接受轮盘。`);
}
function finish(t,now){
 const alive=living(t);if(alive.length!==1){close(t,'本局取消，没有存活玩家。');return;}
 t.phase='settled';t.winner=alive[0].id;t.turn=null;t.deadline=null;t.stageDue=null;t.computerDue=null;t.endAt=null;t.settledAt=now;t.idleDeadline=now+SETTLED_MS;t.players.forEach(p=>p.ready=false);event(t,'result',t.winner);log(t,`${name(alive[0])} 成为最后的酒客，赢得本局！`);
 if(t.players.every(p=>!p.bot))t.result={id:`${t.epoch}-m${t.matchNo}:${t.handNo}`,guild:t.guild,at:now,mode:'round',players:t.players.map(p=>({id:p.id,name:p.name,bot:false,won:p.id===t.winner,surrendered:p.forfeit}))};
}
export function forfeit(t,id,now=Date.now(),reason='认输'){
 if(!['active','roulette','intermission'].includes(t.phase))throw Error('本局尚未开始或已经结束。');const p=t.players.find(p=>p.id===id&&!p.bot);if(!p?.alive)throw Error('你已经出局。');
 p.alive=false;p.forfeit=true;t.eliminations.push(id);log(t,`${name(p)} ${reason}，离开本局。`);
 // Retire the current round on withdrawal; never reveal unchallenged hands.
 if(t.pending)t.discard.push(...t.pending.cards);t.pending=null;t.forced=false;t.reveal={actor:id,challenger:null,cards:[],honest:null,loser:id,resolved:true,dead:true,forfeit:true};event(t,'forfeit',id);t.turn=null;t.deadline=null;t.computerDue=null;
 if(living(t).length<=1)finish(t,now);else{t.phase='intermission';t.stageDue=now+2600;t.nextFirst=nextAlive(t,id)?.id;}
}
export function advance(t,rng=random,now=Date.now()){
 if(t.phase==='roulette'&&t.stageDue<=now){const p=t.players.find(p=>p.id===t.reveal.loser);p.shots++;const dead=p.shots>=p.chamber;p.alive=!dead;t.reveal.resolved=true;t.reveal.dead=dead;if(dead)t.eliminations.push(p.id);log(t,`${name(p)} 第${p.shots}次轮盘：${dead?'💥 出局':'咔哒……安全'}。`);event(t,'roulette',p.id,{dead,shots:p.shots});
  if(living(t).length<=1)finish(t,now);else{t.phase='intermission';t.stageDue=now+2600;}return true;
 }
 if(t.phase==='intermission'&&t.stageDue<=now){deal(t,t.nextFirst,rng,now);return true;}
 if(t.readyDue&&t.readyDue<=now&&['lobby','settled'].includes(t.phase)){start(t,t.owner,rng,now);return true;}return false;
}
export function expire(t,now=Date.now()){
 if(t.phase==='closed')return false;if(t.idleDeadline&&now>=t.idleDeadline){close(t,['lobby','settled'].includes(t.phase)?'牌桌空闲超时，已自动打烊。':'15分钟无人有效操作，本局取消。');return true;}
 if(t.endAt&&now>=t.endAt){close(t,'本局超过30分钟，已取消。');return true;}return false;
}
export function timeout(t,now=Date.now()){
 if(t.phase!=='active'||!t.deadline||now<t.deadline)return false;const p=t.players.find(p=>p.id===t.turn);if(p.bot)return computerTurn(t,random,now);const count=(p.timeouts||0)+1;
 if(count>=2){forfeit(t,p.id,now,'连续两次超时');return true;}
 if(t.pending)challenge(t,p.id,now);else play(t,p.id,[0],now);p.timeouts=count;log(t,`${name(p)} 超时，自动${t.phase==='roulette'?'质疑':'出牌'}；再超时将认输。`);return true;
}
// Computer policy is passed a public projection plus its own hand, never another hand or chamber.
export function computerView(t,id){const p=t.players.find(p=>p.id===id);return {phase:t.phase,turn:t.turn,tableRank:t.tableRank,forced:t.forced,ownCards:[...(p?.cards||[])],pending:t.pending?{actor:t.pending.actor,count:t.pending.count}:null,seats:t.players.map(q=>({id:q.id,count:q.cards.length,alive:q.alive,shots:q.shots}))};}
export function computerDecision(view,rng=random){
 if(view.pending&&(view.forced||rng()<Math.min(.6,.12+view.pending.count*.13)))return {kind:'challenge'};
 const good=view.ownCards.map((c,i)=>({c,i})).filter(x=>rank(x.c)===view.tableRank||rank(x.c)==='JOKER'),bad=view.ownCards.map((c,i)=>({c,i})).filter(x=>rank(x.c)!==view.tableRank&&rank(x.c)!=='JOKER');
 const pool=bad.length&&rng()<.35?bad:good.length?good:bad;return {kind:'play',indices:shuffle(pool.map(x=>x.i),rng).slice(0,Math.min(pool.length,pick(3,rng)+1))};
}
export function computerTurn(t,rng=random,now=Date.now()){const p=t.players.find(p=>p.id===t.turn&&p.bot);if(t.phase!=='active'||!p)return false;const d=computerDecision(computerView(t,p.id),rng);if(d.kind==='challenge')challenge(t,p.id,now);else play(t,p.id,d.indices,now);return true;}
