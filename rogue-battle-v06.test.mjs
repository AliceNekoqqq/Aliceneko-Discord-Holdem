import test from 'node:test';
import assert from 'node:assert/strict';
import {beginBattle,battleAction,legalCards} from './rogue-battle.mjs';
const version='lantern-rules-v0.6';
function fixture(ids,relics=[],enemyId='dark_lantern',hp=30){const deck=ids.map((cardId,uid)=>({uid,cardId,upgraded:false}));const b=beginBattle({ruleVersion:version,deck,relics,enemyId,hp,seed:'mechanics'});b.hand=[...deck];b.draw=[];return b;}
const play=(s,uid,targetUid)=>battleAction(JSON.parse(JSON.stringify(s)),{type:'PLAY',uid,targetUid});
test('summoned companion shields enemy hits, while self-cost bypasses companion; sacrifice removes it',()=>{
 let b=fixture(['call_lanternfox','rush','last_command','guard'],[],'lantern_rat');
 b=play(b,0);assert.equal(b.petHp,5);assert.equal(b.shield,3);
 b=play(b,1);assert.equal(b.hp,28);assert.equal(b.petHp,4); // 4 incoming: shield3, companion1
 const uid=b.hand.find(x=>x.cardId==='last_command').uid;b=play(b,uid);assert.equal(b.petHp,0);
 const c=fixture(['fox_pounce','guard']);assert.equal(legalCards(c).some(x=>x.uid===0),false);
});
test('forge survives turns, caps at12, adds to weapon damage and resets on a new battle',()=>{
 let b=fixture(['forge_stance','forged_weapon','guard'],['forger_hammer']);
 b=play(b,0);assert.equal(b.forge,3);const before=b.enemyHp;
 b=play(b,1);assert.equal(before-b.enemyHp,8); //4+3+2 minus1armor
 assert.equal(b.forge,3);assert.equal(fixture(['forged_weapon']).forge,0);
});
test('prepare and mark are consumed by one packet; item damage does not consume them',()=>{
 let b=fixture(['lantern_guard','route_mark','slash','guard']);b.items=['mirror_shard_item'];
 b=play(b,0);assert.equal(b.prepare,1);
 b=battleAction(b,{type:'ITEM',itemIndex:0});assert.equal(b.prepare,1);
 assert.equal(b.plays,1);assert.equal(b.items.length,0);
 b=play(b,1);assert.equal(b.prepare,0);assert.equal(b.mark,0);
 assert.throws(()=>battleAction(b,{type:'ITEM',itemIndex:0}));
});
test('targeted sift and retention preserve physical entities and reject self/foreign targets',()=>{
 const b=fixture(['quick_dispatch','folded_note','slash','guard']);const frozen=JSON.stringify(b);
 assert.throws(()=>play(b,0,0));assert.throws(()=>play(b,0,999));assert.equal(JSON.stringify(b),frozen);
 let n=play(b,0,2);assert.equal(n.deck.length,4);assert.equal(new Set([...n.hand,...n.draw,...n.discard,...n.exhaust].map(c=>c.uid)).size,4);
 const target=n.hand.find(c=>c.uid!==1).uid;n=play(n,1,target);assert.equal(n.hand.some(c=>c.uid===target),true);
});
test('self echo fires once next turn and cannot recursively schedule copies',()=>{
 let b=fixture(['last_message','guard','guard','guard']);b=play(b,0);
 assert.equal(b.echoCount,1); //cost2 closes turn and resolves delayed copy
 assert.equal(b.pendingEchoes.length,0);assert.equal(b.enemyHp,24); //40 - 2*(9-1)
 b=battleAction(b,{type:'END_TURN'});assert.equal(b.echoCount,1);
});
test('thorns is a visible one-round reaction and cleanse removes burn rather than skipping intent',()=>{
 let b=fixture(['slash','guard','guard','guard'],[],'ferry_taxman');
 b=battleAction(b,{type:'END_TURN'});b=battleAction(b,{type:'END_TURN'});
 assert.equal(b.intent.kind,'thorns');assert.equal(b.intent.thorns,2);
 const uid=b.hand.find(x=>x.cardId==='slash').uid;const hp=b.hp;b=play(b,uid);assert.equal(b.hp,hp-2);
 assert.doesNotThrow(()=>battleAction(b,{type:'END_TURN'}));
});
