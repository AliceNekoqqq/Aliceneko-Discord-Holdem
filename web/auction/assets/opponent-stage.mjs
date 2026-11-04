// Reactions are factual summaries of closed rounds, never guesses about intent.
// The input stage is built from public history. Private bids/clues are not read.
export function buildOpponentReaction({stage,index,history=[]}={}){
 const seat=stage?.seats?.find(s=>s.index===index);
 if(!seat)return {kind:'sealed',label:'等待开牌',delta:null};
 const base={round:stage.round,delta:null};
 if(stage.settled){
  if(seat.winner)return {...base,kind:'won',label:'竞拍成功'};
  return {...base,kind:'closed',label:stage.winner!==null?'本仓未拍中':stage.open&&stage.top===0?'本仓流拍':'本仓已结束'};
 }
 if(!stage.open)return {kind:'sealed',label:'等待开牌',delta:null};
 if(seat.bid===0)return {...base,kind:'pass',label:'本轮过牌'};
 if(seat.bid===stage.top&&!seat.leader)return {...base,kind:'tied',label:'同价暂后'};
 const previous=(Array.isArray(history)?history:[]).filter(h=>Number.isInteger(h.round)&&h.round<stage.round&&Array.isArray(h.bids)&&h.bids.length===4&&h.bids.every(x=>Number.isSafeInteger(x)&&x>=0)).sort((a,b)=>a.round-b.round).at(-1),
  before=previous?.bids[index];
 if(before===undefined)return {...base,kind:'enter',label:'首次出价'};
 if(before===0)return {...base,kind:'enter',label:'重新跟进'};
 const delta=seat.bid-before;
 return {...base,previousRound:previous.round,delta,kind:delta>0?'raise':delta<0?'lower':'hold',label:delta>0?'加价跟进':delta<0?'收紧报价':'守住报价'};
}
