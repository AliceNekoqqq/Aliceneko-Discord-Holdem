import {name,cardName,living} from './liar-engine.mjs';
import {avatarEmoji,victoryEmoji,entranceText} from './uno-profile.mjs';
import {emojiMarkup} from './app-emojis.mjs';
export const mentions={parse:[]};
export const HELP='🍷 **骗子酒馆 · 经典卡牌适配版**\n`/骗子酒馆 创建` 开2～4人真人桌；`/骗子酒馆 测试` 添加1～3位电脑。桌主可直接开局，也可全部真人准备后5秒自动开局。\n20张牌：6张A、6张K、6张Q、2张Joker。每轮随机指定A/K/Q桌，每位存活者5张牌，Joker万能。每次从私密手牌选1～3张盖下，统一声称是本轮指定牌，允许撒谎。\n下家可「质疑」或「相信后出牌」；直接盖牌也表示相信上一手。只验上一手：全是指定牌/Joker，质疑者接受轮盘；有假牌，出牌者接受轮盘。无人质疑的牌不会公开。出完牌暂时跳过出牌，但仍可被质疑；只剩一人持牌时必须质疑，避免僵局。\n每人独立6格轮盘、随机1格危险位，整局不重置；安全后风险从1/6逐次上升。轮盘后存活者重新发牌、重选桌牌；最后存活者获胜。电脑只看自己的牌及公开动作。\n每回合60秒；首次超时自动质疑上一手或出1张牌，连续两次超时认输。等待10分钟、结算15分钟、局中15分钟无人有效操作或整局30分钟自动关闭。看牌/刷新/互动不续时。认输计负，取消不计；含电脑的陪练不计排行榜。\n`/骗子酒馆 排行榜` 查看服务器战绩；榜首可用「称号」选择👑骗术大师游戏称号或Discord身份组。个人设置与UNO共用头像、配色、入场及胜利表情。';
const sub=(name,description,options)=>({type:1,name,description,...(options?{options}:{})});
export const command={name:'骗子酒馆',description:'盖牌说谎、识破对手，成为最后的酒客',type:1,integration_types:[0],contexts:[0],options:[sub('创建','创建2～4人骗子酒馆卡牌桌'),sub('测试','创建电脑陪练桌', [{type:4,name:'电脑数量',description:'默认2位，最多3位',min_value:1,max_value:3}]),sub('个人设置','设置座位头像、配色、入场短句和胜利表情'),sub('排行榜','本服务器骗子酒馆胜场榜'),sub('称号','排行榜第一选择佩戴骗术大师称号'),sub('牌桌','定位当前频道牌桌'),sub('帮助','卡牌规则、轮盘、超时与排行榜') ]};
export const key=(t,a)=>`l:${t.epoch}:${t.version}:${a}`;
export const button=(t,a,label,style=2,disabled=false)=>({type:2,custom_id:key(t,a),label,style,disabled});
export const row=(...components)=>({type:1,components});
const stamp=ms=>`<t:${Math.floor(ms/1000)}:R>`;
export const wearsCrown=(t,p)=>t.crown?.id===p.id&&t.crown.choice==='title'&&t.crown.validUntil>Date.now();
export function board(t){
 const active=t.phase==='active',waiting=['lobby','settled'].includes(t.phase),actor=t.players.find(p=>p.id===t.turn);let description;const components=[];
 if(t.phase==='lobby')description=`**2～4人 · 卡牌模式**\n${t.players.length}/4位酒客入座；准备后5秒自动开局，也可由桌主开始。\n${t.players.some(p=>p.bot)?'🤖 电脑陪练局，不计排行。':'🏆 全真人完成局计入服务器排行。'}\n${t.readyDue?`全部就位，${stamp(t.readyDue)} 开局。`:`${stamp(t.idleDeadline)} 空闲打烊。`}`;
 else if(active)description=`**第${t.handNo}轮 · ${t.tableRank}桌 · Joker万能**\n👉 **${name(actor)}** 行动，${stamp(t.deadline)} 超时。\n${t.pending?`**${name(t.players.find(p=>p.id===t.pending.actor))}** 声称盖下 **${t.pending.count}张 ${t.tableRank}**。\n${t.forced?'⚠️ 只剩一人持牌，必须质疑上一手。':'你可以质疑，或相信后盖下自己的1～3张牌。'}`:'没有待验牌，请从私密手牌盖下1～3张。'}\n${living(t).length}位仍在桌边。`;
 else if(t.phase==='roulette'||t.phase==='intermission'){
  const r=t.reveal,p=t.players.find(p=>p.id===r?.loser);description=`**第${t.handNo}轮 · ${t.tableRank}桌**\n${r?.forfeit?`🏳️ **${name(p)}** 退出本局。`:`翻牌：**${r?.cards.map(cardName).join(' · ')}**\n${r?.honest?'质疑失败：上一手全部为真牌。':'质疑成功：上一手混有假牌。'}\n**${name(p)}** 接受轮盘。\n${r?.resolved?r.dead?'💥 危险位！该酒客出局。':'咔哒……安全，下次风险更高。':'🎲 轮盘转动中……'}`}\n${stamp(t.stageDue)} ${t.phase==='roulette'?'揭晓结果':'存活者重新发牌'}。`;
 }else if(t.phase==='settled'){const p=t.players.find(p=>p.id===t.winner);description=`🏆 **${name(p)}** 是最后的酒客！ ${emojiMarkup(p?.appVictory)||victoryEmoji(p)||''}\n经历${t.handNo}轮、${p?.shots||0}次轮盘。${t.players.some(p=>p.bot)?'\n🤖 陪练局不计排行。':'\n🏆 全真人战绩已排队记入服务器榜。'}\n可准备下一局，${stamp(t.idleDeadline)} 空闲打烊。`;}
 else description=`🌙 ${t.closeReason||'酒馆已打烊。'}\n使用 /骗子酒馆 创建 再开一桌。`;
 if(waiting){components.push(row(button(t,'join','🍷 加入酒馆',1,t.players.length>=4),button(t,'ready','准备 / 取消准备',3),button(t,'start','开始对局',1,t.players.length<2),button(t,'manage','牌桌管理')));components.push(row({type:2,custom_id:`v:${t.guild}:any:open`,label:'🎭 个人设置',style:2},{type:2,custom_id:`lr:${t.guild}:any:view`,label:'🏆 排行榜',style:2},button(t,'help','玩法')));}
 else if(t.phase!=='closed'){components.push(row(button(t,'hand','🎴 我的手牌 / 出牌',1),button(t,'challenge','🧐 你在说谎！',4,!active||!t.pending),button(t,'manage','牌桌管理'),button(t,'social','🍻 互动')));components.push(row(button(t,'refresh','刷新牌桌'),button(t,'help','玩法')));}
 const fields=t.players.map((p,n)=>({name:`${avatarEmoji(p)} ${n+1}号 · ${name(p)}${wearsCrown(t,p)?' 👑':''}${p.bot?' 🤖':''}`,value:waiting?`${p.bot||p.ready?'✅ 已准备':'⏳ 未准备'}${t.phase==='settled'?p.id===t.winner?' · 🏆 胜者':p.alive?'':' · 已出局':''}`:`${p.alive?`${p.cards.length}张牌 · 轮盘${p.shots}次 · 下次风险1/${6-p.shots}`:'💥 已出局'}${p.id===t.turn?' · 🟢 行动':''}${p.id===t.owner?' · 桌主':''}`,inline:true}));
 if(t.log.length)fields.push({name:'酒馆纪事',value:t.log.join('\n'),inline:false});if(t.events?.length)fields.push({name:'桌边闲聊',value:t.events.slice(-3).map(e=>`${name(t.players.find(p=>p.id===e.actor))}：${e.text}${emojiMarkup(e.emoji)||''}`).join('\n'),inline:false});
 const win=t.players.find(p=>p.id===t.winner)?.appVictory;
 return {content:'',embeds:[{title:'🍷 Aliceneko · 骗子酒馆',description,color:t.phase==='settled'?0xe9bc71:0xa76682,fields,footer:{text:'2–4人 · 隐藏出牌 · 轮盘淘汰 · 仅供娱乐'},...(win?.id&&t.phase==='settled'?{thumbnail:{url:`https://cdn.discordapp.com/emojis/${win.id}.${win.animated?'gif':'png'}?size=96`}}:{})}],components,allowed_mentions:mentions};
}
export function handPanel(t,id,notice=''){
 const p=t.players.find(p=>p.id===id);if(!p||p.bot)return {content:'你没有加入这张牌桌。',embeds:[],components:[],attachments:[],allowed_mentions:mentions};const mine=t.phase==='active'&&t.turn===id&&p.alive,components=[];
 if(mine&&!t.forced&&p.cards.length)components.push(row({type:3,custom_id:key(t,`p~${id}~play`),placeholder:`盖下1～${Math.min(3,p.cards.length)}张，自称${t.tableRank}（可混入假牌）`,min_values:1,max_values:Math.min(3,p.cards.length),options:p.cards.map((c,n)=>({label:`${n+1}号 · ${cardName(c)}`,value:String(n),description:cardName(c)===t.tableRank||cardName(c)==='🃏 Joker'?'本轮真牌':'可用来虚张声势'}))}));
 if(mine&&t.pending)components.push(row(button(t,`p~${id}~challenge`,'🧐 质疑上一手',4),...(!t.forced?[button(t,`p~${id}~believe`,'相信，准备出牌',3)]:[])));
 components.push(row(button(t,`p~${id}~hand`,'刷新手牌'),button(t,'manage','牌桌管理')));
 const status=!p.alive?'💥 你已出局，可以旁观到本局结束。':mine?t.forced?'⚠️ 必须质疑上一手。':'👉 轮到你；直接选择牌即表示相信上一手并出牌。':t.phase==='active'?`等待 ${name(t.players.find(q=>q.id===t.turn))}；你的手牌自动更新。`:t.phase==='lobby'?'入座后准备，开局自动显示手牌。':t.phase==='settled'?'本局已结束，可以准备下一局。':'正在揭晓，下一轮自动更新手牌。';
 return {content:[notice,status].filter(Boolean).join('\n'),embeds:[{title:'你的手牌 · 仅自己可见',description:`${t.tableRank?`本轮 **${t.tableRank}桌**，Joker万能。\n`:''}${p.cards.length?p.cards.map((c,n)=>`**${n+1}** · ${cardName(c)}`).join('　'):'本轮手牌已出完。'}\n${p.alive?`安全轮盘 ${p.shots} 次；下次风险 **1/${6-p.shots}**。`:'你已出局。'}`,color:0xa76682}],components,attachments:[],allowed_mentions:mentions};
}
export function management(t,id,admin,notice=''){
 const p=t.players.find(q=>q.id===id&&!q.bot),waiting=['lobby','settled'].includes(t.phase);const buttons=[];
 if(p&&waiting)buttons.push(button(t,`m~${id}~leave`,'离开酒馆'));
 if(p?.alive&&!waiting&&t.phase!=='closed')buttons.push(button(t,`m~${id}~surrender`,'🏳️ 认输',4));
 if(id===t.owner&&waiting)buttons.push(button(t,`m~${id}~addbot`,'添加电脑',2,t.players.length>=4),button(t,`m~${id}~removebots`,'移除电脑',2,!t.players.some(p=>p.bot)));
 if(id===t.owner||admin)buttons.push(button(t,`m~${id}~close`,'结束牌桌',4));
 return {content:[notice,'🍷 **牌桌管理**',waiting?'可离桌或管理陪练。':'认输后本局不能重新加入；可以旁观。'].filter(Boolean).join('\n'),embeds:[],components:buttons.length?[row(...buttons)]:[],allowed_mentions:mentions};
}
export function confirmation(t,id,action){return {content:action==='giveup'?'🏳️ 确认认输？你将退出本局；全真人完成局计负。':'确认结束整张牌桌？未完成的本局不计排行。',flags:64,components:[row(button(t,`c~${id}~${action}`,action==='giveup'?'确认认输':'确认关桌',4))],allowed_mentions:mentions};}
export function social(t,id){return {content:t.players.filter(p=>p.alive).length<2?'桌边暂时只有你，等其他酒客入座吧。':'🍻 选一句桌边互动，不影响规则。',flags:64,components:t.players.filter(p=>p.alive).length<2?[]:[row(...['装镇定','盯着你','碰个杯','不信你'].map((label,n)=>button(t,`s~${id}~${n}`,label)))],allowed_mentions:mentions};}
export function entranceEvent(t,p){const text=entranceText(p);if(text||p.appEntrance)t.events=[...t.events,{actor:p.id,text,emoji:p.appEntrance||null}].slice(-3);}
