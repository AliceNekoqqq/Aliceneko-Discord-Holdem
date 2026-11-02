import {AUCTION_RATE} from './tavern-auction-currency.mjs';
import expansion from './assets/auction-art/expansion-v1.json' with {type:'json'};
import additional from './assets/auction-art/expansion-v2.json' with {type:'json'};
// Original 24 names: approved Gemini job casino-auction-copy-20261102-v1.
// Added 48 names and captions: authored directly per the user's no-Gemini request.
// Original tavern catalog. Values, categories, shapes and drop weights are our adaptation.
export const AUCTION_NPCS=Object.freeze(['微醺阿吉','云游老猫','听风掌柜']);
const names=[
 ['旧软木垫','磨损起子','素陶酒盅','泛黄酿造笺'],
 ['锡制调酒匙','雕花火柴盒','粗织亚麻巾','黄铜开酒器'],
 ['手工郁金香杯','陈年橡木捣棒','留声机唱针','复古雕花冰夹'],
 ['珐琅彩冷酒壶','橡木桶侧板钟','手摇发条音盒','琉璃储酒罐'],
 ['创始人签名桶','镀金开瓶器','纯银雕花酒具','百年调酒手稿'],
 ['初代霓虹招牌','水晶醒酒器','酿酒大师怀表','始祖秘传配方']
];
const values=[[4,6,8,10],[9,12,15,18],[16,22,28,34],[30,40,50,60],[55,70,85,100],[90,110,130,150]];
const shapes=[[1,1],[1,2],[1,1],[2,2]];
const categories=[['日用','餐饮','餐饮','文艺'],['餐饮','日用','日用','餐饮'],['餐饮','餐饮','文艺','餐饮'],['餐饮','收藏','文艺','餐饮'],['收藏','餐饮','餐饮','文艺'],['收藏','餐饮','收藏','文艺']];
export const AUCTION_ITEMS_LEGACY=Object.freeze(names.flatMap((group,quality)=>group.map((name,i)=>Object.freeze({id:`tavern-${quality}-${i}`,name,quality,category:categories[quality][i],width:shapes[i][0],height:shapes[i][1],value:values[quality][i]*AUCTION_RATE}))));
const spreads=[[1,2,3,0],[2,3,5,0],[4,6,8,0],[8,12,15,0],[15,20,25,0],[30,40,50,0]];
export const AUCTION_ITEMS_V2=Object.freeze([...AUCTION_ITEMS_LEGACY,...expansion.map(x=>{
 const i=Math.floor(x.slot/2),delta=spreads[x.quality][i]*(x.slot%2?1:-1);
 return Object.freeze({id:`tavern-${x.quality}-${x.slot+4}`,name:x.name,flavor:x.flavor,quality:x.quality,category:x.category,width:shapes[i][0],height:shapes[i][1],value:(values[x.quality][i]+delta)*AUCTION_RATE});
})]);
// Preserve the 72-item pool for games opened before the 192-item expansion.
export const AUCTION_ITEMS=Object.freeze([...AUCTION_ITEMS_V2,...additional.map(x=>Object.freeze({
 id:x.id,name:x.name,flavor:x.flavor,quality:x.quality,category:x.category,width:x.width,height:x.height,value:x.valueT*AUCTION_RATE
}))]);
export const auctionCatalogFor=version=>version===3?AUCTION_ITEMS:version===2?AUCTION_ITEMS_V2:AUCTION_ITEMS_LEGACY;
export function auctionCatalogPage(quality,page=0){
 if(!Number.isInteger(quality)||quality<0||quality>5||!Number.isInteger(page)||page<0)throw Error('无效图鉴页。');
 const pool=AUCTION_ITEMS.filter(x=>x.quality===quality),pages=Math.ceil(pool.length/12);
 if(page>=pages)throw Error('无效图鉴页。');
 return {count:pool.length,pages,items:pool.slice(page*12,(page+1)*12)};
}
