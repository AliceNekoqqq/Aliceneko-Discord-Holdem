import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuctionTutorial,tutorialView,tutorialOutcome} from './web/auction/assets/tutorial.mjs';
import {publicAuctionData} from './auction-website.mjs';
import {decideAuction} from './tavern-auction.mjs';
const meta=publicAuctionData('standard');
function entered(){const t=createAuctionTutorial(meta);for(const a of ['begin','area','role','enter','read-public','read-private'])assert(t.act(a));return t;}
function win(){const t=entered();for(let r=1;r<=5;r++){assert(t.act('bid',String(t.view.recommended)));if(r<5){assert.equal(t.view.result,null);assert(t.act('next-round'));}}assert(t.act('settlement'));assert(t.act('open'));return t;}
function opened(){const t=win();for(let i=0;i<6;i++)assert(t.act('reveal'));assert(t.act('finish-reveal'));return t;}
test('recommended practice completes all five rounds, escrow, six reveals, sale confirmation and a display without external assets',()=>{
 const t=win();assert.equal(t.view.result.winner,0);assert.equal(t.view.history.length,5);assert.equal(t.view.held,0);
 assert.equal(t.view.cash,t.view.opening-t.view.fee-t.view.result.price);
 for(let i=0;i<6;i++){assert.equal(t.view.total,null);assert(t.act('reveal'));assert.equal(t.view.items.filter(x=>x.revealed).length,i+1);}
 assert(t.act('finish-reveal'));const v=t.view;assert.equal(v.net,v.total-v.result.price-v.fee);
 assert(!t.act('quiz-cash'));assert.equal(t.view.phase,'accounts');assert(t.view.feedback.includes('手动卖出'));
 assert(t.act('quiz-inventory'));assert(t.act('select-sale',0));assert(t.act('quote-sale'));
 assert.equal(t.view.cash,v.cash);assert(t.act('cancel-sale'));assert(t.act('quote-sale'));assert(t.act('confirm-sale'));
 assert.equal(t.view.cash,v.cash+v.items[0].value);assert(!t.act('confirm-sale'));assert.equal(t.view.sold.length,1);
 assert(t.act('to-display'));assert(!t.act('select-display',0));assert(t.act('select-display',4));assert(t.act('place'));
 assert.equal(t.view.phase,'done');assert.equal(t.view.displayed,4);assert(!t.act('place'));assert.equal(t.view.cash,v.cash+v.items[0].value);
 const html=tutorialView(t.view,meta);assert(html.includes('完整玩过'));assert(html.includes('不会带入正式游戏'));
});
test('teaching auction decisions match the live tie and early settlement rules across rounds, zeros and threshold boundaries',()=>{
 for(let round=1;round<=5;round++)for(const bids of [[0,0,0,0],[100,100,100,100],[201,100,0,0],[200,100,0,0],[160,100,0,0],[161,100,0,0],[130,100,0,0],[131,100,0,0],[110,100,0,0],[111,100,0,0],[0,100,100,50]]){
  assert.deepEqual(tutorialOutcome(round,bids,1000),decideAuction(round,bids,[0,1,2,3],1000));
 }
});
test('incorrect or stale steps, invalid bids and hidden goods cannot bypass tutorial gates',()=>{
 const t=createAuctionTutorial(meta);assert(!t.act('reveal'));assert(!t.act('enter'));assert.equal(t.view.cash,t.view.opening);
 assert(t.act('begin'));assert(!t.act('enter'));assert(t.act('area'));assert(!t.act('enter'));assert(t.act('role'));assert(t.act('enter'));
 assert.equal(t.view.held,t.view.budget);assert.equal(t.view.cash,t.view.opening-t.view.budget-t.view.fee);
 assert(!t.act('bid','100'));assert(t.act('read-public'));assert(t.act('read-private'));
 for(const bad of ['', ' ', '-1', '1.5', 'Infinity', String(t.view.budget+1)]){assert(!t.act('bid',bad));assert.equal(t.view.history.length,0);}
 const hidden=t.view.items;assert(hidden.every(x=>!('name' in x)&&!('id' in x)&&!('value' in x)));assert.equal(hidden[5].quality,null);
 const html=tutorialView(t.view,meta);assert(!html.includes('<img'));assert(!html.includes('style='));
 assert(t.act('bid',String(t.view.recommended)));assert(!t.act('bid','100'));assert.equal(t.view.history.length,1);assert(t.act('next-round'));
 assert.equal(t.view.publicClues.length,2);assert(t.view.items.every(x=>x.quality!==null));assert.equal(t.view.total,null);
});
test('free bids can win early and overpay, while a losing player never receives practice stock',()=>{
 const early=entered();assert(early.act('bid',String(early.view.budget)));assert.equal(early.view.result.winner,0);assert(early.act('settlement'));assert(early.act('open'));
 for(let i=0;i<6;i++)early.act('reveal');early.act('finish-reveal');assert(early.view.net<0);assert(tutorialView(early.view,meta).includes('亏损'));
 const loss=entered();for(let i=1;i<=5;i++){loss.act('bid','0');if(i<5)loss.act('next-round');}
 assert.notEqual(loss.view.result.winner,0);loss.act('settlement');assert(!loss.act('open'));assert(!loss.act('select-sale',0));assert.equal(loss.view.cash,loss.view.opening-loss.view.fee);
 assert(loss.act('restart'));assert.equal(loss.view.phase,'intro');assert.equal(loss.view.cash,loss.view.opening);
});
test('practice inventory preserves one piece for the cabinet and escapes displayed item names',()=>{
 const t=opened();t.act('quiz-inventory');for(let i=0;i<5;i++){assert(t.act('select-sale',i));assert(t.act('quote-sale'));assert(t.act('confirm-sale'));}
 t.act('select-sale',5);assert(!t.act('quote-sale'));assert(t.view.feedback.includes('留一件'));assert(t.act('to-display'));assert(t.act('select-display',5));assert(t.act('place'));
 const hostile={...meta,items:meta.items.map(x=>({...x,name:'<script>bad</script>',category:'<img onerror=1>'}))},safe=createAuctionTutorial(hostile);
 for(const a of ['begin','area','role','enter','read-public','read-private'])safe.act(a);safe.act('bid',String(safe.view.budget));safe.act('settlement');safe.act('open');safe.act('reveal');
 const html=tutorialView(safe.view,hostile);assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(!html.includes('style='));
});
