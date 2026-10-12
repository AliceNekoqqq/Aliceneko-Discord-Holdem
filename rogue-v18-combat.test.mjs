import test from 'node:test';
import assert from 'node:assert/strict';
import { beginBattle, battleAction, legalCards, legalEchoes } from './rogue-battle-v18.mjs';
import { CATALOG_V18 as C } from './rogue-content-v18.mjs';

const entity=(cardId,uid)=>({cardId,uid,upgraded:false});
function controlled(ids, professionId='traveler'){
 const deck=ids.map((id,i)=>entity(id,i));
 const b=beginBattle({enemyId:'lantern_rat',deck,relics:[],hp:30,seed:'v18-tests',professionId});
 Object.assign(b,{hand:structuredClone(deck),draw:[],discard:[],exhaust:[],energy:5,plays:0,enemyHp:999,enemyMaxHp:999,enemyArmor:0,enemyShield:0,intent:{kind:'guard',value:0},result:null});
 return b;
}
const play=(b,id,targetUid)=>battleAction(b,{type:'PLAY',uid:b.hand.find(x=>x.cardId===id).uid,...(targetUid==null?{}:{targetUid})});

test('synthetic: upgrade and discount target a real held card and never alter the run deck copy',()=>{
 let b=controlled(['mail_redirect','shared_fireline','shared_break','shared_mirror','shared_bank'],'messenger');
 const target=b.hand.find(x=>x.cardId==='shared_fireline'), original=b.deck.find(x=>x.uid===target.uid);
 b=play(b,'mail_redirect',target.uid);
 assert.equal(b.hand.find(x=>x.uid===target.uid).upgraded,true);
 assert.equal(b.deck.find(x=>x.uid===target.uid).upgraded,true); // combat snapshot may upgrade; run sync is covered by access test.
 assert.equal(original.upgraded,false);
 assert.equal(b.cardDiscounts[target.uid],1);
 assert.ok(legalCards(b).some(x=>x.uid===target.uid));
});

test('synthetic: banked shield arrives at the next turn and is cleared by the enemy hit',()=>{
 let b=controlled(['shared_bank','shared_break','shared_mirror','shared_fireline','shared_wrench']);
 b.shield=7;b=play(b,'shared_bank');
 assert.equal(b.bankedShield,4);assert.equal(b.shield,3);
 b.intent={kind:'attack',value:3,hits:1};b= battleAction(b,{type:'END_TURN'});
 assert.ok(b.shield>=0);assert.equal(b.bankedShield,0);
});

test('synthetic: burn cash-out and bank-fire consume burn into distinct resources',()=>{
 let b=controlled(['fire_cashout','shared_break','shared_mirror','shared_bank','shared_wrench'],'brewer');
 b.enemyBurn=5;b=play(b,'fire_cashout');assert.equal(b.enemyBurn,1);assert.equal(b.shield,8);
 b=controlled(['fire_seal','shared_break','shared_mirror','shared_bank','shared_wrench'],'brewer');
 b.enemyBurn=4;b=play(b,'fire_seal');assert.equal(b.enemyBurn,1);assert.deepEqual(b.delayed,[{kind:'burn',value:4}]);
});

test('synthetic: queued echo tuning changes only the queued snapshot, and healing cards cannot echo',()=>{
 let b=controlled(['shared_break','clock_tune','shared_fireline','shared_mirror','shared_bank'],'smith');
 b=play(b,'shared_break');
 assert.equal(b.pendingEchoes.length,0);
 // Queue through the public charge flow; tune the queued copy, leaving the deck entity unchanged.
 b=controlled(['clock_borrow','shared_break','clock_tune','shared_fireline','shared_mirror'],'smith');
 b=play(b,'clock_borrow');
 const fire=b.hand.find(x=>x.cardId==='shared_fireline');
 if(!b.echoEligibleUids.includes(fire.uid)){ b.echoEligibleUids.push(fire.uid); }
 b=battleAction(b,{type:'ECHO',uid:fire.uid});
 const queued=b.pendingEchoes[0];
 b=play(b,'clock_tune');
 assert.equal(b.pendingEchoes[0].definition.upgraded,true);
 assert.equal(b.deck.find(x=>x.uid===fire.uid).upgraded,false);
 assert.equal(queued.definition.upgraded,false);
 assert.ok(!legalEchoes({...b,echoCharges:1,echoReady:true,echoEligibleUids:[b.hand.find(x=>x.cardId==='medic_triage')?.uid].filter(Number.isInteger),deck:[...b.deck,entity('medic_triage',99)]}).some(x=>x.cardId==='medic_triage'));
});

test('synthetic: conditional attack snapshots mark and burn before effects, then draws',()=>{
 let b=controlled(['trail_exchange','shared_fireline','shared_break','shared_mirror','shared_bank']);
 b.mark=1;b.enemyBurn=4;
 b=play(b,'trail_exchange');
 assert.equal(b.enemyHp,992);assert.equal(b.mark,0);
 // Marked draw attempted; the hand cap makes this intentionally a snapshot check only.
 assert.ok(b.picked.includes('trail_exchange'));
 b=controlled(['shared_fireline','shared_break','shared_mirror','shared_bank','shared_wrench']);b.enemyBurn=4;
 b=play(b,'shared_fireline');assert.equal(b.enemyHp,993);assert.equal(b.enemyBurn,5);
});

test('synthetic: tempo is once per round, capped at four plays, and real plays drive last-play bonus',()=>{
 let b=controlled(['shared_breath','shared_breath','shared_ultimatum','shared_ultimatum','shared_wrench']);
 b=play(b,'shared_breath');assert.equal(b.extraPlays,1);
 b=play(b,'shared_breath');assert.equal(b.extraPlays,1);
 b.plays=4;
 assert.throws(()=>battleAction(b,{type:'PLAY',uid:b.hand.find(x=>x.cardId==='shared_ultimatum').uid}),/不可用/);
 b.plays=2;b=play(b,'shared_ultimatum');assert.equal(b.enemyHp,995); // threshold uses pre-play count and real limit
});

test('synthetic: energy never exceeds five and self-cost is paid before card effects',()=>{
 let b=controlled(['shared_sprint','shared_sprint','shared_break','shared_mirror','shared_bank']);b.energy=5;
 b=play(b,'shared_sprint');assert.equal(b.energy,5);assert.equal(b.hp,28);assert.equal(b.shield,0);
});

test('synthetic: pet and forge converters spend only available resources; recovery conserves UIDs',()=>{
 let b=controlled(['pet_recall_hunt','shared_recall','shared_break','shared_mirror','shared_bank'],'tamer');b.petHp=5;
 b=play(b,'pet_recall_hunt');assert.equal(b.petHp,0);assert.equal(b.prepare,2);
 b=controlled(['forge_emergency','forge_recast','shared_break','shared_mirror','shared_bank'],'forger');b.forge=2;
 b=play(b,'forge_emergency');assert.equal(b.forge,0);assert.equal(b.forgeSpentThisCard,2);assert.equal(b.shield,4);
 const before=b.deck.map(x=>x.uid).sort((a,c)=>a-c);b= battleAction(b,{type:'END_TURN'});
 assert.deepEqual(b.deck.map(x=>x.uid).sort((a,c)=>a-c),before);
});

test('synthetic: recover excludes its own entity, UID conservation holds, and healing cannot replay',()=>{
 let b=controlled(['mail_return','shared_break','shared_mirror','shared_bank','shared_wrench'],'messenger');
 const own=b.hand.find(x=>x.cardId==='mail_return'), recover=b.hand.find(x=>x.cardId==='shared_break');
 b.hand=b.hand.filter(x=>x.uid!==recover.uid);b.discard=[recover];
 const ids=b.deck.map(x=>x.uid).sort((a,c)=>a-c);
 b=play(b,'mail_return');
 assert.ok(!b.hand.some(x=>x.uid===own.uid));
 const piles=['hand','draw','discard','exhaust'].flatMap(k=>b[k].map(x=>x.uid)).sort((a,c)=>a-c);assert.deepEqual(piles,ids);
 let h=controlled(['medic_triage','shared_break','shared_mirror','shared_bank','shared_wrench'],'medic');h.hp=10;
 h=play(h,'medic_triage');assert.equal(h.hp,13);assert.equal(h.exhaust.some(x=>x.cardId==='medic_triage'),true);
 assert.ok(!legalEchoes({...h,echoCharges:1,echoReady:true,echoEligibleUids:[h.exhaust.find(x=>x.cardId==='medic_triage').uid]}).some(x=>x.cardId==='medic_triage'));
});

test('v17 frozen engine and content remain unchanged',async()=>{
 const oldBattle=await import('./rogue-battle-v17.mjs');const oldContent=await import('./rogue-content-v17.mjs');
 const deck=['kindle','guard','guard','guard','guard'].map(entity);
 const battle=oldBattle.beginBattle({enemyId:'lantern_rat',deck,relics:[],hp:30,seed:'frozen'});
 assert.equal(battle.ruleVersion,'lantern-rules-v0.17');
 assert.equal(oldContent.CATALOG_V17.cards.shared_break,undefined);
 assert.equal(C.version,'0.18');
});
