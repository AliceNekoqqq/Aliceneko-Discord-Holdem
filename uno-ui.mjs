import * as game from './uno-engine.mjs';
export const PAGE_SIZE=10;
export const row=(...components)=>({type:1,components});
export const panelAction=(id,action)=>`p~${id}~${action}`;
export const button=(t,action,label,style=2,disabled=false)=>({type:2,custom_id:`u:${t.epoch}:${t.version}:${action}`,label,style,disabled});
export const colorEmoji={red:'🔴',yellow:'🟡',green:'🟢',blue:'🔵'};
export const label=(t,id)=>{const p=t.players.find(p=>p.id===id);return p?.name?p.name.replace(/[\\`*_~>|\[\]]/g,''): /^\d+$/.test(id||'')?`<@${id}>`:'玩家';};
export const sortedCards=p=>[...p.cards].sort((a,b)=>a-b);
export function pageCards(t,id){const p=t.players.find(p=>p.id===id),cards=sortedCards(p),pages=Math.max(1,Math.ceil(cards.length/PAGE_SIZE)),page=Math.max(0,Math.min(t.pages?.[id]||0,pages-1));return {page,pages,cards:cards.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)};}
export const HELP='**Aliceneko · UNO 经典 108 张**\n2–10 人，每人 7 张。同色、同数字或同符号可出；万能牌选后续颜色。\n摸 1 张后，只能出刚摸到的牌，也可保留；不能继续打原手牌。+2/+4 接受加牌后跳过，**不叠加**。双人反转相当于跳过。\n+4 正常只能在没有当前颜色牌时出；可以冒险虚张声势。下家可质疑：成功出牌者摸 4 张，你继续行动；失败你摸 6 张并跳过。质疑时仅你可见出牌者当时手牌。\n剩两张时先点「喊 UNO 后出牌」；漏喊后可立即补喊。其他玩家须在下一次出牌/摸牌前点「抓漏喊」。被抓罚 2 张。\n先出完获胜，最后一张 +2/+4 先处理罚牌再计分。数字按面值、功能牌 20、万能牌 50；可选单局或 500 分积分赛。\n固定私密手牌原地更新；绿框可出，轮到你时显示对应操作。每回合 60 秒；超时自动摸牌并保留，或接受罚牌。等待开局 10 分钟、结算后 15 分钟、游戏中连续 15 分钟无人有效游玩操作自动关桌；查看/刷新不延长。\n`/uno 创建` 开桌；`/uno 测试` 可独自与电脑游玩。德州与 UNO 共用每频道一桌。';
export const command={name:'uno',description:'UNO 彩色卡牌 · 2–10 人或电脑陪练',type:1,integration_types:[0],contexts:[0],options:[
 {type:1,name:'创建',description:'创建 UNO 牌桌',options:[{type:3,name:'模式',description:'单局（默认）或 500 分积分赛',choices:[{name:'单局休闲',value:'round'},{name:'500 分积分赛',value:'match'}]}]},
 {type:1,name:'测试',description:'创建电脑陪练 UNO 桌',options:[{type:4,name:'电脑数量',description:'默认 2 位，最多 9 位',min_value:1,max_value:9},{type:3,name:'模式',description:'游戏模式',choices:[{name:'单局休闲',value:'round'},{name:'500 分积分赛',value:'match'}]}]},
 {type:1,name:'帮助',description:'查看 UNO 规则与按钮说明'},{type:1,name:'牌桌',description:'定位当前频道牌桌'}]};
const hex={red:0xDE4D6E,yellow:0xEFB93A,green:0x39AC87,blue:0x4787D4};
export const cardLabel=card=>{const f=game.face(card);return `${colorEmoji[f.color]||'🌈'} ${game.cardName(card)}`;};
export function actionText(t,e){
 if(!e)return '尚未有人出牌';const who=label(t,e.actor);
 switch(e.kind){
  case 'play':return `**${who}** 出了 **${cardLabel(e.card)}**${e.uno?' · UNO！':''}${!game.face(e.card).color?`，改为${colorEmoji[e.color]}${game.COLOR_NAMES[e.color]}色`:''}`;
  case 'start':return `第 ${t.handNo} 局开始，开局牌 **${cardLabel(e.card)}**`;
  case 'draw':return `${who} 摸了 **${e.count} 张**${e.canPlay?'，正在决定出牌或保留':''}`;
  case 'pass':return `${who} 保留摸到的牌，结束回合`;
  case 'accept':return `${who} 接受 **${e.count} 张罚牌**，跳过回合`;
  case 'challenge':return e.success?`${who} 质疑成功，${label(t,e.target)}罚摸 **4 张**`:`${who} 质疑失败，罚摸 **6 张**并跳过`;
  case 'catch':return `${who} 抓到 ${label(t,e.target)}漏喊 UNO，罚摸 **2 张**`;
  case 'uno':return `${who} ${t.armed===e.actor?'准备出牌并喊':'喊了'} UNO！`;
  case 'timeout':return `${who} 行动超时，已自动处理`;
  case 'color':return `${who} 选择了 ${colorEmoji[e.color]}${game.COLOR_NAMES[e.color]}色`;
  case 'settle':return `${who} 出完手牌，获得 **${e.points} 分**`;
  default:return '牌桌已更新';
 }
}
export function playEffect(t,e=t.lastPlay){if(!e)return '';const f=game.face(e.card);
 if(f.value==='draw2'||f.value==='draw4'){const pending=t.pending?.offender===e.actor&&t.pending.kind===f.value;return `${pending?label(t,t.pending.victim)+(f.value==='draw2'?' 需摸两张并跳过':' 需接受四张或质疑'):'加牌处理已完成'}${!f.color?`；后续${game.COLOR_NAMES[e.color]}色`:''}`;}
 if(e.skipped)return `跳过 ${label(t,e.skipped)}`;
 if(f.value==='reverse')return '出牌方向已反转';
 if(f.value==='wild')return `后续改为 ${colorEmoji[e.color]}${game.COLOR_NAMES[e.color]}色`;
 return '下一位继续匹配颜色、数字或符号';
}
function status(t){return t.phase==='active'?`轮到 ${label(t,t.turn)}${t.pending?.kind==='openingColor'?' 选择开局颜色':t.pending?' 处理罚牌':''}`:t.phase==='lobby'?'等待加入，由桌主开始':t.phase==='closed'?'牌桌已关闭':t.matchWinner?'积分赛结束':'本局结束，可以开始下一局';}
export function turnHint(t,id){
 if(t.phase!=='active')return status(t);
 if(t.turn!==id)return `⏳ 等待 ${label(t,t.turn)}${t.pending?' 处理罚牌':' 出牌'}；你暂时不用操作。`;
 if(t.pending?.kind==='openingColor')return '🟢 轮到你：请选择开局颜色。';
 if(t.pending)return `⚠️ ${label(t,t.pending.offender)}出了 +${t.pending.kind==='draw2'?2:4}；请接受罚牌${t.pending.kind==='draw4'?'或质疑 +4':''}。`;
 if(t.selectedWild?.id===id&&game.playable(t,id,t.selectedWild.card))return '🌈 已选万能牌：点一种颜色，才会正式出牌。';
 if(t.drawn!==null)return '🟢 刚摸到一张可出牌：可以出这张，或点「保留并结束」。';
 const count=game.legalCards(t,id).length;return count?`🟢 轮到你：有 ${count} 张可出牌。直接点牌，或自愿摸 1 张。`:'🟢 轮到你：没有可出的牌，请点「摸 1 张」。';
}
export function focusHandPage(t){
 if(t.phase!=='active')return;const p=t.players.find(p=>p.id===t.turn&&!p.bot);if(!p)return;
 const key=`${t.handNo}/${t.turn}/${t.drawn}/${t.lastPlay?.seq||0}`;if(t.focusKey===key)return;t.focusKey=key;
 const cards=sortedCards(p),first=game.legalCards(t,p.id)[0];if(first!==undefined){t.pages??={};t.pages[p.id]=Math.floor(cards.indexOf(first)/PAGE_SIZE);}
}
export function board(t){
 const rows=[];if(t.phase!=='closed'){
  if(['lobby','settled'].includes(t.phase))rows.push(row(button(t,'join','加入牌桌',3,t.players.length>=10||!!(t.mode==='match'&&t.handNo)),button(t,'start',t.handNo?'开始下一局':'开始发牌',1,t.players.length<2||!!t.matchWinner),button(t,'hand','我的手牌',1)));
  else rows.push(row(button(t,'hand','我的手牌 / 出牌',1),...(t.unoOpportunity?[button(t,'uno','补喊 UNO',3),button(t,'catch','抓漏喊 UNO',4)]:[])));
  rows.push(row(button(t,'manage','牌桌管理'),button(t,'help','玩法说明')));
 }
 const top=t.discard.length?cardLabel(t.discard.at(-1)):'尚未发牌',fields=[];
 if(t.lastPlay)fields.push({name:'🃏 最近出牌',value:`${actionText(t,t.lastPlay)}\n${playEffect(t)}`});
 else if(t.discard.length)fields.push({name:'🃏 开局牌',value:top});
 if(t.phase==='active')fields.push({name:'▶ 现在轮到',value:`**${label(t,t.turn)}**${t.players.find(p=>p.id===t.turn)?.bot?' · 电脑思考中':` · <t:${Math.floor(t.deadline/1000)}:R> 超时`}\n${t.pending?(t.pending.kind==='openingColor'?'先选开局颜色':`请接受 ${t.pending.kind==='draw2'?2:4} 张罚牌${t.pending.kind==='draw4'?'或质疑 +4':''}`):'打开「我的手牌 / 出牌」操作'}`});
 fields.push({name:'座次与剩余手牌',value:t.players.map((p,n)=>`${t.turn===p.id?'▶':'▫️'} ${n+1}. ${label(t,p.id)}${p.id===t.owner?' · 桌主':''}　**${p.cards.length} 张**${p.cards.length===1?' ⚠️':''}${t.mode==='match'?` · ${p.score} 分`:''}`).join('\n')||'无玩家'});
 if(t.winner)fields.push({name:'🏆 本局结算',value:`${label(t,t.winner)} 出完手牌，获得 **${t.roundPoints} 分**${t.matchWinner?'，赢得积分赛':''}`});
 if(t.unoOpportunity)fields.push({name:'⚠️ 漏喊 UNO 窗口',value:`${label(t,t.unoOpportunity.player)}还未喊 UNO；本人可补喊，其他玩家可抓漏喊。`});
 const recent=(t.events||[]).filter(e=>e.kind!=='start'&&e.seq!==t.lastPlay?.seq).slice(-3);
 if(recent.length)fields.push({name:'最近行动',value:recent.map(e=>actionText(t,e)).join('\n').slice(0,1000)});
 else if(!t.events?.length&&t.log?.length)fields.push({name:'最近行动',value:t.log.slice(-2).join('\n')});
 const closed=t.phase==='closed',caption=t.lastPlay?`🃏 ${actionText(t,t.lastPlay)}\n${t.phase==='active'?`▶ **${status(t)}**`:status(t)}`:`🦋 **UNO · ${status(t)}**`;
 return {content:caption,embeds:[{title:`第 ${t.handNo} 局 · ${t.mode==='match'?'500 分积分赛':'UNO 休闲桌'}`,color:hex[t.color]||0xD9688D,description:closed?'未完成局不计分。':`**当前颜色：${t.color?colorEmoji[t.color]+' '+game.COLOR_NAMES[t.color]+'色':'待选择'}** · ${t.direction===1?'顺时针 ↻':'逆时针 ↺'} · ${t.players.length}/10 人`,fields,footer:{text:'beta.10 · 绿框可出 · 每频道一桌'}}],components:rows,allowed_mentions:{parse:[]}};
}
export function handPanel(t,id,notice=''){
 const p=t.players.find(p=>p.id===id&&!p.bot);if(!p)throw Error('你没有加入这张 UNO 桌。');
 const own=t.turn===id&&t.phase==='active',legal=game.legalCards(t,id),page=pageCards(t,id),b=(action,text,style=2,disabled=false)=>button(t,panelAction(id,action),text,style,disabled),rows=[];
 const selected=t.selectedWild?.id===id&&game.playable(t,id,t.selectedWild.card)?t.selectedWild:null;
 if(own){
  if(t.pending?.kind==='openingColor')rows.push(row(...game.COLORS.map(c=>b(`opening~${c}`,colorEmoji[c]+game.COLOR_NAMES[c]+'色',1))));
  else if(t.pending)rows.push(row(b('accept',`接受 ${t.pending.kind==='draw2'?2:4} 张并跳过`,4),...(t.pending.kind==='draw4'?[b('challenge','质疑这张 +4',1)]:[])));
  else if(selected){rows.push(row(...game.COLORS.map(c=>b(`pickcolor~${selected.card}~${c}`,colorEmoji[c]+game.COLOR_NAMES[c]+'色',1))));rows.push(row(b('change','换一张牌'),...(p.cards.length===2?[b('uno',t.armed===id?'已喊 UNO':'先喊 UNO',3,t.armed===id)]:[])));}
  else{
   const options=page.cards.map((c,n)=>({label:`${page.page*PAGE_SIZE+n+1}. ${cardLabel(c)}`,value:String(c),description:game.face(c).value==='draw4'?'先选颜色；有同色牌时可能被质疑':!game.face(c).color?'先选颜色，再正式出牌':'选中即出牌'})).filter((_,n)=>legal.includes(page.cards[n]));
   if(options.length&&options.length<=4)rows.push(row(...options.map(o=>b(`card~${o.value}`,o.label,1))));
   else if(options.length)rows.push(row({type:3,custom_id:`u:${t.epoch}:${t.version}:${panelAction(id,'play')}`,placeholder:'选一张绿框牌直接出牌',min_values:1,max_values:1,options}));
   rows.push(row(b('draw',legal.length?'自愿摸 1 张':'摸 1 张',1,t.drawn!==null),...(t.drawn!==null?[b('pass','保留并结束')]:[]),...(p.cards.length===2?[b('uno',t.armed===id?'已喊 UNO · 请出牌':'先喊 UNO，再出牌',3,t.armed===id)]:[])));
  }
 }
 if(t.unoOpportunity)rows.push(row(t.unoOpportunity.player===id?b('uno','立即补喊 UNO',3):b('catch',`抓 ${plainName(t,t.unoOpportunity.player)}漏喊`,4)));
 const nav=[b('hand','更新手牌')];if(page.pages>1)nav.push(b(`page~${page.page-1}`,'上一页',2,page.page===0),b(`page~${page.page+1}`,'下一页',2,page.page>=page.pages-1));
 if(own&&legal.length&&!page.cards.some(c=>legal.includes(c)))nav.push(b('locate','定位可出牌',1));
 if(t.messageId)nav.push({type:2,style:5,label:'回公共牌桌',url:`https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId}`});rows.push(row(...nav));
 const fields=[];if(t.lastPlay)fields.push({name:'🃏 刚才谁出了什么',value:actionText(t,t.lastPlay)});
 if(p.cards.length)fields.push({name:'手牌文字',value:page.cards.map((c,n)=>`${legal.includes(c)?'🟢':'▫️'} **${page.page*PAGE_SIZE+n+1}** ${cardLabel(c)}${t.drawn===c?' · 刚摸到':''}`).join('\n')});
 let hint=turnHint(t,id);if(own&&legal.length&&!page.cards.some(c=>legal.includes(c)))hint+='\n可出的牌在其他页，点「定位可出牌」查看。';if(own&&p.cards.length===2&&!t.pending&&t.armed!==id)hint+='\n⚠️ 出完这张就剩一张，记得先喊 UNO。';
 if(own&&t.deadline)hint+=`\n<t:${Math.floor(t.deadline/1000)}:R> 超时。`;
 return {content:`**${own?'🟢 轮到你':'🦋 你的手牌'} · 第 ${t.handNo} 局 · ${p.cards.length} 张**${notice?'\n'+notice:''}`,embeds:[{title:hint.split('\n')[0],description:`${hint.split('\n').slice(1).join('\n')}\n桌面：${t.discard.length?cardLabel(t.discard.at(-1)):'未发牌'} · ${t.color?colorEmoji[t.color]+' 当前'+game.COLOR_NAMES[t.color]+'色':'颜色待定'}`,fields,color:own?0x39AC87:0xD9688D,footer:{text:`仅你可见 · 第 ${page.page+1}/${page.pages} 页 · 绿框可出 / 灰框等待`}}],components:rows.slice(0,5),attachments:[],allowed_mentions:{parse:[]}};
}
export function plainName(t,id){const p=t.players.find(p=>p.id===id);return p?.name||`玩家 ${Math.max(1,t.players.findIndex(p=>p.id===id)+1)}`;}
export function management(t,id,admin=false){const owner=id===t.owner,waiting=['lobby','settled'].includes(t.phase),rows=[];
 if(owner&&waiting)rows.push(row(button(t,`m~${id}~start`,t.handNo?'开始下一局':'开始发牌',1,t.players.length<2||!!t.matchWinner),button(t,`m~${id}~addbot`,'添加电脑',2,t.players.length>=10||!!(t.mode==='match'&&t.handNo)),button(t,`m~${id}~removebots`,'移除电脑',2,!t.players.some(p=>p.bot)||!!(t.mode==='match'&&t.handNo))));
 if(t.players.some(p=>p.id===id&&!p.bot))rows.push(row(button(t,`m~${id}~leave`,'离开牌桌',2,!waiting)));
 if(owner||admin)rows.push(row(button(t,`m~${id}~close`,'关闭整桌',4)));
 return {content:`**UNO 牌桌管理**\n桌主：${label(t,t.owner)}${!waiting?'\n当前局正在进行，请在结算后离桌。':''}`,components:rows,allowed_mentions:{parse:[]}};
}
export function colorPrompt(t,id,card){return {type:4,data:{content:`**${game.cardName(card)} · 请选择后续颜色**\n选择颜色时才正式出牌。`,flags:64,components:[row(...game.COLORS.map(c=>button(t,`color~${id}~${card}~${c}`,game.COLOR_NAMES[c]+'色',1)))],allowed_mentions:{parse:[]}}};}
