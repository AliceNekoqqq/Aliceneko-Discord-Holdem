import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from './engine.mjs';
const c=s=>{const suits={s:0,h:1,d:2,c:3};const rank='23456789TJQKA'.indexOf(s[0]);return suits[s[1]]*13+rank;};
const cards=s=>s.split(' ').map(c);
const table=n=>{const t=g.newTable('1','2','3','test');for(let i=2;i<=n;i++)g.join(t,String(i));return t;};
test('all nine hand classes, wheel and seven-card best hand',()=>{
 const examples=['As Jh 9d 5c 3s','As Ah 9d 5c 3s','As Ah 9d 9c 3s','As Ah Ad 5c 3s','As 2h 3d 4c 5s','As Js 9s 5s 3s','As Ah Ad 5c 5s','As Ah Ad Ac 3s','9s Ts Js Qs Ks'];
 examples.forEach((s,i)=>assert.equal(g.rankFive(cards(s))[0],i));
 assert.deepEqual(g.rankFive(cards(examples[4])),[4,5]);
 assert.deepEqual(g.rankSeven(cards('As Ks Qs Js Ts 2h 3d')),[8,14]);
 assert(g.compare(g.rankFive(cards('As Ah Kd 5c 3s')),g.rankFive(cards('As Ah Qd 5c 3s')))>0);
});
test('heads-up dealer small blind acts first before flop, last after flop',()=>{
 const t=table(2);g.start(t,'1');assert.equal(t.turn,'1');g.act(t,'1','call');assert.equal(t.turn,'2');g.act(t,'2','check');assert.equal(t.phase,'flop');assert.equal(t.turn,'2');
});
test('big blind gets option in multiway pot',()=>{
 const t=table(3);g.start(t,'1');g.act(t,'1','call');g.act(t,'2','call');assert.equal(t.turn,'3');g.act(t,'3','raise',40);assert.equal(t.turn,'1');
});
test('short all-in does not reopen raising; accumulated short all-ins can',()=>{
 const t=table(4);t.players[0].stack=30;g.start(t,'1'); // dealer 1, SB 2, BB 3, first 4
 g.act(t,'4','call');g.act(t,'1','allin');g.act(t,'2','call');g.act(t,'3','call');assert.equal(t.turn,'4');assert.equal(g.legal(t,'4').canRaise,false);assert.throws(()=>g.act(t,'4','raise',60),/短全下/);
 const u=table(4);u.players[0].stack=30;u.players[1].stack=40;g.start(u,'1');g.act(u,'4','call');g.act(u,'1','allin');g.act(u,'2','allin');g.act(u,'3','call');assert.equal(g.legal(u,'4').canRaise,true);
});
test('main pot / side pot / unmatched all-in return',()=>{
 const t=table(3);t.phase='river';t.dealer=0;t.board=cards('2s 3h 7d 8c 9s');t.pot=450;
 Object.assign(t.players[0],{stack:0,total:50,inHand:true,cards:cards('As Ah')});
 Object.assign(t.players[1],{stack:0,total:100,inHand:true,cards:cards('Ks Kh')});
 Object.assign(t.players[2],{stack:0,total:300,inHand:true,cards:cards('Qs Qh')});g.showdown(t);
 assert.deepEqual(t.players.map(p=>p.stack),[150,100,200]);
});
test('split pot odd chip goes clockwise after dealer; folded hand excluded',()=>{
 const t=table(3);t.phase='river';t.dealer=0;t.board=cards('As Ks Qs Js Ts');t.pot=15;
 t.players.forEach((p,i)=>Object.assign(p,{stack:0,total:5,inHand:true,folded:i===2,cards:cards(['2h 3h','4h 5h','6h 7h'][i])}));g.showdown(t);assert.deepEqual(t.players.map(p=>p.stack),[7,8,0]);
});
test('all-in runout, short big blind, timeout and close refund',()=>{
 const t=table(2);t.players[0].stack=10;t.players[1].stack=15;g.start(t,'1');assert.equal(t.phase,'settled');assert.equal(t.board.length,5);assert.equal(t.players.reduce((s,p)=>s+p.stack,0),25);
 const u=table(2);g.start(u,'1');assert(g.timeout(u,u.deadline));assert.equal(u.phase,'settled');assert.equal(u.players.reduce((s,p)=>s+p.stack,0),4000);
 const v=table(3);g.start(v,'1');g.close(v,'1');assert.deepEqual(v.players.map(p=>p.stack),[2000,2000,2000]);assert.equal(v.phase,'closed');
});
test('new hand clears prior public showdown and deck has no duplicates',()=>{
 const t=table(2);g.start(t,'1');g.act(t,t.turn,'fold');t.showdown=[{id:'2',cards:[1,2]}];g.start(t,'1');assert.deepEqual(t.showdown,[]);const d=g.shuffledDeck();assert.equal(new Set(d).size,52);
});
test('300 randomized hands conserve chips and terminate without invalid pots',()=>{
 let seed=17;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let run=0;run<300;run++){const n=2+rand()%8,t=table(n);t.players.forEach(p=>p.stack=1+rand()%2000);const total=t.players.reduce((s,p)=>s+p.stack,0);g.start(t,'1',g.shuffledDeck(rand));let steps=0;
   while(t.phase!=='settled'){assert(++steps<300);const l=g.legal(t,t.turn),roll=rand()%10;let action='call',amount;
    if(roll===0)action='fold';else if(roll===1)action='allin';else if(roll===2&&l.canRaise&&l.maxTotal>=l.minTotal){action='raise';amount=l.minTotal;}
    if(action==='allin'&&!l.canRaise&&l.maxTotal>t.currentBet)action='call';g.act(t,t.turn,action,amount);
    assert(t.players.every(p=>Number.isSafeInteger(p.stack)&&p.stack>=0));
    assert.equal(t.players.reduce((s,p)=>s+p.stack,0)+(t.phase==='settled'?0:t.pot),total);
   }
 }
});
