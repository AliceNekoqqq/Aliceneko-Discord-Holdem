export const AUCTION_BOARD=Object.freeze({cols:8,rows:6});
// A separate token-seeded layout never consumes the bidding/loot random stream.
export function layoutAuction(items,token,dimensions=AUCTION_BOARD){
 let seed=2166136261;for(const c of token)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
 const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 const occupied=new Set(),positions=Array(items.length);
 const ordered=items.map((item,index)=>({...item,index})).sort((a,b)=>b.width*b.height-a.width*a.height);
 for(const item of ordered){
  const choices=[];
  for(let y=0;y<=dimensions.rows-item.height;y++)for(let x=0;x<=dimensions.cols-item.width;x++){
   const cells=[];for(let dy=0;dy<item.height;dy++)for(let dx=0;dx<item.width;dx++)cells.push((y+dy)*dimensions.cols+x+dx);
   if(cells.every(c=>!occupied.has(c)))choices.push({x,y,cells});
  }
  if(!choices.length){const columns=Math.floor(dimensions.cols/2),legacy=dimensions===AUCTION_BOARD;return items.map((a,i)=>({x:i%columns*2,y:Math.floor(i/columns)*(legacy?3:2),width:a.width,height:a.height}));}
  const p=choices[random(choices.length)];p.cells.forEach(c=>occupied.add(c));
  positions[item.index]={x:p.x,y:p.y,width:item.width,height:item.height};
 }
 return positions;
}
export function auctionBoardView(state,token,visibleItems){
 const dimensions=state.warehouse??AUCTION_BOARD,slots=state.board??layoutAuction(state.items,token,dimensions);
 return {cols:dimensions.cols,rows:dimensions.rows,slots:slots.map((p,i)=>{
  const item=visibleItems?.[i],info=state.infos[0].items[i];
  if(!item&&info.quality===null&&info.width===null)return null;
  return {x:p.x,y:p.y,width:item?p.width:info.width,height:item?p.height:info.height};
 })};
}
