import * as game from './engine.mjs';
import { takeoverAt, idleWarning } from './lifecycle.mjs';

export function button(t,action,label,style=2,disabled=false) {
  return {type:2,style,label,custom_id:`h:${t.epoch}:${t.version}:${action}`,disabled};
}
export const row=(...components)=>({type:1,components});
export function confirmation(t,id,action,content) {
  return {type:4,data:{content,flags:64,allowed_mentions:{parse:[]},components:[row(button(t,`yes${action}~${id}`,'确认'+(action==='allin'?'全下':'关桌'),4))]}};
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
  const control=(action,label,style=2,disabled=false)=>button(t,panelAction(id,action),label,style,disabled);
  const status=p.away?'已暂离 · 筹码保留，恢复后才会发牌':active?(p.folded?'已弃牌 · 等待本手结束':!p.inHand?'本手旁观':!p.stack?'已全下 · 等待结算':yourTurn?'🟢 现在该你行动':`等待 ${game.playerLabel(t,t.turn)} 行动`):p.ready?'已准备 · 等待其他玩家':p.stack?'准备后自动发牌':'筹码归零 · 请补充筹码';
  const rank=p.cards.length&&t.board.length>=3?game.describeRank(game.rankSeven([...p.cards,...t.board])):null;
  const net=t.settlements?.find(s=>s.id===id)?.net;
  const fields=[{name:'筹码 / 本轮已下 / 底池',value:`${p.stack} / ${p.round} / ${t.pot}`}];
  if(rank)fields.push({name:t.phase==='settled'?'本手牌型':'目前牌型',value:rank});
  if(Number.isSafeInteger(net)&&t.phase==='settled')fields.push({name:'本手净变化',value:`${net>0?'+':''}${net} 筹码`});
  if(yourTurn){const l=game.legal(t,id);fields.push({name:'你的行动',value:`${l.call?`跟注 ${Math.min(l.call,p.stack)}`:'免费过牌'} · <t:${Math.floor(t.deadline/1000)}:R> 超时`});}
  const components=yourTurn?bettingRows(t,id).map(r=>({...r,components:r.components.map(b=>({...b,custom_id:`h:${t.epoch}:${t.version}:${panelAction(id,b.custom_id.split(':')[3])}`}))})):[];
  if(!active&&t.phase!=='closed')components.push(row(...(p.away?[control('resume','恢复参与',3)]:p.stack?[control('ready',p.ready?'取消准备':'准备下一手',p.ready?2:3)]:[control('rebuy','补充筹码',3)])));
  const navigation=[control('hand','刷新手牌'),control('manage','牌桌管理')];
  if(t.messageId)navigation.push({type:2,style:5,label:'公共牌桌',url:`https://discord.com/channels/${t.guild}/${t.channel}/${t.messageId}`});
  components.push(row(...navigation));
  return {content:`${t.handNo?`**第 ${t.handNo} 手 · 你的底牌**`:'**已入座 · 发牌后自动送达手牌**'}${notice?`\n${notice}`:''}`,embeds:[{title:'你的手牌',description:`**${t.phase==='settled'?'本手结束 · ':''}${status}**${p.leaveAfterHand?'\n已预约本手结束后离桌，可在管理中取消。':''}${p.awayAfterHand?'\n连续两次超时，本手结束后自动暂离。':''}${t.readyDue?`\n<t:${Math.floor(t.readyDue/1000)}:R> 自动发牌`:''}\n底牌：${game.cardsText(p.cards)||'尚未发牌'}\n公共牌：${game.cardsText(t.board)||'尚未发出'}`,color:yourTurn?0x4E9975:0xB26486,fields,footer:{text:'仅你可见 · 上方底牌 / 下方公共牌 · 自动更新'}}],attachments:[],components,allowed_mentions:{parse:[]}};
}
export function management(t,id,admin=false,notice='') {
  const p=t.players.find(p=>p.id===id&&!p.bot),waiting=['lobby','settled'].includes(t.phase),owner=id===t.owner;
  const control=(action,label,style=2,disabled=false)=>button(t,`m~${id}~${action}`,label,style,disabled),components=[];
  if(p)components.push(row(control('leave',p.leaveAfterHand?'取消预约离桌':waiting?'离开牌桌':'本手结束后离桌'),...(p.away?[control('resume','恢复参与',3,!waiting)]:[]),...(p.stack===0?[control('rebuy','补充筹码',3,!waiting)]:[])));
  if(owner)components.push(row(control('start','手动发牌',1,!waiting||!game.canStart(t)),control('addbot','添加电脑',2,!waiting||t.players.length>=9),control('removebots','移除电脑',2,!waiting||!t.players.some(p=>p.bot))));
  if(!owner&&canManageTakeover(t,id))components.push(row(control('takeover','接管桌主',1)));
  if(owner||admin)components.push(row(control('close','关闭牌桌',4)));
  components.push(row(control('manage','刷新管理')));
  return {content:`**牌桌管理 · ${owner?'桌主':admin?'管理员':p?'玩家':'观众'}**${notice?`\n${notice}`:''}\n${waiting?'人员变化会取消全部准备，需要重新准备。':'预约离桌不影响当前下注与结算；本手结束后执行。'}${p?.away?'\n暂离期间保留筹码，不参与发牌与盲注。':''}`,components,allowed_mentions:{parse:[]}};
}
function canManageTakeover(t,id){const at=takeoverAt(t);return at!==null&&Date.now()>=at&&id!==t.owner&&t.players.some(p=>p.id===id&&!p.bot);}
export function board(t) {
  const running=!['lobby','settled','closed'].includes(t.phase),current=t.players.find(p=>p.id===t.turn),l=current?game.legal(t,t.turn):null,humanTurn=current&&!current.bot;
  const phases={lobby:'等待入座',preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌',settled:'本手结束',closed:'牌桌关闭'};
  const players=t.players.map(p=>`${t.turn===p.id?'▶ ':''}${game.playerLabel(t,p.id)}${p.id===t.owner?' · 桌主':''}${p.id===t.dealerId?' · D':''}${p.id===t.smallBlindId?' · SB':''}${p.id===t.bigBlindId?' · BB':''}　**${p.stack}**${p.away?' · 暂离':p.leaveAfterHand?' · 结束后离桌':running?(p.inHand?(p.folded?' · 弃牌':p.stack===0?' · 全下':` · 已下 ${p.round}`):' · 旁观'):p.bot?' · 自动准备':p.ready?' · 已准备':p.stack?' · 未准备':' · 需补筹码'}`).join('\n');
  const turn=current?`\n\n**轮到 ${game.playerLabel(t,t.turn)}**${current.bot?' · 电脑思考中…':`\n${l.call?`跟注 ${Math.min(l.call,current.stack)}${l.call>=current.stack?'（全下跟注）':''}`:'免费过牌'} · <t:${Math.floor(t.deadline/1000)}:R> 超时`}`:'';
  const hint=!running&&t.phase!=='closed'?(t.readyDue?`\n\n所有参与玩家已准备，<t:${Math.floor(t.readyDue/1000)}:R> 自动发牌。取消准备可停止倒计时。`:'\n\n点「准备下一手」，所有参与真人准备后，5 秒自动发牌。暂离玩家不参与。'):'';
  const description=`${phases[t.phase]} · 第 ${t.handNo} 手 · ${t.players.length}/9 座 · 盲注 10/20\n\n**公共牌**\n${[...t.board.map(game.cardText),...Array(5-t.board.length).fill('🂠')].join('  ')}\n\n**${running?'底池':'本手底池'} ${t.pot}**${running?` · 本轮下注 ${t.currentBet}`:''}\n\n${players}${turn}${hint}`;
  const fields=[],warning=idleWarning(t);
  if(warning)fields.push({name:'即将自动关桌',value:`<t:${Math.floor(warning.deadline/1000)}:R> ${warning.conditional?'若仍无人有效操作、且可行动真人均已超时，将取消本手并退回下注。':'若仍无人有效操作，将自动关闭。'}刷新或查看手牌不会延长时间。`});
  if(t.phase==='closed'&&t.closeReason)fields.push({name:'关闭原因',value:t.closeReason});
  if(t.phase==='settled'){
    if(t.pots?.length)for(const pot of t.pots)fields.push({name:`${pot.name} · ${pot.amount}${pot.split?' · 平分':''}`,value:`${pot.winners.map(w=>`${w.label} 获得 ${w.amount}`).join('；')}\n${pot.reason}${pot.split?'；余数按庄家左侧座位顺序分配':''}`});
    else if(t.result?.length)fields.push({name:'🏆 本手结算',value:t.result.join('\n').slice(0,1024)});
    if(t.showdown?.length)for(let i=0;i<t.showdown.length;i+=3)fields.push({name:`摊牌 · 最佳五张${t.showdown.length>3?' · '+(i/3+1):''}`,value:t.showdown.slice(i,i+3).map(p=>`${p.label||game.playerLabel(t,p.id)}：${game.cardsText(p.cards)}\n最佳：${game.cardsText(p.best||[])} · ${p.detail||p.rank}`).join('\n')});
    if(t.settlements?.length)fields.push({name:'本手净筹码变化',value:t.settlements.map(p=>`${p.label} ${p.net>0?'+':''}${p.net}`).join(' · ')});
  }
  if(t.log.length)fields.push({name:'最近操作',value:t.log.slice(-3).join('\n').slice(-1000)});
  const components=[];
  if(running)components.push(...(humanTurn?bettingRows(t,t.turn):[row(button(t,'wait','电脑正在行动…',2,true))]));
  else if(t.phase!=='closed')components.push(row(button(t,'join','加入牌桌',3,t.players.length>=9),button(t,'ready','准备 / 取消准备',3,!game.canStart(t)),button(t,'hand','手牌 / 操作',1)));
  if(t.phase!=='closed')components.push(row(...(running?[button(t,'hand','手牌 / 操作',1)]:[]),button(t,'manage','牌桌管理'),button(t,'refresh','刷新牌桌'),button(t,'help','玩法')));
  return {content:'',embeds:[{title:'♠ Aliceneko · 德州扑克',description,color:humanTurn?0x4E9975:0xB26486,fields,footer:{text:'beta.9 · 虚拟筹码 · D 庄家 / SB 小盲 / BB 大盲 · 等待 5 分钟 / 结算后 10 分钟空闲关桌'}}],components,allowed_mentions:{parse:[]}};
}
