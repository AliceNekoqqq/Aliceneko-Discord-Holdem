// Public identity and bidding-style definitions. Never contains private clues.
export const AUCTION_NPC_VERSION=2;
export const AUCTION_NPC_STYLES=Object.freeze([
 Object.freeze({label:'谨慎出价',factor:.78,description:'按自己的线索估价，通常保留更多出价空间。'}),
 Object.freeze({label:'稳步跟进',factor:.94,description:'在保守与果断之间取中间档，随轮次逐步提高报价比例。'}),
 Object.freeze({label:'果断竞价',factor:1.08,description:'同等线索下报价比例更高，也会过牌；仍受自己的估值与预算限制。'}),
]);
export const AUCTION_OPPONENTS=Object.freeze([
 {id:'aji',key:'npc:aji',name:'阿吉',title:'微醺阿吉',soloIndex:1,style:0},
 {id:'laomao',key:'npc:laomao',name:'老猫',title:'云游老猫',soloIndex:2,style:1},
 {id:'zhanggui',key:'npc:zhanggui',name:'掌柜',title:'听风掌柜',soloIndex:3,style:2},
].map(x=>Object.freeze({...x,portrait:`/auction/assets/npc-${x.id}-v1.png`})));
export const auctionOpponent=key=>AUCTION_OPPONENTS.find(x=>x.key===key)??null;
