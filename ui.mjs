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
      const callLabel=l.call?`跟注 ${Math.min(l.call,current.stack)}${l.call>=current.stack?' · 全下':''}`:'过牌';
      components.push(row(button(t,l.call?'call':'check',callLabel,3),button(t,'raise',t.currentBet?'自定加注':'自定下注',1,!l.canRaise||l.maxTotal<=t.currentBet),button(t,'fold','弃牌'),button(t,'allin',`全下 ${current.stack}`,4,!l.canRaise&&l.maxTotal>t.currentBet)));
      const quick=quickRaises(t);if(quick.length)components.push(row(...quick.map(q=>button(t,q.action,q.label))));
    } else components.push(row(button(t,'wait','电脑正在行动…',2,true)));
    components.push(row(button(t,'hand','🃏 我的底牌',1),button(t,'refresh','刷新牌桌'),button(t,'help','玩法'),button(t,'close','关桌')));
  } else if(t.phase!=='closed') {
    const funded=t.players.filter(p=>p.stack>0||p.bot).length;
    components.push(row(button(t,'join','加入牌桌',3,t.players.length>=9),button(t,'start',t.handNo?'开始下一手':'开始发牌',1,funded<2),button(t,'hand','🃏 我的底牌')));
    components.push(row(button(t,'rebuy','补充筹码',2,!t.players.some(p=>!p.bot&&p.stack===0)),button(t,'leave','离桌'),button(t,'addbot','添加电脑',2,t.players.length>=9),button(t,'removebots','移除电脑',2,!t.players.some(p=>p.bot))));
    components.push(row(button(t,'refresh','刷新牌桌'),button(t,'help','玩法'),button(t,'close','关桌')));
  }
  return {content:'',embeds:[{title:'♠ Aliceneko · 德州扑克',description,color:humanTurn?0x4E9975:0xB26486,fields,footer:{text:'beta.2 · 虚拟筹码 · 下注按钮仅当前玩家有效 · 底牌仅本人可见'}}],components,allowed_mentions:{parse:[]}};
}
