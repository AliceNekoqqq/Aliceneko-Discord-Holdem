import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_V15, getCatalog } from './rogue-content-v15.mjs';
import { CATALOG_V14 } from './rogue-content-v14.mjs';
import { CATALOG_V13 } from './rogue-content-v13.mjs';
import { CATALOG_V12, getCatalog as getCatalog12 } from './rogue-content-v12.mjs';
import { beginBattle, battleAction } from './rogue-battle-v15.mjs';
import { createRun, runAction, RULE_VERSION } from './rogue-run-v15.mjs';

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
    const e=CATALOG_V15.enemies[id],index=e.intents.findIndex(i=>i.kind==='charge'),charge=e.intents[index],next=e.intents[(index+1)%e.intents.length];
    assert.deepEqual(charge.chargeBreak,{threshold,reduction});
    assert.equal(charge.next.kind,'attack');assert.equal(charge.next.value,next.value);assert.equal(charge.next.hits??1,next.hits??1);
  }
  assert.equal(CATALOG_V15.version,'0.15');assert.equal(CATALOG_V13.version,'0.13');assert.equal(CATALOG_V12.version,'0.12');
  assert.equal(getCatalog('0.15'),CATALOG_V15);assert.equal(getCatalog12('0.12'),CATALOG_V12);
  assert.equal(RULE_VERSION,'lantern-rules-v0.15');
  const mirror=CATALOG_V15.enemies.mirror_dancer.intents.at(-1);
  assert.equal(mirror.kind,'conditional');assert.equal(mirror.onAttack.kind,'attack');assert.equal(mirror.onOther.kind,'guard');
});

test('v15 battle snapshots identify their rules and initialize phase preview explicitly',()=>{
  const s=beginBattle({enemyId:'dark_lantern',deck:deck(1),relics:[],hp:30,seed:3});
  assert.equal(s.ruleVersion,'lantern-rules-v0.15');
  assert.equal(s.phaseNextIntent,null);
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
  const reduction=CATALOG_V15.enemies.patrol_apprentice.intents.find(i=>i.kind==='charge').chargeBreak.reduction;
  const bonus=next.attackBonus;
  assert.equal(next.intent.value,Math.max(1,7+bonus-reduction));
});

test('the two v14 elites have only the requested intent changes and a private cloned catalog',()=>{
  assert.equal(CATALOG_V15.enemies.cracked_sergeant.intents.find(i=>i.kind==='charge').chargeBreak.threshold,8);
  const s=CATALOG_V15.enemies.cracked_sergeant;
  for(const pool of [s.intents,s.phaseIntents])for(const i of pool.filter(i=>i.kind==='charge')){
    assert.equal(i.armor,-3);assert.equal(i.chargeBreak.reduction,4);
  }
  const c=CATALOG_V15.enemies.chain_duelist;
  assert.deepEqual(c.intents[0].onAttack,{kind:'attack',value:4,hits:3,label:'镜链三连：4×3'});
  assert.equal(c.intents[0].onOther.value,7);
  assert.equal(c.phaseIntents[0].onAttack.value,5);assert.equal(c.phaseIntents[0].onAttack.hits,3);
  assert.equal(c.phaseIntents[0].onOther.value,9);
  assert.notEqual(CATALOG_V15,CATALOG_V13);assert.notEqual(CATALOG_V15.events,CATALOG_V13.events);
  assert.deepEqual(CATALOG_V13.enemies.chain_duelist.intents[0],{kind:'attack',value:4,hits:3,label:'镜链三连：4×3'});
});

test('sergeant charge cancels base armor for its window and break respects actual loss and immediate intent',()=>{
  const s=beginBattle({enemyId:'cracked_sergeant',deck:deck(2),relics:[],hp:30,seed:8});
  assert.equal(s.intent.kind,'guard');
  const charge=battleAction(s,{type:'END_TURN'});
  assert.equal(charge.intent.kind,'charge');assert.equal(charge.enemyArmor,0);
  charge.enemyShield=0;charge.enemyHp=40;charge.hand=[{uid:0,cardId:'slash',upgraded:false},{uid:1,cardId:'slash',upgraded:false}];charge.draw=[];charge.discard=[];
  let broken=battleAction(charge,{type:'PLAY',uid:0});broken=battleAction(broken,{type:'PLAY',uid:1});
  assert.equal(broken.intent.kind,'attack');assert.equal(broken.intent.value,6);assert.equal(broken.chargeBreakPending,null);
  const shielded=beginBattle({enemyId:'cracked_sergeant',deck:deck(1),relics:[],hp:30,seed:8});
  let q=battleAction(shielded,{type:'END_TURN'});q.intent={...CATALOG_V15.enemies.cracked_sergeant.intents[1]};q.turn=2;q.enemyShield=10;q.enemyHp=40;q.hand=[{uid:0,cardId:'slash',upgraded:false}];q.draw=[];q.discard=[];
  const noBreak=battleAction(q,{type:'PLAY',uid:0});assert.equal(noBreak.chargeBreakPending,null);
});

test('a charge break is omitted when phase transition replaces the immediate attack with guard',()=>{
  const s=beginBattle({enemyId:'cracked_sergeant',deck:deck(1),relics:[],hp:30,seed:8});
  s.turn=1;s.intent={...CATALOG_V15.enemies.cracked_sergeant.intents[1],next:{kind:'attack',value:10}};
  s.enemyHp=20;s.enemyMaxHp=44;s.enemyShield=0;s.enemyBurn=8;s.hand=[];s.draw=s.deck.slice();
  const next=battleAction(s,{type:'END_TURN'});
  assert.equal(next.enemyPhase,2);assert.equal(next.intent.kind,'guard');assert.equal(next.chargeBreakPending,null);
  assert.ok(next.log.some(x=>x.includes('阶段切换覆盖破势')));
});

test('phase-crossing active damage and end-of-turn burn keep the next intent truthful',()=>{
  const s=beginBattle({enemyId:'cracked_sergeant',deck:deck(2),relics:[],hp:30,seed:8});
  s.turn=2;s.phaseStartTurn=0;s.enemyPhase=1;s.intent={...CATALOG_V15.enemies.cracked_sergeant.intents[1],next:{kind:'attack',value:10}};
  s.enemyHp=25;s.enemyMaxHp=44;s.enemyShield=0;s.enemyArmor=0;s.hand=deck(2);s.draw=[];s.discard=[];
  let after=battleAction(s,{type:'PLAY',uid:0});
  assert.equal(after.enemyPhase,2);assert.equal(after.intent.kind,'charge');assert.equal(after.intent.next.kind,'guard');
  after=battleAction(after,{type:'PLAY',uid:1});
  assert.equal(after.enemyPhase,2);assert.equal(after.intent.kind,'guard');assert.equal(after.chargeBreakPending,null);
});

test('sergeant charge preview includes difficulty, danger, and debt attack bonuses',()=>{
  const s=beginBattle({enemyId:'cracked_sergeant',deck:deck(2),relics:[],hp:30,seed:8,difficulty:5,dangerous:true,extraAttackBonus:1});
  s.turn=2;s.intent={...CATALOG_V15.enemies.cracked_sergeant.intents[1],next:{kind:'attack',value:10}};
  s.enemyArmor=0;s.enemyShield=0;s.enemyHp=100;s.hand=deck(2);s.draw=[];s.discard=[];
  const bonus=s.attackBonus;
  let broken=battleAction(s,{type:'PLAY',uid:0});broken=battleAction(broken,{type:'PLAY',uid:1});
  assert.equal(broken.intent.kind,'attack');
  assert.equal(broken.intent.value,Math.max(1,10+bonus-4));
});

test('chain duelist locks the requested three-hit or seven/nine damage branch from first card type',()=>{
  for(const [cardId,expected,hits] of [['slash',4,3],['guard',7,1]]){
    const s=beginBattle({enemyId:'chain_duelist',deck:[{uid:0,cardId,upgraded:false},{uid:1,cardId:'slash',upgraded:false}],relics:[],hp:30,seed:3});
    assert.equal(s.intent.kind,'conditional');
    s.enemyShield=0;
    const after=battleAction(s,{type:'PLAY',uid:0});
    assert.equal(after.intent.kind,'conditional');
    // The branch is recorded by the first card and remains in the intent for inspection.
    assert.equal(after.firstCardKind,cardId==='slash'?'attack':'other');
    const resolved=battleAction(after,{type:'END_TURN'});
    assert.equal(resolved.hp,30-Math.max(0,expected*hits-(cardId==='guard'?5:0)));
  }
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

test('chain second phase resolves both advertised branches and later damage cannot change the locked opener',()=>{
  for(const cardId of ['slash','guard']){
    const cards=Array.from({length:8},(_,uid)=>({uid,cardId:uid===0?cardId:'slash',upgraded:false}));
    let s=beginBattle({enemyId:'chain_duelist',deck:cards,relics:[],hp:30,seed:'phase-chain'});
    s.enemyHp=Math.floor(s.enemyMaxHp/2)+1;s.enemyShield=0;
    // Consistent physical piles ensure the triggering card and next-phase opener are available.
    s.hand=cards.slice(1,6);s.draw=[cards[0],...cards.slice(6)];s.discard=[];
    s=battleAction(s,{type:'PLAY',uid:1});s=battleAction(s,{type:'END_TURN'});
    assert.equal(s.enemyPhase,2);assert.equal(s.intent.kind,'conditional');
    assert.equal(s.intent.onAttack.value,5);assert.equal(s.intent.onAttack.hits,3);assert.equal(s.intent.onOther.value,9);
    s.hp=30;s.hand=[cards[0],...cards.slice(2,6)];s.draw=cards.filter(c=>!s.hand.some(h=>h.uid===c.uid));s.discard=[];s.exhaust=[];
    s=battleAction(s,{type:'PLAY',uid:0});s=JSON.parse(JSON.stringify(s));
    s=battleAction(s,{type:'PLAY',uid:s.hand[0].uid});assert.equal(s.firstCardKind,cardId==='slash'?'attack':'other');
    const resolved=battleAction(s,{type:'END_TURN'});
    assert.equal(resolved.hp,cardId==='slash'?15:26);
  }
});

test('v15 freezes v14 and gives all six bosses full, exact charge previews',()=>{
  const bosses=Object.values(CATALOG_V15.enemies).filter(e=>e.role==='Boss');
  assert.equal(bosses.length,6);
  for(const e of bosses) for(const pool of [e.intents,e.phaseIntents].filter(Boolean)) for(let n=0;n<pool.length;n++){
    const i=pool[n];if(i.kind==='charge')assert.deepEqual(i.next,pool[(n+1)%pool.length]);
  }
  const dark=CATALOG_V15.enemies.dark_lantern;
  for(const pool of [dark.intents,dark.phaseIntents])for(const i of pool.filter(i=>i.kind==='charge'))assert.deepEqual(i.chargeBreak,{threshold:8,reduction:4});
  assert.equal(CATALOG_V15.enemies.a3_unlit_bellmaster.intents.some(i=>i.kind==='charge'&&i.chargeBreak),false);
  assert.deepEqual(CATALOG_V15.enemies.a3_unlit_bellmaster.phaseIntents.find(i=>i.kind==='charge').chargeBreak,{threshold:12,reduction:2});
  const regent=CATALOG_V15.enemies.a2_mirror_regent.phaseIntents;
  assert.deepEqual(regent.map(i=>i.kind),['tempo','charge','attack','cleanse']);
  assert.deepEqual(regent[0],{kind:'tempo',playThreshold:2,onCalm:{kind:'guard',value:8,label:'架盾'},onRush:{kind:'attack',value:4,hits:2,label:'攻击'},label:'节奏检验'});
  assert.deepEqual(CATALOG_V14.enemies.a2_mirror_regent.phaseIntents.map(i=>i.kind),['charge','attack','cleanse','conditional']);
  assert.equal(getCatalog('0.15'),CATALOG_V15);
});

test('mirror regent tempo resolves at end turn from zero, two, and three plays and survives JSON',()=>{
  for(const [plays,expected] of [[0,'guard'],[2,'guard'],[3,'attack']]){
    let s=beginBattle({enemyId:'a2_mirror_regent',deck:deck(5),relics:[],hp:30,seed:12});
    s.enemyPhase=2;s.phaseStartTurn=s.turn+1;
    s=battleAction(s,{type:'END_TURN'});assert.equal(s.intent.kind,'tempo');
    if(plays===3){
      for(const card of [...s.hand].slice(0,3))s=battleAction(s,{type:'PLAY',uid:card.uid});
    }else{
      for(const card of [...s.hand].slice(0,plays))s=battleAction(s,{type:'PLAY',uid:card.uid});
      s=battleAction(JSON.parse(JSON.stringify(s)),{type:'END_TURN'});
    }
    if(expected==='guard')assert.equal(s.enemyShield,8);
    else {assert.equal(s.attacksTaken,2);assert.equal(s.hp,22);}
  }
});

test('tempo children receive difficulty, danger, debt, and boss phase attack bonuses',()=>{
  const s=beginBattle({enemyId:'a2_mirror_regent',deck:deck(3),relics:[],hp:28,seed:5,difficulty:10,dangerous:true,extraAttackBonus:1});
  s.enemyPhase=2;s.phaseStartTurn=s.turn+1;s.bossPhaseAttackBonus=2;s.enemyHp=100;s.enemyShield=0;s.hp=28;
  let after=battleAction(s,{type:'END_TURN'});assert.equal(after.intent.kind,'tempo');after.plays=3;
  const bonus=s.attackBonus+s.bossPhaseAttackBonus;
  after=battleAction(after,{type:'END_TURN'});
  assert.equal(after.hp,28-2*(4+bonus));
});

test('phaseNextIntent is a full next-turn clone and clears when that turn starts',()=>{
  const s=beginBattle({enemyId:'dark_lantern',deck:deck(5),relics:[],hp:30,seed:9});
  s.enemyHp=Math.floor(s.enemyMaxHp*s.phaseThreshold)+1;s.enemyShield=0;s.enemyArmor=0;
  const switched=battleAction(s,{type:'PLAY',uid:s.hand[0].uid});
  assert.equal(switched.enemyPhase,2);
  assert.deepEqual(switched.phaseNextIntent,CATALOG_V15.enemies.dark_lantern.phaseIntents[0]);
  assert.notEqual(switched.phaseNextIntent,CATALOG_V15.enemies.dark_lantern.phaseIntents[0]);
  const next=battleAction(JSON.parse(JSON.stringify(switched)),{type:'END_TURN'});
  assert.equal(next.turn,2);assert.equal(next.phaseNextIntent,null);assert.deepEqual(next.intent,CATALOG_V15.enemies.dark_lantern.phaseIntents[0]);
});

test('boss half-phase preview uses the difficulty threshold and JSON preserves its full next intent',()=>{
  const s=beginBattle({enemyId:'dark_lantern',deck:deck(5),relics:[],hp:28,seed:11,difficulty:10});
  assert.equal(s.phaseThreshold,.65);
  s.enemyHp=Math.floor(s.enemyMaxHp*.65)+1;s.enemyShield=0;s.enemyArmor=0;
  const switched=battleAction(s,{type:'PLAY',uid:s.hand[0].uid});
  assert.equal(switched.enemyPhase,2);
  const restored=JSON.parse(JSON.stringify(switched));
  const expected=structuredClone(CATALOG_V15.enemies.dark_lantern.phaseIntents[0]);
  expected.value+=switched.attackBonus+switched.bossPhaseAttackBonus;
  expected.next.value+=switched.attackBonus+switched.bossPhaseAttackBonus;
  assert.deepEqual(restored.phaseNextIntent,expected);
  assert.deepEqual(restored.phaseNextIntent,switched.phaseNextIntent);
});

test('dark lantern break counts actual HP loss from active, echo, and end-turn burn only',()=>{
  const s=beginBattle({enemyId:'dark_lantern',deck:deck(2),relics:[],hp:30,seed:14});
  const charge=CATALOG_V15.enemies.dark_lantern.intents.find(i=>i.kind==='charge');
  s.intent=structuredClone(charge);s.enemyArmor=4;s.enemyShield=4;s.enemyHp=100;s.chargeDamage=0;
  s.hand=deck(2);s.draw=[];s.discard=[];s.energy=3;s.plays=0;
  let after=battleAction(s,{type:'PLAY',uid:0});
  assert.equal(after.chargeDamage,0);assert.equal(after.chargeBreakReady,false);
  after.enemyArmor=0;after.enemyShield=0;after.enemyBurn=8;
  const broken=battleAction(after,{type:'END_TURN'});
  assert.equal(broken.intent.kind,'attack');
  assert.ok(broken.log.some(x=>x.includes('破势')));
  assert.equal(broken.intent.kind,'attack');assert.equal(broken.intent.value,4);
});
