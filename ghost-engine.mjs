import {beginTavernRound} from './tavern-catalog.mjs';
// Fast Old Maid: thirteen distinct pairs and one unpaired ghost, 1v1 only.
export const TURN_MS=45000,WAIT_MS=180000,MAX_MS=600000,DECIDE_MS=180000;
export const name=p=>String(p?.name||'玩家').replace(/[\x00-\x1f\\`*_~>|\[\]]/g,'').slice(0,24);
export const cardName=c=>c===52?'👻 鬼牌':`${c<13?'♠':'♥'}${['2','3','4','5','6','7','8','9','10','J','Q','K','A'][c%13]}`;
export function shuffle(a,rng=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296){for(let n=a.length-1;n>0;n--){const k=Math.floor(rng()*(n+1));[a[n],a[k]]=[a[k],a[n]];}return a;}
export function removePairs(cards){const keep=[],pairs=[],byRank=new Map();for(const c of cards){if(c===52){keep.push(c);continue;}const rank=c%13;if(byRank.has(rank)){pairs.push([byRank.get(rank),c]);byRank.delete(rank);}else byRank.set(rank,c);}return {cards:[...keep,...byRank.values()],pairs};}
export function create(id,channel,guild,displayName,target=null,now=Date.now()){return {game:'ghost',epoch:crypto.randomUUID(),version:0,handNo:1,owner:id,channel,guild,target,phase:'lobby',players:[{id,name:displayName,cards:[]}],waitUntil:now+WAIT_MS,deadline:null,createdAt:now,log:[],discard:[],turn:null};}
export function start(t,id,displayName,rng,now=Date.now()){
 if(t.phase!=='lobby'||t.waitUntil<=now)throw Error('邀请已过期。');if(t.owner===id)throw Error('请等待另一位玩家加入。');if(t.target&&t.target!==id)throw Error('这是给指定玩家的挑战。');
 beginTavernRound(t,now);t.players.push({id,name:displayName,cards:[]});const deck=shuffle([...Array.from({length:13},(_,i)=>i),...Array.from({length:13},(_,i)=>i+13),52],rng);
 deck.forEach((c,n)=>t.players[n%2].cards.push(c));for(const p of t.players){const clean=removePairs(p.cards);p.cards=shuffle(clean.cards,rng);t.discard.push(...clean.pairs.flat());}
 t.phase='active';t.waitUntil=null;t.turn=t.players[Math.floor((rng?.()??crypto.getRandomValues(new Uint32Array(1))[0]/4294967296)*2)].id;t.deadline=now+TURN_MS;t.endAt=now+MAX_MS;t.log=['发牌完成，开局对子已自动消除。'];checkWin(t,now);
}
export function checkWin(t,now=Date.now()) {const winner=t.players.find(p=>!p.cards.length);if(!winner)return false;finish(t,winner.id,'出完手牌',now);return true;}
export function finish(t,winner,reason,now=Date.now()){t.phase='settled';t.winner=winner;t.loser=t.players.find(p=>p.id!==winner).id;t.turn=null;t.deadline=null;t.endAt=null;t.decideUntil=now+DECIDE_MS;t.closeAt=now+DECIDE_MS;t.log.push(`${name(t.players.find(p=>p.id===winner))} 获胜 · ${reason}`);t.result={id:`${t.epoch}:1`,guild:t.guild,at:now,mode:'round',reason,players:t.players.map(p=>({id:p.id,name:p.name,won:p.id===winner,bot:false,surrendered:reason==='认输'&&p.id!==winner}))};}
export function draw(t,id,index,rng,now=Date.now()){
 if(t.phase!=='active'||t.turn!==id)throw Error('还没轮到你抽牌。');if(t.deadline<=now||t.endAt<=now)throw Error('回合已超时。');const self=t.players.find(p=>p.id===id),other=t.players.find(p=>p.id!==id);
 if(!Number.isInteger(index)||index<0||index>=other.cards.length)throw Error('这张牌背已变化，请按最新手牌选择。');
 const card=other.cards.splice(index,1)[0];self.cards.push(card);const clean=removePairs(self.cards);self.cards=shuffle(clean.cards,rng);other.cards=shuffle(other.cards,rng);t.discard.push(...clean.pairs.flat());
 // Public history never reveals a drawn card or which player holds the ghost.
 t.last={actor:id,paired:clean.pairs.length>0};t.log=[...t.log,`${name(self)} 抽了 1 张${clean.pairs.length?'，消除一对！':'，暂未配对。'}`].slice(-3);if(!checkWin(t,now)){t.turn=other.id;t.deadline=now+TURN_MS;}return {card,paired:clean.pairs.length>0};
}
export function close(t,reason){t.phase='closed';t.turn=null;t.deadline=null;t.waitUntil=null;t.endAt=null;t.closeAt=null;t.closeReason=reason;}
export function expire(t,now=Date.now()){if(t.phase==='lobby'&&t.waitUntil<=now){close(t,'等待 / 挑战 3 分钟无人加入，已结束。');return true;}if(t.phase==='active'&&(t.deadline<=now||t.endAt<=now)){close(t,t.endAt<=now?'本局达到 10 分钟，已结束；不计排行或惩罚。':'45 秒未抽牌，本局结束；不计排行或惩罚。');return true;}if(t.phase==='settled'&&t.closeAt<=now){close(t,'本局已结束，改名思考时间已到。');return true;}return false;}
