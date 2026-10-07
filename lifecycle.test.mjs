import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from './engine.mjs';
import * as life from './lifecycle.mjs';
import { board } from './ui.mjs';

const BASE=1800000000000;
function fixture(){const t=game.newTable('1','2','3');game.join(t,'4');t.lastActive=BASE;t.ownerSeenAt=BASE;return t;}
test('waiting and settled deadlines restart only from gameplay or settlement',()=>{
 const t=fixture();assert.equal(life.idleDeadline(t),BASE+300000);assert.equal(life.automaticCloseReason(t,BASE+299999),null);assert(life.automaticCloseReason(t,BASE+300000));
 life.effectiveHumanAction(t,'1',BASE+200000);assert.equal(life.idleDeadline(t),BASE+500000);
 t.phase='settled';t.settledAt=BASE+700000;assert.equal(life.idleDeadline(t),BASE+1300000);
 life.touchOwner(t,'1',BASE+1200000);assert.equal(life.idleDeadline(t),BASE+1300000);
 life.effectiveHumanAction(t,'1',BASE+1200000);assert.equal(life.idleDeadline(t),BASE+1800000);
});
test('human betting resets activity while computer action and timeout do not',()=>{
 const t=fixture();game.start(t,'1',game.shuffledDeck(),BASE);t.lastActive=BASE;
 game.act(t,'1','call',null,BASE+1000);assert.equal(t.lastActive,BASE+1000);
 assert(game.timeout(t,BASE+61000));assert.equal(t.lastActive,BASE+1000);assert.equal(t.players[1].timedOutAt,BASE+61000);
 game.act(t,'4','check',null,BASE+62000);assert.equal(t.players[1].timedOutAt,null);assert.equal(t.lastActive,BASE+62000);
 const u=game.newTable('1','2','3');game.addComputers(u,'1',1);game.start(u,'1',game.shuffledDeck(),BASE);game.act(u,'1','call',null,BASE+1000);game.act(u,'cpu:1','check',null,BASE+2000);assert.equal(u.lastActive,BASE+1000);
});
test('active closure requires eligible human timeouts and refunds every unfinished bet',()=>{
 const t=fixture();game.start(t,'1',game.shuffledDeck(),BASE);game.act(t,'1','call',null,BASE);game.act(t,'4','check',null,BASE);
 assert.equal(life.automaticCloseReason(t,BASE+600000),null);for(const p of t.players)p.timedOutAt=BASE+60000;
 const before=t.players.reduce((sum,p)=>sum+p.stack+p.total,0);assert(life.automaticCloseReason(t,BASE+600000));game.close(t,t.owner,true);
 assert.equal(t.players.reduce((sum,p)=>sum+p.stack,0),before);assert.deepEqual(t.players.map(p=>p.stack),[2000,2000]);assert.deepEqual(t.deck,[]);assert(t.players.every(p=>!p.cards.length));
 const u=fixture();u.phase='flop';u.players.forEach(p=>Object.assign(p,{inHand:true,folded:false,stack:0,timedOutAt:BASE+60000}));assert.equal(life.automaticCloseReason(u,BASE+600000),null);
});
test('takeover respects seated identity, owner presence and waiting phase',()=>{
 const t=fixture();assert(!life.canTakeover(t,'4',BASE+119999));assert(life.canTakeover(t,'4',BASE+120000));assert(!life.canTakeover(t,'1',BASE+120000));assert(!life.canTakeover(t,'8',BASE+120000));
 life.touchOwner(t,'1',BASE+120000);assert(!life.canTakeover(t,'4',BASE+120000));assert(life.canTakeover(t,'4',BASE+240000));
 t.phase='flop';assert(!life.canTakeover(t,'4',BASE+240000));
});
test('notice alarms are one-shot and legacy tables acquire persisted clock defaults',()=>{
 const t=fixture();assert.equal(life.nextLifecycleAlarm(t,BASE),BASE+120000);
 t.takeoverNoticeFor=BASE+120000;assert.equal(life.nextLifecycleAlarm(t,BASE+120000),BASE+240000);
 const warning=life.idleWarning(t,BASE+240000);assert.equal(warning.deadline,BASE+300000);t.idleNoticeFor=warning.deadline;assert.equal(life.nextLifecycleAlarm(t,BASE+240000),BASE+300000);
 t.phase='flop';t.lastActive=BASE;assert.equal(life.nextLifecycleAlarm(t,BASE+600001),null); // Wait for turn processing, no millisecond loop.
 const legacy={phase:'settled',players:[{id:'1'}],owner:'1',lastActive:BASE};assert(life.initializeLifecycle(legacy,BASE+10000));assert.equal(legacy.settledAt,BASE+10000);assert(!life.initializeLifecycle(legacy,BASE+20000));
 legacy.phase='closed';legacy.closeReason='测试清理';const rendered=board({...legacy,turn:null,board:[],pot:0,log:[],handNo:1,dealer:0,players:[{id:'1',stack:2000}]});assert.deepEqual(rendered.components,[]);assert(rendered.embeds[0].fields.some(f=>f.value==='测试清理'));
});
