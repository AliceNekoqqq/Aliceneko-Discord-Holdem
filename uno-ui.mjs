import * as game from './uno-engine.mjs';
export const row=(...components)=>({type:1,components});
export const panelAction=(id,action)=>`p~${id}~${action}`;
export const button=(t,action,label,style=2,disabled=false)=>({type:2,custom_id:`u:${t.epoch}:${t.version}:${action}`,label,style,disabled});
export const colorEmoji={red:'🔴',yellow:'🟡',green:'🟢',blue:'🔵'};
export const label=(t,id)=>{const p=t.players.find(p=>p.id===id);return p?.bot?p.name:/^\d+$/.test(id||'')?`<@${id}>`:'玩家';};
export const sortedCards=p=>[...p.cards].sort((a,b)=>a-b);
export function pageCards(t,id){const p=t.players.find(p=>p.id===id),cards=sortedCards(p),pages=Math.max(1,Math.ceil(cards.length/20)),page=Math.max(0,Math.min(t.pages?.[id]||0,pages-1));return {page,pages,cards:cards.slice(page*20,(page+1)*20)};}
export const HELP='**Aliceneko · UNO 经典 108 张**\n2–10 人，每人 7 张。同色、同数字或同符号可出；万能牌选后续颜色。\n摸 1 张后，只能出刚摸到的牌，也可保留；不能继续打原手牌。+2/+4 接受加牌后跳过，**不叠加**。双人反转相当于跳过。\n+4 正常只能在没有当前颜色牌时出；可以冒险虚张声势。下家可质疑：成功出牌者摸 4 张，你继续行动；失败你摸 6 张并跳过。质疑时仅你可见出牌者当时手牌。\n剩两张时先点「喊 UNO 后出牌」；漏喊后可立即补喊。其他玩家须在下一次出牌/摸牌前点「抓漏喊」。被抓罚 2 张。\n先出完获胜，最后一张 +2/+4 先处理罚牌再计分。数字按面值、功能牌 20、万能牌 50；可选单局或 500 分积分赛。\n每回合 60 秒；超时自动摸牌并保留，或接受罚牌。等待开局 10 分钟、结算后 15 分钟、游戏中连续 15 分钟无人有效游玩操作自动关桌；查看/刷新不延长。\n`/uno 创建` 开桌；`/uno 测试` 可独自与电脑游玩。德州与 UNO 共用每频道一桌。';
export const command={name:'uno',description:'UNO 彩色卡牌 · 2–10 人或电脑陪练',type:1,integration_types:[0],contexts:[0],options:[
 {type:1,name:'创建',description:'创建 UNO 牌桌',options:[{type:3,name:'模式',description:'单局（默认）或 500 分积分赛',choices:[{name:'单局休闲',value:'round'},{name:'500 分积分赛',value:'match'}]}]},
 {type:1,name:'测试',description:'创建电脑陪练 UNO 桌',options:[{type:4,name:'电脑数量',description:'默认 2 位，最多 9 位',min_value:1,max_value:9},{type:3,name:'模式',description:'游戏模式',choices:[{name:'单局休闲',value:'round'},{name:'500 分积分赛',value:'match'}]}]},
 {type:1,name:'帮助',description:'查看 UNO 规则与按钮说明'},{type:1,name:'牌桌',description:'定位当前频道牌桌'}]};
function status(t){return t.phase==='active'?`轮到 ${label(t,t.turn)}${t.pending?.kind==='openingColor'?' 选择开局颜色':t.pending?' 处理加牌':''} · <t:${Math.floor(t.deadline/1000)}:R> 超时`:t.phase==='lobby'?'等待加入 · 桌主开始':t.phase==='closed'?'牌桌已关闭':t.matchWinner?'积分赛结束':'本局结束 · 可开始下一局';}
export function board(t){
 const rows=[];if(t.phase!=='closed'){
  if(['lobby','settled'].includes(t.phase)){rows.push(row(button(t,'join','加入',3,t.players.length>=10||!!(t.mode==='match'&&t.handNo)),button(t,'start',t.handNo?'下一局':'开始',1,t.players.length<2||!!t.matchWinner),button(t,'hand','手牌 / 操作',1),button(t,'leave','离桌')));rows.push(row(button(t,'addbot','添加电脑',2,t.players.length>=10||!!(t.mode==='match'&&t.handNo)),button(t,'removebots','移除电脑',2,!t.players.some(p=>p.bot)||!!(t.mode==='match'&&t.handNo))));}
  else rows.push(row(button(t,'hand','手牌 / 操作',1),button(t,'uno','喊 / 补喊 UNO',3),button(t,'catch','抓漏喊',4,!t.unoOpportunity)));
  rows.push(row(button(t,'help','规则'),button(t,'refresh','刷新牌桌'),button(t,'close','关桌')));
 }
 const top=t.discard.length?game.cardName(t.discard.at(-1)):'尚未发牌';
 const fields=[{name:'玩家 · 仅公开张数',value:t.players.map(p=>`${t.turn===p.id?'▶ ':''}${label(t,p.id)} · ${p.cards.length} 张${p.cards.length===1?' · 剩一张':''} · ${p.score} 分`).join('\n')||'无玩家'}];
 if(t.winner)fields.push({name:'🏆 结算',value:`${label(t,t.winner)} 出完手牌，获得 **${t.roundPoints} 分**${t.matchWinner?' · 达到 500 分，赢得积分赛':''}`});
 if(t.unoOpportunity)fields.push({name:'UNO 宣告窗口',value:'有人剩下一张牌，尚未宣告 UNO。可补喊或抓漏喊，直到下一次出牌/摸牌。'});
 if(t.log.length)fields.push({name:'最近操作',value:t.log.slice(-4).join('\n')});
 return {content:'',embeds:[{title:'🦋 Aliceneko · UNO',color:0xD9688D,description:`${t.mode==='match'?'500 分积分赛':'单局休闲'} · 第 ${t.handNo} 局 · ${t.players.length}/10 人\n\n**桌面：${top}**\n当前颜色：${t.color?colorEmoji[t.color]+' '+game.COLOR_NAMES[t.color]:'待选择'} · ${t.direction===1?'顺时针 ↻':'逆时针 ↺'}\n\n**${status(t)}**\n${t.pending&&t.pending.kind!=='openingColor'?'下家请打开私密手牌接受罚牌'+(t.pending.kind==='draw4'?'或质疑 +4':'')+'。':''}`,fields,footer:{text:'beta.9 · 自动私密手牌 · 默认不叠加 · 空闲自动关桌'}}],components:rows,allowed_mentions:{parse:[]}};
}
export function handPanel(t,id,notice=''){
 const p=t.players.find(p=>p.id===id&&!p.bot);if(!p)throw Error('你没有加入这张 UNO 桌。');
 const own=t.turn===id&&t.phase==='active',legal=game.legalCards(t,id),page=pageCards(t,id),b=(action,text,style=2,disabled=false)=>button(t,panelAction(id,action),text,style,disabled),rows=[];
 if(own){
  if(t.pending?.kind==='openingColor')rows.push(row(...game.COLORS.map(c=>b(`opening~${c}`,game.COLOR_NAMES[c]+'色',1))));
  else if(t.pending){rows.push(row(b('accept',`接受 ${t.pending.kind==='draw2'?2:4} 张并跳过`,4),...(t.pending.kind==='draw4'?[b('challenge','质疑 +4',1)]:[])));}
  else{
   const options=page.cards.map((c,n)=>({label:`${page.page*20+n+1}. ${game.cardName(c)}`,value:String(c),description:game.face(c).value==='draw4'?'选颜色后出牌；同色有牌时可能被质疑':'点击选择出牌'})).filter((_,n)=>legal.includes(page.cards[n]));
   if(options.length)rows.push(row({type:3,custom_id:`u:${t.epoch}:${t.version}:${panelAction(id,'play')}`,placeholder:'选择高亮牌出牌（编号与图片一致）',min_values:1,max_values:1,options}));
   rows.push(row(b('draw','摸 1 张',1,t.drawn!==null),...(t.drawn!==null?[b('pass','保留摸牌 · 结束回合')]:[]),...(p.cards.length===2?[b('uno',t.armed===id?'已宣告 · 请出牌':'喊 UNO 后出牌',3,t.armed===id)]:[])));
  }
 }
 if(t.unoOpportunity)rows.push(row(t.unoOpportunity.player===id?b('uno','立即补喊 UNO',3):b('catch','抓漏喊 UNO',4)));
 rows.push(row(b('hand','刷新手牌'),b(`page~${page.page-1}`,'上一页',2,page.page===0),b(`page~${page.page+1}`,'下一页',2,page.page>=page.pages-1),...(t.messageId?[{type:2,style:5,label:'公共牌桌',url:`https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId}`}]:[])));
 const list=page.cards.map((c,n)=>`${legal.includes(c)?'🟢':'▫️'} **${page.page*20+n+1}** ${game.cardName(c)}${t.drawn===c?' · 刚摸到':''}`).join('\n')||'等待发牌';
 return {content:`**第 ${t.handNo} 局 · 你的 UNO 手牌 · ${p.cards.length} 张**${notice?'\n'+notice:''}`,embeds:[{title:`仅你可见 · 第 ${page.page+1}/${page.pages} 页`,description:`**${own?'现在该你行动':status(t)}**\n桌面：${t.discard.length?game.cardName(t.discard.at(-1)):'未发牌'} · 当前${t.color?game.COLOR_NAMES[t.color]+'色':'颜色待定'}\n\n${list}${own&&t.drawn!==null?'\n\n摸牌后只能出刚摸到的牌，或选择保留。':''}`,color:own?0x57B99A:0xD9688D,footer:{text:'绿框可出 · 数字编号对应选择菜单 · 他人操作后自动更新'}}],components:rows.slice(0,5),attachments:[],allowed_mentions:{parse:[]}};
}
export function colorPrompt(t,id,card){return {type:4,data:{content:`**${game.cardName(card)} · 请选择后续颜色**\n选择颜色时才正式出牌。${game.face(card).value==='draw4'?'若你还有当前颜色的牌，下家质疑成功会让你罚摸 4 张。':''}`,flags:64,components:[row(...game.COLORS.map(c=>button(t,`color~${id}~${card}~${c}`,game.COLOR_NAMES[c]+'色',1)))],allowed_mentions:{parse:[]}}};}

