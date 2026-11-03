import {AUCTION_ITEMS,auctionItemChance} from './tavern-auction-data.mjs';
export const AUCTION_MAX_ITEMS=18;
export const AUCTION_WAREHOUSES=Object.freeze([
 Object.freeze({id:'small',name:'小仓',cols:8,rows:4,min:6,max:8}),
 Object.freeze({id:'medium',name:'中仓',cols:8,rows:6,min:9,max:12}),
 Object.freeze({id:'large',name:'大仓',cols:10,rows:8,min:13,max:18})
]);
export const AUCTION_REGIONS=Object.freeze(Object.fromEntries([
 ['small',[350,280,200,100,60,10],[6000,3000,1000],[1,1,1]],
 ['standard',[270,255,215,140,108,12],[3500,4500,2000],[2,2,2]],
 ['high',[220,240,220,160,145,15],[2000,4500,3500],[3,3,5]],
 ['collection',[170,220,230,180,180,20],[1000,3500,5500],[4,6,12]]
].map(([id,quality,size,rare])=>[id,Object.freeze({quality:Object.freeze(quality),size:Object.freeze(size),rare:Object.freeze(rare)})])));
const pools=Object.freeze(Object.fromEntries(Object.entries(AUCTION_REGIONS).map(([tier,r])=>[tier,Object.freeze(AUCTION_ITEMS.map(x=>Object.freeze({...x,dropWeight:x.dropWeight*({'稀有':r.rare[0],'极稀有':r.rare[1],'传世':r.rare[2]}[x.rarity]??1)})))])));
export function regionCatalog(tier='standard'){if(!Object.hasOwn(pools,tier))throw Error('无效竞拍区域。');return pools[tier];}
export const isRegionCatalog=pool=>Object.values(pools).includes(pool);
export function drawAuctionWarehouse(tier,random){
 const r=AUCTION_REGIONS[tier];if(!r)throw Error('无效竞拍区域。');
 let ticket=random(10000),index=0;while(ticket>=r.size[index])ticket-=r.size[index++];
 const w=AUCTION_WAREHOUSES[index];return {id:w.id,name:w.name,cols:w.cols,rows:w.rows,count:w.min+random(w.max-w.min+1)};
}
export function regionItemChance(item,tier='standard',count){
 const pool=regionCatalog(tier),x=pool.find(x=>x.id===item.id);if(!x)throw Error('藏品不在区域图鉴中。');
 const r=AUCTION_REGIONS[tier],chance=auctionItemChance(x,r.quality[x.quality]/10,pool,count??8);
 if(count===undefined)chance.warehouse=AUCTION_WAREHOUSES.reduce((sum,w,i)=>sum+r.size[i]/10000*Array.from({length:w.max-w.min+1},(_,j)=>-Math.expm1((w.min+j)*Math.log1p(-chance.slot))).reduce((s,p)=>s+p,0)/(w.max-w.min+1),0);
 return chance;
}
