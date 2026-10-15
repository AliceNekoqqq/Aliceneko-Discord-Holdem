// Program-owned catalogue, preferences and reward rules. No model can edit prices or balances.
export const WELCOME_COINS=500, DAILY_REWARD_CAP=150, DAILY_GIFT_COINS=20, ROSTER_DAILY_LIMIT=8, ORDER_TTL=180000;
export const MENU_CATEGORIES=Object.freeze([
 {id:'drinks',name:'饮品',emoji:'🍵'},
 {id:'desserts',name:'甜点',emoji:'🥮'},
 {id:'savory',name:'咸食',emoji:'🍜'},
 {id:'seasonal',name:'时令',emoji:'🍂'}
].map(category=>Object.freeze(category)));
export const MENU=Object.freeze([
 {id:'water',name:'白水',emoji:'💧',price:0,category:'drinks',ingredients:['清水'],flavor:'清淡',pairing:'适合搭配任何小食',allergens:[],description:'清清爽爽，坐下慢慢聊。',serve:'把一杯清水放到你手边。'},
 {id:'tea',name:'热茶',emoji:'🍵',price:0,category:'drinks',ingredients:['乌龙茶叶','清水'],flavor:'清香回甘',pairing:'适合搭配红豆小酥',allergens:[],servingTemperature:'warm',description:'一壶淡淡的茶香，不用花酒馆币。',serve:'端来热茶，把杯柄转向你。'},
 {id:'milk',name:'红豆牛奶',emoji:'🥛',price:15,category:'drinks',ingredients:['红豆','牛奶','冰糖'],flavor:'绵软香甜',pairing:'适合搭配旧街黄油饼',allergens:['乳制品'],description:'软糯红豆和牛奶，店里的日常招牌。',serve:'端来红豆牛奶，杯底的红豆轻轻晃了一下。'},
 {id:'soda',name:'蝶影苏打',emoji:'🦋',price:25,category:'drinks',ingredients:['苏打水','蝶豆花','柠檬'],flavor:'清爽微酸',pairing:'适合搭配邮差果冻',allergens:[],description:'轻轻搅动，气泡映出蝶翼似的光。',serve:'把蝶影苏打推到你面前，气泡沿着杯壁升起来。'},
 {id:'special',name:'今日心情特调',emoji:'🌙',price:35,category:'drinks',ingredients:['红茶','苹果汁','蜂蜜'],flavor:'随心微甜',pairing:'适合搭配红豆小酥',allergens:[],description:'选一种心情，留下今天这一杯的名字。',serve:'调好今天的心情特饮，在杯下压了一张小小的名字卡。'},
 {id:'cake',name:'红豆小酥',emoji:'🥮',price:20,category:'desserts',ingredients:['红豆沙','面粉','黄油'],flavor:'酥松香甜',pairing:'适合搭配热茶',allergens:['麸质','乳制品'],servingTemperature:'room',description:'两块酥松的小点心，适合配茶。',serve:'端来两块红豆小酥，旁边放好一张餐巾。'},
 {id:'snack',name:'深夜小食拼盘',emoji:'🍽️',price:40,category:'savory',ingredients:['烤饭团','毛豆','小番茄'],flavor:'咸香清爽',pairing:'适合搭配蝶影苏打',allergens:['大豆'],servingTemperature:'warm',description:'咸甜搭配的一小盘，边玩边吃。',serve:'把小食拼盘摆上桌，让出杯子旁的一块位置。'},
 {id:'plum-tea',name:'梅子乌龙',emoji:'🫖',price:22,category:'drinks',ingredients:['乌龙茶','青梅','冰糖'],flavor:'酸甜回甘',pairing:'适合搭配临河糯米团',allergens:[],servingTemperature:'cold',description:'青梅的酸甜落进清亮茶汤。',serve:'斟一杯梅子乌龙，青梅在杯底轻轻转了半圈。'},
 {id:'pear-soup',name:'暖梨饮',emoji:'🍐',price:24,category:'drinks',ingredients:['雪梨','枸杞','冰糖'],flavor:'温润清甜',pairing:'适合搭配旧街黄油饼',allergens:[],servingTemperature:'warm',description:'雪梨慢炖，带一点柔和甜意。',serve:'端来暖梨饮，杯口浮着淡淡梨香。'},
 {id:'lemon-honey',name:'柠蜜水',emoji:'🍋',price:18,category:'drinks',ingredients:['柠檬','蜂蜜','清水'],flavor:'明亮微酸',pairing:'适合搭配深夜小食拼盘',allergens:[],servingTemperature:'cold',description:'柠檬与蜂蜜调成清爽的一杯。',serve:'把柠蜜水放在桌边，柠檬片贴着杯沿。'},
 {id:'redbean-soy',name:'红豆豆乳',emoji:'🥤',price:20,category:'drinks',ingredients:['红豆','豆乳','枫糖'],flavor:'绵密醇和',pairing:'适合搭配明信片布丁',allergens:['大豆'],servingTemperature:'cold',description:'细磨豆乳配软糯红豆。',serve:'送来一杯红豆豆乳，杯面留着细细的豆香。'},
 {id:'postcard-pudding',name:'明信片布丁',emoji:'🍮',price:26,category:'desserts',ingredients:['鸡蛋','牛奶','焦糖'],flavor:'柔滑焦香',pairing:'适合搭配红豆豆乳',allergens:['蛋类','乳制品'],servingTemperature:'cold',description:'焦糖映着旧街窗边的暖光。',serve:'摆下一只小布丁，旁边压着一张空白明信片。'},
 {id:'river-mochi',name:'临河糯米团',emoji:'🍡',price:18,category:'desserts',ingredients:['糯米','红豆沙','芝麻'],flavor:'软糯微甜',pairing:'适合搭配梅子乌龙',allergens:['芝麻'],servingTemperature:'room',description:'糯米团裹着红豆，像河边的小圆石。',serve:'送上两颗糯米团，红豆馅从切口露出一点。'},
 {id:'oldstreet-cookie',name:'旧街黄油饼',emoji:'🍪',price:16,category:'desserts',ingredients:['面粉','黄油','红糖'],flavor:'酥脆奶香',pairing:'适合搭配红豆牛奶',allergens:['麸质','乳制品'],servingTemperature:'room',description:'烤出旧街面包房熟悉的香气。',serve:'放下两片黄油饼，纸袋还留着烤香。'},
 {id:'postcard-jelly',name:'邮差果冻',emoji:'🍊',price:14,category:'desserts',ingredients:['橘子','琼脂','苹果汁'],flavor:'清甜果香',pairing:'适合搭配蝶影苏打',allergens:[],servingTemperature:'cold',description:'橘子果冻封着一小段晴日。',serve:'端来一碟橘子果冻，色泽像刚寄出的明信片。'},
 {id:'mushroom-noodles',name:'香菇清汤面',emoji:'🍜',price:38,category:'savory',ingredients:['面条','香菇','青菜','清汤'],flavor:'鲜香温和',pairing:'适合搭配白水',allergens:['麸质'],servingTemperature:'warm',description:'一碗热汤面，香菇鲜味慢慢散开。',serve:'端来一碗清汤面，热气轻轻漫过桌沿。'},
 {id:'scallion-pancake',name:'葱香小煎饼',emoji:'🥞',price:22,category:'savory',ingredients:['面粉','香葱','植物油'],flavor:'葱香酥脆',pairing:'适合搭配柠蜜水',allergens:['麸质'],servingTemperature:'warm',description:'现煎小饼外脆里软。',serve:'把两块葱香煎饼趁热放上桌。'},
 {id:'tomato-rice',name:'番茄蛋饭',emoji:'🍛',price:32,category:'savory',ingredients:['米饭','番茄','鸡蛋'],flavor:'酸甜咸香',pairing:'适合搭配梅子乌龙',allergens:['蛋类'],servingTemperature:'warm',description:'家常番茄炒蛋盖在热米饭上。',serve:'端来番茄蛋饭，红亮的汤汁刚好拌开米粒。'},
 {id:'sweet-potato',name:'烤红薯',emoji:'🍠',price:15,category:'savory',ingredients:['红薯'],flavor:'绵软焦甜',pairing:'适合搭配暖梨饮',allergens:[],servingTemperature:'warm',description:'炉火慢烤，甜香朴素踏实。',serve:'送上一只烤红薯，掰开时冒出暖暖的香气。'},
 {id:'dumpling-soup',name:'小巷馄饨',emoji:'🥣',price:34,category:'savory',ingredients:['馄饨皮','猪肉','青菜','清汤'],flavor:'汤清鲜香',pairing:'适合搭配白水',allergens:['麸质'],servingTemperature:'warm',description:'薄皮馄饨盛在清清的热汤里。',serve:'端上小巷馄饨，碗边放好一把汤匙。'},
 {id:'americano',name:'河岸美式',emoji:'☕',price:22,category:'drinks',requiresEquipment:'coffee_machine',ingredients:['咖啡豆','清水'],flavor:'醇苦回甘',pairing:'适合搭配暖炉黄油可颂',allergens:[],servingTemperature:'warm',description:'新磨咖啡，留一会儿河岸的安静。',serve:'端来河岸美式，杯口升起温暖咖啡香。'},
 {id:'cappuccino',name:'卡布奇诺',emoji:'☕',price:28,category:'drinks',requiresEquipment:'coffee_machine',ingredients:['咖啡豆','牛奶','奶泡'],flavor:'绵密醇香',pairing:'适合搭配暖炉黄油可颂',allergens:['乳制品'],servingTemperature:'warm',description:'浓缩、热奶与厚奶泡，绵密得刚刚好。',serve:'端来卡布奇诺，厚厚奶泡围着一圈咖啡色。'},
 {id:'redbean-latte',name:'红豆拿铁',emoji:'☕',price:30,category:'drinks',requiresEquipment:'coffee_machine',ingredients:['咖啡豆','牛奶','红豆'],flavor:'奶香醇甜',pairing:'适合搭配旧街黄油饼',allergens:['乳制品'],servingTemperature:'warm',description:'浓缩咖啡与奶泡，藏着软糯红豆。',serve:'送来红豆拿铁，奶泡下面藏着一层红豆。'},
 {id:'butter-croissant',name:'暖炉黄油可颂',emoji:'🥐',price:24,category:'desserts',requiresEquipment:'baking_oven',ingredients:['面粉','黄油','酵母','牛奶'],flavor:'层层酥香',pairing:'适合搭配河岸美式',allergens:['麸质','乳制品'],servingTemperature:'warm',description:'刚出炉的可颂，外层酥脆内里柔软。',serve:'摆下两只温热可颂，轻碰就落下一点酥皮。'},
 {id:'cheese-toast',name:'芝士烤吐司',emoji:'🧀',price:32,category:'savory',requiresEquipment:'baking_oven',ingredients:['吐司','芝士','黄油'],flavor:'焦香咸浓',pairing:'适合搭配柠蜜水',allergens:['麸质','乳制品'],servingTemperature:'warm',description:'融化芝士盖住烤得金黄的厚吐司。',serve:'端来两半芝士吐司，边角还带着一点焦香。'},
 {id:'berry-smoothie',name:'莓果奶昔',emoji:'🍓',price:30,category:'drinks',requiresEquipment:'blender',ingredients:['草莓','蓝莓','牛奶'],flavor:'浓稠酸甜',pairing:'适合搭配暖炉黄油可颂',allergens:['乳制品'],servingTemperature:'cold',description:'莓果打成细腻奶昔，像一杯粉色云朵。',serve:'送来莓果奶昔，杯沿点缀着一颗草莓。'},
 {id:'mango-yogurt',name:'芒果酸奶冰沙',emoji:'🥭',price:32,category:'drinks',requiresEquipment:'blender',ingredients:['芒果','酸奶','冰块'],flavor:'果香清酸',pairing:'适合搭配葱香小煎饼',allergens:['乳制品'],servingTemperature:'cold',description:'金黄芒果与酸奶，绵密又清凉。',serve:'端来芒果酸奶冰沙，金黄果肉贴着杯壁。'},
 {id:'vanilla-sundae',name:'香草云朵圣代',emoji:'🍨',price:34,category:'desserts',requiresEquipment:'ice_cream_maker',ingredients:['牛奶','奶油','香草','糖'],flavor:'冰甜奶香',pairing:'适合搭配河岸美式',allergens:['乳制品'],servingTemperature:'cold',description:'香草软冰淇淋卷成轻盈的小山。',serve:'放下一碗香草圣代，小勺靠在碗边。'},
 {id:'redbean-parfait',name:'红豆糯米芭菲',emoji:'🍧',price:40,category:'desserts',requiresEquipment:'ice_cream_maker',ingredients:['牛奶','奶油','红豆','糯米','糖'],flavor:'冰软糯甜',pairing:'适合搭配热茶',allergens:['乳制品'],servingTemperature:'cold',description:'红豆、糯米团与冰淇淋层层相叠。',serve:'送来红豆糯米芭菲，杯中叠着凉甜与软糯。'},
 {id:'wheat-beer',name:'河岸小麦啤酒',emoji:'🍺',price:28,category:'drinks',ingredients:['大麦麦芽','水','啤酒花','酵母'],flavor:'柔和麦芽香，收口清爽微苦',pairing:'适合搭配深夜小食拼盘',allergens:['麸质'],servingTemperature:'cold',description:'330 ml · 4.8% vol',servingSizeMl:330,alcoholPercent:4.8},
 {id:'plum-wine',name:'雨巷青梅酒',emoji:'🍶',price:35,category:'drinks',ingredients:['青梅','米酒','冰糖'],flavor:'青梅酸甜，酒香柔和',pairing:'适合搭配红豆小酥',allergens:[],servingTemperature:'cold',description:'90 ml · 12% vol',servingSizeMl:90,alcoholPercent:12},
 {id:'red-wine',name:'暮色赤霞珠',emoji:'🍷',price:48,category:'drinks',ingredients:['赤霞珠葡萄'],flavor:'黑色浆果果香，单宁饱满',pairing:'适合搭配番茄蛋饭',allergens:[],servingTemperature:'room',description:'150 ml · 13% vol',servingSizeMl:150,alcoholPercent:13},
 {id:'gin-tonic',name:'夜航金汤力',emoji:'🍸',price:42,category:'drinks',ingredients:['金酒','汤力水','青柠','冰块'],flavor:'杜松子与青柠清新，带有微苦气泡',pairing:'适合搭配小巷馄饨',allergens:[],servingTemperature:'cold',description:'250 ml · 8% vol',servingSizeMl:250,alcoholPercent:8},
 {id:'whiskey',name:'壁炉威士忌',emoji:'🥃',price:50,category:'drinks',ingredients:['威士忌'],flavor:'焦糖与橡木香气，回味温暖',pairing:'适合搭配暖炉黄油可颂',allergens:[],servingTemperature:'room',description:'40 ml · 40% vol',servingSizeMl:40,alcoholPercent:40}
].map(item=>Object.freeze({...item,ingredients:Object.freeze(item.ingredients),allergens:Object.freeze(item.allergens)})));
export const SWEETNESS=Object.freeze({light:'少糖',normal:'正常甜度',sweet:'偏甜'});
export const TEMPERATURE=Object.freeze({warm:'温热',cold:'冰凉',room:'常温'});
export const SEATS=Object.freeze({counter:'柜台边',window:'窗边',sofa:'软沙发',quiet:'安静角落',any:'随意坐'});
export const MOODS=Object.freeze({calm:'平静',happy:'开心',tired:'疲惫',blue:'低落',bold:'想冒险'});
const SPECIAL_NAMES={calm:'河面微光',happy:'糖纸晴天',tired:'晚灯慢慢',blue:'雨后回信',bold:'蝴蝶越过旧街'};
export const REWARDS=Object.freeze({ghost:{name:'抽鬼牌',base:6,bonus:4,minMs:15000},poker:{name:'德州扑克',base:8,bonus:4,minMs:30000},uno:{name:'UNO',base:12,bonus:6,minMs:45000},liar:{name:'骗子酒馆',base:14,bonus:6,minMs:60000}});
export const rosterRewardRate=played=>played<3?1:played<6?0.5:played<ROSTER_DAILY_LIMIT?0.25:0;
export const validId=id=>typeof id==='string'&&/^\d{1,20}$/.test(id);
export const dayKey=now=>new Date(now+8*3600000).toISOString().slice(0,10);
export const cleanText=(s,max=100)=>String(s||'').replace(/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,max);
export const displayText=s=>cleanText(s,100).replace(/[@`*_~>|\[\]\\]/g,'');
export const menuItem=id=>MENU.find(p=>p.id===id);
export function makeOrderDetails(item,profile,options={}){
 const sweetness=options.sweetness??profile.sweetness,temperature=options.temperature??profile.temperature,mood=options.mood??'calm';
 if(!Object.hasOwn(SWEETNESS,sweetness)||!Object.hasOwn(TEMPERATURE,temperature)||!Object.hasOwn(MOODS,mood))throw Error('请从菜单里的口味和心情选项中选择。');
 return {sweetness,temperature:item.servingTemperature??(item.id==='tea'?'warm':temperature),mood,category:item.category,ingredients:item.ingredients,flavor:item.flavor,pairing:item.pairing,allergens:item.allergens,itemName:item.id==='special'?`${item.name}「${SPECIAL_NAMES[mood]}」`:item.name,seat:profile.seat,restrictions:profile.restrictions,alcohol:item.alcoholPercent?`${item.alcoholPercent}% vol`:'无酒精',...(item.alcoholPercent?{alcoholPercent:item.alcoholPercent,servingSizeMl:item.servingSizeMl}:{})};
}
export function beginTavernRound(t,now=Date.now()){t.tavernRound={startedAt:now,actions:{}};}
export function noteTavernAction(t,id){if(!t.tavernRound||!t.players.some(p=>p.id===id&&!p.bot))return;t.tavernRound.actions[id]=(t.tavernRound.actions[id]||0)+1;}
export function rewardSnapshot(t){
 const game=t.game||'poker',result=game==='uno'?t.rankedResult:game==='poker'?t.tavernResult:t.result;
 if(!result||!t.tavernRound)return null;
 return {game,id:result.id,guild:result.guild,channel:t.channel,at:result.at,startedAt:t.tavernRound.startedAt,players:result.players.map(p=>({id:p.id,name:cleanText(p.name,32),bot:!!p.bot,won:!!p.won,surrendered:!!p.surrendered,actions:t.tavernRound.actions[p.id]||0}))};
}
