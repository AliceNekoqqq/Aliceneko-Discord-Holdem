import {name,cardName} from './ghost-engine.mjs';
export const mentions={parse:[]};
export const HELP='👻 **抽鬼牌 · 双人快局**\n`/抽鬼牌 等待对手` 公开等人；`/抽鬼牌 发起挑战 玩家` 点名约战。邀请 3 分钟过期，只支持两名真人。\n27 张快局牌：13 对普通牌 + 1 张鬼牌。开局自动消除对子；轮流从对方牌背抽 1 张，同点数自动消除。先清空手牌获胜，鬼牌没有对子。每次抽完双方重新洗牌。\n每回合 45 秒，全局最长 10 分钟，超时取消且不计排行 / 惩罚。可确认认输，计胜负并接受惩罚。\n胜者有 3 分钟输入输家的临时服务器昵称，生效 5 分钟后自动恢复；未输入即过期。加入或接受挑战代表同意该规则。\n`/抽鬼牌 排行榜` 按服务器累计胜场，第一名自动获得「👻鬼王」身份组。';
export const command={name:'抽鬼牌',description:'双人抽鬼牌快局，输家接受5分钟改名惩罚',type:1,integration_types:[0],contexts:[0],options:[{type:1,name:'等待对手',description:'公开等待1位对手，3分钟过期，输家改名5分钟'},{type:1,name:'发起挑战',description:'挑战指定玩家，3分钟过期，输家改名5分钟',options:[{type:6,name:'玩家',description:'要挑战的服务器玩家',required:true}]},{type:1,name:'排行榜',description:'服务器胜场榜，榜首自动获得👻鬼王'},{type:1,name:'牌桌',description:'找到当前频道牌桌'},{type:1,name:'帮助',description:'规则、超时与改名惩罚说明'}]};
export const key=(t,a)=>`g:${t.epoch}:${t.version}:${a}`;
export const button=(t,a,label,style=2,disabled=false)=>({type:2,custom_id:key(t,a),label,style,disabled});
export const row=(...components)=>({type:1,components});
const unix=ms=>Math.floor(ms/1000);
export function board(t){const components=[];let description;
 if(t.phase==='lobby'){description=`**${name(t.players[0])}** ${t.target?`向 <@${t.target}> 发起挑战`:'正在等待一位对手'}\n⏳ <t:${unix(t.waitUntil)}:R> 自动结束\n🎭 输家接受胜者指定的服务器昵称 **5 分钟**；胜者有 **3 分钟** 决定。\n点击加入 / 接受即同意以上规则。`;components.push(row(button(t,'join',t.target?'⚔️ 接受挑战':'👻 加入快局',1),...(t.target?[button(t,'decline','暂不应战')]:[]),button(t,'cancel','结束邀请',4)));}
 else if(t.phase==='active'){description=`👉 **${name(t.players.find(p=>p.id===t.turn))}** 正在抽牌 · <t:${unix(t.deadline)}:R> 超时\n点击「我的手牌 / 抽牌」，从对方牌背选一张。`;components.push(row(button(t,'hand','🎴 我的手牌 / 抽牌',1),button(t,'surrender','🏳️ 认输'),button(t,'help','玩法')));}
 else if(t.phase==='settled'){description=`🏆 **${name(t.players.find(p=>p.id===t.winner))}** 获胜！\n👻 鬼牌${t.players.find(p=>p.id===t.loser).cards.includes(52)?'留在输家手中':'将在本局揭晓'}\n🎭 胜者可在 <t:${unix(t.decideUntil)}:R> 前指定输家昵称，生效 **5 分钟**，随后自动恢复。\n不提交则惩罚过期。`;components.push(row(button(t,'punish','🎭 胜者指定昵称',1),button(t,'hand','查看我的手牌')));}
 else description=`🌙 ${t.closeReason||'牌桌已结束。'}\n使用 /抽鬼牌 等待对手 或 发起挑战 开启新局。`;
 const fields=t.players.map((p,n)=>({name:`${n+1}号 · ${name(p)}${p.id===t.winner?' 🏆':''}`,value:`${p.cards.length} 张手牌${t.turn===p.id?' · 🟢 正在行动':''}`,inline:true}));if(t.log.length)fields.push({name:'最近动作',value:t.log.join('\n'),inline:false});
 return {content:t.phase==='lobby'&&t.target?`<@${t.target}> 来一场抽鬼牌？`: '',embeds:[{title:'👻 Aliceneko · 抽鬼牌',description,color:t.phase==='settled'?0xffd166:0xa58bff,fields,footer:{text:'1v1 快局 · 自动配对 · 私密手牌 · 昵称惩罚5分钟'}}],components,allowed_mentions:t.phase==='lobby'&&t.target?{users:[t.target],parse:[]} :mentions};}
export function handPanel(t,id,notice=''){const p=t.players.find(p=>p.id===id);if(!p)return {content:'请先加入。',components:[],embeds:[],allowed_mentions:mentions};const other=t.players.find(p=>p.id!==id),active=t.phase==='active',mine=active&&t.turn===id;
 const components=[];if(mine&&other)for(let n=0;n<other.cards.length;n+=5)components.push(row(...other.cards.slice(n,n+5).map((_,k)=>button(t,`p~${id}~draw~${n+k}`,`🂠 ${n+k+1}号`,1))));
 components.push(row(button(t,`p~${id}~hand`,'刷新手牌')));
 return {content:[notice,active?(mine?'👉 轮到你：点击下方对方的牌背，抽 1 张。':'⏳ 等待对方抽牌，手牌会自动更新。'):'本局已结束。'].filter(Boolean).join('\n'),embeds:[{title:'你的手牌 · 仅自己可见',description:p.cards.length?p.cards.map(cardName).join('　'):'手牌已清空！',color:0xa58bff,...(other?{fields:[{name:'对方牌背',value:`${other.cards.length} 张 · 每次抽完重新洗牌，编号不透露牌面`}]}:{})}],components,allowed_mentions:mentions};}
export function punishmentModal(t,id){return {type:9,data:{custom_id:`gp:${t.guild}:${id}:${t.epoch}`,title:'给输家起个5分钟昵称',components:[{type:1,components:[{type:4,custom_id:'nickname',label:'临时服务器昵称 · 5分钟后恢复',style:1,required:true,min_length:1,max_length:32,placeholder:'只修改本局输家的服务器昵称'}]}]}};}
