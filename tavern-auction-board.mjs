export const AUCTION_BOARD=Object.freeze({cols:8,rows:6});
// A separate token-seeded layout never consumes the bidding/loot random stream.
//
// Items are packed against the walls and against each other instead of being
// scattered over free space: every placement is scored by how many of its edges
// touch an occupied cell or the warehouse wall, and only the best-scoring
// placements stay in the draw. Sparse boards read as empty boxes, which is not
// what a stocked warehouse should look like.
function edgeScore(x,y,width,height,occupied,cols,rows){
 let score=0;
 for(let dy=0;dy<height;dy++)for(let dx=0;dx<width;dx++){
  const cx=x+dx,cy=y+dy;
  // Touching another item counts three times as much as touching a wall, so the
  // goods form one tight block instead of spreading along the shelves.
  if(cx===0)score+=1;if(cx===cols-1)score+=1;
  if(cy===0)score+=1;if(cy===rows-1)score+=1;
  if(cx>0&&occupied.has(`${cx-1},${cy}`))score+=3;
  if(cx<cols-1&&occupied.has(`${cx+1},${cy}`))score+=3;
  if(cy>0&&occupied.has(`${cx},${cy-1}`))score+=3;
  if(cy<rows-1&&occupied.has(`${cx},${cy+1}`))score+=3;
 }
 return score;
}
function pickCompact(candidates,occupied,cols,rows,random){
 let best=-1,pool=[];
 for(const c of candidates){
  const score=edgeScore(c.x,c.y,c.width??1,c.height??1,occupied,cols,rows);
  if(score>best){best=score;pool=[c];}
  else if(score===best)pool.push(c);
 }
 return pool[random(pool.length)];
}
export function layoutAuction(items,token,dimensions=AUCTION_BOARD){
 let seed=2166136261;for(const c of token)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
 const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 const large=items.map((item,index)=>({...item,index})).filter(x=>x.width*x.height>4);
 if(large.length){
  const item=large[0],cols=Math.floor(dimensions.cols/2),rows=Math.floor(dimensions.rows/2),w=Math.ceil(item.width/2),h=Math.ceil(item.height/2);
  if(large.length!==1||w*h+items.length-1>cols*rows||items.some(x=>!Number.isInteger(x.width)||!Number.isInteger(x.height)||x.width<1||x.height<1)||items.some((x,i)=>i!==item.index&&(x.width>2||x.height>2)))throw Error('大件仓库容量不足。');
  const anchors=[];for(let y=0;y<=rows-h;y++)for(let x=0;x<=cols-w;x++)anchors.push({x,y});
  if(!anchors.length)throw Error('大件仓库无法摆放。');
  const occupied=new Set(),shop=anchors[random(anchors.length)];
  for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)occupied.add(`${shop.x+dx},${shop.y+dy}`);
  const positions=Array(items.length),others=[];
  for(const x of items.map((it,index)=>({...it,index})))if(x.index!==item.index)others.push(x);
  others.sort((a,b)=>b.width*b.height-a.width*a.height);
  positions[item.index]={x:shop.x*2,y:shop.y*2,width:item.width,height:item.height};
  for(const it of others){
   const candidates=[];
   for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(!occupied.has(`${x},${y}`))candidates.push({x,y,width:1,height:1});
   if(!candidates.length)throw Error('大件仓库无法摆放。');
   const spot=pickCompact(candidates,occupied,cols,rows,random);
   occupied.add(`${spot.x},${spot.y}`);
   positions[it.index]={x:spot.x*2,y:spot.y*2,width:it.width,height:it.height};
  }
  return positions;
 }
 const occupied=new Set(),positions=Array(items.length);
 const ordered=items.map((item,index)=>({...item,index})).sort((a,b)=>b.width*b.height-a.width*a.height);
 for(const item of ordered){
  const choices=[];
  for(let y=0;y<=dimensions.rows-item.height;y++)for(let x=0;x<=dimensions.cols-item.width;x++){
   let free=true;
   for(let dy=0;dy<item.height&&free;dy++)for(let dx=0;dx<item.width;dx++)if(occupied.has(`${x+dx},${y+dy}`)){free=false;break;}
   if(free)choices.push({x,y,width:item.width,height:item.height});
  }
  if(!choices.length){const columns=Math.floor(dimensions.cols/2),legacy=dimensions===AUCTION_BOARD;return items.map((a,i)=>({x:i%columns*2,y:Math.floor(i/columns)*(legacy?3:2),width:a.width,height:a.height}));}
  const p=pickCompact(choices,occupied,dimensions.cols,dimensions.rows,random);
  for(let dy=0;dy<item.height;dy++)for(let dx=0;dx<item.width;dx++)occupied.add(`${p.x+dx},${p.y+dy}`);
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
 })}
}
