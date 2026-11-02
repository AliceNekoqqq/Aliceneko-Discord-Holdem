import {AUCTION_RATE} from './tavern-auction-currency.mjs';
// Names only: Gemini job casino-auction-copy-20261102-v1, reviewed and approved.
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
export const AUCTION_ITEMS=Object.freeze(names.flatMap((group,quality)=>group.map((name,i)=>Object.freeze({id:`tavern-${quality}-${i}`,name,quality,category:categories[quality][i],width:shapes[i][0],height:shapes[i][1],value:values[quality][i]*AUCTION_RATE}))));
