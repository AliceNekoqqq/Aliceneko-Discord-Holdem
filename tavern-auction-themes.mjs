// V9 theme weights and public clues. Existing item identities/prices stay frozen.
export const AUCTION_THEMES=Object.freeze([
 {id:'living',name:'生活日用仓',categories:['日用','服饰','户外','玩具']},
 {id:'dining',name:'餐饮器物仓',categories:['餐饮','厨房']},
 {id:'arts',name:'文艺收藏仓',categories:['文艺','乐器','收藏','矿物']},
 {id:'tech',name:'机械数码仓',categories:['机械','数码','影音','文具']},
].map(x=>Object.freeze({...x,categories:Object.freeze(x.categories),multiplier:3})));
const byId=new Map(AUCTION_THEMES.map(x=>[x.id,x]));
export function auctionTheme(id){return byId.get(id)??null;}
export function drawAuctionTheme(random){return AUCTION_THEMES[random(AUCTION_THEMES.length)].id;}
const poolCache=new WeakMap();
export function themedPool(pool,id){
 const theme=auctionTheme(id);
 if(id && !theme)throw Error('仓库主题异常。');
 if(!theme)return pool;
 let cache=poolCache.get(pool);if(!cache){cache=new Map();poolCache.set(pool,cache);}
 if(!cache.has(id))cache.set(id,Object.freeze(pool.map(x=>Object.freeze({...x,dropWeight:x.dropWeight*(theme.categories.includes(x.category)?theme.multiplier:1)}))));
 return cache.get(id);
}
export function initializePublicAuction(state){
 const order=state.board.map((_,i)=>i).sort((a,b)=>state.board[a].y-state.board[b].y||state.board[a].x-state.board[b].x);
 state.publicVersion=1;state.publicOrder=[order[0],order.at(-1)];
}
export function publicAuctionInfo(state){
 if(!(state.catalogVersion>=9) || state.publicVersion!==1)return null;
 const top=state.items.reduce((q,x)=>Math.max(q,x.quality),0),items=state.items.map(()=>({quality:null,width:null,height:null,category:null})),
  clues=[{round:1,kind:'top',quality:top}],round=state.round,[a,b]=state.publicOrder;
 const add=(r,kind,index,fields)=>{if(round>=r){Object.assign(items[index],fields);clues.push({round:r,kind,index,...fields});}};
 add(2,'quality',a,{quality:state.items[a].quality});
 add(3,'shape',a,{width:state.items[a].width,height:state.items[a].height});
 add(4,'category',b,{category:state.items[b].category});
 add(5,'appraisal',b,{quality:state.items[b].quality,width:state.items[b].width,height:state.items[b].height});
 return {version:1,top,items,clues:clues.map(c=>({...c,text:publicClueText(c,['白','绿','蓝','紫','金','红'])}))};
}
export function auctionInfoWithPublic(info,publicInfo){
 if(!publicInfo)return info;
 return {highCount:info.highCount,...(info.highCounts?{highCounts:info.highCounts}:{}),
  ...(info.highArea!==undefined?{highArea:info.highArea}:{}),maxQuality:publicInfo.top,
  items:info.items.map((x,i)=>{const p=publicInfo.items[i];return {
   quality:x.quality??p.quality,width:x.width??p.width,height:x.height??p.height,category:p.category,
  };})};
}

export function chooseAuctionTheme(choice,random){
 if(choice===undefined||choice==='random')return drawAuctionTheme(random);
 if(!auctionTheme(choice))throw Error('请选择有效仓库主题。');return choice;
}
export function publicClueText(c,qualities){
 if(c.kind==='top')return `最高品质：${qualities[c.quality]}`;
 const prefix=`第${c.index+1}件`;
 if(c.kind==='quality')return `${prefix}品质：${qualities[c.quality]}`;
 if(c.kind==='shape')return `${prefix}轮廓：${c.width}×${c.height}，占${c.width*c.height}格`;
 if(c.kind==='category')return `${prefix}类别：${c.category}`;
 return `${prefix}品质：${qualities[c.quality]}，轮廓${c.width}×${c.height}`;
}
