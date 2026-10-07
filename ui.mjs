import * as game from './engine.mjs';

export function button(t,action,label,style=2,disabled=false) {
  return {type:2,style,label,custom_id:`h:${t.epoch}:${t.version}:${action}`,disabled};
}
export const row=(...components)=>({type:1,components});
export function confirmation(t,id,action,content) {
  return {type:4,data:{content,flags:64,allowed_mentions:{parse:[]},components:[row(button(t,`yes${action}~${id}`,'确认'+(action==='allin'?'全下':'关桌'),4),button(t,'cancel','取消'))]}};
}
export function quickRaises(t,id=t.turn) {
  const l=game.legal(t,id);
  if(!l.canRaise)return [];
  const candidates=[['quickmin','最小',l.minTotal],['quickhalf','半池',t.currentBet+Math.max(t.minRaise,Math.ceil((t.pot+l.call)/20)*10)],['quickpot','满池',t.currentBet+Math.max(t.minRaise,Math.ceil((t.pot+l.call)/10)*10)]];
  const used=new Set();
  return candidates.filter(([, ,target])=>target<l.maxTotal&&!used.has(target)&&used.add(target)).map(([action,label,target])=>({action,label:`${label}至 ${target}`,target}));
}
export function bettingRows(t,id) {
  const l=game.legal(t,id),p=l.p;
  const label=l.call?`跟注 ${Math.min(l.call,p.stack)}${l.call>=p.stack?' · 全下':''}`:'过牌';
  const result=[row(button(t,l.call?'call':'check',label,3),button(t,'raise',t.currentBet?'自定加注':'自定下注',1,!l.canRaise||l.maxTotal<=t.currentBet),button(t,'fold','弃牌'),button(t,'allin',`全下 ${p.stack}`,4,!l.canRaise&&l.maxTotal>t.currentBet))];
  const quick=quickRaises(t,id);if(quick.length)result.push(row(...quick.map(q=>button(t,q.action,q.label))));
  return result;
}
export const panelAction=(id,action)=>`p~${id}~${action}`;
export function handPanel(t,id,notice='') {
  const p=t.players.find(p=>p.id===id&&!p.bot);
  if(!p)throw Error('你没有加入这张牌桌。');
  const active=!['lobby','settled','closed'].includes(t.phase),yourTurn=active&&t.turn===id;
  const privateButton=(action,label,style=2)=>button(t,panelAction(id,action),label,style);
  const phase={lobby:'等待发牌',preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌',settled:'本手结束',closed:'牌桌关闭'}[t.phase];
  const status=!p.cards.length?'已入座 · 等待桌主发牌':!active?'本手结束 · 等待下一手':p.folded?'你已弃牌 · 本手不用再操作':!p.stack?'你已全下 · 等待摊牌结算':yourTurn?'🟢 现在该你行动':`等待 ${game.playerLabel(t,t.turn)} 行动`;
  const rank=p.cards.length&&t.board.length>=3?game.HAND_NAMES[game.rankSeven([...p.cards,...t.board])[0]]:null;
  const cards=p.cards.length?game.cardsText(p.cards):'🂠　🂠';
  const fields=[...(p.cards.length?[{name:'你的底牌 ①',value:`**${game.cardText(p.cards[0])}**`,inline:true},{name:'你的底牌 ②',value:`**${game.cardText(p.cards[1])}**`,inline:true}]:[]),{name:'桌面公共牌 · 所有人共用',value:[...t.board.map(game.cardText),...Array(5-t.board.length).fill('🂠')].join('　')},{name:'你的筹码',value:String(p.stack),inline:true},{name:'本轮已下',value:String(p.round),inline:true},{name:'底池',value:String(t.pot),inline:true}];
  if(t.phase==='settled'&&Number.isSafeInteger(p.startStack)){const net=p.stack-p.startStack;fields.push({name:'本手净筹码变化',value:`${net>0?'+':''}${net} 筹码${net>0?' · 本手盈利':net<0?' · 本手亏损':' · 持平'}`});}
  if(rank)fields.push({name:'你目前能组成的牌型',value:`${rank}（按你的底牌与已发公共牌计算）`});
  if(yourTurn){const l=game.legal(t,id);fields.push({name:'现在可以操作',value:`${l.call?`跟注需 ${Math.min(l.call,p.stack)} 筹码`:'可以免费过牌'} · <t:${Math.floor(t.deadline/1000)}:R> 超时`});}
  const components=yourTurn?bettingRows(t,id).map(r=>({...r,components:r.components.map(b=>({...b,custom_id:`h:${t.epoch}:${t.version}:${panelAction(id,b.custom_id.split(':')[3])}`}))})):[];
  const navigation=[privateButton('hand','刷新手牌',1),privateButton('hide','收起底牌')];
  if(t.messageId)navigation.push({type:2,style:5,label:'回到公共牌桌',url:`https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId}`});
  components.push(row(...navigation));
  return {content:`**第 ${t.handNo} 手 · 你的底牌**${notice?`\n${notice}`:''}`,embeds:[{title:`第 ${t.handNo} 手 · 你的两张底牌`,description:`${p.cards.length?`**${cards}**\n\n`:''}**${status}**\n${phase}`,color:yourTurn?0x4E9975:0xB26486,fields,footer:{text:'仅你可见 · 图中上方是你的底牌，下方是共用公共牌 · 自动更新'}}],attachments:[],components,allowed_mentions:{parse:[]}};
}
export function board(t) {
  const running=!['lobby','settled','closed'].includes(t.phase);
  const current=t.players.find(p=>p.id===t.turn);
  const l=current?game.legal(t,t.turn):null;
  const humanTurn=current&&!current.bot;
  const phases={lobby:'等待入座',preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌',settled:'本手结束',closed:'牌桌关闭'};
  const players=t.players.map((p,i)=>`${t.turn===p.id?'▶ ':''}${game.playerLabel(t,p.id)}${i===t.dealer?' · 庄家':''}　**${p.stack}**${running?(p.inHand?(p.folded?' · 弃牌':p.stack===0?' · 全下':` · 已下 ${p.round}`):' · 旁观'):''}`).join('\n');
  const turn=current?`\n\n**轮到 ${game.playerLabel(t,t.turn)}**${current.bot?' · 电脑思考中…':`\n${l.call?`跟注需 ${Math.min(l.call,current.stack)}${l.call>=current.stack?'（全下跟注）':''}`:'可以免费过牌'} · <t:${Math.floor(t.deadline/1000)}:R> 超时`}`:'';
  const hint=t.phase==='lobby'?'\n\n加入后由桌主开始；一人测试可添加电脑。':t.phase==='settled'?'\n\n桌主可开始下一手；筹码归零可免费补充。':'';
  const description=`${phases[t.phase]} · 第 ${t.handNo} 手 · ${t.players.length}/9 座 · 盲注 10/20\n\n**公共牌**\n${t.board.length?game.cardsText(t.board):'🂠  🂠  🂠  🂠  🂠'}\n\n**${running?'底池':'本手底池'} ${t.pot}**${running?` · 本轮下注 ${t.currentBet}`:''}\n\n${players}${turn}${hint}`;
  const fields=[];
  if(t.phase==='settled'&&t.result?.length)fields.push({name:'🏆 本手结算',value:t.result.join('\n').slice(0,1024)});
  if(t.phase==='settled'&&t.showdown?.length)fields.push({name:'摊牌',value:t.showdown.map(p=>`${game.playerLabel(t,p.id)}：${game.cardsText(p.cards)} · ${p.rank}`).join('\n').slice(0,1024)});
  if(t.log.length)fields.push({name:'最近操作',value:t.log.slice(-3).join('\n').slice(-1000)});
  const components=[];
  if(running) {
    if(humanTurn) {
      components.push(...bettingRows(t,t.turn));
    } else components.push(row(button(t,'wait','电脑正在行动…',2,true)));
    components.push(row(button(t,'hand','手牌 / 操作',1),button(t,'refresh','刷新牌桌'),button(t,'help','玩法'),button(t,'close','关桌')));
  } else if(t.phase!=='closed') {
    const funded=t.players.filter(p=>p.stack>0||p.bot).length;
    components.push(row(button(t,'join','加入牌桌',3,t.players.length>=9),button(t,'start',t.handNo?'开始下一手':'开始发牌',1,funded<2),button(t,'hand','手牌 / 操作')));
    components.push(row(button(t,'rebuy','补充筹码',2,!t.players.some(p=>!p.bot&&p.stack===0)),button(t,'leave','离桌'),button(t,'addbot','添加电脑',2,t.players.length>=9),button(t,'removebots','移除电脑',2,!t.players.some(p=>p.bot))));
    components.push(row(button(t,'refresh','刷新牌桌'),button(t,'help','玩法'),button(t,'close','关桌')));
  }
  return {content:'',embeds:[{title:'♠ Aliceneko · 德州扑克',description,color:humanTurn?0x4E9975:0xB26486,fields,footer:{text:'beta.5 · 虚拟筹码 · 发牌后自动送达手牌 · 未收到请点「手牌 / 操作」'}}],components,allowed_mentions:{parse:[]}};
}
