import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_V13, getCatalog } from './rogue-content-v13.mjs';
import { CATALOG_V12, getCatalog as getCatalog12 } from './rogue-content-v12.mjs';
import { beginBattle, battleAction } from './rogue-battle-v13.mjs';
import { createRun, runAction } from './rogue-run-v13.mjs';

const deck = (count=1) => Array.from({length:count},(_,uid)=>({uid,cardId:'slash',upgraded:false}));
function battle(enemyId='patrol_apprentice',{difficulty=0,count=1}={}) {
  const s=beginBattle({enemyId,deck:deck(count),relics:[],hp:30,seed:19,difficulty});
  s.intent=structuredClone(CATALOG_V13.enemies[enemyId].intents.find(i=>i.kind==='charge'));
  s.turn=CATALOG_V13.enemies[enemyId].intents.findIndex(i=>i.kind==='charge')+1;s.chargeDamage=0;s.chargeBreakReady=false;s.chargeBreakPending=null;
  s.enemyHp=Math.max(30,s.enemyHp);s.enemyShield=0;s.enemyBurn=0;
  const selected=s.deck.slice(0,count);
  s.hand=selected;s.draw=[];s.discard=[];s.exhaust=[];s.energy=3;s.plays=0;
  return s;
}
function playAll(s) {
  for(const c of [...s.hand]) s=battleAction(s,{type:'PLAY',uid:c.uid});
  return s;
}

test('v13 charge rules are public, exact, and leave the v12 catalog frozen',()=>{
  const specs=[['patrol_apprentice',6,3],['a2_seam_duelist',8,2],['a3_dust_mender',10,2]];
  for(const [id,threshold,reduction] of specs){
    const e=CATALOG_V13.enemies[id],index=e.intents.findIndex(i=>i.kind==='charge'),charge=e.intents[index],next=e.intents[(index+1)%e.intents.length];
    assert.deepEqual(charge.chargeBreak,{threshold,reduction});
    assert.equal(charge.next.kind,'attack');assert.equal(charge.next.value,next.value);assert.equal(charge.next.hits??1,next.hits??1);
  }
  assert.equal(CATALOG_V13.version,'0.13');assert.equal(CATALOG_V12.version,'0.12');
  assert.equal(getCatalog('0.13'),CATALOG_V13);assert.equal(getCatalog12('0.12'),CATALOG_V12);
  const mirror=CATALOG_V13.enemies.mirror_dancer.intents.at(-1);
  assert.equal(mirror.kind,'conditional');assert.equal(mirror.onAttack.kind,'attack');assert.equal(mirror.onOther.kind,'guard');
});


test('patrol apprentice opens with charge and one base slash breaks its second-turn attack',()=>{
  const s=beginBattle({enemyId:'patrol_apprentice',deck:deck(1),relics:[],hp:30,seed:8});
  assert.equal(s.turn,1);assert.equal(s.intent.kind,'charge');
  const after=battleAction(s,{type:'PLAY',uid:0});
  assert.equal(after.turn,2);assert.equal(after.intent.kind,'attack');assert.equal(after.intent.value,4);
  assert.ok(after.log.some(x=>x.includes('破势')));
});

test('charge break uses actual HP loss, so shield absorbed damage cannot meet threshold',()=>{
  const s=battle();s.enemyShield=2;
  const after=playAll(s);
  assert.equal(after.log.some(x=>x.includes('破势')),false);
  assert.equal(after.chargeBreakPending,null);
  assert.equal(after.intent.kind,'attack');assert.equal(after.intent.value,7);
});

test('exact threshold applies one per-hit reduction to the immediate next attack',()=>{
  const s=battle();
  const after=playAll(s);
  assert.equal(after.intent.kind,'attack');assert.equal(after.intent.value,4);
  assert.equal(after.chargeDamage,0);
  assert.equal(after.chargeBreakPending,null);
  const later=battleAction(after,{type:'END_TURN'});
  assert.equal(later.intent.kind,'guard');assert.equal(later.intent.value,3); // later cycle intent is unaffected
});

test('seam duelist and dust mender use their smaller per-hit metadata reductions',()=>{
  const seam=battle('a2_seam_duelist',{count:2});
  const afterSeam=playAll(seam);
  assert.equal(afterSeam.intent.kind,'attack');assert.equal(afterSeam.intent.value,2);
  const dust=battle('a3_dust_mender',{count:2});
  const afterDust=playAll(dust);
  assert.equal(afterDust.intent.kind,'attack');assert.equal(afterDust.intent.value,2);
});

test('enemy burn actual loss counts toward the threshold at charge resolution',()=>{
  const s=battle();s.hand=[];s.draw=s.deck.slice();s.enemyBurn=6;
  const after=battleAction(s,{type:'END_TURN'});
  assert.equal(after.intent.kind,'attack');assert.equal(after.intent.value,4);
  assert.ok(after.log.some(x=>x.includes('破势')));
});

test('an echo on the charge turn counts, survives JSON restore, and the break is consumed once',()=>{
  const s=battle();
  // Move to the last cycle position; advancing starts the opening charge,
  // and the queued echo resolves before the player's first action.
  s.turn=5;s.intent={kind:'guard',value:0};s.hand=[];s.draw=s.deck.slice();
  s.pendingEchoes=[{definition:{...CATALOG_V13.cards.slash,cardId:'slash',uid:99,upgraded:false},cardId:'slash',upgraded:false}];
  const next=battleAction(s,{type:'END_TURN'});
  assert.equal(next.intent.kind,'charge');assert.equal(next.chargeDamage,6);assert.equal(next.chargeBreakReady,true);
  assert.equal(next.intent.next.value,4);
  const restored=JSON.parse(JSON.stringify(next));
  const resolved=battleAction(restored,{type:'END_TURN'});
  assert.equal(resolved.intent.kind,'attack');assert.equal(resolved.intent.value,4);
  const once=battleAction(resolved,{type:'END_TURN'});
  assert.equal(once.intent.value,3);
});

test('difficulty attack bonuses are reflected in charge.next and in the one-use branch',()=>{
  const s=battle('patrol_apprentice',{difficulty:5});
  const next=playAll(s);
  const reduction=CATALOG_V13.enemies.patrol_apprentice.intents.find(i=>i.kind==='charge').chargeBreak.reduction;
  const bonus=next.attackBonus;
  assert.equal(next.intent.value,Math.max(1,7+bonus-reduction));
});


test('the run service preserves the charge penalty through its JSON action boundary',()=>{
  const run=createRun({runId:'charge-service',owner:'owner',guild:'guild',seed:'service',now:0});
  const s=battle();s.hand=[];s.draw=s.deck.slice();s.chargeDamage=6;
  run.phase='BATTLE';run.room={type:'battle',battleType:'normal',enemyId:'patrol_apprentice',dangerous:false,rewardGranted:false};run.battle=s;
  const next=runAction(run,{type:'END_TURN'},1);
  assert.equal(next.battle.intent.kind,'attack');assert.equal(next.battle.intent.value,4);
  const restored=JSON.parse(JSON.stringify(next));
  const later=runAction(restored,{type:'END_TURN'},2);
  assert.equal(later.battle.intent.kind,'guard');assert.equal(later.battle.intent.value,3);
});
