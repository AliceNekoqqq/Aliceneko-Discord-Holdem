import * as game from './uno-engine.mjs';
export const PAGE_SIZE=10;
export const row=(...components)=>({type:1,components});
export const panelAction=(id,action)=>`p~${id}~${action}`;
export const button=(t,action,label,style=2,disabled=false)=>({type:2,custom_id:`u:${t.epoch}:${t.version}:${action}`,label,style,disabled});
export const colorEmoji={red:'🔴',yellow:'🟡',green:'🟢',blue:'🔵'};
export const label=(t,id)=>{const p=t.players.find(p=>p.id===id);return p?.name?p.name.replace(/[\\`*_~>|\[\]]/g,''): /^\d+$/.test(id||'')?`<@${id}>`:'玩家';};
export const sortedCards=p=>[...p.cards].sort((a,b)=>a-b);
export function pageCards(t,id){const p=t.players.find(p=>p.id===id),cards=sortedCards(p),pages=Math.max(1,Math.ceil(cards.length/PAGE_SIZE)),page=Math.max(0,Math.min(t.pages?.[id]||0,pages-1));return {page,pages,cards:cards.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)};}
export const HELP='**Aliceneko · UNO 经典 108 张**\n2–10 人，每人 7 张。同色、同数字或同符号可出；万能牌选后续颜色。\n默认**混合升档叠加**：+2 接 +2/+4，+4 仅接 +4；接受累计罚牌后跳过，每回合接一张。摸一张后只能出刚摸到的牌，也可保留。双人反转相当于跳过。\n+4 正常只能在没有当前颜色牌时出；可以冒险虚张声势。下家可质疑最新 +4：成功该出牌者摸全部累计罚牌，你继续行动；失败你摸累计罚牌再加 2 张并跳过。接力即放弃质疑上一张。质疑时仅你可见出牌者当时手牌。\n**抢出**：数字牌落桌后有 5 秒响应窗口，手中同色同数字可点「抢出」，不受轮次限制；先通过服务器校验者成功，之后从抢出者下家继续。功能牌和万能牌不抢出。抢出后剩一张自动喊 UNO。\n**2v2**：选择组队模式，恰好四人，队友相对而坐；任一队友出完，全队获胜，只计对手剩余牌分。各自手牌仍私密。\n剩两张时先点「先喊 UNO，再出牌」；漏喊后可立即补喊。其他玩家须在下一次出牌/摸牌前点「抓漏喊」。被抓罚 2 张。\n先出完获胜，最后一张 +2/+4 先处理罚牌再计分。数字按面值、功能牌 20、万能牌 50；可选单局或 500 分积分赛。\n固定私密手牌原地更新；绿框可出，轮到你时显示对应操作。每回合 60 秒；超时自动摸牌并保留，或接受罚牌。等待开局 10 分钟、结算后 15 分钟、游戏中连续 15 分钟无人有效游玩操作自动关桌；查看/刷新不延长。\n`/uno 创建` 开桌；`/uno 测试` 可独自与电脑游玩。德州与 UNO 共用每频道一桌。';
export const command={name:'uno',description:'UNO 彩色卡牌 · 2–10 人或电脑陪练',type:1,integration_types:[0],contexts:[0],options:[
 {type:1,name:'创建',description:'创建 UNO 牌桌',options:[{type:3,name:'模式',description:'单局、500 分积分赛或四人组队',choices:[{name:'单局休闲',value:'round'},{name:'500 分积分赛',value:'match'},{name:'双人组队 · 2v2',value:'teams'}]}]},
 {type:1,name:'测试',description:'创建电脑陪练 UNO 桌',options:[{type:4,name:'电脑数量',description:'个人赛默认2位，组队默认3位；组队最多3位',min_value:1,max_value:9},{type:3,name:'模式',description:'游戏模式',choices:[{name:'单局休闲',value:'round'},{name:'500 分积分赛',value:'match'},{name:'双人组队 · 2v2',value:'teams'}]}]},
 {type:1,name:'帮助',description:'查看 UNO 规则与按钮说明'},{type:1,name:'牌桌',description:'定位当前频道牌桌'}]};
const hex={red:0xDE4D6E,yellow:0xEFB93A,green:0x39AC87,blue:0x4787D4};
export const ruleSummary=t=>`${{none:'基础不叠加',same:'同类叠加',mixed:'混合升档叠加'}[game.rulesOf(t).stacking]} · 抢出${game.rulesOf(t).jumpIn?'开':'关'}`;
export const teamLabel=(t,id)=>game.teamOf(t,id)===0?'🔴 红队':'🔵 蓝队';
export const modeName=t=>t.mode==='teams'?'2v2 组队':t.mode==='match'?'500 分积分赛':'UNO 休闲桌';
export const cardLabel=card=>{const f=game.face(card);return `${colorEmoji[f.color]||'🌈'} ${game.cardName(card)}`;};
export function actionText(t,e){
 if(!e)return '尚未有人出牌';const who=label(t,e.actor);
 switch(e.kind){
  case 'play':return `**${who}** ${e.jump?'⚡ 抢出了':'出了'} **${cardLabel(e.card)}**${e.stacked?` · 累计 +${e.stackTotal}`:''}${e.uno?' · UNO！':''}${!game.face(e.card).color?`，改为${colorEmoji[e.color]}${game.COLOR_NAMES[e.color]}色`:''}`;
  case 'start':return `第 ${t.handNo} 局开始，开局牌 **${cardLabel(e.card)}**`;
  case 'draw':return `${who} 摸了 **${e.count} 张**${e.canPlay?'，正在决定出牌或保留':''}`;
  case 'pass':return `${who} 保留摸到的牌，结束回合`;
  case 'accept':return `${who} 接受 **${e.count} 张罚牌**，跳过回合`;
  case 'challenge':return e.success?`${who} 质疑成功，${label(t,e.target)}罚摸 **${e.count} 张**`:`${who} 质疑失败，罚摸 **${e.count} 张**并跳过`;
  case 'catch':return `${who} 抓到 ${label(t,e.target)}漏喊 UNO，罚摸 **2 张**`;
  case 'uno':return `${who} ${t.armed===e.actor?'准备出牌并喊':'喊了'} UNO！`;
  case 'timeout':return `${who} 行动超时，已自动处理`;
  case 'color':return `${who} 选择了 ${colorEmoji[e.color]}${game.COLOR_NAMES[e.color]}色`;
  case 'settle':return `${who} 出完手牌，${t.mode==='teams'?game.teamName(e.team)+'获胜，获得':'获得'} **${e.points} 分**`;
  default:return '牌桌已更新';
 }
}
export function playEffect(t,e=t.lastPlay){if(!e)return '';const f=game.face(e.card);
 if(e.jump)return `${label(t,e.from)}的原轮次被抢走 → ${t.phase==='active'?`现在轮到 ${label(t,t.turn)}`:'本局结束'}${e.uno?' · 已自动喊 UNO':''}`;
 if(f.value==='draw2'||f.value==='draw4'){const pending=t.pending?.offender===e.actor&&t.pending.kind===f.value;return `${pending?`${label(t,t.pending.victim)} 承受累计 **+${game.penaltyCount(t)}**${game.rulesOf(t).stacking!=='none'&&!t.pending.finisher?'，可继续叠加':'，需处理罚牌'}`:'加牌处理已完成'}${!f.color?`；后续${game.COLOR_NAMES[e.color]}色`:''}`;}
 if(e.skipped)return `跳过 ${label(t,e.skipped)}`;
 if(f.value==='reverse')return '出牌方向已反转';
 if(f.value==='wild')return `后续改为 ${colorEmoji[e.color]}${game.COLOR_NAMES[e.color]}色`;
 return '下一位继续匹配颜色、数字或符号';
}
function status(t){if(game.jumpOpen(t))return `抢出窗口 · 下一位 ${label(t,t.turn)}`;return t.phase==='active'?`轮到 ${label(t,t.turn)}${t.pending?.kind==='openingColor'?' 选择开局颜色':t.pending?' 处理罚牌':''}`:t.phase==='lobby'?'等待加入，由桌主开始':t.phase==='closed'?'牌桌已关闭':t.matchWinner?'积分赛结束':'本局结束，可以开始下一局';}
export function publicStep(t){
 if(game.jumpOpen(t))return `⚡ 5 秒抢出窗口，普通行动暂候 · <t:${Math.ceil(t.jumpWindow.until/1000)}:R> 结束`;
 if(t.pending?.kind==='openingColor')return '先选开局颜色';
 if(t.pending)return `${game.rulesOf(t).stacking!=='none'&&!t.pending.finisher?'继续叠加，或':''}接受累计 ${game.penaltyCount(t)} 张${t.pending.kind==='draw4'?'；也可质疑最新 +4':''}`;
 return '打开「我的手牌 / 出牌」操作';
}
export function turnHint(t,id){
 if(t.phase!=='active')return status(t);
 if(game.jumpCards(t,id).length)return '⚡ 现在可以抢出！点按钮夺取轮次，剩单张时自动喊 UNO。';
 if(game.jumpOpen(t))return `⚡ 抢出响应窗口中；结束后轮到 ${label(t,t.turn)}。`;
 if(t.turn!==id)return `⏳ 等待 ${label(t,t.turn)}${t.pending?' 处理罚牌':' 出牌'}；你暂时不用操作。`;
 if(t.pending?.kind==='openingColor')return '🟢 轮到你：请选择开局颜色。';
 if(t.selectedWild?.id===id&&game.playable(t,id,t.selectedWild.card))return '🌈 已选万能牌：点一种颜色，才会正式出牌。';
 if(t.pending)return `🔥 累计 +${game.penaltyCount(t)}：${game.legalCards(t,id).length?'可继续叠加，或':''}接受罚牌${t.pending.kind==='draw4'?'，也可质疑最新 +4':''}。`;
 if(t.drawn!==null)return '🟢 刚摸到一张可出牌：可以出这张，或点「保留并结束」。';
 const count=game.legalCards(t,id).length;return count?`🟢 轮到你：有 ${count} 张可出牌。直接点牌，或自愿摸 1 张。`:'🟢 轮到你：没有可出的牌，请点「摸 1 张」。';
}
export function focusHandPage(t){
 if(game.jumpOpen(t)&&t.jumpFocusKey!==t.jumpWindow.key){t.jumpFocusKey=t.jumpWindow.key;for(const p of t.players){if(p.bot)continue;const card=game.jumpCards(t,p.id)[0];if(card!==undefined){t.pages??={};t.pages[p.id]=Math.floor(sortedCards(p).indexOf(card)/PAGE_SIZE);}}}
 if(t.phase!=='active')return;const p=t.players.find(p=>p.id===t.turn&&!p.bot);if(!p)return;
 const key=`${t.handNo}/${t.turn}/${t.drawn}/${t.lastPlay?.seq||0}/${game.jumpOpen(t)}`;if(t.focusKey===key)return;t.focusKey=key;
 const cards=sortedCards(p),first=game.legalCards(t,p.id)[0];if(first!==undefined){t.pages??={};t.pages[p.id]=Math.floor(cards.indexOf(first)/PAGE_SIZE);}
}
export function board(t){
 const rows=[];if(t.phase!=='closed'){
  if(['lobby','settled'].includes(t.phase))rows.push(row(button(t,'join','加入牌桌',3,t.players.length>=game.seatLimit(t)||!!(t.mode==='match'&&t.handNo)),button(t,'start',t.handNo?'开始下一局':'开始发牌',1,t.players.length<2||t.mode==='teams'&&t.players.length!==4||!!t.matchWinner),button(t,'hand','我的手牌',1)));
  else rows.push(row(button(t,'hand','我的手牌 / 出牌',1),...(game.jumpOpen(t)?[button(t,'jumpmenu','⚡ 抢出',4)]:[]),...(t.unoOpportunity?[button(t,'uno','补喊 UNO',3),button(t,'catch','抓漏喊 UNO',4)]:[])));
  rows.push(row(button(t,'manage','牌桌管理'),button(t,'help','玩法说明')));
 }
 const top=t.discard.length?cardLabel(t.discard.at(-1)):'尚未发牌',fields=[];
 if(t.lastPlay)fields.push({name:t.lastPlay.jump?'⚡ 抢出成功 · 轮次切换':'🃏 最近出牌',value:`${actionText(t,t.lastPlay)}\n${playEffect(t)}`});
 else if(t.discard.length)fields.push({name:'🃏 开局牌',value:top});
 if(t.phase==='active')fields.push({name:'▶ 现在轮到',value:`**${label(t,t.turn)}**${t.players.find(p=>p.id===t.turn)?.bot?' · 电脑思考中':` · <t:${Math.floor(t.deadline/1000)}:R> 超时`}\n${publicStep(t)}`});
 if(game.jumpOpen(t))fields.push({name:'⚡ 全员抢出窗口',value:`手里有 **${cardLabel(t.jumpWindow.card)}** 同色同数字牌即可抢出，不必等自己的回合。\n先通过校验者成功 · <t:${Math.ceil(t.jumpWindow.until/1000)}:R> 结束`});
 if(t.pending?.chain?.length)fields.push({name:`🔥 加牌接力 · 累计 +${game.penaltyCount(t)}`,value:t.pending.chain.map(e=>`${label(t,e.actor)} +${e.amount}`).join(' → ').slice(0,900)+`\n承受者：**${label(t,t.pending.victim)}**${t.pending.finisher?' · 已有玩家出完，先清算罚牌':''}`});
 if(t.mode==='teams')fields.push({name:'🤝 队友与队伍积分',value:[0,1].map(team=>`${team===0?'🔴':'🔵'} **${game.teamName(team)}**：${t.players.filter(p=>game.teamOf(t,p.id)===team).map(p=>label(t,p.id)).join(' + ')} · ${t.teamScores?.[team]||0} 分`).join('\n')});
 fields.push({name:'座次与剩余手牌',value:t.players.map((p,n)=>`${t.phase==='active'&&t.turn===p.id?(game.jumpOpen(t)?'⏳':'▶'):'▫️'} ${n+1}. ${label(t,p.id)}${t.mode==='teams'?' · '+teamLabel(t,p.id):''}${p.id===t.owner?' · 桌主':''}　**${p.cards.length} 张**${p.cards.length===1?' ⚠️':''}${t.mode==='match'?` · ${p.score} 分`:''}`).join('\n')||'无玩家'});
 if(t.winner)fields.push({name:'🏆 本局结算',value:`${label(t,t.winner)} 出完手牌，${t.mode==='teams'?`**${game.teamName(t.winningTeam)}全队获胜**，获得`:'获得'} **${t.roundPoints} 分**${t.matchWinner?'，赢得积分赛':''}`});
 if(t.unoOpportunity)fields.push({name:'⚠️ 漏喊 UNO 窗口',value:`${label(t,t.unoOpportunity.player)}还未喊 UNO；本人可补喊，其他玩家可抓漏喊。`});
 const recent=(t.events||[]).filter(e=>e.kind!=='start'&&e.seq!==t.lastPlay?.seq).slice(-3);
 if(recent.length)fields.push({name:'最近行动',value:recent.map(e=>actionText(t,e)).join('\n').slice(0,1000)});
 else if(!t.events?.length&&t.log?.length)fields.push({name:'最近行动',value:t.log.slice(-2).join('\n')});
 const closed=t.phase==='closed',caption=t.lastPlay?`${t.lastPlay.jump?'⚡⚡ 抢出成功！':'🃏'} ${actionText(t,t.lastPlay)}\n${t.phase==='active'?`▶ **${status(t)}**`:status(t)}`:`🦋 **UNO · ${status(t)}**`;
 return {content:caption,embeds:[{title:`第 ${t.handNo} 局 · ${modeName(t)}`,color:t.lastPlay?.jump?0xFFD166:hex[t.color]||0xD9688D,description:closed?'未完成局不计分。':`**当前颜色：${t.color?colorEmoji[t.color]+' '+game.COLOR_NAMES[t.color]+'色':'待选择'}** · ${t.direction===1?'顺时针 ↻':'逆时针 ↺'} · ${t.players.length}/${game.seatLimit(t)} 人\n玩法：**${ruleSummary(t)}**`,fields,footer:{text:'beta.12 · 座位顺时针编号 · 绿框行动 / 金框下一位或胜者'}}],components:rows,allowed_mentions:{parse:[]}};
}
export function handPanel(t,id,notice=''){
 const p=t.players.find(p=>p.id===id&&!p.bot);if(!p)throw Error('你没有加入这张 UNO 桌。');
 const own=t.turn===id&&t.phase==='active',legal=game.legalCards(t,id),page=pageCards(t,id),b=(action,text,style=2,disabled=false)=>button(t,panelAction(id,action),text,style,disabled),rows=[];
 const jumps=game.jumpCards(t,id),selected=t.selectedWild?.id===id&&game.playable(t,id,t.selectedWild.card)?t.selectedWild:null,penalty=t.pending&&['draw2','draw4'].includes(t.pending.kind);
 const penaltyButtons=()=>[b('accept',`接受累计 ${game.penaltyCount(t)} 张并跳过`,4),...(t.pending.kind==='draw4'?[b('challenge','质疑最新 +4',1)]:[])];
 const unoButtons=()=>p.cards.length===2&&legal.length?[b('uno',t.armed===id?'已喊 UNO · 请出牌':'先喊 UNO，再出牌',3,t.armed===id)]:[];
 if(jumps.length)rows.push(row(...jumps.slice(0,4).map(c=>b(`jump~${t.jumpWindow.key}~${c}`,p.cards.length===2?'⚡ 抢出并喊 UNO':`⚡ 抢出 ${cardLabel(c)}`,4))));
 if(own&&!game.jumpOpen(t)){
  if(t.pending?.kind==='openingColor')rows.push(row(...game.COLORS.map(c=>b(`opening~${c}`,colorEmoji[c]+game.COLOR_NAMES[c]+'色',1))));
  else if(selected){rows.push(row(...game.COLORS.map(c=>b(`pickcolor~${selected.card}~${c}`,colorEmoji[c]+game.COLOR_NAMES[c]+'色',1))));rows.push(row(b('change','换一张牌'),...unoButtons(),...(penalty?penaltyButtons():[])));}
  else{
   const options=page.cards.map((c,n)=>({label:`${page.page*PAGE_SIZE+n+1}. ${cardLabel(c)}`,value:String(c),description:game.face(c).value==='draw4'?'先选颜色；有同色牌时可能被质疑':!game.face(c).color?'先选颜色，再正式出牌':penalty?'叠加罚牌，传给下家':'选中即出牌'})).filter((_,n)=>legal.includes(page.cards[n]));
   if(options.length&&options.length<=4)rows.push(row(...options.map(o=>b(`card~${o.value}`,o.label,1))));
   else if(options.length)rows.push(row({type:3,custom_id:`u:${t.epoch}:${t.version}:${panelAction(id,'play')}`,placeholder:penalty?'选一张绿框加牌继续叠加':'选一张绿框牌直接出牌',min_values:1,max_values:1,options}));
   rows.push(row(...(penalty?penaltyButtons():[b('draw',legal.length?'自愿摸 1 张':'摸 1 张',1,t.drawn!==null),...(t.drawn!==null?[b('pass','保留并结束')]:[])]),...unoButtons()));
  }
 }
 if(t.unoOpportunity)rows.push(row(t.unoOpportunity.player===id?b('uno','立即补喊 UNO',3):b('catch',`抓 ${plainName(t,t.unoOpportunity.player)}漏喊`,4)));
 const nav=[b('hand','更新手牌')];if(page.pages>1)nav.push(b(`page~${page.page-1}`,'上一页',2,page.page===0),b(`page~${page.page+1}`,'下一页',2,page.page>=page.pages-1));
 if(own&&legal.length&&!page.cards.some(c=>legal.includes(c)))nav.push(b('locate','定位可出牌',1));
 if(t.messageId)nav.push({type:2,style:5,label:'回公共牌桌',url:`https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId}`});rows.push(row(...nav));
 const fields=[];if(t.mode==='teams')fields.push({name:'🤝 你的队伍',value:`${teamLabel(t,id)} · 队友：${t.players.filter(p=>p.id!==id&&game.teamOf(t,p.id)===game.teamOf(t,id)).map(p=>label(t,p.id)).join('、')||'等待加入'}`});if(penalty)fields.push({name:`🔥 累计 +${game.penaltyCount(t)}`,value:publicStep(t)});if(t.lastPlay)fields.push({name:'🃏 刚才谁出了什么',value:actionText(t,t.lastPlay)});
 if(p.cards.length)fields.push({name:'手牌文字',value:page.cards.map((c,n)=>`${legal.includes(c)?'🟢':'▫️'} **${page.page*PAGE_SIZE+n+1}** ${cardLabel(c)}${t.drawn===c?' · 刚摸到':''}`).join('\n')});
 let hint=turnHint(t,id);if(own&&legal.length&&!page.cards.some(c=>legal.includes(c)))hint+='\n可出的牌在其他页，点「定位可出牌」查看。';if(own&&p.cards.length===2&&legal.length&&t.armed!==id)hint+='\n⚠️ 出完这张就剩一张，记得先喊 UNO。';
 if(own&&t.deadline)hint+=`\n<t:${Math.floor(t.deadline/1000)}:R> 超时。`;
 return {content:`**${jumps.length?'⚡ 你可以抢出':own&&!game.jumpOpen(t)?'🟢 轮到你':'🦋 你的手牌'} · 第 ${t.handNo} 局 · ${p.cards.length} 张**${notice?'\n'+notice:''}`,embeds:[{title:hint.split('\n')[0],description:`${hint.split('\n').slice(1).join('\n')}\n桌面：${t.discard.length?cardLabel(t.discard.at(-1)):'未发牌'} · ${t.color?colorEmoji[t.color]+' 当前'+game.COLOR_NAMES[t.color]+'色':'颜色待定'}`,fields,color:jumps.length?0xFFD166:own?0x39AC87:0xD9688D,footer:{text:`仅你可见 · 第 ${page.page+1}/${page.pages} 页 · 绿框可出 / 金框抢出 / 灰框等待`}}],components:rows.slice(0,5),attachments:[],allowed_mentions:{parse:[]}};
}
export function plainName(t,id){const p=t.players.find(p=>p.id===id);return p?.name||`玩家 ${Math.max(1,t.players.findIndex(p=>p.id===id)+1)}`;}
export function management(t,id,admin=false){const owner=id===t.owner,waiting=['lobby','settled'].includes(t.phase),adjustable=waiting&&!(t.mode==='match'&&t.handNo),rules=game.rulesOf(t),rows=[];
 if(owner&&waiting)rows.push(row(button(t,`m~${id}~start`,t.handNo?'开始下一局':'开始发牌',1,t.players.length<2||t.mode==='teams'&&t.players.length!==4||!!t.matchWinner),button(t,`m~${id}~addbot`,'添加电脑',2,t.players.length>=game.seatLimit(t)||!!(t.mode==='match'&&t.handNo)),button(t,`m~${id}~removebots`,'移除电脑',2,!t.players.some(p=>p.bot)||!!(t.mode==='match'&&t.handNo))));
 if(owner&&adjustable){rows.push(row(...[['mixed','混合升档'],['same','同类叠加'],['none','不叠加']].map(([value,text])=>button(t,`m~${id}~rule~stacking~${value}`,text+(rules.stacking===value?' ✓':''),rules.stacking===value?3:2,rules.stacking===value))));rows.push(row(button(t,`m~${id}~rule~jumpIn~${!rules.jumpIn}`,rules.jumpIn?'关闭数字抢出':'开启数字抢出',rules.jumpIn?2:1)));}
 if(t.players.some(p=>p.id===id&&!p.bot))rows.push(row(button(t,`m~${id}~leave`,'离开牌桌',2,!waiting)));
 if(owner||admin)rows.push(row(button(t,`m~${id}~close`,'关闭整桌',4)));
 return {content:`**UNO 牌桌管理 · ${modeName(t)}**\n桌主：${label(t,t.owner)}\n当前玩法：**${ruleSummary(t)}**\n混合：+2 接 +2/+4，+4 仅接 +4；同类只接同种加牌。\n数字落桌有 5 秒抢出窗口，功能牌不抢出。${t.mode==='teams'?'\n2v2 恰好四人，1/3 号红队、2/4 号蓝队；队友相对而坐。':''}${!waiting?'\n本局进行中，规则固定；请在结算后调整。':t.mode==='match'&&t.handNo?'\n积分赛已开始，规则固定。':''}`,components:rows,allowed_mentions:{parse:[]}};
}
export function colorPrompt(t,id,card){return {type:4,data:{content:`**${game.cardName(card)} · 请选择后续颜色**\n选择颜色时才正式出牌。`,flags:64,components:[row(...game.COLORS.map(c=>button(t,`color~${id}~${card}~${c}`,game.COLOR_NAMES[c]+'色',1)))],allowed_mentions:{parse:[]}}};}
