import { legal, act, rankSeven } from './engine.mjs';

// Only the computer's own cards and public betting information enter this policy.
// No other player's cards or undealt deck are supplied.
export function chooseAction(view,random=Math.random) {
  const ranks=view.cards.map(c=>c%13+2).sort((a,b)=>b-a);
  const paired=ranks[0]===ranks[1];
  const strength=view.board.length
    ? Math.min(1,0.12+rankSeven([...view.cards,...view.board])[0]*0.16)
    : paired ? 0.55+ranks[0]/35 : 0.12+(ranks[0]+ranks[1])/65+(Math.floor(view.cards[0]/13)===Math.floor(view.cards[1]/13)?0.08:0);
  const roll=random();
  const price=view.call/Math.max(1,view.pot+view.call);
  if(view.call>0&&price>strength*0.6+0.06&&roll>0.15) return {kind:'fold'};
  if(view.canRaise&&view.maxTotal>=view.minTotal&&(strength>0.55&&roll<0.32||roll<0.04)) {
    const target=Math.min(view.maxTotal,view.minTotal+Math.floor(view.pot/40)*20);
    return {kind:'raise',target};
  }
  return {kind:view.call?'call':'check'};
}

export function computerTurn(t,random=Math.random,now=Date.now()) {
  const p=t.players.find(p=>p.id===t.turn);
  if(!p?.bot) return false;
  const limits=legal(t,p.id);
  const choice=chooseAction({cards:[...p.cards],board:[...t.board],pot:t.pot,call:limits.call,canRaise:limits.canRaise,minTotal:limits.minTotal,maxTotal:limits.maxTotal},random);
  act(t,p.id,choice.kind,choice.target,now);
  return true;
}
