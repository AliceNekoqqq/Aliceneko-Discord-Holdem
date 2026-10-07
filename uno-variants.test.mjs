import test from 'node:test';
import assert from 'node:assert/strict';
import * as u from './uno-engine.mjs';
import {board,handPanel,management,command,focusHandPage} from './uno-ui.mjs';
import {imageMessage,boardImageMessage,renderBoardImage} from './uno-image.mjs';
import {writeFile} from 'node:fs/promises';
function fixture(hands,top=5,mode='round'){
 const t=u.newTable('1','2','3',mode);t.players=hands.map((cards,i)=>({id:String(i+1),cards:[...cards],score:0}));t.phase='active';t.handNo=1;t.turn='1';t.discard=[top];t.color=u.face(top).color;t.deck=Array.from({length:108},(_,i)=>i).filter(c=>!hands.flat().includes(c)&&c!==top);t.deadline=Date.now()+60000;t.pages={};t.jumpSerial=0;return t;
}
const conserved=t=>{const cards=[...t.deck,...t.discard,...t.players.flatMap(p=>p.cards)];assert.equal(cards.length,108);assert.equal(new Set(cards).size,108);};
test('mixed stacking defaults to +2→+4→+4 and accumulates the complete penalty; cannot downgrade',()=>{
 const t=fixture([[23,1],[104,26],[105,51],[76,48]]);u.play(t,'1',23);assert(u.playable(t,'2',104));u.declareUno(t,'2');u.play(t,'2',104,'green');assert.equal(u.penaltyCount(t),6);assert(!u.playable(t,'3',51));assert(u.playable(t,'3',105));u.play(t,'3',105,'blue');assert.equal(u.penaltyCount(t),10);assert(!u.playable(t,'4',48));assert.throws(()=>u.play(t,'4',48));u.accept(t,'4');assert.equal(t.players[3].cards.length,12);assert.equal(t.turn,'1');assert.equal(t.lastAction.count,10);conserved(t);
});
test('same-type and classic remain available; rule changes enforce owner, stage and match roster',()=>{
 const t=u.newTable('1','2','3');assert.deepEqual(u.rulesOf(t),{stacking:'mixed',jumpIn:true});assert.throws(()=>u.configure(t,'4','stacking','none'));u.configure(t,'1','stacking','same');u.configure(t,'1','jumpIn',false);assert.equal(u.rulesOf(t).stacking,'same');assert.throws(()=>u.configure(t,'1','jumpIn','true'));u.addComputers(t,'1');u.start(t,'1');assert.throws(()=>u.configure(t,'1','stacking','none'));
 const a=fixture([[23,1],[104,48],[51]]);a.rules.stacking='same';u.play(a,'1',23);assert(!u.playable(a,'2',104));assert(u.playable(a,'2',48));a.rules.stacking='none';assert(!u.playable(a,'2',48));
 const old=fixture([[1,3],[26]]);delete old.rules;assert.deepEqual(u.rulesOf(old),{stacking:'none',jumpIn:false});old.phase='settled';u.start(old,'1');assert.deepEqual(u.rulesOf(old),u.DEFAULT_RULES);
});
test('only the latest +4 may be challenged; success transfers total, failure total plus two, snapshots stay private',()=>{
 for(const illegal of [true,false]){const t=fixture([[104,26],[105,illegal?76:51],[1]]);u.play(t,'1',104,'blue');u.play(t,'2',105,'yellow');assert.throws(()=>u.challenge(t,'1'));const result=u.challenge(t,'3');assert.equal(result.success,illegal);assert.deepEqual(result.cards,[105,illegal?76:51]);assert.equal(result.penalty,illegal?8:10);assert.equal(t.players[illegal?1:2].cards.length,illegal?9:11);assert.equal(t.turn,illegal?'3':'1');assert(!JSON.stringify(board(t)).includes(u.cardName(illegal?76:51)));conserved(t);}
});
test('last stacked draw closes relay, accepts cumulative penalty before final individual or team scoring',()=>{
 for(const mode of ['round','teams']){const t=fixture([[23,1],[104],[105,51],[76]],5,mode);u.play(t,'1',23);u.play(t,'2',104,'blue');assert.equal(t.pending.finisher,'2');assert(!u.playable(t,'3',105));const expected=t.players.filter(p=>mode==='teams'?u.teamOf(t,p.id)!==1:p.id!=='2').reduce((sum,p)=>sum+p.cards.reduce((a,c)=>a+u.points(c),0),0)+t.deck.slice(-6).reduce((a,c)=>a+u.points(c),0);u.accept(t,'3');assert.equal(t.phase,'settled');assert.equal(t.winner,'2');assert.equal(t.roundPoints,expected);if(mode==='teams')assert.equal(t.teamScores[1],expected);conserved(t);}
});
test('team mode requires four players, pairs opposite seats and scores only enemy hands',()=>{
 const lobby=u.newTable('1','2','3','teams');assert.throws(()=>u.start(lobby,'1'));u.addComputers(lobby,'1',3);assert.throws(()=>u.join(lobby,'4'));assert.throws(()=>u.addComputers(lobby,'1'));u.start(lobby,'1');assert.equal(u.teamOf(lobby,lobby.players[0].id),u.teamOf(lobby,lobby.players[2].id));assert.notEqual(u.teamOf(lobby,lobby.players[0].id),u.teamOf(lobby,lobby.players[1].id));
 const t=fixture([[1],[26],[104,106],[50]],3,'teams');u.play(t,'1',1);assert.equal(t.winningTeam,0);assert.equal(t.roundPoints,u.points(26)+u.points(50));assert.equal(t.players[2].cards.length,2);assert.equal(t.teamScores[0],t.roundPoints);assert(board(t).embeds[0].fields.some(f=>f.value.includes('红队全队获胜')));conserved(t);
});
test('out-of-turn numeric jump changes next player, auto declares UNO and rejects old key without mutation',()=>{
 const t=fixture([[11,1],[26],[12,76],[51]]);u.play(t,'1',11);assert(u.jumpOpen(t));assert.equal(t.deadline-t.jumpWindow.until,60000);assert.throws(()=>u.draw(t,'2'));assert.deepEqual(u.jumpCards(t,'3'),[12]);assert.deepEqual(u.jumpCards(t,'2'),[]);const key=t.jumpWindow.key;u.jump(t,'3',12,key);assert.equal(t.turn,'4');assert(t.lastPlay.jump);assert.equal(t.lastPlay.from,'2');assert(t.lastPlay.uno);assert.equal(t.unoOpportunity,null);const after=structuredClone(t);assert.throws(()=>u.jump(t,'3',12,key));assert.deepEqual(t,after);conserved(t);
});
test('jump expiry unblocks the normal turn; zero, functional cards and penalties never open windows',()=>{
 const t=fixture([[11,1],[26],[12,76]]);u.play(t,'1',11);const key=t.jumpWindow.key;t.jumpWindow.until=Date.now()-1;const before=structuredClone(t);assert.throws(()=>u.jump(t,'3',12,key));assert.deepEqual(t,before);assert(u.expireJump(t));assert(!t.jumpWindow);assert(!u.expireJump(t));u.draw(t,'2');conserved(t);
 for(const card of [0,19,21,23,100,104]){const a=fixture([[card,1],[26],[51]],5);u.play(a,'1',card,'blue');assert(!a.jumpWindow);assert.deepEqual(u.jumpCards(a,'2'),[]);}
});
test('jump accepts only a matching physical card in own hand; reverse direction and team last-card wins work',()=>{
 const t=fixture([[11,1],[26],[12],[51]],5,'teams');t.direction=-1;u.play(t,'1',11);const before=structuredClone(t),key=t.jumpWindow.key;assert.throws(()=>u.jump(t,'2',12,key));assert.deepEqual(t,before);u.jump(t,'3',12,key);assert.equal(t.phase,'settled');assert.equal(t.winningTeam,0);assert.equal(t.winner,'3');assert(!t.jumpWindow);assert(!t.deadline);conserved(t);
 const a=fixture([[11,1],[26],[12,76],[51]]);a.direction=-1;u.play(a,'1',11);u.jump(a,'3',12,a.jumpWindow.key);assert.equal(a.turn,'2');conserved(a);
});
test('eligible jump is visible outside own turn on any hand page and private team panel never shows teammate cards',async()=>{
 const t=fixture([[11,1],[26],[12,76],[51]],5,'teams');t.messageId='99';u.play(t,'1',11);const data=handPanel(t,'3');assert(data.content.includes('你可以抢出'));assert(data.components.flatMap(r=>r.components).some(c=>c.custom_id.includes('jump~')&&c.label.includes('UNO')));assert(!JSON.stringify(data).includes('红色 1'));assert(data.embeds[0].fields.some(f=>f.name==='🤝 你的队伍'));
 const picture=await imageMessage(t,'3',data);assert(picture.body instanceof FormData);await writeFile(new URL('../uno-jump-hand.png',import.meta.url),Buffer.from(await picture.body.get('files[0]').arrayBuffer()));u.jump(t,'3',12,t.jumpWindow.key);const publicData=board(t);assert(publicData.content.includes('抢出成功'));assert.equal(publicData.embeds[0].color,0xFFD166);assert(publicData.embeds[0].fields[0].value.includes('原轮次被抢走'));const publicImage=await boardImageMessage(t,publicData);assert(publicImage.body instanceof FormData);await writeFile(new URL('../uno-jump-board.png',import.meta.url),Buffer.from(await publicImage.body.get('files[0]').arrayBuffer()));
});
test('jump opportunity and expiry invalidate image cache; only public card and effect enter public pixels',async()=>{
 const t=fixture([[11,1],[26],[12,76]]);u.play(t,'1',11);const data=handPanel(t,'3'),a=await imageMessage(t,'3',data);t.jumpWindow.until=Date.now()-1;u.expireJump(t);const b=await imageMessage(t,'3',handPanel(t,'3'),{id:'1',signature:a.signature});assert.notEqual(a.signature,b.signature);assert(b.body instanceof FormData);
 const regular=await renderBoardImage(11,'red',false),jumped=await renderBoardImage(11,'red',true);assert.notDeepEqual(Buffer.from(await regular.arrayBuffer()),Buffer.from(await jumped.arrayBuffer()));
});
test('focus re-evaluates after the response window while manual page selection remains stable',()=>{
 const t=fixture([[11,1],[...Array.from({length:15},(_,i)=>25+i),100],[12,76]]);u.play(t,'1',11);focusHandPage(t);t.pages['2']=0;t.jumpWindow.until=Date.now()-1;u.expireJump(t);focusHandPage(t);assert.equal(t.pages['2'],1);t.pages['2']=0;focusHandPage(t);assert.equal(t.pages['2'],0);
});
test('command has independent team mode, management stays within limits and emits no 7/0 controls',()=>{
 for(const c of command.options.filter(c=>['创建','测试'].includes(c.name)))assert(c.options.find(o=>o.name==='模式').choices.some(o=>o.value==='teams'));
 for(const mode of ['round','teams','match'])for(const phase of ['lobby','active','settled']){const t=u.newTable('1','2','3',mode);t.phase=phase;const data=management(t,'1',true);assert(data.components.length<=5);assert(!JSON.stringify(data).includes('sevenZero'));for(const row of data.components)assert(row.components.length<=5);}
});
test('200 variant bot rounds including 2v2, mixed relay and jumps conserve 108 cards and settle',()=>{
 for(let round=0;round<200;round++){const mode=round%2?'teams':'round',t=u.newTable('1','2','3',mode);u.addComputers(t,'1',mode==='teams'?3:1+round%9);u.start(t,'1');t.players[0].bot=true;t.players[0].name='电脑';let steps=0;while(t.phase==='active'){assert(++steps<5000);if(u.jumpOpen(t)){if(round%3&&u.computerJump(t)){conserved(t);continue;}t.jumpWindow.until=Date.now()-1;u.expireJump(t);}assert(u.computerTurn(t));conserved(t);}assert.equal(t.players.find(p=>p.id===t.winner).cards.length,0);if(mode==='teams'){assert.equal(t.teamScores[t.winningTeam],t.roundPoints);assert.equal(t.teamScores[1-t.winningTeam],0);}}
});
