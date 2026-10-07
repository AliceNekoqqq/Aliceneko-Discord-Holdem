import {avatarEmoji,victoryEmoji} from './uno-profile.mjs';
import {wearsCrown} from './uno-rankings.mjs';
import * as game from './uno-engine.mjs';
import {EMOTES,activeEmote} from './uno-social.mjs';
export const PAGE_SIZE=10;
export const row=(...components)=>({type:1,components});
export const panelAction=(id,action)=>`p~${id}~${action}`;
export const button=(t,action,label,style=2,disabled=false)=>({type:2,custom_id:`u:${t.epoch}:${t.version}:${action}`,label,style,disabled});
export const colorEmoji={red:'🔴',yellow:'🟡',green:'🟢',blue:'🔵'};
export const label=(t,id)=>{const p=t.players.find(p=>p.id===id);const name=p?.name?p.name.replace(/[\\`*_~>|\[\]]/g,''): /^\d+$/.test(id||'')?`<@${id}>`:'玩家';return wearsCrown(t,id)?`${name} 👑 UNO 大王`:name;};
export const sortedCards=p=>[...p.cards].sort((a,b)=>a-b);
export function pageCards(t,id){const p=t.players.find(p=>p.id===id),cards=sortedCards(p),pages=Math.max(1,Math.ceil(cards.length/PAGE_SIZE)),page=Math.max(0,Math.min(t.pages?.[id]||0,pages-1));return {page,pages,cards:cards.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)};}
export const HELP="🦋 **Aliceneko · UNO 牌桌小剧场**\n\n🪑 **坐好，准备开牌！**\n2–10 人，经典 108 张，每人 7 张。同色、同数字或同功能符号可出；万能牌先选颜色。`/uno 创建` 和朋友开桌，`/uno 测试` 找电脑陪练。德州与 UNO 共用每频道一桌。\n\n🎴 **你的回合，你做主**\n点「我的手牌 / 出牌」操作。绿框可出，金框可抢出；没牌可出就摸 1 张，也可自愿摸牌。摸后只能出刚摸到的牌，或保留结束。双人反转相当于跳过。\n\n🎁 **加牌礼包，谁来收？**\n默认混合升档：+2 接 +2/+4，+4 仅接 +4，每回合接一张。接受累计罚牌后跳过；末张加牌先清算再结算。牌桌会标出加码者、承受者和累计张数。\n\n🕵️ **+4 真出牌，还是虚张声势？**\n正常只能在没有当前颜色牌时出 +4。下家可质疑最新 +4：成功，出牌者摸全部累计罚牌，你继续行动；失败，你摸累计罚牌再加 2 张并跳过。继续叠加即放弃质疑上一张；质疑快照仅质疑者可见。\n\n⚡ **抢出，手快有戏！**\n数字 1–9 落桌后有 5 秒窗口，同色同数字可回合外抢出；先通过服务器校验者成功，从抢出者下家继续。0、功能牌和开局牌不抢出。剩单张自动喊 UNO；抢出王与回合截胡记录在结算揭晓。\n\n📣 **UNO 要喊，别被抓包！**\n剩两张时先喊 UNO，再出牌；漏喊可立即补喊。其他人可在下一次出牌/摸牌前抓漏喊，罚摸 2 张。\n\n💬 **对着座位来一句**\n公共桌面点「💬 互动」，选玩家，再选「轮到你了」「接招吧」「谢谢你呀」「盯上你了」「这波漂亮」。展示 8 秒，每人冷却 8 秒，全桌间隔 1.5 秒；不会改变牌局规则，也不续延关桌时间。\n\n🤝 **2v2，一起赢！**\n独立组队模式，恰好四人，1/3 号红队、2/4 号蓝队相对而坐。一人出完，全队获胜，只计对手剩余牌分；各自手牌仍私密。\n\n🏆 **赢牌也赢节目效果**\n数字按面值、功能牌 20、万能牌 50；可选单局或 500 分积分赛。本局趣事卡展示抢出、截胡和加牌接力。\n\n🏳️ **想歇会儿也可以**\n在牌桌管理选择「本局认输」并确认，退出本局轮转，罚牌先收下。其他玩家继续，2v2 队友仍可出牌；认输本人计负场。下一局可重新参战。\n\n🎭 **这是我的座位！**\n点「个人设置」或 `/uno 个人设置`，选择 emoji、名牌配色、入场短句和胜利小表情，自动保存；本服务器跨频道通用。大王游戏称号显示头像王冠、金色名牌与星光；绿色框仍表示当前行动。\n\n👑 **冲榜，当 UNO 大王！**\n`/uno 排行榜` 查看本服务器真人对局胜场；含电脑的局不计入，取消的局不计入。每局结算一次，2v2 未认输的胜队成员各获一胜。胜场相同按胜率、较早达成该胜场排序。`/uno 称号` 让第一名自选称号或同名身份组；易主自动收回。榜单从本版本开始累计。\n\n⏰ **别让牌桌等太久**\n普通回合 60 秒，抢出窗口结束后开始计时。超时自动摸牌保留或接受罚牌；等待开局 10 分钟、结算后 15 分钟、游玩中连续 15 分钟无人有效操作自动关桌。看牌、刷新和表情不续时。\n";
export const command={name:'uno',description:'UNO 彩色卡牌 · 2–10 人或电脑陪练',type:1,integration_types:[0],contexts:[0],options:[
 {type:1,name:'创建',description:'创建 UNO 牌桌',options:[{type:3,name:'模式',description:'单局、500 分积分赛或四人组队',choices:[{name:'单局休闲',value:'round'},{name:'500 分积分赛',value:'match'},{name:'双人组队 · 2v2',value:'teams'}]}]},
 {type:1,name:'测试',description:'创建电脑陪练 UNO 桌',options:[{type:4,name:'电脑数量',description:'个人赛默认2位，组队默认3位；组队最多3位',min_value:1,max_value:9},{type:3,name:'模式',description:'游戏模式',choices:[{name:'单局休闲',value:'round'},{name:'500 分积分赛',value:'match'},{name:'双人组队 · 2v2',value:'teams'}]}]},
 {type:1,name:'个人设置',description:'选择座位 emoji 形象和个人名牌配色'},{type:1,name:'排行榜',description:'查看本服务器真人 UNO 胜场排行'},{type:1,name:'称号',description:'第一名选择 UNO 大王称号或身份组'},{type:1,name:'帮助',description:'查看 UNO 规则与按钮说明'},{type:1,name:'牌桌',description:'定位当前频道牌桌'}]};
const hex={red:0xDE4D6E,yellow:0xEFB93A,green:0x39AC87,blue:0x4787D4};
export const ruleSummary=t=>`${{none:'基础不叠加',same:'同类叠加',mixed:'混合升档叠加'}[game.rulesOf(t).stacking]} · 抢出${game.rulesOf(t).jumpIn?'开':'关'}`;
export const teamLabel=(t,id)=>game.teamOf(t,id)===0?'🔴 红队':'🔵 蓝队';
export const modeName=t=>t.mode==='teams'?'2v2 组队':t.mode==='match'?'500 分积分赛':'UNO 休闲桌';
export const cardLabel=card=>{const f=game.face(card);return `${colorEmoji[f.color]||'🌈'} ${game.cardName(card)}`;};
export function actionText(t,e){
 if(!e)return '尚未有人出牌';const who=label(t,e.actor);
 switch(e.kind){
  case 'entrance':return `🪑 **${who}**：${e.text}`;
  case 'play':return `**${who}** ${e.jump?'⚡ 抢出了':'出了'} **${cardLabel(e.card)}**${e.stacked?` · 累计 +${e.stackTotal}`:''}${e.uno?' · UNO！':''}${!game.face(e.card).color?`，改为${colorEmoji[e.color]}${game.COLOR_NAMES[e.color]}色`:''}`;
  case 'start':return `第 ${t.handNo} 局开始，开局牌 **${cardLabel(e.card)}**`;
  case 'draw':return `🎴 ${who} 摸了 **${e.count} 张**${e.canPlay?'：新牌能出！正在决定出牌或保留':'，把机会留给下一位'}`;
  case 'pass':return `📥 ${who} 保留摸到的牌，结束回合：先攒着，下次再出！`;
  case 'accept':return `🫠 ${who} 接受 **${e.count} 张罚牌**，跳过回合：这份大礼包我收下了…`;
  case 'challenge':return e.success?`🕵️ ${who} 质疑成功！${label(t,e.target)}的虚张声势被识破，罚摸 **${e.count} 张**`:`🙈 ${who} 质疑失败，罚摸 **${e.count} 张**并跳过：这次看走眼了`;
  case 'catch':return `👀 ${who} 抓到 ${label(t,e.target)}漏喊 UNO，罚摸 **2 张**：被逮到啦！`;
  case 'uno':return `📣 ${who} ${t.armed===e.actor?'准备出牌并喊':'喊了'} UNO！`;
  case 'timeout':return `⏰ ${who} 行动超时，已自动处理；下一棒继续！`;
  case 'color':return `🌈 ${who} 选择了 ${colorEmoji[e.color]}${game.COLOR_NAMES[e.color]}色`;
  case 'surrender':return `🏳️ ${who} 认输：这局先歇会儿，下局再战！`;
  case 'settle':return `🏆 ${who} ${e.reason==='surrender'?'坚持到最后获胜':'出完手牌'}，${t.mode==='teams'?game.teamName(e.team)+'获胜，获得':'获得'} **${e.points} 分**`;
  default:return '🔄 牌桌已更新，精彩继续！';
 }
}
export function playEffect(t,e=t.lastPlay){if(!e)return '';const f=game.face(e.card);
 if(e.jump)return `${e.from===e.actor?`⚡ ${label(t,e.actor)}抢出连击！`:`⚡ ${label(t,e.actor)}抢走了 ${label(t,e.from)}的回合！${label(t,e.from)}的原轮次被抢走`} → ${t.phase==='active'?`现在轮到 ${label(t,t.turn)}`:'本局结束'}${e.uno?' · 📣 已自动喊 UNO':''}`;
 if(f.value==='draw2'||f.value==='draw4'){const pending=t.pending?.offender===e.actor&&t.pending.kind===f.value;return `${e.stacked?`💥 ${label(t,e.actor)} 接住 ${label(t,e.respondingTo||t.pending?.chain?.at(-2)?.actor)}的加牌，反手加码！\n`:'🎁 加牌礼包已送出！\n'}${pending?`🎯 ${label(t,t.pending.victim)} 承受累计 **+${game.penaltyCount(t)}**${game.rulesOf(t).stacking!=='none'&&!t.pending.finisher?'，可继续叠加':'，需处理罚牌'}`:'✅ 加牌处理已完成'}${!f.color?`；后续${game.COLOR_NAMES[e.color]}色`:''}`;}
 if(e.skipped)return `🚧 跳过 ${label(t,e.skipped)}：这一轮先歇会儿`;
 if(f.value==='reverse')return '🔄 出牌方向已反转，掉头继续！';
 if(f.value==='wild')return `后续改为 ${colorEmoji[e.color]}${game.COLOR_NAMES[e.color]}色`;
 return '🎴 下一位接棒：匹配颜色、数字或符号';
}
function status(t){if(game.jumpOpen(t))return `抢出窗口 · 下一位 ${label(t,t.turn)}`;return t.phase==='active'?`轮到 ${label(t,t.turn)}${t.pending?.kind==='openingColor'?' 选择开局颜色':t.pending?' 处理罚牌':''}`:t.phase==='lobby'?'🪑 等待加入，桌主准备好就发牌':t.phase==='closed'?'🌙 牌桌已关闭，下次再战':t.matchWinner?'🏆 积分赛结束，冠军诞生':'🎉 本局结束，可以开始下一局';}
export function publicStep(t){
 if(game.jumpOpen(t))return `⚡ 5 秒抢出窗口，普通行动暂候 · <t:${Math.ceil(t.jumpWindow.until/1000)}:R> 结束`;
 if(t.pending?.kind==='openingColor')return '🌈 先挑个开局颜色，让好戏开场！';
 if(t.pending)return `${game.rulesOf(t).stacking!=='none'&&!t.pending.finisher?'继续叠加，或':''}接受累计 ${game.penaltyCount(t)} 张${t.pending.kind==='draw4'?'；也可质疑最新 +4':''}`;
 return '🎴 打开「我的手牌 / 出牌」，轮到你就直接点牌';
}
export function turnHint(t,id){
 if(t.phase==='active'&&t.players.find(p=>p.id===id)?.surrendered)return '🏳️ 本局已认输，先看戏，下一局重新参战。';
 if(t.phase!=='active')return status(t);
 if(game.jumpCards(t,id).length)return '⚡ 抢出机会来了！点按钮夺取轮次，剩单张时自动喊 UNO。';
 if(game.jumpOpen(t))return `⚡ 抢出响应窗口中；结束后轮到 ${label(t,t.turn)}。`;
 if(t.turn!==id)return `⏳ 等待 ${label(t,t.turn)}${t.pending?' 处理罚牌':' 出牌'}；先看戏，也可点公共桌面「💬 互动」。`;
 if(t.pending?.kind==='openingColor')return '🌈 开场颜色由你定！请选择一种颜色。';
 if(t.selectedWild?.id===id&&game.playable(t,id,t.selectedWild.card))return '🌈 已选万能牌：点一种颜色，才会正式出牌。';
 if(t.pending)return `🔥 累计 +${game.penaltyCount(t)}：${game.legalCards(t,id).length?'可继续叠加，或':''}接受罚牌${t.pending.kind==='draw4'?'，也可质疑最新 +4':''}。`;
 if(t.drawn!==null)return '✨ 新牌正好能出！可以出刚摸到的这张，或点「保留并结束」。';
 const count=game.legalCards(t,id).length;return count?`🟢 轮到你：有 ${count} 张可出牌。直接点牌，或自愿摸 1 张。`:'🎴 暂时无牌可出，点「摸 1 张」碰碰运气。';
}
export function focusHandPage(t){
 if(game.jumpOpen(t)&&t.jumpFocusKey!==t.jumpWindow.key){t.jumpFocusKey=t.jumpWindow.key;for(const p of t.players){if(p.bot)continue;const card=game.jumpCards(t,p.id)[0];if(card!==undefined){t.pages??={};t.pages[p.id]=Math.floor(sortedCards(p).indexOf(card)/PAGE_SIZE);}}}
 if(t.phase!=='active')return;const p=t.players.find(p=>p.id===t.turn&&!p.bot);if(!p)return;
 const key=`${t.handNo}/${t.turn}/${t.drawn}/${t.lastPlay?.seq||0}/${game.jumpOpen(t)}`;if(t.focusKey===key)return;t.focusKey=key;
 const cards=sortedCards(p),first=game.legalCards(t,p.id)[0];if(first!==undefined){t.pages??={};t.pages[p.id]=Math.floor(cards.indexOf(first)/PAGE_SIZE);}
}
export function board(t){
 const rows=[];if(t.phase!=='closed'){
  if(['lobby','settled'].includes(t.phase))rows.push(row(button(t,'join','🪑 加入牌桌',3,t.players.length>=game.seatLimit(t)||!!(t.mode==='match'&&t.handNo)),button(t,'start',t.handNo?'🎴 开始下一局':'🎴 开始发牌',1,t.players.length<2||t.mode==='teams'&&t.players.length!==4||!!t.matchWinner),button(t,'hand','我的手牌',1)));
  else rows.push(row(button(t,'hand','我的手牌 / 出牌',1),...(game.jumpOpen(t)?[button(t,'jumpmenu','⚡ 抢出',4)]:[]),...(t.unoOpportunity?[button(t,'uno','补喊 UNO',3),button(t,'catch','抓漏喊 UNO',4)]:[])));
  rows.push(row(button(t,'social','💬 互动'),{type:2,custom_id:`v:${t.guild}:any:open`,label:'🎭 个人设置',style:2},button(t,'manage','⚙️ 牌桌管理'),button(t,'help','📖 玩法说明')));
 }
 const top=t.discard.length?cardLabel(t.discard.at(-1)):'尚未发牌',fields=[];
 if(t.lastPlay)fields.push({name:t.lastPlay.jump?'⚡ 抢出成功 · 轮次切换':t.lastPlay.stacked?'💥 反手加码！':'🃏 最近出牌',value:`${actionText(t,t.lastPlay)}\n${playEffect(t)}`});
 else if(t.discard.length)fields.push({name:'🃏 开局牌',value:top});
 if(t.phase==='active')fields.push({name:'▶ 现在轮到',value:`**${label(t,t.turn)}**${t.players.find(p=>p.id===t.turn)?.bot?' · 电脑思考中':` · <t:${Math.floor(t.deadline/1000)}:R> 超时`}\n${publicStep(t)}`});
 if(game.jumpOpen(t))fields.push({name:'⚡ 全员抢出窗口',value:`手里有 **${cardLabel(t.jumpWindow.card)}** 同色同数字牌即可抢出，不必等自己的回合。\n先通过校验者成功 · <t:${Math.ceil(t.jumpWindow.until/1000)}:R> 结束`});
 if(t.pending?.chain?.length)fields.push({name:`🔥 加牌接力 · 累计 +${game.penaltyCount(t)}`,value:t.pending.chain.map(e=>`${label(t,e.actor)} +${e.amount}`).join(' → ').slice(0,900)+`\n承受者：**${label(t,t.pending.victim)}**${t.pending.finisher?' · 已有玩家出完，先清算罚牌':''}`});
 if(t.mode==='teams')fields.push({name:'🤝 队友与队伍积分',value:[0,1].map(team=>`${team===0?'🔴':'🔵'} **${game.teamName(team)}**：${t.players.filter(p=>game.teamOf(t,p.id)===team).map(p=>label(t,p.id)).join(' + ')} · ${t.teamScores?.[team]||0} 分`).join('\n')});
 fields.push({name:'座次与剩余手牌',value:t.players.map((p,n)=>`${t.phase==='active'&&t.turn===p.id?(game.jumpOpen(t)?'⏳':'▶'):'▫️'} ${n+1}. ${avatarEmoji(p)} ${label(t,p.id)}${t.mode==='teams'?' · '+teamLabel(t,p.id):''}${p.id===t.owner?' · 桌主':''}　**${p.cards.length} 张**${p.surrendered?' · 🏳️ 已认输':p.cards.length===1?' ⚠️':''}${t.mode==='match'?` · ${p.score} 分`:''}`).join('\n')||'无玩家'});
 if(t.winner)fields.push({name:'🏆 本局结算',value:`${label(t,t.winner)} ${t.finishReason==='surrender'?'坚持到最后获胜':'出完手牌'}，${t.mode==='teams'?`**${game.teamName(t.winningTeam)}全队获胜**，获得`:'获得'} **${t.roundPoints} 分**${t.matchWinner?'，赢得积分赛':''}${t.players.filter(p=>!p.bot&&!p.surrendered&&(t.mode==='teams'?game.teamOf(t,p.id)===t.winningTeam:p.id===t.winner)).filter(p=>victoryEmoji(p)).map(p=>`\n${victoryEmoji(p)} ${label(t,p.id)} 的胜利表情`).join('')}`});
 if(t.unoOpportunity)fields.push({name:'⚠️ 漏喊 UNO 窗口',value:`${label(t,t.unoOpportunity.player)}还未喊 UNO；本人可补喊，其他玩家可抓漏喊。`});
 const reaction=activeEmote(t);if(reaction)fields.push({name:'💬 牌桌互动',value:`${label(t,reaction.actor)} → **${label(t,reaction.target)}**：${EMOTES[reaction.key].emoji} ${EMOTES[reaction.key].text}`});
 const moments=roundHighlights(t);if(t.phase==='settled'&&moments)fields.push({name:'🎬 本局趣事卡',value:moments});
 const recent=(t.events||[]).filter(e=>e.kind!=='start'&&e.seq!==t.lastPlay?.seq).slice(-3);
 if(recent.length)fields.push({name:'最近行动',value:recent.map(e=>actionText(t,e)).join('\n').slice(0,1000)});
 else if(!t.events?.length&&t.log?.length)fields.push({name:'最近行动',value:t.log.slice(-2).join('\n')});
 const closed=t.phase==='closed',caption=t.lastPlay?`${t.lastPlay.jump?'⚡⚡ 抢出成功！':'🃏'} ${actionText(t,t.lastPlay)}\n${t.phase==='active'?`▶ **${status(t)}**`:status(t)}`:`🦋 **UNO · ${status(t)}**`;
 return {content:caption,embeds:[{title:`第 ${t.handNo} 局 · ${modeName(t)}`,color:t.lastPlay?.jump?0xFFD166:hex[t.color]||0xD9688D,description:closed?'未完成局不计分。':`**当前颜色：${t.color?colorEmoji[t.color]+' '+game.COLOR_NAMES[t.color]+'色':'待选择'}** · ${t.direction===1?'顺时针 ↻':'逆时针 ↺'} · ${t.players.length}/${game.seatLimit(t)} 人\n玩法：**${ruleSummary(t)}**`,fields,footer:{text:'beta.16 · 座位顺时针编号 · 绿框行动 / 金框下一位或胜者 / 金名牌大王'}}],components:rows,allowed_mentions:{parse:[]}};
}
export function handPanel(t,id,notice=''){
 const p=t.players.find(p=>p.id===id&&!p.bot);if(!p)throw Error('你没有加入这张 UNO 桌。');
 const own=t.turn===id&&t.phase==='active',legal=game.legalCards(t,id),page=pageCards(t,id),b=(action,text,style=2,disabled=false)=>button(t,panelAction(id,action),text,style,disabled),rows=[];
 const jumps=game.jumpCards(t,id),selected=t.selectedWild?.id===id&&game.playable(t,id,t.selectedWild.card)?t.selectedWild:null,penalty=t.pending&&['draw2','draw4'].includes(t.pending.kind);
 const penaltyButtons=()=>[b('accept',`接受累计 ${game.penaltyCount(t)} 张并跳过`,4),...(t.pending.kind==='draw4'?[b('challenge','质疑最新 +4',1)]:[])];
 const unoButtons=()=>p.cards.length===2&&legal.length?[b('uno',t.armed===id?'已喊 UNO · 请出牌':'📣 先喊 UNO，再出牌',3,t.armed===id)]:[];
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
 if(t.unoOpportunity&&!p.surrendered)rows.push(row(t.unoOpportunity.player===id?b('uno','📣 立即补喊 UNO',3):b('catch',`抓 ${plainName(t,t.unoOpportunity.player)}漏喊`,4)));
 const nav=[b('hand','更新手牌')];if(page.pages>1)nav.push(b(`page~${page.page-1}`,'上一页',2,page.page===0),b(`page~${page.page+1}`,'下一页',2,page.page>=page.pages-1));
 if(own&&legal.length&&!page.cards.some(c=>legal.includes(c)))nav.push(b('locate','定位可出牌',1));
 if(t.messageId)nav.push({type:2,style:5,label:'回公共牌桌',url:`https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId}`});rows.push(row(...nav));
 const fields=[];if(t.mode==='teams')fields.push({name:'🤝 你的队伍',value:`${teamLabel(t,id)} · 队友：${t.players.filter(p=>p.id!==id&&game.teamOf(t,p.id)===game.teamOf(t,id)).map(p=>label(t,p.id)).join('、')||'等待加入'}`});if(penalty)fields.push({name:`🔥 累计 +${game.penaltyCount(t)}`,value:publicStep(t)});if(t.lastPlay)fields.push({name:'🃏 刚才谁出了什么',value:actionText(t,t.lastPlay)});
 if(p.cards.length)fields.push({name:'手牌文字',value:page.cards.map((c,n)=>`${legal.includes(c)?'🟢':'▫️'} **${page.page*PAGE_SIZE+n+1}** ${cardLabel(c)}${t.drawn===c?' · 刚摸到':''}`).join('\n')});
 let hint=turnHint(t,id);if(own&&legal.length&&!page.cards.some(c=>legal.includes(c)))hint+='\n可出的牌在其他页，点「定位可出牌」查看。';if(own&&p.cards.length===2&&legal.length&&t.armed!==id)hint+='\n📣 再出一张就剩单牌啦，记得先喊 UNO，别被抓包！';
 if(own&&t.deadline)hint+=`\n<t:${Math.floor(t.deadline/1000)}:R> 超时。`;
 return {content:`**${jumps.length?'⚡ 你可以抢出':own&&!game.jumpOpen(t)?'🟢 轮到你':'🦋 你的手牌'} · 第 ${t.handNo} 局 · ${p.cards.length} 张**${notice?'\n'+notice:''}`,embeds:[{title:hint.split('\n')[0],description:`${hint.split('\n').slice(1).join('\n')}\n桌面：${t.discard.length?cardLabel(t.discard.at(-1)):'未发牌'} · ${t.color?colorEmoji[t.color]+' 当前'+game.COLOR_NAMES[t.color]+'色':'颜色待定'}`,fields,color:jumps.length?0xFFD166:own?0x39AC87:0xD9688D,footer:{text:`仅你可见 · 第 ${page.page+1}/${page.pages} 页 · 绿框可出 / 金框抢出 / 灰框等待`}}],components:rows.slice(0,5),attachments:[],allowed_mentions:{parse:[]}};
}
export function plainName(t,id){const p=t.players.find(p=>p.id===id);return p?.name||`玩家 ${Math.max(1,t.players.findIndex(p=>p.id===id)+1)}`;}
export function management(t,id,admin=false){const owner=id===t.owner,waiting=['lobby','settled'].includes(t.phase),adjustable=waiting&&!(t.mode==='match'&&t.handNo),rules=game.rulesOf(t),rows=[];
 if(owner&&waiting)rows.push(row(button(t,`m~${id}~start`,t.handNo?'🎴 开始下一局':'🎴 开始发牌',1,t.players.length<2||t.mode==='teams'&&t.players.length!==4||!!t.matchWinner),button(t,`m~${id}~addbot`,'添加电脑',2,t.players.length>=game.seatLimit(t)||!!(t.mode==='match'&&t.handNo)),button(t,`m~${id}~removebots`,'移除电脑',2,!t.players.some(p=>p.bot)||!!(t.mode==='match'&&t.handNo))));
 if(owner&&adjustable){rows.push(row(...[['mixed','混合升档'],['same','同类叠加'],['none','不叠加']].map(([value,text])=>button(t,`m~${id}~rule~stacking~${value}`,text+(rules.stacking===value?' ✓':''),rules.stacking===value?3:2,rules.stacking===value))));rows.push(row(button(t,`m~${id}~rule~jumpIn~${!rules.jumpIn}`,rules.jumpIn?'关闭数字抢出':'开启数字抢出',rules.jumpIn?2:1)));}
 if(t.players.some(p=>p.id===id&&!p.bot))rows.push(row(button(t,`m~${id}~leave`,'离开牌桌',2,!waiting),...(!waiting?[button(t,`m~${id}~surrender`,'🏳️ 本局认输',4,t.phase!=='active'||!!t.players.find(p=>p.id===id)?.surrendered)]:[])));
 if(owner||admin)rows.push(row(button(t,`m~${id}~close`,'关闭整桌',4)));
 return {content:`**UNO 牌桌管理 · ${modeName(t)}**\n桌主：${label(t,t.owner)}\n当前玩法：**${ruleSummary(t)}**\n混合：+2 接 +2/+4，+4 仅接 +4；同类只接同种加牌。\n数字落桌有 5 秒抢出窗口，功能牌不抢出。${t.mode==='teams'?'\n2v2 恰好四人，1/3 号红队、2/4 号蓝队；队友相对而坐。':''}${!waiting?'\n本局进行中，规则固定；请在结算后调整。':t.mode==='match'&&t.handNo?'\n积分赛已开始，规则固定。':''}`,components:rows,allowed_mentions:{parse:[]}};
}
export function colorPrompt(t,id,card){return {type:4,data:{content:`**${game.cardName(card)} · 请选择后续颜色**\n选择颜色时才正式出牌。`,flags:64,components:[row(...game.COLORS.map(c=>button(t,`color~${id}~${card}~${c}`,game.COLOR_NAMES[c]+'色',1)))],allowed_mentions:{parse:[]}}};}


export function socialMenu(t,id,target=null){
 const others=t.players.filter(p=>p.id!==id),base=`s~${id}~`,rows=[];
 if(!others.length)return {content:'🪑 **牌桌现在只有你一位。**\n等其他玩家入座后就能互动啦！也可以在牌桌管理添加电脑陪练。',components:[],allowed_mentions:{parse:[]}};
 if(others.length)rows.push(row({type:3,custom_id:`u:${t.epoch}:${t.version}:${base}target~${t.handNo}`,placeholder:'🎯 选一位玩家，来点牌桌互动',min_values:1,max_values:1,options:others.map(p=>({label:plainName(t,p.id).slice(0,80),value:p.id,description:`${t.players.indexOf(p)+1} 号座位${p.bot?' · 电脑陪练':''}`}))}));
 if(target&&others.some(p=>p.id===target))rows.push(row(...Object.entries(EMOTES).map(([key,e])=>button(t,`${base}say~${t.handNo}~${target}~${key}`,`${e.emoji} ${e.text}`,2))));
 return {content:target?`💬 对 **${label(t,target)}** 说一句：`:'💬 **牌桌小剧场** · 先选玩家，再点一句表情。\n表情展示 8 秒，每人间隔 8 秒；不会改变轮次或续延关桌时间。',components:rows,allowed_mentions:{parse:[]}};
}
export function roundHighlights(t){
 const s=t.roundInteractions;if(!s)return '';const lines=[];
 const leaders=Object.entries(s.jumps).sort((a,b)=>b[1]-a[1]);if(leaders.length){const top=leaders[0][1],names=leaders.filter(([,n])=>n===top).map(([id])=>label(t,id)).join('、');lines.push(`⚡ 抢出王：${names} · 成功 **${top} 次**`);}
 const pairs=Object.entries(s.steals).sort((a,b)=>b[1]-a[1]);if(pairs.length){const [who,target]=pairs[0][0].split('|');lines.push(`😏 回合截胡：${label(t,who)} 抢走 ${label(t,target)}的轮次 **${pairs[0][1]} 次**`);}
 if(s.maxRelay?.count){const m=s.maxRelay;lines.push(`🎁 最狠加牌：累计 **+${m.count}**${m.absorbed?`，由 ${label(t,m.absorbed)}收下`:`，最后交给 ${label(t,m.target)}`}`);}
 if(s.counterattacks)lines.push(`💥 全桌反击：**${s.counterattacks} 次**加牌接力`);
 return lines.join('\n').slice(0,1000);
}
