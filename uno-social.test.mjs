import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from './uno-engine.mjs';
import {EMOTES,sendEmote,activeEmote,expireEmote,recordRoundInteraction} from './uno-social.mjs';
import {board,socialMenu,roundHighlights,playEffect} from './uno-ui.mjs';
import {boardImageMessage,publicTableSnapshot} from './uno-image.mjs';
function fixture(){const t=game.newTable('1','2','3');game.join(t,'4');game.join(t,'5');t.players.forEach((p,i)=>{p.name=['ALICE','BOB','CAROL'][i];p.cards=[[23,1],[104,26],[105,51]][i];});t.phase='active';t.handNo=1;t.turn='1';t.color='red';t.discard=[3];t.deck=Array.from({length:90},(_,i)=>i+2);t.deadline=Date.now()+60000;return t;}
test('directed fixed emotes target another seated player and leave every game timer and card untouched',()=>{
 const t=fixture(),before=structuredClone(t),now=Date.now();sendEmote(t,'1','4','attack',1,now);
 for(const key of ['version','turn','deadline','idleDeadline','lastActive','deck','players','discard','events'])assert.deepEqual(t[key],before[key],key);
 assert.equal(activeEmote(t,now).target,'4');assert(board(t).embeds[0].fields.find(f=>f.name==='💬 牌桌互动').value.includes('ALICE → **BOB**：😏 接招吧！'));
 for(const args of [['1','1','attack',1],['9','4','attack',1],['1','9','attack',1],['1','4','custom',1],['1','4','attack',0]])assert.throws(()=>sendEmote(fixture(),...args));
 assert.throws(()=>sendEmote(t,'1','5','watch',1,now+7999),/歇口气/);assert.throws(()=>sendEmote(t,'4','1','watch',1,now+1499),/稍等/);sendEmote(t,'1','5','watch',1,now+8000);assert.equal(activeEmote(t,now+8000).target,'5');
});
test('emote expiry, target leaving, redeal and closure remove public reaction and its cached image signature',async()=>{
 const t=fixture();sendEmote(t,'1','4','thanks',1);const a=await boardImageMessage(t,board(t));assert(a.body instanceof FormData);assert(publicTableSnapshot(t).social);t.social.until=Date.now()-1;const b=await boardImageMessage(t,board(t),{signature:a.signature,id:'image'});assert.notEqual(a.signature,b.signature);assert(b.body instanceof FormData);assert(expireEmote(t));assert(!t.social);
 sendEmote(t,'4','1','clap',1);t.players=t.players.filter(p=>p.id!=='4');assert(!activeEmote(t));assert(expireEmote(t));t.phase='settled';sendEmote(t,'1','5','next',1,Date.now()+9000);game.start(t,'1');assert.equal(t.social,null);assert.equal(t.roundInteractions,null);
});
test('reaction menus fit Discord limits for ten players and all five fixed phrases',()=>{
 const t=game.newTable('1','2','3');game.addComputers(t,'1',9);for(const target of [null,t.players[1].id]){const data=socialMenu(t,'1',target);assert.equal(data.allowed_mentions.parse.length,0);for(const row of data.components){assert(row.components.length<=5);for(const c of row.components){assert(c.custom_id.length<=100);if(c.options)assert.equal(c.options.length,9);}}}assert.equal(Object.keys(EMOTES).length,5);
});
test('mixed relay records who counterattacked whom and assigns largest relay to the right recipient',()=>{
 const t=fixture();game.play(t,'1',23);game.play(t,'4',104,'blue');game.play(t,'5',105,'red');assert.equal(t.roundInteractions.counterattacks,2);assert.equal(t.lastPlay.respondingTo,'4');assert.equal(t.lastPlay.target,'1');assert(playEffect(t).includes('CAROL 接住 BOB'));assert.equal(t.roundInteractions.maxRelay.count,10);game.accept(t,'1');assert.equal(t.roundInteractions.maxRelay.absorbed,'1');assert(roundHighlights(t).includes('ALICE收下'));
 // A later, smaller relay must never overwrite attribution for the larger one.
 recordRoundInteraction(t,{kind:'play',actor:'4',target:'5',stackTotal:4,relayId:999});recordRoundInteraction(t,{kind:'challenge',actor:'5',target:'4',count:12,success:false,relayId:999});assert.equal(t.roundInteractions.maxRelay.absorbed,'1');
});
test('jump counts actual plays, distinguishes stealing an opponent from own-turn combo and resets next round',()=>{
 const t=fixture();t.players[0].cards=[11,1];t.players[1].cards=[12,76];t.players[2].cards=[26,28];game.play(t,'1',11);const key=t.jumpWindow.key;game.jump(t,'4',12,key);assert.equal(t.roundInteractions.jumps['4'],1);assert.equal(Object.keys(t.roundInteractions.steals).length,0);assert(playEffect(t).includes('抢出连击'));assert(roundHighlights(t).includes('BOB'));
 recordRoundInteraction(t,{kind:'play',actor:'5',from:'1',jump:true,stackTotal:null});assert.equal(t.roundInteractions.steals['5|1'],1);assert(roundHighlights(t).includes('CAROL 抢走 ALICE'));t.phase='settled';game.start(t,'1');assert.equal(t.roundInteractions,null);
});
