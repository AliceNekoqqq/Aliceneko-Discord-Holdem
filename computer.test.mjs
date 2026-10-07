import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from './engine.mjs';
import { computerTurn, chooseAction } from './computer.mjs';

test('computer seats require owner, capacity and idle hand; no ownerless bot table',()=>{
  const t=game.newTable('1','2','3');
  assert.throws(()=>game.addComputers(t,'2'),/桌主/);
  assert.throws(()=>game.addComputers(t,'1',9),/最多/);
  game.addComputers(t,'1',8);assert.equal(t.players.length,9);
  assert.throws(()=>game.addComputers(t,'1'),/最多/);
  game.start(t,'1');assert.throws(()=>game.removeComputers(t,'1'),/本手/);
  game.close(t,'1');
  const u=game.newTable('1','2','3');game.addComputers(u,'1',2);game.join(u,'4');
  game.leave(u,'1');assert.equal(u.owner,'4');game.leave(u,'4');assert.equal(u.phase,'closed');assert.equal(u.deadline,null);
});

test('computer policy respects no-raise rights and never folds a free check',()=>{
  const v={cards:[12,25],board:[],pot:100,call:0,canRaise:false,minTotal:40,maxTotal:2000};
  assert.deepEqual(chooseAction(v,()=>0),{kind:'check'});
  assert.deepEqual(chooseAction({...v,call:20},()=>0),{kind:'call'});
  const t=game.newTable('1','2','3');game.addComputers(t,'1');game.start(t,'1');
  assert.equal(computerTurn(t),false);
  game.act(t,'1','call');
  const before=structuredClone(t),changed=structuredClone(t);
  changed.players[0].cards=[1,2];changed.deck.reverse();
  computerTurn(before,()=>0.5);computerTurn(changed,()=>0.5);
  assert.equal(before.players[1].stack,changed.players[1].stack);
  assert.equal(before.players[1].folded,changed.players[1].folded);
});

test('200 computer games complete, including human all-ins, without losing chips',()=>{
  let seed=81;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let hand=0;hand<200;hand++) {
    const t=game.newTable('1','2','3');game.addComputers(t,'1',1+rand()%8);
    t.players.forEach(p=>p.stack=1+rand()%2000);
    const chips=t.players.reduce((sum,p)=>sum+p.stack,0);game.start(t,'1',game.shuffledDeck(rand));
    let actions=0;
    while(t.turn) {
      assert(++actions<300);
      if(!computerTurn(t,()=>rand()/2**32)) {
        const limits=game.legal(t,t.turn);
        const allin=hand%3===0&&(limits.canRaise||limits.maxTotal<=t.currentBet);
        game.act(t,t.turn,allin?'allin':limits.call?'call':'check');
      }
      assert.equal(t.players.reduce((s,p)=>s+p.stack,0)+(t.phase==='settled'?0:t.pot),chips);
      assert(t.players.every(p=>p.stack>=0));
    }
    assert.equal(t.phase,'settled');assert(!t.log.join('').includes('<@cpu:'));
    assert(!t.result.join('').includes('<@cpu:'));
  }
});
