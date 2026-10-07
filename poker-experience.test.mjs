import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from './engine.mjs';
import {board,handPanel,management} from './ui.mjs';
const table=n=>{const t=g.newTable('1','2','3');for(let i=2;i<=n;i++)g.join(t,String(i));return t;};
const settle=t=>{let steps=0;while(t.turn){assert(++steps<100);g.act(t,t.turn,'call');}};
const controls=data=>data.components.flatMap(r=>r.components);
test('every participating human must ready; computers auto-ready; cancel and roster changes stop countdown',()=>{
 const t=table(2);g.addComputers(t,'1');g.toggleReady(t,'1',1000);assert.equal(t.readyDue,null);
 g.toggleReady(t,'2',1000);assert.equal(t.readyDue,6000);g.updateReady(t,2000);assert.equal(t.readyDue,6000);
 g.toggleReady(t,'1',2000);assert.equal(t.readyDue,null);g.toggleReady(t,'1',2000);assert.equal(t.readyDue,7000);
 g.join(t,'3');assert.equal(t.readyDue,null);assert(t.players.every(p=>!p.ready));
 g.start(t,'1');assert(t.players.every(p=>!p.ready));assert.throws(()=>g.toggleReady(t,'1'),/没结束/);
 settle(t);assert.equal(t.readyDue,null);assert(t.players.every(p=>!p.ready));
});
test('away players and bankrupt humans are excluded; no computer-only hand; recovery requires readiness again',()=>{
 const t=table(3);t.players[1].away=true;t.players[2].stack=0;
 assert.equal(g.canStart(t),false);g.addComputers(t,'1');g.toggleReady(t,'1',100);assert.equal(t.readyDue,5100);
 g.resume(t,'2');assert.equal(t.readyDue,null);assert(t.players.every(p=>!p.ready));
 t.players[1].away=true;g.start(t,'1');assert.equal(t.players[1].cards.length,0);assert.equal(t.players[1].stack,2000);assert.equal(t.players[2].cards.length,0);
 assert(![t.dealerId,t.smallBlindId,t.bigBlindId].includes('2'));
 settle(t);t.players[0].away=true;assert.equal(g.canStart(t),false);assert.throws(()=>g.start(t,'1'),/真人/);
});
test('two consecutive timeouts sit out at settlement; subsequent street is automatic; stack stays and manual action resets streak',()=>{
 const t=table(2);g.start(t,'1');g.timeout(t,t.deadline);assert.equal(t.phase,'settled');assert.equal(t.players[0].timeoutStreak,1);
 g.start(t,'1');g.act(t,'2','call');g.timeout(t,t.deadline);
 assert.equal(t.players[0].awayAfterHand,true);assert.equal(t.turn,'1');const due=t.deadline;g.timeout(t,due);g.act(t,'2','fold');
 const stack=t.players[0].stack;assert.equal(t.players[0].away,true);g.resume(t,'1');assert.equal(t.players[0].stack,stack);assert.equal(t.players[0].timeoutStreak,0);
 g.start(t,'1');t.players.find(p=>p.id===t.turn).timeoutStreak=1;const id=t.turn;g.act(t,id,'call');assert.equal(t.players.find(p=>p.id===id).timeoutStreak,0);
});
test('queued all-in departure waits until payouts, preserves results and transfers owner; queue can be cancelled',()=>{
 const t=table(3);g.start(t,'1');g.queueLeave(t,'1');g.queueLeave(t,'1');assert.equal(t.players[0].leaveAfterHand,false);
 g.act(t,'1','allin');g.queueLeave(t,'1');assert.equal(t.players.length,3);assert.equal(t.players[0].total,2000);assert(t.players[0].inHand&&!t.players[0].folded);
 const preserved=structuredClone(t);g.queueLeave(preserved,'1');settle(preserved);g.queueLeave(preserved,'1'); // immediate removal after settlement
 settle(t);assert.equal(t.players.length,2);assert.equal(t.owner,'2');assert.deepEqual(t.pots,preserved.pots);assert.deepEqual(t.settlements,preserved.settlements);
 assert(t.settlements.some(p=>p.id==='1'));assert(t.pots.flatMap(p=>p.winners).every(w=>w.label));assert(t.ownerSeenAt>0);
});
test('all real players queued to leave settle first and automatically close the table',()=>{
 const t=table(2);g.addComputers(t,'1');g.start(t,'1');g.queueLeave(t,'1');g.queueLeave(t,'2');settle(t);
 assert.equal(t.phase,'closed');assert.equal(t.owner,null);assert(t.closeReason.includes('所有真人'));assert.equal(t.readyDue,null);assert(t.players.every(p=>p.cards.length===0));
});
test('dealer moves clockwise through dealer departures, earlier departures, computer removal and excluded seats',()=>{
 for(const removed of ['1','2','3','4']){
  const t=table(4);t.dealer=1;g.leave(t,removed);g.start(t,t.owner);assert.equal(t.dealerId,removed==='3'?'4':'3');
 }
 const t=table(2);g.addComputers(t,'1',2);t.dealer=2;g.removeComputers(t,'1');g.start(t,'1');assert.equal(t.dealerId,'1');assert.equal(t.smallBlindId,'1');assert.equal(t.bigBlindId,'2');
 const u=table(4);u.dealer=0;u.players[1].away=true;g.start(u,'1');assert.equal(u.dealerId,'3');assert.equal(u.smallBlindId,'4');assert.equal(u.bigBlindId,'1');
});
test('settlement names each pot and refund, best five and winning kickers; folded cards never enter public board',()=>{
 const t=table(4);t.phase='river';t.dealer=0;t.board=[0,14,31,45,7];t.pot=455;
 const hands=[[12,25],[11,24],[10,23],[9,22]];
 t.players.forEach((p,i)=>Object.assign(p,{stack:0,startStack:[50,100,300,5][i],total:[50,100,300,5][i],inHand:true,folded:i===3,cards:hands[i]}));g.showdown(t);
 assert.deepEqual(t.pots.map(p=>[p.name,p.amount]),[['主池',20],['边池 1',135],['边池 2',100],['未跟注退回',200]]);
 assert.deepEqual(t.players.map(p=>p.stack),[155,100,200,0]);assert.equal(t.settlements.reduce((s,p)=>s+p.net,0),0);
 for(const hand of t.showdown){assert.equal(hand.best.length,5);assert.equal(g.compare(g.rankFive(hand.best),g.rankSeven([...hand.cards,...t.board])),0);assert(hand.detail.includes('踢脚'));}
 const ui=JSON.stringify(board(t));assert(!ui.includes(g.cardsText(hands[3])));assert(ui.includes('最佳五张'));assert(ui.includes('未跟注退回'));
});
test('private management is role-aware, public controls stay compact and graphic text fallback has one card copy',()=>{
 const t=table(2);g.addComputers(t,'1');
 const publicControls=controls(board(t));assert(publicControls.some(b=>b.label==='牌桌管理'));assert(!publicControls.some(b=>['添加电脑','关闭牌桌','手动发牌'].includes(b.label)));
 const owner=controls(management(t,'1')),player=controls(management(t,'2')),admin=controls(management(t,'8',true));
 assert(owner.some(b=>b.label==='手动发牌'));assert(!player.some(b=>b.label==='手动发牌'));assert(admin.some(b=>b.label==='关闭牌桌'));
 g.start(t,'1');const hand=handPanel(t,'1');assert(hand.embeds[0].description.includes('底牌：'));assert(!hand.embeds[0].fields.some(f=>f.name.includes('底牌')));
 assert(controls(management(t,'1')).find(b=>b.label==='添加电脑').disabled);assert(controls(management(t,'2')).some(b=>b.label==='本手结束后离桌'));
 for(const data of [board(t),hand,management(t,'1')]){assert(data.components.length<=5);assert(data.components.every(r=>r.components.length<=5));}
});
