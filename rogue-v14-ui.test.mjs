import test from 'node:test';
import assert from 'node:assert/strict';
import {beginBattle,battleAction} from './rogue-battle-v14.mjs';
import {createRun,runAction} from './rogue-run-v14.mjs';
import {renderRogue} from './rogue-ui.mjs';
import {describeRogueImage,renderRogueImage} from './rogue-image.mjs';
import {enemyApproach,enemyImageCue} from './rogue-enemy-guide.mjs';
import {CATALOG_V14 as C} from './rogue-content-v14.mjs';
const deck=Array.from({length:8},(_,uid)=>({uid,cardId:'slash',upgraded:false}));
const view=battle=>({runId:'elite-ui',owner:'1',guild:'1',ruleVersion:'lantern-rules-v0.14',catalogVersion:'0.14',professionId:'traveler',phase:'BATTLE',act:2,slot:1,completed:5,hp:30,embers:20,version:0,deck,inventory:[],relics:[],battle,room:{type:'battle'},story:{debtBattles:0,campPenalty:0,weakenedBossActs:[],history:[]}});
test('elite armor window and true break progress appear in both text and image, without mutating the snapshot',async()=>{
 let b=beginBattle({enemyId:'cracked_sergeant',deck,relics:[],hp:30,seed:'elite-ui'});
 b=battleAction(b,{type:'END_TURN'});
 assert.equal(b.intent.kind,'charge');assert.equal(b.enemyArmor,0);
 const r=view(b),before=JSON.stringify(r),text=JSON.stringify(renderRogue(r).data);
 assert.match(text,/本轮护甲0/);assert.match(text,/破势 0\/8/);assert.match(text,/每段-4/);
 assert.match(describeRogueImage(r,'battle').hints[0],/护甲0.*破势 0\/8/);
 const png=await renderRogueImage(r);assert.ok(png.size>1000);assert.equal(JSON.stringify(r),before);
 assert.match(enemyApproach(C.enemies.cracked_sergeant),/蓄力时护甲降低/);
 assert.doesNotMatch(enemyApproach(C.enemies.cracked_sergeant),/常驻护甲/);
});
test('crossing half HP updates the charge forecast to guard and removes the promised break reduction',()=>{
 let b=beginBattle({enemyId:'cracked_sergeant',deck,relics:[],hp:30,seed:'elite-ui'});
 b=battleAction(b,{type:'END_TURN'});b.enemyShield=0;b.enemyHp=Math.floor(b.enemyMaxHp/2)+2;
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});
 assert.equal(b.enemyPhase,2);assert.equal(b.intent.next.kind,'guard');
 const text=JSON.stringify(renderRogue(view(b)).data);
 assert.match(text,/下轮架盾/);assert.match(text,/换阶段覆盖重击/);assert.match(text,/不顺延/);
 assert.doesNotMatch(text,/下轮重击每段-4/);
 assert.match(describeRogueImage(view(b),'battle').hints[0],/换阶段覆盖重击/);
});
test('chain branch preview and locked response stay visible after the defensive opener',()=>{
 const mixed=deck.map((e,i)=>({...e,cardId:i===0?'guard':'slash'}));
 let b=beginBattle({enemyId:'chain_duelist',deck:mixed,relics:[],hp:30,seed:'elite-ui'});
 const text=JSON.stringify(renderRogue(view(b)).data);
 assert.match(text,/首张含直伤.*4×3/);assert.match(text,/首张不含直伤.*7×1/);
 const guard=b.deck.find(e=>e.cardId==='guard');b.hand=[guard,...b.deck.filter(e=>e.uid!==guard.uid).slice(0,4)];b.draw=b.deck.filter(e=>!b.hand.some(h=>h.uid===e.uid));b.discard=[];b.exhaust=[];
 b=battleAction(b,{type:'PLAY',uid:guard.uid});
 assert.match(JSON.stringify(renderRogue(view(b)).data),/分支已锁定.*不含直伤/);
 assert.match(enemyImageCue(b),/已锁定.*不含直伤/);
 b=battleAction(b,{type:'PLAY',uid:b.hand[0].uid});assert.equal(b.firstCardKind,'other');
});
test('v14 retains connected route marks, resource supply and five-card hand UI',()=>{
 let r=createRun({runId:'elite-route',owner:'1',guild:'1',seed:'elite-route',professionId:'traveler',now:0});
 r=runAction(r,{type:'BLESSING',relicId:null},1);
 const text=JSON.stringify(renderRogue(r).data);assert.match(text,/①/);
 const model=describeRogueImage(r,'map');assert.equal(model.acts[0].connected,true);assert.equal(model.acts[0].edges.length,24);
});
