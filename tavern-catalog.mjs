// Program-owned catalogue, preferences and reward rules. No model can edit prices or balances.
export const WELCOME_COINS=60, DAILY_REWARD_CAP=150, ROSTER_DAILY_LIMIT=8, ORDER_TTL=180000;
export const MENU=Object.freeze([
 {id:'water',name:'白水',emoji:'💧',price:0,description:'清清爽爽，坐下慢慢聊。',serve:'把一杯清水放到你手边。'},
 {id:'tea',name:'热茶',emoji:'🍵',price:0,description:'一壶淡淡的茶香，不用花酒馆币。',serve:'端来热茶，把杯柄转向你。'},
 {id:'milk',name:'红豆牛奶',emoji:'🥛',price:15,description:'软糯红豆和牛奶，店里的日常招牌。',serve:'端来红豆牛奶，杯底的红豆轻轻晃了一下。'},
 {id:'soda',name:'蝶影苏打',emoji:'🦋',price:25,description:'轻轻搅动，气泡映出蝶翼似的光。',serve:'把蝶影苏打推到你面前，气泡沿着杯壁升起来。'},
 {id:'special',name:'今日心情特调',emoji:'🌙',price:35,description:'选一种心情，留下今天这一杯的名字。',serve:'调好今天的心情特饮，在杯下压了一张小小的名字卡。'},
 {id:'cake',name:'红豆小酥',emoji:'🥮',price:20,description:'两块酥松的小点心，适合配茶。',serve:'端来两块红豆小酥，旁边放好一张餐巾。'},
 {id:'snack',name:'深夜小食拼盘',emoji:'🍽️',price:40,description:'咸甜搭配的一小盘，边玩边吃。',serve:'把小食拼盘摆上桌，让出杯子旁的一块位置。'}
]);
export const SWEETNESS=Object.freeze({light:'少糖',normal:'正常甜度',sweet:'偏甜'});
export const TEMPERATURE=Object.freeze({warm:'温热',cold:'冰凉',room:'常温'});
export const SEATS=Object.freeze({counter:'柜台边',window:'窗边',sofa:'软沙发',quiet:'安静角落',any:'随意坐'});
export const MOODS=Object.freeze({calm:'平静',happy:'开心',tired:'疲惫',blue:'低落',bold:'想冒险'});
const SPECIAL_NAMES={calm:'河面微光',happy:'糖纸晴天',tired:'晚灯慢慢',blue:'雨后回信',bold:'蝴蝶越过旧街'};
export const REWARDS=Object.freeze({ghost:{name:'抽鬼牌',base:6,bonus:8,minMs:15000},poker:{name:'德州扑克',base:8,bonus:6,minMs:10000},uno:{name:'UNO',base:12,bonus:8,minMs:20000},liar:{name:'骗子酒馆',base:18,bonus:12,minMs:30000}});
export const validId=id=>typeof id==='string'&&/^\d{1,20}$/.test(id);
export const dayKey=now=>new Date(now+8*3600000).toISOString().slice(0,10);
export const cleanText=(s,max=100)=>String(s||'').replace(/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,max);
export const displayText=s=>cleanText(s,100).replace(/[@`*_~>|\[\]\\]/g,'');
export const menuItem=id=>MENU.find(p=>p.id===id);
export function makeOrderDetails(item,profile,options={}){
 const sweetness=options.sweetness??profile.sweetness,temperature=options.temperature??profile.temperature,mood=options.mood??'calm';
 if(!Object.hasOwn(SWEETNESS,sweetness)||!Object.hasOwn(TEMPERATURE,temperature)||!Object.hasOwn(MOODS,mood))throw Error('请从菜单里的口味和心情选项中选择。');
 return {sweetness,temperature:item.id==='tea'?'warm':temperature,mood,itemName:item.id==='special'?`${item.name}「${SPECIAL_NAMES[mood]}」`:item.name,seat:profile.seat,restrictions:profile.restrictions,alcohol:'无酒精'};
}
export function beginTavernRound(t,now=Date.now()){t.tavernRound={startedAt:now,actions:{}};}
export function noteTavernAction(t,id){if(!t.tavernRound||!t.players.some(p=>p.id===id&&!p.bot))return;t.tavernRound.actions[id]=(t.tavernRound.actions[id]||0)+1;}
export function rewardSnapshot(t){
 const game=t.game||'poker',result=game==='uno'?t.rankedResult:game==='poker'?t.tavernResult:t.result;
 if(!result||!t.tavernRound)return null;
 return {game,id:result.id,guild:result.guild,channel:t.channel,at:result.at,startedAt:t.tavernRound.startedAt,players:result.players.map(p=>({id:p.id,name:cleanText(p.name,32),bot:!!p.bot,won:!!p.won,surrendered:!!p.surrendered,actions:t.tavernRound.actions[p.id]||0}))};
}
